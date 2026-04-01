/**
 * Pipeline dispatcher: runs the full mask-first vectorization pipeline.
 *
 * Steps:
 * 0. Upscale image if smaller than MIN_DIMENSION
 * 1. Generate mask from image (alpha / solid-color / none)
 * 2. Clean mask (morph open, speck removal, hole fill, morph close, smooth)
 * 3. Apply mask to image (bg → transparent)
 * 4. Trace masked image (Potrace)
 * 5. Post-process SVG (strip bg rect, fix viewBox to original size)
 */

import type { MaskConfig, CleanupConfig, TraceConfig } from '../types/pipeline';
import { maskFromAlpha, hasTransparency } from './background-removal/alpha-channel';
import { maskFromSolidColor, detectBackgroundColor } from './background-removal/solid-color';
import { cleanupMask } from './mask-cleanup/pipeline';
import { applyMaskToRgba, maskToRgba, compositeOnWhite } from './image-utils';
import { PotraceTracer, initPotrace } from './tracing/potrace-tracer';
import { stripBackgroundRect } from './tracing/svg-builder';

/** Minimum dimension for tracing. Keep moderate to avoid WASM memory issues. */
const MIN_DIMENSION = 1024;

export interface DispatcherCallbacks {
  onProgress(stage: string, percent: number): void;
}

export async function initEngines(): Promise<void> {
  await initPotrace();
}

/**
 * Bilinear resize of RGBA image data using premultiplied-alpha blending.
 */
export function upscaleRgba(
  src: Uint8ClampedArray, srcW: number, srcH: number,
  dstW: number, dstH: number,
): Uint8ClampedArray {
  const dst = new Uint8ClampedArray(dstW * dstH * 4);
  const xRatio = srcW / dstW;
  const yRatio = srcH / dstH;

  for (let dy = 0; dy < dstH; dy++) {
    const srcY = dy * yRatio;
    const y0 = Math.floor(srcY);
    const y1 = Math.min(y0 + 1, srcH - 1);
    const yFrac = srcY - y0;

    for (let dx = 0; dx < dstW; dx++) {
      const srcX = dx * xRatio;
      const x0 = Math.floor(srcX);
      const x1 = Math.min(x0 + 1, srcW - 1);
      const xFrac = srcX - x0;

      const dstOff = (dy * dstW + dx) * 4;

      const w00 = (1 - xFrac) * (1 - yFrac);
      const w10 = xFrac * (1 - yFrac);
      const w01 = (1 - xFrac) * yFrac;
      const w11 = xFrac * yFrac;

      const off00 = (y0 * srcW + x0) * 4;
      const off10 = (y0 * srcW + x1) * 4;
      const off01 = (y1 * srcW + x0) * 4;
      const off11 = (y1 * srcW + x1) * 4;

      const a00 = src[off00 + 3];
      const a10 = src[off10 + 3];
      const a01 = src[off01 + 3];
      const a11 = src[off11 + 3];

      const alpha = w00 * a00 + w10 * a10 + w01 * a01 + w11 * a11;
      dst[dstOff + 3] = Math.round(alpha);

      if (alpha < 0.5) {
        dst[dstOff] = dst[dstOff + 1] = dst[dstOff + 2] = 0;
        continue;
      }

      for (let c = 0; c < 3; c++) {
        const premulSum =
          w00 * src[off00 + c] * a00 +
          w10 * src[off10 + c] * a10 +
          w01 * src[off01 + c] * a01 +
          w11 * src[off11 + c] * a11;
        dst[dstOff + c] = Math.round(premulSum / alpha);
      }
    }
  }

  return dst;
}

/**
 * Fix SVG so it displays at original size but paths remain correct.
 */
function fixSvgDimensions(svg: string, origW: number, origH: number, upW: number, upH: number): string {
  if (!svg.includes('viewBox')) {
    svg = svg.replace(/<svg/, `<svg viewBox="0 0 ${upW} ${upH}"`);
  }
  svg = svg.replace(/(<svg[^>]*)\bwidth="[^"]*"/, `$1width="${origW}"`);
  svg = svg.replace(/(<svg[^>]*)\bheight="[^"]*"/, `$1height="${origH}"`);
  return svg;
}

export async function runPipeline(
  rgba: Uint8ClampedArray,
  w: number,
  h: number,
  maskConfig: MaskConfig,
  cleanupConfig: CleanupConfig,
  traceConfig: TraceConfig,
  callbacks: DispatcherCallbacks,
): Promise<string> {
  const origW = w;
  const origH = h;

  // ── Step 0: Upscale if needed ─────────────────────────────────
  const maxDim = Math.max(w, h);

  if (maxDim < MIN_DIMENSION) {
    callbacks.onProgress('Upscaling image', 2);
    const scale = MIN_DIMENSION / maxDim;
    const newW = Math.round(w * scale);
    const newH = Math.round(h * scale);
    rgba = upscaleRgba(rgba, w, h, newW, newH);
    w = newW;
    h = newH;
  }

  // ── Step 1: Generate mask ───────────────────────────────────────
  callbacks.onProgress('Generating mask', 5);
  let rawMask: Uint8Array;

  const borderOnly = maskConfig.borderOnly !== false;

  switch (maskConfig.mode) {
    case 'alpha':
      rawMask = maskFromAlpha(rgba, w, h, maskConfig.alphaThreshold);
      if (!hasTransparency(rgba)) {
        const bgColor = detectBackgroundColor(rgba, w, h);
        rawMask = maskFromSolidColor(rgba, w, h, bgColor, maskConfig.colorTolerance ?? 20, borderOnly);
      }
      break;

    case 'solid-color': {
      const target = maskConfig.colorTarget ?? detectBackgroundColor(rgba, w, h);
      rawMask = maskFromSolidColor(rgba, w, h, target, maskConfig.colorTolerance ?? 20, borderOnly);
      break;
    }

    case 'none':
      rawMask = new Uint8Array(w * h).fill(255);
      break;

    default:
      throw new Error(`Unknown mask mode: ${maskConfig.mode}`);
  }

  let maskedRgba: Uint8ClampedArray;

  if (maskConfig.mode === 'none') {
    callbacks.onProgress('Skipping mask (none)', 55);
    maskedRgba = rgba;
  } else {
    // ── Step 2: Clean mask ──────────────────────────────────────────
    callbacks.onProgress('Cleaning mask', 20);
    const cleanedMask = cleanupMask(rawMask, w, h, cleanupConfig, (stage, pct) => {
      callbacks.onProgress(`Cleaning: ${stage}`, 20 + pct * 0.3);
    });

    // ── Step 3: Apply mask ──────────────────────────────────────────
    callbacks.onProgress('Applying mask', 55);
    maskedRgba = applyMaskToRgba(rgba, cleanedMask, w, h);
  }

  // ── Step 3d: B&W brightness shift (Line Art threshold slider) ────
  if (traceConfig.mode === 'outline' && traceConfig.bwThreshold !== undefined && traceConfig.bwThreshold !== 128) {
    const shift = 128 - traceConfig.bwThreshold;
    for (let i = 0; i < maskedRgba.length; i += 4) {
      if (maskedRgba[i + 3] > 0) {
        maskedRgba[i] = Math.max(0, Math.min(255, maskedRgba[i] + shift));
        maskedRgba[i + 1] = Math.max(0, Math.min(255, maskedRgba[i + 1] + shift));
        maskedRgba[i + 2] = Math.max(0, Math.min(255, maskedRgba[i + 2] + shift));
      }
    }
  }

  // ── Step 4: Trace ───────────────────────────────────────────────
  callbacks.onProgress('Tracing', 60);

  const imageHasTransparency = hasTransparency(maskedRgba);

  const effectiveTraceConfig = (maskConfig.mode === 'none' && !imageHasTransparency)
    ? { ...traceConfig, skipBackground: true }
    : traceConfig;

  const image = { data: maskedRgba, width: w, height: h };
  let svg: string;

  svg = await new PotraceTracer().trace(image, effectiveTraceConfig);

  // ── Step 5: Post-process SVG ────────────────────────────────────
  callbacks.onProgress('Finalizing SVG', 95);

  if (imageHasTransparency) {
    svg = stripBackgroundRect(svg);
  }

  svg = fixSvgDimensions(svg, origW, origH, w, h);

  callbacks.onProgress('Done', 100);
  return svg;
}
