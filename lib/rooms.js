// Room store, with two backends:
//
//  - Redis (when REDIS_URL is set): each room is a JSON blob under `room:<code>`
//    with a native TTL, so expiry is handled by Redis itself and state survives
//    server restarts / works across multiple server instances.
//  - In-memory Map (default, zero config): fine for a single-instance
//    dev/demo deployment, but state is lost on restart.
//
// Both backends expose the same async API, so callers don't need to care
// which one is active.
//
// IMPORTANT (memory backend only): Next.js API routes are bundled by webpack,
// while server.js requires this file as plain CommonJS — those are two
// separate module instances with their own module cache. Stashing state on
// `globalThis` guarantees every instance of this module — bundled or not —
// reads/writes the same Map.

const { randomInt } = require('crypto');

const ROOM_TTL_MS = 2 * 60 * 60 * 1000; // 2 hours
const ROOM_TTL_SECONDS = ROOM_TTL_MS / 1000;

const LAYOUTS = {
  '2x2': { slotCount: 4, columns: 2 },
  '1x4': { slotCount: 4, columns: 1 },
  '1x2': { slotCount: 2, columns: 1 },
  '2x3': { slotCount: 6, columns: 2 },
};

function freshRoom(code, layout) {
  const layoutConfig = LAYOUTS[layout] || LAYOUTS['2x2'];
  return {
    code,
    layout,
    columns: layoutConfig.columns,
    pin: null,
    createdAt: Date.now(),
    slots: new Array(layoutConfig.slotCount).fill(null),
    history: [],
    participants: {}, // socketId -> { name, ready }
    lock: null, // { socketId, name, slotIndex } while someone is mid-countdown/capture
  };
}

// No 0/O/1/I, so codes read out loud or typed from a screen don't get mixed up.
const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const CODE_LENGTH = 5;

function generateCode() {
  let out = '';
  for (let i = 0; i < CODE_LENGTH; i++) out += CODE_ALPHABET[randomInt(CODE_ALPHABET.length)];
  return out;
}

const useRedis = !!process.env.REDIS_URL;

let backend;

if (useRedis) {
  // eslint-disable-next-line global-require
  const Redis = require('ioredis');
  const globalForRedis = globalThis;
  const redis = globalForRedis.__photoboothRedis || (globalForRedis.__photoboothRedis = new Redis(process.env.REDIS_URL));

  backend = {
    async createRoom(code, layout, pin) {
      const room = freshRoom(code, layout);
      room.pin = pin || null;
      await redis.set(`room:${code}`, JSON.stringify(room), 'EX', ROOM_TTL_SECONDS);
      return room;
    },
    async getRoom(code) {
      const raw = await redis.get(`room:${code}`);
      if (!raw) return null;
      return JSON.parse(raw);
    },
    async saveRoom(room) {
      // Renews the TTL on every save, so an actively-used room won't expire mid-session.
      await redis.set(`room:${room.code}`, JSON.stringify(room), 'EX', ROOM_TTL_SECONDS);
    },
    async deleteRoom(code) {
      await redis.del(`room:${code}`);
    },
    async cleanupExpiredRooms() {
      // No-op: Redis TTL handles expiry natively.
    },
  };
} else {
  const globalForRooms = globalThis;
  const rooms = globalForRooms.__photoboothRooms || (globalForRooms.__photoboothRooms = new Map());

  backend = {
    async createRoom(code, layout, pin) {
      const room = freshRoom(code, layout);
      room.pin = pin || null;
      rooms.set(code, room);
      return room;
    },
    async getRoom(code) {
      const room = rooms.get(code);
      if (room) room.lastActiveAt = Date.now();
      return room || null;
    },
    async saveRoom() {
      // No-op: in-memory rooms are mutated by reference, nothing to persist.
    },
    async deleteRoom(code) {
      rooms.delete(code);
    },
    async cleanupExpiredRooms() {
      const now = Date.now();
      for (const [code, room] of rooms.entries()) {
        const last = room.lastActiveAt || room.createdAt;
        if (now - last > ROOM_TTL_MS) rooms.delete(code);
      }
    },
    _rooms: rooms, // exposed for /api/health room-count reporting
  };
}

/**
 * Creates a room under a fresh code that isn't already taken.
 * @param {string} layout one of the LAYOUTS keys
 * @param {string | null} pin optional 4-6 digit PIN
 */
async function createRoomWithNewCode(layout, pin) {
  for (let attempt = 0; attempt < 10; attempt++) {
    const code = generateCode();
    if (!(await backend.getRoom(code))) return backend.createRoom(code, layout, pin);
  }
  throw new Error('Could not find a free room code');
}

module.exports = {
  LAYOUTS,
  CODE_ALPHABET,
  generateCode,
  createRoomWithNewCode,
  usingRedis: useRedis,
  createRoom: backend.createRoom,
  getRoom: backend.getRoom,
  saveRoom: backend.saveRoom,
  deleteRoom: backend.deleteRoom,
  cleanupExpiredRooms: backend.cleanupExpiredRooms,
  _rooms: backend._rooms,
};
