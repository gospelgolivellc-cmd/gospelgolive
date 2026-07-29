import { writeFile } from 'fs/promises';
import path from 'path';
import crypto from 'crypto';

const ALLOWED_TYPES = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
};

const MAX_BYTES = {
  avatar: 5 * 1024 * 1024,
  banner: 10 * 1024 * 1024,
  overlay: 10 * 1024 * 1024,
};

// The browser-supplied `file.type` is just the client's say-so — nothing
// stops a request from claiming image/png while the body is an HTML/JS
// polyglot. Confirming the real format from its magic bytes before writing
// it under a trusted extension closes that gap.
function sniffImageType(buffer) {
  if (buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) {
    return 'image/jpeg';
  }
  if (
    buffer.length >= 8 &&
    buffer[0] === 0x89 &&
    buffer[1] === 0x50 &&
    buffer[2] === 0x4e &&
    buffer[3] === 0x47 &&
    buffer[4] === 0x0d &&
    buffer[5] === 0x0a &&
    buffer[6] === 0x1a &&
    buffer[7] === 0x0a
  ) {
    return 'image/png';
  }
  if (
    buffer.length >= 12 &&
    buffer.toString('ascii', 0, 4) === 'RIFF' &&
    buffer.toString('ascii', 8, 12) === 'WEBP'
  ) {
    return 'image/webp';
  }
  return null;
}

// Saves an uploaded image to public/uploads/<kind>s/ and returns the public
// URL path to store on the model. Local disk is fine for developing this
// site — it won't survive a serverless/production deploy (e.g. Vercel), so
// this should move to real object storage (Supabase Storage, S3, etc.)
// before going live.
export async function saveUploadedImage(file, kind, ownerId) {
  if (!file || typeof file.arrayBuffer !== 'function') {
    throw new Error('No file provided');
  }
  if (!ALLOWED_TYPES[file.type]) {
    throw new Error('Unsupported image type — use JPEG, PNG, or WebP');
  }
  if (file.size > MAX_BYTES[kind]) {
    throw new Error(`Image is too large (max ${MAX_BYTES[kind] / (1024 * 1024)}MB)`);
  }

  const buffer = Buffer.from(await file.arrayBuffer());
  const sniffedType = sniffImageType(buffer);
  const ext = ALLOWED_TYPES[sniffedType];
  if (!ext) {
    throw new Error('File content does not match a supported image type');
  }

  const filename = `${ownerId}-${Date.now()}-${crypto.randomBytes(4).toString('hex')}.${ext}`;
  const dir = kind === 'avatar' ? 'avatars' : kind === 'overlay' ? 'overlays' : 'banners';
  const destPath = path.join(process.cwd(), 'public', 'uploads', dir, filename);

  await writeFile(destPath, buffer);

  return `/uploads/${dir}/${filename}`;
}
