import { PRESETS, PresetType } from '@/types/preset';
import { Slider } from '@/components/ui/slider';
import { Checkbox } from '@/components/ui/checkbox';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { ArrowRight, Settings2, ChevronDown } from 'lucide-react';
import { useState } from 'react';
import ColorChips from './ColorChips';

export interface AdvancedSettings {
  turdSize: number;
  alphaMax: number;
  optTolerance: number;
  filterSpeckle: number;
  pathOverlap: number;
}

interface SettingsPanelProps {
  preset: PresetType;
  colorCount: number;
  removeBg: boolean;
  hasImage: boolean;
  advanced: AdvancedSettings;
  palette: string[];
  onPresetChange: (p: PresetType) => void;
  onColorCountChange: (n: number) => void;
  onRemoveBgChange: (v: boolean) => void;
  onAdvancedChange: (a: AdvancedSettings) => void;
  onPaletteChange: (next: string[]) => void;
  onConvert: () => void;
}

const presetKeys: PresetType[] = ['logo', 'clipart', 'illustration', 'photo'];

const ADVANCED_FIELDS: {
  key: keyof AdvancedSettings;
  label: string;
  description: string;
  min: number;
  max: number;
  step: number;
  presets?: PresetType[]; // only show for these presets; undefined = all
}[] = [
  {
    key: 'turdSize',
    label: 'Noise suppression',
    description: 'Ignore areas smaller than this (px²)',
    min: 0, max: 20, step: 1,
  },
  {
    key: 'optTolerance',
    label: 'Curve tolerance',
    description: 'Higher = smoother curves, less detail',
    min: 0, max: 1, step: 0.05,
  },
  {
    key: 'alphaMax',
    label: 'Corner threshold',
    description: 'Controls sharpness of corners',
    min: 0, max: 1.4, step: 0.1,
  },
  {
    key: 'filterSpeckle',
    label: 'Speckle filter',
    description: 'Remove small disconnected shapes',
    min: 0, max: 20, step: 1,
    presets: ['clipart', 'illustration', 'photo'],
  },
  {
    key: 'pathOverlap',
    label: 'Path overlap',
    description: 'Dilation passes to eliminate seams between layers',
    min: 0, max: 8, step: 1,
    presets: ['logo', 'clipart', 'illustration', 'photo'],
  },
];

export default function SettingsPanel({
  preset, colorCount, removeBg, hasImage, advanced, palette,
  onPresetChange, onColorCountChange, onRemoveBgChange, onAdvancedChange,
  onPaletteChange, onConvert,
}: SettingsPanelProps) {
  const [open, setOpen] = useState(false);

  const visibleFields = ADVANCED_FIELDS.filter(
    (f) => !f.presets || f.presets.includes(preset)
  );

  const updateField = (key: keyof AdvancedSettings, value: number) => {
    onAdvancedChange({ ...advanced, [key]: value });
  };

  return (
    <div className="bg-card rounded-xl border border-border p-6 space-y-6">
      {/* Preset pills */}
      <div>
        <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-3 block">
          Image type
        </label>
        <div className="flex gap-2">
          {presetKeys.map((key) => (
            <button
              key={key}
              onClick={() => onPresetChange(key)}
              className={`
                px-4 py-2 rounded-lg text-sm font-medium transition-all
                ${preset === key
                  ? 'bg-primary text-primary-foreground shadow-md shadow-primary/25'
                  : 'bg-secondary text-muted-foreground hover:text-foreground hover:bg-secondary/80'}
              `}
            >
              {PRESETS[key].label}
            </button>
          ))}
        </div>
      </div>

      {/* Color count slider */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
            Number of colours
          </label>
          <span className="text-xs font-medium bg-primary/15 text-primary px-2 py-0.5 rounded-full">
            {colorCount}
          </span>
        </div>
        <Slider
          min={2}
          max={32}
          step={1}
          value={[colorCount]}
          onValueChange={([v]) => onColorCountChange(v)}
        />
      </div>

      {/* Detected colour chips */}
      {hasImage && palette.length > 0 && (
        <ColorChips
          colors={palette}
          onChange={onPaletteChange}
          detectedCount={colorCount}
        />
      )}

      {/* Remove bg */}
      <label className="flex items-center gap-3 cursor-pointer group">
        <Checkbox
          checked={removeBg}
          onCheckedChange={(v) => onRemoveBgChange(v === true)}
        />
        <span className="text-sm text-muted-foreground group-hover:text-foreground transition-colors">
          Remove background before vectorising
        </span>
      </label>

      {/* Advanced settings */}
      <Collapsible open={open} onOpenChange={setOpen}>
        <CollapsibleTrigger className="flex items-center gap-2 text-xs font-medium text-muted-foreground hover:text-foreground transition-colors w-full">
          <Settings2 className="w-3.5 h-3.5" />
          Advanced settings
          <ChevronDown className={`w-3.5 h-3.5 ml-auto transition-transform duration-200 ${open ? 'rotate-180' : ''}`} />
        </CollapsibleTrigger>
        <CollapsibleContent className="pt-4 space-y-4">
          {visibleFields.map((field) => (
            <div key={field.key}>
              <div className="flex items-center justify-between mb-1.5">
                <label className="text-xs font-medium text-muted-foreground">
                  {field.label}
                </label>
                <span className="text-xs font-medium bg-secondary text-muted-foreground px-2 py-0.5 rounded-full">
                  {field.step < 1 ? advanced[field.key].toFixed(2) : advanced[field.key]}
                </span>
              </div>
              <Slider
                min={field.min}
                max={field.max}
                step={field.step}
                value={[advanced[field.key]]}
                onValueChange={([v]) => updateField(field.key, v)}
              />
              <p className="text-[10px] text-muted-foreground/60 mt-1">{field.description}</p>
            </div>
          ))}
        </CollapsibleContent>
      </Collapsible>

      {/* Convert button */}
      <button
        onClick={onConvert}
        disabled={!hasImage}
        className="
          w-full py-3 rounded-lg font-medium text-sm
          bg-primary text-primary-foreground
          hover:bg-primary/90 transition-all
          disabled:opacity-40 disabled:cursor-not-allowed
          flex items-center justify-center gap-2
          shadow-lg shadow-primary/20
        "
      >
        Convert to SVG
        <ArrowRight className="w-4 h-4" />
      </button>
    </div>
  );
}
