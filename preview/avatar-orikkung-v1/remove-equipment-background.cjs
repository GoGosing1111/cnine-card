#!/usr/bin/env node
'use strict';

// 2026-09-11 user approval: “배경만 코드로 제거 (권장)”.
// Adapted from scripts/remove-connected-light-background.cjs and the reviewed
// avatar-hi-heeya-v1 extraction. The character is not repainted or reshaped.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const sharp = require('sharp');
const assets = path.join(__dirname, 'assets');
const source = path.join(assets, 'avatar-orikkung-equipment-draft-v1.png');
const output = path.join(assets, 'avatar-orikkung-equipment-source-art-v1.png');
const expectedHash = '16874949373D634EDF6EB45EDA14AA1B0A95D096ACB4968947E77D1C9854F20E';
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
  // The source-specific graph-cut mask preserves white hair and clothing.
  // It classifies the painted checkerboard only; character RGB stays original.
  const maskFile=path.join(assets,'equipment-background-mask-v1.png');
  const mask=await sharp(maskFile).greyscale().raw().toBuffer();
  if(mask.length!==count)throw new Error('Mask dimensions differ from source.');
  const segmentation=JSON.parse(fs.readFileSync(path.join(__dirname,'segmentation-qa.json'),'utf8'));
  if(segmentation.sourceSha256!==expectedHash)throw new Error('Mask source hash differs.');
  const enclosedSeeds=segmentation.backgroundSeeds.map(([x,y])=>[x,y]);
  let read=0,write=0,connectedRemoved=0;
  for(let p=0;p<count;p++)if(mask[p]===0){outside[p]=1;connectedRemoved++;}


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
  if (transparent / count < 0.58 || opaque / count < 0.12) throw new Error('Unexpected alpha coverage.');
  await sharp(data, {raw: {width, height, channels: 4}}).png({compressionLevel: 9}).toFile(output);
  await sharp(output).resize({width: 640}).webp({quality: 92, alphaQuality: 100, effort: 4})
    .toFile(path.join(assets, 'avatar-orikkung-equipment-v1-640.webp'));
  for (const [label, backgroundColor] of [['dark', '#101923'], ['light', '#e8edf3']]) {
    await sharp(output).flatten({background: backgroundColor}).resize({width: 768}).png()
      .toFile(path.join(assets, `qa-equipment-${label}-v1.png`));
  }
  const qa = {sourceSha256: expectedHash, outputSha256: sha(output), width, height, hasAlpha: true, transparent, opaque, partial, connectedRemoved, mattePixels, opaqueRgbChanged, bounds, enclosedSeeds};
  fs.writeFileSync(path.join(__dirname, 'alpha-qa.json'), JSON.stringify(qa, null, 2) + '\n');
  console.log(JSON.stringify(qa, null, 2));
}
main().catch(error => {console.error(error); process.exitCode = 1;});
