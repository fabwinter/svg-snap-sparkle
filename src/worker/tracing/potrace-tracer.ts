/**
 * Potrace WASM — bitmap tracing (outline + color).
 *
 * Outline mode: composites onto white, applies hard luminance threshold to
 *               remove anti-alias ramp, then traces dark outlines → single-color SVG.
 * Color mode:   quantizes image into color layers, traces each layer separately
 *               using ABUTTING exclusive masks + gap-filler trap strips so no
 *               underlying colour bleeds through at region boundaries.
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

/**
 * Create a plain object with the same shape as ImageData.
 * esm-potrace-wasm only reads .data, .width, .height — it doesn't
 * check instanceof ImageData. Using a plain object avoids the native
 * ImageData constructor which can cause "Offset should not be negative"
 * errors when the WASM module's memory grows and invalidates typed array views.
 */
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

/** Dilate a binary mask by 1px (4-connected). Used only by gap-filler. */
function dilateMask(mask: Uint8Array, w: number, h: number): Uint8Array {
  const out = new Uint8Array(mask);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (mask[y * w + x] !== 255) continue;
      if (x > 0)     out[y * w + x - 1] = 255;
      if (x < w - 1) out[y * w + x + 1] = 255;
      if (y > 0)     out[(y - 1) * w + x] = 255;
      if (y < h - 1) out[(y + 1) * w + x] = 255;
    }
  }
  return out;
}

/**
 * Compute the 1-px boundary band between two abutting masks.
 * Returns a mask covering pixels that are adjacent to both regions
 * but belong to neither — i.e. the crack between them.
 *
 * These pixels are the exact locations where browser anti-aliasing
 * would otherwise interpolate between a colour and the page background
 * producing a visible halo. Filling them with an averaged colour
 * (see buildGapFillLayers) ensures AA blends between two similar
 * colours instead.
 */
function boundaryBand(
  a: Uint8Array,
  b: Uint8Array,
  w: number,
  h: number,
): Uint8Array {
  const da = dilateMask(a, w, h);
  const db = dilateMask(b, w, h);
  const band = new Uint8Array(a.length);
  for (let p = 0; p < a.length; p++) {
    if (da[p] === 255 && db[p] === 255 && !a[p] && !b[p]) {
      band[p] = 255;
    }
  }
  return band;
}

function rgbToHex(r: number, g: number, b: number): string {
  return '#' +
    r.toString(16).padStart(2, '0') +
    g.toString(16).padStart(2, '0') +
    b.toString(16).padStart(2, '0');
}

/**
 * Snap near-white and near-black palette colours to pure white/black.
 *
 * Broadened vs. original to catch washed-out pale-green/teal edge composites
 * that sit around l≈0.65 with low chroma and were previously assigned a
 * faintly-coloured SVG fill instead of being snapped to white.
 *
 * Thresholds:  light l > 0.60 (was 0.70)  |  dark l < 0.30 (was 0.22)
 *              chroma d < 0.20 unified     (was 0.12 light / 0.15 dark)
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
 *
 * After compositeOnWhite, mask edges produce a smooth gray-to-white ramp
 * (e.g. a pixel that was rgba(0,128,0,180) becomes ~rgb(91,182,91) which
 * composites to ~rgb(168,211,168) — a light greenish mid-tone). Potrace's
 * posterizelevel:2 binarisation then cuts through this ramp and traces
 * the gray band as a closed region, producing a colored halo.
 *
 * This function snaps every pixel whose perceptual luminance exceeds
 * `threshold` (0–255, default 200) to pure white (255,255,255,255),
 * collapsing the entire anti-alias gradient to white before Potrace sees
 * it. Dark logo content (luma < threshold) is untouched.
 *
 * Default threshold of 200 was chosen to be well above the brightest
 * legitimate gray in JPEG-compressed logos (~160) while being safely
 * below pure white (255), so the snap only hits the fringe band.
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

    // Snap the anti-alias ramp at mask edges to pure white before tracing.
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

    // ─────────────────────────────────────────────────────────────────────
    // STAGE 1 — ABUTTING EXCLUSIVE MASKS
    //
    // Iterate layers darkest-first (back-to-front in reverse), greedily
    // assigning each pixel to the darkest (topmost) layer that claims it.
    // Result: every pixel belongs to at most ONE layer — no colour can
    // show through beneath another at a shared boundary.
    //
    // This is equivalent to Illustrator's "Abutting" image-trace method.
    // ─────────────────────────────────────────────────────────────────────
    const abuttingMasks: Uint8Array[] = new Array(layers.length - firstTracedLayer);

    if (cutout) {
      // In cutout mode keep original masks; no stacking needed.
      for (let li = firstTracedLayer; li < layers.length; li++) {
        abuttingMasks[li - firstTracedLayer] = new Uint8Array(layers[li].mask);
      }
    } else {
      const covered = new Uint8Array(totalPixels);
      // Iterate darkest → lightest so darker (foreground) layers win.
      for (let li = layers.length - 1; li >= firstTracedLayer; li--) {
        const srcMask = layers[li].mask;
        const exclusive = new Uint8Array(totalPixels);
        for (let p = 0; p < totalPixels; p++) {
          if (srcMask[p] === 255 && !covered[p]) {
            exclusive[p] = 255;
            covered[p] = 1;
          }
        }
        abuttingMasks[li - firstTracedLayer] = exclusive;
      }
    }

    // ─────────────────────────────────────────────────────────────────────
    // STAGE 2 — GAP-FILLER TRAP STRIPS  (Vectorizer.AI "Gap Filler")
    //
    // For each adjacent pair of colour layers compute the 1-px boundary
    // band between their exclusive regions. Fill that band with the
    // perceptual average of the two colours and draw it UNDERNEATH both
    // layers. This ensures browser anti-aliasing at region edges blends
    // between two similar colours instead of between a colour and the
    // plain white page background — which is what produces the halo.
    // ─────────────────────────────────────────────────────────────────────
    const gapFillPaths: string[] = [];

    if (!cutout) {
      const tracedCount = layers.length - firstTracedLayer;
      for (let si = 0; si < tracedCount - 1; si++) {
        const layerA = layers[si + firstTracedLayer];
        const layerB = layers[si + 1 + firstTracedLayer];
        const maskA = abuttingMasks[si];
        const maskB = abuttingMasks[si + 1];

        const band = boundaryBand(maskA, maskB, width, height);

        let bandHasPixels = false;
        for (let p = 0; p < band.length; p++) {
          if (band[p] === 255) { bandHasPixels = true; break; }
        }
        if (!bandHasPixels) continue;

        // Normalise both colours before averaging so snapped white/black
        // values are used rather than raw palette values.
        const [arN, agN, abN] = normalizeExtremeColor(layerA.color[0], layerA.color[1], layerA.color[2]);
        const [brN, bgN, bbN] = normalizeExtremeColor(layerB.color[0], layerB.color[1], layerB.color[2]);
        const avgR = Math.round((arN + brN) / 2);
        const avgG = Math.round((agN + bgN) / 2);
        const avgB = Math.round((abN + bbN) / 2);
        const avgHex = rgbToHex(avgR, avgG, avgB);

        const bandSvg = await traceMask(band, width, height, config);
        if (!bandSvg) continue;
        const bandPaths = extractSvgPaths(bandSvg);
        if (!bandPaths.trim()) continue;

        const filled = bandPaths
          .replace(/fill="(?:black|#000000|#000)"/gi, `fill="${avgHex}"`)
          .replace(/<path(?![^>]*fill=)/g, `<path fill="${avgHex}" `);
        gapFillPaths.push(filled);
      }
    }

    // ─────────────────────────────────────────────────────────────────────
    // STAGE 3 — TRACE & COMPOSITE
    //
    // Draw order: background rect (optional) → gap-filler strips → colour
    // layers lightest-first (back-to-front).
    // ─────────────────────────────────────────────────────────────────────
    const coloredPaths: string[] = [];

    if (skipBg) {
      const bgLayer = layers[0];
      const [bgR, bgG, bgB] = normalizeExtremeColor(bgLayer.color[0], bgLayer.color[1], bgLayer.color[2]);
      const bgHex = rgbToHex(bgR, bgG, bgB);
      coloredPaths.push(`<rect width="100%" height="100%" fill="${bgHex}"/>`);
    }

    // Insert gap-filler strips before colour layers.
    for (const gf of gapFillPaths) {
      coloredPaths.push(gf);
    }

    for (let li = firstTracedLayer; li < layers.length; li++) {
      const layer = layers[li];
      const [nr, ng, nb] = normalizeExtremeColor(layer.color[0], layer.color[1], layer.color[2]);
      const hex = rgbToHex(nr, ng, nb);
      const si = li - firstTracedLayer;

      const svg = await traceMask(abuttingMasks[si], width, height, config);
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
