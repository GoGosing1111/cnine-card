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
const fightSource=server.slice(server.indexOf('async function fight('),server.indexOf('\nexport async function handleClan'));

test('클랜 정원과 스네이크 드래프트 순서가 고정된다',()=>{
  assert.equal(__clanTest.CLAN_MAX_MEMBERS,22);
  assert.equal(__clanTest.CLAN_MAX_PARTICIPANTS,176);
  assert.equal(__clanTest.CLAN_ATTACKS_PER_WAR,21);
  assert.equal(__clanTest.CLAN_DEFENSES_PER_TARGET,21);
  assert.equal(__clanTest.CLAN_REPEAT_TARGET_LIMIT,1);
  assert.deepEqual(Array.from({length:8},(_,i)=>__clanTest.currentDraftPosition(i,3)),[0,1,2,2,1,0,0,1]);
});

test('동점 클랜전도 한 번만 정산할 수 있도록 결정적 승자를 선택한다',()=>{
  assert.equal(__clanTest.warWinnerClanId({clan_a_id:7,clan_b_id:4,score_a:5,score_b:5}),4);
  assert.equal(__clanTest.warWinnerClanId({clan_a_id:7,clan_b_id:4,score_a:6,score_b:5}),7);
  assert.equal(__clanTest.warWinnerClanId({clan_a_id:7,clan_b_id:4,score_a:3,score_b:5}),4);
});

test('클랜별 2명 확장과 2시간 추가 신청은 드래프트를 안전하게 일시 정지한다',()=>{
  const now=Date.parse('2026-09-03T10:00:00.000Z'),registrationEndsAt=new Date(now+2*60*60*1000).toISOString(),schedule=__clanTest.clanLateRegistrationSchedule({phase:'DRAFT',registration_ends_at:'2026-09-01T10:00:00.000Z',draft_ends_at:'2026-09-04T10:00:00.000Z',starts_at:'2026-09-04T10:00:00.000Z',ends_at:'2026-10-02T10:00:00.000Z'},now);
  assert.equal(__clanTest.CLAN_LATE_REGISTRATION_EXTENSION_MS,2*60*60*1000);
  assert.deepEqual(schedule,{registrationEndsAt:'2026-09-03T12:00:00.000Z',draftEndsAt:'2026-09-04T12:00:00.000Z',startsAt:'2026-09-04T12:00:00.000Z',endsAt:'2026-10-02T12:00:00.000Z'});
  assert.equal(__clanTest.clanRegistrationOpen({phase:'DRAFT',registration_ends_at:registrationEndsAt},now),true);
  assert.equal(__clanTest.clanRegistrationOpen({phase:'DRAFT',registration_ends_at:registrationEndsAt},now+2*60*60*1000),false);
  assert.equal(__clanTest.clanRegistrationOpen({phase:'ACTIVE',registration_ends_at:registrationEndsAt},now),false);
  assert.match(server,/safe_runtime_upgrade_v1993_clan_capacity_22_late_registration_2h/);
  assert.match(server,/\[CLAN_CAPACITY_V1993_STATE\]/);
  assert.match(server,/PAUSE_DRAFT_AND_ACCEPT_LATE_REGISTRATION/);
  assert.match(server,/clanLateRegistrationSchedule\(season\)/);
  assert.match(server,/if\(fresh\.phase==='DRAFT'&&clanRegistrationOpen\(fresh\)\)return fresh/);
  assert.match(server,/if\(String\(season\.phase\)\.toUpperCase\(\)==='DRAFT'\)await calculateSeasonScores\(env,season\)/);
  assert.match(server,/LIMIT \?`\)\.bind\(war\.id,war\.id,user\.id,season\.id,enemyClan,CLAN_MAX_MEMBERS\)/);
  assert.match(client,/LATE REGISTRATION OPEN/);
  assert.match(client,/총 \$\{number\(participantLimit\(d\)\)\}명까지 신청 가능/);
  assert.doesNotMatch(client,/ROSTER LIMIT 20|최대 160명|\/ 20(?:명)?/);
});

test('추가 신청은 오늘 19시 마감하고 기존 드래프트 뒤 21시 첫 전쟁을 연다',()=>{
  const now=Date.parse('2026-09-03T08:30:00.000Z'),schedule=__clanTest.clanLateDraftFixedSchedule(__clanTest.CLAN_ADMIN_SETTINGS_DEFAULTS,now,2);
  assert.equal(__clanTest.CLAN_LATE_DRAFT_HOUR_KST,19);
  assert.equal(__clanTest.CLAN_WAR_OPEN_HOUR_KST,21);
  assert.equal(schedule.registrationEndsAt,'2026-09-03T10:00:00.000Z');
  assert.equal(schedule.draftEndsAt,'2026-09-03T12:00:00.000Z');
  assert.deepEqual(schedule.roundStarts,['2026-09-03T12:00:00.000Z','2026-09-04T12:00:00.000Z']);
  assert.match(server,/safe_runtime_upgrade_v1994_clan_late_entry_draft_1900_war_2100/);
  assert.match(server,/PAUSE_SCHEDULED_SEASON_FOR_LATE_DRAFT/);
  assert.match(server,/SKIP_STARTED_WAR_SAFETY/);
  assert.match(server,/phase='DRAFT'.*registration_ends_at=.*draft_ends_at=.*starts_at=.*ends_at=/);
  assert.match(server,/SELECT MIN\(starts_at\) starts_at,MAX\(ends_at\) ends_at,COUNT\(DISTINCT round_no\) round_count/);
  assert.match(client,/LATE ENTRY · 19:00 CLOSE/);
  assert.match(client,/19시 마감 뒤 기존 순서로 드래프트를 재개하고 21시에 클랜전이 시작됩니다/);
});

test('공식 8클랜은 7개 정시 라운드에서 모든 상대를 정확히 한 번 만난다',()=>{
  const rounds=__clanTest.roundRobinRounds(Array.from({length:8},(_,index)=>index+1));
  assert.equal(rounds.length,7);
  assert.ok(rounds.every(round=>round.length===4));
  const pairKeys=rounds.flat().map(pair=>[pair.clanAId,pair.clanBId].sort((a,b)=>a-b).join(':'));
  assert.equal(new Set(pairKeys).size,28);
});

test('정시 대진은 KST 21시에 열리고 각 창구는 60분 계약을 사용한다',()=>{
  const from=Date.parse('2026-08-31T11:00:00.000Z'),starts=__clanTest.scheduledWindowStarts(__clanTest.CLAN_ADMIN_SETTINGS_DEFAULTS,from,2);
  assert.deepEqual(starts.map(value=>new Date(value).toISOString()),['2026-08-31T12:00:00.000Z','2026-09-01T12:00:00.000Z']);
  assert.equal(__clanTest.CLAN_ADMIN_SETTINGS_DEFAULTS.warDurationMinutes,60);
});

test('행동력은 10에서 시작해 300초마다 회복하고 60분간 최대 21회만 사용한다',()=>{
  const start=Date.parse('2026-08-31T12:00:00.000Z'),war={status:'ACTIVE',starts_at:new Date(start).toISOString(),ends_at:new Date(start+3600000).toISOString()},settings=__clanTest.CLAN_ADMIN_SETTINGS_DEFAULTS;
  assert.equal(__clanTest.clanEnergySnapshot(war,0,settings,start).available,10);
  assert.equal(__clanTest.clanEnergySnapshot(war,10,settings,start+9*60*1000).available,1);
  assert.equal(__clanTest.clanEnergySnapshot(war,20,settings,start+55*60*1000).available,1);
  assert.equal(__clanTest.clanEnergySnapshot(war,20,settings,start+55*60*1000).canAttack,true);
  assert.equal(__clanTest.clanEnergySnapshot(war,21,settings,start+59*60*1000).canAttack,false);
});

test('전투력과 무관하게 가용 상대 한 명만 요청 키 기반으로 서버 랜덤 배정한다',()=>{
  const candidates=[{userId:1,combatPower:1,available:true},{userId:2,combatPower:999999999,available:true},{userId:3,combatPower:50,available:false}];
  const first=__clanTest.randomMatchCandidates(candidates,'stable-request-id'),again=__clanTest.randomMatchCandidates(candidates,'stable-request-id');
  assert.equal(first.filter(row=>row.matchEligible).length,1);
  assert.deepEqual(first.filter(row=>row.matchEligible).map(row=>row.userId),again.filter(row=>row.matchEligible).map(row=>row.userId));
  assert.ok([1,2].includes(first.find(row=>row.matchEligible).userId));
  assert.equal(first[0].matchEligible,true);
  assert.deepEqual(first.filter(row=>row.available).map(row=>row.userId),again.filter(row=>row.available).map(row=>row.userId));
  assert.equal(first.find(row=>row.userId===3).matchReason,'QUOTA_LOCKED');
  assert.equal(first.at(-1).userId,3);
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

test('OWNER TEST 잠금과 정식 ON 공개 게이트가 서버·유저 메뉴에 연결된다',()=>{
  assert.match(server,/clan_settings_v1/);
  assert.match(server,/mode:'TEST'/);
  assert.match(server,/CLAN_TEST_ONLY/);
  assert.match(server,/clan\/admin\/mode/);
  assert.match(app,/CLAN_FEATURE_MODE='ON'/);
  assert.doesNotMatch(app,/클랜 TEST/);
  assert.match(app,/data-tab="clan">클랜<\/button>/);
  assert.doesNotMatch(shell,/clanTestVisible|클랜 TEST|OWNER\s*·\s*블라인드|OWNER·V3/);
  assert.match(shell,/function clanFeatureVisible\(\)/);
  assert.match(shell,/pcCommand\('clan', '클랜', '블라인드 드래프트 · V3'/);
  assert.match(shell,/mobileCommand\('clan', '클랜', '블라인드 드래프트 · V3'/);
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
  assert.match(html,/clan-v1\.css\?v=2040-clan-participation-positive/);
  assert.match(html,/clan-v1\.js\?v=2053-player-calling-card/);
  assert.ok(commandRoomAsset.size>10_000&&commandRoomAsset.size<80_000);
});

test('조회 로그를 만들지 않고 전투 영수증 보존일은 서버 설정으로 제한한다',()=>{
  assert.doesNotMatch(server,/CREATE TABLE IF NOT EXISTS clan_(?:view|access|activity)_logs/i);
  assert.match(server,/battleReceiptRetentionDays/);
  assert.match(server,/updated_at<datetime\('now','-\$\{retention\} days'\)/);
  assert.match(server,/QUERY_POLICY|queryPolicy:'LIVE_DECK_NO_VIEW_LOGS'/i);
});

test('클랜 V3 전투는 유저·상대 단위 예약 락과 재시도 가능한 영수증을 사용한다',()=>{
  assert.match(router,/clan\/war\/fight/);
  assert.match(server,/status='FAILED'/);
  assert.match(server,/INSERT OR IGNORE INTO clan_war_battles/);
  assert.match(server,/status='RESOLVING'/);
  assert.match(server,/CLAN_ATTACKS_PER_WAR=21/);
  assert.match(server,/CLAN_DEFENSES_PER_TARGET=21/);
  assert.match(server,/CLAN_REPEAT_TARGET_LIMIT=1/);
  assert.match(server,/CLAN_ENERGY_EMPTY/);
  assert.match(server,/CLAN_RANDOM_POOL_EMPTY/);
  assert.match(server,/randomMatchCandidates/);
  assert.match(server,/SELECT p\.card_ids FROM pvp_active_presets/);
  assert.match(server,/currentRankedDeckIds\(env,attackerUser\.id\)/);
  assert.match(server,/currentRankedDeckIds\(env,defenderUser\.id\)/);
  assert.doesNotMatch(client,/targetUserId/);
  assert.match(server,/safe_runtime_upgrade_v1999_clan_concurrent_war_reservations_v1/);
  assert.match(server,/CREATE TABLE IF NOT EXISTS clan_war_reservation_locks/);
  assert.match(server,/reservationScope:'PER_WAR_USER_AND_TARGET'/);
  assert.match(server,/key:'CONCURRENT_ENTRY',status:'READY'/);
  assert.match(fightSource,/acquireWarReservationLock\(env,war\.id,'ATTACKER',user\.id\)/);
  assert.match(fightSource,/acquireWarReservationLock\(env,war\.id,'DEFENDER',candidate\.userId\)/);
  assert.match(fightSource,/for\(const candidate of candidates\)/);
  assert.match(fightSource,/CLAN_ATTACKER_RESERVATION_BUSY/);
  assert.match(fightSource,/CLAN_RANDOM_TARGET_BUSY/);
  assert.doesNotMatch(fightSource,/acquireDraftLock/);
  assert.doesNotMatch(fightSource,/다른 클랜전 작전권을 배정 중입니다/);
  assert.match(server,/NOT EXISTS\(SELECT 1 FROM clan_war_battles WHERE war_id=\? AND status IN \('PENDING','RESOLVING'\)\)/);
  assert.match(server,/INSERT OR IGNORE INTO clan_war_battles[\s\S]+WHERE EXISTS\(SELECT 1 FROM clan_wars WHERE id=\? AND status='ACTIVE'/);
  assert.match(server,/EXISTS\(SELECT 1 FROM clan_wars WHERE id=\? AND status='ACTIVE'\)/);
  assert.match(server,/UPDATE clan_members SET \$\{won\?'battle_losses':'battle_wins'\}/);
});

test('클랜 시즌 정산은 원자적 상태 전이와 중복 방지 보상 영수증을 사용한다',()=>{
  assert.match(server,/CREATE TABLE IF NOT EXISTS clan_season_settlements/);
  assert.match(server,/env\.DB\.execSchema\(statements\)/);
  assert.match(server,/status='PROCESSING'/);
  assert.match(server,/processing_token/);
  assert.match(server,/SEASON_SETTLED_BEFORE_RESOLUTION/);
  assert.match(server,/clan_reward_receipts/);
  assert.match(server,/rewardStatus=await payClanSeasonRewards/);
  assert.match(server,/status='COMPLETED'/);
  assert.match(server,/clan\/admin\/test-settle/);
  assert.match(client,/테스트 시즌 즉시 정산/);
  assert.match(client,/사용 상한 소진/);
  assert.match(client,/랜덤 매칭 시작/);
  assert.match(client,/최신 랭크전 덱/);
  assert.match(client,/participantLimit\(d\)/);
});
