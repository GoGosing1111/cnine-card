import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {__clanTest} from '../functions/_clan.js';

const [html,baseAdmin,cms,css,server,router,packageRaw]=await Promise.all([
  readFile(new URL('../admin/index.html',import.meta.url),'utf8'),
  readFile(new URL('../admin/admin-v1276.js',import.meta.url),'utf8'),
  readFile(new URL('../admin/clan-war-admin-v1943.js',import.meta.url),'utf8'),
  readFile(new URL('../admin/clan-war-admin-v1943.css',import.meta.url),'utf8'),
  readFile(new URL('../functions/_clan.js',import.meta.url),'utf8'),
  readFile(new URL('../functions/api/[[path]].js',import.meta.url),'utf8'),
  readFile(new URL('../package.json',import.meta.url),'utf8')
]);
const packageJson=JSON.parse(packageRaw);

test('CMS 사이드바와 독립 클랜전 운영 화면을 로드한다',()=>{
  assert.match(html,/data-view="clanwar"/);
  assert.match(html,/id="view-clanwar"/);
  assert.match(html,/id="clanWarAdminRoot"/);
  assert.match(html,/clan-war-admin-v1943\.css\?v=1943-clan-war-cms/);
  assert.match(html,/clan-war-admin-v1943\.js\?v=1944-clan-war-freeze-fix/);
  assert.match(baseAdmin,/clanwar:'클랜전 관리'/);
  assert.match(cms,/SOOPKETMON · CLAN WAR CMS/);
  assert.match(cms,/observe\(viewNode,\{attributes:true,attributeFilter:\['hidden'\]\}\)/);
  assert.doesNotMatch(cms,/childList:true/);
});

test('60분·행동력·전투력 매칭 목표값을 한 설정 계약으로 고정한다',()=>{
  const defaults=__clanTest.CLAN_ADMIN_SETTINGS_DEFAULTS;
  assert.equal(defaults.warOpenTime,'21:00');
  assert.equal(defaults.warDurationMinutes,60);
  assert.equal(defaults.initialEnergy,5);
  assert.equal(defaults.energyCap,10);
  assert.equal(defaults.energyRecoverySeconds,180);
  assert.equal(defaults.totalUseLimit,10);
  assert.equal(defaults.powerMatchTolerancePct,10);
  assert.equal(defaults.powerMatchFallback,'NEAREST_LOWEST_DEFENSE');
  assert.equal(defaults.powerSnapshot,'RANKED_DECK_5');
  assert.equal(defaults.playbackSpeed,1.3);
  assert.deepEqual(defaults.openDays,[0,1,2,3,4,5,6]);
  for(const id of ['cwWarOpenTime','cwWarDurationMinutes','cwInitialEnergy','cwEnergyCap','cwEnergyRecoverySeconds','cwTotalUseLimit','cwPowerMatchTolerancePct','cwPowerMatchFallback'])assert.match(cms,new RegExp(`'${id}'`));
});

test('CMS 저장값은 범위를 정리하고 공식 고정값과 보상 잠금을 해제하지 않는다',()=>{
  const clean=__clanTest.cleanClanAdminSettings({
    mode:'on',scheduleEnabled:'false',warOpenTime:'7:05',openDays:[6,2,6,-1,9],initialEnergy:19,energyCap:7,totalUseLimit:3,
    powerMatchFallback:'invalid',maxClans:99,maxMembers:999,maxParticipants:9999,powerSnapshot:'CLIENT_OVERRIDE',blindDraft:false,rewardsEnabled:true
  });
  assert.equal(clean.mode,'ON');
  assert.equal(clean.scheduleEnabled,false);
  assert.equal(clean.warOpenTime,'07:05');
  assert.deepEqual(clean.openDays,[2,6]);
  assert.equal(clean.initialEnergy,7);
  assert.equal(clean.energyCap,7);
  assert.equal(clean.totalUseLimit,7);
  assert.equal(clean.powerMatchFallback,'NEAREST_LOWEST_DEFENSE');
  assert.equal(clean.maxClans,8);
  assert.equal(clean.maxMembers,20);
  assert.equal(clean.maxParticipants,160);
  assert.equal(clean.powerSnapshot,'RANKED_DECK_5');
  assert.equal(clean.blindDraft,true);
  assert.equal(clean.rewardsEnabled,false);
});

test('부분 설정 저장은 기존 상세값을 지우지 않는다',()=>{
  const current={...__clanTest.CLAN_ADMIN_SETTINGS_DEFAULTS,warDurationMinutes:75,energyRecoverySeconds:240,winnerCoin:12345};
  const clean=__clanTest.cleanClanAdminSettings({mode:'OFF'},current);
  assert.equal(clean.mode,'OFF');
  assert.equal(clean.warDurationMinutes,75);
  assert.equal(clean.energyRecoverySeconds,240);
  assert.equal(clean.winnerCoin,12345);
});

test('운영 API는 조회를 관리자에게, 변경과 테스트 단계를 OWNER에게만 허용하고 로그를 남긴다',()=>{
  assert.match(server,/path==='admin\/clan-war\/settings'/);
  assert.match(server,/if\(!admin\)return deps\.json\(\{error:'관리자 권한이 필요합니다\.'/);
  assert.match(server,/if\(!owner\)return deps\.json\(\{error:'클랜전 운영 설정은 OWNER만 변경할 수 있습니다\.'/);
  assert.match(server,/CLAN_WAR_SETTINGS_UPDATE/);
  assert.match(server,/CLAN_WAR_MODE_UPDATE/);
  assert.match(server,/CLAN_SETTINGS_VERIFY_FAILED/);
  assert.match(server,/개방 요일을 하나 이상 선택하세요/);
  assert.match(server,/지원하지 않는 클랜전 CMS 요청 방식/);
  assert.match(router,/handleClan\(\{path,request,env,deps:\{authenticate,readBody,json,isAdminRole,writeAdminLog/);
  for(const route of ['clan/admin/test-bootstrap','clan/admin/test-activate','clan/admin/test-settle'])assert.match(cms,new RegExp(route.replaceAll('/','\\/')));
});

test('현재 3회 런타임과 60분 출시 설계값을 CMS에서 명확히 분리한다',()=>{
  assert.equal(__clanTest.CLAN_ATTACKS_PER_WAR,3);
  assert.equal(__clanTest.CLAN_DEFENSES_PER_TARGET,3);
  assert.match(server,/runtimeContract:\{attacksPerWar:CLAN_ATTACKS_PER_WAR/);
  assert.match(server,/targetContract:\{warDurationMinutes:settings\.warDurationMinutes/);
  assert.match(server,/key:'WAR_WINDOW',status:'PENDING'/);
  assert.match(server,/key:'ENERGY',status:'PENDING'/);
  assert.match(server,/key:'POWER_MATCH',status:'PENDING'/);
  assert.match(server,/key:'REWARDS',status:'LOCKED'/);
  assert.match(cms,/설계값 저장 ≠ 런타임 적용/);
  assert.match(cms,/현재 라이브/);
  assert.match(cms,/CMS 출시 설계값/);
});

test('공식 8클랜·대진·영수증·반응형 운영 UI를 제공한다',()=>{
  assert.match(server,/WHERE o\.is_active=1 ORDER BY/);
  assert.match(server,/LIMIT \?`\)\.bind\(seasonId,seasonId,OFFICIAL_CLAN_CATALOG\.length\)/);
  for(const id of ['cwClans','cwWars','cwReceipts','cwReleaseGates','cwOperationSummary'])assert.match(cms,new RegExp(`id="${id}"`));
  assert.match(cms,/최근 40건/);
  assert.match(css,/\.cwadmin-clans/);
  assert.match(css,/\.cwadmin-wars/);
  assert.match(css,/\.cwadmin-receipts/);
  assert.match(css,/@media\(max-width:1100px\)/);
  assert.match(css,/@media\(max-width:760px\)/);
  assert.match(css,/@media\(max-width:520px\)/);
});

test('클랜 CMS 회귀 검사가 배포 게이트에 포함된다',()=>{
  assert.match(packageJson.scripts['test:clan']||'',/clan-v3-v1820\.mjs/);
  assert.match(packageJson.scripts['test:clan']||'',/clan-war-cms-v1943\.test\.mjs/);
  assert.match(packageJson.scripts['release:gate']||'',/npm run test:clan/);
});
