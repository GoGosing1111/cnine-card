import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile,stat} from 'node:fs/promises';
import {__clanTest} from '../functions/_clan.js';

const [server,router,app,client,shell,html,css,postgresMigration,markCatalogRaw]=await Promise.all([
  readFile(new URL('../functions/_clan.js',import.meta.url),'utf8'),
  readFile(new URL('../functions/api/[[path]].js',import.meta.url),'utf8'),
  readFile(new URL('../js/app.js',import.meta.url),'utf8'),
  readFile(new URL('../js/clan-v1.js',import.meta.url),'utf8'),
  readFile(new URL('../js/soopketmon-v21-exact-shell-adapter.js',import.meta.url),'utf8'),
  readFile(new URL('../index.html',import.meta.url),'utf8'),
  readFile(new URL('../css/clan-v1.css',import.meta.url),'utf8'),
  readFile(new URL('../scripts/postgres-clan-v1820.sql',import.meta.url),'utf8'),
  readFile(new URL('../assets/ui/clan/marks/clan-mark-catalog-v1.json',import.meta.url),'utf8')
]);
const commandRoomAsset=await stat(new URL('../assets/ui/clan/clan-command-room-v1.webp',import.meta.url));
const markCatalog=JSON.parse(markCatalogRaw);
const markAssets=await Promise.all(markCatalog.clans.map(clan=>stat(new URL(`../assets/ui/clan/marks/${clan.asset}`,import.meta.url))));
const markSources=await Promise.all(markCatalog.clans.map(clan=>stat(new URL(`../assets/ui/clan/marks/${clan.source}`,import.meta.url))));

test('클랜 정원과 스네이크 드래프트 순서가 고정된다',()=>{
  assert.equal(__clanTest.CLAN_MAX_MEMBERS,20);
  assert.equal(__clanTest.CLAN_MAX_PARTICIPANTS,160);
  assert.equal(__clanTest.CLAN_ATTACKS_PER_WAR,3);
  assert.equal(__clanTest.CLAN_DEFENSES_PER_TARGET,3);
  assert.equal(__clanTest.CLAN_REPEAT_TARGET_LIMIT,1);
  assert.deepEqual(Array.from({length:8},(_,i)=>__clanTest.currentDraftPosition(i,3)),[0,1,2,2,1,0,0,1]);
});

test('동점 클랜전도 한 번만 정산할 수 있도록 결정적 승자를 선택한다',()=>{
  assert.equal(__clanTest.warWinnerClanId({clan_a_id:7,clan_b_id:4,score_a:5,score_b:5}),4);
  assert.equal(__clanTest.warWinnerClanId({clan_a_id:7,clan_b_id:4,score_a:6,score_b:5}),7);
  assert.equal(__clanTest.warWinnerClanId({clan_a_id:7,clan_b_id:4,score_a:3,score_b:5}),4);
});

test('8개 공식 클랜 이름·키·마크 리소스가 단일 카탈로그로 고정된다',()=>{
  const expectedNames=['DK','삼성','T1','한화','LG','롯데','FM','DC'];
  const expectedKeys=['DK','SAMSUNG','T1','HANWHA','LG','LOTTE','FM','DC'];
  assert.deepEqual(__clanTest.OFFICIAL_CLAN_CATALOG.map(clan=>clan.name),expectedNames);
  assert.deepEqual(__clanTest.CLAN_MARKS,expectedKeys);
  assert.deepEqual(markCatalog.clans.map(clan=>clan.name),expectedNames);
  assert.deepEqual(markCatalog.clans.map(clan=>clan.markKey),expectedKeys);
  assert.ok(markAssets.every(asset=>asset.size>40_000&&asset.size<150_000));
  assert.ok(markSources.every(asset=>asset.size>1_000_000));
  assert.match(server,/CLAN_OFFICIAL_CATALOG_VERSION/);
  assert.match(server,/identityFixed:true/);
  assert.match(client,/dk-clan-mark-v1\.webp/);
  assert.match(client,/dc-clan-mark-v1\.webp/);
  assert.match(client,/OFFICIAL CLAN ROSTER/);
  assert.doesNotMatch(client,/WOLF:'◆'|SHIELD:'⬡'/);
  assert.match(css,/\.clan-mark img/);
});

test('마스터 점수는 활동·랭크·기여·신뢰 스냅샷으로 계산한다',()=>{
  const [active,idle]=__clanTest.normalizeScores([
    {user_id:1,attendance_days:25,last_login_at:new Date().toISOString(),season_score:2200,wins:50,losses:10,territory_points:9000},
    {user_id:2,attendance_days:1,last_login_at:'2020-01-01 00:00:00',season_score:500,wins:1,losses:8,territory_points:20}
  ]);
  assert.ok(active.master_score>idle.master_score);
  assert.equal(active.rank_band,'DIAMOND');
  assert.equal(active.activity_band,'CORE');
});

test('OWNER TEST 잠금과 ON 전환 API가 서버에 존재한다',()=>{
  assert.match(server,/clan_settings_v1/);
  assert.match(server,/mode:'TEST'/);
  assert.match(server,/CLAN_TEST_ONLY/);
  assert.match(server,/clan\/admin\/mode/);
  assert.match(app,/CLAN_FEATURE_MODE='TEST'/);
  assert.match(shell,/clanTestVisible/);
  assert.match(postgresMigration,/\{"mode":"TEST"\}/);
  assert.equal((postgresMigration.match(/CREATE TABLE IF NOT EXISTS clan_/g)||[]).length,9);
});

test('OWNER는 2차 인증 없이 클랜 테스트 자격을 통과한다',()=>{
  assert.equal(__clanTest.isOwner({role:'OWNER'}),true);
  assert.equal(__clanTest.isOwner({role:'owner'}),true);
  assert.equal(__clanTest.isOwner({role:'ADMIN'}),false);
  assert.match(server,/verificationExempt:ownerBypass/);
  assert.match(server,/if\(!isOwner\(user\)\)/);
  assert.match(server,/s\.user_id IS NOT NULL OR UPPER\(TRIM\(COALESCE\(u\.role,'USER'\)\)\)='OWNER'/);
});

test('V21 클랜 UI와 라이브 V3 계약이 연결된다',()=>{
  assert.match(html,/css\/clan-v1\.css/);
  assert.match(html,/js\/clan-v1\.js/);
  assert.match(app,/window\.ClanV1\.bind/);
  assert.match(client,/ensureFeatureResources\('battleV2'\)/);
  assert.match(client,/playPvpBattleV2Live/);
  assert.match(server,/createPvpBattleV2/);
  assert.match(server,/PROJECT_V_V3/);
  assert.match(css,/@media\(max-width:760px\)/);
});

test('클랜 지휘실 장면과 모바일 리뉴얼 계약을 유지한다',()=>{
  assert.match(client,/clan-hero-media/);
  assert.match(client,/clan-season-lock/);
  assert.match(client,/clan-lock-radar/);
  assert.match(client,/OWNER CLEARANCE/);
  assert.match(css,/clan-command-room-v1\.webp/);
  assert.match(css,/@keyframes clanRadarSweep/);
  assert.match(css,/@media\(max-width:760px\)[\s\S]*\.clan-season-lock/);
  assert.match(html,/clan-v1\.css\?v=1883-clan-war-safety/);
  assert.match(html,/clan-v1\.js\?v=1883-clan-war-safety/);
  assert.ok(commandRoomAsset.size>10_000&&commandRoomAsset.size<80_000);
});

test('조회 로그를 만들지 않고 전투 영수증은 30일 한정 정리한다',()=>{
  assert.doesNotMatch(server,/CREATE TABLE IF NOT EXISTS clan_(?:view|access|activity)_logs/i);
  assert.match(server,/updated_at<datetime\('now','-30 days'\)/);
  assert.match(server,/QUERY_POLICY|queryPolicy:'SNAPSHOT_NO_VIEW_LOGS'/i);
});

test('클랜 V3 전투는 사용자 직렬화 락과 재시도 가능한 영수증을 사용한다',()=>{
  assert.match(router,/clan\/war\/fight/);
  assert.match(server,/status='FAILED'/);
  assert.match(server,/INSERT OR IGNORE INTO clan_war_battles/);
  assert.match(server,/status='RESOLVING'/);
  assert.match(server,/CLAN_ATTACKS_PER_WAR=3/);
  assert.match(server,/CLAN_DEFENSES_PER_TARGET=3/);
  assert.match(server,/CLAN_REPEAT_TARGET_LIMIT=1/);
  assert.match(server,/defender_user_id=\? AND status IN \('PENDING','RESOLVING','COMPLETED'\)/);
  assert.match(server,/다른 클랜전 작전권을 배정 중입니다/);
  assert.match(server,/EXISTS\(SELECT 1 FROM clan_wars WHERE id=\? AND status='ACTIVE'\)/);
  assert.match(server,/UPDATE clan_members SET \$\{won\?'battle_losses':'battle_wins'\}/);
});

test('클랜 시즌 정산은 원자적 상태 전이와 TEST 보상 잠금을 사용한다',()=>{
  assert.match(server,/CREATE TABLE IF NOT EXISTS clan_season_settlements/);
  assert.match(server,/env\.DB\.execSchema\(statements\)/);
  assert.match(server,/status='PROCESSING'/);
  assert.match(server,/processing_token/);
  assert.match(server,/SEASON_SETTLED_BEFORE_RESOLUTION/);
  assert.match(server,/reward_status='DISABLED_TEST'/);
  assert.match(server,/clan\/admin\/test-settle/);
  assert.match(client,/테스트 시즌 즉시 정산/);
  assert.match(client,/작전권 소진/);
  assert.match(client,/방어 슬롯 마감/);
  assert.match(client,/limit:160/);
});
