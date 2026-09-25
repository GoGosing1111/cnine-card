import {accountRankAward} from '../functions/_account_rank.js';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {DatabaseSync} from 'node:sqlite';
import test from 'node:test';
import {PGlite} from '@electric-sql/pglite';
import {__postgresCompatTest} from '../functions/_postgres_d1_compat.js';

const read = path => readFileSync(new URL('../'+path,import.meta.url),'utf8');
const server = read('functions/_seal_battle.js');
const admin = read('admin/seal-battle-admin.js');
const copy = value => JSON.parse(JSON.stringify(value));
const createModule = () => Function('accountRankAward',server.replace(/^import .*;\r?\n/gm,'').replace(/^export /gm,'')+`;return {
  cleanSettings,normalizeEvent,saveSettings,loadSettings,adminStart,ensureFoundation,
  participate,claimClearReward,claimRankReward,handleSealBattle,SEAL_COIN_REWARD_MAX,
  rewardEligibility,statusPayload,rankRewardPreview,ensureRewardAttemptsSchema
};`)(accountRankAward);
const mod = createModule();
const configured = () => mod.cleanSettings({
  mode:'ON', title:'보상 검증', bossName:'테스트 봉인', minRewardAttempts:1,
  targets:{attack:2_000_000_000,guard:2_000_000_000,purify:2_000_000_000},
  attemptReward:{coin:5_000_000_000,shards:7},
  clearReward:{coin:10_000_000_000,shards:11},
  rankRewards:{enabled:true,rewardOnFailure:true,tiers:[{startRank:1,endRank:1,coin:12_500_000_000,premiumCube:5,equipmentBox:2}]}
});

async function fixture(overrides={}){
  const api = createModule();
  const db = new DatabaseSync(':memory:');
  db.exec(`CREATE TABLE app_meta(key TEXT PRIMARY KEY,value TEXT,updated_at TEXT);
    CREATE TABLE users(id INTEGER PRIMARY KEY,nickname TEXT,coin INTEGER NOT NULL DEFAULT 0,card_shards INTEGER NOT NULL DEFAULT 0);
    CREATE TABLE coin_logs(id INTEGER PRIMARY KEY,user_id INTEGER,change_amount INTEGER,balance_after INTEGER,reason TEXT);
    CREATE TABLE shard_logs(id INTEGER PRIMARY KEY,user_id INTEGER,change_amount INTEGER,balance_after INTEGER,reason TEXT);
    CREATE TABLE cnine_user_inventory(user_id INTEGER,item_code TEXT,quantity INTEGER,unseen_quantity INTEGER,created_at TEXT,updated_at TEXT,PRIMARY KEY(user_id,item_code));
    CREATE TABLE inventory_logs(id INTEGER PRIMARY KEY,user_id INTEGER,item_code TEXT,change_amount INTEGER,balance_after INTEGER,reason TEXT,reference_type TEXT,reference_id TEXT);
    INSERT INTO users(id,nickname,coin) VALUES(2,'테스트 참여자',1000);
    INSERT INTO app_meta(key,value) VALUES('safe_runtime_upgrade_v1287_seal_attempt_recharge','1'),('safe_runtime_upgrade_v1288_seal_rank_rewards','1');`);
  let failurePattern = null;
  const DB = {
    prepare(sql){return {sql,values:[],bind(...values){this.values=values;return this},
      async first(){return db.prepare(sql).get(...this.values)||null},
      async all(){return {results:db.prepare(sql).all(...this.values)}},
      async run(){
        if(failurePattern?.test(sql))throw new Error('INJECTED_REWARD_FAILURE');
        const result=db.prepare(sql).run(...this.values);
        return {meta:{changes:Number(result.changes),last_row_id:Number(result.lastInsertRowid)}};
      }
    }},
    async batch(statements){
      db.exec('BEGIN');
      try{const result=[];for(const statement of statements)result.push(await statement.run());db.exec('COMMIT');return result}
      catch(error){db.exec('ROLLBACK');throw error}
    }
  };
  const user={id:2,role:'USER'},owner={id:1,role:'OWNER'};
  const deps={
    json:(body,status=200)=>({body,status}),
    columnExists:async(_env,table,column)=>db.prepare('PRAGMA table_info('+table+')').all().some(row=>row.name===column),
    authenticate:async()=>owner,requirePermission:async()=>owner,
    readBody:request=>request.json(),
    raidDeckPower:async()=>({power:20_000,basePower:20_000,cards:[],ids:[1,2,3,4,5]})
  };
  const env={DB};await api.ensureFoundation(env,deps);
  const settings={...configured(),...overrides};await api.saveSettings(env,settings);
  const event=await api.adminStart(env,settings,owner);
  return {api,db,env,deps,user,settings,event,setFailure:pattern=>{failurePattern=pattern}};
}

test('참여·완료·순위 코인은 기존 1억/10억 상한과 32비트 경계를 넘겨도 보존된다',()=>{
  assert.equal(mod.SEAL_COIN_REWARD_MAX,Number.MAX_SAFE_INTEGER);
  for(const coin of [100_000_001,1_000_000_001,2_147_483_648,5_000_000_000,10_000_000_000,Number.MAX_SAFE_INTEGER]){
    const settings=mod.cleanSettings({attemptReward:{coin},clearReward:{coin},rankRewards:{tiers:[{coin}]}});
    assert.equal(settings.attemptReward.coin,coin);
    assert.equal(settings.clearReward.coin,coin);
    assert.equal(settings.rankRewards.tiers[0].coin,coin);
    assert.deepEqual(mod.cleanSettings(copy(settings)),settings);
  }
});

test('25회 최소 보상: 0·24회 차단, 정확히 25·26회 지급, 공헌도가 높아도 우회 불가',async()=>{
  assert.equal(mod.cleanSettings({}).minRewardAttempts,25);
  for(const attempts of [0,24,25,26]){
    const f=await fixture({minRewardAttempts:25});
    try{
      f.db.prepare("INSERT INTO seal_battle_user_progress(event_id,user_id,day_key,total_attempts,total_contribution) VALUES(?,2,'2026-09-22',?,999999999999)").run(f.event.id,attempts);
      f.db.prepare("UPDATE seal_battle_events SET status='CLEARED' WHERE id=?").run(f.event.id);
      const event=f.api.normalizeEvent(f.db.prepare('SELECT * FROM seal_battle_events').get());
      const state=await f.api.statusPayload(f.env,f.deps,f.user);
      assert.equal(state.clearReward.eligible,attempts>=25);
      assert.equal(state.rewardEligibility.remainingAttempts,Math.max(0,25-attempts));
      assert.equal(Boolean(state.rankReward),attempts>=25);
      for(const claim of [f.api.claimClearReward,f.api.claimRankReward]){
        const result=await claim(f.env,f.deps,f.user,event);
        assert.equal(result.status,attempts>=25?200:403);
        if(attempts<25)assert.equal(result.body.code,'SEAL_REWARD_MIN_ATTEMPTS');
        else assert.equal((await claim(f.env,f.deps,f.user,event)).status,409);
      }
      assert.equal(f.db.prepare('SELECT coin FROM users WHERE id=2').get().coin,attempts>=25?22_500_001_000:1000);
      assert.equal(f.db.prepare('SELECT COUNT(*) n FROM coin_logs').get().n,attempts>=25?2:0);
    }finally{f.db.close()}
  }
});

test('승패·역할 합산은 완료 전투만 집계하며 요청 재전송·실패는 최소 횟수를 늘리지 않는다',async()=>{
  const f=await fixture({minRewardAttempts:25});
  try{
    f.db.prepare("INSERT INTO seal_battle_user_progress(event_id,user_id,day_key,total_attempts) VALUES(?,2,'2026-09-21',23)").run(f.event.id);
    const request={requestId:'seal-min-attempts-guard-0001',role:'GUARD'};
    const result=await f.api.participate(f.env,f.deps,f.user,f.settings,f.event,request);
    assert.equal(result.status,200);assert.equal(result.body.state.progress.totalAttempts,24);
    assert.equal(result.body.state.rewardEligibility.eligible,false);
    assert.equal(result.body.reward.coin,5_000_000_000,'per-attempt reward unchanged');
    const replay=await f.api.participate(f.env,f.deps,f.user,f.settings,f.event,request);
    assert.equal(replay.body.replayed,true);assert.equal(replay.body.state.progress.totalAttempts,24);
    const invalid=await f.api.participate(f.env,f.deps,f.user,f.settings,f.event,{requestId:'seal-min-invalid-0001',role:'INVALID'});
    assert.equal(invalid.status,400);
    f.deps.raidDeckPower=async()=>({power:1,basePower:1,cards:[],ids:[1,2,3,4,5]});
    const loss=await f.api.participate(f.env,f.deps,f.user,f.settings,f.event,{requestId:'seal-min-purify-loss-0001',role:'PURIFY'});
    assert.equal(loss.body.result,'LOSE');assert.equal(loss.body.state.progress.totalAttempts,25);
    assert.equal(loss.body.state.rewardEligibility.eligible,true);
  }finally{f.db.close()}
});

test('현재·지난 회차 보상 미리보기와 eventId 직접 청구가 회차별 최소 횟수를 동일하게 적용한다',async()=>{
  const f=await fixture({minRewardAttempts:25});
  try{
    const old=f.event.id;
    f.db.prepare("INSERT INTO seal_battle_user_progress(event_id,user_id,day_key,total_attempts) VALUES(?,2,'2026-09-22',25)").run(old);
    f.db.prepare("UPDATE seal_battle_events SET status='CLEARED' WHERE id=?").run(old);
    const blocked=await f.api.adminStart(f.env,f.settings,{id:1});
    f.db.prepare("INSERT INTO seal_battle_user_progress(event_id,user_id,day_key,total_attempts) VALUES(?,2,'2026-09-22',24)").run(blocked.id);
    f.db.prepare("UPDATE seal_battle_events SET status='CLEARED' WHERE id=?").run(blocked.id);
    await f.api.adminStart(f.env,f.settings,{id:1});
    const status=await f.api.statusPayload(f.env,f.deps,f.user);
    assert.equal(status.pendingClearReward.eventId,old);assert.equal(status.pendingRankReward.eventId,old);
    f.deps.authenticate=async()=>f.user;
    const claim=body=>f.api.handleSealBattle({path:'seal-battle/clear-reward',env:f.env,deps:f.deps,request:new Request('https://qa.test/api/seal-battle/clear-reward',{method:'POST',body:JSON.stringify(body)})});
    assert.equal((await claim({eventId:blocked.id})).status,403);
    assert.equal((await claim({})).status,200);
    assert.equal(f.db.prepare('SELECT event_id FROM seal_battle_clear_claims').get().event_id,old);
    assert.equal((await f.api.statusPayload(f.env,f.deps,f.user)).pendingClearReward,null);
  }finally{f.db.close()}
});

test('CMS 횟수 검증·권한·구형 저장 호환성과 회차 스냅샷을 보존한다',async()=>{
  const f=await fixture({minRewardAttempts:25});
  try{
    const save=settings=>f.api.handleSealBattle({path:'admin/seal-battle/settings',env:f.env,deps:f.deps,request:new Request('https://qa.test/api/admin/seal-battle/settings',{method:'PATCH',body:JSON.stringify({settings})})});
    for(const minRewardAttempts of [0,-1,1.5,null,'x',1000001])assert.equal((await save({minRewardAttempts})).status,400);
    assert.equal((await save({minRewardAttempts:30,clearReward:{coin:10_000_000_000,shards:11}})).status,200);
    assert.equal((await save({title:'구형 CMS 저장'})).body.settings.minRewardAttempts,30);
    assert.equal(f.db.prepare('SELECT min_reward_attempts FROM seal_battle_events').get().min_reward_attempts,25);
    const next=await f.api.adminStart(f.env,await f.api.loadSettings(f.env),{id:1});
    assert.equal(next.minRewardAttempts,30);assert.equal(next.clearReward.coin,10_000_000_000);
    f.deps.requirePermission=async()=>f.user;
    assert.equal((await save({minRewardAttempts:1})).status,403);
    assert.equal((await f.api.loadSettings(f.env)).minRewardAttempts,30);
    assert.match(admin,/sealMinRewardAttempts/);assert.match(admin,/100억/);
    assert.match(read('admin/index.html'),/seal-battle-admin\.js\?[^"\s]*minAttempts=25-20260922/);
  }finally{f.db.close()}
});

test('실패 회차는 완료 보상을 지급하지 않고 순위 보상도 25회·실패 지급 설정을 함께 확인한다',async()=>{
  const f=await fixture({minRewardAttempts:25});
  try{
    f.db.prepare("INSERT INTO seal_battle_user_progress(event_id,user_id,day_key,total_attempts) VALUES(?,2,'2026-09-22',24)").run(f.event.id);
    const event={...f.event,status:'FAILED'};
    assert.equal((await f.api.claimClearReward(f.env,f.deps,f.user,event)).status,409);
    assert.equal((await f.api.claimRankReward(f.env,f.deps,f.user,event)).status,403);
    f.db.exec('UPDATE seal_battle_user_progress SET total_attempts=25');
    assert.equal((await f.api.claimRankReward(f.env,f.deps,f.user,{...event,rankRewards:{...event.rankRewards,rewardOnFailure:false}})).status,409);
    assert.equal((await f.api.claimRankReward(f.env,f.deps,f.user,event)).status,200);
    assert.equal(f.db.prepare('SELECT COUNT(*) n FROM seal_battle_clear_claims').get().n,0);
  }finally{f.db.close()}
});

test('구형 초기화 마커가 있어도 최소 횟수 컬럼을 추가하며 기존 회차·운영 설정은 덮어쓰지 않는다',async()=>{
  const f=await fixture({minRewardAttempts:25});
  try{
    f.db.exec("DELETE FROM app_meta WHERE key='seal_reward_attempts_schema_20260922_v1'; ALTER TABLE seal_battle_events DROP COLUMN min_reward_attempts;");
    const before=f.db.prepare("SELECT value FROM app_meta WHERE key='seal_battle_settings_v1'").get().value;
    await createModule().ensureFoundation(f.env,f.deps);
    assert.equal(f.db.prepare('SELECT min_reward_attempts FROM seal_battle_events').get().min_reward_attempts,1);
    assert.equal(f.db.prepare("SELECT value FROM app_meta WHERE key='seal_battle_settings_v1'").get().value,before);
    assert.equal(f.db.prepare("SELECT value FROM app_meta WHERE key='seal_reward_attempts_schema_20260922_v1'").get().value,'1');
  }finally{f.db.close()}
});

test('PostgreSQL 실제 어댑터: 독립 DDL 게이트, 24회 거부·25회 100억 지급·중복 방지',async()=>{
  const f=await fixture({minRewardAttempts:25,targets:{attack:10_000_000_000,guard:20_000_000_000,purify:30_000_000_000}}),pg=new PGlite();
  try{
    const schema=f.db.prepare("SELECT sql FROM sqlite_master WHERE type='table' AND name<>'sqlite_sequence'").all();
    await pg.exec(read('scripts/postgres-runtime-compat.sql'));
    await pg.exec("CREATE FUNCTION sqlite_now() RETURNS text LANGUAGE SQL STABLE AS $$SELECT to_char(timezone('UTC',CURRENT_TIMESTAMP),'YYYY-MM-DD HH24:MI:SS')$$;");
    for(const {sql} of schema)await pg.exec(sql.replace(/INTEGER PRIMARY KEY AUTOINCREMENT/g,'BIGSERIAL PRIMARY KEY').replace(/id INTEGER PRIMARY KEY,/g,'id BIGSERIAL PRIMARY KEY,').replace(/\bINTEGER\b/g,'BIGINT').replace(/CURRENT_TIMESTAMP/g,'sqlite_now()'));
    await pg.exec('ALTER TABLE seal_battle_events DROP COLUMN min_reward_attempts');
    const client={async query(input){const r=await pg.query(typeof input==='string'?input:input.text,typeof input==='string'?[]:input.values||[]);return {...r,rowCount:r.affectedRows??r.rows.length};}};
    const env={DB:new __postgresCompatTest.PostgresD1Database(client)},api=createModule();
    await api.ensureRewardAttemptsSchema(env,f.deps);await api.ensureRewardAttemptsSchema(env,f.deps);
    const event=await api.adminStart(env,f.settings,{id:1});assert.equal(event.minRewardAttempts,25);
    assert.deepEqual(Object.values(event.roles).map(role=>role.target),[10_000_000_000,20_000_000_000,30_000_000_000]);
    await api.saveSettings(env,f.settings);
    assert.deepEqual((await api.loadSettings(env)).targets,f.settings.targets,'PostgreSQL settings retain large health');
    await pg.exec("INSERT INTO users(id,nickname,coin) VALUES(2,'QA',1000)");
    await pg.query("INSERT INTO seal_battle_user_progress(event_id,user_id,day_key,total_attempts) VALUES($1,2,'2026-09-22',24)",[event.id]);
    await pg.query("UPDATE seal_battle_events SET status='CLEARED' WHERE id=$1",[event.id]);event.status='CLEARED';
    assert.equal((await api.claimClearReward(env,f.deps,f.user,event)).status,403);
    await pg.exec('UPDATE seal_battle_user_progress SET total_attempts=25');
    assert.equal((await api.claimClearReward(env,f.deps,f.user,event)).status,200);
    assert.equal((await api.claimClearReward(env,f.deps,f.user,event)).status,409);
    assert.equal(Number((await pg.query('SELECT coin FROM users WHERE id=2')).rows[0].coin),10_000_001_000);
    assert.equal(Number((await pg.query('SELECT change_amount FROM coin_logs')).rows[0].change_amount),10_000_000_000);
    assert.equal((await api.statusPayload(env,f.deps,f.user)).clearReward.claimed,true);
  }finally{f.db.close();await pg.close()}
});

test('봉인 체력 20억 상한 해제: CMS API 저장·재조회·회차 스냅샷·실제 진행과 클리어',async()=>{
  const f=await fixture();
  try{
    for(const health of [2_000_000_001,10_000_000_000,1_000_000_000_000,Number.MAX_SAFE_INTEGER]){
      const targets={attack:health,guard:health,purify:health};
      const saved=await f.api.handleSealBattle({path:'admin/seal-battle/settings',env:f.env,deps:f.deps,
        request:new Request('https://example.test/api/admin/seal-battle/settings',{method:'PATCH',body:JSON.stringify({settings:{targets}})})});
      assert.equal(saved.status,200);assert.deepEqual(saved.body.settings.targets,targets);
      assert.deepEqual((await f.api.loadSettings(f.env)).targets,targets);
    }
    const targets={attack:10_000_000_000,guard:20_000_000_000,purify:30_000_000_000};
    const settings={...f.settings,targets},event=await f.api.adminStart(f.env,settings,{id:1});
    assert.deepEqual(Object.values(event.roles).map(role=>role.target),Object.values(targets));
    assert.equal(f.db.prepare('SELECT attack_target FROM seal_battle_events WHERE id=?').get(f.event.id).attack_target,2_000_000_000,'previous round unchanged');
    f.db.prepare('UPDATE seal_battle_events SET attack_progress=1999999999 WHERE id=?').run(event.id);
    const crossing=await f.api.participate(f.env,f.deps,f.user,settings,event,{requestId:'seal-large-health-crossing-0001',role:'ATTACK'});
    assert.equal(crossing.status,200);
    assert.ok(crossing.body.state.event.roles.ATTACK.progress>2_000_000_000);
    assert.equal(crossing.body.state.event.roles.ATTACK.completed,false);
    assert.equal(crossing.body.state.event.status,'ACTIVE');
    f.db.prepare('UPDATE seal_battle_events SET attack_progress=attack_target-1,guard_progress=guard_target-1,purify_progress=purify_target-1 WHERE id=?').run(event.id);
    for(const role of ['ATTACK','GUARD','PURIFY']){
      const next=f.api.normalizeEvent(f.db.prepare('SELECT * FROM seal_battle_events WHERE id=?').get(event.id));
      const result=await f.api.participate(f.env,f.deps,f.user,settings,next,{requestId:'seal-large-health-complete-'+role,role});
      assert.equal(result.status,200);assert.equal(result.body.state.event.roles[role].progress,targets[role.toLowerCase()]);
      assert.equal(result.body.state.event.status,role==='PURIFY'?'CLEARED':'ACTIVE');
    }
    const validateStart=admin.indexOf('  function validate('),validateEnd=admin.indexOf('  async function saveSettings(',validateStart);
    const validate=Function(admin.slice(validateStart,validateEnd)+';return validate;')();
    assert.equal(validate({...settings,rankRewards:{enabled:false}}),'');
    for(const invalid of [0,-1,1.5,NaN,Infinity,Number.MAX_SAFE_INTEGER+1]){
      assert.match(validate({...settings,targets:{...targets,attack:invalid}}),/봉인 체력/);
      await assert.rejects(f.api.saveSettings(f.env,{...settings,targets:{...targets,attack:invalid}}),/봉인 체력/);
    }
  }finally{f.db.close()}
});

test('코인은 음수·잘못된 수·정밀도 초과만 안전하게 정리하고 다른 보상 한도는 유지한다',()=>{
  for(const [input,expected] of [[-1,0],[1.9,1],['5000000000',5_000_000_000],[Number.MAX_VALUE,Number.MAX_SAFE_INTEGER]]){
    const s=mod.cleanSettings({attemptReward:{coin:input},clearReward:{coin:input},rankRewards:{tiers:[{coin:input}]}});
    assert.equal(s.attemptReward.coin,expected);assert.equal(s.clearReward.coin,expected);assert.equal(s.rankRewards.tiers[0].coin,expected);
  }
  const s=mod.cleanSettings({attemptReward:{coin:NaN,shards:5_000_000},clearReward:{coin:Infinity,shards:5_000_000},rankRewards:{tiers:[{coin:'invalid',premiumCube:5_000_000,equipmentBox:5_000_000}]}});
  assert.equal(s.attemptReward.coin,100);assert.equal(s.clearReward.coin,2000);assert.equal(s.rankRewards.tiers[0].coin,0);
  assert.equal(s.attemptReward.shards,1_000_000);assert.equal(s.clearReward.shards,1_000_000);
  assert.equal(s.rankRewards.tiers[0].premiumCube,1_000_000);assert.equal(s.rankRewards.tiers[0].equipmentBox,1_000_000);
});

test('CMS API 저장·재조회와 새 회차 스냅샷에 큰 금액을 그대로 보존한다',async()=>{
  const f=await fixture();
  try{
    const next={...f.settings,attemptReward:{coin:8_000_000_000,shards:7},clearReward:{...f.settings.clearReward,coin:15_000_000_000,shards:11}};
    const saved=await f.api.handleSealBattle({path:'admin/seal-battle/settings',env:f.env,deps:f.deps,request:new Request('https://example.test/api/admin/seal-battle/settings',{method:'PATCH',body:JSON.stringify({settings:next})})});
    assert.equal(saved.status,200);assert.deepEqual(saved.body.settings,next);
    assert.deepEqual(await f.api.loadSettings(f.env),next);
    const old=f.db.prepare('SELECT * FROM seal_battle_events WHERE id=?').get(f.event.id);
    assert.equal(old.attempt_coin,5_000_000_000);assert.equal(old.clear_coin,10_000_000_000);
    const created=await f.api.adminStart(f.env,next,{id:1});
    assert.equal(created.attemptReward.coin,8_000_000_000);assert.equal(created.clearReward.coin,15_000_000_000);
    assert.equal(created.rankRewards.tiers[0].coin,12_500_000_000);
  }finally{f.db.close()}
});

test('큰 참여·완료·순위 보상은 지갑·로그·영수증에 일치하며 재시도는 중복 지급하지 않는다',async()=>{
  const f=await fixture();
  try{
    const request={requestId:'seal-reward-coin-v2069-0001',role:'ATTACK'};
    const attempt=await f.api.participate(f.env,f.deps,f.user,f.settings,f.event,request);
    assert.equal(attempt.status,200);assert.equal(attempt.body.reward.coin,5_000_000_000);
    assert.equal((await f.api.participate(f.env,f.deps,f.user,f.settings,f.event,request)).body.replayed,true);
    f.db.prepare("UPDATE seal_battle_events SET status='CLEARED' WHERE id=?").run(f.event.id);
    const event=f.api.normalizeEvent(f.db.prepare('SELECT * FROM seal_battle_events WHERE id=?').get(f.event.id));
    const clear=await f.api.claimClearReward(f.env,f.deps,f.user,event);
    assert.equal(clear.status,200);assert.equal(clear.body.reward.coin,10_000_000_000);
    assert.equal((await f.api.claimClearReward(f.env,f.deps,f.user,event)).status,409);
    const rank=await f.api.claimRankReward(f.env,f.deps,f.user,event);
    assert.equal(rank.status,200);assert.equal(rank.body.reward.coin,12_500_000_000);
    assert.equal((await f.api.claimRankReward(f.env,f.deps,f.user,event)).status,409);
    assert.equal(f.db.prepare('SELECT coin FROM users WHERE id=2').get().coin,27_500_001_000);
    assert.deepEqual(f.db.prepare('SELECT change_amount FROM coin_logs ORDER BY id').all().map(x=>x.change_amount),[5_000_000_000,10_000_000_000,12_500_000_000]);
    const claim=f.db.prepare('SELECT * FROM seal_battle_clear_claims').get();assert.equal(claim.reward_coin,10_000_000_000);assert.equal(claim.status,'COMPLETED');
    const rankClaim=f.db.prepare('SELECT * FROM seal_battle_rank_claims').get();assert.equal(JSON.parse(rankClaim.reward_json).coin,12_500_000_000);assert.equal(rankClaim.status,'COMPLETED');
    assert.equal(f.db.prepare('SELECT quantity FROM cnine_user_inventory WHERE item_code=?').get('PREMIUM_CUBE').quantity,5);
    assert.equal(f.db.prepare('SELECT quantity FROM cnine_user_inventory WHERE item_code=?').get('EQUIPMENT_SUPPLY_BOX').quantity,2);
  }finally{f.db.close()}
});

test('큰 완료 보상 지급 실패는 코인·로그를 롤백하고 다음 시도에서 한 번만 지급한다',async t=>{
  const errors=t.mock.method(console,'error',()=>{});
  const f=await fixture();
  try{
    f.db.prepare("INSERT INTO seal_battle_user_progress(event_id,user_id,day_key,total_attempts) VALUES(?,2,'2026-09-08',1)").run(f.event.id);
    f.db.prepare("UPDATE seal_battle_events SET status='CLEARED' WHERE id=?").run(f.event.id);
    const event=f.api.normalizeEvent(f.db.prepare('SELECT * FROM seal_battle_events').get());
    f.setFailure(/INSERT INTO coin_logs/);
    assert.equal((await f.api.claimClearReward(f.env,f.deps,f.user,event)).status,500);
    assert.equal(errors.mock.callCount(),1);
    assert.equal(f.db.prepare('SELECT coin FROM users WHERE id=2').get().coin,1000);
    assert.equal(f.db.prepare('SELECT COUNT(*) n FROM coin_logs').get().n,0);
    assert.equal(f.db.prepare('SELECT status FROM seal_battle_clear_claims').get().status,'PENDING');
    f.setFailure(null);
    assert.equal((await f.api.claimClearReward(f.env,f.deps,f.user,event)).status,200);
    assert.equal((await f.api.claimClearReward(f.env,f.deps,f.user,event)).status,409);
    assert.equal(f.db.prepare('SELECT coin FROM users WHERE id=2').get().coin,10_000_001_000);
    assert.equal(f.db.prepare('SELECT COUNT(*) n FROM coin_logs').get().n,1);
  }finally{f.db.close()}
});

test('CMS 참여·완료·순위 코인 입력만 max가 없고 안전 정수 검증·캐시·배포 게이트가 연결된다',()=>{
  for(const id of ['sealAttemptCoin','sealClearCoin']){
    const input=admin.match(new RegExp('<input id="'+id+'"[^>]*>'))?.[0];
    assert.ok(input);assert.match(input,/step="1"/);assert.doesNotMatch(input,/\bmax=/);
  }
  const start=admin.indexOf('  function rankTierCard('),end=admin.indexOf('  function renderRankTiers(',start);
  const render=Function(admin.slice(start,end)+';return rankTierCard;')();
  const html=render({startRank:1,endRank:1,coin:5_000_000_000,premiumCube:5,equipmentBox:2});
  const coin=html.match(/<input[^>]*data-rank-reward-quantity="coin"[^>]*>/)?.[0];
  assert.ok(coin);assert.doesNotMatch(coin,/\bmax=/);assert.match(coin,/value="5000000000"/);
  assert.match(html,/<input[^>]*data-rank-reward-quantity="premiumCube"[^>]*max="1000000000"/);
  assert.match(html,/코인 · 한도 없음/);
  const validateStart=admin.indexOf('  function validate('),validateEnd=admin.indexOf('  async function saveSettings(',validateStart);
  const validate=Function(admin.slice(validateStart,validateEnd)+';return validate;')();
  const cfg=configured();
  cfg.rankRewards.tiers=cfg.rankRewards.tiers.map(tier=>({...tier,normalCube:0,advancedCube:0}));
  assert.equal(validate(cfg),'');
  for(const value of [-1,NaN,Infinity,Number.MAX_SAFE_INTEGER+1]){
    assert.match(validate({...cfg,attemptReward:{coin:value}}),/코인 보상/);
    assert.match(validate({...cfg,clearReward:{coin:value}}),/코인 보상/);
    assert.match(validate({...cfg,rankRewards:{...cfg.rankRewards,tiers:[{...cfg.rankRewards.tiers[0],coin:value}]}}),/코인 보상/);
  }
  assert.match(read('admin/index.html'),/seal-battle-admin\.js\?v=2069-coin-unlimited/);
  const scripts=JSON.parse(read('package.json')).scripts;
  assert.match(scripts['test:seal'],/seal-reward-coin-cap-v2069\.test\.mjs/);
  assert.match(scripts['release:gate'],/npm run test:seal/);
});
