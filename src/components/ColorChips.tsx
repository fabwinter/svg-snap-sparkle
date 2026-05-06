import { useEffect, useMemo, useRef, useState } from 'react';
import { Pipette, Search, X } from 'lucide-react';

interface ColorChipsProps {
  colors: string[]; // hex strings
  onChange: (next: string[]) => void;
  detectedCount: number;
}

export default function ColorChips({ colors, onChange, detectedCount }: ColorChipsProps) {
  const [activeIndex, setActiveIndex] = useState(0);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [draft, setDraft] = useState('#888888');
  const [search, setSearch] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  const slots = useMemo(
    () => Array.from({ length: detectedCount }, (_, i) => colors[i] || ''),
    [colors, detectedCount],
  );

  const selectedIndex = Math.min(activeIndex, Math.max(0, detectedCount - 1));

  const commitSlot = (idx: number, hex: string) => {
    const next = [...slots];
    next[idx] = hex.toLowerCase();
    onChange(next);
  };

  useEffect(() => {
    if (pickerOpen) {
      // Open native picker as soon as we mount the input
      requestAnimationFrame(() => inputRef.current?.click());
    }
  }, [pickerOpen]);

  const remove = (idx: number) => {
    const next = [...slots];
    next[idx] = '';
    onChange(next);
  };

  const choose = (hex: string) => {
    commitSlot(selectedIndex, hex);
    setSearch(hex.toLowerCase());
    setPickerOpen(false);
  };

  const pickWithEyeDropper = async () => {
    const EyeDropperCtor = (window as unknown as {
      EyeDropper?: new () => { open: () => Promise<{ sRGBHex: string }> };
    }).EyeDropper;
    if (!EyeDropperCtor) {
      setPickerOpen(true);
      return;
    }
    const result = await new EyeDropperCtor().open();
    choose(result.sRGBHex);
  };

  const updateSearch = (value: string) => {
    setSearch(value);
    const hex = value.trim();
    if (/^#[0-9a-fA-F]{6}$/.test(hex)) choose(hex);
  };

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
        <button
          type="button"
          onClick={pickWithEyeDropper}
          aria-label="Pick colour from image"
          className="w-9 h-9 rounded-md bg-secondary text-muted-foreground hover:text-foreground border border-border transition-colors flex items-center justify-center"
        >
          <Pipette className="w-4 h-4" />
        </button>
      </div>

      <div className="flex flex-wrap gap-2">
        {slots.map((hex, i) => (
          <div key={`${i}-${hex || 'empty'}`} className="relative group">
            <button
              type="button"
              onClick={() => { setActiveIndex(i); setDraft(hex || draft); setPickerOpen(true); }}
              aria-label={hex ? `Change ${hex}` : `Add colour ${i + 1}`}
              className={`w-9 h-9 rounded-md border shadow-sm transition-all ${i === selectedIndex ? 'border-primary ring-2 ring-primary/30' : 'border-border'} ${hex ? '' : 'border-dashed bg-secondary text-muted-foreground'}`}
              style={hex ? { backgroundColor: hex } : undefined}
              title={hex || 'Add colour'}
            >
              {!hex && '+'}
            </button>
            {hex && (
              <button
                type="button"
                onClick={() => remove(i)}
                aria-label={`Remove ${hex}`}
                className="absolute -top-1.5 -right-1.5 w-4 h-4 rounded-full bg-foreground text-background flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
              >
                <X className="w-2.5 h-2.5" />
              </button>
            )}
          </div>
        ))}

        {pickerOpen && (
          <input
            ref={inputRef}
            type="color"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onBlur={() => choose(draft)}
            className="w-0 h-0 opacity-0 absolute"
          />
        )}
      </div>
    </div>
  );
}
