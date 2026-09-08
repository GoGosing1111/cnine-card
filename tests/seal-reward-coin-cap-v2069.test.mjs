import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {DatabaseSync} from 'node:sqlite';
import test from 'node:test';

const read = path => readFileSync(new URL('../'+path,import.meta.url),'utf8');
const server = read('functions/_seal_battle.js');
const admin = read('admin/seal-battle-admin.js');
const copy = value => JSON.parse(JSON.stringify(value));
const createModule = () => Function(server.replace(/^export /gm,'')+`;return {
  cleanSettings,normalizeEvent,saveSettings,loadSettings,adminStart,ensureFoundation,
  participate,claimClearReward,claimRankReward,handleSealBattle,SEAL_COIN_REWARD_MAX
};`)();
const mod = createModule();
const configured = () => mod.cleanSettings({
  mode:'ON', title:'보상 검증', bossName:'테스트 봉인',
  targets:{attack:2_000_000_000,guard:2_000_000_000,purify:2_000_000_000},
  attemptReward:{coin:5_000_000_000,shards:7},
  clearReward:{coin:10_000_000_000,shards:11},
  rankRewards:{enabled:true,rewardOnFailure:true,tiers:[{startRank:1,endRank:1,coin:12_500_000_000,premiumCube:5,equipmentBox:2}]}
});

async function fixture(){
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
  const settings=configured();await api.saveSettings(env,settings);
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
    const next={...f.settings,attemptReward:{coin:8_000_000_000,shards:7},clearReward:{coin:15_000_000_000,shards:11}};
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
