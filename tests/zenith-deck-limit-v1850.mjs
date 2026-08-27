import assert from 'node:assert/strict';
import fs from 'node:fs';

const read=path=>fs.readFileSync(new URL(path,import.meta.url),'utf8');
const server=read('../functions/api/[[path]].js');
const client=read('../js/app.js');
const legacyClient=read('../app.js');
const evolution=read('../js/evolution.js');
const evolutionCms=read('../admin/evolution-admin.js');
const index=read('../index.html');
const adminIndex=read('../admin/index.html');

const limitMatch=server.match(/const ZENITH_DECK_LIMIT=(\d+);/);
assert.ok(limitMatch,'서버에 ZENITH 덱 제한 상수가 있어야 합니다.');
const limit=Number(limitMatch[1]);
assert.equal(limit,2,'ZENITH 덱 편성 제한은 2장이어야 합니다.');
assert.equal(2>limit,false,'ZENITH 2장은 허용되어야 합니다.');
assert.equal(3>limit,true,'ZENITH 3장부터는 거부되어야 합니다.');

assert.match(server,/zenithCount>ZENITH_DECK_LIMIT/,'공용 덱 저장 검증이 ZENITH 제한을 적용해야 합니다.');
assert.match(server,/aZenithCount>ZENITH_DECK_LIMIT/,'랭크전 공격 덱 검증이 ZENITH 제한을 적용해야 합니다.');
assert.match(server,/dZenithCount>ZENITH_DECK_LIMIT/,'랭크전 방어 덱 검증이 ZENITH 제한을 적용해야 합니다.');
assert.doesNotMatch(server,/ZENITH 카드를 1장만 편성|ZENITH 1장 편성 제한/,'서버 오류 문구에 구형 1장 제한이 남으면 안 됩니다.');

for(const [label,source] of [['live client',client],['legacy client',legacyClient]]){
  assert.match(source,/const ZENITH_DECK_LIMIT = 2;/,`${label} 제한값은 2여야 합니다.`);
  if(label==='live client'){
    assert.match(source,/DEFAULT_DECK_GRADE_LIMITS = Object\.freeze\(\{ PRESTIGE: 2, FUR: 2, ZENITH: ZENITH_DECK_LIMIT \}\)/,`${label} 기본 서버 계약은 ZENITH 최대 2장을 포함해야 합니다.`);
    assert.match(source,/deckGradeLimitViolation\(battleState\.deck/,`${label} PVE 선택기는 서버 등급 제한을 적용해야 합니다.`);
    assert.match(source,/deckGradeLimitViolation\(pvpState\.deck/,`${label} PVP 선택기는 서버 등급 제한을 적용해야 합니다.`);
  }else{
    assert.match(source,/deckGradeCount\(battleState\.deck,'ZENITH'\)>=ZENITH_DECK_LIMIT/,`${label} PVE 선택기는 3장째를 차단해야 합니다.`);
    assert.match(source,/deckGradeCount\(pvpState\.deck,'ZENITH'\)>=ZENITH_DECK_LIMIT/,`${label} PVP 선택기는 3장째를 차단해야 합니다.`);
  }
  assert.doesNotMatch(source,/ZENITH 1장 제한|제니스 카드는 덱에 1장만|ZENITH 카드는 덱당 1장만/,`${label}에 구형 1장 안내가 남으면 안 됩니다.`);
}

assert.doesNotMatch(evolution,/ZENITH(?:는| 덱 편성은)[^\n]{0,80}(?:1장만|1장 제한)/,'진화 화면에 구형 1장 제한 안내가 남으면 안 됩니다.');
assert.match(evolution,/ZENITH 덱 편성은 최대 2장입니다/,'진화 확인창은 2장 제한을 안내해야 합니다.');
assert.match(evolutionCms,/ZENITH 덱 편성은 서버에서 최대 2장으로 제한됩니다/,'진화 CMS도 2장 제한을 안내해야 합니다.');
assert.match(index,/js\/app\.js\?v=(?:1850-zenith-deck-limit-2|1880-navigation-deck-rules|1881-workshop-split-lineage|1882-menu-pve-scrapyard)/,'라이브 앱 캐시 버전을 갱신해야 합니다.');
assert.match(index,/js\/evolution\.js\?v=1850-zenith-deck-limit-2/,'진화 화면 캐시 버전을 갱신해야 합니다.');
assert.match(adminIndex,/evolution-admin\.js\?v=1850-zenith-deck-limit-2/,'진화 CMS 캐시 버전을 갱신해야 합니다.');

console.log('ZENITH deck limit V1850: 2 allowed, 3 rejected, all user/CMS wording aligned');
