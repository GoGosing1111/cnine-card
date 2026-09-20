import path from 'node:path';
import { mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '../..');
const sourcePath = path.join(root, 'assets/cards/ZENITH/20.jpg');
const framePath = path.join(root, 'assets/ui/card-frames/icon-streamer-frame-v1.png');
const outputPath = path.join(here, 'assets/diim-zenith-icon-card-preview-v1.png');

await mkdir(path.dirname(outputPath), { recursive: true });

const canvas = { width: 1024, height: 1536 };
const windowRect = { left: 100, top: 135, width: 824, height: 1281, radius: 66 };

const roundedMask = Buffer.from(`
  <svg width="${windowRect.width}" height="${windowRect.height}" xmlns="http://www.w3.org/2000/svg">
    <rect width="100%" height="100%" rx="${windowRect.radius}" fill="white"/>
  </svg>
`);

const portrait = await sharp(sourcePath)
  .resize(windowRect.width, windowRect.height, { fit: 'cover', position: 'centre' })
  .composite([{ input: roundedMask, blend: 'dest-in' }])
  .png()
  .toBuffer();

const gradeBadge = Buffer.from(`
  <svg width="176" height="52" xmlns="http://www.w3.org/2000/svg">
    <defs>
      <linearGradient id="edge" x1="0" x2="1">
        <stop offset="0" stop-color="#f7e2a4"/>
        <stop offset="0.55" stop-color="#d8b55f"/>
        <stop offset="1" stop-color="#d5f5ff"/>
      </linearGradient>
    </defs>
    <rect x="1" y="1" width="174" height="50" rx="25" fill="#070705" fill-opacity="0.82" stroke="url(#edge)" stroke-width="2"/>
    <circle cx="27" cy="26" r="6" fill="#f5d77f"/>
    <circle cx="27" cy="26" r="11" fill="none" stroke="#fff4c9" stroke-opacity="0.32"/>
    <text x="49" y="34" fill="#fff6d9" font-family="Arial, sans-serif" font-size="22" font-weight="800" letter-spacing="5">ICON</text>
  </svg>
`);

await sharp({ create: { ...canvas, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } })
  .composite([
    { input: portrait, left: windowRect.left, top: windowRect.top },
    { input: framePath, left: 0, top: 0 },
    { input: gradeBadge, left: 128, top: 188 }
  ])
  .png({ compressionLevel: 9 })
  .toFile(outputPath);

console.log(outputPath);
