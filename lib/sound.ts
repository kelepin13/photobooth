'use client';

let ctx: AudioContext | null = null;

function getCtx(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  if (!ctx) {
    const AC = window.AudioContext || (window as any).webkitAudioContext;
    if (!AC) return null;
    ctx = new AC();
  }
  if (ctx.state === 'suspended') ctx.resume().catch(() => {});
  return ctx;
}

function tone(freq: number, duration: number, type: OscillatorType = 'sine', gain = 0.15, delay = 0) {
  const audio = getCtx();
  if (!audio) return;
  const osc = audio.createOscillator();
  const g = audio.createGain();
  osc.type = type;
  osc.frequency.value = freq;
  osc.connect(g);
  g.connect(audio.destination);
  const start = audio.currentTime + delay;
  g.gain.setValueAtTime(gain, start);
  g.gain.exponentialRampToValueAtTime(0.001, start + duration);
  osc.start(start);
  osc.stop(start + duration);
}

/** Soft tick for each countdown second. */
export function playTick() {
  tone(880, 0.08, 'sine', 0.1);
}

/** Camera shutter "click" — a quick burst of noise-like double-tone. */
export function playShutter() {
  tone(1400, 0.05, 'square', 0.12);
  tone(600, 0.09, 'square', 0.1, 0.04);
}

/** Cheerful "pop" when a photo lands in the strip. */
export function playPop() {
  tone(520, 0.06, 'triangle', 0.12);
  tone(780, 0.1, 'triangle', 0.1, 0.05);
}

/** Short haptic pulse on devices/browsers that support it. */
export function vibrateShutter() {
  if (typeof navigator !== 'undefined' && 'vibrate' in navigator) {
    navigator.vibrate(60);
  }
}
