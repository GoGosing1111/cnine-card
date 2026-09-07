import fs from 'node:fs/promises';
import crypto from 'node:crypto';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import sharp from 'sharp';

// Read-only pixel inspection. Never edits, crops or removes image backgrounds.
export async function inspectMercenarySprite(input) {
  const bytes = Buffer.isBuffer(input) ? input : await fs.readFile(input);
  const metadata = await sharp(bytes).metadata();
  const { data, info } = await sharp(bytes).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  let clear = 0, solid = 0, partial = 0;
  let left = info.width, top = info.height, right = -1, bottom = -1;
  for (let y = 0; y < info.height; y++) {
    for (let x = 0; x < info.width; x++) {
      const alpha = data[(y * info.width + x) * 4 + 3];
      if (alpha === 0) clear++;
      else if (alpha >= 240) solid++;
      else partial++;
      if (alpha >= 128) {
        left = Math.min(left, x); right = Math.max(right, x);
        top = Math.min(top, y); bottom = Math.max(bottom, y);
      }
    }
  }
  let footLeft = info.width, footRight = -1;
  const footTop = Math.max(top, bottom - Math.round((bottom - top) * 0.12));
  for (let y = footTop; y <= bottom; y++) {
    for (let x = 0; x < info.width; x++) {
      if (data[(y * info.width + x) * 4 + 3] >= 128) {
        footLeft = Math.min(footLeft, x); footRight = Math.max(footRight, x);
      }
    }
  }
  const pixels = info.width * info.height;
  return {
    sha256: crypto.createHash('sha256').update(bytes).digest('hex').toUpperCase(),
    width: metadata.width, height: metadata.height,
    format: metadata.format, channels: metadata.channels, hasAlpha: metadata.hasAlpha,
    transparentPixels: clear, solidPixels: solid, partialPixels: partial,
    transparentFraction: Number((clear / pixels).toFixed(6)),
    solidFraction: Number((solid / pixels).toFixed(6)),
    visibleBounds: { left, top, right, bottom },
    cornerAlpha: [[0, 0], [info.width - 1, 0], [0, info.height - 1], [info.width - 1, info.height - 1]]
      .map(([x, y]) => data[(y * info.width + x) * 4 + 3]),
    footAnchor: {
      x: Number(((footLeft + footRight + 1) / 2 / info.width).toFixed(6)),
      y: Number(((bottom + 1) / info.height).toFixed(6))
    }
  };
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  for (const file of process.argv.slice(2)) console.log(JSON.stringify({ file, ...await inspectMercenarySprite(file) }));
}
