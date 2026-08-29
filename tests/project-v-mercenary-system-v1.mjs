import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {
  MERCENARY_FORMATION_RULES,
  buildMercenaryFormation,
  serializeMercenaryLoadout,
  validateMercenaryLoadout
} from '../js/project-v-mercenary-loadout-v1.js';

const root = path.resolve(import.meta.dirname, '..');
const rosterPath = path.join(root, 'assets/ui/project-v/mercenaries/mercenary-system-roster-v1.json');
const roster = JSON.parse(fs.readFileSync(rosterPath, 'utf8'));

function sha256(relativePath) {
  return crypto.createHash('sha256').update(fs.readFileSync(path.join(root, relativePath))).digest('hex').toUpperCase();
}

test('mercenary system keeps five regular cards and one separate mercenary slot', () => {
  assert.equal(MERCENARY_FORMATION_RULES.regularCardSlots, 5);
  assert.equal(MERCENARY_FORMATION_RULES.mercenarySlots, 1);
  assert.equal(MERCENARY_FORMATION_RULES.maxDeployedUnits, 6);
  assert.equal(MERCENARY_FORMATION_RULES.mercenarySlotIndex, 6);
  assert.equal(MERCENARY_FORMATION_RULES.separateFromRegularDeck, true);

  const cardIds = ['1', '2', '3', '4', '5'];
  const result = validateMercenaryLoadout({ cardIds, mercenaryCode: 'v-001' }, roster.cards.map((card) => card.code));
  assert.equal(result.ok, true);
  assert.deepEqual(result.cardIds, cardIds);
  assert.equal(result.mercenaryCode, 'V-001');
  assert.equal(result.deployedCount, 6);
  assert.equal(result.formation.length, 6);
  assert.deepEqual(result.formation.at(-1), { slotIndex: 6, slotType: 'MERCENARY', mercenaryCode: 'V-001' });

  const serialized = serializeMercenaryLoadout([...cardIds, 'SHOULD_NOT_ENTER_DECK'], 'V-001');
  assert.deepEqual(serialized.cardIds, cardIds);
  assert.equal(serialized.mercenaryCode, 'V-001');
});

test('mercenary slot remains optional and does not change the existing five-card formation', () => {
  const cardIds = ['1', '2', '3', '4', '5'];
  const formation = buildMercenaryFormation(cardIds, null);
  assert.equal(formation.length, 5);
  assert.ok(formation.every((slot) => slot.slotType === 'REGULAR_CARD'));
  assert.equal(validateMercenaryLoadout({ cardIds, mercenaryCode: null }).ok, true);
  assert.equal(validateMercenaryLoadout({ cardIds: cardIds.slice(0, 4), mercenaryCode: 'V-001' }).ok, false);
});

test('review roster has twenty unique cards and no inherited rank', () => {
  assert.equal(roster.status, 'PREVIEW_ONLY_NOT_RUNTIME_CONNECTED');
  assert.equal(roster.cards.length, 20);
  assert.equal(new Set(roster.cards.map((card) => card.code)).size, 20);
  assert.deepEqual(roster.cards.map((card) => card.code), Array.from({ length: 20 }, (_, index) => `V-${String(index + 1).padStart(3, '0')}`));
  assert.ok(roster.cards.every((card) => card.rank === null));
  assert.ok(roster.cards.every((card) => card.rankStatus === 'PENDING_USER_ASSIGNMENT'));
  assert.equal(roster.rankPolicy.inheritLegacyRanks, false);
  assert.equal(roster.formationRule.regularCardSlots, 5);
  assert.equal(roster.formationRule.mercenarySlots, 1);
  assert.equal(roster.formationRule.maxDeployedUnits, 6);
});

test('all source art and all declared battle sprites exist with recorded hashes', () => {
  const sprites = roster.cards.filter((card) => card.battleSprite);
  const pending = roster.cards.filter((card) => !card.battleSprite);
  assert.equal(sprites.length, 12);
  assert.equal(pending.length, 8);

  for (const card of roster.cards) {
    assert.equal(fs.existsSync(path.join(root, card.sourceArt)), true, `${card.code} source art missing`);
    assert.equal(sha256(card.sourceArt), card.sourceArtSha256, `${card.code} source art hash mismatch`);
    if (card.battleSprite) {
      assert.equal(fs.existsSync(path.join(root, card.battleSprite)), true, `${card.code} battle sprite missing`);
      assert.equal(sha256(card.battleSprite), card.battleSpriteSha256, `${card.code} battle sprite hash mismatch`);
    } else {
      assert.equal(card.battleSpriteStatus, 'NOT_YET_PRODUCED');
    }
  }
});

test('official supporting anchors are preserved in main with canonical hashes', () => {
  assert.equal(
    sha256('assets/ui/project-v/art-references/male-style-anchor-silver-paladin-v1.png'),
    'D85161ECEDE0E85AFEA04EC8FC82D8F1101337945361BB15E11849528FC47FD0'
  );
  assert.equal(
    sha256('assets/ui/project-v/art-references/female-style-anchor-crimson-sniper-v1.png'),
    '4D943EBAA5833E415B8AD8017C41157D7DB8D5033A2D9EF77EF0E62C58691FA6'
  );
});

test('preview states the 5+1 rule and never exposes legacy ranks', () => {
  const html = fs.readFileSync(path.join(root, 'preview/project-v-mercenary-system-v1/index.html'), 'utf8');
  const client = fs.readFileSync(path.join(root, 'preview/project-v-mercenary-system-v1/mercenary-system.js'), 'utf8');
  const standard = fs.readFileSync(path.join(root, 'docs/project-v-mercenary-system-standard.md'), 'utf8');
  assert.match(html, /다섯 장의 덱/);
  assert.match(html, /한 장의 독립 용병/);
  assert.match(html, /5 \+ 1 편성 구조/);
  assert.match(client, /등급 미정/);
  assert.doesNotMatch(html, /data-rank=/);
  assert.match(standard, /`cardIds` 5장과 `mercenaryCode` 1개/);
  assert.match(standard, /PREVIEW_ONLY_NOT_RUNTIME_CONNECTED/);
});
