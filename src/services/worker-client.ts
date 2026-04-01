/**
 * WorkerClient wraps the tracing pipeline.
 * Currently runs in main thread; can be moved to a Web Worker.
 */
import { TraceConfig, MaskConfig, CleanupConfig, ProgressCallback } from '@/types/pipeline';
import { traceImage } from './tracer';

export class WorkerClient {
  private aborted = false;

  async process(
    imageData: ImageData,
    maskConfig: MaskConfig,
    cleanupConfig: CleanupConfig,
    traceConfig: TraceConfig,
    callbacks: ProgressCallback
  ): Promise<string> {
    this.aborted = false;
    return traceImage(imageData, maskConfig, cleanupConfig, traceConfig, callbacks);
  }

  terminate() {
    this.aborted = true;
  }
}
