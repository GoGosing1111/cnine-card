import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {__clanTest} from '../functions/_clan.js';

const [server,router,app,client,shell,html,css,postgresMigration]=await Promise.all([
  readFile(new URL('../functions/_clan.js',import.meta.url),'utf8'),
  readFile(new URL('../functions/api/[[path]].js',import.meta.url),'utf8'),
  readFile(new URL('../js/app.js',import.meta.url),'utf8'),
  readFile(new URL('../js/clan-v1.js',import.meta.url),'utf8'),
  readFile(new URL('../js/soopketmon-v21-exact-shell-adapter.js',import.meta.url),'utf8'),
  readFile(new URL('../index.html',import.meta.url),'utf8'),
  readFile(new URL('../css/clan-v1.css',import.meta.url),'utf8'),
  readFile(new URL('../scripts/postgres-clan-v1820.sql',import.meta.url),'utf8')
]);

test('클랜 정원과 스네이크 드래프트 순서가 고정된다',()=>{
  assert.equal(__clanTest.CLAN_MAX_MEMBERS,20);
  assert.deepEqual(Array.from({length:8},(_,i)=>__clanTest.currentDraftPosition(i,3)),[0,1,2,2,1,0,0,1]);
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
  assert.equal((postgresMigration.match(/CREATE TABLE IF NOT EXISTS clan_/g)||[]).length,8);
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

test('조회 로그를 만들지 않고 전투 영수증은 30일 한정 정리한다',()=>{
  assert.doesNotMatch(server,/CREATE TABLE IF NOT EXISTS clan_(?:view|access|activity)_logs/i);
  assert.match(server,/updated_at<datetime\('now','-30 days'\)/);
  assert.match(server,/QUERY_POLICY|queryPolicy:'SNAPSHOT_NO_VIEW_LOGS'/i);
});

test('클랜 V3 전투는 사용자 직렬화 락과 재시도 가능한 영수증을 사용한다',()=>{
  assert.match(router,/clan\/war\/fight/);
  assert.match(server,/status='FAILED'/);
  assert.match(server,/INSERT OR IGNORE INTO clan_war_battles/);
});
