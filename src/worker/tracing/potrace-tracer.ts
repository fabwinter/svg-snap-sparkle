/**
 * Potrace WASM — bitmap tracing (outline + color).
 *
 * Outline mode: composites onto white, traces dark outlines → single-color SVG.
 * Color mode: quantizes image into color layers, traces each layer separately.
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

/** Trace a single binary mask (255=foreground) with Potrace. Returns raw SVG. */
async function traceMask(
  mask: Uint8Array,
  w: number,
  h: number,
  config: TraceConfig,
): Promise<string> {
  const mod = potraceModule;

  // Convert binary mask to RGBA: foreground=black, background=white
  const rgba = new Uint8ClampedArray(w * h * 4);
  for (let i = 0; i < w * h; i++) {
    const off = i * 4;
    const val = mask[i] === 255 ? 0 : 255;
    rgba[off] = val;
    rgba[off + 1] = val;
    rgba[off + 2] = val;
    rgba[off + 3] = 255;
  }

  const imageData = new ImageData(rgba, w, h);

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

/** Dilate a binary mask by 1px (4-connected). */
function dilateMask(mask: Uint8Array, w: number, h: number): Uint8Array {
  const out = new Uint8Array(mask);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (mask[y * w + x] !== 255) continue;
      if (x > 0) out[y * w + x - 1] = 255;
      if (x < w - 1) out[y * w + x + 1] = 255;
      if (y > 0) out[(y - 1) * w + x] = 255;
      if (y < h - 1) out[(y + 1) * w + x] = 255;
    }
  }
  return out;
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

  if (l > 0.70 && d < 0.12) return [255, 255, 255];
  if (l < 0.22 && d < 0.15) return [0, 0, 0];
  return [r, g, b];
}

export class PotraceTracer implements ITracer {
  async trace(image: WorkerImageData, config: TraceConfig): Promise<string> {
    if (!potraceModule) await initPotrace();

    const { data, width, height } = image;

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
    const imageData = new ImageData(
      new Uint8ClampedArray(whiteComposite.buffer as ArrayBuffer),
      width,
      height,
    );

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
    const layers = extractColorLayers(data, width, height, maxColors);

    if (layers.length === 0) {
      return this.traceOutline(data, width, height, config);
    }

    const skipBg = config.skipBackground && layers.length > 1;
    const firstTracedLayer = skipBg ? 1 : 0;

    // Build stacked masks
    const stackedMasks: Uint8Array[] = [];
    for (let li = firstTracedLayer; li < layers.length; li++) {
      const stacked = new Uint8Array(width * height);
      for (let lj = li; lj < layers.length; lj++) {
        const src = layers[lj].mask;
        for (let p = 0; p < stacked.length; p++) {
          if (src[p] === 255) stacked[p] = 255;
        }
      }
      stackedMasks.push(stacked);
    }

    // Dilate non-topmost masks to eliminate seams
    const dilatePasses = config.pathOverlap ?? 3;
    for (let si = 0; si < stackedMasks.length - 1; si++) {
      let m = stackedMasks[si];
      for (let p = 0; p < dilatePasses; p++) m = dilateMask(m, width, height);
      stackedMasks[si] = m;
    }

    const coloredPaths: string[] = [];
    if (skipBg) {
      const bgLayer = layers[0];
      const [bgR, bgG, bgB] = normalizeExtremeColor(bgLayer.color[0], bgLayer.color[1], bgLayer.color[2]);
      const bgHex = rgbToHex(bgR, bgG, bgB);
      coloredPaths.push(`<rect width="100%" height="100%" fill="${bgHex}"/>`);
    }

    // Trace each layer
    for (let li = firstTracedLayer; li < layers.length; li++) {
      const layer = layers[li];
      const [nr, ng, nb] = normalizeExtremeColor(layer.color[0], layer.color[1], layer.color[2]);
      const hex = rgbToHex(nr, ng, nb);
      const si = li - firstTracedLayer;

      const svg = await traceMask(stackedMasks[si], width, height, config);
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
