export interface TraceConfig {
  mode: 'outline' | 'color' | 'spline';
  turdSize: number;
  optTolerance: number;
  colorPrecision: number;
  pathOverlap: number;
  filterSpeckle: number;
  bwThreshold?: number;
}

export interface MaskConfig {
  mode: 'none' | 'solid-color';
  alphaThreshold: number;
  colorTolerance?: number;
  borderOnly?: boolean;
}

export interface CleanupConfig {
  morphOpenRadius: number;
  morphCloseRadius: number;
  speckAreaThreshold: number;
  fillHoles: boolean;
  holeAreaThreshold: number;
  smoothEdges: boolean;
  finalAlphaThreshold: number;
}

export interface ProgressCallback {
  onProgress: (stage: string, percent: number) => void;
}

export const DEFAULT_CLEANUP: CleanupConfig = {
  morphOpenRadius: 1,
  morphCloseRadius: 2,
  speckAreaThreshold: 64,
  fillHoles: true,
  holeAreaThreshold: 256,
  smoothEdges: false,
  finalAlphaThreshold: 128,
};
