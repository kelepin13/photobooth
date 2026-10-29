import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createServer, type Server as HttpServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { Server } from 'socket.io';
import { io as connect, type Socket } from 'socket.io-client';

const rooms = require('../lib/rooms');
const { registerRoomHandlers } = require('../lib/room-events');

const PHOTO = 'data:image/jpeg;base64,' + Buffer.from('fake jpeg').toString('base64');
const quietLogger = { log: () => {}, increment: () => {} };

let http: HttpServer;
let io: Server;
let url: string;
const clients: Socket[] = [];

beforeAll(async () => {
  http = createServer();
  io = new Server(http);
  registerRoomHandlers(io, rooms, quietLogger, { countdownSeconds: 1, tickMs: 20, lockTimeoutMs: 400 });
  await new Promise<void>((resolve) => http.listen(0, resolve));
  url = `http://localhost:${(http.address() as AddressInfo).port}`;
});

afterAll(() => {
  clients.forEach((c) => c.close());
  io.close();
  http.close();
});

beforeEach(() => rooms._rooms.clear());

function client(): Promise<Socket> {
  const socket = connect(url, { transports: ['websocket'], forceNew: true });
  clients.push(socket);
  return new Promise((resolve) => socket.on('connect', () => resolve(socket)));
}

function next<T = any>(socket: Socket, event: string): Promise<T> {
  return new Promise((resolve) => socket.once(event, resolve));
}

async function joined(code: string, pin?: string) {
  const socket = await client();
  const state = next(socket, 'room:state');
  socket.emit('room:join', { code, name: 'Tester', pin });
  await state;
  return socket;
}

const settle = () => new Promise((r) => setTimeout(r, 60));

describe('room:join', () => {
  it('rejects a wrong PIN and disconnects after repeated attempts', async () => {
    await rooms.createRoom('PINNY', '2x2', '1234');
    const socket = await client();
    const disconnected = next(socket, 'disconnect');

    for (let i = 0; i < 5; i++) {
      const error = next(socket, 'room:error');
      socket.emit('room:join', { code: 'PINNY', name: 'x', pin: '0000' });
      expect((await error).code).toBe('INVALID_PIN');
    }
    await disconnected;
  });

  it('accepts the right PIN and sends the room state', async () => {
    await rooms.createRoom('PINOK', '1x2', '1234');
    const socket = await client();
    const state = next(socket, 'room:state');
    socket.emit('room:join', { code: 'PINOK', name: 'x', pin: '1234' });
    expect((await state).slots).toEqual([null, null]);
  });

  it('reports a missing room', async () => {
    const socket = await client();
    const error = next(socket, 'room:error');
    socket.emit('room:join', { code: 'NOPE1', name: 'x' });
    expect((await error).code).toBe('ROOM_NOT_FOUND');
  });
});

describe('writes are bound to the joined room', () => {
  it('ignores events from a socket that never joined, whatever code it sends', async () => {
    await rooms.createRoom('SAFE1', '2x2', '1234');
    const outsider = await client();
    outsider.emit('room:capture', { code: 'SAFE1', slotIndex: 0, imageDataUrl: PHOTO });
    outsider.emit('room:clear-slot', { code: 'SAFE1', slotIndex: 0 });
    await settle();
    expect((await rooms.getRoom('SAFE1')).slots[0]).toBeNull();
  });

  it('writes to the room it joined, not the code in the payload', async () => {
    await rooms.createRoom('ROOMA', '2x2', null);
    await rooms.createRoom('ROOMB', '2x2', null);
    const socket = await joined('ROOMA');
    socket.emit('room:capture', { code: 'ROOMB', slotIndex: 1, imageDataUrl: PHOTO });
    await settle();
    expect((await rooms.getRoom('ROOMA')).slots[1]).toBe(PHOTO);
    expect((await rooms.getRoom('ROOMB')).slots[1]).toBeNull();
  });

  it('rejects out-of-range slots and non-image payloads', async () => {
    await rooms.createRoom('VALID', '1x2', null);
    const socket = await joined('VALID');
    socket.emit('room:capture', { slotIndex: 5, imageDataUrl: PHOTO });
    socket.emit('room:capture', { slotIndex: -1, imageDataUrl: PHOTO });
    socket.emit('room:capture', { slotIndex: 0, imageDataUrl: 'javascript:alert(1)' });
    socket.emit('room:capture', { slotIndex: '0', imageDataUrl: PHOTO });
    await settle();
    const room = await rooms.getRoom('VALID');
    expect(room.slots).toEqual([null, null]);
    expect(room.history).toEqual([]);
  });
});

describe('capture lock', () => {
  it('gives the countdown to one person and blocks others until they keep the photo', async () => {
    await rooms.createRoom('LOCKS', '2x2', null);
    const alice = await joined('LOCKS');
    const bob = await joined('LOCKS');

    const done = next(alice, 'room:countdown-done');
    alice.emit('room:countdown-start', { slotIndex: 0 });
    bob.emit('room:countdown-start', { slotIndex: 1 }); // ignored: Alice holds the camera
    const { by, slotIndex } = await done;
    expect(by).toBe(alice.id);
    expect(slotIndex).toBe(0);

    bob.emit('room:capture', { slotIndex: 1, imageDataUrl: PHOTO });
    await settle();
    expect((await rooms.getRoom('LOCKS')).slots[1]).toBeNull();

    const unlocked = next(bob, 'room:lock');
    alice.emit('room:capture', { slotIndex: 0, imageDataUrl: PHOTO });
    expect(await unlocked).toBeNull();
    expect((await rooms.getRoom('LOCKS')).slots[0]).toBe(PHOTO);
  });

  it('releases the lock when the holder disconnects', async () => {
    await rooms.createRoom('DROPS', '2x2', null);
    const alice = await joined('DROPS');
    const bob = await joined('DROPS');
    alice.emit('room:countdown-start', { slotIndex: 0 });
    await next(bob, 'room:lock');

    const released = next(bob, 'room:lock');
    alice.close();
    expect(await released).toBeNull();
    expect((await rooms.getRoom('DROPS')).lock).toBeNull();
  });
});
