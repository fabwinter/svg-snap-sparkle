import { Download, RotateCcw } from 'lucide-react';

interface ActionBarProps {
  svgString: string;
  originalFilename: string;
  onRerun: () => void;
}

export default function ActionBar({ svgString, originalFilename, onRerun }: ActionBarProps) {
  const handleDownload = () => {
    const blob = new Blob([svgString], { type: 'image/svg+xml;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = originalFilename.replace(/\.[^.]+$/, '') + '.svg';
    a.rel = 'noopener';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  return (
    <div className="flex gap-3">
      <button
        onClick={handleDownload}
        className="flex-1 py-3 rounded-lg font-medium text-sm bg-primary text-primary-foreground hover:bg-primary/90 transition-all flex items-center justify-center gap-2 shadow-lg shadow-primary/20"
      >
        <Download className="w-4 h-4" />
        Download SVG
      </button>
      <button
        onClick={onRerun}
        className="flex-1 py-3 rounded-lg font-medium text-sm bg-secondary text-foreground hover:bg-secondary/80 transition-all flex items-center justify-center gap-2"
      >
        <RotateCcw className="w-4 h-4" />
        Re-run
      </button>
    </div>
  );
}
