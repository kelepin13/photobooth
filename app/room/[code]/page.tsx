'use client';

import { useCallback, useEffect, useRef, useState, type ChangeEvent } from 'react';
import LanguageSwitcher from '@/components/LanguageSwitcher';
import CameraPanel from '@/components/room/CameraPanel';
import CaptureControls from '@/components/room/CaptureControls';
import JoinCard from '@/components/room/JoinCard';
import QrPanel from '@/components/room/QrPanel';
import { RoomLoading, RoomNotFound } from '@/components/room/RoomScreens';
import StripPanel from '@/components/room/StripPanel';
import { useCamera } from '@/hooks/useCamera';
import { useLiveEffects } from '@/hooks/useLiveEffects';
import { useRoomSocket, type RoomErrorCode } from '@/hooks/useRoomSocket';
import { captureBoomerang } from '@/lib/cv/boomerang';
import { useLanguage } from '@/lib/i18n';
import { playShutter, vibrateShutter } from '@/lib/sound';
import type { AiEffect, FaceProp, FilterName, RoomInfo } from '@/types/room';

const NO_SLOTS: (string | null)[] = [];

/** POSTs JSON and returns the parsed body, throwing the API's error message on failure. */
async function postJson<T>(url: string, body: unknown): Promise<T> {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `Request failed (${res.status})`);
  return data as T;
}

export default function RoomPage({ params }: { params: { code: string } }) {
  const code = params.code.toUpperCase();
  const { t } = useLanguage();

  // --- room info, before joining ---------------------------------------------
  const [room, setRoom] = useState<RoomInfo | null>(null);
  const [roomStatus, setRoomStatus] = useState<'loading' | 'ready' | 'missing'>('loading');

  useEffect(() => {
    fetch(`/api/rooms/${code}`)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then((data: RoomInfo) => {
        setRoom(data);
        setRoomStatus('ready');
      })
      .catch(() => setRoomStatus('missing'));
  }, [code]);

  // --- joining ----------------------------------------------------------------
  const [name, setName] = useState('');
  const [pin, setPin] = useState('');
  const [pinError, setPinError] = useState<string | null>(null);
  const [joined, setJoined] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // --- camera and effects -----------------------------------------------------
  const videoRef = useRef<HTMLVideoElement>(null);
  const effectsCanvasRef = useRef<HTMLCanvasElement>(null);
  const [filter, setFilter] = useState<FilterName>('none');
  const [aiEffect, setAiEffect] = useState<AiEffect>('none');
  const [faceProp, setFaceProp] = useState<FaceProp>('none');
  const [customBackground, setCustomBackground] = useState<HTMLImageElement | null>(null);
  const [mirrored, setMirrored] = useState(true);
  const [facingMode, setFacingMode] = useState<'user' | 'environment'>('user');
  const [flash, setFlash] = useState(false);

  const { cameraError } = useCamera(videoRef, joined, facingMode);
  const effects = useLiveEffects({
    videoRef,
    canvasRef: effectsCanvasRef,
    enabled: joined,
    aiEffect,
    faceProp,
    filter,
    mirrored,
    customBackground,
  });

  // --- capture flow -----------------------------------------------------------
  const [activeSlot, setActiveSlot] = useState(0);
  const [pendingPreview, setPendingPreview] = useState<{ slotIndex: number; url: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [boomerangBusy, setBoomerangBusy] = useState(false);
  const [caption, setCaption] = useState('');
  const [publishInfo, setPublishInfo] = useState<{ url: string; qrDataUrl: string } | null>(null);
  const [canShareFiles, setCanShareFiles] = useState(false);

  useEffect(() => setCanShareFiles(typeof navigator !== 'undefined' && !!navigator.canShare), []);

  // Latest settings for the capture, which runs from a socket callback.
  const captureSettings = useRef({ filter, mirrored, captureStill: effects.captureStill });
  captureSettings.current = { filter, mirrored, captureStill: effects.captureStill };

  /** Grabs the current frame, runs it through the server filter and shows it for Keep/Retake. */
  const takePhoto = useCallback(
    async (slotIndex: number) => {
      const video = videoRef.current;
      if (!video) return;
      const { filter: currentFilter, mirrored: isMirrored, captureStill } = captureSettings.current;

      setFlash(true);
      setTimeout(() => setFlash(false), 180);
      playShutter();
      vibrateShutter();

      // With effects running, take the composited frame; otherwise the raw video.
      let frame = captureStill();
      if (!frame) {
        frame = document.createElement('canvas');
        frame.width = video.videoWidth;
        frame.height = video.videoHeight;
        const ctx = frame.getContext('2d');
        if (!ctx) return;
        if (isMirrored) {
          ctx.translate(frame.width, 0);
          ctx.scale(-1, 1);
        }
        ctx.drawImage(video, 0, 0);
      }

      setBusy(true);
      try {
        const { imageDataUrl } = await postJson<{ imageDataUrl: string }>('/api/photos/filter', {
          imageDataUrl: frame.toDataURL('image/jpeg', 0.92),
          filter: currentFilter,
        });
        setPendingPreview({ slotIndex, url: imageDataUrl });
      } catch (err) {
        setError((err as Error).message || t('room.actionFailed'));
        socket.actions.cancelCapture();
      } finally {
        setBusy(false);
      }
    },
    // socket.actions only wraps getSocket(), so it never goes stale
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [t]
  );

  const onRoomError = useCallback(
    (errorCode: RoomErrorCode) => {
      setJoined(false);
      if (errorCode === 'INVALID_PIN') setPinError(t('join.pinRequired'));
      else setRoomStatus('missing');
    },
    [t]
  );

  const socket = useRoomSocket({
    code,
    enabled: joined,
    name,
    pin,
    initialSlots: room?.slots ?? NO_SLOTS,
    initialColumns: room?.columns ?? 2,
    onCountdownDone: takePhoto,
    onError: onRoomError,
  });
  const { slots, lock, lockedByOther, countdown, actions } = socket;

  // When a photo lands in the slot you were about to shoot (often someone
  // else's), move to the first empty one instead of overwriting it.
  useEffect(() => {
    setActiveSlot((current) => {
      if (!slots[current]) return current;
      const firstEmpty = slots.findIndex((s) => !s);
      return firstEmpty === -1 ? current : firstEmpty;
    });
  }, [slots]);

  // --- actions ----------------------------------------------------------------
  function nextSlot(after: number) {
    return slots.length ? (after + 1) % slots.length : 0;
  }

  function keepPreview() {
    if (!pendingPreview) return;
    actions.capture(pendingPreview.slotIndex, pendingPreview.url);
    setActiveSlot(nextSlot(pendingPreview.slotIndex));
    setPendingPreview(null);
  }

  function retakePreview() {
    actions.cancelCapture();
    setPendingPreview(null);
  }

  function clearSlot(index: number) {
    actions.clearSlot(index);
    setActiveSlot(index);
  }

  function pickFromHistory(url: string) {
    actions.capture(activeSlot, url);
    setActiveSlot(nextSlot(activeSlot));
  }

  function loadCustomBackground(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const url = URL.createObjectURL(file);
    const img = new window.Image();
    img.onload = () => {
      setCustomBackground(img);
      URL.revokeObjectURL(url);
    };
    img.src = url;
  }

  /** Records a short forward-then-backward loop of whatever is on screen. */
  async function recordBoomerang() {
    if (lock || boomerangBusy) return;
    const source = effects.active ? effectsCanvasRef.current : videoRef.current;
    if (!source) return;
    setBoomerangBusy(true);
    try {
      // The effects canvas already draws mirrored; the raw <video> does not.
      const { dataUrl } = await captureBoomerang(source, { mirrored: effects.active ? false : mirrored });
      socket.setBoomerangUrl(dataUrl);
      actions.shareBoomerang(dataUrl);
    } catch (err) {
      console.error('Boomerang capture failed', err);
      setError(t('room.actionFailed'));
    } finally {
      setBoomerangBusy(false);
    }
  }

  async function composeStrip() {
    setBusy(true);
    setPublishInfo(null);
    try {
      const { imageDataUrl } = await postJson<{ imageDataUrl: string }>('/api/photos/compose', {
        slots,
        columns: socket.columns,
        caption,
      });
      actions.shareComposed(imageDataUrl);
    } catch (err) {
      setError((err as Error).message || t('room.actionFailed'));
    } finally {
      setBusy(false);
    }
  }

  async function shareStrip() {
    const url = socket.composedUrl;
    if (!url) return;
    const fileName = `photobooth-${code}.jpg`;
    try {
      const blob = await (await fetch(url)).blob();
      const file = new File([blob], fileName, { type: 'image/jpeg' });
      if (navigator.canShare?.({ files: [file] })) {
        await navigator.share({ files: [file], title: 'Online Photobooth' });
        return;
      }
    } catch {
      // share sheet dismissed or unsupported: fall back to a download
    }
    const a = document.createElement('a');
    a.href = url;
    a.download = fileName;
    a.click();
  }

  async function publishStrip() {
    if (!socket.composedUrl) return;
    setBusy(true);
    try {
      setPublishInfo(await postJson('/api/photos/publish', { imageDataUrl: socket.composedUrl }));
    } catch (err) {
      setError((err as Error).message || t('room.actionFailed'));
    } finally {
      setBusy(false);
    }
  }

  // --- screens ----------------------------------------------------------------
  if (roomStatus === 'loading') return <RoomLoading />;
  if (roomStatus === 'missing') return <RoomNotFound />;

  if (!joined) {
    return (
      <JoinCard
        code={code}
        name={name}
        onNameChange={setName}
        hasPin={!!room?.hasPin}
        pin={pin}
        onPinChange={(value) => {
          setPin(value);
          setPinError(null);
        }}
        pinError={pinError}
        onJoin={() => setJoined(true)}
      />
    );
  }

  return (
    <div className="container">
      <div className="confetti-bg" />
      <LanguageSwitcher />

      {socket.reconnecting && <div className="reconnect-banner">🔄 {t('room.reconnecting')}</div>}

      <header className="room-header">
        <h1>{t('room.title')}</h1>
        <span className="room-code-badge">{code}</span>
      </header>

      {error && (
        <div className="error-banner" role="alert">
          <span>⚠️ {error}</span>
          <button type="button" onClick={() => setError(null)}>
            {t('room.dismiss')}
          </button>
        </div>
      )}

      <QrPanel qrDataUrl={room?.qrDataUrl} participants={socket.participants} />

      <CameraPanel
        videoRef={videoRef}
        effectsCanvasRef={effectsCanvasRef}
        effectsActive={effects.active}
        modelLoading={effects.modelLoading}
        filter={filter}
        mirrored={mirrored}
        onToggleMirror={() => setMirrored((m) => !m)}
        onSwitchCamera={() => setFacingMode((f) => (f === 'user' ? 'environment' : 'user'))}
        countdown={countdown}
        flash={flash}
        cameraError={cameraError}
        aiEffect={aiEffect}
        onAiEffectChange={setAiEffect}
        hasCustomBackground={!!customBackground}
        onCustomBackground={loadCustomBackground}
        faceProp={faceProp}
        onFacePropChange={setFaceProp}
      >
        <CaptureControls
          code={code}
          lock={lock}
          lockedByOther={lockedByOther}
          pendingPreview={pendingPreview?.url ?? null}
          onKeep={keepPreview}
          onRetake={retakePreview}
          filter={filter}
          onFilterChange={setFilter}
          busy={busy}
          countdownRunning={countdown !== null}
          activeSlot={activeSlot}
          filledCount={slots.filter(Boolean).length}
          slotCount={slots.length}
          onCapture={() => !lock && actions.startCountdown(activeSlot)}
          boomerangBusy={boomerangBusy}
          boomerangUrl={socket.boomerangUrl}
          onBoomerang={recordBoomerang}
          history={socket.history}
          onPickFromHistory={pickFromHistory}
        />
      </CameraPanel>

      <StripPanel
        code={code}
        slots={slots}
        columns={socket.columns}
        activeSlot={activeSlot}
        onSelectSlot={setActiveSlot}
        onClearSlot={clearSlot}
        caption={caption}
        onCaptionChange={setCaption}
        busy={busy}
        onCompose={composeStrip}
        composedUrl={socket.composedUrl}
        canShareFiles={canShareFiles}
        onShare={shareStrip}
        onPublish={publishStrip}
        publishInfo={publishInfo}
      />
    </div>
  );
}
