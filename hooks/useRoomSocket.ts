'use client';

import { useEffect, useRef, useState } from 'react';
import { getSocket } from '@/lib/socket-client';
import { playPop, playTick } from '@/lib/sound';
import type { CaptureLock, Participant } from '@/types/room';

interface RoomState {
  slots: (string | null)[];
  columns: number;
  lock: CaptureLock | null;
  history: string[];
}

export type RoomErrorCode = 'ROOM_NOT_FOUND' | 'INVALID_PIN';

interface Options {
  code: string;
  /** Connect only after the person has entered their name (and PIN). */
  enabled: boolean;
  name: string;
  pin: string;
  initialSlots: (string | null)[];
  initialColumns: number;
  /** Fired on the device whose countdown just finished: it takes the photo. */
  onCountdownDone: (slotIndex: number) => void;
  onError: (code: RoomErrorCode) => void;
}

/**
 * Owns the socket.io connection for one room: joins (and re-joins after a
 * dropped connection), mirrors the shared room state, and exposes the
 * actions a participant can take.
 */
export function useRoomSocket({ code, enabled, name, pin, initialSlots, initialColumns, onCountdownDone, onError }: Options) {
  const [participants, setParticipants] = useState<Participant[]>([]);
  const [slots, setSlots] = useState(initialSlots);
  const [columns, setColumns] = useState(initialColumns);
  const [history, setHistory] = useState<string[]>([]);
  const [lock, setLock] = useState<CaptureLock | null>(null);
  const [countdown, setCountdown] = useState<number | null>(null);
  const [composedUrl, setComposedUrl] = useState<string | null>(null);
  const [boomerangUrl, setBoomerangUrl] = useState<string | null>(null);
  const [reconnecting, setReconnecting] = useState(false);
  const [mySocketId, setMySocketId] = useState<string | null>(null);

  // Room info (fetched before joining) can arrive after the first render.
  useEffect(() => setSlots(initialSlots), [initialSlots]);
  useEffect(() => setColumns(initialColumns), [initialColumns]);

  // Filled-slot count, so a new photo (from anyone in the room) can "pop".
  const filledRef = useRef(0);
  const countFilled = (s: (string | null)[]) => s.filter(Boolean).length;

  // Latest values for the long-lived socket listeners, without re-subscribing.
  const latest = useRef({ name, pin, onCountdownDone, onError });
  latest.current = { name, pin, onCountdownDone, onError };

  useEffect(() => {
    if (!enabled) return;
    const socket = getSocket();

    const join = () => {
      socket.emit('room:join', { code, name: latest.current.name || 'Guest', pin: latest.current.pin || undefined });
      setMySocketId(socket.id ?? null);
    };

    const handlers: Record<string, (...args: any[]) => void> = {
      connect: () => {
        setReconnecting(false);
        join();
      },
      disconnect: () => setReconnecting(true),
      'room:state': (state: RoomState) => {
        filledRef.current = countFilled(state.slots); // catching up on join is not a new photo
        setSlots(state.slots);
        setColumns(state.columns);
        setLock(state.lock);
        setHistory(state.history || []);
      },
      'room:participants': setParticipants,
      'room:slots': (next: (string | null)[]) => {
        if (countFilled(next) > filledRef.current) playPop();
        filledRef.current = countFilled(next);
        setSlots(next);
      },
      'room:history': setHistory,
      'room:composed': setComposedUrl,
      'room:boomerang': ({ videoDataUrl }: { videoDataUrl: string }) => setBoomerangUrl(videoDataUrl),
      'room:lock': setLock,
      'room:countdown': ({ seconds }: { seconds: number }) => {
        setCountdown(seconds);
        playTick();
      },
      'room:countdown-done': ({ slotIndex, by }: { slotIndex: number; by: string }) => {
        setCountdown(null);
        if (by === socket.id) latest.current.onCountdownDone(slotIndex);
      },
      'room:error': ({ code: errorCode }: { code: RoomErrorCode }) => latest.current.onError(errorCode),
    };

    for (const [event, fn] of Object.entries(handlers)) socket.on(event, fn);
    if (socket.connected) join();

    return () => {
      for (const [event, fn] of Object.entries(handlers)) socket.off(event, fn);
    };
  }, [enabled, code]);

  const emit = (event: string, payload: Record<string, unknown> = {}) => getSocket().emit(event, { code, ...payload });

  return {
    participants,
    slots,
    columns,
    history,
    lock,
    countdown,
    composedUrl,
    boomerangUrl,
    setBoomerangUrl,
    reconnecting,
    mySocketId,
    lockedByOther: !!lock && lock.socketId !== mySocketId,
    actions: {
      startCountdown: (slotIndex: number) => emit('room:countdown-start', { slotIndex }),
      capture: (slotIndex: number, imageDataUrl: string) => emit('room:capture', { slotIndex, imageDataUrl }),
      cancelCapture: () => emit('room:capture-cancel'),
      clearSlot: (slotIndex: number) => emit('room:clear-slot', { slotIndex }),
      shareComposed: (imageDataUrl: string) => emit('room:composed', { imageDataUrl }),
      shareBoomerang: (videoDataUrl: string) => emit('room:boomerang', { videoDataUrl }),
    },
  };
}
