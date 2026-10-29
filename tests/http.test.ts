import { describe, expect, it } from 'vitest';
import sharp from 'sharp';
import { decodeImage, HttpError } from '@/lib/http';

const rooms = require('../lib/rooms');

async function tinyJpeg() {
  const buf = await sharp({ create: { width: 4, height: 4, channels: 3, background: '#f0f' } }).jpeg().toBuffer();
  return `data:image/jpeg;base64,${buf.toString('base64')}`;
}

describe('decodeImage', () => {
  it('returns the bytes of a real image', async () => {
    const buf = await decodeImage(await tinyJpeg(), 1024 * 1024);
    expect((await sharp(buf).metadata()).width).toBe(4);
  });

  it.each([
    ['not a string', 42],
    ['an SVG', 'data:image/svg+xml;base64,PHN2Zz48L3N2Zz4='],
    ['garbage bytes', `data:image/png;base64,${Buffer.from('hello').toString('base64')}`],
  ])('rejects %s with 400', async (_label, input) => {
    await expect(decodeImage(input, 1024 * 1024)).rejects.toMatchObject({ status: 400 });
  });

  it('rejects images over the size limit with 413', async () => {
    const err = await decodeImage(await tinyJpeg(), 10).catch((e) => e);
    expect(err).toBeInstanceOf(HttpError);
    expect(err.status).toBe(413);
  });
});

describe('room codes', () => {
  it('uses only unambiguous characters', () => {
    for (let i = 0; i < 200; i++) {
      expect(rooms.generateCode()).toMatch(/^[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{5}$/);
    }
  });

  it('creates rooms under distinct codes', async () => {
    const codes = new Set<string>();
    for (let i = 0; i < 50; i++) codes.add((await rooms.createRoomWithNewCode('2x2', null)).code);
    expect(codes.size).toBe(50);
  });
});
