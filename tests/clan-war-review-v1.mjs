import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

const [html,css,client,server,liveClient]=await Promise.all([
  readFile(new URL('../preview/clan-war-review-v1/index.html',import.meta.url),'utf8'),
  readFile(new URL('../preview/clan-war-review-v1/clan-war-review.css',import.meta.url),'utf8'),
  readFile(new URL('../preview/clan-war-review-v1/clan-war-review.js',import.meta.url),'utf8'),
  readFile(new URL('../functions/_clan.js',import.meta.url),'utf8'),
  readFile(new URL('../js/clan-v1.js',import.meta.url),'utf8')
]);

test('클랜 검수실은 라이브 컴포넌트와 5단계 시즌 흐름을 노출한다',()=>{
  assert.match(html,/css\/clan-v1\.css\?v=1883-clan-war-safety/);
  assert.match(html,/js\/clan-v1\.js\?v=1883-clan-war-safety/);
  for(const scene of ['registration','draft','war','battle','settlement'])assert.match(html,new RegExp(`data-review-scene="${scene}"`));
  assert.match(client,/global\.ClanV1\.bind\(ctx\)/);
  assert.match(client,/mountScene\('war'\)/);
});

test('프리뷰는 운영 API 쓰기를 차단하고 샘플 overview만 반환한다',()=>{
  assert.match(client,/startsWith\('clan\/overview'\)/);
  assert.match(client,/운영 API 쓰기가 차단됩니다/);
  assert.match(client,/mount\.addEventListener\('submit'/);
  assert.doesNotMatch(client,/fetch\s*\(/);
  assert.doesNotMatch(client,/XMLHttpRequest|WebSocket/);
});

test('현재 서버의 3회 제한과 요청된 60분 행동력 설계를 분리해 표시한다',()=>{
  assert.match(server,/CLAN_ATTACKS_PER_WAR=3/);
  assert.match(server,/CLAN_DEFENSES_PER_TARGET=3/);
  assert.match(server,/CLAN_REPEAT_TARGET_LIMIT=1/);
  assert.match(server,/score=score\+\?/);
  assert.match(html,/보유 상한 10, 3분마다 1회 회복/);
  assert.match(html,/클랜전당 3회 제한을 5\/10 행동력과 180초 회복 방식으로 교체/);
  assert.match(client,/attackLimit:10,attacksRemaining:5,energy:5,energyCap:10,recoverySeconds:180,totalUseLimit:10/);
  assert.match(client,/energyRecoverySeconds:180,warDurationMinutes:60/);
  assert.match(client,/playbackSpeed:1\.3/);
});

test('전투력 스냅샷과 자동 매칭 규칙을 검수 화면에 노출한다',()=>{
  assert.match(html,/유사 전투력 자동 매칭/);
  assert.match(html,/±10% 상대를 우선 자동 배정/);
  assert.match(client,/powerMatchTolerancePct:10/);
  assert.match(client,/powerMatchFallback:'NEAREST_LOWEST_DEFENSE'/);
  assert.match(client,/powerSnapshot:'RANKED_DECK_5'/);
  assert.match(client,/MY_COMBAT_POWER=1265400/);
  assert.match(client,/PROJECT V V3 · POWER MATCH QUEUE/);
  assert.match(client,/최저 방어 배정 우선/);
});

test('출시 전 구현 공백을 숨기지 않고 검수 항목으로 표시한다',()=>{
  assert.match(server,/VALUES\(\?,1,\?,\?,'ACTIVE'/);
  assert.doesNotMatch(server,/round_no\s*\+\s*1/);
  assert.match(html,/60분 개방·행동력 회복 미구현/);
  assert.match(html,/전투력 자동 매칭 미구현/);
  assert.match(html,/후속 라운드 미구현/);
  assert.match(html,/DISABLED_TEST/);
});

test('클랜 대상 선택은 실제 PROJECT V V3 프리뷰와 결과 연출로 연결된다',()=>{
  assert.match(html,/preview\/project-v-v3\/index\.html/);
  assert.match(client,/runtime\.setBattlefield\('PVP'\)/);
  assert.match(client,/button\.dataset\.battlefield==='PVP'/);
  assert.match(client,/querySelector\('#pvBattleStart'\)/);
  assert.match(client,/if\(framePrimePromise\)return framePrimePromise/);
  assert.match(client,/ProjectVPixiBattle\?\.diagnostics\?\.\(\)\.mounted/);
  assert.match(client,/PVP · CLAN WAR \/ ROUND 1/);
  assert.match(client,/counterValue\.textContent='4 \/ 10'/);
  assert.match(client,/CLAN_PVP_TIMELINE/);
  assert.match(client,/runtime\.resetSession\(clanBattlePayload\(\),host\)/);
  assert.match(client,/양쪽 랭크전 덱 5장/);
  assert.equal((client.match(/battleCard\('A'/g)||[]).length,5);
  assert.equal((client.match(/battleCard\('B'/g)||[]).length,5);
  assert.match(client,/event\.target\.closest\('\[data-clan-fight\]'/);
  assert.match(html,/PROJECT V V3 · POWER-MATCHED BATTLE/);
  assert.match(liveClient,/playPvpBattleV2Live/);
});

test('데스크톱과 모바일 검수 레이아웃을 모두 제공한다',()=>{
  assert.match(css,/@media\(max-width:980px\)/);
  assert.match(css,/@media\(max-width:700px\)/);
  assert.match(css,/\.battle-review\.is-open/);
  assert.match(html,/viewport-fit=cover/);
});
