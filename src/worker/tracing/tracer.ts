/**
 * Common tracer interface.
 */
import type { TraceConfig } from '../../types/pipeline';
import type { WorkerImageData } from '../image-utils';

export interface ITracer {
  trace(image: WorkerImageData, config: TraceConfig): Promise<string>;
}
