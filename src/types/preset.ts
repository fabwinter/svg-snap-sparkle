import { TraceConfig, MaskConfig } from './pipeline';

export type PresetType = 'logo' | 'clipart' | 'illustration' | 'photo';

export interface PresetDefaults {
  label: string;
  colorCount: number;
  traceMode: TraceConfig['mode'];
  removeBg: boolean;
}

export const PRESETS: Record<PresetType, PresetDefaults> = {
  logo: { label: 'Logo', colorCount: 4, traceMode: 'color', removeBg: true },
  clipart: { label: 'Clipart', colorCount: 4, traceMode: 'color', removeBg: true },
  illustration: { label: 'Illustration', colorCount: 8, traceMode: 'color', removeBg: false },
  photo: { label: 'Photo', colorCount: 16, traceMode: 'color', removeBg: false },
};

export function buildTraceConfig(preset: PresetType, colorCount: number): TraceConfig {
  switch (preset) {
    case 'logo':
      return {
        mode: 'outline', turdSize: 2, alphaMax: 1.0, optTolerance: 0.1,
        colorPrecision: colorCount, pathOverlap: 0, filterSpeckle: 0, bwThreshold: 128,
      };
    case 'clipart':
    case 'illustration':
      return {
        mode: 'color', turdSize: 4, alphaMax: 1.0, optTolerance: 0.2,
        colorPrecision: colorCount, pathOverlap: 4, filterSpeckle: 0,
      };
    case 'photo':
      return {
        mode: 'color', colorPrecision: colorCount,
        filterSpeckle: 4, pathOverlap: 0, optTolerance: 0.2, turdSize: 2, alphaMax: 1.0,
      };
  }
}

export function buildMaskConfig(removeBg: boolean): MaskConfig {
  return removeBg
    ? { mode: 'solid-color', alphaThreshold: 128, colorTolerance: 20, borderOnly: true }
    : { mode: 'none', alphaThreshold: 128 };
}
