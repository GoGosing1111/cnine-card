import {createHash} from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import sharp from 'sharp';

const [, , inputPath, outputPath, responsiveDir, ...flags] = process.argv;

if (!inputPath || !outputPath || !responsiveDir) {
  throw new Error('usage: node scripts/process-project-v-alpha-sd-v1.mjs <input.png> <output.png> <responsive-dir> [--copy-webp-next-to-master]');
}

const CANVAS_SIZE = 1350;
const SAFE_MARGIN = 72;
const VISIBLE_ALPHA = 18;
const COPY_WEBP_NEXT_TO_MASTER = flags.includes('--copy-webp-next-to-master');

function alphaBounds(data, width, height) {
  let minX = width;
  let minY = height;
  let maxX = -1;
  let maxY = -1;
  let transparent = 0;
  let opaque = 0;
  let partial = 0;

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const alpha = data[(y * width + x) * 4 + 3];
      if (alpha === 0) transparent += 1;
      else if (alpha === 255) opaque += 1;
      else partial += 1;
      if (alpha <= VISIBLE_ALPHA) continue;
      minX = Math.min(minX, x);
      minY = Math.min(minY, y);
      maxX = Math.max(maxX, x);
      maxY = Math.max(maxY, y);
    }
  }

  if (maxX < minX || maxY < minY) throw new Error('input has no visible alpha foreground');
  return {
    x: minX,
    y: minY,
    width: maxX - minX + 1,
    height: maxY - minY + 1,
    alphaPixels: {transparent, opaque, partial}
  };
}

async function sha256(filePath) {
  const buffer = await fs.readFile(filePath);
  return createHash('sha256').update(buffer).digest('hex').toUpperCase();
}

const {data: rgba, info} = await sharp(inputPath, {limitInputPixels: 100_000_000})
  .ensureAlpha()
  .raw()
  .toBuffer({resolveWithObject: true});
const bounds = alphaBounds(rgba, info.width, info.height);
const available = CANVAS_SIZE - SAFE_MARGIN * 2;
const scale = Math.min(1, available / bounds.width, available / bounds.height);
const targetWidth = Math.max(1, Math.round(bounds.width * scale));
const targetHeight = Math.max(1, Math.round(bounds.height * scale));
const cutout = await sharp(rgba, {
  raw: {width: info.width, height: info.height, channels: 4}
})
  .extract({left: bounds.x, top: bounds.y, width: bounds.width, height: bounds.height})
  .resize(targetWidth, targetHeight, {fit: 'fill', kernel: sharp.kernel.lanczos3})
  .png({compressionLevel: 9, adaptiveFiltering: true})
  .toBuffer();
const left = Math.round((CANVAS_SIZE - targetWidth) / 2);
const top = CANVAS_SIZE - SAFE_MARGIN - targetHeight;

await fs.mkdir(path.dirname(outputPath), {recursive: true});
await sharp({
  create: {
    width: CANVAS_SIZE,
    height: CANVAS_SIZE,
    channels: 4,
    background: {r: 0, g: 0, b: 0, alpha: 0}
  }
})
  .composite([{input: cutout, left, top}])
  .png({compressionLevel: 9, adaptiveFiltering: true})
  .toFile(outputPath);

await fs.mkdir(responsiveDir, {recursive: true});
const baseName = path.basename(outputPath, path.extname(outputPath));
const responsive = {avif: [], webp: []};
for (const width of [384, 768]) {
  const image = sharp(outputPath, {limitInputPixels: 100_000_000}).resize({width, kernel: sharp.kernel.lanczos3});
  const avifPath = path.join(responsiveDir, `${baseName}-${width}.avif`);
  const webpPath = path.join(responsiveDir, `${baseName}-${width}.webp`);
  await image.clone().avif({quality: 52, effort: 2}).toFile(avifPath);
  await image.clone().webp({quality: 76, alphaQuality: 100, effort: 4}).toFile(webpPath);
  const avifMetadata = await sharp(avifPath).metadata();
  const webpMetadata = await sharp(webpPath).metadata();
  responsive.avif.push({path: avifPath.replaceAll('\\', '/'), width: avifMetadata.width, height: avifMetadata.height});
  responsive.webp.push({path: webpPath.replaceAll('\\', '/'), width: webpMetadata.width, height: webpMetadata.height});
}

let adjacentWebp = null;
if (COPY_WEBP_NEXT_TO_MASTER) {
  adjacentWebp = path.join(path.dirname(outputPath), `${baseName}-768.webp`);
  await fs.copyFile(path.join(responsiveDir, `${baseName}-768.webp`), adjacentWebp);
}

const normalized = await sharp(outputPath).ensureAlpha().raw().toBuffer({resolveWithObject: true});
const normalizedBounds = alphaBounds(normalized.data, normalized.info.width, normalized.info.height);
const margins = {
  left: normalizedBounds.x,
  top: normalizedBounds.y,
  right: normalized.info.width - normalizedBounds.x - normalizedBounds.width,
  bottom: normalized.info.height - normalizedBounds.y - normalizedBounds.height
};

console.log(JSON.stringify({
  inputPath,
  outputPath,
  source: {width: info.width, height: info.height, channels: info.channels},
  canvas: {width: normalized.info.width, height: normalized.info.height, mode: 'RGBA', backgroundAlpha: normalized.data[3]},
  alphaBounds: normalizedBounds,
  margins,
  safeMarginPx: Math.min(...Object.values(margins)),
  footAnchor: [Number(((normalizedBounds.x + normalizedBounds.width / 2) / normalized.info.width).toFixed(6)), Number(((normalizedBounds.y + normalizedBounds.height) / normalized.info.height).toFixed(6))],
  sha256: await sha256(outputPath),
  responsive,
  adjacentWebp: adjacentWebp ? {path: adjacentWebp.replaceAll('\\', '/'), sha256: await sha256(adjacentWebp)} : null
}, null, 2));
