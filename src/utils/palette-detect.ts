/**
 * Main-thread palette detection. Downscales the source ImageData to a small
 * thumbnail and runs the same quantization the worker uses, so the UI can
 * preview the detected palette without involving the worker.
 */
import { extractPalette } from '@/worker/tracing/color-quantize';

export type RGB = [number, number, number];

export function rgbToHex(r: number, g: number, b: number): string {
  const h = (n: number) => n.toString(16).padStart(2, '0');
  return '#' + h(r) + h(g) + h(b);
}

export function hexToRgb(hex: string): RGB {
  const h = hex.replace('#', '');
  return [
    parseInt(h.substring(0, 2), 16),
    parseInt(h.substring(2, 4), 16),
    parseInt(h.substring(4, 6), 16),
  ];
}

/** Downscale ImageData to fit within `maxDim` px, returning a new ImageData. */
function downscale(src: ImageData, maxDim: number): ImageData {
  const { width: w, height: h } = src;
  const max = Math.max(w, h);
  if (max <= maxDim) return src;
  const scale = maxDim / max;
  const dw = Math.max(1, Math.round(w * scale));
  const dh = Math.max(1, Math.round(h * scale));

  const srcCanvas = document.createElement('canvas');
  srcCanvas.width = w; srcCanvas.height = h;
  srcCanvas.getContext('2d')!.putImageData(src, 0, 0);

  const dstCanvas = document.createElement('canvas');
  dstCanvas.width = dw; dstCanvas.height = dh;
  const ctx = dstCanvas.getContext('2d')!;
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(srcCanvas, 0, 0, dw, dh);
  return ctx.getImageData(0, 0, dw, dh);
}

export function detectPaletteHex(imageData: ImageData, maxColors: number): string[] {
  const small = downscale(imageData, 200);
  const colors = extractPalette(small.data, small.width, small.height, maxColors);
  return colors.map(([r, g, b]) => rgbToHex(r, g, b));
}
