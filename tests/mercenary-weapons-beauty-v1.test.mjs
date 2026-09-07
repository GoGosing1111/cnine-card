import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import vm from 'node:vm';
import sharp from 'sharp';

const root = path.resolve(import.meta.dirname, '..');
const dir = path.join(root, 'preview/mercenary-weapons-beauty-v1');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
const manifest = JSON.parse(fs.readFileSync(path.join(dir, 'generation.json'), 'utf8'));
const hash = bytes => crypto.createHash('sha256').update(bytes).digest('hex').toUpperCase();

test('eight weapon families plus six female firearms are separate native 2:3 PNG illustrations', async () => {
  assert.equal(manifest.status, 'APPROVED_SOURCE_ART');
  assert.equal(manifest.catalogConnected, true);
  assert.equal(manifest.runtimeConnected, false);
  assert.equal(manifest.originalsModified, false);
  assert.equal(manifest.cardRegistrationEnabled, false);
  assert.deepEqual(manifest.entries.slice(0, 8).map(entry => entry.weapon), ['SKS', '저격총', '라이플', '기관총', '창', '검방', '도', '대검']);
  assert.deepEqual(manifest.entries.slice(8).map(entry => entry.weapon), ['리볼버', '기관단총', '라이플', '샷건', '저격총', '기관총']);
  assert.equal(new Set(manifest.entries.map(entry => entry.sha256)).size, 14);
  for (const entry of manifest.entries) {
    assert.match(entry.file, /^assets\/[0-9]{2}-[a-z-]+-v[123]\.png$/);
    const bytes = fs.readFileSync(path.join(dir, entry.file));
    assert.equal(hash(bytes), entry.sha256);
    assert.equal(bytes.length, entry.bytes);
    const m = await sharp(bytes).metadata();
    assert.deepEqual([m.width, m.height, m.channels, m.format], [1024, 1536, 3, 'png']);
    assert.equal(entry.cardCode, `V-${String(entry.number + 23).padStart(3, '0')}`);
    assert.equal(entry.rank, null);
    assert.equal(entry.battleSprite, null);
    assert.equal(entry.status, 'APPROVED_SOURCE_ART');
    if (entry.key === 'pistol') {
      assert.match(entry.prompt, /precise-object-edit/);
      assert.match(entry.prompt, /Change ONLY/);
    } else if (entry.number > 8) {
      assert.match(entry.prompt, /STYLE REFERENCE ONLY/);
      assert.match(entry.prompt, /ADULT woman age 25-29/);
    } else {
      assert.match(entry.prompt, /user-approved BEAUTY AND PAINTING STYLE reference/);
      assert.match(entry.prompt, /ONE ADULT age 24-29/);
    }
  }
});

test('approved style references remain byte-identical and outfit variety matches the request', () => {
  for (const ref of manifest.styleReferences) assert.equal(hash(fs.readFileSync(path.resolve(dir, ref.file))), ref.sha256);
  assert.equal(manifest.entries.filter(entry => entry.gender === '여성').length, 10);
  assert.equal(manifest.entries.filter(entry => entry.gender === '남성').length, 4);
  assert.deepEqual(manifest.entries.slice(0, 8).filter(entry => entry.revealingOutfit).map(entry => entry.key), ['pistol', 'katana']);
  assert.equal(manifest.entries.slice(8).filter(entry => entry.revealingOutfit).length, 4);
  for (const property of ['key', 'concept', 'outfit', 'pose', 'palette']) assert.equal(new Set(manifest.entries.map(entry => entry[property])).size, 14);
  assert.match(manifest.entries.find(entry => entry.key === 'sniper').outfit, /방한/);
  assert.match(manifest.entries.find(entry => entry.key === 'sword-shield').outfit, /흉갑/);
});

test('preview is silent, isolated, frame-compatible and exposes all fourteen original downloads', () => {
  const html = fs.readFileSync(path.join(dir, 'index.html'), 'utf8');
  const js = fs.readFileSync(path.join(dir, 'review.js'), 'utf8');
  assert.match(html, /원화 승인/);
  assert.match(html, /noindex,nofollow/);
  assert.match(html, /160px 카드 크기/);
  assert.match(html, /mercenary-contract-frame-slim-v3\.png/);
  assert.match(html, /<dialog id="zoom" aria-labelledby="zoomTitle"/);
  assert.match(html, /aria-live="polite"/);
  assert.equal((html.match(/class="art-button"/g) || []).length, 14);
  assert.equal((html.match(/ download>/g) || []).length, 14);
  for (const entry of manifest.entries) assert.ok(html.includes(`./${entry.file}`));
  assert.doesNotMatch(js, /fetch\(|apiRequest|localStorage|AudioContext|new Audio|\/api\//);
  for (const file of ['index.html', 'js/app.js', 'mercenary-codex/index.html', 'assets/ui/project-v/mercenaries/mercenary-system-roster-v1.json']) {
    assert.doesNotMatch(read(file), /mercenary-weapons-beauty-v1/);
    for (const entry of manifest.entries) assert.ok(!read(file).includes(entry.file));
  }
});

test('all filters show the correct cards and announce counts without any account access', () => {
  const cards = manifest.entries.map((entry, i) => ({dataset:{family:i < 4 || i >= 8 ? 'firearm' : 'melee', gender:entry.gender === '여성' ? 'female' : 'male', current:entry.current ? 'true' : 'false'}, hidden:false}));
  const buttons = ['current', 'all', 'firearm', 'melee', 'female', 'male'].map(filter => ({dataset:{filter}, listeners:{}, attrs:{}, addEventListener(type, fn){this.listeners[type]=fn;}, setAttribute(key, value){this.attrs[key]=value;}}));
  const count = {textContent:''};
  const gallery = {querySelectorAll:selector => {assert.equal(selector, 'article'); return cards;}};
  const document = {
    querySelector:selector => selector === '#gallery' ? gallery : selector === '#resultCount' ? count : assert.fail(selector),
    querySelectorAll:selector => {assert.equal(selector, 'button[data-filter]'); return buttons;}
  };
  vm.runInNewContext(fs.readFileSync(path.join(dir, 'review.js'), 'utf8'), {document});
  for (const button of [...buttons.slice(1), buttons[0]]) {
    button.listeners.click();
    const expected = {current:7, all:14, firearm:10, melee:4, female:10, male:4}[button.dataset.filter];
    assert.equal(cards.filter(card => !card.hidden).length, expected);
    assert.equal(count.textContent, expected + '종 표시');
    assert.equal(button.attrs['aria-pressed'], 'true');
    assert.equal(buttons.filter(node => node.attrs['aria-pressed'] === 'true').length, 1);
  }
});

test('the final SKS revision preserves both pistol originals with traceable edit-only prompts', () => {
  const pistol = manifest.entries.find(entry => entry.key === 'pistol');
  assert.equal(pistol.revision, 'SKS_REPLACEMENT_V3');
  assert.equal(pistol.file, 'assets/01-sks-nocturne-v3.png');
  assert.equal(pistol.gripRevision.file, 'assets/01-pistol-nocturne-v2.png');
  assert.equal(hash(fs.readFileSync(path.join(dir, pistol.gripRevision.file))), pistol.gripRevision.sha256);
  assert.equal(pistol.previousVersion.file, 'assets/01-pistol-nocturne-v1.png');
  assert.equal(hash(fs.readFileSync(path.join(dir, pistol.previousVersion.file))), pistol.previousVersion.sha256);
  assert.notEqual(pistol.sha256, pistol.previousVersion.sha256);
  assert.match(pistol.prompt, /PRESERVE her exact face/);
  assert.match(pistol.prompt, /SKS semi-automatic carbine/);
  assert.ok(pistol.editQa.insideMeanAbsoluteDifference > pistol.editQa.outsideMeanAbsoluteDifference);
});
