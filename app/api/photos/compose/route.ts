import { NextResponse } from 'next/server';
import sharp from 'sharp';
import { gridDimensions, slotPosition } from '@/lib/compose-layout';
import { decodeImage, enforceRateLimit, handle, HttpError, readJson, toDataUrl } from '@/lib/http';

export const runtime = 'nodejs';

const CELL = 420; // px per photo
const GAP = 12;
const PADDING = 24;
const FOOTER_HEIGHT = 64;
const MAX_IMAGE_BYTES = 8 * 1024 * 1024; // per photo
const MAX_SLOTS = 6;
const MAX_COLUMNS = 3;
const MAX_CAPTION = 60;

function escapeXml(text: string) {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

interface ComposeBody {
  slots?: unknown;
  columns?: unknown;
  caption?: unknown;
}

export const POST = handle(async (req) => {
  enforceRateLimit(req, 'compose', 10); // heavier than a single filter call
  const body = await readJson<ComposeBody>(req, MAX_SLOTS * MAX_IMAGE_BYTES * 1.4);

  const slots = Array.isArray(body.slots) ? (body.slots as unknown[]) : [];
  if (slots.length === 0 || slots.length > MAX_SLOTS) throw new HttpError(400, `Send 1 to ${MAX_SLOTS} slots`);
  if (!slots.some(Boolean)) throw new HttpError(400, 'At least one photo is required');

  const columns = Math.min(MAX_COLUMNS, Math.max(1, Number.parseInt(String(body.columns ?? 2), 10) || 2));
  const caption = typeof body.caption === 'string' ? body.caption.slice(0, MAX_CAPTION).trim() : '';

  const { cols, gridWidth, gridHeight } = gridDimensions(slots.length, columns, CELL, GAP);
  const canvasWidth = gridWidth + PADDING * 2;
  const canvasHeight = gridHeight + PADDING * 2 + FOOTER_HEIGHT;

  const photos = await Promise.all(
    slots.map(async (slot, i) => {
      if (!slot) return null;
      const input = await decodeImage(slot, MAX_IMAGE_BYTES);
      const buf = await sharp(input).rotate().resize(CELL, CELL, { fit: 'cover' }).jpeg().toBuffer();
      return { input: buf, ...slotPosition(i, cols, CELL, GAP, PADDING) };
    })
  );
  const overlays: sharp.OverlayOptions[] = photos.filter((p): p is NonNullable<typeof p> => p !== null);

  const dateLabel = new Date().toLocaleDateString('en-CA'); // YYYY-MM-DD
  const footerSvg = `
    <svg width="${canvasWidth}" height="${FOOTER_HEIGHT}" xmlns="http://www.w3.org/2000/svg">
      <text x="${canvasWidth / 2}" y="${FOOTER_HEIGHT * 0.42}" font-family="sans-serif" font-weight="700"
        font-size="26" fill="#2d1b4e" text-anchor="middle">${escapeXml(caption || 'Online Photobooth')}</text>
      <text x="${canvasWidth / 2}" y="${FOOTER_HEIGHT * 0.78}" font-family="sans-serif"
        font-size="16" fill="#8a7f96" text-anchor="middle">${dateLabel}</text>
    </svg>`;
  overlays.push({ input: Buffer.from(footerSvg), left: 0, top: PADDING + gridHeight });

  const output = await sharp({
    create: { width: canvasWidth, height: canvasHeight, channels: 3, background: { r: 255, g: 255, b: 255 } },
  })
    .composite(overlays)
    .jpeg({ quality: 92 })
    .toBuffer();

  return NextResponse.json({ imageDataUrl: toDataUrl(output) });
});
