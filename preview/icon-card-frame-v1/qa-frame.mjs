import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import sharp from 'sharp';

const here = path.dirname(fileURLToPath(import.meta.url));
const framePath = path.resolve(here, '../../assets/ui/card-frames/icon-streamer-frame-v1.png');
const approvedSha256 = '1368693F6861B7ABDCC8601CBF7EB5DAA13B5063B579DB3A8A38285CDCD0CA6F';
const image = sharp(framePath);
const metadata = await image.metadata();

const digest = createHash('sha256').update(await readFile(framePath)).digest('hex').toUpperCase();
assert.equal(digest, approvedSha256, 'approved ICON frame bytes must not change');

assert.equal(metadata.width, 1024, 'frame width must be 1024px');
assert.equal(metadata.height, 1536, 'frame height must be 1536px');
assert.equal(metadata.hasAlpha, true, 'frame must have an alpha channel');

const { data, info } = await image.ensureAlpha().raw().toBuffer({ resolveWithObject: true });
const alphaAt = (x, y) => data[(y * info.width + x) * info.channels + 3];

for (const [x, y] of [[0, 0], [1023, 0], [0, 1535], [1023, 1535], [512, 768], [512, 1100]]) {
  assert.equal(alphaAt(x, y), 0, `expected transparent pixel at ${x},${y}`);
}

let transparent = 0;
let samples = 0;
for (let y = 320; y < 1260; y += 8) {
  for (let x = 180; x < 844; x += 8) {
    samples += 1;
    if (alphaAt(x, y) === 0) transparent += 1;
  }
}
assert.ok(transparent / samples > 0.995, 'central portrait window must remain transparent');

console.log(JSON.stringify({
  file: framePath,
  dimensions: `${metadata.width}x${metadata.height}`,
  sha256: digest,
  alpha: metadata.hasAlpha,
  centralTransparency: transparent / samples
}, null, 2));
