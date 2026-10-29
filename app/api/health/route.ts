import { NextResponse } from 'next/server';
import { usingRedis, _rooms } from '@/lib/rooms';
import { getStats } from '@/lib/logger';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  return NextResponse.json({
    status: 'ok',
    ...getStats({
      roomBackend: usingRedis ? 'redis' : 'memory',
      activeRooms: usingRedis ? undefined : _rooms?.size,
    }),
  });
}
