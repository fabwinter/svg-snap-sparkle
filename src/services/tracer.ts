/**
 * Simple image-to-SVG tracer using color quantization + contour tracing.
 * Runs in main thread (could be moved to worker for large images).
 */

import { TraceConfig, MaskConfig, CleanupConfig } from '@/types/pipeline';

interface RGB { r: number; g: number; b: number; }

// --- Color quantization (median cut) ---
function quantizeColors(pixels: Uint8ClampedArray, numColors: number): RGB[] {
  const colorMap = new Map<string, { color: RGB; count: number }>();
  for (let i = 0; i < pixels.length; i += 4) {
    if (pixels[i + 3] < 128) continue; // skip transparent
    // Reduce precision for bucketing
    const r = pixels[i] & 0xF8;
    const g = pixels[i + 1] & 0xF8;
    const b = pixels[i + 2] & 0xF8;
    const key = `${r},${g},${b}`;
    const existing = colorMap.get(key);
    if (existing) existing.count++;
    else colorMap.set(key, { color: { r, g, b }, count: 1 });
  }

  const sorted = [...colorMap.values()].sort((a, b) => b.count - a.count);
  return sorted.slice(0, numColors).map(e => e.color);
}

function nearestColor(r: number, g: number, b: number, palette: RGB[]): number {
  let best = 0, bestDist = Infinity;
  for (let i = 0; i < palette.length; i++) {
    const dr = r - palette[i].r, dg = g - palette[i].g, db = b - palette[i].b;
    const d = dr * dr + dg * dg + db * db;
    if (d < bestDist) { bestDist = d; best = i; }
  }
  return best;
}

// --- Background removal (simple: sample corners, remove matching color) ---
function removeBackground(
  data: Uint8ClampedArray, w: number, h: number,
  mask: MaskConfig
): Uint8ClampedArray {
  if (mask.mode === 'none') return data;
  const result = new Uint8ClampedArray(data);
  const tol = mask.colorTolerance || 20;

  // Sample corner pixels for bg color
  const corners = [
    [0, 0], [w - 1, 0], [0, h - 1], [w - 1, h - 1],
    [1, 0], [0, 1], [w - 2, 0], [w - 1, 1],
  ];
  let rSum = 0, gSum = 0, bSum = 0, count = 0;
  for (const [x, y] of corners) {
    const idx = (y * w + x) * 4;
    rSum += data[idx]; gSum += data[idx + 1]; bSum += data[idx + 2];
    count++;
  }
  const bgR = rSum / count, bgG = gSum / count, bgB = bSum / count;

  for (let i = 0; i < result.length; i += 4) {
    const dr = result[i] - bgR, dg = result[i + 1] - bgG, db = result[i + 2] - bgB;
    if (Math.sqrt(dr * dr + dg * dg + db * db) < tol * 3) {
      result[i + 3] = 0; // make transparent
    }
  }
  return result;
}

// --- Contour tracing (marching squares simplified) ---
function createLayerMask(
  data: Uint8ClampedArray, w: number, h: number,
  colorIdx: number, palette: RGB[], turdSize: number
): boolean[][] {
  const mask: boolean[][] = Array.from({ length: h }, () => Array(w).fill(false));
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4;
      if (data[i + 3] < 128) continue;
      if (nearestColor(data[i], data[i + 1], data[i + 2], palette) === colorIdx) {
        mask[y][x] = true;
      }
    }
  }
  return mask;
}

function maskToPathData(mask: boolean[][], w: number, h: number): string {
  // Simple run-length based path generation
  const parts: string[] = [];
  for (let y = 0; y < h; y++) {
    let x = 0;
    while (x < w) {
      if (mask[y][x]) {
        const startX = x;
        while (x < w && mask[y][x]) x++;
        parts.push(`M${startX},${y}h${x - startX}v1h-${x - startX}Z`);
      } else {
        x++;
      }
    }
  }
  return parts.join('');
}

function rgbToHex(c: RGB): string {
  return '#' + [c.r, c.g, c.b].map(v => v.toString(16).padStart(2, '0')).join('');
}

// --- Outline mode (B&W threshold) ---
function traceOutline(
  data: Uint8ClampedArray, w: number, h: number,
  config: TraceConfig
): string {
  const threshold = config.bwThreshold ?? 128;
  const parts: string[] = [];

  for (let y = 0; y < h; y++) {
    let x = 0;
    while (x < w) {
      const i = (y * w + x) * 4;
      const lum = data[i] * 0.299 + data[i + 1] * 0.587 + data[i + 2] * 0.114;
      const isBlack = lum < threshold && data[i + 3] >= 128;
      if (isBlack) {
        const startX = x;
        while (x < w) {
          const j = (y * w + x) * 4;
          const l2 = data[j] * 0.299 + data[j + 1] * 0.587 + data[j + 2] * 0.114;
          if (l2 >= threshold || data[j + 3] < 128) break;
          x++;
        }
        parts.push(`M${startX},${y}h${x - startX}v1h-${x - startX}Z`);
      } else {
        x++;
      }
    }
  }

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" width="${w}" height="${h}">
<path d="${parts.join('')}" fill="#000000"/>
</svg>`;
}

// --- Main trace function ---
export async function traceImage(
  imageData: ImageData,
  maskConfig: MaskConfig,
  _cleanupConfig: CleanupConfig,
  traceConfig: TraceConfig,
  callbacks: { onProgress: (stage: string, percent: number) => void }
): Promise<string> {
  const { width: w, height: h } = imageData;
  let pixels = new Uint8ClampedArray(imageData.data);

  callbacks.onProgress('Analysing...', 10);
  await sleep(100);

  // Background removal
  if (maskConfig.mode !== 'none') {
    callbacks.onProgress('Removing background...', 25);
    pixels = removeBackground(pixels, w, h, maskConfig);
    await sleep(100);
  }

  callbacks.onProgress('Tracing paths...', 40);
  await sleep(100);

  let svgString: string;

  if (traceConfig.mode === 'outline') {
    svgString = traceOutline(pixels, w, h, traceConfig);
  } else {
    // Color / spline modes: quantize then trace each layer
    const numColors = traceConfig.colorPrecision;
    const palette = quantizeColors(pixels, numColors);

    callbacks.onProgress('Tracing paths...', 50);

    const pathElements: string[] = [];
    for (let ci = 0; ci < palette.length; ci++) {
      const progress = 50 + (ci / palette.length) * 40;
      callbacks.onProgress('Tracing paths...', Math.round(progress));

      const mask = createLayerMask(pixels, w, h, ci, palette, traceConfig.turdSize);
      const pathData = maskToPathData(mask, w, h);
      if (pathData) {
        pathElements.push(`<path d="${pathData}" fill="${rgbToHex(palette[ci])}"/>`);
      }
      await sleep(10);
    }

    // Check for transparent areas and add no fill for them
    callbacks.onProgress('Generating SVG...', 92);

    svgString = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" width="${w}" height="${h}">
${pathElements.join('\n')}
</svg>`;
  }

  callbacks.onProgress('Done', 100);
  return svgString;
}

function sleep(ms: number): Promise<void> {
  return new Promise(r => setTimeout(r, ms));
}
