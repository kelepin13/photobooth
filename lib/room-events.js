// Socket.io event handlers for a photobooth room.
//
// Kept separate from server.js so they can be tested against a real socket.io
// server without booting Next.js (see tests/room-events.test.ts).
//
// Every event after `room:join` acts on the room this socket actually joined.
// The client still sends `code` for backwards compatibility, but it is ignored:
// trusting it would let anyone write into any room (and skip its PIN) just by
// knowing the code.

const LIMITS = {
  nameLength: 30,
  pinAttempts: 5,
  imageBytes: 8 * 1024 * 1024, // one captured photo or composed strip, as a data URL
  videoBytes: 10 * 1024 * 1024, // boomerang clip, as a data URL
  historySize: 24,
};

const COUNTDOWN_SECONDS = 3;
// Covers countdown + server filter + the person deciding Keep/Retake.
// Released earlier on Keep, Retake or disconnect; this is only the safety net.
const LOCK_TIMEOUT_MS = 30_000;

function isDataUrl(value, kind, maxBytes) {
  return (
    typeof value === 'string' &&
    value.startsWith(`data:${kind}/`) &&
    value.length * 0.75 <= maxBytes // base64 → bytes
  );
}

function isSlotIndex(room, value) {
  return Number.isInteger(value) && value >= 0 && value < room.slots.length;
}

function cleanName(value) {
  const name = typeof value === 'string' ? value.trim().slice(0, LIMITS.nameLength) : '';
  return name || 'Guest';
}

/**
 * @param {import('socket.io').Server} io
 * @param {{ getRoom: Function, saveRoom: Function }} store
 * @param {{ log: Function, increment: Function }} logger
 * @param {{ countdownSeconds?: number, tickMs?: number, lockTimeoutMs?: number }} [options]
 */
function registerRoomHandlers(io, store, logger, options = {}) {
  const countdownSeconds = options.countdownSeconds ?? COUNTDOWN_SECONDS;
  const tickMs = options.tickMs ?? 1000;
  const lockTimeoutMs = options.lockTimeoutMs ?? LOCK_TIMEOUT_MS;

  async function setLock(room, lock) {
    room.lock = lock;
    await store.saveRoom(room);
    io.to(room.code).emit('room:lock', lock);
  }

  io.on('connection', (socket) => {
    let joinedCode = null;
    let joinedName = 'Guest';
    let failedPins = 0;

    /** The room this socket joined, or null. */
    async function myRoom() {
      return joinedCode ? store.getRoom(joinedCode) : null;
    }

    socket.on('room:join', async ({ code, name, pin } = {}) => {
      const room = typeof code === 'string' ? await store.getRoom(code) : null;
      if (!room) {
        socket.emit('room:error', { code: 'ROOM_NOT_FOUND', message: 'Room not found' });
        return;
      }
      if (room.pin && room.pin !== pin) {
        failedPins += 1;
        socket.emit('room:error', { code: 'INVALID_PIN', message: 'Invalid PIN' });
        if (failedPins >= LIMITS.pinAttempts) socket.disconnect(true);
        return;
      }

      joinedCode = room.code;
      joinedName = cleanName(name);
      socket.join(room.code);
      room.participants[socket.id] = { name: joinedName, ready: false };
      await store.saveRoom(room);
      logger.increment('roomsJoined');
      logger.log('room_join', { code: room.code });

      // Full state, so a refresh or reconnect picks up where the room is.
      socket.emit('room:state', {
        slots: room.slots,
        layout: room.layout,
        columns: room.columns,
        lock: room.lock,
        history: room.history,
      });
      io.to(room.code).emit('room:participants', Object.values(room.participants));
    });

    socket.on('room:countdown-start', async ({ slotIndex } = {}) => {
      const room = await myRoom();
      if (!room || room.lock || !isSlotIndex(room, slotIndex)) return;
      const code = room.code;
      await setLock(room, { socketId: socket.id, name: joinedName, slotIndex });

      let remaining = countdownSeconds;
      io.to(code).emit('room:countdown', { seconds: remaining, by: joinedName });
      const timer = setInterval(() => {
        remaining -= 1;
        if (remaining > 0) {
          io.to(code).emit('room:countdown', { seconds: remaining, by: joinedName });
        } else {
          clearInterval(timer);
          io.to(code).emit('room:countdown-done', { slotIndex, by: socket.id });
        }
      }, tickMs);

      setTimeout(async () => {
        const current = await store.getRoom(code);
        if (current?.lock?.socketId === socket.id) await setLock(current, null);
      }, lockTimeoutMs);
    });

    socket.on('room:capture', async ({ slotIndex, imageDataUrl } = {}) => {
      const room = await myRoom();
      if (!room || !isSlotIndex(room, slotIndex)) return;
      if (!isDataUrl(imageDataUrl, 'image', LIMITS.imageBytes)) return;
      // While someone else holds the camera, nobody else can write a slot.
      if (room.lock && room.lock.socketId !== socket.id) return;

      room.slots[slotIndex] = imageDataUrl;
      if (!room.history.includes(imageDataUrl)) {
        room.history.push(imageDataUrl);
        if (room.history.length > LIMITS.historySize) room.history.shift();
      }
      if (room.lock?.socketId === socket.id) room.lock = null;
      await store.saveRoom(room);
      logger.increment('photosCapturedTotal');
      io.to(room.code).emit('room:slots', room.slots);
      io.to(room.code).emit('room:history', room.history);
      io.to(room.code).emit('room:lock', room.lock);
    });

    socket.on('room:capture-cancel', async () => {
      const room = await myRoom();
      if (room?.lock?.socketId === socket.id) await setLock(room, null);
    });

    socket.on('room:clear-slot', async ({ slotIndex } = {}) => {
      const room = await myRoom();
      if (!room || !isSlotIndex(room, slotIndex)) return;
      room.slots[slotIndex] = null;
      await store.saveRoom(room);
      io.to(room.code).emit('room:slots', room.slots);
    });

    socket.on('room:composed', ({ imageDataUrl } = {}) => {
      if (!joinedCode || !isDataUrl(imageDataUrl, 'image', LIMITS.imageBytes)) return;
      logger.increment('stripsComposed');
      io.to(joinedCode).emit('room:composed', imageDataUrl);
    });

    // Boomerang clips are recorded client-side (MediaRecorder) and only relayed.
    socket.on('room:boomerang', ({ videoDataUrl } = {}) => {
      if (!joinedCode || !isDataUrl(videoDataUrl, 'video', LIMITS.videoBytes)) return;
      logger.increment('boomerangsCaptured');
      io.to(joinedCode).emit('room:boomerang', { by: joinedName, videoDataUrl });
    });

    socket.on('disconnect', async () => {
      const room = await myRoom();
      if (!room) return;
      delete room.participants[socket.id];
      const heldLock = room.lock?.socketId === socket.id;
      if (heldLock) room.lock = null;
      await store.saveRoom(room);
      io.to(room.code).emit('room:participants', Object.values(room.participants));
      if (heldLock) io.to(room.code).emit('room:lock', null);
    });
  });
}

// Socket.io's default 1 MB message limit silently drops larger photos and
// every boomerang clip; leave headroom above the largest payload we accept.
const MAX_SOCKET_MESSAGE_BYTES = Math.ceil(LIMITS.videoBytes / 0.75) + 64 * 1024;

module.exports = { registerRoomHandlers, LIMITS, MAX_SOCKET_MESSAGE_BYTES };
