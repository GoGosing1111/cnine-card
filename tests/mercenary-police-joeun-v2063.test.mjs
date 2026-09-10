import test from 'node:test';
import { beforeSdCompletion } from './helpers/mercenary-sd-history.mjs';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createHash } from 'node:crypto';
import sharp from 'sharp';
import { ROSTER_URL, filterCards, sdStatus } from '../preview/mercenary-codex-v1/model.js';
import { createMercenaryBattleArtAdapter } from '../js/project-v-mercenary-battle-art-adapter-v1.js';

const root = new URL('../', import.meta.url);
const read = file => fs.readFileSync(new URL(file, root));
const json = file => JSON.parse(read(file));
const hash = bytes => createHash('sha256').update(bytes).digest('hex').toUpperCase();
const roster = json('assets/ui/project-v/mercenaries/mercenary-system-roster-v1.json');
const approval = json('assets/ui/project-v/mercenaries/mercenary-police-joeun-approval-20260907.json');
const card = roster.cards.find(entry => entry.code === 'V-042');
const sourceHash = '838CC6DE03E2C9EBBC35267C838F040ADEB04D7B288D192A936B27D3E5366823';

test('Police Joeun is the user-assigned name and the previous 41 mercenaries are unchanged', () => {
  assert.equal(approval.userRequest, '경찰 조은으로 이름 변경하고 라이브서버 연결해');
  assert.equal(approval.scope, 'READ_ONLY_CATALOG_ONLY');
  assert.equal(approval.newCards, 1);
  assert.equal(approval.existingCardsPreserved, 41);
  assert.equal(hash(JSON.stringify(beforeSdCompletion(roster.cards.slice(0, 41)))), approval.previousRosterCardsSha256);
  assert.deepEqual(roster.cards.slice(41, 42).map(entry => entry.code), ['V-042']);
  assert.equal(card.name, '경찰 조은');
  assert.equal(card.nameStatus, 'USER_ASSIGNED_NAME');
  assert.equal(card.catalogRelease, 'READ_ONLY_USER_APPROVED');
  assert.equal(card.sourceArtStatus, 'APPROVED_SOURCE_ART');
  assert.equal(roster.cards.some(entry => entry.name === '킬러 조은'), false);
  for (const q of ['경찰 조은', '경찰조은', '조은', 'ㄱㅊㅈㅇ', 'V042', '하늘색 경찰 제복']) {
    assert.deepEqual(filterCards(roster.cards, { q }).map(entry => entry.code), ['V-042'], q);
  }
  assert.equal(filterCards(roster.cards, { q: '경찰 조은', sort: 'newest' })[0].code, card.code);
});

test('renaming preserves the approved face and full 1024x1536 RGB original byte-for-byte', async () => {
  const entry = approval.entries[0];
  assert.equal(approval.originalsModified, false);
  assert.equal(entry.previousDraftName, '킬러 조은');
  assert.equal(entry.sourceArt, card.sourceArt);
  assert.equal(card.sourceArtSha256, sourceHash);
  assert.equal(hash(read(entry.reviewSource)), sourceHash);
  assert.equal(hash(read(card.sourceArt)), sourceHash);
  const meta = await sharp(read(card.sourceArt)).metadata();
  assert.deepEqual([meta.width, meta.height, meta.channels, meta.hasAlpha, meta.space], [1024, 1536, 3, false, 'srgb']);
  const media = json('assets/ui/project-v/mercenaries/codex-v1/manifest.json');
  const images = media.entries.filter(entry => entry.code === card.code && entry.kind === 'art');
  assert.deepEqual(images.map(entry => [entry.kind, entry.width]), [['art', 320], ['art', 640]]);
  assert.ok(images.every(entry => entry.sourceSha256 === sourceHash));
});

test('publication refreshes shared catalog caches with the separate produced SD and no assigned rank', () => {
  assert.equal(ROSTER_URL.searchParams.get('v'), '20260911-omega-ranks');
  assert.deepEqual(roster.summary, { total: 43, sourceArtReady: 43, battleSpriteReady: 43, battleSpritePending: 0, rankPending: 42 });
  assert.equal(approval.runtimeConnected, false);
  assert.equal(approval.rankAssigned, false);
  assert.equal(card.rank, null);
  assert.equal(card.rankStatus, 'PENDING_USER_ASSIGNMENT');
  assert.equal(card.roleStatus, 'ART_CONCEPT_ONLY');
  assert.notEqual(card.battleSprite, card.sourceArt);
  assert.equal(card.battleSpriteStatus, 'TECH_QA_COMPLETE_USER_REVIEW_PENDING');
  assert.equal(sdStatus(card), '기술검수 완료 · 시각검수 대기');
  assert.equal(createMercenaryBattleArtAdapter(roster).resolveForConsumer('BATTLE_FIELD', card.code).battleSprite, card.battleSprite);
  const html = read('mercenary-codex/index.html').toString();
  assert.match(html, /경찰 조은\(V-042\)/);
  assert.match(html, /codex\.js\?v=20260911-omega-ranks/);
  assert.doesNotMatch(html, /킬러 조은/);
  assert.match(read('preview/mercenary-codex-v1/codex.js').toString(), /USER_ASSIGNED_NAME.*이름은 사용자 지정으로 확정/);
});
