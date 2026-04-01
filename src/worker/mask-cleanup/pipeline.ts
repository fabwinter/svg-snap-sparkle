/**
 * Full mask cleanup pipeline.
 */

import type { CleanupConfig } from '../../types/pipeline';
import { morphOpen, morphClose } from './morphology';
import { removeSmallComponents } from './connected-components';
import { fillSmallHoles } from './hole-filling';
import { smoothEdges } from './edge-processing';

export interface CleanupProgress {
  (stage: string, percent: number): void;
}

export function cleanupMask(
  rawMask: Uint8Array,
  w: number,
  h: number,
  config: CleanupConfig,
  onProgress?: CleanupProgress,
): Uint8Array {
  let mask = rawMask;

  onProgress?.('Morphological open', 10);
  mask = morphOpen(mask, w, h, config.morphOpenRadius);

  onProgress?.('Removing specks', 30);
  mask = removeSmallComponents(mask, w, h, config.speckAreaThreshold);

  if (config.fillHoles) {
    onProgress?.('Filling holes', 50);
    mask = fillSmallHoles(mask, w, h, config.holeAreaThreshold);
  }

  onProgress?.('Morphological close', 70);
  mask = morphClose(mask, w, h, config.morphCloseRadius);

  if (config.smoothEdges) {
    onProgress?.('Smoothing edges', 85);
    mask = smoothEdges(mask, w, h, 2, config.finalAlphaThreshold);
  }

  onProgress?.('Mask cleanup complete', 100);
  return mask;
}
