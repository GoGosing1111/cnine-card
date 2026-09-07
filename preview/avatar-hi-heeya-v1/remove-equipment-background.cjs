#!/usr/bin/env node
'use strict';

// User-approved background-only extraction. Opaque character pixels are invariant.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const {execFileSync} = require('node:child_process');
const sharp = require('sharp');

const root = path.resolve(__dirname, '../..');
const assets = path.join(__dirname, 'assets');
const source = path.join(assets, 'avatar-hi-heeya-equipment-draft-v2.png');
const candidate = path.join(assets, 'avatar-hi-heeya-equipment-alpha-candidate-v1.png');
const output = path.join(assets, 'avatar-hi-heeya-equipment-source-art-v1.png');
const expectedSourceHash = '98BF04A3D573F32C1A26CE1B480861AE33505FD706ADE8FC065D2735CA9C6E38';
const sha = buffer => crypto.createHash('sha256').update(buffer).digest('hex').toUpperCase();
const light = (data, p) => {
  const rgb = [data[p * 4], data[p * 4 + 1], data[p * 4 + 2]];
  return Math.max(...rgb) - Math.min(...rgb) <= 14 && (rgb[0] + rgb[1] + rgb[2]) / 3 >= 205;
};

async function main() {
  if (sha(fs.readFileSync(source)) !== expectedSourceHash) throw new Error('Source draft hash differs; re-review the background seeds before processing.');
  execFileSync(process.execPath, [path.join(root, 'scripts/remove-connected-light-background.cjs'), source, candidate], {stdio: 'inherit'});
  const {data, info} = await sharp(candidate).ensureAlpha().raw().toBuffer({resolveWithObject: true});
  const {width, height} = info;
  const count = width * height;
  const original = Buffer.from(data);
  const queue = new Int32Array(count);
  const neighbors = (p, visit) => {
    const x = p % width, y = Math.floor(p / width);
    if (x) visit(p - 1);
    if (x + 1 < width) visit(p + 1);
    if (y) visit(p - width);
    if (y + 1 < height) visit(p + width);
  };

  // Observed enclosed background only: bent-arm aperture, two hair/cheek gaps.
  // No globally selected whites: the white sneakers must remain opaque.
  const seeds = [[360, 560], [423, 245], [448, 292]];
  let enclosedRemoved = 0;
  for (const [x, y] of seeds) {
    const start = y * width + x;
    if (!light(data, start)) throw new Error(`Background seed intersects non-background at ${x},${y}`);
    if (data[start * 4 + 3] === 0) continue;
    let read = 0, write = 1;
    queue[0] = start; data[start * 4 + 3] = 0;
    while (read < write) {
      const p = queue[read++]; enclosedRemoved++;
      neighbors(p, n => {
        if (data[n * 4 + 3] && light(data, n)) {data[n * 4 + 3] = 0; queue[write++] = n;}
      });
    }
  }

  // Distance to the background. Only a two-pixel edge band may be decontaminated.
  const distance = new Uint8Array(count); distance.fill(255);
  let read = 0, write = 0;
  for (let p = 0; p < count; p++) if (!data[p * 4 + 3]) {distance[p] = 0; queue[write++] = p;}
  while (read < write) {
    const p = queue[read++]; if (distance[p] >= 4) continue;
    neighbors(p, n => {if (distance[n] > distance[p] + 1) {distance[n] = distance[p] + 1; queue[write++] = n;}});
  }
  const mask = Buffer.from(data);
  let partial = 0, edgeRemoved = 0;
  for (let p = 0; p < count; p++) {
    if (!distance[p] || distance[p] > 2) continue;
    const x = p % width, y = Math.floor(p / width);
    let inner = -1, innerDistance = Infinity;
    const backgrounds = [[], [], []];
    for (let dy = -4; dy <= 4; dy++) for (let dx = -4; dx <= 4; dx++) {
      const nx = x + dx, ny = y + dy;
      if (nx < 0 || nx >= width || ny < 0 || ny >= height) continue;
      const n = ny * width + nx, d = dx * dx + dy * dy;
      if (distance[n] >= 3 && d < innerDistance) {inner = n; innerDistance = d;}
      const rgb = [mask[n * 4], mask[n * 4 + 1], mask[n * 4 + 2]];
      if (!distance[n] && Math.min(...rgb) >= 235 && Math.max(...rgb) - Math.min(...rgb) <= 6) {
        for (let c = 0; c < 3; c++) backgrounds[c].push(rgb[c]);
      }
    }
    if (inner < 0) continue; // Keep detached hair wisps instead of erasing them.
    const bg = backgrounds.map(values => values.length ? values.sort((a, b) => a - b)[Math.floor(values.length / 2)] : 249);
    let dot = 0, norm = 0;
    for (let c = 0; c < 3; c++) {
      const delta = mask[inner * 4 + c] - bg[c];
      dot += (mask[p * 4 + c] - bg[c]) * delta;
      norm += delta * delta;
    }
    if (norm < 100) continue;
    const alpha = Math.max(0, Math.min(1, dot / norm));
    if (alpha >= 0.985) continue;
    if (alpha <= 0.04) {data[p * 4 + 3] = 0; edgeRemoved++; continue;}
    data[p * 4 + 3] = Math.round(alpha * 255); partial++;
    for (let c = 0; c < 3; c++) data[p * 4 + c] = Math.round(Math.max(0, Math.min(255, (mask[p * 4 + c] - (1 - alpha) * bg[c]) / alpha)));
  }

  // The close-up review found warm checkerboard spill trapped behind the left ear.
  // This narrow external hair-only region excludes the face and preserves dark strands.
  let hairMattePixels = 0;
  for (let y = 252; y <= 296; y++) for (let x = 432; x <= (y < 273 ? 442 : 448); x++) {
    const p = y * width + x;
    if (!data[p * 4 + 3]) continue;
    const rgb = [mask[p * 4], mask[p * 4 + 1], mask[p * 4 + 2]];
    if (Math.min(...rgb) < 170 || Math.max(...rgb) - Math.min(...rgb) > 55) continue;
    const bg = [249, 249, 249], hair = [110, 70, 40];
    let dot = 0, norm = 0;
    for (let c = 0; c < 3; c++) {dot += (rgb[c] - bg[c]) * (hair[c] - bg[c]); norm += (hair[c] - bg[c]) ** 2;}
    const alpha = Math.min(data[p * 4 + 3] / 255, Math.max(0, Math.min(1, dot / norm)));
    if (alpha < 0.04) {data[p * 4 + 3] = 0; continue;}
    data[p * 4 + 3] = Math.round(alpha * 255);
    for (let c = 0; c < 3; c++) data[p * 4 + c] = Math.round(Math.max(0, Math.min(255, (rgb[c] - (1 - alpha) * bg[c]) / alpha)));
    hairMattePixels++;
  }

  let transparent = 0, opaque = 0, finalPartial = 0, opaqueRgbChanged = 0;
  const bounds = {left: width, top: height, right: -1, bottom: -1};
  for (let p = 0; p < count; p++) {
    const a = data[p * 4 + 3];
    if (!a) {transparent++; for (let c = 0; c < 3; c++) data[p * 4 + c] = 0;}
    if (a > 0 && a < 255) finalPartial++;
    if (a === 255) {
      opaque++;
      for (let c = 0; c < 3; c++) if (data[p * 4 + c] !== original[p * 4 + c]) opaqueRgbChanged++;
    }
    if (a > 8) {
      bounds.left = Math.min(bounds.left, p % width); bounds.right = Math.max(bounds.right, p % width);
      bounds.top = Math.min(bounds.top, Math.floor(p / width)); bounds.bottom = Math.max(bounds.bottom, Math.floor(p / width));
    }
  }
  if (opaqueRgbChanged) throw new Error('Opaque character RGB was changed.');
  if (transparent / count < 0.65 || opaque / count < 0.12) throw new Error('Unexpected alpha coverage.');
  await sharp(data, {raw: {width, height, channels: 4}}).png({compressionLevel: 9}).toFile(output);
  await sharp(output).resize({width: 640}).webp({quality: 92, alphaQuality: 100, effort: 4}).toFile(path.join(assets, 'avatar-hi-heeya-equipment-v1-640.webp'));
  for (const [label, background] of [['dark', '#101923'], ['light', '#e8edf3']]) {
    await sharp(output).flatten({background}).resize({width: 768}).png().toFile(path.join(assets, `qa-equipment-${label}-v1.png`));
  }
  const qa = {sourceSha256: expectedSourceHash, outputSha256: sha(fs.readFileSync(output)), width, height, hasAlpha: true, transparent, opaque, partial: finalPartial, enclosedRemoved, edgeRemoved, hairMattePixels, opaqueRgbChanged, bounds, backgroundOnly: true, seeds};
  console.log(JSON.stringify(qa, null, 2));
}

main().catch(error => {console.error(error); process.exitCode = 1;});
