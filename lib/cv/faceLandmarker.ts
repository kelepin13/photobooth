'use client';

// Face landmark detection, powered by MediaPipe's Face Landmarker model.
// Reuses the same @mediapipe/tasks-vision dependency already pulled in for
// person segmentation, so face-anchored props (glasses/ears/hat) don't need
// a new package. Runs entirely client-side, same as the segmenter.
import { FaceLandmarker } from '@mediapipe/tasks-vision';
import { getVisionFileset, MODELS, resolveModel } from './assets';


let landmarkerPromise: Promise<FaceLandmarker> | null = null;

async function createLandmarker(delegate: 'GPU' | 'CPU'): Promise<FaceLandmarker> {
  const [fileset, modelAssetPath] = await Promise.all([getVisionFileset(), resolveModel(MODELS.faceLandmarker)]);
  return FaceLandmarker.createFromOptions(fileset, {
    baseOptions: { modelAssetPath, delegate },
    runningMode: 'VIDEO',
    numFaces: 1,
    outputFaceBlendshapes: false,
    outputFacialTransformationMatrixes: false,
  });
}

// Same GPU-first, CPU-fallback loading strategy as the segmenter — some
// browsers don't have a working WebGL delegate.
export function getFaceLandmarker(): Promise<FaceLandmarker> {
  if (!landmarkerPromise) {
    landmarkerPromise = createLandmarker('GPU').catch((err) => {
      console.warn('[photobooth] GPU face landmarker init failed, retrying on CPU delegate', err);
      return createLandmarker('CPU');
    });
  }
  return landmarkerPromise;
}

export interface FacePoint {
  x: number;
  y: number;
}

export interface FacePose {
  leftEyeOuter: FacePoint;
  rightEyeOuter: FacePoint;
  noseBridge: FacePoint;
  foreheadTop: FacePoint;
  /** Rough face width in source-video pixels — use to scale props. */
  faceWidthPx: number;
  /** Roll angle (radians) between the two outer eye corners. */
  rollRad: number;
}

// Indices into MediaPipe's 478-point canonical face mesh.
const LANDMARK = {
  leftEyeOuter: 33,
  rightEyeOuter: 263,
  noseBridge: 168,
  forehead: 10,
};

/**
 * Runs face landmark detection on one video frame and returns a handful of
 * points useful for placing simple props. Returns null if no face is
 * currently detected (caller should just skip drawing that frame).
 */
export function detectFacePose(
  landmarker: FaceLandmarker,
  video: HTMLVideoElement,
  timestampMs: number
): FacePose | null {
  const result = landmarker.detectForVideo(video, timestampMs);
  const points = result.faceLandmarks?.[0];
  if (!points || points.length === 0) return null;

  const w = video.videoWidth;
  const h = video.videoHeight;
  const at = (idx: number): FacePoint => ({ x: points[idx].x * w, y: points[idx].y * h });

  const leftEyeOuter = at(LANDMARK.leftEyeOuter);
  const rightEyeOuter = at(LANDMARK.rightEyeOuter);
  const eyeSpan = Math.hypot(rightEyeOuter.x - leftEyeOuter.x, rightEyeOuter.y - leftEyeOuter.y);

  return {
    leftEyeOuter,
    rightEyeOuter,
    noseBridge: at(LANDMARK.noseBridge),
    foreheadTop: at(LANDMARK.forehead),
    // Outer-eye-corner distance is roughly half the total face width.
    faceWidthPx: eyeSpan * 2.1,
    rollRad: Math.atan2(rightEyeOuter.y - leftEyeOuter.y, rightEyeOuter.x - leftEyeOuter.x),
  };
}
