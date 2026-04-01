/**
 * Web Worker entry point for the processing pipeline.
 */

import type { WorkerRequest, WorkerResponse } from '../types/worker-messages';
import { initEngines, runPipeline } from './dispatcher';

function post(msg: WorkerResponse, transfer?: Transferable[]): void {
  self.postMessage(msg, { transfer: transfer ?? [] });
}

let initialized = false;
let cancelled = false;

self.onmessage = async (e: MessageEvent<WorkerRequest>) => {
  const msg = e.data;

  switch (msg.type) {
    case 'init': {
      try {
        await initEngines();
        initialized = true;
        post({ type: 'ready' });
      } catch (err) {
        post({ type: 'error', message: `Init failed: ${(err as Error).message}` });
      }
      break;
    }

    case 'cancel': {
      cancelled = true;
      break;
    }

    case 'process': {
      if (!initialized) {
        try {
          await initEngines();
          initialized = true;
        } catch (err) {
          post({ type: 'error', message: `Init failed: ${(err as Error).message}` });
          return;
        }
      }

      cancelled = false;
      const { imageBuffer, width, height, mask, cleanup, trace } = msg.payload;
      // Ensure a clean typed array with byteOffset === 0
      const rawView = new Uint8ClampedArray(imageBuffer);
      const rgba = rawView.byteOffset === 0 && rawView.byteLength === rawView.buffer.byteLength
        ? rawView
        : new Uint8ClampedArray(rawView.slice());

      try {
        console.log('[worker] Starting pipeline, image:', width, 'x', height, 'buffer len:', rgba.length, 'byteOffset:', rgba.byteOffset);
        const svgString = await runPipeline(rgba, width, height, mask, cleanup, trace, {
          onProgress(stage, percent) {
            if (cancelled) throw new Error('Cancelled');
            console.log('[worker] Progress:', stage, percent);
            post({ type: 'progress', stage, percent });
          },
        });

        console.log('[worker] Pipeline complete, SVG length:', svgString?.length);
        if (!cancelled) {
          post({ type: 'result', svgString, width, height });
        }
      } catch (err) {
        const message = (err as Error).message;
        const stack = (err as Error).stack;
        console.error('[worker] Pipeline error:', message, stack);
        if (message !== 'Cancelled') {
          post({ type: 'error', message });
        }
      }
      break;
    }
  }
};
