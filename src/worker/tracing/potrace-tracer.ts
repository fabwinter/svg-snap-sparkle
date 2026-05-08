/**
 * Potrace WASM — bitmap tracing (outline + color).
 *
 * Outline mode: composites onto white, applies hard luminance threshold to
 *               remove anti-alias ramp, then traces dark outlines → single-color SVG.
 * Color mode:   quantizes image into color layers, traces each layer separately.
 *
 * Color layering strategy:
 *   1. ABUTTING EXCLUSIVE MASKS — each pixel is assigned to exactly one
 *      colour layer (darkest layer wins).
 *   1.5 BOUNDARY EROSION — JPEG fringe pixels at the border between a
 *      lighter layer and the darkest layer are given to the darkest layer.
 *      This collapses the 2-3px opaque fringe band into the black outline.
 *   2. UNIFORM 1PX DILATION — every exclusive mask is expanded by exactly
 *      1px to restore smooth edges stripped by abutting.
 */

import type { TraceConfig } from '../../types/pipeline';
import type { ITracer } from './tracer';
import type { WorkerImageData } from '../image-utils';
import { compositeOnWhite } from '../image-utils';
import { extractColorLayers } from './color-quantize';
import { extractSvgPaths } from './svg-builder';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let potraceModule: any = null;

export async function initPotrace(): Promise<void> {
  if (potraceModule) return;
  potraceModule = await import('esm-potrace-wasm');
  await potraceModule.init();
}

function makeFakeImageData(pixels: Uint8ClampedArray, w: number, h: number) {
  const copy = new Uint8ClampedArray(w * h * 4);
  copy.set(pixels);
  return { data: copy, width: w, height: h };
}

/** Trace a single binary mask (255=foreground) with Potrace. Returns raw SVG. */
async function traceMask(
  mask: Uint8Array,
  w: number,
  h: number,
  config: TraceConfig,
): Promise<string> {
  const mod = potraceModule;

  let hasForeground = false;
  for (let i = 0; i < mask.length; i++) {
    if (mask[i] === 255) { hasForeground = true; break; }
  }
  if (!hasForeground) return '';

  const pixels = new Uint8ClampedArray(w * h * 4);
  for (let i = 0; i < w * h; i++) {
    const off = i * 4;
    const val = mask[i] === 255 ? 0 : 255;
    pixels[off] = val;
    pixels[off + 1] = val;
    pixels[off + 2] = val;
    pixels[off + 3] = 255;
  }

  const imageData = makeFakeImageData(pixels, w, h);

  const svg: string = await mod.potrace(imageData, {
    turdsize: config.turdSize ?? 2,
    alphamax: config.alphaMax ?? 1.0,
    opttolerance: config.optTolerance ?? 0.1,
    extractcolors: false,
    posterizelevel: 2,
    pathonly: false,
  });

  return svg;
}

/**
 * Dilate a binary mask by 1px (4-connected).
 * Only sets pixels that are currently 0 — never overwrites existing foreground.
 */
function dilateMask(mask: Uint8Array, w: number, h: number): Uint8Array {
  const out = new Uint8Array(mask);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (mask[y * w + x] !== 255) continue;
      if (x > 0     && !out[y * w + x - 1])     out[y * w + x - 1] = 255;
      if (x < w - 1 && !out[y * w + x + 1])     out[y * w + x + 1] = 255;
      if (y > 0     && !out[(y - 1) * w + x])   out[(y - 1) * w + x] = 255;
      if (y < h - 1 && !out[(y + 1) * w + x])   out[(y + 1) * w + x] = 255;
    }
  }
  return out;
}

/**
 * Erode fringe pixels from lighter masks into the darkest mask.
 *
 * Any pixel in a lighter exclusive mask that is 4-connected adjacent to
 * a pixel in `darkestMask` is transferred to `darkestMask`. This collapses
 * the 2-3px JPEG-compressed fringe band (opaque green pixels at the
 * black/green boundary) into the black outline layer where it belongs.
 *
 * The erosion runs for `passes` iterations to handle wider fringe bands.
 */
function erodeIntodarkest(
  masks: Uint8Array[],
  darkestIdx: number,
  w: number,
  h: number,
  passes: number = 2,
): void {
  const darkest = masks[darkestIdx];
  for (let pass = 0; pass < passes; pass++) {
    for (let si = 0; si < masks.length; si++) {
      if (si === darkestIdx) continue;
      const mask = masks[si];
      for (let p = 0; p < w * h; p++) {
        if (mask[p] !== 255) continue;
        const x = p % w;
        const y = Math.floor(p / w);
        const hasBlackNeighbor =
          (x > 0     && darkest[p - 1] === 255) ||
          (x < w - 1 && darkest[p + 1] === 255) ||
          (y > 0     && darkest[p - w] === 255) ||
          (y < h - 1 && darkest[p + w] === 255);
        if (hasBlackNeighbor) {
          mask[p] = 0;
          darkest[p] = 255;
        }
      }
    }
  }
}

function rgbToHex(r: number, g: number, b: number): string {
  return '#' +
    r.toString(16).padStart(2, '0') +
    g.toString(16).padStart(2, '0') +
    b.toString(16).padStart(2, '0');
}

/**
 * Snap near-white and near-black palette colours to pure white/black.
 */
export function normalizeExtremeColor(
  r: number,
  g: number,
  b: number,
): [number, number, number] {
  const r1 = r / 255;
  const g1 = g / 255;
  const b1 = b / 255;
  const max = Math.max(r1, g1, b1);
  const min = Math.min(r1, g1, b1);
  const l = (max + min) / 2;
  const d = max - min;

  if (l > 0.60 && d < 0.20) return [255, 255, 255];
  if (l < 0.30 && d < 0.20) return [0, 0, 0];
  return [r, g, b];
}

/**
 * Apply a hard luminance threshold to a white-composited RGBA image.
 */
export function applyLuminanceThreshold(
  rgba: Uint8ClampedArray,
  threshold: number = 200,
): void {
  for (let i = 0; i < rgba.length; i += 4) {
    const luma = 0.299 * rgba[i] + 0.587 * rgba[i + 1] + 0.114 * rgba[i + 2];
    if (luma >= threshold) {
      rgba[i]     = 255;
      rgba[i + 1] = 255;
      rgba[i + 2] = 255;
      rgba[i + 3] = 255;
    }
  }
}

export class PotraceTracer implements ITracer {
  async trace(image: WorkerImageData, config: TraceConfig): Promise<string> {
    if (!potraceModule) await initPotrace();

    const { data, width, height } = image;

    if (width <= 0 || height <= 0 || data.length !== width * height * 4) {
      return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" width="${width}" height="${height}"></svg>`;
    }

    if (config.mode !== 'color') {
      return this.traceOutline(data, width, height, config);
    }

    return this.traceColor(data, width, height, config);
  }

  private async traceOutline(
    data: Uint8ClampedArray,
    width: number,
    height: number,
    config: TraceConfig,
  ): Promise<string> {
    const mod = potraceModule;
    const whiteComposite = compositeOnWhite(data, width, height);

    const pixelThreshold = config.bwThreshold !== undefined
      ? Math.round(128 + (config.bwThreshold - 128) * 0.57)
      : 200;
    applyLuminanceThreshold(whiteComposite, pixelThreshold);

    const imageData = makeFakeImageData(whiteComposite, width, height);

    return mod.potrace(imageData, {
      turdsize: config.turdSize ?? 2,
      alphamax: config.alphaMax ?? 1.0,
      opttolerance: config.optTolerance ?? 0.1,
      extractcolors: false,
      posterizelevel: 2,
      pathonly: false,
    });
  }

  private async traceColor(
    data: Uint8ClampedArray,
    width: number,
    height: number,
    config: TraceConfig,
  ): Promise<string> {
    const maxColors = config.colorPrecision ?? 8;
    const layers = extractColorLayers(data, width, height, maxColors, config.palette);

    if (layers.length === 0) {
      return this.traceOutline(data, width, height, config);
    }

    // Sort lightest → darkest (back-to-front draw order).
    const luminance = (c: [number, number, number]) =>
      0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
    layers.sort((a, b) => luminance(b.color) - luminance(a.color));

    const skipBg = config.skipBackground && layers.length > 1;
    const firstTracedLayer = skipBg ? 1 : 0;
    const cutout = !!config.cutout;
    const totalPixels = width * height;

    // ─────────────────────────────────────────────────────────────
    // STAGE 1: Build abutting exclusive masks.
    //
    // Iterate darkest→lightest so foreground (dark) layers win each pixel.
    // Every pixel is assigned to exactly ONE layer.
    // ─────────────────────────────────────────────────────────────
    const exclusiveMasks: Uint8Array[] = new Array(layers.length - firstTracedLayer);

    if (cutout) {
      for (let li = firstTracedLayer; li < layers.length; li++) {
        exclusiveMasks[li - firstTracedLayer] = new Uint8Array(layers[li].mask);
      }
    } else {
      const covered = new Uint8Array(totalPixels);
      // Darkest layer first (end of sorted array) so dark pixels win.
      for (let li = layers.length - 1; li >= firstTracedLayer; li--) {
        const srcMask = layers[li].mask;
        const exclusive = new Uint8Array(totalPixels);
        for (let p = 0; p < totalPixels; p++) {
          if (srcMask[p] === 255 && !covered[p]) {
            exclusive[p] = 255;
            covered[p] = 1;
          }
        }
        exclusiveMasks[li - firstTracedLayer] = exclusive;
      }
    }

    // ─────────────────────────────────────────────────────────────
    // STAGE 1.5: Boundary erosion — collapse fringe into darkest layer.
    //
    // JPEG compression produces a 2-3px band of fully-opaque fringe pixels
    // at hard colour boundaries (e.g. green pixels immediately adjacent to
    // the black outline). These pixels legitimately quantize into the green
    // cluster but visually belong to the black outline edge.
    //
    // Solution: transfer any lighter-layer pixel that is 4-connected
    // adjacent to the darkest-layer mask into the darkest layer. Two passes
    // handles typical 2px JPEG fringe width.
    // ─────────────────────────────────────────────────────────────
    if (!cutout && exclusiveMasks.length > 1) {
      const darkestIdx = exclusiveMasks.length - 1; // darkest = last after sort
      erodeIntodarkest(exclusiveMasks, darkestIdx, width, height, 2);
    }

    // ─────────────────────────────────────────────────────────────
    // STAGE 2: Uniform 1px dilation of every exclusive mask.
    //
    // Abutting removes anti-alias edge pixels from each layer (they were
    // previously shared). A single dilation pass restores smooth coverage
    // without re-introducing colour overlap between layers, because the
    // expanded pixels only ever land in unclaimed background space — all
    // inter-layer boundaries are already covered by `covered`.
    // ─────────────────────────────────────────────────────────────
    if (!cutout) {
      for (let si = 0; si < exclusiveMasks.length; si++) {
        exclusiveMasks[si] = dilateMask(exclusiveMasks[si], width, height);
      }
    }

    // ─────────────────────────────────────────────────────────────
    // STAGE 3: Trace & composite.
    // Draw order: bg rect (optional) → colour layers lightest-first.
    // ─────────────────────────────────────────────────────────────
    const coloredPaths: string[] = [];

    if (skipBg) {
      const bgLayer = layers[0];
      const [bgR, bgG, bgB] = normalizeExtremeColor(bgLayer.color[0], bgLayer.color[1], bgLayer.color[2]);
      const bgHex = rgbToHex(bgR, bgG, bgB);
      coloredPaths.push(`<rect width="100%" height="100%" fill="${bgHex}"/>`);
    }

    for (let li = firstTracedLayer; li < layers.length; li++) {
      const layer = layers[li];
      const [nr, ng, nb] = normalizeExtremeColor(layer.color[0], layer.color[1], layer.color[2]);
      const hex = rgbToHex(nr, ng, nb);
      const si = li - firstTracedLayer;

      const svg = await traceMask(exclusiveMasks[si], width, height, config);
      if (!svg) continue;
      const paths = extractSvgPaths(svg);
      if (!paths.trim()) continue;

      const coloredPathStr = paths
        .replace(/fill="(?:black|#000000|#000)"/gi, `fill="${hex}"`)
        .replace(/<path(?![^>]*fill=)/g, `<path fill="${hex}" `);
      coloredPaths.push(coloredPathStr);
    }

    const inner = coloredPaths.join('\n');
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" width="${width}" height="${height}">\n${inner}\n</svg>`;
  }
}
