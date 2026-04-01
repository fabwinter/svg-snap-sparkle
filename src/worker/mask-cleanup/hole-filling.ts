/**
 * Fill interior holes in a foreground mask.
 */

import { labelComponents } from './connected-components';

/** Fill all interior holes in the mask */
export function fillHoles(mask: Uint8Array, w: number, h: number): Uint8Array {
  const out = mask.slice();
  const inverted = new Uint8Array(w * h);
  for (let i = 0; i < mask.length; i++) {
    inverted[i] = mask[i] === 0 ? 255 : 0;
  }

  const visited = new Uint8Array(w * h);
  const queue: number[] = [];

  for (let x = 0; x < w; x++) {
    if (inverted[x] === 255) queue.push(x);
    const bottom = (h - 1) * w + x;
    if (inverted[bottom] === 255) queue.push(bottom);
  }
  for (let y = 1; y < h - 1; y++) {
    if (inverted[y * w] === 255) queue.push(y * w);
    if (inverted[y * w + w - 1] === 255) queue.push(y * w + w - 1);
  }

  for (const seed of queue) visited[seed] = 1;
  let head = 0;
  while (head < queue.length) {
    const idx = queue[head++];
    const x = idx % w;
    const y = (idx - x) / w;

    const neighbors = [
      y > 0 ? idx - w : -1,
      y < h - 1 ? idx + w : -1,
      x > 0 ? idx - 1 : -1,
      x < w - 1 ? idx + 1 : -1,
    ];

    for (const n of neighbors) {
      if (n >= 0 && !visited[n] && inverted[n] === 255) {
        visited[n] = 1;
        queue.push(n);
      }
    }
  }

  for (let i = 0; i < out.length; i++) {
    if (mask[i] === 0 && !visited[i]) {
      out[i] = 255;
    }
  }

  return out;
}

/** Fill only holes smaller than maxArea */
export function fillSmallHoles(
  mask: Uint8Array, w: number, h: number, maxArea: number,
): Uint8Array {
  const inverted = new Uint8Array(w * h);
  for (let i = 0; i < mask.length; i++) {
    inverted[i] = mask[i] === 0 ? 255 : 0;
  }

  const { labels, areas } = labelComponents(inverted, w, h);

  const borderLabels = new Set<number>();
  for (let x = 0; x < w; x++) {
    if (labels[x] !== 0) borderLabels.add(labels[x]);
    if (labels[(h - 1) * w + x] !== 0) borderLabels.add(labels[(h - 1) * w + x]);
  }
  for (let y = 0; y < h; y++) {
    if (labels[y * w] !== 0) borderLabels.add(labels[y * w]);
    if (labels[y * w + w - 1] !== 0) borderLabels.add(labels[y * w + w - 1]);
  }

  const out = mask.slice();
  for (let i = 0; i < labels.length; i++) {
    const lbl = labels[i];
    if (lbl !== 0 && !borderLabels.has(lbl) && (areas.get(lbl) || 0) <= maxArea) {
      out[i] = 255;
    }
  }

  return out;
}
