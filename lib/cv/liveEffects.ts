'use client';

import type { AiEffect, FaceProp } from '@/types/room';
import { getSegmenter, segmentVideoFrame, type SegmentationMask } from './segmenter';
import { getFaceLandmarker, detectFacePose, type FacePose } from './faceLandmarker';

const BLUR_PX = 22;
// The mask alpha is blurred (in the model's own low-res mask space, before
// it's scaled up) to soften the cutout edge — otherwise the hard 0/255
// confidence cutoff looks jagged/aliased against the background.
const MASK_FEATHER_PX = 3;
// A second, much wider feather used only to build a "ring" near the
// silhouette edge for the blur effect. MediaPipe's segmenter gives us a
// person/background confidence map, not real depth, so this is an
// approximation: distance-from-edge stands in for distance-from-camera,
// giving a soft near-to-far blur falloff instead of one uniform radius
// everywhere.
const RING_FEATHER_PX = 14;
// Segmentation is the expensive step — refresh the mask every 3rd frame and
// reuse the previous one in between. Keeps the loop smooth on mid-range laptops.
const SEGMENT_EVERY_N_FRAMES = 3;
// Face landmark detection runs on the same cadence as segmentation; it's a
// second, independent model, so this only turns on when a face prop is
// actually selected.
const FACE_EVERY_N_FRAMES = 3;

export type CustomBackground = HTMLImageElement | HTMLCanvasElement | ImageBitmap;

function drawCoverImage(
  ctx: CanvasRenderingContext2D,
  img: CustomBackground,
  w: number,
  h: number
) {
  const iw = 'naturalWidth' in img ? img.naturalWidth || img.width : img.width;
  const ih = 'naturalHeight' in img ? img.naturalHeight || img.height : img.height;
  if (!iw || !ih) return;
  const imgRatio = iw / ih;
  const canvasRatio = w / h;
  let sx = 0;
  let sy = 0;
  let sw = iw;
  let sh = ih;
  if (imgRatio > canvasRatio) {
    sw = ih * canvasRatio;
    sx = (iw - sw) / 2;
  } else {
    sh = iw / canvasRatio;
    sy = (ih - sh) / 2;
  }
  ctx.drawImage(img, sx, sy, sw, sh, 0, 0, w, h);
}

function drawVirtualBackground(
  ctx: CanvasRenderingContext2D,
  effect: AiEffect,
  w: number,
  h: number,
  customBg: CustomBackground | null
) {
  if (effect === 'replace-custom' && customBg) {
    drawCoverImage(ctx, customBg, w, h);
    return;
  }

  const grad = ctx.createLinearGradient(0, 0, w, h);
  if (effect === 'replace-pink' || effect === 'replace-custom') {
    // 'replace-custom' with no image chosen yet falls back to this gradient
    // so the preview never shows a blank canvas.
    grad.addColorStop(0, '#ffd6e8');
    grad.addColorStop(1, '#c9b6ff');
  } else {
    // 'replace-mint'
    grad.addColorStop(0, '#d7f5e3');
    grad.addColorStop(1, '#a0e6c4');
  }
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, w, h);
}

interface EngineOptions {
  video: HTMLVideoElement;
  canvas: HTMLCanvasElement; // the visible live-preview canvas
  getEffect: () => AiEffect;
  getMirrored: () => boolean;
  getColorFilterCss: () => string; // reuses the existing FILTER_CSS strings, preview-only
  getCustomBackground?: () => CustomBackground | null;
  getFaceProp?: () => FaceProp;
  onFirstMask?: () => void; // fires once the segmentation model has produced its first mask
  onFirstFace?: () => void; // fires once the face landmark model has produced its first detection
}

export class LiveEffectsEngine {
  private raf = 0;
  private running = false;
  private segmenting = false;
  private detectingFace = false;
  private frameCount = 0;
  private lastMask: SegmentationMask | null = null;
  private lastFace: FacePose | null = null;
  private rawMaskCanvas: HTMLCanvasElement;
  private cutoutCanvas: HTMLCanvasElement;
  private maskAlphaCanvas: HTMLCanvasElement;
  private ringMaskCanvas: HTMLCanvasElement;
  private ringLayerCanvas: HTMLCanvasElement;
  private notifiedFirstMask = false;
  private notifiedFirstFace = false;

  constructor(private opts: EngineOptions) {
    this.rawMaskCanvas = document.createElement('canvas');
    this.cutoutCanvas = document.createElement('canvas');
    this.maskAlphaCanvas = document.createElement('canvas');
    this.ringMaskCanvas = document.createElement('canvas');
    this.ringLayerCanvas = document.createElement('canvas');
  }

  start() {
    if (this.running) return;
    this.running = true;
    this.loop();
  }

  stop() {
    this.running = false;
    cancelAnimationFrame(this.raf);
  }

  /** True once we have a real segmentation mask to composite with. */
  get ready() {
    return this.lastMask !== null;
  }

  /** True once the face landmark model has located a face at least once. */
  get faceReady() {
    return this.lastFace !== null;
  }

  private async refreshMaskIfDue(video: HTMLVideoElement) {
    this.frameCount++;
    if (this.segmenting || this.frameCount % SEGMENT_EVERY_N_FRAMES !== 0) return;
    this.segmenting = true;
    try {
      const segmenter = await getSegmenter();
      const mask = segmentVideoFrame(segmenter, video, performance.now());
      if (mask) {
        this.lastMask = mask;
        if (!this.notifiedFirstMask) {
          this.notifiedFirstMask = true;
          this.opts.onFirstMask?.();
        }
      }
    } finally {
      this.segmenting = false;
    }
  }

  private async refreshFaceIfDue(video: HTMLVideoElement) {
    if (this.detectingFace || this.frameCount % FACE_EVERY_N_FRAMES !== 0) return;
    this.detectingFace = true;
    try {
      const landmarker = await getFaceLandmarker();
      const pose = detectFacePose(landmarker, video, performance.now());
      if (pose) {
        this.lastFace = pose;
        if (!this.notifiedFirstFace) {
          this.notifiedFirstFace = true;
          this.opts.onFirstFace?.();
        }
      }
    } finally {
      this.detectingFace = false;
    }
  }

  /** Paints the cached mask as an alpha channel, blurred slightly to soften the cutout edge. */
  private paintMaskAlpha(): HTMLCanvasElement | null {
    return this.paintFeatheredMask(this.maskAlphaCanvas, MASK_FEATHER_PX);
  }

  /** A more heavily feathered copy of the same mask, used only for the blur-ring effect. */
  private paintRingMask(): HTMLCanvasElement | null {
    return this.paintFeatheredMask(this.ringMaskCanvas, RING_FEATHER_PX);
  }

  private paintFeatheredMask(target: HTMLCanvasElement, featherPx: number): HTMLCanvasElement | null {
    if (!this.lastMask) return null;
    const { data, width, height } = this.lastMask;

    // Raw, hard-edged confidence mask straight from the model — cached once
    // per mask refresh and reused by both feather levels.
    this.rawMaskCanvas.width = width;
    this.rawMaskCanvas.height = height;
    const rctx = this.rawMaskCanvas.getContext('2d')!;
    const imgData = rctx.createImageData(width, height);
    for (let i = 0; i < data.length; i++) {
      imgData.data[i * 4 + 3] = Math.round(data[i] * 255);
    }
    rctx.putImageData(imgData, 0, 0);

    target.width = width;
    target.height = height;
    const tctx = target.getContext('2d')!;
    tctx.clearRect(0, 0, width, height);
    tctx.filter = `blur(${featherPx}px)`;
    tctx.drawImage(this.rawMaskCanvas, 0, 0);
    tctx.filter = 'none';
    return target;
  }

  /**
   * Builds a sharp, non-mirrored, no-color-filter cutout of just the person
   * (transparent elsewhere) from the given video frame + cached mask.
   * Used both by the live loop and by a still capture.
   */
  private buildCutout(video: HTMLVideoElement, w: number, h: number): HTMLCanvasElement | null {
    const maskCanvas = this.paintMaskAlpha();
    if (!maskCanvas) return null;

    this.cutoutCanvas.width = w;
    this.cutoutCanvas.height = h;
    const cctx = this.cutoutCanvas.getContext('2d')!;
    cctx.clearRect(0, 0, w, h);
    cctx.drawImage(video, 0, 0, w, h);
    cctx.globalCompositeOperation = 'destination-in';
    cctx.drawImage(maskCanvas, 0, 0, w, h);
    cctx.globalCompositeOperation = 'source-over';
    return this.cutoutCanvas;
  }

  /**
   * A mid-strength blur layer, masked down to just the feathered ring around
   * the subject's silhouette. Sits between the fully-blurred background and
   * the sharp cutout so the transition reads as a graduated falloff rather
   * than one hard blur radius everywhere.
   */
  private buildBlurRing(video: HTMLVideoElement, w: number, h: number): HTMLCanvasElement | null {
    const ringMask = this.paintRingMask();
    if (!ringMask) return null;

    this.ringLayerCanvas.width = w;
    this.ringLayerCanvas.height = h;
    const rctx = this.ringLayerCanvas.getContext('2d')!;
    rctx.clearRect(0, 0, w, h);
    rctx.filter = `blur(${BLUR_PX / 2}px)`;
    rctx.drawImage(video, 0, 0, w, h);
    rctx.filter = 'none';
    rctx.globalCompositeOperation = 'destination-in';
    rctx.drawImage(ringMask, 0, 0, w, h);
    rctx.globalCompositeOperation = 'source-over';
    return this.ringLayerCanvas;
  }

  /**
   * Renders one composited frame (background layer + sharp person cutout)
   * into the given 2D context, which the caller has already sized/transformed
   * (e.g. for mirroring). Shared by the live loop and still-capture path.
   */
  private compositeInto(
    ctx: CanvasRenderingContext2D,
    video: HTMLVideoElement,
    effect: AiEffect,
    w: number,
    h: number,
    colorFilterCss: string
  ) {
    const cutout = this.buildCutout(video, w, h);
    if (!cutout) {
      // Model hasn't produced a mask yet — show the plain feed instead of a blank frame.
      ctx.filter = colorFilterCss;
      ctx.drawImage(video, 0, 0, w, h);
      ctx.filter = 'none';
      return;
    }

    if (effect === 'blur') {
      ctx.filter = `${colorFilterCss} blur(${BLUR_PX}px)`.trim();
      ctx.drawImage(video, 0, 0, w, h);
      ctx.filter = 'none';

      const ring = this.buildBlurRing(video, w, h);
      if (ring) ctx.drawImage(ring, 0, 0);
    } else {
      const customBg = this.opts.getCustomBackground?.() ?? null;
      drawVirtualBackground(ctx, effect, w, h, customBg);
    }

    ctx.drawImage(cutout, 0, 0, w, h);
  }

  /** Draws the selected face-anchored prop at the last known face position. */
  private drawFaceProp(ctx: CanvasRenderingContext2D) {
    const prop = this.opts.getFaceProp?.() ?? 'none';
    if (prop === 'none' || !this.lastFace) return;
    const { leftEyeOuter, rightEyeOuter, noseBridge, foreheadTop, faceWidthPx, rollRad } = this.lastFace;

    ctx.save();
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    if (prop === 'glasses') {
      ctx.translate(noseBridge.x, noseBridge.y);
      ctx.rotate(rollRad);
      ctx.font = `${Math.round(faceWidthPx * 0.95)}px serif`;
      ctx.fillText('🕶️', 0, 0);
    } else if (prop === 'ears') {
      const midX = (leftEyeOuter.x + rightEyeOuter.x) / 2;
      ctx.translate(midX, foreheadTop.y - faceWidthPx * 0.25);
      ctx.rotate(rollRad);
      ctx.font = `${Math.round(faceWidthPx * 0.9)}px serif`;
      ctx.fillText('🐰', 0, 0);
    } else if (prop === 'hat') {
      const midX = (leftEyeOuter.x + rightEyeOuter.x) / 2;
      ctx.translate(midX, foreheadTop.y - faceWidthPx * 0.35);
      ctx.rotate(rollRad);
      ctx.font = `${Math.round(faceWidthPx * 1.15)}px serif`;
      ctx.fillText('🎩', 0, 0);
    }
    ctx.restore();
  }

  private loop = () => {
    if (!this.running) return;
    const { video, canvas, getEffect, getMirrored, getColorFilterCss, getFaceProp } = this.opts;
    const w = video.videoWidth;
    const h = video.videoHeight;
    const effect = getEffect();
    const faceProp = getFaceProp?.() ?? 'none';

    if (w && h) {
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext('2d')!;
      ctx.save();
      if (getMirrored()) {
        ctx.translate(w, 0);
        ctx.scale(-1, 1);
      }

      if (effect === 'none') {
        ctx.filter = getColorFilterCss();
        ctx.drawImage(video, 0, 0, w, h);
        ctx.filter = 'none';
      } else {
        void this.refreshMaskIfDue(video);
        this.compositeInto(ctx, video, effect, w, h, getColorFilterCss());
      }

      if (faceProp !== 'none') {
        void this.refreshFaceIfDue(video);
        this.drawFaceProp(ctx);
      }
      ctx.restore();
    }

    this.raf = requestAnimationFrame(this.loop);
  };

  /**
   * Synchronously renders one still frame for the shutter capture, using the
   * most recent mask/face pose. No color filter is baked in here — that
   * still goes through the existing server-side sharp pipeline, so color
   * grading stays a single, consistent step whether or not an AI effect is
   * active. Returns null if there's nothing to bake in yet (caller should
   * fall back to a plain video capture).
   */
  captureStill(mirrored: boolean): HTMLCanvasElement | null {
    const { video, getEffect, getFaceProp } = this.opts;
    const w = video.videoWidth;
    const h = video.videoHeight;
    const effect = getEffect();
    const faceProp = getFaceProp?.() ?? 'none';
    if (!w || !h) return null;

    const needsBackgroundEffect = effect !== 'none';
    if (needsBackgroundEffect && !this.lastMask) return null; // model not ready yet
    if (!needsBackgroundEffect && faceProp === 'none') return null; // nothing special to bake in

    const out = document.createElement('canvas');
    out.width = w;
    out.height = h;
    const ctx = out.getContext('2d')!;
    ctx.save();
    if (mirrored) {
      ctx.translate(w, 0);
      ctx.scale(-1, 1);
    }
    if (needsBackgroundEffect) {
      this.compositeInto(ctx, video, effect, w, h, 'none');
    } else {
      ctx.drawImage(video, 0, 0, w, h);
    }
    if (faceProp !== 'none') this.drawFaceProp(ctx);
    ctx.restore();
    return out;
  }
}
