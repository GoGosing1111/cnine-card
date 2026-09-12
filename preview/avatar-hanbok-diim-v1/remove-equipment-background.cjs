#!/usr/bin/env node
'use strict';

// 2026-09-12 user approval: “배경만 스크립트로 제거”.
// Adapted from scripts/remove-connected-light-background.cjs and the reviewed
// avatar-hi-heeya-v1 extraction. The character is not repainted or reshaped.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const sharp = require('sharp');
const assets = path.join(__dirname, 'assets');
const source = path.join(assets, 'avatar-hanbok-diim-equipment-draft-v1.png');
const output = path.join(assets, 'avatar-hanbok-diim-equipment-source-art-v1.png');
const expectedHash = '237484E10B769B916B4757EE8CF558C37EDCE9CF75943E342F2757A2CB1B4489';
const sha = file => crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex').toUpperCase();

async function main() {
  if (sha(source) !== expectedHash) throw new Error('Source changed: inspect new colors and edges before extracting.');
  const {data, info: {width, height}} = await sharp(source).ensureAlpha().raw().toBuffer({resolveWithObject: true});
  const original = Buffer.from(data);
  const count = width * height;
  const queue = new Int32Array(count);
  const outside = new Uint8Array(count);
  const neighbors = (p, visit) => {
    const x = p % width;
    if (x) visit(p - 1);
    if (x + 1 < width) visit(p + 1);
    if (p >= width) visit(p - width);
    if (p + width < count) visit(p + width);
  };
  // Flood only neutral connected backdrop; the ivory fabric and skin are warm.
  const background = p => {
    const r = data[p * 4], g = data[p * 4 + 1], b = data[p * 4 + 2];
    const luminance = (r + g + b) / 3;
    return Math.max(r, g, b) - Math.min(r, g, b) <= 10 && r - b <= 7 && luminance >= 110 && luminance <= 255;
  };
  let read = 0, write = 0;
  const enqueue = p => {
    if (outside[p] || !background(p)) return;
    outside[p] = 1; queue[write++] = p;
  };
  for (let x = 0; x < width; x++) {enqueue(x); enqueue((height - 1) * width + x);}
  for (let y = 1; y + 1 < height; y++) {enqueue(y * width); enqueue(y * width + width - 1);}
  // Visually inspected closed hair loops and the narrow gap between the calves.
  // Do not seed neutral highlights on the collar, embroidery or shoes.
  const enclosedSeeds = [[668,266],[358,301],[304,405],[718,386],[748,414],
    [521,1151],[722,441],[644,179],[648,229],[632,194],[324,501],[762,434],
    [743,473],[744,458],[658,248],[327,385],[638,157],[741,420],[639,121],
    [305,418],[703,377],[303,453],[676,338],[764,552],[636,138],[733,494],
    [710,442],[312,411],[313,472],[724,477],[645,231],[632,260],[743,406],
    [657,280],[716,405],[714,461],[310,465],[748,472],[337,511],[331,525],
    [750,525],[638,108],[670,318]];
  for (const [x, y] of enclosedSeeds) {
    if (!background(y * width + x)) throw new Error(`Recheck background gap at ${x},${y}.`);
    enqueue(y * width + x);
  }
  while (read < write) neighbors(queue[read++], enqueue);
  const connectedRemoved = write;

  // Faint distorted grid lines form tiny detached background islands. Keep
  // the connected head-to-shoe silhouette; detached grid debris is background.
  const components = new Int32Array(count);
  let componentId = 0, largestId = 0, largestSize = 0;
  for (let start = 0; start < count; start++) {
    if (outside[start] || components[start]) continue;
    componentId++; read = 0; write = 0;
    queue[write++] = start; components[start] = componentId;
    while (read < write) neighbors(queue[read++], p => {
      if (!outside[p] && !components[p]) {components[p] = componentId; queue[write++] = p;}
    });
    if (write > largestSize) {largestSize = write; largestId = componentId;}
  }
  if (largestSize < count * .15) throw new Error('Foreground silhouette is fragmented; inspect the mask.');
  let detachedRemoved = 0;
  for (let p = 0; p < count; p++) if (!outside[p] && components[p] !== largestId) {outside[p] = 1; detachedRemoved++;}

  // Same two-pixel-only edge matting as the earlier avatar workflow. Keep all
  // fully opaque RGB values bit-identical to the generated extraction draft.
  const distance = new Uint8Array(count); distance.fill(255);
  read = 0; write = 0;
  for (let p = 0; p < count; p++) if (outside[p]) {distance[p] = 0; queue[write++] = p;}
  while (read < write) {
    const p = queue[read++];
    if (distance[p] >= 4) continue;
    neighbors(p, n => {
      if (distance[n] > distance[p] + 1) {distance[n] = distance[p] + 1; queue[write++] = n;}
    });
  }
  let mattePixels = 0;
  for (let p = 0; p < count; p++) {
    if (outside[p]) {data[p * 4 + 3] = 0; continue;}
    if (distance[p] > 2) continue;
    const x = p % width, y = Math.floor(p / width);
    let inner = -1, innerDistance = Infinity, bg = -1, bgDistance = Infinity;
    for (let dy = -4; dy <= 4; dy++) for (let dx = -4; dx <= 4; dx++) {
      const nx = x + dx, ny = y + dy;
      if (nx < 0 || nx >= width || ny < 0 || ny >= height) continue;
      const n = ny * width + nx, d = dx * dx + dy * dy;
      if (distance[n] >= 3 && d < innerDistance) {inner = n; innerDistance = d;}
      if (outside[n] && d < bgDistance) {bg = n; bgDistance = d;}
    }
    if (inner < 0 || bg < 0) continue;
    let dot = 0, norm = 0;
    for (let c = 0; c < 3; c++) {
      const delta = original[inner * 4 + c] - original[bg * 4 + c];
      dot += (original[p * 4 + c] - original[bg * 4 + c]) * delta;
      norm += delta * delta;
    }
    if (norm < 100) continue;
    const alpha = Math.max(0, Math.min(1, dot / norm));
    if (alpha >= 0.985) continue;
    mattePixels++;
    if (alpha <= 0.04) {data[p * 4 + 3] = 0; continue;}
    data[p * 4 + 3] = Math.round(alpha * 255);
    for (let c = 0; c < 3; c++) {
      data[p * 4 + c] = Math.round(Math.max(0, Math.min(255,
        (original[p * 4 + c] - (1 - alpha) * original[bg * 4 + c]) / alpha)));
    }
  }
  // Suppress the square checker pattern at the alpha boundary, never painting
  // or blurring character RGB. Do not expand the foreground into the backdrop.
  const alphaMask = Buffer.alloc(count);
  for (let p = 0; p < count; p++) alphaMask[p] = data[p * 4 + 3];
  const smoothAlpha = await sharp(alphaMask, {raw: {width, height, channels: 1}})
    .blur(0.8).greyscale().raw().toBuffer();
  if (smoothAlpha.length !== count) throw new Error('Expected one-channel alpha mask.');
  for (let p = 0; p < count; p++) {
    if (distance[p] <= 2) data[p * 4 + 3] = Math.min(data[p * 4 + 3], smoothAlpha[p]);
  }
  let transparent = 0, opaque = 0, partial = 0, opaqueRgbChanged = 0;
  const bounds = {left: width, top: height, right: -1, bottom: -1};
  for (let p = 0; p < count; p++) {
    const a = data[p * 4 + 3];
    if (!a) {transparent++; data[p * 4] = data[p * 4 + 1] = data[p * 4 + 2] = 0;}
    else if (a === 255) {
      opaque++;
      for (let c = 0; c < 3; c++) if (data[p * 4 + c] !== original[p * 4 + c]) opaqueRgbChanged++;
    } else partial++;
    if (a > 8) {
      bounds.left = Math.min(bounds.left, p % width); bounds.right = Math.max(bounds.right, p % width);
      bounds.top = Math.min(bounds.top, Math.floor(p / width)); bounds.bottom = Math.max(bounds.bottom, Math.floor(p / width));
    }
  }
  if (opaqueRgbChanged) throw new Error('Opaque character pixels were modified.');
  if (transparent / count < 0.65 || opaque / count < 0.12) throw new Error('Unexpected alpha coverage.');
  await sharp(data, {raw: {width, height, channels: 4}}).png({compressionLevel: 9}).toFile(output);
  await sharp(output).resize({width: 640}).webp({quality: 92, alphaQuality: 100, effort: 4})
    .toFile(path.join(assets, 'avatar-hanbok-diim-equipment-v1-640.webp'));
  for (const [label, backgroundColor] of [['dark', '#15151c'], ['light', '#e9e7e5']]) {
    await sharp(output).flatten({background: backgroundColor}).resize({width: 768}).png()
      .toFile(path.join(assets, `qa-equipment-${label}-v1.png`));
  }
  console.log(JSON.stringify({sourceSha256: expectedHash, outputSha256: sha(output), width, height,
    hasAlpha: true, transparent, opaque, partial, connectedRemoved, detachedRemoved, mattePixels, opaqueRgbChanged, bounds, enclosedSeeds}, null, 2));
}
main().catch(error => {console.error(error); process.exitCode = 1;});
