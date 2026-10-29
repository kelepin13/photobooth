import { NextResponse } from 'next/server';
import sharp from 'sharp';
import { decodeImage, enforceRateLimit, handle, readJson, toDataUrl } from '@/lib/http';
import { isFilterName } from '@/lib/filters';
import type { FilterName } from '@/types/room';

export const runtime = 'nodejs';

const MAX_IMAGE_BYTES = 8 * 1024 * 1024; // one captured photo, generously sized

async function applyFilter(input: Buffer, filter: FilterName): Promise<Buffer> {
  let img = sharp(input).rotate(); // respect EXIF orientation

  switch (filter) {
    case 'grayscale':
      img = img.grayscale();
      break;
    case 'sepia':
      img = img.grayscale().tint({ r: 112, g: 66, b: 20 });
      break;
    case 'vintage':
      img = img.modulate({ saturation: 0.6, brightness: 1.05 }).tint({ r: 230, g: 200, b: 160 }).gamma(1.1);
      break;
    case 'cool':
      img = img.tint({ r: 200, g: 220, b: 255 }).modulate({ saturation: 1.1 });
      break;
    case 'warm':
      img = img.tint({ r: 255, g: 220, b: 190 }).modulate({ saturation: 1.1 });
      break;
    case 'highContrast':
      img = img.linear(1.3, -20).sharpen();
      break;
    case 'none':
      break;
  }

  return img.jpeg({ quality: 90 }).toBuffer();
}

export const POST = handle(async (req) => {
  enforceRateLimit(req, 'filter', 30);
  const body = await readJson<{ imageDataUrl?: unknown; filter?: unknown }>(req, MAX_IMAGE_BYTES * 1.4);
  const input = await decodeImage(body.imageDataUrl, MAX_IMAGE_BYTES);
  const filter = isFilterName(body.filter) ? body.filter : 'none';

  const output = await applyFilter(input, filter);
  return NextResponse.json({ imageDataUrl: toDataUrl(output) });
});
