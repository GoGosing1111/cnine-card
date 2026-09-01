#!/usr/bin/env node
'use strict';

const fs = require('node:fs');
const path = require('node:path');
const sharp = require('sharp');

const FRAME_WIDTH = 384;
const FRAME_HEIGHT = 512;
const COLUMNS = 4;
const ROWS = 2;
const ALPHA_THRESHOLD = 16;
const MIN_FIGURE_PIXELS = 20_000;
const FIGURE_MAX_WIDTH = 376;
const FIGURE_MAX_HEIGHT = 440;
const FIGURE_BASELINE = 480;

const CONFIG = Object.freeze({
  BATTLE_SUIT_02: Object.freeze({
    expectedColumns: 3,
    // The supplied middle fire frame bakes a large muzzle flash into the
    // character raster. Runtime V3 owns muzzle effects, so use the clean
    // post-shot pose for both fire and recoil.
    frameMap: Object.freeze([0, 2, 2, 0]),
    frameOffsetX: Object.freeze([0, 0, 1, -2]),
    headKeep: Object.freeze({ x: 125, y: 75, rx: 42, ry: 66 })
  }),
  BATTLE_SUIT_03: Object.freeze({
    expectedColumns: 4,
    frameMap: Object.freeze([0, 2, 2, 3]),
    frameOffsetX: Object.freeze([0, 0, -5, -2]),
    headKeep: Object.freeze({ x: 125, y: 70, rx: 45, ry: 68 })
  })
});

const AK_SKS = Object.freeze([
  Object.freeze({ key: 'ak', width: 298, centerY: 158 }),
  Object.freeze({ key: 'sks', width: 326, centerY: 160 })
]);

const [
  , , sourceArg, suitCodeArg, m4Arg, m200Arg, akArg, sksArg,
  m4M200OutputArg, akSksOutputArg
] = process.argv;

if (!sourceArg || !suitCodeArg || !m4Arg || !m200Arg || !akArg || !sksArg || !m4M200OutputArg || !akSksOutputArg) {
  console.error('Usage: node scripts/build-user-reference-battle-suit-atlases.cjs <user-reference.png> <BATTLE_SUIT_02|BATTLE_SUIT_03> <m4.png> <m200.png> <ak.png> <sks.png> <m4-m200-output.png> <ak-sks-output.png>');
  process.exit(1);
}

const sourcePath = path.resolve(sourceArg);
const suitCode = String(suitCodeArg || '').trim().toUpperCase();
const config = CONFIG[suitCode];
if (!config) throw new Error(`Unsupported suit code: ${suitCode}`);

const weaponPaths = Object.freeze({
  m4a1: path.resolve(m4Arg),
  m200: path.resolve(m200Arg),
  ak: path.resolve(akArg),
  sks: path.resolve(sksArg)
});
const outputPaths = Object.freeze({
  m4a1M200: path.resolve(m4M200OutputArg),
  akSks: path.resolve(akSksOutputArg)
});

function isConnectedLightBackground(data, offset) {
  const red = data[offset];
  const green = data[offset + 1];
  const blue = data[offset + 2];
  const high = Math.max(red, green, blue);
  const low = Math.min(red, green, blue);
  return high - low <= 14 && (red + green + blue) / 3 >= 202;
}

function removeConnectedBackground(data, width, height) {
  const pixelCount = width * height;
  const outside = new Uint8Array(pixelCount);
  const queue = new Uint32Array(pixelCount);
  let readIndex = 0;
  let writeIndex = 0;
  const enqueue = (x, y) => {
    const pixelIndex = y * width + x;
    if (outside[pixelIndex] || !isConnectedLightBackground(data, pixelIndex * 4)) return;
    outside[pixelIndex] = 1;
    queue[writeIndex++] = pixelIndex;
  };
  for (let x = 0; x < width; x += 1) {
    enqueue(x, 0);
    enqueue(x, height - 1);
  }
  for (let y = 1; y < height - 1; y += 1) {
    enqueue(0, y);
    enqueue(width - 1, y);
  }
  while (readIndex < writeIndex) {
    const pixelIndex = queue[readIndex++];
    const x = pixelIndex % width;
    const y = Math.floor(pixelIndex / width);
    if (x > 0) enqueue(x - 1, y);
    if (x + 1 < width) enqueue(x + 1, y);
    if (y > 0) enqueue(x, y - 1);
    if (y + 1 < height) enqueue(x, y + 1);
  }
  for (let pixelIndex = 0; pixelIndex < pixelCount; pixelIndex += 1) {
    if (outside[pixelIndex]) data[pixelIndex * 4 + 3] = 0;
  }
}

function collectFigureComponents(data, width, height) {
  const pixelCount = width * height;
  const visited = new Uint8Array(pixelCount);
  const figures = [];
  for (let start = 0; start < pixelCount; start += 1) {
    if (visited[start] || data[start * 4 + 3] < ALPHA_THRESHOLD) continue;
    visited[start] = 1;
    const queue = [start];
    let minX = start % width;
    let maxX = minX;
    let minY = Math.floor(start / width);
    let maxY = minY;
    for (let readIndex = 0; readIndex < queue.length; readIndex += 1) {
      const pixelIndex = queue[readIndex];
      const x = pixelIndex % width;
      const y = Math.floor(pixelIndex / width);
      minX = Math.min(minX, x);
      maxX = Math.max(maxX, x);
      minY = Math.min(minY, y);
      maxY = Math.max(maxY, y);
      for (let deltaY = -1; deltaY <= 1; deltaY += 1) {
        for (let deltaX = -1; deltaX <= 1; deltaX += 1) {
          if (deltaX === 0 && deltaY === 0) continue;
          const nextX = x + deltaX;
          const nextY = y + deltaY;
          if (nextX < 0 || nextX >= width || nextY < 0 || nextY >= height) continue;
          const nextIndex = nextY * width + nextX;
          if (visited[nextIndex] || data[nextIndex * 4 + 3] < ALPHA_THRESHOLD) continue;
          visited[nextIndex] = 1;
          queue.push(nextIndex);
        }
      }
    }
    if (queue.length >= MIN_FIGURE_PIXELS) {
      figures.push({
        pixels: queue,
        count: queue.length,
        minX,
        minY,
        maxX,
        maxY,
        centerX: (minX + maxX) / 2,
        centerY: (minY + maxY) / 2
      });
    }
  }
  if (figures.length !== config.expectedColumns * ROWS) {
    throw new Error(`Expected ${config.expectedColumns * ROWS} figures, found ${figures.length}`);
  }
  return figures;
}

function arrangeFigures(figures) {
  const ordered = [...figures].sort((left, right) => left.centerY - right.centerY || left.centerX - right.centerX);
  const top = ordered.slice(0, config.expectedColumns).sort((left, right) => left.centerX - right.centerX);
  const bottom = ordered.slice(config.expectedColumns).sort((left, right) => left.centerX - right.centerX);
  return [top, bottom];
}

function componentCrop(data, sourceWidth, component) {
  const width = component.maxX - component.minX + 1;
  const height = component.maxY - component.minY + 1;
  const crop = Buffer.alloc(width * height * 4);
  for (const pixelIndex of component.pixels) {
    const sourceX = pixelIndex % sourceWidth;
    const sourceY = Math.floor(pixelIndex / sourceWidth);
    const targetX = sourceX - component.minX;
    const targetY = sourceY - component.minY;
    const sourceOffset = pixelIndex * 4;
    const targetOffset = (targetY * width + targetX) * 4;
    data.copy(crop, targetOffset, sourceOffset, sourceOffset + 4);
  }
  return { data: crop, width, height };
}

async function normalizeFigure(data, sourceWidth, component, offsetX = 0, offsetY = 0) {
  const crop = componentCrop(data, sourceWidth, component);
  const scale = Math.min(FIGURE_MAX_WIDTH / crop.width, FIGURE_MAX_HEIGHT / crop.height);
  const width = Math.max(1, Math.round(crop.width * scale));
  const height = Math.max(1, Math.round(crop.height * scale));
  const resized = await sharp(crop.data, { raw: { width: crop.width, height: crop.height, channels: 4 } })
    .resize({ width, height, fit: 'fill', kernel: sharp.kernel.lanczos3 })
    .png({ compressionLevel: 9, adaptiveFiltering: true })
    .toBuffer();
  const left = Math.round((FRAME_WIDTH - width) / 2) + offsetX;
  const top = FIGURE_BASELINE - height + offsetY;
  return sharp({
    create: { width: FRAME_WIDTH, height: FRAME_HEIGHT, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } }
  }).composite([{ input: resized, left, top }]).png({ compressionLevel: 9, adaptiveFiltering: true }).toBuffer();
}

async function normalizedRows(data, sourceWidth, figuresByRow) {
  const rows = [];
  for (let row = 0; row < ROWS; row += 1) {
    const frames = [];
    for (let column = 0; column < COLUMNS; column += 1) {
      const offsetX = config.frameOffsetX[column];
      const offsetY = [0, 0, -3, -1][column];
      frames.push(await normalizeFigure(data, sourceWidth, figuresByRow[row][config.frameMap[column]], offsetX, offsetY));
    }
    rows.push(frames);
  }
  return rows;
}

async function exactWeapon(key, width) {
  const buffer = await sharp(weaponPaths[key])
    .flop()
    .resize({ width, kernel: sharp.kernel.lanczos3 })
    .png({ compressionLevel: 9, adaptiveFiltering: true })
    .toBuffer();
  const metadata = await sharp(buffer).metadata();
  return { buffer, width: metadata.width, height: metadata.height };
}

function eraseOriginalRifleAndFlash(data) {
  const { x: headX, y: headY, rx: headRadiusX, ry: headRadiusY } = config.headKeep;
  for (let y = 35; y <= 300; y += 1) {
    for (let x = 65; x < FRAME_WIDTH; x += 1) {
      const inHead = ((x - headX) / headRadiusX) ** 2 + ((y - headY) / headRadiusY) ** 2 <= 1;
      const eraseTopM4 = x >= 145 && (y <= 195 || (x >= 220 && y <= 270));
      const eraseSuit02MagazineTail = suitCode === 'BATTLE_SUIT_02' && x >= 185 && x <= 220 && y >= 192 && y <= 212;
      const eraseSuit02GraySpeck = suitCode === 'BATTLE_SUIT_02' && x >= 156 && x <= 160 && y >= 113 && y <= 117;
      if ((!inHead && eraseTopM4) || eraseSuit02MagazineTail || eraseSuit02GraySpeck) {
        data[(y * FRAME_WIDTH + x) * 4 + 3] = 0;
      }
    }
  }
}

async function composeExactWeaponFrame(sourceFrame, row, column) {
  const source = await sharp(sourceFrame).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  // AK/SKS both use the clean upper-row M4 pose. Keeping the same authored
  // shouldered pose avoids destructive holes from the diagonal M200 source.
  eraseOriginalRifleAndFlash(source.data);
  const body = await sharp(source.data, { raw: source.info })
    .png({ compressionLevel: 9, adaptiveFiltering: true })
    .toBuffer();
  const spec = AK_SKS[row];
  const exact = await exactWeapon(spec.key, spec.width);
  const recoilX = config.frameOffsetX[column];
  const recoilY = [0, 0, -3, -1][column];
  const left = FRAME_WIDTH - 8 - exact.width + recoilX;
  const top = Math.round(spec.centerY - exact.height / 2) + recoilY;
  return {
    buffer: await sharp({
      create: { width: FRAME_WIDTH, height: FRAME_HEIGHT, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } }
    }).composite([
      { input: body, left: 0, top: 0 },
      { input: exact.buffer, left, top }
    ]).png({ compressionLevel: 9, adaptiveFiltering: true }).toBuffer(),
    placement: {
      left,
      top,
      width: exact.width,
      height: exact.height,
      muzzleX: left + exact.width - 1,
      muzzleY: spec.centerY + recoilY,
      rotationDegrees: 0
    }
  };
}

async function writeAtlas(rows, outputPath, transform) {
  const composites = [];
  const diagnostics = [];
  for (let row = 0; row < ROWS; row += 1) {
    for (let column = 0; column < COLUMNS; column += 1) {
      const result = transform ? await transform(rows[0][column], row, column) : { buffer: rows[row][column] };
      composites.push({ input: result.buffer, left: column * FRAME_WIDTH, top: row * FRAME_HEIGHT });
      if (result.placement) diagnostics.push({ row, column, weapon: AK_SKS[row].key, ...result.placement });
    }
  }
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  await sharp({
    create: { width: FRAME_WIDTH * COLUMNS, height: FRAME_HEIGHT * ROWS, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } }
  }).composite(composites).png({ compressionLevel: 9, adaptiveFiltering: true }).toFile(outputPath);
  return diagnostics;
}

async function main() {
  for (const target of [sourcePath, ...Object.values(weaponPaths)]) {
    if (!fs.existsSync(target)) throw new Error(`Missing input: ${target}`);
  }
  const { data, info } = await sharp(sourcePath).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  if (info.width !== 1536 || info.height !== 1024 || info.channels !== 4) {
    throw new Error(`Unexpected reference: ${info.width}x${info.height}x${info.channels}`);
  }
  removeConnectedBackground(data, info.width, info.height);
  const figures = collectFigureComponents(data, info.width, info.height);
  const figuresByRow = arrangeFigures(figures);
  const rows = await normalizedRows(data, info.width, figuresByRow);
  await writeAtlas(rows, outputPaths.m4a1M200);
  const exactPlacements = await writeAtlas(rows, outputPaths.akSks, composeExactWeaponFrame);
  console.log(JSON.stringify({
    source: sourcePath,
    suitCode,
    sourceLayout: { columns: config.expectedColumns, rows: 2 },
    runtimeLayout: { columns: COLUMNS, rows: ROWS, frameWidth: FRAME_WIDTH, frameHeight: FRAME_HEIGHT },
    normalizedFigureBounds: figuresByRow.map(row => row.map(figure => ({
      x: figure.minX,
      y: figure.minY,
      width: figure.maxX - figure.minX + 1,
      height: figure.maxY - figure.minY + 1,
      pixels: figure.count
    }))),
    exactPlacements
  }));
}

main().catch(error => {
  console.error(error);
  process.exit(1);
});
