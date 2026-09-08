'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const vm = require('node:vm');
const sharp = require('sharp');
const manifest = JSON.parse(fs.readFileSync(path.join(__dirname, 'manifest.json'), 'utf8'));
const read = name => fs.readFileSync(path.join(__dirname, name), 'utf8');
const sha = file => crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex').toUpperCase();

test('체온 is registered for live CMS configuration without grants or unconfigured public sales', () => {
  assert.equal(manifest.name, '체온');
  assert.equal(manifest.code, 'CHEON');
  assert.equal(manifest.scope, 'LIVE_CMS_DRAFT');
  assert.equal(manifest.status, 'CMS_REGISTERED_PUBLIC_OFF');
  assert.equal(manifest.serial, 'A-14');
  for (const key of ['runtimeConnected', 'catalogRegistered']) assert.equal(manifest[key], true, key);
  for (const key of ['publicEnabled', 'saleEnabled', 'effectConfigured',
    'grantIssued', 'originalReferencesModified', 'referencePhotoPublished']) assert.equal(manifest[key], false, key);
  assert.equal(manifest.generation.mode, 'BUILT_IN_IMAGE_GEN');
  assert.equal(manifest.generation.codeImageEditingApproval, '배경만 스크립트로 제거');
  assert.equal(manifest.userArtAndCmsApproval, '라이브적용하고 CMS바로 적용해');
  assert.equal(manifest.sourceReference.sha256, '8CCB27BAAE1DF847C5B95DBD17FECC83ED9033A1AB6C9D2E76CC646DF2196E4E');
  assert.ok(read('prompt.md').includes('black sleeveless V-neck top'));
});

test('native 1024×1536 originals and mobile derivatives match the frozen hashes', async () => {
  for (const entry of [...manifest.assets, ...manifest.responsive, ...manifest.qaBackgrounds]) {
    const file = path.join(__dirname, entry.file);
    const info = await sharp(file).metadata();
    assert.equal(sha(file), entry.sha256, entry.file);
    assert.equal(info.width, entry.width); assert.equal(info.height, entry.height);
    assert.equal(info.hasAlpha, entry.hasAlpha);
    if (entry.channels) assert.equal(info.channels, entry.channels);
    if (entry.file.endsWith('.webp')) assert.ok(fs.statSync(file).size < 180000);
    assert.equal(info.width / info.height, 2 / 3);
  }
});

test('real alpha clears outer borders and hand gaps without changing opaque character RGB', async () => {
  const entry = manifest.assets.find(a => a.kind === 'equipment');
  const {data, info} = await sharp(path.join(__dirname, entry.file)).ensureAlpha().raw().toBuffer({resolveWithObject: true});
  const source = await sharp(path.join(__dirname, entry.derivedFrom)).ensureAlpha().raw().toBuffer();
  let transparent = 0, opaque = 0, partial = 0;
  for (let p = 0; p < info.width * info.height; p++) {
    const offset = p * 4, a = data[offset + 3];
    if (!a) transparent++;
    else if (a === 255) {
      opaque++;
      for (let c = 0; c < 3; c++) assert.equal(data[offset + c], source[offset + c]);
    } else partial++;
  }
  assert.equal(transparent, entry.transparentPixels);
  assert.equal(opaque, entry.opaquePixels);
  assert.equal(partial, entry.partialAlphaPixels);
  const alpha = (x, y) => data[(y * info.width + x) * 4 + 3];
  for (let x = 0; x < info.width; x++) {assert.equal(alpha(x, 0), 0); assert.equal(alpha(x, info.height - 1), 0);}
  for (let y = 0; y < info.height; y++) {assert.equal(alpha(0, y), 0); assert.equal(alpha(info.width - 1, y), 0);}
  for (const [x, y] of [[353, 746], [354, 759], [407, 482], [555, 1400]]) assert.equal(alpha(x, y), 0, `gap ${x},${y}`);
  for (const [x, y] of [[530, 170], [411, 281], [450, 700], [344, 781], [465, 1390], [627, 1467]]) assert.equal(alpha(x, y), 255, `body ${x},${y}`);
  assert.ok(entry.visibleBounds.top >= 16 && entry.visibleBounds.bottom < 1520);
});

test('preview references only the final artwork and works without game APIs or a login', () => {
  const html = read('index.html');
  assert.ok(html.includes('<html lang="ko">'));
  assert.ok(html.includes('width=device-width'));
  assert.ok(html.includes('noindex,nofollow'));
  assert.ok(html.includes('체온'));
  for (const match of html.matchAll(/(?:href|src)="\.\/([^"?]+)(?:\?[^\"]*)?"/g)) {
    assert.ok(fs.existsSync(path.join(__dirname, match[1])), match[1]);
  }
  assert.ok(!html.includes('equipment-draft'));
  assert.ok(!html.includes(manifest.sourceReference.fileName));
  assert.doesNotMatch(html + read('preview.js'), /fetch\(|\/api\/|localStorage|sessionStorage/);
  assert.ok(read('style.css').includes('prefers-reduced-motion'));
});

test('dark/light review buttons maintain one selected state and accessible labels', () => {
  const stage = {dataset: {background: 'dark'}};
  const buttons = ['dark', 'light'].map(background => ({dataset: {background}, attributes: {}, handlers: {},
    setAttribute(key, value) {this.attributes[key] = value;}, addEventListener(event, fn) {this.handlers[event] = fn;}}));
  vm.runInNewContext(read('preview.js'), {document: {getElementById: () => stage, querySelectorAll: () => buttons}});
  for (const selected of [1, 0, 1]) {
    buttons[selected].handlers.click();
    assert.equal(stage.dataset.background, buttons[selected].dataset.background);
    assert.equal(buttons[selected].attributes['aria-pressed'], 'true');
    assert.equal(buttons[1 - selected].attributes['aria-pressed'], 'false');
  }
});
