/**
 * SVG post-processing: ensure no background rect, clean structure.
 */

/**
 * Remove VTracer's white background path.
 */
export function stripVTracerWhiteBackground(svg: string): string {
  return svg.replace(/<path[^>]*\bfill="#ffffff"[^>]*\/?\s*>/i, '');
}

/** Remove any <rect> that looks like a full-size background fill from SVG. */
export function stripBackgroundRect(svg: string): string {
  let result = svg.replace(
    /<rect[^>]*width\s*=\s*"100%"[^>]*height\s*=\s*"100%"[^>]*\/?\s*>/gi,
    '',
  );

  const wMatch = svg.match(/<svg[^>]*\bwidth\s*=\s*"(\d+)"/i);
  const hMatch = svg.match(/<svg[^>]*\bheight\s*=\s*"(\d+)"/i);
  if (wMatch && hMatch) {
    const svgW = wMatch[1];
    const svgH = hMatch[1];
    const bgRectPattern = new RegExp(
      `<rect[^>]*width\\s*=\\s*"${svgW}"[^>]*height\\s*=\\s*"${svgH}"[^>]*/?\\s*>`,
      'i',
    );
    result = result.replace(bgRectPattern, '');
  }

  return result;
}

/** Wrap raw SVG paths in a proper SVG document */
export function wrapSvg(
  innerSvg: string,
  width: number,
  height: number,
): string {
  if (innerSvg.trimStart().startsWith('<svg')) return innerSvg;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" width="${width}" height="${height}">\n${innerSvg}\n</svg>`;
}

/** Extract just the inner content (paths) from a complete SVG */
export function extractSvgPaths(svg: string): string {
  const match = svg.match(/<svg[^>]*>([\s\S]*)<\/svg>/i);
  return match ? match[1] : svg;
}
