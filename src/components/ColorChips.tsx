import { useState } from 'react';
import { Pipette, Search, X, Plus } from 'lucide-react';

interface ColorChipsProps {
  colors: string[]; // hex strings
  onChange: (next: string[]) => void;
  detectedCount: number;
}

export default function ColorChips({ colors, onChange, detectedCount }: ColorChipsProps) {
  const [activeIndex, setActiveIndex] = useState(0);
  const [search, setSearch] = useState('');

  const slots = Array.from({ length: detectedCount }, (_, i) => colors[i] || '');

  const commitSlot = (idx: number, hex: string) => {
    const next = [...slots];
    next[idx] = hex.toLowerCase();
    onChange(next);
  };

  const remove = (idx: number) => {
    const next = [...slots];
    next[idx] = '';
    onChange(next);
  };

  const pickWithEyeDropper = async () => {
    const EyeDropperCtor = (window as unknown as {
      EyeDropper?: new () => { open: () => Promise<{ sRGBHex: string }> };
    }).EyeDropper;
    if (!EyeDropperCtor) return;
    try {
      const result = await new EyeDropperCtor().open();
      commitSlot(activeIndex, result.sRGBHex);
    } catch {
      /* user cancelled */
    }
  };

  const updateSearch = (value: string) => {
    setSearch(value);
    const hex = value.trim();
    if (/^#[0-9a-fA-F]{6}$/.test(hex)) commitSlot(activeIndex, hex);
  };

  const hasEyeDropper = typeof window !== 'undefined' && 'EyeDropper' in window;

  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
          Detected colours
        </label>
        <span className="text-xs font-medium bg-primary/15 text-primary px-2 py-0.5 rounded-full">
          {slots.filter(Boolean).length} of {detectedCount} requested
        </span>
      </div>
      <div className="flex gap-2 mb-3">
        <div className="relative flex-1">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
          <input
            value={search}
            onChange={(e) => updateSearch(e.target.value)}
            placeholder="#7f56ff"
            className="w-full h-9 rounded-md bg-secondary text-foreground placeholder:text-muted-foreground border border-border pl-8 pr-3 text-sm outline-none focus:ring-2 focus:ring-ring"
          />
        </div>
        {hasEyeDropper && (
          <button
            type="button"
            onClick={pickWithEyeDropper}
            aria-label="Pick colour from image"
            className="w-9 h-9 rounded-md bg-secondary text-muted-foreground hover:text-foreground border border-border transition-colors flex items-center justify-center"
          >
            <Pipette className="w-4 h-4" />
          </button>
        )}
      </div>

      <div className="flex flex-wrap gap-2">
        {slots.map((hex, i) => (
          <div key={i} className="relative group">
            <div
              className={`relative w-9 h-9 rounded-md border shadow-sm transition-all flex items-center justify-center overflow-hidden ${i === activeIndex ? 'border-primary ring-2 ring-primary/30' : 'border-border'} ${hex ? '' : 'border-dashed bg-secondary text-muted-foreground'}`}
              style={hex ? { backgroundColor: hex } : undefined}
              title={hex || 'Add colour'}
            >
              {!hex && <Plus className="w-4 h-4 pointer-events-none" />}
              {/* Native colour input overlays the chip so the picker opens reliably on every platform */}
              <input
                type="color"
                value={hex || '#888888'}
                onClick={() => setActiveIndex(i)}
                onChange={(e) => commitSlot(i, e.target.value)}
                aria-label={hex ? `Change ${hex}` : `Add colour ${i + 1}`}
                className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
              />
            </div>
            {hex && (
              <button
                type="button"
                onClick={(e) => { e.stopPropagation(); remove(i); }}
                aria-label={`Remove ${hex}`}
                className="absolute -top-1.5 -right-1.5 w-4 h-4 rounded-full bg-foreground text-background flex items-center justify-center opacity-100 sm:opacity-0 group-hover:opacity-100 transition-opacity z-10"
              >
                <X className="w-2.5 h-2.5" />
              </button>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
