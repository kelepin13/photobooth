// Storage abstraction for published strips.
//
// If S3_BUCKET (+ S3_ENDPOINT, S3_ACCESS_KEY_ID, S3_SECRET_ACCESS_KEY) are set,
// uploads go to S3-compatible object storage (AWS S3, Cloudflare R2, Supabase
// Storage's S3-compatible endpoint, etc.) and the link survives redeploys.
//
// Otherwise, falls back to local disk under STRIPS_DIR (default data/strips),
// served by app/strips/[file]/route.ts. Works with zero config; it survives
// redeploys only if that folder is on a persistent volume.
//
// (Not public/: Next.js only serves public/ files that existed when the server
// started, so a strip written there at runtime would 404.)
const path = require('path');
const { writeFile, mkdir } = require('fs/promises');

function isS3Configured() {
  return !!(process.env.S3_BUCKET && process.env.S3_ACCESS_KEY_ID && process.env.S3_SECRET_ACCESS_KEY);
}

async function saveToS3(buffer, id) {
  // Lazy import so the app still runs fine with zero S3 env vars set and
  // without forcing the SDK to initialize.
  const { S3Client, PutObjectCommand } = require('@aws-sdk/client-s3');
  const client = new S3Client({
    region: process.env.S3_REGION || 'auto',
    endpoint: process.env.S3_ENDPOINT || undefined, // undefined = real AWS S3
    credentials: {
      accessKeyId: process.env.S3_ACCESS_KEY_ID,
      secretAccessKey: process.env.S3_SECRET_ACCESS_KEY,
    },
    forcePathStyle: !!process.env.S3_ENDPOINT, // needed for R2 / most S3-compatible providers
  });

  const key = `strips/${id}.jpg`;
  await client.send(
    new PutObjectCommand({
      Bucket: process.env.S3_BUCKET,
      Key: key,
      Body: buffer,
      ContentType: 'image/jpeg',
    })
  );

  const publicBase = process.env.S3_PUBLIC_URL_BASE; // e.g. https://cdn.example.com or https://<bucket>.r2.dev
  const url = publicBase
    ? `${publicBase.replace(/\/$/, '')}/${key}`
    : `${process.env.S3_ENDPOINT?.replace(/\/$/, '')}/${process.env.S3_BUCKET}/${key}`;

  return { backend: 's3', url };
}

function stripsDir() {
  return path.resolve(process.env.STRIPS_DIR || path.join(process.cwd(), 'data', 'strips'));
}

async function saveToLocalDisk(buffer, id, origin) {
  const dir = stripsDir();
  await mkdir(dir, { recursive: true });
  await writeFile(path.join(dir, `${id}.jpg`), buffer);
  return { backend: 'local', url: `${origin}/strips/${id}.jpg` };
}

/**
 * @param {Buffer} buffer - JPEG bytes to store
 * @param {string} id - short unique id (filename stem)
 * @param {string} origin - e.g. https://myapp.fly.dev (used for the local-disk fallback URL)
 */
async function saveStrip(buffer, id, origin) {
  if (isS3Configured()) return saveToS3(buffer, id);
  return saveToLocalDisk(buffer, id, origin);
}

module.exports = { saveStrip, isS3Configured, stripsDir };
