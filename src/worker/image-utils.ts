/**
 * ImageData helpers for the worker.
 * Workers don't have DOM ImageData, so we work with raw buffers.
 */

/** Apply a binary mask to RGBA data: bg pixels become fully transparent */
export function applyMaskToRgba(
  rgba: Uint8ClampedArray,
  mask: Uint8Array,
  w: number,
  h: number,
): Uint8ClampedArray {
  const out = new Uint8ClampedArray(rgba.length);
  for (let i = 0; i < w * h; i++) {
    const off = i * 4;
    if (mask[i] === 255) {
      out[off] = rgba[off];
      out[off + 1] = rgba[off + 1];
      out[off + 2] = rgba[off + 2];
      out[off + 3] = rgba[off + 3];
    } else {
      out[off] = 0;
      out[off + 1] = 0;
      out[off + 2] = 0;
      out[off + 3] = 0;
    }
  }
  return out;
}

/**
 * Composite masked RGBA onto a solid white background.
 * Critical for Potrace: transparent pixels must become WHITE (not black)
 * so that Potrace traces the dark foreground, not the background.
 */
export function compositeOnWhite(
  rgba: Uint8ClampedArray,
  w: number,
  h: number,
): Uint8ClampedArray {
  const out = new Uint8ClampedArray(w * h * 4);
  for (let i = 0; i < w * h; i++) {
    const off = i * 4;
    const a = rgba[off + 3] / 255;
    out[off] = Math.round(rgba[off] * a + 255 * (1 - a));
    out[off + 1] = Math.round(rgba[off + 1] * a + 255 * (1 - a));
    out[off + 2] = Math.round(rgba[off + 2] * a + 255 * (1 - a));
    out[off + 3] = 255;
  }
  return out;
}

/** Convert binary mask (Uint8Array 0/255) to RGBA for display */
export function maskToRgba(mask: Uint8Array, w: number, h: number): Uint8ClampedArray {
  const rgba = new Uint8ClampedArray(w * h * 4);
  for (let i = 0; i < w * h; i++) {
    const v = mask[i];
    const off = i * 4;
    rgba[off] = v;
    rgba[off + 1] = v;
    rgba[off + 2] = v;
    rgba[off + 3] = 255;
  }
  return rgba;
}

/** Create a simple ImageData-like structure for workers */
export interface WorkerImageData {
  data: Uint8ClampedArray;
  width: number;
  height: number;
}

export function createWorkerImageData(
  data: Uint8ClampedArray, width: number, height: number,
): WorkerImageData {
  return { data, width, height };
}
