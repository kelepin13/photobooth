import { NextResponse } from 'next/server';
import { randomUUID } from 'crypto';
import QRCode from 'qrcode';
import sharp from 'sharp';
import { saveStrip } from '@/lib/storage';
import { decodeImage, enforceRateLimit, handle, readJson } from '@/lib/http';

export const runtime = 'nodejs';

const MAX_IMAGE_BYTES = 12 * 1024 * 1024; // a composed strip is bigger than one photo

export const POST = handle(async (req) => {
  enforceRateLimit(req, 'publish', 10);
  const body = await readJson<{ imageDataUrl?: unknown }>(req, MAX_IMAGE_BYTES * 1.4);
  const input = await decodeImage(body.imageDataUrl, MAX_IMAGE_BYTES);

  // Re-encode instead of storing the upload as-is: whatever is published at
  // the public URL is guaranteed to be a plain JPEG with metadata stripped.
  const jpeg = await sharp(input).rotate().jpeg({ quality: 90 }).toBuffer();

  const origin = process.env.PUBLIC_URL?.replace(/\/$/, '') || new URL(req.url).origin;
  const id = randomUUID().slice(0, 8);
  const { url } = await saveStrip(jpeg, id, origin);
  const qrDataUrl = await QRCode.toDataURL(url);

  return NextResponse.json({ url, qrDataUrl });
});
