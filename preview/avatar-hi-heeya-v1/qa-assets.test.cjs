'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const sharp = require('sharp');
const root = path.resolve(__dirname, '../..');
const manifest = JSON.parse(fs.readFileSync(path.join(__dirname, 'manifest.json'), 'utf8'));
const hash = file => crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex').toUpperCase();
const assetPath = entry => path.join(__dirname, entry.file);

test('exact MA source is preserved; the CMS draft is connected without public release or grants', () => {
  assert.equal(manifest.name, '하이희야');
  assert.equal(manifest.sourceCard.id, 'CN-B2F4D52C44C74C4F');
  assert.equal(manifest.sourceCard.grade, 'MA');
  assert.equal(manifest.sourceCard.title, '짱구 희야');
  assert.equal(hash(path.join(root, manifest.sourceCard.image)), manifest.sourceCard.sha256);
  for (const flag of ['runtimeConnected', 'catalogRegistered']) assert.equal(manifest[flag], true);
  for (const flag of ['grantIssued', 'originalReferencesModified', 'publicEnabled', 'saleEnabled', 'effectConfigured']) assert.equal(manifest[flag], false);
  assert.equal(manifest.serial, 'A-13');
  assert.equal(manifest.scope, 'LIVE_CMS_DRAFT');
  assert.equal(manifest.generation.codeImageEditingApproval, '배경만 코드로 제거');
});

test('separate native lobby and equipment originals retain their exact hashes and 2:3 canvas', async () => {
  for (const entry of manifest.assets) {
    const file = assetPath(entry), info = await sharp(file).metadata();
    assert.equal(hash(file), entry.sha256);
    assert.equal(info.width, 1024); assert.equal(info.height, 1536);
    assert.equal(info.channels, entry.channels); assert.equal(info.hasAlpha, entry.hasAlpha);
  }
  assert.notEqual(manifest.assets.find(a => a.kind === 'lobby').file, manifest.assets.find(a => a.kind === 'equipment').file);
});

test('true alpha clears outside and enclosed gaps, preserves white shoes, hands and all opaque RGB', async () => {
  const entry = manifest.assets.find(a => a.kind === 'equipment');
  const {data: output, info} = await sharp(assetPath(entry)).ensureAlpha().raw().toBuffer({resolveWithObject: true});
  const original = await sharp(path.join(__dirname, entry.derivedFrom)).ensureAlpha().raw().toBuffer();
  let transparent = 0, opaque = 0, partial = 0;
  for (let p = 0; p < info.width * info.height; p++) {
    const offset = p * 4, alpha = output[offset + 3];
    if (alpha === 0) transparent++; else if (alpha === 255) {
      opaque++;
      for (let c = 0; c < 3; c++) assert.equal(output[offset + c], original[offset + c]);
    } else partial++;
  }
  assert.equal(transparent, entry.transparentPixels);
  assert.equal(opaque, entry.opaquePixels);
  assert.equal(partial, entry.partialAlphaPixels);
  const alphaAt = (x, y) => output[(y * info.width + x) * 4 + 3];
  for (const [x, y] of [[0, 0], [1023, 1535], [360, 560], [423, 245], [530, 1000]]) assert.equal(alphaAt(x, y), 0, `background ${x},${y}`);
  for (const [x, y] of [[431, 1368], [665, 1368], [706, 393], [420, 650], [510, 260]]) assert.equal(alphaAt(x, y), 255, `character ${x},${y}`);
  assert.ok(entry.visibleBounds.top >= 64 && entry.visibleBounds.bottom < 1472);
});

test('mobile derivatives keep their declared alpha and source-specific dimensions', async () => {
  for (const entry of manifest.responsive) {
    const file = assetPath(entry), info = await sharp(file).metadata();
    assert.equal(hash(file), entry.sha256);
    assert.equal(info.width, entry.width); assert.equal(info.height, entry.height);
    assert.equal(info.hasAlpha, entry.hasAlpha);
    assert.ok(fs.statSync(file).size < 180000);
  }
});

test('both extraction failures remain explicit history and cannot be confused with the final alpha image', () => {
  assert.equal(manifest.alphaAttempts.length, 2);
  assert.ok(manifest.alphaAttempts.every(attempt => attempt.hasAlpha === false));
  const draft = manifest.assets.find(a => a.kind === 'equipment_draft');
  assert.equal(draft.status, 'REJECTED_FOR_RUNTIME_NO_REAL_ALPHA');
  assert.equal(manifest.assets.find(a => a.kind === 'equipment').status, 'TECHNICAL_PASS_USER_REVIEW_PENDING');
  assert.equal(manifest.status, 'CMS_REGISTERED_PUBLIC_OFF');
});
