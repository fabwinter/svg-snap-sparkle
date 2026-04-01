import { PRESETS, PresetType } from '@/types/preset';
import { Slider } from '@/components/ui/slider';
import { Checkbox } from '@/components/ui/checkbox';
import { ArrowRight } from 'lucide-react';

interface SettingsPanelProps {
  preset: PresetType;
  colorCount: number;
  removeBg: boolean;
  hasImage: boolean;
  onPresetChange: (p: PresetType) => void;
  onColorCountChange: (n: number) => void;
  onRemoveBgChange: (v: boolean) => void;
  onConvert: () => void;
}

const presetKeys: PresetType[] = ['logo', 'clipart', 'illustration', 'photo'];

export default function SettingsPanel({
  preset, colorCount, removeBg, hasImage,
  onPresetChange, onColorCountChange, onRemoveBgChange, onConvert,
}: SettingsPanelProps) {
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
