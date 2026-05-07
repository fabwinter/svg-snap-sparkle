import { useState, useRef, useCallback, useEffect } from 'react';
import { Layers, FileText, Maximize2, ZoomIn, ZoomOut, RotateCcw } from 'lucide-react';

type ViewMode = 'original' | 'svg' | 'split';

interface PreviewCanvasProps {
  originalFile: File;
  svgString: string;
  svgWidth: number;
  svgHeight: number;
}

const MIN_ZOOM = 1;
const MAX_ZOOM = 8;

export default function PreviewCanvas({ originalFile, svgString, svgWidth, svgHeight }: PreviewCanvasProps) {
  const [viewMode, setViewMode] = useState<ViewMode>('split');
  const [splitPos, setSplitPos] = useState(50);
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const containerRef = useRef<HTMLDivElement>(null);
  const splitDragging = useRef(false);

  // Touch/pointer state for pan + pinch
  const pointers = useRef<Map<number, { x: number; y: number }>>(new Map());
  const pinchStart = useRef<{ dist: number; zoom: number; midX: number; midY: number; pan: { x: number; y: number } } | null>(null);
  const panStart = useRef<{ x: number; y: number; pan: { x: number; y: number } } | null>(null);

  const originalUrl = URL.createObjectURL(originalFile);
  const svgBlob = new Blob([svgString], { type: 'image/svg+xml' });
  const svgUrl = URL.createObjectURL(svgBlob);

  const pathCount = (svgString.match(/<path/g) || []).length;
  const sizeKB = Math.round(svgString.length / 1024);

  const resetView = useCallback(() => {
    setZoom(1);
    setPan({ x: 0, y: 0 });
  }, []);

  // Reset zoom whenever the source SVG/file changes
  useEffect(() => { resetView(); }, [svgString, originalFile, resetView]);

  const clampPan = useCallback((p: { x: number; y: number }, z: number) => {
    if (!containerRef.current) return p;
    const rect = containerRef.current.getBoundingClientRect();
    const maxX = (rect.width * (z - 1)) / 2;
    const maxY = (rect.height * (z - 1)) / 2;
    return {
      x: Math.max(-maxX, Math.min(maxX, p.x)),
      y: Math.max(-maxY, Math.min(maxY, p.y)),
    };
  }, []);

  const handleSplitPointerDown = useCallback((e: React.PointerEvent) => {
    e.stopPropagation();
    e.preventDefault();
    splitDragging.current = true;
  }, []);

  const handleSplitPointerMove = useCallback((e: PointerEvent) => {
    if (!splitDragging.current || !containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width) * 100;
    setSplitPos(Math.max(5, Math.min(95, x)));
  }, []);

  useEffect(() => {
    const up = () => { splitDragging.current = false; };
    window.addEventListener('pointerup', up);
    window.addEventListener('pointermove', handleSplitPointerMove);
    return () => {
      window.removeEventListener('pointerup', up);
      window.removeEventListener('pointermove', handleSplitPointerMove);
    };
  }, [handleSplitPointerMove]);

  // Pinch / pan handlers on the image stage
  const onPointerDown = (e: React.PointerEvent) => {
    (e.target as Element).setPointerCapture?.(e.pointerId);
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pointers.current.size === 2) {
      const [a, b] = Array.from(pointers.current.values());
      const dist = Math.hypot(a.x - b.x, a.y - b.y);
      pinchStart.current = {
        dist, zoom,
        midX: (a.x + b.x) / 2, midY: (a.y + b.y) / 2,
        pan: { ...pan },
      };
      panStart.current = null;
    } else if (pointers.current.size === 1 && zoom > 1) {
      panStart.current = { x: e.clientX, y: e.clientY, pan: { ...pan } };
    }
  };

  const onPointerMove = (e: React.PointerEvent) => {
    if (!pointers.current.has(e.pointerId)) return;
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });

    if (pointers.current.size === 2 && pinchStart.current) {
      const [a, b] = Array.from(pointers.current.values());
      const dist = Math.hypot(a.x - b.x, a.y - b.y);
      const nextZoom = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, pinchStart.current.zoom * (dist / pinchStart.current.dist)));
      setZoom(nextZoom);
      setPan((p) => clampPan(p, nextZoom));
    } else if (pointers.current.size === 1 && panStart.current && zoom > 1) {
      const dx = e.clientX - panStart.current.x;
      const dy = e.clientY - panStart.current.y;
      setPan(clampPan({ x: panStart.current.pan.x + dx, y: panStart.current.pan.y + dy }, zoom));
    }
  };

  const onPointerUp = (e: React.PointerEvent) => {
    pointers.current.delete(e.pointerId);
    if (pointers.current.size < 2) pinchStart.current = null;
    if (pointers.current.size === 0) panStart.current = null;
  };

  const onWheel = (e: React.WheelEvent) => {
    if (!e.ctrlKey && Math.abs(e.deltaY) < 20) return;
    e.preventDefault();
    const delta = -e.deltaY * 0.005;
    const next = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, zoom * (1 + delta)));
    setZoom(next);
    setPan((p) => clampPan(p, next));
  };

  const viewButtons: { mode: ViewMode; label: string }[] = [
    { mode: 'original', label: 'Original' },
    { mode: 'svg', label: 'SVG' },
    { mode: 'split', label: 'Split' },
  ];

  const transform = `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`;

  return (
    <div className="bg-card rounded-xl border border-border overflow-hidden">
      <div className="relative flex items-center justify-center bg-background/40">
        <div
          ref={containerRef}
          className="checkerboard relative overflow-hidden select-none touch-none mx-auto"
          style={{
            aspectRatio: `${svgWidth} / ${svgHeight}`,
            height: 320,
            maxWidth: '100%',
          }}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
          onWheel={onWheel}
        >
          <div
            className="absolute inset-0"
            style={{ transform, transformOrigin: 'center center', willChange: 'transform' }}
          >
            {(viewMode === 'original' || viewMode === 'split') && (
              <img
                src={originalUrl}
                alt="Original"
                className="absolute inset-0 w-full h-full object-contain"
                style={viewMode === 'split' ? { clipPath: `inset(0 ${100 - splitPos}% 0 0)` } : undefined}
                draggable={false}
              />
            )}
            {(viewMode === 'svg' || viewMode === 'split') && (
              <img
                src={svgUrl}
                alt="SVG result"
                className="absolute inset-0 w-full h-full object-contain"
                style={viewMode === 'split' ? { clipPath: `inset(0 0 0 ${splitPos}%)` } : undefined}
                draggable={false}
              />
            )}
          </div>

          {viewMode === 'split' && (
            <div
              className="absolute top-0 bottom-0 w-0.5 bg-foreground/50 cursor-col-resize z-10"
              style={{ left: `${splitPos}%` }}
              onPointerDown={handleSplitPointerDown}
            >
              <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-6 h-6 rounded-full bg-foreground/80 border-2 border-background flex items-center justify-center">
                <Maximize2 className="w-3 h-3 text-background" />
              </div>
            </div>
          )}
        </div>

        {/* Zoom controls — anchored to the right of the card, not the image */}
        <div className="absolute bottom-2 right-2 z-10 flex flex-col gap-1 bg-background/80 backdrop-blur rounded-md border border-border p-1 shadow-sm">
          <button
            type="button"
            aria-label="Zoom in"
            onClick={() => { const n = Math.min(MAX_ZOOM, zoom * 1.25); setZoom(n); setPan((p) => clampPan(p, n)); }}
            className="w-7 h-7 flex items-center justify-center text-muted-foreground hover:text-foreground"
          >
            <ZoomIn className="w-3.5 h-3.5" />
          </button>
          <button
            type="button"
            aria-label="Zoom out"
            onClick={() => { const n = Math.max(MIN_ZOOM, zoom / 1.25); setZoom(n); setPan((p) => clampPan(p, n)); }}
            className="w-7 h-7 flex items-center justify-center text-muted-foreground hover:text-foreground"
          >
            <ZoomOut className="w-3.5 h-3.5" />
          </button>
          <button
            type="button"
            aria-label="Reset view"
            onClick={resetView}
            className="w-7 h-7 flex items-center justify-center text-muted-foreground hover:text-foreground"
          >
            <RotateCcw className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      <div className="p-4 space-y-3 border-t border-border">
        <div className="flex gap-1 bg-secondary rounded-lg p-1">
          {viewButtons.map(({ mode, label }) => (
            <button
              key={mode}
              onClick={() => setViewMode(mode)}
              className={`
                flex-1 py-1.5 rounded-md text-xs font-medium transition-all
                ${viewMode === mode
                  ? 'bg-card text-foreground shadow-sm'
                  : 'text-muted-foreground hover:text-foreground'}
              `}
            >
              {label}
            </button>
          ))}
        </div>

        <div className="flex items-center gap-4 text-xs text-muted-foreground">
          <span className="flex items-center gap-1.5">
            <FileText className="w-3.5 h-3.5" />
            ≈ {sizeKB} KB
          </span>
          <span className="flex items-center gap-1.5">
            <Layers className="w-3.5 h-3.5" />
            {pathCount} paths
          </span>
          <span>{svgWidth} × {svgHeight}</span>
          {zoom !== 1 && <span className="ml-auto">{Math.round(zoom * 100)}%</span>}
        </div>
      </div>
    </div>
  );
}
