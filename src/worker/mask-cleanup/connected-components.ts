/**
 * Two-pass connected-component labeling on a binary mask.
 */

export interface ComponentResult {
  labels: Int32Array;
  areas: Map<number, number>;
  count: number;
}

/** 4-connected two-pass labeling */
export function labelComponents(mask: Uint8Array, w: number, h: number): ComponentResult {
  const labels = new Int32Array(w * h);
  const parent = new Int32Array(w * h + 1);
  let nextLabel = 1;

  for (let i = 0; i < parent.length; i++) parent[i] = i;

  function find(x: number): number {
    while (parent[x] !== x) {
      parent[x] = parent[parent[x]];
      x = parent[x];
    }
    return x;
  }

  function union(a: number, b: number): void {
    const ra = find(a);
    const rb = find(b);
    if (ra !== rb) parent[rb] = ra;
  }

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const idx = y * w + x;
      if (mask[idx] === 0) continue;

      const left = x > 0 ? labels[idx - 1] : 0;
      const up = y > 0 ? labels[idx - w] : 0;

      if (left === 0 && up === 0) {
        labels[idx] = nextLabel++;
      } else if (left !== 0 && up === 0) {
        labels[idx] = left;
      } else if (left === 0 && up !== 0) {
        labels[idx] = up;
      } else {
        labels[idx] = left;
        if (left !== up) union(left, up);
      }
    }
  }

  const areas = new Map<number, number>();
  for (let i = 0; i < labels.length; i++) {
    if (labels[i] === 0) continue;
    labels[i] = find(labels[i]);
    areas.set(labels[i], (areas.get(labels[i]) || 0) + 1);
  }

  return { labels, areas, count: areas.size };
}

/** Remove foreground components smaller than minArea */
export function removeSmallComponents(
  mask: Uint8Array, w: number, h: number, minArea: number,
): Uint8Array {
  if (minArea <= 0) return mask.slice();
  const { labels, areas } = labelComponents(mask, w, h);
  const out = mask.slice();

  for (let i = 0; i < labels.length; i++) {
    if (labels[i] !== 0 && (areas.get(labels[i]) || 0) < minArea) {
      out[i] = 0;
    }
  }

  return out;
}
