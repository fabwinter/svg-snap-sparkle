/**
 * Main-thread client for the processing worker.
 * Provides a promise-based API with progress callbacks.
 */

import type { WorkerRequest, WorkerProcessPayload, WorkerResponse } from '../types/worker-messages';
import type { MaskConfig, CleanupConfig, TraceConfig, ProgressCallback } from '../types/pipeline';

export class WorkerClient {
  private worker!: Worker;
  private readyPromise!: Promise<void>;

  constructor() {
    this.spawnWorker();
  }

  /** Create (or recreate) the worker and wait for it to initialize. */
  private spawnWorker(): void {
    this.worker = new Worker(
      new URL('../worker/processing.worker.ts', import.meta.url),
      { type: 'module' },
    );

    this.readyPromise = new Promise<void>((resolve, reject) => {
      const handler = (e: MessageEvent<WorkerResponse>) => {
        if (e.data.type === 'ready') {
          this.worker.removeEventListener('message', handler);
          resolve();
        } else if (e.data.type === 'error') {
          this.worker.removeEventListener('message', handler);
          reject(new Error(e.data.message));
        }
      };
      this.worker.addEventListener('message', handler);
      this.worker.postMessage({ type: 'init' } as WorkerRequest);
    });
  }

  async waitReady(): Promise<void> {
    return this.readyPromise;
  }

  /** Terminate the current worker and spawn a fresh one. */
  reset(): void {
    this.worker.terminate();
    this.spawnWorker();
  }

  async process(
    imageData: ImageData,
    mask: MaskConfig,
    cleanup: CleanupConfig,
    trace: TraceConfig,
    callbacks?: ProgressCallback,
  ): Promise<{ svgString: string; width: number; height: number }> {
    await this.readyPromise;

    return new Promise((resolve, reject) => {
      const handler = (e: MessageEvent<WorkerResponse>) => {
        const msg = e.data;
        switch (msg.type) {
          case 'progress':
            callbacks?.onProgress?.(msg.stage, msg.percent);
            break;

          case 'result':
            this.worker.removeEventListener('message', handler);
            resolve({ svgString: msg.svgString, width: msg.width, height: msg.height });
            break;

          case 'error':
            this.worker.removeEventListener('message', handler);
            reject(new Error(msg.message));
            break;
        }
      };

      this.worker.addEventListener('message', handler);

      // Transfer the pixel buffer (zero-copy) — handle potential byteOffset
      const srcData = imageData.data;
      const buffer = srcData.buffer.slice(srcData.byteOffset, srcData.byteOffset + srcData.byteLength);
      const payload: WorkerProcessPayload = {
        imageBuffer: buffer,
        width: imageData.width,
        height: imageData.height,
        mask,
        cleanup,
        trace,
      };

      this.worker.postMessage({ type: 'process', payload } as WorkerRequest, [buffer]);
    });
  }

  cancel(): void {
    this.worker.postMessage({ type: 'cancel' } as WorkerRequest);
  }

  terminate(): void {
    this.worker.terminate();
  }
}
