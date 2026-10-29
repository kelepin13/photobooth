import { NextResponse } from 'next/server';
import QRCode from 'qrcode';
import { getRoom } from '@/lib/rooms';

export const runtime = 'nodejs';

export async function GET(req: Request, { params }: { params: { code: string } }) {
  const room = await getRoom(params.code.toUpperCase());
  if (!room) {
    return NextResponse.json({ error: 'Room not found' }, { status: 404 });
  }

  // PUBLIC_URL wins when set (e.g. behind a proxy, or a LAN IP for phones in dev).
  const origin = process.env.PUBLIC_URL?.replace(/\/$/, '') || new URL(req.url).origin;
  const joinUrl = `${origin}/room/${room.code}`;
  const qrDataUrl = await QRCode.toDataURL(joinUrl);

  return NextResponse.json({
    code: room.code,
    slots: room.slots,
    layout: room.layout,
    columns: room.columns,
    hasPin: !!room.pin, // never expose the PIN itself
    joinUrl,
    qrDataUrl,
  });
}
