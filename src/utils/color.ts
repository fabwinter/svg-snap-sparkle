/** Euclidean RGB distance */
export function colorDistance(
  r1: number, g1: number, b1: number,
  r2: number, g2: number, b2: number,
): number {
  const dr = r1 - r2;
  const dg = g1 - g2;
  const db = b1 - b2;
  return Math.sqrt(dr * dr + dg * dg + db * db);
}

/** Max possible distance in RGB space */
export const MAX_COLOR_DISTANCE = Math.sqrt(255 * 255 * 3); // ~441.67

/** Convert a 0–100 tolerance to 0–MAX_COLOR_DISTANCE */
export function toleranceToDistance(tolerance: number): number {
  return (tolerance / 100) * MAX_COLOR_DISTANCE;
}

/** Parse hex color to [r, g, b] */
export function hexToRgb(hex: string): [number, number, number] {
  const h = hex.replace('#', '');
  return [
    parseInt(h.substring(0, 2), 16),
    parseInt(h.substring(2, 4), 16),
    parseInt(h.substring(4, 6), 16),
  ];
}

/** Relative luminance (sRGB) */
export function luminance(r: number, g: number, b: number): number {
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
