/**
 * Path 1: Extract mask from existing alpha channel.
 * Pixels with alpha >= threshold → foreground (255), else background (0).
 */

export function maskFromAlpha(
  rgba: Uint8ClampedArray, w: number, h: number, threshold: number,
): Uint8Array {
  const mask = new Uint8Array(w * h);
  for (let i = 0; i < w * h; i++) {
    mask[i] = rgba[i * 4 + 3] >= threshold ? 255 : 0;
  }
  return mask;
}

/** Check if an image actually has meaningful transparency */
export function hasTransparency(rgba: Uint8ClampedArray): boolean {
  for (let i = 3; i < rgba.length; i += 4) {
    if (rgba[i] < 250) return true;
  }
  return false;
}
