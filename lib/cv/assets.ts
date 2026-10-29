'use client';

// Where the MediaPipe runtime and models are loaded from.
//
// scripts/fetch-mediapipe.mjs puts both under public/mediapipe/, so normally
// everything comes from this app's own origin. The remote URLs are only a
// fallback for a model that couldn't be downloaded at build time.
import { FilesetResolver } from '@mediapipe/tasks-vision';

type WasmFileset = Awaited<ReturnType<typeof FilesetResolver.forVisionTasks>>;

const LOCAL_BASE = '/mediapipe';

export const MODELS = {
  selfieSegmenter: {
    local: `${LOCAL_BASE}/models/selfie_segmenter.tflite`,
    remote:
      'https://storage.googleapis.com/mediapipe-models/image_segmenter/selfie_segmenter/float16/latest/selfie_segmenter.tflite',
  },
  faceLandmarker: {
    local: `${LOCAL_BASE}/models/face_landmarker.task`,
    remote:
      'https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/latest/face_landmarker.task',
  },
} as const;

let filesetPromise: Promise<WasmFileset> | null = null;

/** The WASM runtime, shared by every task. Always self-hosted, so it matches the JS package version. */
export function getVisionFileset(): Promise<WasmFileset> {
  filesetPromise ??= FilesetResolver.forVisionTasks(`${LOCAL_BASE}/wasm`);
  return filesetPromise;
}

/** The local model path if it was fetched at build time, otherwise the remote one. */
export async function resolveModel(model: { local: string; remote: string }): Promise<string> {
  try {
    const res = await fetch(model.local, { method: 'HEAD' });
    if (res.ok) return model.local;
  } catch {
    // fall through
  }
  console.warn(`[photobooth] ${model.local} not found, loading the model from Google`);
  return model.remote;
}
