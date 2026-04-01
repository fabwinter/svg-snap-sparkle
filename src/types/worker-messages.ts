import type { MaskConfig, CleanupConfig, TraceConfig } from '../types/pipeline';

// ── Main → Worker ──────────────────────────────────────────────────
export type WorkerRequest =
  | { type: 'init' }
  | { type: 'process'; payload: WorkerProcessPayload }
  | { type: 'cancel' };

export interface WorkerProcessPayload {
  imageBuffer: ArrayBuffer;
  width: number;
  height: number;
  mask: MaskConfig;
  cleanup: CleanupConfig;
  trace: TraceConfig;
}

// ── Worker → Main ──────────────────────────────────────────────────
export type WorkerResponse =
  | { type: 'ready' }
  | { type: 'progress'; stage: string; percent: number }
  | { type: 'result'; svgString: string; width: number; height: number }
  | { type: 'error'; message: string };
