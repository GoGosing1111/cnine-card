#!/usr/bin/env node
'use strict';

const fs = require('node:fs');
const path = require('node:path');
const sharp = require('sharp');

const FRAME_WIDTH = 384;
const FRAME_HEIGHT = 512;
const COLUMNS = 4;
const ROWS = 2;

const [, , proxyArg, row0WeaponArg, row1WeaponArg, outputArg, ...optionArgs] = process.argv;
if (!proxyArg || !row0WeaponArg || !row1WeaponArg || !outputArg) {
  console.error('Usage: node scripts/compose-exact-battle-suit-weapons.cjs <green-proxy-atlas.png> <row-0-weapon.png> <row-1-weapon.png> <output.png> [--force-horizontal]');
  process.exit(1);
}

const forceHorizontal=optionArgs.includes('--force-horizontal');

const proxyPath = path.resolve(proxyArg);
const outputPath = path.resolve(outputArg);
const weapons = {
  ROW_0: path.resolve(row0WeaponArg),
  ROW_1: path.resolve(row1WeaponArg)
};

function isConnectedLightBackground(data, offset) {
  const red = data[offset];
  const green = data[offset + 1];
  const blue = data[offset + 2];
  const high = Math.max(red, green, blue);
  const low = Math.min(red, green, blue);
  const luminance = (red + green + blue) / 3;
  return high - low <= 11 && luminance >= 208;
}

function isChromaGreen(data, offset) {
  const red = data[offset];
  const green = data[offset + 1];
  const blue = data[offset + 2];
  return green >= 45 && green >= red * 1.18 && green >= blue * 1.12 && green - Math.max(red, blue) >= 12;
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

function frameData(atlasData, atlasWidth, column, row) {
  const frame = Buffer.alloc(FRAME_WIDTH * FRAME_HEIGHT * 4);
  for (let y = 0; y < FRAME_HEIGHT; y += 1) {
    const sourceOffset = (((row * FRAME_HEIGHT + y) * atlasWidth) + column * FRAME_WIDTH) * 4;
    const targetOffset = y * FRAME_WIDTH * 4;
    atlasData.copy(frame, targetOffset, sourceOffset, sourceOffset + FRAME_WIDTH * 4);
  }
  return frame;
}

function keyProxyAndMeasure(frame) {
  const points = [];
  const keyed = new Uint8Array(FRAME_WIDTH * FRAME_HEIGHT);
  for (let y = 0; y < FRAME_HEIGHT; y += 1) {
    for (let x = 0; x < FRAME_WIDTH; x += 1) {
      const offset = (y * FRAME_WIDTH + x) * 4;
      if (!isChromaGreen(frame, offset)) continue;
      points.push([x, y]);
      keyed[y * FRAME_WIDTH + x] = 1;
    }
  }
  if (points.length < 500) throw new Error(`Insufficient chroma proxy pixels: ${points.length}`);

  for (let y = 0; y < FRAME_HEIGHT; y += 1) {
    for (let x = 0; x < FRAME_WIDTH; x += 1) {
      let remove = false;
      for (let dy = -1; dy <= 1 && !remove; dy += 1) {
        const sampleY = y + dy;
        if (sampleY < 0 || sampleY >= FRAME_HEIGHT) continue;
        for (let dx = -1; dx <= 1; dx += 1) {
          const sampleX = x + dx;
          if (sampleX < 0 || sampleX >= FRAME_WIDTH) continue;
          if (keyed[sampleY * FRAME_WIDTH + sampleX]) {
            remove = true;
            break;
          }
        }
      }
      if (remove) frame[(y * FRAME_WIDTH + x) * 4 + 3] = 0;
    }
  }

  let meanX = 0;
  let meanY = 0;
  points.forEach(([x, y]) => {
    meanX += x;
    meanY += y;
  });
  meanX /= points.length;
  meanY /= points.length;

  let covarianceXX = 0;
  let covarianceXY = 0;
  let covarianceYY = 0;
  points.forEach(([x, y]) => {
    const dx = x - meanX;
    const dy = y - meanY;
    covarianceXX += dx * dx;
    covarianceXY += dx * dy;
    covarianceYY += dy * dy;
  });

  let angle = .5 * Math.atan2(2 * covarianceXY, covarianceXX - covarianceYY);
  if (Math.cos(angle) < 0) angle += Math.PI;
  const axisX = Math.cos(angle);
  const axisY = Math.sin(angle);
  let minimum = Infinity;
  let maximum = -Infinity;
  points.forEach(([x, y]) => {
    const projection = (x - meanX) * axisX + (y - meanY) * axisY;
    minimum = Math.min(minimum, projection);
    maximum = Math.max(maximum, projection);
  });

  const middle = (minimum + maximum) / 2;
  keepLargestAlphaComponent(frame);
  return {
    centerX: meanX + middle * axisX,
    centerY: meanY + middle * axisY,
    angleDegrees: angle * 180 / Math.PI,
    length: maximum - minimum,
    keyedPixels: points.length
  };
}

function keepLargestAlphaComponent(frame) {
  const pixelCount = FRAME_WIDTH * FRAME_HEIGHT;
  const visited = new Uint8Array(pixelCount);
  let largest = [];
  for (let start = 0; start < pixelCount; start += 1) {
    if (visited[start] || frame[start * 4 + 3] === 0) continue;
    const component = [];
    const queue = [start];
    visited[start] = 1;
    for (let readIndex = 0; readIndex < queue.length; readIndex += 1) {
      const pixelIndex = queue[readIndex];
      component.push(pixelIndex);
      const x = pixelIndex % FRAME_WIDTH;
      const y = Math.floor(pixelIndex / FRAME_WIDTH);
      for (let deltaY = -1; deltaY <= 1; deltaY += 1) {
        for (let deltaX = -1; deltaX <= 1; deltaX += 1) {
          if (!deltaX && !deltaY) continue;
          const nextX = x + deltaX;
          const nextY = y + deltaY;
          if (nextX < 0 || nextX >= FRAME_WIDTH || nextY < 0 || nextY >= FRAME_HEIGHT) continue;
          const nextIndex = nextY * FRAME_WIDTH + nextX;
          if (visited[nextIndex] || frame[nextIndex * 4 + 3] === 0) continue;
          visited[nextIndex] = 1;
          queue.push(nextIndex);
        }
      }
    }
    if (component.length > largest.length) largest = component;
  }
  if (!largest.length) throw new Error('No visible body component remained after chroma removal');
  const retained = new Uint8Array(pixelCount);
  largest.forEach((pixelIndex) => { retained[pixelIndex] = 1; });
  for (let pixelIndex = 0; pixelIndex < pixelCount; pixelIndex += 1) {
    if (!retained[pixelIndex]) frame[pixelIndex * 4 + 3] = 0;
  }
}

function visibleBounds(frame) {
  let minimumX = FRAME_WIDTH;
  let minimumY = FRAME_HEIGHT;
  let maximumX = -1;
  let maximumY = -1;
  for (let y = 0; y < FRAME_HEIGHT; y += 1) {
    for (let x = 0; x < FRAME_WIDTH; x += 1) {
      if (frame[(y * FRAME_WIDTH + x) * 4 + 3] === 0) continue;
      minimumX = Math.min(minimumX, x);
      minimumY = Math.min(minimumY, y);
      maximumX = Math.max(maximumX, x);
      maximumY = Math.max(maximumY, y);
    }
  }
  if (maximumX < minimumX || maximumY < minimumY) throw new Error('No visible pixels remain');
  return [minimumX, minimumY, maximumX, maximumY];
}

function median(values) {
  const ordered = [...values].sort((left, right) => left - right);
  const middle = Math.floor(ordered.length / 2);
  return ordered.length % 2
    ? ordered[middle]
    : (ordered[middle - 1] + ordered[middle]) / 2;
}

async function transformedWeapon(weaponPath, measurement, targetWidth) {
  const rotationDegrees=forceHorizontal?0:measurement.angleDegrees;
  let buffer = await sharp(weaponPath)
    .flop()
    .resize({width: targetWidth})
    .rotate(rotationDegrees, {background: {r: 0, g: 0, b: 0, alpha: 0}})
    .png()
    .toBuffer();
  let metadata = await sharp(buffer).metadata();
  const maximumWidth = FRAME_WIDTH - 8;
  const maximumHeight = FRAME_HEIGHT - 8;
  if (metadata.width > maximumWidth || metadata.height > maximumHeight) {
    buffer = await sharp(buffer)
      .resize({width: maximumWidth, height: maximumHeight, fit: 'inside', withoutEnlargement: true})
      .png()
      .toBuffer();
    metadata = await sharp(buffer).metadata();
  }
  return {buffer, width: metadata.width, height: metadata.height, rotationDegrees};
}

async function composeFrame(frame, weaponKey, measurement, targetWidth) {
  const exactWeapon = await transformedWeapon(weapons[weaponKey], measurement, targetWidth);
  const left = Math.max(4, Math.min(
    FRAME_WIDTH - 4 - exactWeapon.width,
    Math.round(measurement.centerX - exactWeapon.width / 2)
  ));
  const top = Math.max(4, Math.min(
    FRAME_HEIGHT - 4 - exactWeapon.height,
    Math.round(measurement.centerY - exactWeapon.height / 2)
  ));
  const body = await sharp(frame, {raw: {width: FRAME_WIDTH, height: FRAME_HEIGHT, channels: 4}}).png().toBuffer();
  const composite = await sharp({
    create: {
      width: FRAME_WIDTH,
      height: FRAME_HEIGHT,
      channels: 4,
      background: {r: 0, g: 0, b: 0, alpha: 0}
    }
  }).composite([
    {input: exactWeapon.buffer, left, top},
    {input: body, left: 0, top: 0}
  ]).png().toBuffer();
  return {composite, measurement, placement: {left, top, width: exactWeapon.width, height: exactWeapon.height, targetWidth,rotationDegrees:exactWeapon.rotationDegrees}};
}

async function main() {
  for (const target of [proxyPath, weapons.ROW_0, weapons.ROW_1]) {
    if (!fs.existsSync(target)) throw new Error(`Missing input: ${target}`);
  }

  const {data, info} = await sharp(proxyPath).ensureAlpha().raw().toBuffer({resolveWithObject: true});
  if (info.width !== FRAME_WIDTH * COLUMNS || info.height !== FRAME_HEIGHT * ROWS || info.channels !== 4) {
    throw new Error(`Unexpected proxy atlas: ${info.width}x${info.height}x${info.channels}`);
  }
  removeConnectedBackground(data, info.width, info.height);

  const composites = [];
  const diagnostics = [];
  for (let row = 0; row < ROWS; row += 1) {
    const weaponKey = row === 0 ? 'ROW_0' : 'ROW_1';
    const preparedFrames = Array.from({length: COLUMNS}, (_, column) => {
      const frame = frameData(data, info.width, column, row);
      const measurement = keyProxyAndMeasure(frame);
      return {column, frame, measurement, bodyBounds: visibleBounds(frame)};
    });
    const widthFactor = row === 0 ? .98 : .96;
    const targetWidth = Math.max(120, Math.round(median(preparedFrames.map(item => item.measurement.length)) * widthFactor));
    for (const {column, frame, measurement, bodyBounds} of preparedFrames) {
      const result = await composeFrame(frame, weaponKey, measurement, targetWidth);
      composites.push({input: result.composite, left: column * FRAME_WIDTH, top: row * FRAME_HEIGHT});
      diagnostics.push({row, column, weaponSource: weapons[weaponKey], bodyBounds, ...result.measurement, ...result.placement});
    }
  }

  fs.mkdirSync(path.dirname(outputPath), {recursive: true});
  await sharp({
    create: {
      width: FRAME_WIDTH * COLUMNS,
      height: FRAME_HEIGHT * ROWS,
      channels: 4,
      background: {r: 0, g: 0, b: 0, alpha: 0}
    }
  }).composite(composites).png({compressionLevel: 9, adaptiveFiltering: true}).toFile(outputPath);

  console.log(JSON.stringify({proxy: proxyPath, output: outputPath, width: 1536, height: 1024, forceHorizontal, frames: diagnostics}));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
