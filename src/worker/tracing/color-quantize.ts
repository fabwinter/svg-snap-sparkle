/**
 * Color quantization for per-layer Potrace tracing.
 *
 * Uses 4-bit bucket quantization with cluster merging to produce
 * accurate color representatives, then removes intermediate blend colors.
 */

export interface ColorLayer {
  /** The representative color [r, g, b] */
  color: [number, number, number];
  /** Binary mask: 255 = this color, 0 = other */
  mask: Uint8Array;
}

/**
 * Compute perceptual color distance (weighted Euclidean).
 */
function colorDistSq(c1: [number, number, number], c2: [number, number, number]): number {
  const dr = c1[0] - c2[0];
  const dg = c1[1] - c2[1];
  const db = c1[2] - c2[2];
  return 2 * dr * dr + 4 * dg * dg + 3 * db * db;
}

/**
 * Return true if `color` is approximately a weighted linear blend
 * of any pair of colors in `primaries`.
 */
function isLinearBlend(
  color: [number, number, number],
  primaries: [number, number, number][],
  tol: number,
): boolean {
  for (let i = 0; i < primaries.length; i++) {
    for (let j = i + 1; j < primaries.length; j++) {
      const a = primaries[i];
      const b = primaries[j];

      let alpha = -1;
      let maxSpread = 0;
      for (let ch = 0; ch < 3; ch++) {
        const spread = Math.abs(a[ch] - b[ch]);
        if (spread > maxSpread) {
          maxSpread = spread;
          alpha = b[ch] !== a[ch] ? (b[ch] - color[ch]) / (b[ch] - a[ch]) : -1;
        }
      }
      if (maxSpread < 10 || alpha < 0 || alpha > 1) continue;

      let ok = true;
      for (let ch = 0; ch < 3; ch++) {
        if (Math.abs(a[ch] * alpha + b[ch] * (1 - alpha) - color[ch]) > tol) {
          ok = false;
          break;
        }
      }
      if (ok) return true;
    }
  }
  return false;
}

/**
 * Assign a pixel to its nearest palette color, with a lightness-mismatch
 * penalty to prevent JPEG fringe artifacts.
 */
function findNearestColor(
  r: number, g: number, b: number,
  colors: [number, number, number][],
): number {
  const pixelL = (Math.max(r, g, b) + Math.min(r, g, b)) / (2 * 255);

  const COLOR_CHROMA_MIN = 30;
  const LIGHTNESS_GAP_MIN = 0.35;
  const CHROMA_PENALTY = 8;

  let bestIdx = 0;
  let bestDist = Infinity;
  for (let i = 0; i < colors.length; i++) {
    let dist = colorDistSq([r, g, b], colors[i]);

    const cr = colors[i][0], cg = colors[i][1], cb = colors[i][2];
    const colorChroma = Math.max(cr, cg, cb) - Math.min(cr, cg, cb);
    const colorL = (Math.max(cr, cg, cb) + Math.min(cr, cg, cb)) / (2 * 255);

    if (colorChroma > COLOR_CHROMA_MIN && pixelL > colorL + LIGHTNESS_GAP_MIN) {
      dist *= CHROMA_PENALTY;
    }

    if (dist < bestDist) {
      bestDist = dist;
      bestIdx = i;
    }
  }
  return bestIdx;
}

/**
 * Quantize masked RGBA image into distinct color layers.
 */
export function extractColorLayers(
  rgba: Uint8ClampedArray,
  w: number,
  h: number,
  maxColors: number = 12,
): ColorLayer[] {
  const totalPixels = w * h;

  const HIST_ALPHA = 200;
  const MASK_ALPHA = 128;

  const buckets = new Map<number, { rSum: number; gSum: number; bSum: number; count: number }>();
  let opaqueCount = 0;

  function buildHistogram(threshold: number): void {
    buckets.clear();
    opaqueCount = 0;
    for (let i = 0; i < totalPixels; i++) {
      const off = i * 4;
      if (rgba[off + 3] < threshold) continue;
      opaqueCount++;

      const r = rgba[off];
      const g = rgba[off + 1];
      const b = rgba[off + 2];

      const key = ((r >> 4) << 8) | ((g >> 4) << 4) | (b >> 4);

      const bucket = buckets.get(key);
      if (bucket) {
        bucket.rSum += r;
        bucket.gSum += g;
        bucket.bSum += b;
        bucket.count++;
      } else {
        buckets.set(key, { rSum: r, gSum: g, bSum: b, count: 1 });
      }
    }
  }

  buildHistogram(HIST_ALPHA);
  if (buckets.size === 0) buildHistogram(MASK_ALPHA);
  if (buckets.size === 0) return [];

  interface Cluster {
    color: [number, number, number];
    count: number;
  }

  const clusters: Cluster[] = [...buckets.values()]
    .sort((a, b) => b.count - a.count)
    .map(b => ({
      color: [
        Math.round(b.rSum / b.count),
        Math.round(b.gSum / b.count),
        Math.round(b.bSum / b.count),
      ] as [number, number, number],
      count: b.count,
    }));

  // Merge perceptually close clusters
  const MERGE_DIST_SQ = 40 * 40 * 3;
  let merged = true;
  while (merged) {
    merged = false;
    for (let i = 0; i < clusters.length; i++) {
      for (let j = i + 1; j < clusters.length; j++) {
        if (colorDistSq(clusters[i].color, clusters[j].color) < MERGE_DIST_SQ) {
          const wi = clusters[i].count;
          const wj = clusters[j].count;
          const total = wi + wj;
          const ci = clusters[i].color;
          const cj = clusters[j].color;
          clusters[i].color = [
            Math.round((ci[0] * wi + cj[0] * wj) / total),
            Math.round((ci[1] * wi + cj[1] * wj) / total),
            Math.round((ci[2] * wi + cj[2] * wj) / total),
          ];
          clusters[i].count = total;
          clusters.splice(j, 1);
          merged = true;
          break;
        }
      }
      if (merged) break;
    }
  }

  // Keep top colors, remove blends
  clusters.sort((a, b) => b.count - a.count);
  const kept = clusters.slice(0, maxColors);

  const primaries: [number, number, number][] = [];
  const finalColors: [number, number, number][] = [];
  for (const cluster of kept) {
    if (isLinearBlend(cluster.color, primaries, 25)) continue;
    primaries.push(cluster.color);
    finalColors.push(cluster.color);
  }

  if (finalColors.length === 0) return [];

  // Build per-layer masks
  const masks: Uint8Array[] = finalColors.map(() => new Uint8Array(totalPixels));

  for (let i = 0; i < totalPixels; i++) {
    const off = i * 4;
    if (rgba[off + 3] < MASK_ALPHA) continue;

    const idx = findNearestColor(rgba[off], rgba[off + 1], rgba[off + 2], finalColors);
    masks[idx][i] = 255;
  }

  // Filter tiny layers and sort by pixel count descending
  const minPixels = Math.max(50, opaqueCount * 0.005);

  const layers: ColorLayer[] = [];
  for (let idx = 0; idx < finalColors.length; idx++) {
    let count = 0;
    for (let i = 0; i < masks[idx].length; i++) {
      if (masks[idx][i]) count++;
    }
    if (count >= minPixels) {
      layers.push({ color: finalColors[idx], mask: masks[idx] });
    }
  }

  layers.sort((a, b) => {
    let ca = 0, cb = 0;
    for (let i = 0; i < a.mask.length; i++) {
      if (a.mask[i]) ca++;
      if (b.mask[i]) cb++;
    }
    return cb - ca;
  });

  return layers;
}
