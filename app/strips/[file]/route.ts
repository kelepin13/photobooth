import { readFile } from 'fs/promises';
import path from 'path';
import { stripsDir } from '@/lib/storage';

export const runtime = 'nodejs';

// Serves strips published to local disk (lib/storage.js). Only names the app
// itself generates are accepted, so the path can never leave the folder.
const FILE_NAME = /^[a-f0-9]{8}\.jpg$/;

export async function GET(_req: Request, { params }: { params: { file: string } }) {
  if (!FILE_NAME.test(params.file)) return new Response('Not found', { status: 404 });
  try {
    const body = await readFile(path.join(stripsDir(), params.file));
    return new Response(body, {
      headers: { 'Content-Type': 'image/jpeg', 'Cache-Control': 'public, max-age=31536000, immutable' },
    });
  } catch {
    return new Response('Not found', { status: 404 });
  }
}
