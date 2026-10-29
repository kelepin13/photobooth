'use client';

import { useEffect, useState, type RefObject } from 'react';

/** Streams the chosen camera into `videoRef` while `enabled`; re-opens on front/back switch. */
export function useCamera(videoRef: RefObject<HTMLVideoElement>, enabled: boolean, facingMode: 'user' | 'environment') {
  const [cameraError, setCameraError] = useState(false);

  useEffect(() => {
    if (!enabled) return;
    let stream: MediaStream | null = null;
    let cancelled = false;

    navigator.mediaDevices
      .getUserMedia({ video: { facingMode }, audio: false })
      .then((s) => {
        if (cancelled) {
          s.getTracks().forEach((track) => track.stop());
          return;
        }
        stream = s;
        if (videoRef.current) videoRef.current.srcObject = s;
        setCameraError(false);
      })
      .catch(() => setCameraError(true));

    return () => {
      cancelled = true;
      stream?.getTracks().forEach((track) => track.stop());
    };
  }, [videoRef, enabled, facingMode]);

  return { cameraError };
}
