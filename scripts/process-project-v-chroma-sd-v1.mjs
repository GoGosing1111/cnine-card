import fs from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import sharp from 'sharp';

const [, , inputPath, outputPath] = process.argv;

if (!inputPath || !outputPath) {
  throw new Error('usage: node scripts/process-project-v-chroma-sd-v1.mjs <input.png> <output.png>');
}

const CANVAS_SIZE = 1350;
const SAFE_MARGIN = 72;
const VISIBLE_ALPHA = 18;

const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
const smoothstep = (edge0, edge1, value) => {
  const t = clamp((value - edge0) / (edge1 - edge0), 0, 1);
  return t * t * (3 - 2 * t);
};

function estimateKeyColor(source, width, height, channels) {
  const samples = [];
  const border = Math.min(32, Math.floor(Math.min(width, height) / 8));

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      if (x >= border && x < width - border && y >= border && y < height - border) continue;
      const offset = (y * width + x) * channels;
      const red = source[offset];
      const green = source[offset + 1];
      const blue = source[offset + 2];
      if (green - Math.max(red, blue) < 120) continue;
      samples.push([red, green, blue]);
    }
  }

  if (!samples.length) throw new Error('could not estimate chroma-key color from the canvas border');
  return samples.reduce(
    (sum, sample) => ({ r: sum.r + sample[0], g: sum.g + sample[1], b: sum.b + sample[2] }),
    { r: 0, g: 0, b: 0 }
  );
}

function keyedRgba(source, width, height, channels, keyTotal, keySamples) {
  const output = Buffer.alloc(width * height * 4);
  const key = {
    r: keyTotal.r / keySamples,
    g: keyTotal.g / keySamples,
    b: keyTotal.b / keySamples
  };
  const keyExcess = Math.max(1, key.g - Math.max(key.r, key.b));

  for (let index = 0; index < width * height; index += 1) {
    const sourceOffset = index * channels;
    const outputOffset = index * 4;
    const red = source[sourceOffset];
    const green = source[sourceOffset + 1];
    const blue = source[sourceOffset + 2];
    const greenExcess = green - Math.max(red, blue);
    const rawAlpha = clamp(1 - greenExcess / (keyExcess * 0.95), 0, 1);
    const alphaUnit = smoothstep(0.16, 0.92, rawAlpha);
    const alpha = Math.round(255 * alphaUnit);

    if (alpha <= 3) {
      output[outputOffset] = 0;
      output[outputOffset + 1] = 0;
      output[outputOffset + 2] = 0;
      output[outputOffset + 3] = 0;
      continue;
    }

    const backgroundMix = 1 - rawAlpha;
    const recover = (value, keyValue) => clamp(Math.round((value - backgroundMix * keyValue) / rawAlpha), 0, 255);
    const recoveredRed = recover(red, key.r);
    const recoveredGreen = recover(green, key.g);
    const recoveredBlue = recover(blue, key.b);
    const greenFloor = Math.round(Math.min(recoveredRed, recoveredBlue) * 0.82);
    output[outputOffset] = recoveredRed;
    output[outputOffset + 1] = clamp(recoveredGreen, greenFloor, Math.max(recoveredRed, recoveredBlue) + 3);
    output[outputOffset + 2] = recoveredBlue;
    output[outputOffset + 3] = alpha;
  }

  return output;
}

function alphaBounds(data, width, height, threshold = VISIBLE_ALPHA) {
  let minX = width;
  let minY = height;
  let maxX = -1;
  let maxY = -1;

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      if (data[(y * width + x) * 4 + 3] < threshold) continue;
      minX = Math.min(minX, x);
      minY = Math.min(minY, y);
      maxX = Math.max(maxX, x);
      maxY = Math.max(maxY, y);
    }
  }

  if (maxX < minX || maxY < minY) throw new Error('no visible foreground remained after chroma keying');
  return { left: minX, top: minY, width: maxX - minX + 1, height: maxY - minY + 1 };
}

const { data: source, info } = await sharp(inputPath, { limitInputPixels: 100_000_000 })
  .removeAlpha()
  .raw()
  .toBuffer({ resolveWithObject: true });

const keyAccumulator = estimateKeyColor(source, info.width, info.height, info.channels);
const border = Math.min(32, Math.floor(Math.min(info.width, info.height) / 8));
let keySamples = 0;
for (let y = 0; y < info.height; y += 1) {
  for (let x = 0; x < info.width; x += 1) {
    if (x >= border && x < info.width - border && y >= border && y < info.height - border) continue;
    const offset = (y * info.width + x) * info.channels;
    if (source[offset + 1] - Math.max(source[offset], source[offset + 2]) >= 120) keySamples += 1;
  }
}
const rgba = keyedRgba(source, info.width, info.height, info.channels, keyAccumulator, keySamples);
const bounds = alphaBounds(rgba, info.width, info.height);
const available = CANVAS_SIZE - SAFE_MARGIN * 2;
const scale = Math.min(1, available / bounds.width, available / bounds.height);
const targetWidth = Math.max(1, Math.round(bounds.width * scale));
const targetHeight = Math.max(1, Math.round(bounds.height * scale));

const cutout = await sharp(rgba, {
  raw: { width: info.width, height: info.height, channels: 4 }
})
  .extract(bounds)
  .resize(targetWidth, targetHeight, { fit: 'fill', kernel: sharp.kernel.lanczos3 })
  .png({ compressionLevel: 9, adaptiveFiltering: true })
  .toBuffer();

const left = Math.round((CANVAS_SIZE - targetWidth) / 2);
const top = CANVAS_SIZE - SAFE_MARGIN - targetHeight;
await fs.mkdir(path.dirname(outputPath), { recursive: true });
await sharp({
  create: {
    width: CANVAS_SIZE,
    height: CANVAS_SIZE,
    channels: 4,
    background: { r: 0, g: 0, b: 0, alpha: 0 }
  }
})
  .composite([{ input: cutout, left, top }])
  .png({ compressionLevel: 9, adaptiveFiltering: true })
  .toFile(outputPath);

const normalizedOutput = outputPath.replaceAll('\\', '/');
const zenithMarker = 'assets/ui/project-v/characters/zenith/';
const responsiveFiles = [];
if (normalizedOutput.includes(zenithMarker)) {
  const baseName = path.basename(outputPath, path.extname(outputPath));
  const responsiveDir = path.resolve('assets/responsive/project-v/zenith');
  await fs.mkdir(responsiveDir, { recursive: true });
  for (const width of [384, 768]) {
    const image = sharp(outputPath, { limitInputPixels: 100_000_000 }).resize({ width, kernel: sharp.kernel.lanczos3 });
    const avifPath = path.join(responsiveDir, `${baseName}-${width}.avif`);
    const webpPath = path.join(responsiveDir, `${baseName}-${width}.webp`);
    await image.clone().avif({ quality: 52, effort: 2 }).toFile(avifPath);
    await image.clone().webp({ quality: 76, alphaQuality: 100, effort: 4 }).toFile(webpPath);
    responsiveFiles.push(avifPath, webpPath);
  }
}

console.log(JSON.stringify({ inputPath, outputPath, source: info, bounds, scale, targetWidth, targetHeight, left, top, responsiveFiles }, null, 2));
