import test from 'node:test';
import {beforeOmegaRankAssignment} from './helpers/mercenary-sd-history.mjs';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createHash } from 'node:crypto';
import { ROSTER_URL, filterCards, sdStatus } from '../preview/mercenary-codex-v1/model.js';
import { createMercenaryBattleArtAdapter } from '../js/project-v-mercenary-battle-art-adapter-v1.js';

const root = new URL('../', import.meta.url);
const read = path => fs.readFileSync(new URL(path, root));
const json = path => JSON.parse(read(path));
const hash = value => createHash('sha256').update(value).digest('hex').toUpperCase();
const roster = json('assets/ui/project-v/mercenaries/mercenary-system-roster-v1.json');
const approval = json('assets/ui/project-v/mercenaries/mercenary-four-looks-approval-20260907.json');
const media = json('assets/ui/project-v/mercenaries/codex-v1/manifest.json');
const codes = ['V-038', 'V-039', 'V-040', 'V-041'];

test('explicit approval adds exactly four originals without changing the previous 37 records', () => {
  assert.equal(approval.userRequest, '연결해');
  assert.equal(approval.scope, 'READ_ONLY_CATALOG_ONLY');
  assert.equal(approval.existingCardsPreserved, 37);
  assert.equal(approval.newCards, 4);
  assert.equal(approval.totalCards, 41);
  assert.equal(approval.runtimeConnected, false);
  assert.equal(approval.originalsModified, false);
  assert.equal(hash(JSON.stringify(beforeOmegaRankAssignment(roster.cards.slice(0, 37)))), approval.previousRosterCardsSha256);
  assert.deepEqual(roster.cards.slice(37, 41).map(card => card.code), codes);
  assert.equal(new Set(roster.cards.map(card => card.name)).size, 43);
  for (const entry of approval.entries) {
    const card = roster.cards.find(card => card.code === entry.code);
    assert.equal(card.sourceArt, entry.sourceArt);
    assert.equal(card.sourceArtSha256, entry.sha256);
    assert.equal(hash(read(entry.reviewSource)), entry.sha256);
    assert.equal(hash(read(entry.sourceArt)), entry.sha256);
    assert.equal(card.sourceArtStatus, 'APPROVED_SOURCE_ART');
    assert.equal(card.nameStatus, 'PROVISIONAL_CONCEPT_NAME');
    assert.equal(card.catalogRelease, 'READ_ONLY_USER_APPROVED');
  }
});

test('outfit and weapon concepts remain searchable after the four SDs are connected', () => {
  const outfits = ['오피스룩', '가터벨트 치마', '비키니룩', '핫팬츠룩'];
  const weapons = ['건틀릿', '체인소드', '활', '대검'];
  const adapter = createMercenaryBattleArtAdapter(roster);
  assert.deepEqual(roster.summary, { total: 43, sourceArtReady: 43, battleSpriteReady: 43, battleSpritePending: 0, rankPending: 42 });
  for (const [i, code] of codes.entries()) {
    const card = roster.cards.find(card => card.code === code);
    assert.equal(card.outfit, outfits[i]);
    assert.equal(card.weapon, weapons[i]);
    assert.deepEqual(filterCards(roster.cards, { q: outfits[i] }).map(card => card.code), [code]);
    assert.ok(filterCards(roster.cards, { q: weapons[i] }).some(card => card.code === code));
    assert.equal(card.rank, null);
    assert.equal(card.rankStatus, 'PENDING_USER_ASSIGNMENT');
    assert.equal(card.roleStatus, 'ART_CONCEPT_ONLY');
    assert.notEqual(card.battleSprite, card.sourceArt);
    assert.equal(hash(read(card.battleSprite)), card.battleSpriteSha256);
    assert.equal(card.battleSpriteStatus, 'TECH_QA_COMPLETE_USER_REVIEW_PENDING');
    assert.equal(sdStatus(card), '기술검수 완료 · 시각검수 대기');
    assert.equal(adapter.resolveForConsumer('BATTLE_FIELD', code).battleSprite, card.battleSprite);
    assert.equal(adapter.resolveForConsumer('CARD_DOCK', code), null);
    assert.equal(media.entries.filter(entry => entry.code === code && entry.kind === 'art').length, 2);
    assert.equal(media.entries.some(entry => entry.code === code && entry.kind === 'sd'), true);
  }
  assert.equal(filterCards(roster.cards, { sort: 'newest' })[0].code, 'V-043');
});

test('catalog release refreshes data and module caches and describes the current 43/43/0 resource state', () => {
  assert.equal(ROSTER_URL.searchParams.get('v'), '20260911-omega-ranks');
  const html = read('mercenary-codex/index.html').toString();
  assert.match(html, /codex\.js\?v=20260911-omega-ranks/);
  assert.match(html, /전체 원화 43종, 전투 SD 43종/);
  assert.doesNotMatch(html, /신규 6종의 SD는 제작 대기/);
  assert.match(read('preview/mercenary-codex-v1/codex.js').toString(), /의상 콘셉트/);
  const generation = json('preview/mercenary-four-looks-v1/generation.json');
  assert.equal(generation.status, 'APPROVED_SOURCE_ART');
  assert.equal(generation.catalogConnected, true);
  assert.equal(generation.runtimeConnected, false);
  assert.deepEqual(generation.approval.codes, codes);
});
