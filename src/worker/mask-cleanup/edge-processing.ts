/**
 * Edge smoothing: box blur the mask, then re-threshold.
 */

/** Box blur a binary mask with given radius */
export function blurMask(mask: Uint8Array, w: number, h: number, radius: number): Uint8Array {
  if (radius <= 0) return mask.slice();

  const temp = new Float32Array(w * h);
  const diam = 2 * radius + 1;
  const invDiam = 1 / diam;

  // Horizontal
  for (let y = 0; y < h; y++) {
    let sum = 0;
    for (let x = -radius; x <= radius; x++) {
      const cx = Math.max(0, Math.min(w - 1, x));
      sum += mask[y * w + cx];
    }
    temp[y * w] = sum * invDiam;

    for (let x = 1; x < w; x++) {
      const addX = Math.min(w - 1, x + radius);
      const subX = Math.max(0, x - radius - 1);
      sum += mask[y * w + addX] - mask[y * w + subX];
      temp[y * w + x] = sum * invDiam;
    }
  }

  // Vertical
  const out = new Uint8Array(w * h);
  for (let x = 0; x < w; x++) {
    let sum = 0;
    for (let y = -radius; y <= radius; y++) {
      const cy = Math.max(0, Math.min(h - 1, y));
      sum += temp[cy * w + x];
    }
    out[x] = Math.round(sum * invDiam);

    for (let y = 1; y < h; y++) {
      const addY = Math.min(h - 1, y + radius);
      const subY = Math.max(0, y - radius - 1);
      sum += temp[addY * w + x] - temp[subY * w + x];
      out[y * w + x] = Math.round(sum * invDiam);
    }
  }

  return out;
}

/** Blur then re-threshold for smoother edges */
export function smoothEdges(
  mask: Uint8Array, w: number, h: number,
  blurRadius: number, threshold: number,
): Uint8Array {
  const blurred = blurMask(mask, w, h, blurRadius);
  const out = new Uint8Array(w * h);
  for (let i = 0; i < blurred.length; i++) {
    out[i] = blurred[i] >= threshold ? 255 : 0;
  }
  return out;
}
