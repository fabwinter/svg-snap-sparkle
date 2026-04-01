import { Progress } from '@/components/ui/progress';
import { AlertCircle } from 'lucide-react';

interface ProcessingStateProps {
  stage: string;
  percent: number;
  error: string | null;
  onRetry: () => void;
}

export default function ProcessingState({ stage, percent, error, onRetry }: ProcessingStateProps) {
  if (error) {
    return (
      <div className="bg-card rounded-xl border border-destructive/30 p-6 space-y-4">
        <div className="flex items-center gap-3 text-destructive">
          <AlertCircle className="w-5 h-5" />
          <p className="text-sm font-medium">Conversion failed</p>
        </div>
        <p className="text-sm text-muted-foreground">{error}</p>
        <button
          onClick={onRetry}
          className="px-4 py-2 rounded-lg text-sm font-medium bg-secondary text-foreground hover:bg-secondary/80 transition-colors"
        >
          Try again
        </button>
      </div>
    );
  }

  return (
    <div
      className="bg-card rounded-xl border border-border p-6 space-y-4"
      role="progressbar"
      aria-valuenow={percent}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-live="polite"
    >
      <p className="text-sm font-medium text-foreground">{stage}</p>
      <div className="relative">
        <Progress value={percent} className="h-2" />
        {percent === 0 && (
          <div className="absolute inset-0 rounded-full overflow-hidden progress-shimmer" />
        )}
      </div>
      <p className="text-xs text-muted-foreground">{percent}% complete</p>
    </div>
  );
}
