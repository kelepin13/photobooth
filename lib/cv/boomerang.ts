'use client';

// Boomerang / burst capture. Grabs a short run of still frames from either
// the plain <video> feed or the AI-effects live <canvas> (whichever is
// on-screen), plays them forward-then-backward in a loop, and records the
// loop with MediaRecorder. Deliberately dependency-free: canvas.captureStream
// and MediaRecorder are both native browser APIs, so this doesn't need a GIF
// encoder or any other new package.

export interface BoomerangOptions {
  /** Number of still frames to grab for the burst. */
  frameCount?: number;
  /** Delay between grabbed frames, in ms. */
  frameIntervalMs?: number;
  /** How many forward+backward cycles to bake into the recorded clip. */
  loops?: number;
  /** Playback frame rate of the recorded clip. */
  fps?: number;
  /**
   * Whether to mirror each grabbed frame horizontally. Only needed when
   * capturing straight from the <video> element, whose raw pixels aren't
   * mirrored even when the on-screen preview is flipped via CSS. Pass false
   * when capturing from the AI-effects canvas, since mirroring is already
   * baked into what that canvas draws.
   */
  mirrored?: boolean;
}

export interface BoomerangResult {
  blob: Blob;
  dataUrl: string;
  mimeType: string;
}

export async function captureBoomerang(
  source: HTMLVideoElement | HTMLCanvasElement,
  opts: BoomerangOptions = {}
): Promise<BoomerangResult> {
  const { frameCount = 10, frameIntervalMs = 70, loops = 2, fps = 20, mirrored = false } = opts;

  const w = source instanceof HTMLVideoElement ? source.videoWidth : source.width;
  const h = source instanceof HTMLVideoElement ? source.videoHeight : source.height;
  if (!w || !h) throw new Error('Boomerang source has no dimensions yet');

  if (typeof MediaRecorder === 'undefined') {
    throw new Error('MediaRecorder is not supported in this browser');
  }

  // 1. Grab the burst of still frames as ImageBitmaps (cheap to hold in
  // memory and cheap to redraw repeatedly during playback).
  const grab = document.createElement('canvas');
  grab.width = w;
  grab.height = h;
  const gctx = grab.getContext('2d')!;
  const frames: ImageBitmap[] = [];
  for (let i = 0; i < frameCount; i++) {
    gctx.save();
    if (mirrored) {
      gctx.translate(w, 0);
      gctx.scale(-1, 1);
    }
    gctx.drawImage(source, 0, 0, w, h);
    gctx.restore();
    frames.push(await createImageBitmap(grab));
    if (i < frameCount - 1) await new Promise((r) => setTimeout(r, frameIntervalMs));
  }

  // 2. Ping-pong the sequence (forward, then backward minus both endpoints)
  // so the loop doesn't visibly "snap" at the seam.
  const sequence = frames.length > 2 ? [...frames, ...frames.slice(1, -1).reverse()] : frames;

  // 3. Play the sequence onto a dedicated canvas and record that canvas's
  // stream with MediaRecorder.
  const playCanvas = document.createElement('canvas');
  playCanvas.width = w;
  playCanvas.height = h;
  const pctx = playCanvas.getContext('2d')!;
  const stream = (playCanvas as HTMLCanvasElement & { captureStream: (fps?: number) => MediaStream }).captureStream(
    fps
  );

  const mimeType = MediaRecorder.isTypeSupported('video/webm;codecs=vp9')
    ? 'video/webm;codecs=vp9'
    : MediaRecorder.isTypeSupported('video/webm;codecs=vp8')
      ? 'video/webm;codecs=vp8'
      : 'video/webm';
  const recorder = new MediaRecorder(stream, { mimeType });
  const chunks: BlobPart[] = [];
  recorder.ondataavailable = (e) => {
    if (e.data.size > 0) chunks.push(e.data);
  };

  const recordingDone = new Promise<void>((resolve) => {
    recorder.onstop = () => resolve();
  });

  const frameDurationMs = 1000 / fps;
  const totalFrames = sequence.length * loops;

  recorder.start();
  for (let i = 0; i < totalFrames; i++) {
    pctx.drawImage(sequence[i % sequence.length], 0, 0, w, h);
    // eslint-disable-next-line no-await-in-loop
    await new Promise((r) => setTimeout(r, frameDurationMs));
  }
  recorder.stop();
  await recordingDone;

  frames.forEach((f) => f.close());
  stream.getTracks().forEach((tr) => tr.stop());

  const blob = new Blob(chunks, { type: mimeType });
  const dataUrl: string = await new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(new Error('Failed to read recorded boomerang blob'));
    reader.readAsDataURL(blob);
  });

  return { blob, dataUrl, mimeType };
}
