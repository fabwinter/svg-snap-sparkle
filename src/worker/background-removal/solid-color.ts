/**
 * Path 2: Remove a solid background color by color distance.
 * When borderOnly=true, only removes background-colored pixels connected
 * to the image border via flood-fill.
 */

import { colorDistance, toleranceToDistance } from '../../utils/color';

export function maskFromSolidColor(
  rgba: Uint8ClampedArray,
  w: number,
  h: number,
  target: [number, number, number],
  tolerance: number,
  borderOnly: boolean = true,
): Uint8Array {
  const mask = new Uint8Array(w * h);
  const maxDist = toleranceToDistance(tolerance);
  const [tr, tg, tb] = target;

  if (!borderOnly) {
    for (let i = 0; i < w * h; i++) {
      const off = i * 4;
      const dist = colorDistance(rgba[off], rgba[off + 1], rgba[off + 2], tr, tg, tb);
      mask[i] = dist > maxDist ? 255 : 0;
    }
    return mask;
  }

  // Border-only mode: flood-fill from edges
  const isBg = new Uint8Array(w * h);
  for (let i = 0; i < w * h; i++) {
    const off = i * 4;
    const dist = colorDistance(rgba[off], rgba[off + 1], rgba[off + 2], tr, tg, tb);
    isBg[i] = dist <= maxDist ? 1 : 0;
  }

  const visited = new Uint8Array(w * h);
  const queue: number[] = [];

  for (let x = 0; x < w; x++) {
    if (isBg[x]) queue.push(x);
    const bottom = (h - 1) * w + x;
    if (isBg[bottom]) queue.push(bottom);
  }
  for (let y = 1; y < h - 1; y++) {
    if (isBg[y * w]) queue.push(y * w);
    if (isBg[y * w + w - 1]) queue.push(y * w + w - 1);
  }

  for (const idx of queue) visited[idx] = 1;

  while (queue.length > 0) {
    const idx = queue.shift()!;
    const x = idx % w;
    const y = (idx - x) / w;

    const neighbors = [
      y > 0 ? idx - w : -1,
      y < h - 1 ? idx + w : -1,
      x > 0 ? idx - 1 : -1,
      x < w - 1 ? idx + 1 : -1,
    ];

    for (const n of neighbors) {
      if (n >= 0 && !visited[n] && isBg[n]) {
        visited[n] = 1;
        queue.push(n);
      }
    }
  }

  for (let i = 0; i < w * h; i++) {
    mask[i] = visited[i] ? 0 : 255;
  }

  return mask;
}

/** Auto-detect the most likely background color by sampling corners */
export function detectBackgroundColor(
  rgba: Uint8ClampedArray, w: number, h: number,
): [number, number, number] {
  const sampleSize = Math.min(10, Math.min(w, h));
  let rSum = 0, gSum = 0, bSum = 0, count = 0;

  const corners = [
    [0, 0], [w - sampleSize, 0],
    [0, h - sampleSize], [w - sampleSize, h - sampleSize],
  ];

  for (const [cx, cy] of corners) {
    for (let dy = 0; dy < sampleSize; dy++) {
      for (let dx = 0; dx < sampleSize; dx++) {
        const x = cx + dx;
        const y = cy + dy;
        if (x >= w || y >= h) continue;
        const off = (y * w + x) * 4;
        rSum += rgba[off];
        gSum += rgba[off + 1];
        bSum += rgba[off + 2];
        count++;
      }
    }
  }

  return [
    Math.round(rSum / count),
    Math.round(gSum / count),
    Math.round(bSum / count),
  ];
}
