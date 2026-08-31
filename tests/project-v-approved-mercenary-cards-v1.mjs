import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = fileURLToPath(new URL('../', import.meta.url));
const rosterPath = path.join(root, 'assets/ui/project-v/mercenaries/mercenary-card-roster-approved-v1.json');
const previewPath = path.join(root, 'preview/mercenary-cards-approved-v1/index.html');
const roster = JSON.parse(readFileSync(rosterPath, 'utf8'));
const preview = readFileSync(previewPath, 'utf8');

const sha256 = buffer => createHash('sha256').update(buffer).digest('hex').toUpperCase();

const readPngSize = buffer => {
  assert.equal(buffer.subarray(1, 4).toString('ascii'), 'PNG');
  assert.equal(buffer.subarray(12, 16).toString('ascii'), 'IHDR');
  return { width: buffer.readUInt32BE(16), height: buffer.readUInt32BE(20) };
};

test('approved mercenary roster has the canonical V-013 through V-020 range', () => {
  assert.equal(roster.format, 'PROJECT_V_MERCENARY_CARD_ROSTER_V1');
  assert.equal(roster.status, 'APPROVED_SOURCE_ART_BATTLE_SPRITE_TECH_QA_COMPLETE');
  assert.equal(roster.cards.length, 8);
  assert.deepEqual(roster.cards.map(card => card.code), [
    'V-013', 'V-014', 'V-015', 'V-016', 'V-017', 'V-018', 'V-019', 'V-020'
  ]);
  assert.equal(new Set(roster.cards.map(card => card.code)).size, roster.cards.length);
  assert.equal(new Set(roster.cards.map(card => card.name)).size, roster.cards.length);
  assert.equal(new Set(roster.cards.map(card => card.sourceArt)).size, roster.cards.length);
});

test('every approved source art remains hash-locked and has a separate RGBA battle sprite', () => {
  for (const card of roster.cards) {
    const assetPath = path.join(root, card.sourceArt);
    assert.equal(existsSync(assetPath), true, `${card.code} source art is missing`);
    const buffer = readFileSync(assetPath);
    assert.equal(sha256(buffer), card.sourceArtSha256, `${card.code} source art hash changed`);
    assert.deepEqual(readPngSize(buffer), { width: 1024, height: 1536 }, `${card.code} source art size is invalid`);
    assert.equal(card.sourceArtStatus, 'APPROVED_SOURCE_ART');
    assert.notEqual(card.battleSprite, card.sourceArt);
    const spritePath = path.join(root, card.battleSprite);
    assert.equal(existsSync(spritePath), true, `${card.code} battle sprite is missing`);
    const sprite = readFileSync(spritePath);
    assert.equal(sha256(sprite), card.battleSpriteSha256, `${card.code} battle sprite hash changed`);
    const spriteSize = readPngSize(sprite);
    assert.ok(spriteSize.width >= 1024, `${card.code} battle sprite width is too small`);
    assert.ok(spriteSize.height >= 1024, `${card.code} battle sprite height is too small`);
    assert.equal(sprite[25], 6, `${card.code} battle sprite must be RGBA PNG`);
    assert.equal(card.battleSpriteStatus, 'TECH_QA_COMPLETE_USER_REVIEW_PENDING');
  }
});

test('card frame assets and consolidated preview cover the full roster', () => {
  assert.equal(existsSync(path.join(root, roster.cardComposition.frame)), true);
  assert.equal(existsSync(path.join(root, roster.cardComposition.editableFrameSource)), true);
  assert.equal(existsSync(path.join(root, 'css/mercenary-card-v1.css')), true);
  assert.equal(existsSync(path.join(root, 'preview/mercenary-cards-v1/mercenary-cards-preview.js')), true);

  for (const card of roster.cards) {
    assert.match(preview, new RegExp(`data-code="${card.code}"`));
    assert.ok(preview.includes(`data-name="${card.name}"`));
    assert.ok(preview.includes(`../../${card.sourceArt}`));
  }

  assert.equal((preview.match(/class="merc-card(?: selected)?"/g) || []).length, roster.cards.length);
  assert.equal(preview.includes('output/rejected/'), false);
});
