// Puts the MediaPipe runtime and models under public/mediapipe/ so the app
// serves them itself instead of loading them from jsDelivr and Google Cloud
// Storage at runtime (slow or blocked on some networks, mainland China included).
//
//  - The WASM runtime is copied from node_modules, so it always matches the
//    installed @mediapipe/tasks-vision version.
//  - The two models are downloaded once and kept; if a download fails the app
//    still works, the browser just falls back to Google's copy.
//
// Runs automatically before `npm run dev` and `npm run build`.
import { copyFile, mkdir, readdir, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const outDir = path.join(root, 'public', 'mediapipe');

const MODELS = {
  'selfie_segmenter.tflite':
    'https://storage.googleapis.com/mediapipe-models/image_segmenter/selfie_segmenter/float16/latest/selfie_segmenter.tflite',
  'face_landmarker.task':
    'https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/latest/face_landmarker.task',
};

async function exists(file) {
  try {
    return (await stat(file)).size > 0;
  } catch {
    return false;
  }
}

async function copyWasm() {
  // The package's "exports" hide package.json, so locate it directly.
  const from = path.join(root, 'node_modules', '@mediapipe', 'tasks-vision', 'wasm');
  const to = path.join(outDir, 'wasm');
  await mkdir(to, { recursive: true });
  const files = await readdir(from);
  await Promise.all(files.map((f) => copyFile(path.join(from, f), path.join(to, f))));
  console.log(`[mediapipe] wasm runtime copied (${files.length} files)`);
}

async function fetchModels() {
  const to = path.join(outDir, 'models');
  await mkdir(to, { recursive: true });
  for (const [name, url] of Object.entries(MODELS)) {
    const file = path.join(to, name);
    if (await exists(file)) continue;
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(30_000) });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      await writeFile(file, Buffer.from(await res.arrayBuffer()));
      console.log(`[mediapipe] downloaded ${name}`);
    } catch (err) {
      console.warn(`[mediapipe] could not download ${name} (${err.message}); the browser will load it from Google instead`);
    }
  }
}

await copyWasm();
await fetchModels();
