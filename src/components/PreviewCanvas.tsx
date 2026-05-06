import { useState, useRef, useCallback, useEffect } from 'react';
import { Layers, FileText, Maximize2, Move, RotateCcw, ZoomIn, ZoomOut } from 'lucide-react';

type ViewMode = 'original' | 'svg' | 'split';

interface PreviewCanvasProps {
  originalFile: File;
  svgString: string;
  svgWidth: number;
  svgHeight: number;
}

export default function PreviewCanvas({ originalFile, svgString, svgWidth, svgHeight }: PreviewCanvasProps) {
  const [viewMode, setViewMode] = useState<ViewMode>('split');
  const [splitPos, setSplitPos] = useState(50);
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const containerRef = useRef<HTMLDivElement>(null);
  const dragging = useRef(false);
  const panning = useRef(false);
  const lastPoint = useRef({ x: 0, y: 0 });

  const originalUrl = URL.createObjectURL(originalFile);
  const svgBlob = new Blob([svgString], { type: 'image/svg+xml' });
  const svgUrl = URL.createObjectURL(svgBlob);

  const pathCount = (svgString.match(/<path/g) || []).length;
  const sizeKB = Math.round(svgString.length / 1024);

  const clampZoom = (value: number) => Math.max(1, Math.min(6, value));
  const setZoomLevel = useCallback((next: number) => {
    const value = clampZoom(next);
    setZoom(value);
    if (value === 1) setPan({ x: 0, y: 0 });
  }, []);

  const resetView = useCallback(() => { setZoom(1); setPan({ x: 0, y: 0 }); }, []);
  const handlePointerDown = useCallback((e: React.PointerEvent) => { e.stopPropagation(); dragging.current = true; }, []);
  const handleCanvasPointerDown = useCallback((e: React.PointerEvent) => {
    if (zoom <= 1) return;
    panning.current = true;
    lastPoint.current = { x: e.clientX, y: e.clientY };
  }, [zoom]);
  const _handlePointerUp = useCallback(() => { dragging.current = false; }, []);
  const handlePointerMove = useCallback((e: React.PointerEvent) => {
    if (dragging.current && containerRef.current) {
      const rect = containerRef.current.getBoundingClientRect();
      const x = ((e.clientX - rect.left) / rect.width) * 100;
      setSplitPos(Math.max(5, Math.min(95, x)));
      return;
    }
    if (!panning.current) return;
    const dx = e.clientX - lastPoint.current.x;
    const dy = e.clientY - lastPoint.current.y;
    lastPoint.current = { x: e.clientX, y: e.clientY };
    setPan((prev) => ({ x: prev.x + dx, y: prev.y + dy }));
  }, []);

  const handleWheel = useCallback((e: React.WheelEvent) => {
    e.preventDefault();
    setZoomLevel(zoom + (e.deltaY < 0 ? 0.25 : -0.25));
  }, [setZoomLevel, zoom]);

  useEffect(() => {
    const up = () => { dragging.current = false; panning.current = false; };
    window.addEventListener('pointerup', up);
    return () => window.removeEventListener('pointerup', up);
  }, []);

  const imageTransform = {
    transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
    transformOrigin: 'center',
  };

  const viewButtons: { mode: ViewMode; label: string }[] = [
    { mode: 'original', label: 'Original' },
    { mode: 'svg', label: 'SVG' },
    { mode: 'split', label: 'Split' },
  ];

  return (
    <div className="bg-card rounded-xl border border-border overflow-hidden">
      {/* Canvas area */}
      <div
        ref={containerRef}
        className="checkerboard relative overflow-hidden select-none"
        style={{ aspectRatio: `${svgWidth} / ${svgHeight}`, maxHeight: 420 }}
        onPointerDown={handleCanvasPointerDown}
        onPointerMove={handlePointerMove}
        onWheel={handleWheel}
      >
        {/* Original layer */}
        {(viewMode === 'original' || viewMode === 'split') && (
          <img
            src={originalUrl}
            alt="Original"
            className={`absolute inset-0 w-full h-full object-contain ${zoom > 1 ? 'cursor-grab' : ''}`}
            style={viewMode === 'split' ? { ...imageTransform, clipPath: `inset(0 ${100 - splitPos}% 0 0)` } : imageTransform}
            draggable={false}
          />
        )}
        {/* SVG layer */}
        {(viewMode === 'svg' || viewMode === 'split') && (
          <img
            src={svgUrl}
            alt="SVG result"
            className={`absolute inset-0 w-full h-full object-contain ${zoom > 1 ? 'cursor-grab' : ''}`}
            style={viewMode === 'split' ? { ...imageTransform, clipPath: `inset(0 0 0 ${splitPos}%)` } : imageTransform}
            draggable={false}
          />
        )}
        {/* Split handle */}
        {viewMode === 'split' && (
          <div
            className="absolute top-0 bottom-0 w-0.5 bg-foreground/50 cursor-col-resize z-10"
            style={{ left: `${splitPos}%` }}
            onPointerDown={handlePointerDown}
          >
            <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-6 h-6 rounded-full bg-foreground/80 border-2 border-background flex items-center justify-center">
              <Maximize2 className="w-3 h-3 text-background" />
            </div>
          </div>
        )}
      </div>

      {/* Controls */}
      <div className="p-4 space-y-3 border-t border-border">
        {/* View mode toggle */}
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

        <div className="flex items-center gap-2">
          <button type="button" onClick={() => setZoomLevel(zoom - 0.25)} className="w-9 h-9 rounded-md bg-secondary text-muted-foreground hover:text-foreground flex items-center justify-center" aria-label="Zoom out"><ZoomOut className="w-4 h-4" /></button>
          <div className="flex-1 h-9 rounded-md bg-secondary text-xs font-medium text-muted-foreground flex items-center justify-center gap-2"><Move className="w-3.5 h-3.5" />{Math.round(zoom * 100)}%</div>
          <button type="button" onClick={() => setZoomLevel(zoom + 0.25)} className="w-9 h-9 rounded-md bg-secondary text-muted-foreground hover:text-foreground flex items-center justify-center" aria-label="Zoom in"><ZoomIn className="w-4 h-4" /></button>
          <button type="button" onClick={resetView} className="w-9 h-9 rounded-md bg-secondary text-muted-foreground hover:text-foreground flex items-center justify-center" aria-label="Reset view"><RotateCcw className="w-4 h-4" /></button>
        </div>

        {/* Metadata */}
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
        </div>
      </div>
    </div>
  );
}
