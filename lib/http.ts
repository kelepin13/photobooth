// Shared helpers for the API routes: rate limiting, JSON parsing and image
// decoding, with errors that turn into proper HTTP responses.
import { NextResponse } from 'next/server';
import sharp from 'sharp';
import { checkRateLimit, getClientIp } from '@/lib/rate-limit';

export class HttpError extends Error {
  constructor(
    public status: number,
    message: string,
    public headers: Record<string, string> = {}
  ) {
    super(message);
  }
}

/** Throws a 429 if this client has used up `limit` requests in the window. */
export function enforceRateLimit(req: Request, name: string, limit: number, windowMs = 60_000): void {
  const { allowed, retryAfterMs } = checkRateLimit(`${getClientIp(req)}:${name}`, limit, windowMs);
  if (!allowed) {
    throw new HttpError(429, 'Too many requests, slow down a bit.', {
      'Retry-After': String(Math.ceil(retryAfterMs / 1000)),
    });
  }
}

/** Rejects bodies over `maxBytes` before reading them, then parses JSON (400 on bad JSON). */
export async function readJson<T>(req: Request, maxBytes: number): Promise<T> {
  const length = Number(req.headers.get('content-length') || 0);
  if (length > maxBytes) throw new HttpError(413, 'Request too large');
  try {
    return (await req.json()) as T;
  } catch {
    throw new HttpError(400, 'Request body must be JSON');
  }
}

const DATA_URL = /^data:image\/(jpeg|png|webp);base64,/;

/**
 * Decodes an image data URL and checks it really is an image sharp can read.
 * Anything else (wrong type, too big, corrupt) becomes a 400/413.
 */
export async function decodeImage(dataUrl: unknown, maxBytes: number): Promise<Buffer> {
  if (typeof dataUrl !== 'string' || !DATA_URL.test(dataUrl)) {
    throw new HttpError(400, 'Expected a JPEG, PNG or WebP data URL');
  }
  const base64 = dataUrl.slice(dataUrl.indexOf(',') + 1);
  if (base64.length * 0.75 > maxBytes) throw new HttpError(413, 'Image too large');
  const buffer = Buffer.from(base64, 'base64');
  try {
    await sharp(buffer).metadata();
  } catch {
    throw new HttpError(400, 'Not a readable image');
  }
  return buffer;
}

export function toDataUrl(buffer: Buffer, mime = 'image/jpeg'): string {
  return `data:${mime};base64,${buffer.toString('base64')}`;
}

/** Wraps a route handler so HttpErrors become JSON responses and anything else a logged 500. */
export function handle(fn: (req: Request) => Promise<Response>) {
  return async (req: Request): Promise<Response> => {
    try {
      return await fn(req);
    } catch (err) {
      if (err instanceof HttpError) {
        return NextResponse.json({ error: err.message }, { status: err.status, headers: err.headers });
      }
      console.error(JSON.stringify({ t: new Date().toISOString(), event: 'api_error', error: String(err) }));
      return NextResponse.json({ error: 'Something went wrong' }, { status: 500 });
    }
  };
}
