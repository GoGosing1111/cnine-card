import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import sharp from 'sharp';

const root = path.resolve(import.meta.dirname, '..');
const dir = path.join(root, 'preview/mercenary-vespera-beauty-v1');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
const manifest = JSON.parse(fs.readFileSync(path.join(dir, 'generation.json'), 'utf8'));
const hash = bytes => crypto.createHash('sha256').update(bytes).digest('hex').toUpperCase();

test('Vespera is the preserved style anchor and both beauty drafts are original-size RGB PNGs', async () => {
  assert.equal(manifest.status, 'APPROVED_SOURCE_ART');
  assert.equal(manifest.catalogConnected, true);
  assert.ok(manifest.approval.userQuotes.includes('좋다'));
  assert.equal(manifest.runtimeConnected, false);
  assert.equal(manifest.originalsModified, false);
  assert.equal(hash(fs.readFileSync(path.resolve(dir, manifest.anchor.file))), manifest.anchor.sha256);
  assert.equal(manifest.entries.length, 2);
  for (const entry of manifest.entries) {
    assert.match(entry.file, /^assets\/[a-z-]+-v1\.png$/);
    const bytes = fs.readFileSync(path.join(dir, entry.file));
    assert.equal(hash(bytes), entry.sha256);
    const m = await sharp(bytes).metadata();
    assert.deepEqual([m.width, m.height, m.channels, m.format], [1024, 1536, 3, 'png']);
    assert.equal(bytes.length, entry.bytes);
    assert.equal(entry.cardCode, entry.key === 'beauty_female' ? 'V-022' : 'V-023');
    assert.equal(entry.rank, null);
    assert.equal(entry.battleSprite, null);
    assert.equal(entry.status, 'APPROVED_SOURCE_ART');
    assert.match(entry.prompt, /VESPERA PAINTING STYLE reference/);
  }
});

test('art review is isolated, silent and cannot register cards or overwrite the public codex', () => {
  const html = fs.readFileSync(path.join(dir, 'index.html'), 'utf8');
  const js = fs.readFileSync(path.join(dir, 'review.js'), 'utf8');
  assert.match(html, /원화 승인/);
  assert.match(html, /noindex,nofollow/);
  assert.match(html, /160px 카드 크기/);
  assert.match(html, /mercenary-contract-frame-slim-v3\.png/);
  assert.match(html, /<dialog id="zoom" aria-labelledby="zoomTitle"/);
  assert.match(js, /returnFocus\?\.focus/);
  assert.doesNotMatch(js, /fetch\(|apiRequest|localStorage|AudioContext|new Audio|\/api\//);
  assert.equal((html.match(/class="art-button"/g) || []).length, 3);
  for (const entry of manifest.entries) assert.ok(html.includes(`./${entry.file}`));
  const roster = read('assets/ui/project-v/mercenaries/mercenary-system-roster-v1.json');
  assert.doesNotMatch(roster, /female-beauty-v1|male-beauty-v1|vespera-beauty/);
  for (const file of ['index.html', 'js/app.js', 'mercenary-codex/index.html']) assert.doesNotMatch(read(file), /mercenary-vespera-beauty-v1/);
});

test('persistent art standards record beauty-first direction without replacing old anchors', () => {
  for (const file of ['AGENTS.md', 'docs/project-v-mercenary-card-art-standard.md']) {
    const text = read(file);
    assert.match(text, /베스페라/);
    assert.match(text, /미녀·미남/);
    assert.match(text, /629564D768A4BCEFCD0BE746E744DA49A64F1CF2BE7D048E7485FC6CB14FF874/);
    assert.match(text, /4B2F7D8F35E85E88B61AAAFFC3127817F61BFCA667075DEC64AEF4D1EC9B02CF/);
  }
});
