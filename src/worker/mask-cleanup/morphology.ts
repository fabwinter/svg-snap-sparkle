/**
 * Binary morphology on a Uint8Array mask (0 = bg, 255 = fg).
 * Uses a circular structuring element of given radius.
 */

/** Erode: a pixel stays 255 only if ALL pixels in the kernel are 255 */
export function erode(mask: Uint8Array, w: number, h: number, radius: number): Uint8Array {
  if (radius <= 0) return mask.slice();
  const out = new Uint8Array(w * h);
  const r2 = radius * radius;

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let allFg = true;
      outer:
      for (let dy = -radius; dy <= radius; dy++) {
        for (let dx = -radius; dx <= radius; dx++) {
          if (dx * dx + dy * dy > r2) continue;
          const nx = x + dx;
          const ny = y + dy;
          if (nx < 0 || nx >= w || ny < 0 || ny >= h || mask[ny * w + nx] === 0) {
            allFg = false;
            break outer;
          }
        }
      }
      out[y * w + x] = allFg ? 255 : 0;
    }
  }
  return out;
}

/** Dilate: a pixel becomes 255 if ANY pixel in the kernel is 255 */
export function dilate(mask: Uint8Array, w: number, h: number, radius: number): Uint8Array {
  if (radius <= 0) return mask.slice();
  const out = new Uint8Array(w * h);
  const r2 = radius * radius;

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let anyFg = false;
      outer:
      for (let dy = -radius; dy <= radius; dy++) {
        for (let dx = -radius; dx <= radius; dx++) {
          if (dx * dx + dy * dy > r2) continue;
          const nx = x + dx;
          const ny = y + dy;
          if (nx >= 0 && nx < w && ny >= 0 && ny < h && mask[ny * w + nx] === 255) {
            anyFg = true;
            break outer;
          }
        }
      }
      out[y * w + x] = anyFg ? 255 : 0;
    }
  }
  return out;
}

/** Morphological open (erode then dilate) — removes small protrusions */
export function morphOpen(mask: Uint8Array, w: number, h: number, radius: number): Uint8Array {
  return dilate(erode(mask, w, h, radius), w, h, radius);
}

/** Morphological close (dilate then erode) — fills small gaps */
export function morphClose(mask: Uint8Array, w: number, h: number, radius: number): Uint8Array {
  return erode(dilate(mask, w, h, radius), w, h, radius);
}
