'use client';

import { useEffect, useRef, useState, type RefObject } from 'react';
import { LiveEffectsEngine } from '@/lib/cv/liveEffects';
import { FILTER_CSS } from '@/lib/filters';
import type { AiEffect, FaceProp, FilterName } from '@/types/room';

interface Options {
  videoRef: RefObject<HTMLVideoElement>;
  canvasRef: RefObject<HTMLCanvasElement>;
  enabled: boolean;
  aiEffect: AiEffect;
  faceProp: FaceProp;
  filter: FilterName;
  mirrored: boolean;
  customBackground: HTMLImageElement | null;
}

/**
 * Runs the MediaPipe loop (background blur/replace and face props) only while
 * something is selected. With both set to "none", the plain <video> is shown
 * and nothing runs.
 */
export function useLiveEffects({ videoRef, canvasRef, enabled, aiEffect, faceProp, filter, mirrored, customBackground }: Options) {
  const engineRef = useRef<LiveEffectsEngine | null>(null);
  const [modelLoading, setModelLoading] = useState(false);
  const active = aiEffect !== 'none' || faceProp !== 'none';

  // The engine reads these every frame; refs avoid restarting it on each change.
  const settings = useRef({ aiEffect, faceProp, filter, mirrored, customBackground });
  settings.current = { aiEffect, faceProp, filter, mirrored, customBackground };

  useEffect(() => {
    if (!enabled || !active) {
      engineRef.current?.stop();
      return;
    }
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas) return;

    engineRef.current ??= new LiveEffectsEngine({
      video,
      canvas,
      getEffect: () => settings.current.aiEffect,
      getMirrored: () => settings.current.mirrored,
      getColorFilterCss: () => FILTER_CSS[settings.current.filter],
      getCustomBackground: () => settings.current.customBackground,
      getFaceProp: () => settings.current.faceProp,
      onFirstMask: () => setModelLoading(false),
      onFirstFace: () => setModelLoading(false),
    });
    const engine = engineRef.current;
    setModelLoading((aiEffect !== 'none' && !engine.ready) || (faceProp !== 'none' && !engine.faceReady));
    engine.start();

    return () => engine.stop();
  }, [enabled, active, aiEffect, faceProp, videoRef, canvasRef]);

  /** The current frame with effects baked in, or null if the effects aren't running. */
  const captureStill = (): HTMLCanvasElement | null =>
    active ? engineRef.current?.captureStill(settings.current.mirrored) ?? null : null;

  return { active, modelLoading, captureStill };
}
