import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { inspectMercenarySprite } from '../scripts/inspect-mercenary-sd-v2061.mjs';
import { createMercenaryBattleArtAdapter, validateMercenaryBattleRoster } from '../js/project-v-mercenary-battle-art-adapter-v1.js';

const root = path.resolve(import.meta.dirname, '..');
const read = name => JSON.parse(fs.readFileSync(path.join(root, name), 'utf8'));
const roster = read('assets/ui/project-v/mercenaries/mercenary-system-roster-v1.json');
const record = read('assets/ui/project-v/characters/mercenary/sd-generation-20260907.json');

test('all sixteen native SD outputs have genuine alpha, full-body bounds and traceable source art', async () => {
  assert.equal(record.status, 'TECH_QA_COMPLETE_USER_REVIEW_PENDING');
  assert.equal(record.toolMode, 'BUILT_IN_IMAGE_GEN');
  assert.equal(record.sourceArtUnmodified, true);
  assert.equal(record.existingSpritesUnmodified, true);
  assert.equal(record.entries.length, 16);
  assert.deepEqual(record.entries.map(entry => entry.code), roster.cards.slice(21, 37).map(card => card.code));
  for (const entry of record.entries) {
    const card = roster.cards.find(card => card.code === entry.code);
    const qa = await inspectMercenarySprite(path.join(root, card.battleSprite));
    assert.equal(entry.status, 'TECH_QA_COMPLETE_USER_REVIEW_PENDING');
    assert.equal(entry.battleSprite, card.battleSprite);
    assert.equal(entry.sourceArt, card.sourceArt);
    assert.equal(entry.sourceArtSha256, card.sourceArtSha256);
    assert.equal(entry.nativeOutputSha256, card.battleSpriteSha256);
    assert.equal(qa.sha256, card.battleSpriteSha256);
    assert.deepEqual([qa.width, qa.height, qa.channels, qa.hasAlpha], [1024, 1536, 4, true]);
    assert.ok(qa.transparentFraction > 0.35 && qa.transparentFraction < 0.85, `${card.code}: actual empty background`);
    assert.ok(qa.solidFraction > 0.15, `${card.code}: character remains solid`);
    assert.ok(qa.cornerAlpha.every(alpha => alpha <= 1), `${card.code}: clear corners`);
    const b = qa.visibleBounds;
    assert.ok(b.left > 0 && b.top > 0 && b.right < qa.width - 1 && b.bottom < qa.height - 1, `${card.code}: full character is not clipped`);
    assert.deepEqual(card.battleSpriteFootAnchor, qa.footAnchor);
    assert.deepEqual(entry.qa, qa);
    assert.ok(entry.prompt && entry.nativeOutput && entry.referenced_image_paths.length === 2);
    assert.equal(card.rank, null);
    assert.notEqual(card.sourceArt, card.battleSprite);
  }
});

test('battle adapter preserves measured feet, legacy defaults and rejects invalid anchors', () => {
  const adapter = createMercenaryBattleArtAdapter(roster);
  assert.deepEqual(adapter.resolveForConsumer('BATTLE_FIELD', 'V-013').footAnchor, { x: 0.5, y: 1 });
  for (const card of roster.cards.slice(21, 37)) {
    const resolved = adapter.resolveForConsumer('BATTLE_FIELD', card.code);
    assert.deepEqual(resolved.footAnchor, card.battleSpriteFootAnchor);
    assert.ok(Object.isFrozen(resolved.footAnchor));
    for (const consumer of ['CATALOG', 'SHOP', 'DECK', 'DETAIL', 'SKILL_CUTIN', 'CARD_DOCK']) {
      assert.equal(adapter.resolveForConsumer(consumer, card.code), null);
    }
  }
  for (const anchor of [{ x: -1, y: 1 }, { x: 0.5, y: 1.1 }, { x: 0.5, y: 0 }, { x: '0.5', y: 1 }, { x: NaN, y: 1 }]) {
    const invalid = structuredClone(roster);
    invalid.cards[21].battleSpriteFootAnchor = anchor;
    assert.throws(() => validateMercenaryBattleRoster(invalid), /발끝 기준점/);
  }
});
