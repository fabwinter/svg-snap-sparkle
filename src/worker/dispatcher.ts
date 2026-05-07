/**
 * Pipeline dispatcher: runs the full mask-first vectorization pipeline.
 *
 * Steps:
 * 0. Upscale image if smaller than MIN_DIMENSION
 * 1. Generate mask from image (alpha / solid-color / none)
 * 2. Clean mask (morph open, speck removal, hole fill, morph close, smooth)
 * 3. Apply mask to image (bg → transparent)
 * 3e. Suppress edge fringe: two-pass desaturate + neighbor-snap (alpha<230)
 * 3f. Kill boundary chroma: desaturate light greenish pixels at mask edge
 *     (catches fully-opaque JPEG compression artifacts that survive 3e)
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

/** Minimum dimension for tracing. */
const MIN_DIMENSION = 512;

/** Maximum trace size. esm-potrace-wasm passes RGBA through WASM stackAlloc;
 *  mobile Safari throws "Offset should not be negative" when that array is too large. */
const MAX_TRACE_DIMENSION = 1600;
const MAX_TRACE_PIXELS = 1_100_000;

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

/**
 * Suppress color fringing on anti-aliased mask edges.
 *
 * Two-pass approach:
 *
 * Pass 1 — Desaturate: any pixel with alpha 1–229 has its RGB replaced by
 * its luminance-weighted grayscale. This converts pale-green / pale-teal
 * edge composites to neutral gray so Potrace doesn't pick them up as a
 * separate color cluster. Threshold raised from 200 → 230 to catch the
 * near-opaque fringe pixels that the previous version missed.
 *
 * Pass 2 — Neighbor snap: for any remaining semi-transparent pixel (1–229)
 * whose chroma is still above a small threshold (can happen when the pixel
 * is strongly saturated), find the nearest fully-opaque 4-connected neighbor
 * and copy its luminance. This eliminates single-pixel-wide green halos that
 * survive pass 1.
 *
 * Fully-opaque pixels (alpha ≥ 230) are untouched so interior colors
 * (logo greens, blacks, whites) are preserved exactly.
 */
export function suppressEdgeFringe(rgba: Uint8ClampedArray, w: number, h: number): void {
  // Pass 1: desaturate all semi-transparent pixels
  for (let i = 0; i < rgba.length; i += 4) {
    const a = rgba[i + 3];
    if (a > 0 && a < 230) {
      const gray = Math.round(
        0.299 * rgba[i] + 0.587 * rgba[i + 1] + 0.114 * rgba[i + 2],
      );
      rgba[i]     = gray;
      rgba[i + 1] = gray;
      rgba[i + 2] = gray;
    }
  }

  // Pass 2: neighbor-snap any semi-transparent pixel that still has chroma
  const CHROMA_RESIDUAL = 4;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4;
      const a = rgba[i + 3];
      if (a === 0 || a >= 230) continue;

      const chroma = Math.max(rgba[i], rgba[i + 1], rgba[i + 2])
        - Math.min(rgba[i], rgba[i + 1], rgba[i + 2]);
      if (chroma <= CHROMA_RESIDUAL) continue;

      const neighbors = [
        y > 0     ? ((y - 1) * w + x) * 4 : -1,
        y < h - 1 ? ((y + 1) * w + x) * 4 : -1,
        x > 0     ? (y * w + x - 1) * 4   : -1,
        x < w - 1 ? (y * w + x + 1) * 4   : -1,
      ];
      for (const ni of neighbors) {
        if (ni < 0 || rgba[ni + 3] < 230) continue;
        const gray = Math.round(
          0.299 * rgba[ni] + 0.587 * rgba[ni + 1] + 0.114 * rgba[ni + 2],
        );
        rgba[i]     = gray;
        rgba[i + 1] = gray;
        rgba[i + 2] = gray;
        break;
      }
    }
  }
}

/**
 * Kill chroma on light, green-dominant pixels at the mask boundary.
 *
 * JPEG compression leaves fully-opaque (alpha=255) greenish pixels just
 * inside the mask edge. These are never caught by suppressEdgeFringe
 * (which only acts on alpha<230) but they are pale enough that Potrace
 * traces them as a distinct light region — producing a green halo even
 * when the rest of the pipeline is clean.
 *
 * Strategy: a "boundary pixel" is any fully-opaque pixel that has at
 * least one fully-transparent 4-connected neighbor. For each boundary
 * pixel we check:
 *   1. Luminance > 140: the pixel is light (fringe is always a pale wash,
 *      not a deep saturated green which would be real logo content)
 *   2. Green channel leads red and blue by > 8: indicates a greenish cast
 * If both conditions are met, the pixel is desaturated to grayscale.
 *
 * We run multiple erosion passes (default 3) so the chroma-kill extends
 * inward enough to cover thick JPEG artifact bands.
 */
export function killBoundaryChroma(
  rgba: Uint8ClampedArray,
  w: number,
  h: number,
  passes: number = 3,
): void {
  // Build a boolean map: true = fully transparent
  const transparent = new Uint8Array(w * h);
  for (let i = 0; i < w * h; i++) {
    if (rgba[i * 4 + 3] === 0) transparent[i] = 1;
  }

  // current "boundary" = opaque pixels adjacent to transparent ones
  // We erode this boundary inward for `passes` iterations
  let boundary = new Uint8Array(w * h);

  for (let pass = 0; pass < passes; pass++) {
    // Build boundary from current transparent map
    boundary.fill(0);
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const idx = y * w + x;
        if (transparent[idx]) continue; // skip transparent pixels
        // Is any 4-connected neighbor transparent?
        const hasTransparentNeighbor =
          (y > 0     && transparent[(y - 1) * w + x]) ||
          (y < h - 1 && transparent[(y + 1) * w + x]) ||
          (x > 0     && transparent[y * w + x - 1])   ||
          (x < w - 1 && transparent[y * w + x + 1]);
        if (hasTransparentNeighbor) boundary[idx] = 1;
      }
    }

    // Desaturate light greenish boundary pixels and mark them transparent
    // for the next pass so we erode further inward
    for (let i = 0; i < w * h; i++) {
      if (!boundary[i]) continue;
      const off = i * 4;
      const r = rgba[off], g = rgba[off + 1], b = rgba[off + 2];
      const luma = 0.299 * r + 0.587 * g + 0.114 * b;
      const greenLead = g - Math.max(r, b);
      if (luma > 140 && greenLead > 8) {
        const gray = Math.round(luma);
        rgba[off]     = gray;
        rgba[off + 1] = gray;
        rgba[off + 2] = gray;
        // Mark as "transparent" for next pass so erosion continues inward
        transparent[i] = 1;
      }
    }
  }
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

  // ── Step 0: Scale image as large as possible before masking/tracing ──
  const maxDim = Math.max(w, h);
  const scale = Math.min(
    MAX_TRACE_DIMENSION / maxDim,
    Math.sqrt(MAX_TRACE_PIXELS / (w * h)),
  );

  if (Math.abs(scale - 1) > 0.01) {
    callbacks.onProgress(scale > 1 ? 'Upscaling image' : 'Downscaling for trace', 3);
    const newW = Math.max(1, Math.round(w * scale));
    const newH = Math.max(1, Math.round(h * scale));
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

    // ── Step 3e: Suppress edge fringe (semi-transparent pixels) ──────
    // Desaturates + neighbor-snaps pixels with alpha 1–229.
    suppressEdgeFringe(maskedRgba, w, h);

    // ── Step 3f: Kill boundary chroma (JPEG compression artifacts) ───
    // JPEG leaves fully-opaque greenish pixels just inside the mask
    // boundary. Erodes inward 3 passes, desaturating light green-dominant
    // boundary pixels that the alpha-based pass above cannot reach.
    killBoundaryChroma(maskedRgba, w, h, 3);
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
