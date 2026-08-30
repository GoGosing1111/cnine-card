import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';

import { buildFighter } from '../functions/_battle_v2_preview.js';

const root = path.resolve(import.meta.dirname, '..');
const read = relative => readFileSync(path.join(root, relative), 'utf8');

const api = read('functions/api/[[path]].js');
const clan = read('functions/_clan.js');
const territory = read('functions/_territory_war.js');
const escort = read('functions/_escort_operation.js');
const siege = read('functions/_siege.js');
const magic = read('functions/_magic.js');
const preview = read('functions/_battle_v2_preview.js');

function assertDbStateForwarded(source, label) {
  assert.match(source, /uniqueAdvancement\s*:\s*uniqueCard\?\.uniqueAdvancement\s*\|\|\s*null/, `${label}: DB 전직 상태를 엔진 카드에 전달해야 합니다.`);
  assert.doesNotMatch(source, /uniqueAdvancement\s*:\s*[^,}\n]*card\.uniqueAdvancement/, `${label}: 원본/클라이언트 카드의 전직 상태를 fallback으로 신뢰하면 안 됩니다.`);
}

test('라이브 PVE와 랭크 PVP가 DB 전직 상태를 최종 엔진 카드에 보존한다', () => {
  assert.match(api, /const engineCards=cards\.map\(card=>\{const uniqueCard=uniqueCardsById\.get\(String\(card\.id\)\)/);
  assert.match(api, /aUniqueById=new Map\(\(aUnique\.cards\|\|\[\]\)\.map\(card=>\[String\(card\.id\),card\]\)\)/);
  assert.match(api, /dUniqueById=new Map\(\(dUnique\.cards\|\|\[\]\)\.map\(card=>\[String\(card\.id\),card\]\)\)/);
  assert.equal((api.match(/uniqueAdvancement:uniqueCard\?\.uniqueAdvancement\|\|null/g) || []).length >= 3, true);
  assertDbStateForwarded(api, 'api PVE/PVP');
});

test('클랜전과 영토전이 양 팀 DB 전직 상태를 보존한다', () => {
  for (const [source, label] of [[clan, '클랜전'], [territory, '영토전']]) {
    assert.match(source, /new Map\(\([^\n]*?\.cards\|\|\[\]\)\.map\([^\n]*?=>\[String\([^\n]*?\.id\),[^\n]*?\]\)\)/, `${label}: unique state 전체 카드를 인덱싱해야 합니다.`);
    assert.equal((source.match(/uniqueAdvancement:uniqueCard\?\.uniqueAdvancement\|\|null/g) || []).length, 2, `${label}: 공격/방어 양 팀 모두 전직 상태를 전달해야 합니다.`);
    assertDbStateForwarded(source, label);
  }
});

test('호송과 몬스터공성이 DB 전직 상태를 PVE 엔진 카드에 보존한다', () => {
  assert.match(escort, /escortUniqueById=new Map\(\(unique\?\.cards\|\|\[\]\)\.map\(card=>\[String\(card\.id\),card\]\)\)/);
  assert.match(siege, /\(uniqueBattle\?\.cards \|\| \[\]\)\.map\(card => \[String\(card\.id\), card\]\)/);
  assertDbStateForwarded(escort, '호송');
  assertDbStateForwarded(siege, '몬스터공성');
});

test('OWNER V2 프리뷰도 라이브와 같은 DB 전직 상태를 buildFighter 입력에 전달한다', () => {
  assert.match(preview, /ownUniqueMap = new Map\(\(uniqueStates\[0\]\?\.cards \|\| \[\]\)\.map\(card => \[String\(card\.id\), card\]\)\)/);
  assert.match(preview, /enemyUniqueMap = new Map\(\(uniqueStates\[1\]\?\.cards \|\| \[\]\)\.map\(card => \[String\(card\.id\), card\]\)\)/);
  assert.equal((preview.match(/uniqueAdvancement: uniqueCard\?\.uniqueAdvancement \|\| null/g) || []).length >= 2, true);
});

test('전달된 DB 상태는 실제 buildFighter 전직 계약으로 소비된다', () => {
  const uniqueAbility = { dominantType: 'ATTACK', attackPercent: 20, defensePercent: 0, speedPercent: 0, hpPercent: 0 };
  const dbState = {
    active: true,
    classCode: 'SHATTER',
    dominantType: 'ATTACK',
    configVersion: 1,
    modifiers: { maxHpPercent: -8, penetrationPoints: 20 },
  };
  const baseCard = { id: 'runtime-card', power: 100_000, grade: 'ZENITH', breakthroughLevel: 13 };
  const base = buildFighter(baseCard, 0, 'A', uniqueAbility, 'PVP');
  const advanced = buildFighter({ ...baseCard, uniqueAdvancement: dbState }, 0, 'A', uniqueAbility, 'PVP');

  assert.equal(advanced.uniqueAdvancement?.classCode, 'SHATTER');
  assert.equal(advanced.maxHp, Math.round(base.maxHp * 0.92));
  assert.equal(advanced.uniqueAdvancement?.modifiers?.penetrationPoints, 20);
});

test('기존 고유효과 공개 설정과 무관하게 완료 전직은 독립 전달·타입 판정된다', () => {
  assert.match(magic, /const hasAdvancement=advancementMap instanceof Map&&advancementMap\.size>0/);
  assert.match(magic, /\(!visible&&!hasAdvancement\)/);
  assert.match(magic, /return \{\.\.\.card,uniqueAdvancement\}/);
  assert.match(preview, /UNIQUE_ADVANCEMENT_CLASS_BY_TYPE\[advancementType\] === advancementClass/);
  assert.match(preview, /const key = normalizeType\(card, card\?\.uniqueAbility \|\| null\)/);
});
