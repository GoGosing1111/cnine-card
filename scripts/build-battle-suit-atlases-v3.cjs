#!/usr/bin/env node
'use strict';

const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const sharp = require('sharp');

const ROOT = path.resolve(__dirname, '..');
const FRAME_WIDTH = 384;
const FRAME_HEIGHT = 512;
const COLUMNS = 4;
const ROWS = 2;
const BODY_HEIGHT = 440;
const BODY_MAX_WIDTH = 360;
const BASELINE = 479;
const ALPHA_THRESHOLD = 16;
const FRAME_MARGIN = 4;
const AUTHORED_SKS_CODE = 'EQ_1786966923833';
const AUTHORED_SKS_MAX_WIDTH = FRAME_WIDTH - FRAME_MARGIN * 2;
const AUTHORED_SKS_MAX_HEIGHT = BODY_HEIGHT;

const SOURCE_ROOT = path.join(ROOT, 'assets/ui/project-v/account-battle-suits/sources');
const SUIT_ROOT = path.join(ROOT, 'assets/ui/project-v/account-battle-suits/suits');
const WEAPON_ROOT = path.join(ROOT, 'assets/ui/project-v/account-battle-suits/weapons');
const ANIMATION_ROOT = path.join(ROOT, 'assets/ui/project-v/account-battle-suits/animations');
const DIAGNOSTICS_PATH = path.join(ROOT, 'assets/ui/project-v/account-battle-suits/animation-build-diagnostics-v3.json');
const PROVENANCE_PATH = path.join(ROOT, 'assets/ui/project-v/account-battle-suits/animation-generation-provenance-v2.json');

const FRAME_OFFSETS = Object.freeze([
  Object.freeze({x: 0, y: 0}),
  Object.freeze({x: -2, y: 0}),
  Object.freeze({x: -5, y: -3}),
  Object.freeze({x: -2, y: -1})
]);

const WEAPONS = Object.freeze({
  EQ_1785427638137: Object.freeze({slug: 'm4a1', pair: 'm4a1-m200', row: 0, proxyScale: 1.0, file: 'avalon-m4a1-v1.png'}),
  EQ_1785961300455: Object.freeze({slug: 'm200', pair: 'm4a1-m200', row: 1, proxyScale: 1.2, file: 'infinity-m200-v1.png'}),
  EQ_1785961232958: Object.freeze({slug: 'ak', pair: 'ak-sks', row: 0, proxyScale: 1.06, file: 'infinity-ak-v1.png'}),
  EQ_1786966923833: Object.freeze({slug: 'sks', pair: 'ak-sks', row: 1, proxyScale: 1.14, file: 'sovereign-sks-v1.png'})
});

const PAIRS = Object.freeze({
  'm4a1-m200': Object.freeze(['EQ_1785427638137', 'EQ_1785961300455']),
  'ak-sks': Object.freeze(['EQ_1785961232958', 'EQ_1786966923833'])
});

const SUITS = Object.freeze({
  BATTLE_SUIT_01: Object.freeze({
    slug: 'battle-suit-01',
    source: 'battle-suit-01-mechanical-clean-body-chroma-v3.png',
    chroma: true,
    gripProxy: 'battle-suit-01-mechanical-grip-proxy-v4.png',
    authoredSksSource: 'battle-suit-01-sks-second-row-clean-v1.png',
    bodyOffsetX: 0,
    staticFile: 'battle-suit-appearance-01-mechanical-female-v3.png'
  }),
  BATTLE_SUIT_02: Object.freeze({
    slug: 'battle-suit-02',
    source: 'battle-suit-02-orange-tactical-clean-body-v3.png',
    chroma: false,
    gripProxy: 'battle-suit-02-orange-tactical-grip-proxy-v3.png',
    weaponGripProxies: Object.freeze({
      EQ_1785961300455: 'battle-suit-02-orange-tactical-m200-grip-proxy-v4.png'
    }),
    weaponPlacementAdjustments: Object.freeze({
      EQ_1785961300455: Object.freeze({x: 0, y: 34})
    }),
    authoredSksSource: 'battle-suit-02-sks-second-row-clean-v1.png',
    bodyOffsetX: 0,
    staticFile: 'battle-suit-appearance-02-orange-tactical-v3.png',
    canonicalM4: 'battle-suit-02-m4a1-m200-horizontal-fire-atlas-v2.png'
  }),
  BATTLE_SUIT_03: Object.freeze({
    slug: 'battle-suit-03',
    source: 'battle-suit-03-amethyst-model02-clean-body-chroma-v3.png',
    chroma: true,
    gripProxy: 'battle-suit-03-amethyst-model02-grip-proxy-v3.png',
    weaponGripProxies: Object.freeze({
      EQ_1785961300455: 'battle-suit-03-amethyst-model02-m200-grip-proxy-v4.png'
    }),
    weaponPlacementAdjustments: Object.freeze({
      EQ_1785961300455: Object.freeze({x: 0, y: 31})
    }),
    authoredSksSource: 'battle-suit-03-sks-second-row-clean-v1.png',
    bodyOffsetX: 0,
    staticFile: 'battle-suit-appearance-03-amethyst-model02-v3.png'
  })
});

const sha256 = (bytes) => crypto.createHash('sha256').update(bytes).digest('hex').toUpperCase();
const webPath = (absolutePath) => `/${path.relative(ROOT, absolutePath).split(path.sep).join('/')}`;

function keyChroma(data) {
  for (let offset = 0; offset < data.length; offset += 4) {
    const red = data[offset];
    const green = data[offset + 1];
    const blue = data[offset + 2];
    const excess = green - Math.max(red, blue);
    if (green < 72 || excess <= 4) continue;
    if (excess >= 24) {
      data[offset + 3] = 0;
      continue;
    }
    const keep = Math.max(0, Math.min(1, 1 - (excess - 4) / 20));
    data[offset + 3] = Math.round(data[offset + 3] * keep);
    data[offset + 1] = Math.min(green, Math.max(red, blue) + 3);
  }
}

function expandChromaMask(data, info, mask, mode, iterations) {
  let current = mask;
  for (let iteration = 0; iteration < iterations; iteration += 1) {
    const next = current.slice();
    for (let y = 1; y < info.height - 1; y += 1) {
      for (let x = 1; x < info.width - 1; x += 1) {
        const pixel = y * info.width + x;
        if (current[pixel]) continue;
        const touchesKey = current[pixel - 1] || current[pixel + 1] || current[pixel - info.width] || current[pixel + info.width];
        if (!touchesKey) continue;
        const offset = pixel * 4;
        const red = data[offset];
        const green = data[offset + 1];
        const blue = data[offset + 2];
        const chromaMax = Math.max(green, blue);
        const matches = mode === 'blue'
          ? blue >= 32 && blue >= green - 14 && blue - red >= 12
          : chromaMax >= 32 && chromaMax - red >= 14;
        if (matches) next[pixel] = 255;
      }
    }
    current = next;
  }
  return current;
}

function chromaMasks(data, info, strictGreenBounds = false) {
  const blueMask = new Uint8Array(info.width * info.height);
  const greenMask = new Uint8Array(info.width * info.height);
  let minGreenX = info.width;
  let minGreenY = info.height;
  let maxGreenX = -1;
  let maxGreenY = -1;

  for (let y = 0; y < info.height; y += 1) {
    for (let x = 0; x < info.width; x += 1) {
      const pixel = y * info.width + x;
      const offset = pixel * 4;
      const red = data[offset];
      const green = data[offset + 1];
      const blue = data[offset + 2];
      const blueExcess = blue - Math.max(red, green);
      const greenExcess = green - Math.max(red, blue);
      if (blue >= 150 && blueExcess >= 65) blueMask[pixel] = 255;
      if (green >= 150 && greenExcess >= 85) {
        greenMask[pixel] = 255;
        const isProxyBoundPixel = strictGreenBounds
          ? green >= 220 && red <= 35 && blue <= 35
          : green >= 160 && greenExcess >= 90;
        if (isProxyBoundPixel) {
          minGreenX = Math.min(minGreenX, x);
          minGreenY = Math.min(minGreenY, y);
          maxGreenX = Math.max(maxGreenX, x);
          maxGreenY = Math.max(maxGreenY, y);
        }
      }
    }
  }
  if (maxGreenX < minGreenX) throw new Error('Grip proxy has no green weapon silhouette');
  return {
    blueMask: expandChromaMask(data, info, blueMask, 'blue', 5),
    greenMask: expandChromaMask(data, info, greenMask, 'green', 6),
    greenBounds: {
      minX: minGreenX,
      minY: minGreenY,
      maxX: maxGreenX,
      maxY: maxGreenY,
      width: maxGreenX - minGreenX + 1,
      height: maxGreenY - minGreenY + 1
    }
  };
}

function applyProxyKey(data, info, blueMask, greenMask) {
  for (let pixel = 0; pixel < info.width * info.height; pixel += 1) {
    const offset = pixel * 4;
    const removal = Math.max(blueMask[pixel], greenMask[pixel]);
    if (removal <= 0) continue;
    data[offset + 3] = Math.round(data[offset + 3] * (1 - removal / 255));
    if (data[offset + 3] <= 2) {
      data[offset] = 0;
      data[offset + 1] = 0;
      data[offset + 2] = 0;
      data[offset + 3] = 0;
    } else if (greenMask[pixel] > blueMask[pixel]) {
      data[offset + 1] = Math.min(data[offset + 1], Math.max(data[offset], data[offset + 2]) + 2);
    } else {
      data[offset + 2] = Math.min(data[offset + 2], Math.max(data[offset], data[offset + 1]) + 2);
    }
  }
}

function visibleBoundsRaw(data, info) {
  let minX = info.width;
  let minY = info.height;
  let maxX = -1;
  let maxY = -1;
  for (let y = 0; y < info.height; y += 1) {
    for (let x = 0; x < info.width; x += 1) {
      if (data[(y * info.width + x) * 4 + 3] < ALPHA_THRESHOLD) continue;
      minX = Math.min(minX, x);
      minY = Math.min(minY, y);
      maxX = Math.max(maxX, x);
      maxY = Math.max(maxY, y);
    }
  }
  if (maxX < minX) throw new Error('No visible pixels after chroma key');
  return {minX, minY, maxX, maxY, width: maxX - minX + 1, height: maxY - minY + 1};
}

function isConnectedDarkBackground(data, offset) {
  const red = data[offset];
  const green = data[offset + 1];
  const blue = data[offset + 2];
  const high = Math.max(red, green, blue);
  const low = Math.min(red, green, blue);
  const luminance = (red + green + blue) / 3;
  return high <= 36 && high - low <= 18 && luminance <= 28;
}

function removeConnectedDarkBackground(data, info) {
  const pixelCount = info.width * info.height;
  const outside = new Uint8Array(pixelCount);
  const queue = new Uint32Array(pixelCount);
  let readIndex = 0;
  let writeIndex = 0;
  const enqueue = (x, y) => {
    const pixelIndex = y * info.width + x;
    if (outside[pixelIndex] || !isConnectedDarkBackground(data, pixelIndex * 4)) return;
    outside[pixelIndex] = 1;
    queue[writeIndex++] = pixelIndex;
  };
  for (let x = 0; x < info.width; x += 1) {
    enqueue(x, 0);
    enqueue(x, info.height - 1);
  }
  for (let y = 1; y < info.height - 1; y += 1) {
    enqueue(0, y);
    enqueue(info.width - 1, y);
  }
  while (readIndex < writeIndex) {
    const pixelIndex = queue[readIndex++];
    const x = pixelIndex % info.width;
    const y = Math.floor(pixelIndex / info.width);
    if (x > 0) enqueue(x - 1, y);
    if (x + 1 < info.width) enqueue(x + 1, y);
    if (y > 0) enqueue(x, y - 1);
    if (y + 1 < info.height) enqueue(x, y + 1);
  }
  for (let pixelIndex = 0; pixelIndex < pixelCount; pixelIndex += 1) {
    if (!outside[pixelIndex]) continue;
    const offset = pixelIndex * 4;
    data[offset] = 0;
    data[offset + 1] = 0;
    data[offset + 2] = 0;
    data[offset + 3] = 0;
  }
  return writeIndex;
}

function collectVisibleComponents(data, info) {
  const pixelCount = info.width * info.height;
  const visited = new Uint8Array(pixelCount);
  const components = [];
  for (let start = 0; start < pixelCount; start += 1) {
    if (visited[start] || data[start * 4 + 3] < ALPHA_THRESHOLD) continue;
    visited[start] = 1;
    const pixels = [start];
    let minX = start % info.width;
    let maxX = minX;
    let minY = Math.floor(start / info.width);
    let maxY = minY;
    for (let readIndex = 0; readIndex < pixels.length; readIndex += 1) {
      const pixelIndex = pixels[readIndex];
      const x = pixelIndex % info.width;
      const y = Math.floor(pixelIndex / info.width);
      minX = Math.min(minX, x);
      maxX = Math.max(maxX, x);
      minY = Math.min(minY, y);
      maxY = Math.max(maxY, y);
      for (let deltaY = -1; deltaY <= 1; deltaY += 1) {
        for (let deltaX = -1; deltaX <= 1; deltaX += 1) {
          if (deltaX === 0 && deltaY === 0) continue;
          const nextX = x + deltaX;
          const nextY = y + deltaY;
          if (nextX < 0 || nextX >= info.width || nextY < 0 || nextY >= info.height) continue;
          const nextIndex = nextY * info.width + nextX;
          if (visited[nextIndex] || data[nextIndex * 4 + 3] < ALPHA_THRESHOLD) continue;
          visited[nextIndex] = 1;
          pixels.push(nextIndex);
        }
      }
    }
    components.push({
      pixels,
      count: pixels.length,
      minX,
      minY,
      maxX,
      maxY,
      width: maxX - minX + 1,
      height: maxY - minY + 1,
      centerX: (minX + maxX) / 2
    });
  }
  return components;
}

function authoredSksComponentsByFrame(components, sourceWidth) {
  const groups = Array.from({length: COLUMNS}, () => []);
  for (const component of components) {
    if (component.count < 24) continue;
    const column = Math.max(0, Math.min(COLUMNS - 1, Math.floor(component.centerX / sourceWidth * COLUMNS)));
    groups[column].push(component);
  }
  return groups.map((group, column) => {
    group.sort((left, right) => right.count - left.count);
    const primary = group[0];
    if (!primary || primary.count < 10_000) {
      throw new Error(`Authored SKS frame ${column} has no complete character component`);
    }
    return group.filter((component) => {
      if (component === primary || component.count >= 500) return true;
      const horizontalGap = Math.max(0, primary.minX - component.maxX, component.minX - primary.maxX);
      const verticalGap = Math.max(0, primary.minY - component.maxY, component.minY - primary.maxY);
      return component.count >= 48 && horizontalGap <= 12 && verticalGap <= 12;
    });
  });
}

function isolatedComponentCrop(data, info, components) {
  const minX = Math.max(0, Math.min(...components.map((component) => component.minX)) - 2);
  const minY = Math.max(0, Math.min(...components.map((component) => component.minY)) - 2);
  const maxX = Math.min(info.width - 1, Math.max(...components.map((component) => component.maxX)) + 2);
  const maxY = Math.min(info.height - 1, Math.max(...components.map((component) => component.maxY)) + 2);
  const width = maxX - minX + 1;
  const height = maxY - minY + 1;
  const sourceMask = new Uint8Array(info.width * info.height);
  for (const component of components) {
    for (const pixelIndex of component.pixels) sourceMask[pixelIndex] = 1;
  }
  const keepMask = sourceMask.slice();
  for (const component of components) {
    for (const pixelIndex of component.pixels) {
      const x = pixelIndex % info.width;
      const y = Math.floor(pixelIndex / info.width);
      for (let deltaY = -2; deltaY <= 2; deltaY += 1) {
        for (let deltaX = -2; deltaX <= 2; deltaX += 1) {
          const nextX = x + deltaX;
          const nextY = y + deltaY;
          if (nextX < minX || nextX > maxX || nextY < minY || nextY > maxY) continue;
          keepMask[nextY * info.width + nextX] = 1;
        }
      }
    }
  }
  const crop = Buffer.alloc(width * height * 4);
  for (let y = minY; y <= maxY; y += 1) {
    for (let x = minX; x <= maxX; x += 1) {
      const sourceIndex = y * info.width + x;
      if (!keepMask[sourceIndex]) continue;
      const sourceOffset = sourceIndex * 4;
      const targetOffset = ((y - minY) * width + (x - minX)) * 4;
      data.copy(crop, targetOffset, sourceOffset, sourceOffset + 4);
    }
  }
  return {buffer: crop, bounds: {minX, minY, maxX, maxY, width, height}};
}

async function normalizeAuthoredSksFrame(crop, column) {
  const scale = Math.min(AUTHORED_SKS_MAX_WIDTH / crop.bounds.width, AUTHORED_SKS_MAX_HEIGHT / crop.bounds.height);
  const width = Math.max(1, Math.round(crop.bounds.width * scale));
  const height = Math.max(1, Math.round(crop.bounds.height * scale));
  const resized = await sharp(crop.buffer, {
    raw: {width: crop.bounds.width, height: crop.bounds.height, channels: 4}
  }).resize({width, height, fit: 'fill', kernel: sharp.kernel.lanczos3})
    .png({compressionLevel: 9, adaptiveFiltering: true})
    .toBuffer();
  const left = Math.max(2, Math.min(FRAME_WIDTH - width - 2, Math.round((FRAME_WIDTH - width) / 2) + FRAME_OFFSETS[column].x));
  const top = Math.max(2, Math.min(FRAME_HEIGHT - height - 2, BASELINE - height + FRAME_OFFSETS[column].y));
  const frame = await sharp({
    create: {width: FRAME_WIDTH, height: FRAME_HEIGHT, channels: 4, background: {r: 0, g: 0, b: 0, alpha: 0}}
  }).composite([{input: resized, left, top}])
    .png({compressionLevel: 9, adaptiveFiltering: true})
    .toBuffer();
  return {frame, placement: {left, top, width, height}};
}

async function prepareAuthoredSksFrames(sourcePath) {
  const sourceBytes = fs.readFileSync(sourcePath);
  const decoded = await sharp(sourceBytes).ensureAlpha().raw().toBuffer({resolveWithObject: true});
  const removedBackgroundPixels = removeConnectedDarkBackground(decoded.data, decoded.info);
  const componentsByFrame = authoredSksComponentsByFrame(collectVisibleComponents(decoded.data, decoded.info), decoded.info.width);
  const frames = [];
  const sourceFrames = [];
  const placements = [];
  for (let column = 0; column < COLUMNS; column += 1) {
    const crop = isolatedComponentCrop(decoded.data, decoded.info, componentsByFrame[column]);
    const normalized = await normalizeAuthoredSksFrame(crop, column);
    frames.push(normalized.frame);
    placements.push(normalized.placement);
    sourceFrames.push({
      column,
      sourceBounds: crop.bounds,
      selectedComponents: componentsByFrame[column].map((component) => ({
        pixels: component.count,
        left: component.minX,
        top: component.minY,
        width: component.width,
        height: component.height
      })),
      outputPlacement: normalized.placement
    });
  }
  return {
    sourcePath,
    sourceBytes,
    sourceSha256: sha256(sourceBytes),
    sourceDimensions: {width: decoded.info.width, height: decoded.info.height},
    removedBackgroundPixels,
    alphaPolicy: 'EDGE_CONNECTED_DARK_BACKGROUND_REMOVAL_NO_REDRAW',
    frames,
    sourceFrames,
    transparent: true
  };
}

async function prepareGripPose(sourcePath, suit, strictGreenBounds = false) {
  const decoded = await sharp(sourcePath).ensureAlpha().raw().toBuffer({resolveWithObject: true});
  const masks = chromaMasks(decoded.data, decoded.info, strictGreenBounds);
  applyProxyKey(decoded.data, decoded.info, masks.blueMask, masks.greenMask);
  const visible = visibleBoundsRaw(decoded.data, decoded.info);
  const scale = Math.min(BODY_HEIGHT / visible.height, BODY_MAX_WIDTH / visible.width);
  const width = Math.max(1, Math.round(visible.width * scale));
  const height = Math.max(1, Math.round(visible.height * scale));
  const cropped = await sharp(decoded.data, {raw: decoded.info})
    .extract({left: visible.minX, top: visible.minY, width: visible.width, height: visible.height})
    .resize({width, height, fit: 'fill', kernel: sharp.kernel.lanczos3})
    .png({compressionLevel: 9, adaptiveFiltering: true})
    .toBuffer();
  const left = Math.round((FRAME_WIDTH - width) / 2) + suit.bodyOffsetX;
  const top = BASELINE - height;
  return {
    buffer: cropped,
    width,
    height,
    left,
    top,
    proxy: {
      left: left + (masks.greenBounds.minX - visible.minX) * scale,
      top: top + (masks.greenBounds.minY - visible.minY) * scale,
      width: masks.greenBounds.width * scale,
      height: masks.greenBounds.height * scale
    }
  };
}

async function cleanSource(sourcePath, chroma) {
  const decoded = await sharp(sourcePath).ensureAlpha().raw().toBuffer({resolveWithObject: true});
  if (chroma) keyChroma(decoded.data);
  const cleaned = await sharp(decoded.data, {raw: decoded.info})
    .trim({background: {r: 0, g: 0, b: 0, alpha: 0}, threshold: 2})
    .png({compressionLevel: 9, adaptiveFiltering: true})
    .toBuffer();
  const metadata = await sharp(cleaned).metadata();
  if (!metadata.hasAlpha) throw new Error(`Clean source lost alpha: ${sourcePath}`);
  return {buffer: cleaned, width: metadata.width, height: metadata.height};
}

async function normalizeBody(cleaned, suit) {
  const scale = Math.min(BODY_HEIGHT / cleaned.height, BODY_MAX_WIDTH / cleaned.width);
  const width = Math.max(1, Math.round(cleaned.width * scale));
  const height = Math.max(1, Math.round(cleaned.height * scale));
  const resized = await sharp(cleaned.buffer)
    .resize({width, height, fit: 'fill', kernel: sharp.kernel.lanczos3})
    .png({compressionLevel: 9, adaptiveFiltering: true})
    .toBuffer();
  return {
    buffer: resized,
    width,
    height,
    left: Math.round((FRAME_WIDTH - width) / 2) + suit.bodyOffsetX,
    top: BASELINE - height
  };
}

async function prepareWeapon(weapon, targetWidth) {
  const sourcePath = path.join(WEAPON_ROOT, weapon.file);
  const buffer = await sharp(sourcePath)
    .ensureAlpha()
    .trim({background: {r: 0, g: 0, b: 0, alpha: 0}, threshold: 2})
    .flop()
    .resize({width: targetWidth, fit: 'inside', withoutEnlargement: false, kernel: sharp.kernel.lanczos3})
    .png({compressionLevel: 9, adaptiveFiltering: true})
    .toBuffer();
  const metadata = await sharp(buffer).metadata();
  return {buffer, width: metadata.width, height: metadata.height, sourcePath};
}

async function transparentFrame() {
  return sharp({
    create: {width: FRAME_WIDTH, height: FRAME_HEIGHT, channels: 4, background: {r: 0, g: 0, b: 0, alpha: 0}}
  }).png().toBuffer();
}

async function bodyFrame(body, offset) {
  return sharp({
    create: {width: FRAME_WIDTH, height: FRAME_HEIGHT, channels: 4, background: {r: 0, g: 0, b: 0, alpha: 0}}
  }).composite([{
    input: body.buffer,
    left: body.left + offset.x,
    top: body.top + offset.y
  }]).png({compressionLevel: 9, adaptiveFiltering: true}).toBuffer();
}

async function foregroundFrame(bodyPng, regions, offset) {
  const layers = [];
  for (const region of regions) {
    const left = Math.max(0, Math.min(FRAME_WIDTH - 1, region.left + offset.x));
    const top = Math.max(0, Math.min(FRAME_HEIGHT - 1, region.top + offset.y));
    const width = Math.max(1, Math.min(region.width, FRAME_WIDTH - left));
    const height = Math.max(1, Math.min(region.height, FRAME_HEIGHT - top));
    const input = await sharp(bodyPng)
      .extract({left, top, width, height})
      .png({compressionLevel: 9, adaptiveFiltering: true})
      .toBuffer();
    layers.push({input, left, top});
  }
  return sharp({
    create: {width: FRAME_WIDTH, height: FRAME_HEIGHT, channels: 4, background: {r: 0, g: 0, b: 0, alpha: 0}}
  }).composite(layers).png({compressionLevel: 9, adaptiveFiltering: true}).toBuffer();
}

async function compositeFrame(body, weapon, offset, placementAdjustment = {x: 0, y: 0}, foregroundRegions = null) {
  const bodyPng = await bodyFrame(body, offset);
  const proxyCenterX = body.proxy.left + body.proxy.width / 2;
  const proxyCenterY = body.proxy.top + body.proxy.height / 2;
  const left = Math.max(FRAME_MARGIN, Math.min(
    FRAME_WIDTH - FRAME_MARGIN - weapon.width,
    Math.round(proxyCenterX - weapon.width / 2) + offset.x + placementAdjustment.x
  ));
  const top = Math.max(FRAME_MARGIN, Math.min(
    FRAME_HEIGHT - FRAME_MARGIN - weapon.height,
    Math.round(proxyCenterY - weapon.height / 2) + offset.y + placementAdjustment.y
  ));
  const layers = foregroundRegions?.length
    ? [
      {input: bodyPng, left: 0, top: 0},
      {input: weapon.buffer, left, top},
      {input: await foregroundFrame(bodyPng, foregroundRegions, offset), left: 0, top: 0}
    ]
    : [
      {input: weapon.buffer, left, top},
      {input: bodyPng, left: 0, top: 0}
    ];
  const composed = await sharp({
    create: {width: FRAME_WIDTH, height: FRAME_HEIGHT, channels: 4, background: {r: 0, g: 0, b: 0, alpha: 0}}
  }).composite(layers).png({compressionLevel: 9, adaptiveFiltering: true}).toBuffer();
  return {composed, bodyPng, weaponPlacement: {left, top, width: weapon.width, height: weapon.height}};
}

async function writeAtlas(cells, outputPath) {
  const atlas = Buffer.alloc(FRAME_WIDTH * COLUMNS * FRAME_HEIGHT * ROWS * 4);
  const atlasWidth = FRAME_WIDTH * COLUMNS;
  for (const cell of cells) {
    const {data, info} = await rawPixels(cell.input);
    if (info.width !== FRAME_WIDTH || info.height !== FRAME_HEIGHT || info.channels !== 4) {
      throw new Error(`Invalid atlas cell ${info.width}x${info.height}x${info.channels}`);
    }
    for (let y = 0; y < FRAME_HEIGHT; y += 1) {
      const sourceOffset = y * FRAME_WIDTH * 4;
      const targetOffset = (((cell.top + y) * atlasWidth) + cell.left) * 4;
      data.copy(atlas, targetOffset, sourceOffset, sourceOffset + FRAME_WIDTH * 4);
    }
  }
  await sharp(atlas, {
    raw: {width: FRAME_WIDTH * COLUMNS, height: FRAME_HEIGHT * ROWS, channels: 4}
  }).png({compressionLevel: 9, adaptiveFiltering: true}).toFile(outputPath);
}

async function rawFrameFromAtlas(atlasPath, column, row) {
  return sharp(atlasPath)
    .extract({left: column * FRAME_WIDTH, top: row * FRAME_HEIGHT, width: FRAME_WIDTH, height: FRAME_HEIGHT})
    .ensureAlpha()
    .png({compressionLevel: 9, adaptiveFiltering: true})
    .toBuffer();
}

async function rawPixels(png) {
  return sharp(png).ensureAlpha().raw().toBuffer({resolveWithObject: true});
}

async function boundsOf(png) {
  const {data, info} = await rawPixels(png);
  let minX = info.width;
  let minY = info.height;
  let maxX = -1;
  let maxY = -1;
  for (let y = 0; y < info.height; y += 1) {
    for (let x = 0; x < info.width; x += 1) {
      if (data[(y * info.width + x) * 4 + 3] < ALPHA_THRESHOLD) continue;
      minX = Math.min(minX, x);
      minY = Math.min(minY, y);
      maxX = Math.max(maxX, x);
      maxY = Math.max(maxY, y);
    }
  }
  if (maxX < minX) throw new Error('No visible pixels in frame');
  return {minX, minY, maxX, maxY, width: maxX - minX + 1, height: maxY - minY + 1};
}

async function solePivot(png) {
  const {data, info} = await rawPixels(png);
  const bounds = await boundsOf(png);
  let sumX = 0;
  let count = 0;
  for (let y = Math.max(0, bounds.maxY - 8); y <= bounds.maxY; y += 1) {
    for (let x = 0; x < info.width; x += 1) {
      if (data[(y * info.width + x) * 4 + 3] < ALPHA_THRESHOLD) continue;
      sumX += x;
      count += 1;
    }
  }
  if (!count) throw new Error('No sole pixels');
  return {x: Number((sumX / count).toFixed(3)), y: bounds.maxY};
}

async function muzzlePoint(weapon, placement) {
  const {data, info} = await rawPixels(weapon.buffer);
  let maxX = -1;
  const ys = [];
  for (let y = 0; y < info.height; y += 1) {
    for (let x = 0; x < info.width; x += 1) {
      if (data[(y * info.width + x) * 4 + 3] < ALPHA_THRESHOLD) continue;
      maxX = Math.max(maxX, x);
    }
  }
  for (let y = 0; y < info.height; y += 1) {
    for (let x = Math.max(0, maxX - 3); x <= maxX; x += 1) {
      if (data[(y * info.width + x) * 4 + 3] >= ALPHA_THRESHOLD) ys.push(y);
    }
  }
  ys.sort((a, b) => a - b);
  return {
    x: placement.left + maxX,
    y: placement.top + ys[Math.floor(ys.length / 2)]
  };
}

async function authoredMuzzlePoint(frame) {
  const {data, info} = await rawPixels(frame);
  let maxX = -1;
  for (let y = 0; y < info.height; y += 1) {
    for (let x = 0; x < info.width; x += 1) {
      if (data[(y * info.width + x) * 4 + 3] >= ALPHA_THRESHOLD) maxX = Math.max(maxX, x);
    }
  }
  if (maxX < 0) throw new Error('Authored SKS frame has no visible muzzle');
  const ys = [];
  for (let y = 0; y < info.height; y += 1) {
    for (let x = Math.max(0, maxX - 3); x <= maxX; x += 1) {
      if (data[(y * info.width + x) * 4 + 3] >= ALPHA_THRESHOLD) ys.push(y);
    }
  }
  ys.sort((left, right) => left - right);
  return {x: maxX, y: ys[Math.floor(ys.length / 2)]};
}

async function build() {
  fs.mkdirSync(SUIT_ROOT, {recursive: true});
  fs.mkdirSync(ANIMATION_ROOT, {recursive: true});

  const diagnostics = {
    version: 'v3',
    contract: 'PROJECT_V_ACCOUNT_BATTLE_SUIT_GRIP_LAYER_ATLAS_DIAGNOSTICS_V3',
    sha256Algorithm: 'SHA-256',
    frameSize: {width: FRAME_WIDTH, height: FRAME_HEIGHT},
    bodyTarget: {height: BODY_HEIGHT, maxWidth: BODY_MAX_WIDTH, baseline: BASELINE},
    entries: [],
    sheets: []
  };
  const provenanceSources = [];

  for (const [suitCode, suit] of Object.entries(SUITS)) {
    const sourcePath = path.join(SOURCE_ROOT, suit.source);
    const sourceBytes = fs.readFileSync(sourcePath);
    const gripProxyPath = path.join(SOURCE_ROOT, suit.gripProxy);
    const gripProxyBytes = fs.readFileSync(gripProxyPath);
    const cleaned = await cleanSource(sourcePath, suit.chroma);
    const authoredSksPath = path.join(SOURCE_ROOT, suit.authoredSksSource);
    const authoredSks = await prepareAuthoredSksFrames(authoredSksPath);
    const gripPoseCache = new Map();
    const getGripPose = async (weaponCode) => {
      const filename = suit.weaponGripProxies?.[weaponCode] || suit.gripProxy;
      if (!gripPoseCache.has(filename)) {
        const selectedPath = path.join(SOURCE_ROOT, filename);
        gripPoseCache.set(filename, {
          filename,
          path: selectedPath,
          bytes: fs.readFileSync(selectedPath),
          body: await prepareGripPose(
            selectedPath,
            {...suit, bodyOffsetX: suit.weaponBodyOffsetX?.[weaponCode] ?? suit.bodyOffsetX},
            filename.includes('-sks-grip-proxy-v5.png')
          )
        });
      }
      return gripPoseCache.get(filename);
    };
    const staticPath = path.join(SUIT_ROOT, suit.staticFile);
    await sharp(cleaned.buffer).png({compressionLevel: 9, adaptiveFiltering: true}).toFile(staticPath);
    provenanceSources.push({
      suitCode,
      sourcePolicy: 'GENERATED_CLEAN_BODY_NO_WEAPON',
      cleanBodySource: webPath(sourcePath),
      cleanBodySourceSha256: sha256(sourceBytes),
      transparentStatic: webPath(staticPath),
      transparentStaticSha256: sha256(fs.readFileSync(staticPath)),
      gripProxySource: webPath(gripProxyPath),
      gripProxySourceSha256: sha256(gripProxyBytes),
      gripProxyPolicy: 'GENERATED_TWO_HAND_HORIZONTAL_RIFLE_POSE_WITH_REMOVABLE_GREEN_PROXY',
      weaponSpecificGripProxies: Object.entries(suit.weaponGripProxies || {}).map(([weaponCode, filename]) => {
        const selectedPath = path.join(SOURCE_ROOT, filename);
        return {
          weaponCode,
          source: webPath(selectedPath),
          sha256: sha256(fs.readFileSync(selectedPath)),
          policy: 'DEDICATED_WEAPON_GEOMETRY_AND_CONTACT_POINTS'
        };
      }),
      authoredSksSource: webPath(authoredSksPath),
      authoredSksSourceSha256: authoredSks.sourceSha256,
      authoredSksSourceDimensions: authoredSks.sourceDimensions,
      authoredSksPolicy: 'USER_PROVIDED_SECOND_ROW_FINAL_COMPOSITE_NO_GENERATIVE_REDRAW',
      authoredSksAlphaPreparation: authoredSks.alphaPolicy,
      authoredSksRemovedBackgroundPixels: authoredSks.removedBackgroundPixels,
      authoredSksFrames: authoredSks.sourceFrames,
      alphaPreparation: suit.chroma ? 'IMAGEGEN_SOLID_CHROMA_THEN_DETERMINISTIC_ALPHA_KEY' : 'IMAGEGEN_NATIVE_RGBA'
    });

    for (const [pair, weaponCodes] of Object.entries(PAIRS)) {
      const cells = [];
      const atlasVersion = pair === 'ak-sks' ? 'v5' : 'v3';
      const outputPath = path.join(ANIMATION_ROOT, `${suit.slug}-${pair}-horizontal-fire-atlas-${atlasVersion}.png`);
      for (let row = 0; row < ROWS; row += 1) {
        const weaponCode = weaponCodes[row];
        const weaponConfig = WEAPONS[weaponCode];
        if (weaponCode === AUTHORED_SKS_CODE) {
          const frames = authoredSks.frames;
          for (let column = 0; column < COLUMNS; column += 1) {
            cells.push({input: frames[column], left: column * FRAME_WIDTH, top: row * FRAME_HEIGHT});
          }
          const frameBounds = await Promise.all(frames.map(boundsOf));
          const pivots = await Promise.all(frames.map(solePivot));
          const fireMuzzle = await authoredMuzzlePoint(frames[1]);
          const bodyBounds = frameBounds[0];
          diagnostics.entries.push({
            suitCode,
            weaponCode,
            weaponSlug: weaponConfig.slug,
            pair,
            row,
            bodyBounds: {headY: bodyBounds.minY, soleY: bodyBounds.maxY, height: bodyBounds.height},
            contentBounds: {top: Math.min(...frameBounds.map((item) => item.minY)), bottom: Math.max(...frameBounds.map((item) => item.maxY))},
            pivots,
            muzzle: fireMuzzle,
            bodySourceSha256: authoredSks.sourceSha256,
            cleanBodySourceSha256: sha256(sourceBytes),
            authoredCompositeSource: webPath(authoredSksPath),
            authoredCompositeSourceSha256: authoredSks.sourceSha256,
            authoredCompositeSourceDimensions: authoredSks.sourceDimensions,
            authoredFramePreparation: authoredSks.alphaPolicy,
            authoredSourceFrames: authoredSks.sourceFrames,
            exactWeaponSourceSha256: null,
            preparedWeaponSha256: null,
            preparedWeaponDimensions: null,
            exactWeaponRotationDegrees: 0,
            canonicalLocked: false,
            usesDedicatedGripPose: false,
            dedicatedGripPoseKind: null,
            weaponPlacementAdjustment: {x: 0, y: 0},
            weaponPlacement: authoredSks.sourceFrames[0].outputPlacement,
            weaponPlacements: authoredSks.sourceFrames.map((frame) => frame.outputPlacement),
            legacyWeaponPixelsRemoved: 0,
            exactWeaponOnly: false,
            gripProxyRemoved: null,
            semanticLayerOrder: ['USER_AUTHORED_FULL_COMPOSITE']
          });
          continue;
        }
        const gripPose = await getGripPose(weaponCode);
        const body = gripPose.body;
        const usesDedicatedGripPose = Boolean(suit.weaponGripProxies?.[weaponCode]);
        const proxyScale = usesDedicatedGripPose ? 1 : weaponConfig.proxyScale;
        const targetWidth = suit.weaponTargetWidths?.[weaponCode] || Math.max(248, Math.min(
          FRAME_WIDTH - FRAME_MARGIN * 2,
          Math.round(body.proxy.width * proxyScale)
        ));
        const weapon = {...weaponConfig, ...(await prepareWeapon(weaponConfig, targetWidth))};
        const frames = [];
        const weaponPlacements = [];
        let bodyBounds = null;
        let fireMuzzle = null;
        for (let column = 0; column < COLUMNS; column += 1) {
          let frame;
          let bodyOnly;
          let placement;
          const canonicalLocked = suitCode === 'BATTLE_SUIT_02' && weaponCode === 'EQ_1785427638137';
          if (canonicalLocked) {
            const canonicalPath = path.join(ANIMATION_ROOT, suit.canonicalM4);
            frame = await rawFrameFromAtlas(canonicalPath, column, 0);
            bodyOnly = frame;
            placement = {left: 0, top: 0, width: FRAME_WIDTH, height: FRAME_HEIGHT};
          } else {
            const placementAdjustment = suit.weaponPlacementAdjustments?.[weaponCode] || {x: 0, y: 0};
            const foregroundRegions = suit.weaponForegroundRegions?.[weaponCode] || null;
            const built = await compositeFrame(body, weapon, FRAME_OFFSETS[column], placementAdjustment, foregroundRegions);
            frame = built.composed;
            bodyOnly = built.bodyPng;
            placement = built.weaponPlacement;
          }
          frames.push(frame);
          weaponPlacements.push(placement);
          cells.push({input: frame, left: column * FRAME_WIDTH, top: row * FRAME_HEIGHT});
          if (column === 0) bodyBounds = canonicalLocked
            ? {minX: 0, minY: 39, maxX: 383, maxY: 479, width: 384, height: 441}
            : await boundsOf(bodyOnly);
          if (column === 1) fireMuzzle = canonicalLocked
            ? {x: 379, y: 152}
            : await muzzlePoint(weapon, placement);
        }
        const frameBounds = await Promise.all(frames.map(boundsOf));
        const pivots = await Promise.all(frames.map(solePivot));
        diagnostics.entries.push({
          suitCode,
          weaponCode,
          weaponSlug: weapon.slug,
          pair,
          row,
          bodyBounds: {headY: bodyBounds.minY, soleY: bodyBounds.maxY, height: bodyBounds.height},
          contentBounds: {top: Math.min(...frameBounds.map(item => item.minY)), bottom: Math.max(...frameBounds.map(item => item.maxY))},
          pivots,
          muzzle: fireMuzzle,
          bodySourceSha256: sha256(gripPose.bytes),
          cleanBodySourceSha256: sha256(sourceBytes),
          gripProxySource: webPath(gripPose.path),
          gripProxySourceSha256: sha256(gripPose.bytes),
          gripProxyBounds: body.proxy,
          exactWeaponSourceSha256: sha256(fs.readFileSync(weapon.sourcePath)),
          preparedWeaponSha256: sha256(weapon.buffer),
          preparedWeaponDimensions: {width: weapon.width, height: weapon.height},
          exactWeaponRotationDegrees: 0,
          canonicalLocked: suitCode === 'BATTLE_SUIT_02' && weaponCode === 'EQ_1785427638137',
          usesDedicatedGripPose,
          dedicatedGripPoseKind: usesDedicatedGripPose ? weapon.slug.toUpperCase() : null,
          weaponPlacementAdjustment: suit.weaponPlacementAdjustments?.[weaponCode] || {x: 0, y: 0},
          weaponPlacement: weaponPlacements[0],
          weaponPlacements,
          legacyWeaponPixelsRemoved: 0,
          exactWeaponOnly: true,
          gripProxyRemoved: true,
          semanticLayerOrder: suit.weaponForegroundRegions?.[weaponCode]
            ? ['BODY_BASE_BEHIND', 'EXACT_DATABASE_WEAPON', 'HANDS_FOREARMS_FOREGROUND']
            : ['EXACT_DATABASE_WEAPON', 'BODY_ARMS_AND_HANDS_FOREGROUND']
        });
      }
      await writeAtlas(cells, outputPath);
      diagnostics.sheets.push({
        suitCode,
        pair,
        image: webPath(outputPath),
        sha256: sha256(fs.readFileSync(outputPath))
      });
    }
  }

  const weaponProvenance = Object.entries(WEAPONS).map(([equipmentCode, weapon]) => {
    const sourcePath = path.join(WEAPON_ROOT, weapon.file);
    return ({
    equipmentCode,
    battleSprite: webPath(sourcePath),
    sha256: sha256(fs.readFileSync(sourcePath)),
    rotationDegrees: 0,
    sourcePolicy: 'EXACT_DATABASE_BATTLE_SPRITE_RASTER'
    });
  });
  const provenance = {
    version: 'v2',
    tool: 'OpenAI built-in image generation tool',
    purpose: 'PROJECT V V3 PVE-only Battle Suit appearance 01/02/03 firearm coverage with the user-approved second-row SKS composites connected as transparent runtime frames',
    approvedModelAnchor: {
      suitCode: 'BATTLE_SUIT_02',
      weaponCode: 'EQ_1785427638137',
      policy: 'PIXEL_LOCKED_FROM_V2_ROW_0'
    },
    finalPromptSet: {
      cleanBodyVariants: 'Generate three full-body Battle Suit variants in the approved Suit 02 scale and horizontal two-hand ready pose, with no weapon so no legacy rifle pixels can remain.',
      gripProxyVariants: 'Generate each approved female Battle Suit holding one flat featureless green horizontal rifle proxy on a solid blue background: stock seated in the rear shoulder, trigger hand on the pistol grip, support hand under the forward handguard, elbows bent, and no rifle intersection through chest, face, arms or hands.',
      dedicatedM200GripVariants: 'For Suit 02 and Suit 03, generate a separate long-precision-rifle pose with the butt pad contacting the rear shoulder plate, the rear hand on the trigger grip, the forward hand under the receiver front, and the eye line behind the optic; never reuse the AR pose for M200.',
      authoredSksSecondRows: 'Use the user-approved second row for Battle Suit 01, 02 and 03 exactly as supplied; remove only the connected black background, preserve all character and SKS pixels, keep the rifle at the authored horizontal 0-degree axis, and do not redraw or recomposite the weapon.',
      exactWeaponComposite: 'For M4A1, AK and M200, key out the pose proxy and composite the exact approved database battle-sprite raster with rotation at exactly 0 degrees. For SKS, use the complete user-approved second-row composite without separating or redrawing the rifle. Runtime owns muzzle flash.',
      suit01: 'Use the approved Suit 02 adult female scale and horizontal rifle-ready stance; redesign Suit 01 as a white-gold-cyan hard-surface mechanical exosuit with segmented armor, visible joints, servos and restrained mechanical fins; no weapon.',
      suit02: 'Preserve the approved orange-bob black-white cyber tactical Suit 02 modeling and horizontal two-handed rifle-ready pose; remove the weapon and return a clean isolated body.',
      suit03: 'Rebuild Suit 03 on Suit 02 adult female proportions, stance, camera and screen occupancy; retain magenta-white-black-gold helmeted exosuit identity; no weapon.',
      exactWeapons: 'Composite the exact approved database M4A1, AK, M200 and SKS cutout rasters at 0-degree horizontal rotation behind the hands; never redraw a weapon; runtime owns muzzle flash.'
    },
    generatedOriginals: provenanceSources,
    exactDatabaseWeaponSources: weaponProvenance,
    gripLayerAtlasScript: '/scripts/build-battle-suit-atlases-v3.cjs',
    semanticLayerOrder: ['EXACT_DATABASE_WEAPON', 'BODY_ARMS_AND_HANDS_FOREGROUND'],
    sksSemanticLayerOrder: ['USER_AUTHORED_FULL_COMPOSITE'],
    authoredSksAlphaPolicy: 'EDGE_CONNECTED_DARK_BACKGROUND_REMOVAL_NO_REDRAW',
    cleanBodyAtlasScript: '/scripts/build-battle-suit-atlases-v3.cjs',
    deterministicCompositeScript: '/scripts/build-battle-suit-atlases-v3.cjs',
    buildDiagnostics: webPath(DIAGNOSTICS_PATH),
    runtimeContract: {
      scope: 'PVE_ONLY',
      formation: 'AUXILIARY_FRONT_LEFT_FORWARD_TILE',
      canonicalAllyCardCount: 5,
      movement: false,
      attackPresentation: 'SUSTAINED_BURST_VISUAL',
      addsIndependentDamage: false
    }
  };

  fs.writeFileSync(DIAGNOSTICS_PATH, `${JSON.stringify(diagnostics, null, 2)}\n`);
  fs.writeFileSync(PROVENANCE_PATH, `${JSON.stringify(provenance, null, 2)}\n`);
  console.log(JSON.stringify({
    diagnostics: webPath(DIAGNOSTICS_PATH),
    provenance: webPath(PROVENANCE_PATH),
    suits: provenanceSources,
    sheets: diagnostics.sheets,
    combinations: diagnostics.entries.length
  }, null, 2));
}

build().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
