'use client';

// Real-time person segmentation, powered by MediaPipe's Selfie Segmenter model.
// Runs entirely client-side (WASM/GPU delegate) — no photo data ever leaves
// the browser for this step, and the existing sharp-based server filters are
// untouched for color grading.
import { ImageSegmenter } from '@mediapipe/tasks-vision';
import { getVisionFileset, MODELS, resolveModel } from './assets';


export interface SegmentationMask {
  data: Float32Array;
  width: number;
  height: number;
}

let segmenterPromise: Promise<ImageSegmenter> | null = null;

async function createSegmenter(delegate: 'GPU' | 'CPU'): Promise<ImageSegmenter> {
  const [fileset, modelAssetPath] = await Promise.all([getVisionFileset(), resolveModel(MODELS.selfieSegmenter)]);
  return ImageSegmenter.createFromOptions(fileset, {
    baseOptions: { modelAssetPath, delegate },
    runningMode: 'VIDEO',
    outputCategoryMask: false,
    outputConfidenceMasks: true,
  });
}

// Loaded once per tab and reused — model init (~1-2s) is the expensive part,
// per-frame inference afterwards is cheap enough for a live preview.
//
// Some browsers (older mobile Safari/WebViews in particular) don't expose a
// working WebGL delegate, and `createFromOptions` rejects rather than
// degrading gracefully. Try GPU first for speed, and transparently fall back
// to the CPU delegate so the live effect still works, just a bit slower per
// frame.
export function getSegmenter(): Promise<ImageSegmenter> {
  if (!segmenterPromise) {
    segmenterPromise = createSegmenter('GPU').catch((err) => {
      console.warn('[photobooth] GPU segmenter init failed, retrying on CPU delegate', err);
      return createSegmenter('CPU');
    });
  }
  return segmenterPromise;
}

/**
 * Runs person segmentation on one video frame and returns a confidence mask
 * (0 = background, 1 = person). Caller owns the returned data; nothing here
 * needs to be closed since we copy out of the MPMask before returning.
 */
export function segmentVideoFrame(
  segmenter: ImageSegmenter,
  video: HTMLVideoElement,
  timestampMs: number
): SegmentationMask | null {
  const result = segmenter.segmentForVideo(video, timestampMs);
  const mask = result.confidenceMasks?.[0];
  if (!mask) return null;

  const data = mask.getAsFloat32Array();
  const { width, height } = mask;
  result.confidenceMasks?.forEach((m) => m.close());

  return { data, width, height };
}
