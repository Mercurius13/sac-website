/* Image uploads: accept a JPEG/PNG/WebP in memory, then re-encode it down to a sane size
so admins can't bloat the repo with huge originals. */
import sharp from 'sharp';
import multer from 'multer';
import { randomBytes } from 'node:crypto';
import { slugify } from '../src/paths.js';

const MAX_UPLOAD_BYTES = 12 * 1024 * 1024;
const MAX_WIDTH = 1600;
const JPEG_QUALITY = 80;

const ALLOWED_MIME = new Set(['image/jpeg', 'image/png', 'image/webp']);

// hold the upload in memory and reject anything too big or not an allowed image type
export const uploadMiddleware = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_UPLOAD_BYTES, files: 1 },
  fileFilter(req, file, cb) {
    if (ALLOWED_MIME.has(file.mimetype)) return cb(null, true);
    cb(new Error(`Unsupported file type "${file.mimetype}". Upload a JPEG, PNG, or WebP image.`));
  },
});

// shrink to max width and re-encode - png if it has transparency, otherwise progressive jpeg
export async function processImage(buffer) {
  const image = sharp(buffer, { limitInputPixels: 268402689 });
  const meta = await image.metadata();

  const resized = image.rotate().resize({
    width: meta.width > MAX_WIDTH ? MAX_WIDTH : undefined,
    withoutEnlargement: true,
  });

  if (meta.hasAlpha) {
    return { buffer: await resized.png({ compressionLevel: 9 }).toBuffer(), ext: 'png' };
  }
  return { buffer: await resized.jpeg({ quality: JPEG_QUALITY, progressive: true, mozjpeg: true }).toBuffer(), ext: 'jpg' };
}

// a safe, unique filename: slug of the original name + a short random suffix
export function uploadFilename(originalName, ext) {
  const base = slugify(originalName.replace(/\.[^.]+$/, '')) || 'image';
  const unique = randomBytes(4).toString('hex');
  return `${base}-${unique}.${ext}`;
}
