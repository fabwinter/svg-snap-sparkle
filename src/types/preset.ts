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

export interface AdvancedDefaults {
  turdSize: number;
  alphaMax: number;
  optTolerance: number;
  filterSpeckle: number;
  pathOverlap: number;
}

const ADVANCED_DEFAULTS: Record<PresetType, AdvancedDefaults> = {
  logo:         { turdSize: 2, alphaMax: 1.0, optTolerance: 0.1, filterSpeckle: 4, pathOverlap: 2 },
  clipart:      { turdSize: 4, alphaMax: 1.0, optTolerance: 0.2, filterSpeckle: 0, pathOverlap: 4 },
  illustration: { turdSize: 4, alphaMax: 1.0, optTolerance: 0.2, filterSpeckle: 0, pathOverlap: 4 },
  photo:        { turdSize: 2, alphaMax: 1.0, optTolerance: 0.2, filterSpeckle: 4, pathOverlap: 0 },
};

export function getDefaultAdvanced(preset: PresetType): AdvancedDefaults {
  return { ...ADVANCED_DEFAULTS[preset] };
}

export function buildTraceConfig(
  preset: PresetType,
  colorCount: number,
  overrides?: Partial<AdvancedDefaults>,
): TraceConfig {
  const defaults = ADVANCED_DEFAULTS[preset];
  const adv = { ...defaults, ...overrides };
  return {
    mode: 'color',
    colorPrecision: colorCount,
    turdSize: adv.turdSize,
    alphaMax: adv.alphaMax,
    optTolerance: adv.optTolerance,
    filterSpeckle: adv.filterSpeckle,
    pathOverlap: adv.pathOverlap,
  };
}

export function buildMaskConfig(removeBg: boolean): MaskConfig {
  return removeBg
    ? { mode: 'solid-color', alphaThreshold: 128, colorTolerance: 20, borderOnly: true }
    : { mode: 'none', alphaThreshold: 128 };
}
