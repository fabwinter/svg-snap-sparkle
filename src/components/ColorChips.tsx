import { useEffect, useRef, useState } from 'react';
import { Plus, X } from 'lucide-react';

interface ColorChipsProps {
  colors: string[]; // hex strings
  onChange: (next: string[]) => void;
  detectedCount: number;
}

export default function ColorChips({ colors, onChange, detectedCount }: ColorChipsProps) {
  const [pickerOpen, setPickerOpen] = useState(false);
  const [draft, setDraft] = useState('#888888');
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (pickerOpen) {
      // Open native picker as soon as we mount the input
      requestAnimationFrame(() => inputRef.current?.click());
    }
  }, [pickerOpen]);

  const remove = (idx: number) => {
    onChange(colors.filter((_, i) => i !== idx));
  };

  const add = (hex: string) => {
    if (!colors.includes(hex.toLowerCase())) {
      onChange([...colors, hex.toLowerCase()]);
    }
    setPickerOpen(false);
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
          Detected colours
        </label>
        <span className="text-xs font-medium bg-primary/15 text-primary px-2 py-0.5 rounded-full">
          {colors.length} of {detectedCount} requested
        </span>
      </div>
      <div className="flex flex-wrap gap-2">
        {colors.map((hex, i) => (
          <div key={`${hex}-${i}`} className="relative group">
            <div
              className="w-9 h-9 rounded-md border border-border shadow-sm"
              style={{ backgroundColor: hex }}
              title={hex}
            />
            <button
              type="button"
              onClick={() => remove(i)}
              aria-label={`Remove ${hex}`}
              className="absolute -top-1.5 -right-1.5 w-4 h-4 rounded-full bg-foreground text-background flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
            >
              <X className="w-2.5 h-2.5" />
            </button>
          </div>
        ))}

        <button
          type="button"
          onClick={() => setPickerOpen(true)}
          aria-label="Add colour"
          className="w-9 h-9 rounded-md border border-dashed border-border text-muted-foreground hover:text-foreground hover:border-foreground/40 transition-colors flex items-center justify-center"
        >
          <Plus className="w-4 h-4" />
        </button>

        {pickerOpen && (
          <input
            ref={inputRef}
            type="color"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onBlur={() => add(draft)}
            className="w-0 h-0 opacity-0 absolute"
          />
        )}
      </div>
    </div>
  );
}
