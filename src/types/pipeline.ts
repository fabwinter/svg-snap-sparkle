/** How to generate the initial binary mask from the source image */
export interface MaskConfig {
  mode: 'alpha' | 'solid-color' | 'none';
  /** Alpha channel threshold (0–255). Default 128 */
  alphaThreshold: number;
  /** Target color for solid-color removal [r, g, b] */
  colorTarget?: [number, number, number];
  /** Color distance tolerance (0–100). Default 20 */
  colorTolerance?: number;
  /** Only remove background connected to image border. Default true */
  borderOnly?: boolean;
}

/** How to clean the mask before tracing */
export interface CleanupConfig {
  /** Morphological open radius. Default 1 */
  morphOpenRadius: number;
  /** Morphological close radius. Default 2 */
  morphCloseRadius: number;
  /** Remove connected components smaller than this (px). Default 64 */
  speckAreaThreshold: number;
  /** Fill interior holes. Default true */
  fillHoles: boolean;
  /** Holes smaller than this get filled (px). Default 256 */
  holeAreaThreshold: number;
  /** Blur mask edges then re-threshold. Default false */
  smoothEdges: boolean;
  /** Final alpha threshold after processing. Default 128 */
  finalAlphaThreshold: number;
}

/** Which tracing engine and its parameters */
export interface TraceConfig {
  mode: 'outline' | 'color' | 'spline';
  // Potrace options
  turdSize?: number;
  alphaMax?: number;
  optTolerance?: number;
  // Color mode options
  colorPrecision?: number;
  filterSpeckle?: number;
  /** When true, layer 0 is output as a <rect> instead of traced */
  skipBackground?: boolean;
  /** Number of dilation passes for stacked color masks (1–6). Default 4 */
  pathOverlap?: number;
  /** Line Art brightness threshold (0–255). Default 128 */
  bwThreshold?: number;
}

/** Full processing request sent to the worker */
export interface ProcessingRequest {
  imageData: ImageData;
  mask: MaskConfig;
  cleanup: CleanupConfig;
  trace: TraceConfig;
}

/** Result returned from the worker */
export interface ProcessingResult {
  svgString: string;
  width: number;
  height: number;
}

export interface ProgressCallback {
  onProgress: (stage: string, percent: number) => void;
}

export const DEFAULT_MASK_CONFIG: MaskConfig = {
  mode: 'alpha',
  alphaThreshold: 128,
  colorTolerance: 20,
  borderOnly: true,
};

export const DEFAULT_CLEANUP: CleanupConfig = {
  morphOpenRadius: 1,
  morphCloseRadius: 2,
  speckAreaThreshold: 64,
  fillHoles: true,
  holeAreaThreshold: 256,
  smoothEdges: false,
  finalAlphaThreshold: 128,
};

export const DEFAULT_TRACE_CONFIG: TraceConfig = {
  mode: 'outline',
  turdSize: 2,
  alphaMax: 1.0,
  optTolerance: 0.1,
  colorPrecision: 6,
  filterSpeckle: 2,
  skipBackground: false,
  pathOverlap: 4,
  bwThreshold: 128,
};
