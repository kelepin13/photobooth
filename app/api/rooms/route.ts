import { NextResponse } from 'next/server';
import { createRoomWithNewCode, LAYOUTS } from '@/lib/rooms';
import { enforceRateLimit, handle, HttpError, readJson } from '@/lib/http';
import logger from '@/lib/logger';

export const runtime = 'nodejs';

export const POST = handle(async (req) => {
  enforceRateLimit(req, 'rooms', 20);
  const body = await readJson<{ layout?: unknown; pin?: unknown }>(req, 1024);

  const layout = typeof body.layout === 'string' && body.layout in LAYOUTS ? body.layout : '2x2';

  let pin: string | null = null;
  if (typeof body.pin === 'string' && body.pin.trim()) {
    pin = body.pin.trim();
    if (!/^\d{4,6}$/.test(pin)) throw new HttpError(400, 'PIN must be 4-6 digits');
  }

  const room = await createRoomWithNewCode(layout, pin);
  logger.increment('roomsCreated');
  logger.log('room_created', { code: room.code, layout, pin: !!pin });
  return NextResponse.json({ code: room.code });
});
