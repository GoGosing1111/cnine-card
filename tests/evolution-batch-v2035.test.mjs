import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {DatabaseSync} from 'node:sqlite';
import {handleEvolution} from '../functions/_evolution.js';
import {validateEvolutionBatch} from '../functions/_evolution_batch.js';
import {__postgresCompatTest} from '../functions/_postgres_d1_compat.js';

class Statement{
  constructor(owner,sql,args=[]){Object.assign(this,{owner,sql,args})}
  bind(...args){return new Statement(this.owner,this.sql,args)}
  first(){return this.owner.db.prepare(this.sql).get(...this.args)||null}
  all(){return {results:this.owner.db.prepare(this.sql).all(...this.args)}}
  run(){const q=this.owner.db.prepare(this.sql);if(q.columns().length)return this.all();return {meta:{changes:Number(q.run(...this.args).changes)}}}
}
class DB{
  constructor(db){this.db=db;this.statements=[];this.beforeWrite=null}
  prepare(sql){return new Statement(this,sql)}
  batch(statements){
    if(statements.some(s=>s.sql.startsWith('INSERT INTO card_evolution_batch_receipts'))){this.statements=statements;const hook=this.beforeWrite;this.beforeWrite=null;hook?.()}
    this.db.exec('BEGIN IMMEDIATE');try{const result=statements.map(s=>s.run());this.db.exec('COMMIT');return result}catch(error){this.db.exec('ROLLBACK');throw error}
  }
}
function fixture(){
  const db=new DatabaseSync(':memory:');
  db.exec(`
    CREATE TABLE app_meta(key TEXT PRIMARY KEY,value TEXT,updated_at TEXT);
    CREATE TABLE members(id INTEGER PRIMARY KEY,name TEXT,is_active INTEGER,sort_order INTEGER);
    CREATE TABLE cards(id TEXT PRIMARY KEY,member_id INTEGER,title TEXT,rarity TEXT,is_active INTEGER,card_status TEXT,limited_total INTEGER,image_url TEXT,focus_x INTEGER,focus_y INTEGER,power_type TEXT,base_power INTEGER);
    CREATE VIEW cards_effective_v1210 AS SELECT * FROM cards;
    CREATE TABLE users(id INTEGER PRIMARY KEY,coin INTEGER,card_shards INTEGER);
    CREATE TABLE user_cards(user_id INTEGER,card_id TEXT,quantity INTEGER,breakthrough_level INTEGER DEFAULT 0,first_obtained_at TEXT,last_obtained_at TEXT,PRIMARY KEY(user_id,card_id));
    CREATE TABLE cnine_user_inventory(user_id INTEGER,item_code TEXT,quantity INTEGER,unseen_quantity INTEGER DEFAULT 0,created_at TEXT,updated_at TEXT,PRIMARY KEY(user_id,item_code));
    CREATE TABLE card_evolution_progress(user_id INTEGER,source_card_id TEXT,failed_attempts INTEGER DEFAULT 0,total_attempts INTEGER DEFAULT 0,is_success INTEGER DEFAULT 0,reward_card_id TEXT,completed_at TEXT,updated_at TEXT,PRIMARY KEY(user_id,source_card_id));
    CREATE TABLE card_evolution_atomic_guard(guard_id TEXT PRIMARY KEY,verified INTEGER CHECK(verified=1));
    CREATE TABLE card_evolution_logs(id INTEGER PRIMARY KEY AUTOINCREMENT,user_id INTEGER,source_card_id TEXT,attempt_no INTEGER,coin_cost INTEGER,shard_cost INTEGER,success_rate REAL,is_pity INTEGER,is_success INTEGER,reward_card_id TEXT,reward_duplicate INTEGER,reward_shards INTEGER,evolution_type TEXT,master_star_cost INTEGER,request_id TEXT UNIQUE,source_consumed INTEGER,source_quantity_before INTEGER,source_quantity_after INTEGER,created_at TEXT DEFAULT CURRENT_TIMESTAMP);
    CREATE TABLE pve_decks(user_id INTEGER PRIMARY KEY,card_ids TEXT,updated_at TEXT);
    CREATE TABLE pvp_decks(user_id INTEGER PRIMARY KEY,card_ids TEXT,updated_at TEXT);
    CREATE TABLE pvp_deck_presets(user_id INTEGER,preset_no INTEGER,card_ids TEXT,updated_at TEXT,PRIMARY KEY(user_id,preset_no));
    CREATE TABLE coin_logs(user_id INTEGER,change_amount INTEGER,balance_after INTEGER,reason TEXT);
    CREATE TABLE shard_logs(user_id INTEGER,change_amount INTEGER,balance_after INTEGER,reason TEXT,card_id TEXT);
    CREATE TABLE inventory_logs(user_id INTEGER,item_code TEXT,change_amount INTEGER,balance_after INTEGER,reason TEXT,reference_type TEXT,reference_id TEXT);
    INSERT INTO app_meta VALUES('safe_runtime_upgrade_v1703_evolution_source_consumption','1',CURRENT_TIMESTAMP);
    INSERT INTO app_meta VALUES('safe_runtime_upgrade_v1718_zenith_evolution_pity','1',CURRENT_TIMESTAMP);
    INSERT INTO app_meta VALUES('card_evolution_settings_v1','{"successRate":0,"pityAttempts":2}',CURRENT_TIMESTAMP);
    INSERT INTO app_meta VALUES('card_evolution_settings_v2','{"maToPrestigeSuccessRate":0,"maToPrestigePityAttempts":2}',CURRENT_TIMESTAMP);
    INSERT INTO users VALUES(1,2000000000,10000000);
    INSERT INTO cnine_user_inventory VALUES(1,'MASTER_STAR',3000,3000,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP);
    INSERT INTO members VALUES(1,'테스트',1,1);
  `);
  const add=(id,grade,qty=0,level=0)=>{db.prepare('INSERT INTO cards VALUES(?,1,?,?,1,\'PUBLIC\',NULL,\'assets/NEWCARD/1.jpg\',50,50,\'ATTACK\',10000)').run(id,id,grade);if(qty)db.prepare('INSERT INTO user_cards(user_id,card_id,quantity,breakthrough_level) VALUES(1,?,?,?)').run(id,qty,level)};
  add('ssr-a','SSR',7,10);add('ssr-b','SSR',3,10);add('ssr-low','SSR',1,9);
  add('ma-a','MA',2,13);add('ma-b','MA',2,13);
  add('limited-a','LIMITED',5,13);add('limited-b','LIMITED',1,13);
  add('prestige-a','PRESTIGE');add('prestige-b','PRESTIGE');add('zenith-a','ZENITH');
  const env={DB:new DB(db)},deps={authenticate:async()=>({id:1}),json:(body,status=200)=>({body,status}),readBody:async request=>request.body,shardReward:{MA:120}};
  const call=(body,request={})=>handleEvolution({path:'evolution/batch',request:{method:'POST',body,...request},env,deps});
  const plan=(type='SSR_TO_MA',ids=['ssr-a','ssr-b'],n=5)=>({requestId:crypto.randomUUID(),evolutionType:type,cardIds:ids,attemptsPerCard:n});
  return {db,env,deps,call,plan,add};
}

test('MA multi-card attempts stop on success, preserve pity, consume whole stack and grant duplicate bonuses',async()=>{
  const f=fixture(),response=await f.call(f.plan());assert.equal(response.status,200);
  assert.equal(response.body.attemptCount,4);assert.equal(response.body.successCount,2);
  assert.deepEqual(response.body.spent,{coin:200000,shards:6000,stars:0});
  assert.deepEqual(response.body.bonus,{shards:240,stars:2}); // both MA result cards are already owned
  for(const id of ['ssr-a','ssr-b'])assert.deepEqual({...f.db.prepare('SELECT quantity,breakthrough_level FROM user_cards WHERE card_id=?').get(id)},{quantity:0,breakthrough_level:0});
  assert.equal(f.db.prepare('SELECT COUNT(*) n FROM card_evolution_logs').get().n,4);
  assert.equal(f.db.prepare('SELECT COUNT(*) n FROM card_evolution_atomic_guard').get().n,0);
  assert.ok(f.env.DB.statements.every(s=>s.args.length<=100),'bounded SQL parameters');
});
test('retry after response loss returns identical receipt without spending or drawing twice',async()=>{
  const f=fixture(),plan=f.plan(),first=await f.call(plan),wallet=f.db.prepare('SELECT * FROM users').get();
  const again=await f.call(plan);assert.equal(again.body.replayed,true);delete again.body.replayed;
  assert.deepEqual(again.body,first.body);assert.deepEqual(f.db.prepare('SELECT * FROM users').get(),wallet);
  assert.equal(f.db.prepare('SELECT COUNT(*) n FROM card_evolution_logs').get().n,4);
  assert.equal((await f.call({...plan,attemptsPerCard:1})).body.code,'EVOLUTION_REQUEST_MISMATCH');
  f.deps.authenticate=async()=>({id:2});assert.equal((await f.call(plan)).body.code,'EVOLUTION_REQUEST_MISMATCH');
});
test('PRESTIGE eliminates owned/newly drawn results and stops without charging when pool is exhausted',async()=>{
  const f=fixture();f.db.exec("UPDATE cards SET is_active=0 WHERE id='prestige-b'");
  const result=await f.call(f.plan('MA_TO_PRESTIGE',['ma-a','ma-b'],5));assert.equal(result.status,200);
  assert.equal(result.body.attemptCount,2);assert.equal(result.body.successCount,1);assert.equal(result.body.spent.stars,2);
  assert.equal(result.body.results[1].attempts.length,0);assert.match(result.body.results[1].stoppedReason,/모두 획득/);
  assert.equal(f.db.prepare("SELECT quantity FROM user_cards WHERE card_id='ma-b'").get().quantity,2);
});
test('ZENITH keeps 25%, seven-attempt guarantee, cost and all-source consumption',async()=>{
  const f=fixture();f.db.exec("INSERT INTO card_evolution_progress(user_id,source_card_id,failed_attempts,total_attempts) VALUES(1,'limited-a',6,6)");
  const result=await f.call(f.plan('LIMITED_TO_ZENITH',['limited-a'],10));assert.equal(result.status,200);
  assert.equal(result.body.attemptCount,1);assert.equal(result.body.successCount,1);assert.equal(result.body.successRate,25);
  assert.deepEqual(result.body.spent,{coin:5000000,shards:0,stars:30});
  assert.equal(result.body.results[0].attempts[0].isPity,true);assert.equal(result.body.results[0].attempts[0].attemptNo,7);
  assert.equal(f.db.prepare("SELECT quantity FROM user_cards WHERE card_id='limited-a'").get().quantity,0);
});
test('failed attempts remain on the source and continue after a fresh request',async()=>{
  const f=fixture(),first=await f.call(f.plan('SSR_TO_MA',['ssr-a'],1));assert.equal(first.body.successCount,0);
  assert.equal(f.db.prepare("SELECT quantity FROM user_cards WHERE card_id='ssr-a'").get().quantity,7);
  const second=await f.call(f.plan('SSR_TO_MA',['ssr-a'],1));assert.equal(second.body.attemptCount,1);assert.equal(second.body.results[0].attempts[0].isPity,true);
});
test('a reacquired source resets historical success counters without changing previous receipts',async()=>{
  const f=fixture();f.db.exec("INSERT INTO card_evolution_progress(user_id,source_card_id,failed_attempts,total_attempts,is_success) VALUES(1,'ssr-a',0,45,1)");
  const result=await f.call(f.plan('SSR_TO_MA',['ssr-a'],1));assert.equal(result.body.results[0].progress.totalAttempts,1);assert.equal(result.body.successCount,0);
});
test('invalid cards, insufficient maximum materials and deck presets cause no debit',async()=>{
  const f=fixture(),balance=f.db.prepare('SELECT * FROM users').get();
  assert.equal((await f.call(f.plan('SSR_TO_MA',['ssr-low'],1))).status,409);
  f.db.exec("INSERT INTO pvp_deck_presets(user_id,preset_no,card_ids) VALUES(1,2,'[\"limited-a\"]')");
  assert.equal((await f.call(f.plan('LIMITED_TO_ZENITH',['limited-a'],1))).status,409);
  f.db.exec('UPDATE users SET coin=49999');
  assert.equal((await f.call(f.plan('SSR_TO_MA',['ssr-a'],1))).body.code,'EVOLUTION_MATERIAL_SHORTAGE');
  assert.equal(f.db.prepare('SELECT coin FROM users').get().coin,49999);assert.equal(f.db.prepare('SELECT card_shards FROM users').get().card_shards,balance.card_shards);
  assert.equal(f.db.prepare('SELECT COUNT(*) n FROM card_evolution_logs').get().n,0);
});
test('log failure rolls back source, rewards, pity, wallet AND receipt',async()=>{
  const f=fixture(),plan=f.plan(),wallet=f.db.prepare('SELECT * FROM users').get();
  f.db.exec("CREATE TRIGGER fail_log BEFORE INSERT ON card_evolution_logs BEGIN SELECT RAISE(ABORT,'test-log-write-failed'); END");
  await assert.rejects(()=>f.call(plan),/test-log-write-failed/);
  assert.deepEqual(f.db.prepare('SELECT * FROM users').get(),wallet);
  assert.equal(f.db.prepare("SELECT quantity FROM user_cards WHERE card_id='ssr-a'").get().quantity,7);
  assert.equal(f.db.prepare('SELECT COUNT(*) n FROM card_evolution_batch_receipts_v2035').get().n,0);
  assert.equal(f.db.prepare('SELECT COUNT(*) n FROM card_evolution_progress').get().n,0);
  f.db.exec('DROP TRIGGER fail_log');assert.equal((await f.call(plan)).status,200);
});
for(const [name,sql] of [
  ['wallet',"UPDATE users SET coin=coin-1"],
  ['source',"UPDATE user_cards SET quantity=quantity+1 WHERE card_id='ssr-a'"],
  ['pity',"INSERT INTO card_evolution_progress(user_id,source_card_id,failed_attempts,total_attempts) VALUES(1,'ssr-a',1,1)"],
  ['reward',"UPDATE user_cards SET quantity=quantity+1 WHERE card_id IN ('ma-a','ma-b')"],
])test(`concurrent ${name} change aborts entire stale batch`,async()=>{
  const f=fixture();f.env.DB.beforeWrite=()=>f.db.exec(sql);
  const result=await f.call(f.plan());assert.equal(result.body.code,'EVOLUTION_STATE_CHANGED');
  assert.equal(f.db.prepare('SELECT COUNT(*) n FROM card_evolution_logs').get().n,0);
});
test('concurrent deck change is rechecked inside the transaction',async()=>{
  const f=fixture();f.env.DB.beforeWrite=()=>f.db.exec("INSERT INTO pve_decks(user_id,card_ids) VALUES(1,'[\"limited-a\"]')");
  const result=await f.call(f.plan('LIMITED_TO_ZENITH',['limited-a'],1));assert.equal(result.body.code,'EVOLUTION_STATE_CHANGED');
});
test('two simultaneous duplicate submissions produce exactly one batch',async()=>{
  const f=fixture(),plan=f.plan();const responses=await Promise.all([f.call(plan),f.call(plan)]);
  assert.ok(responses.every(r=>r.status===200));assert.equal(f.db.prepare('SELECT COUNT(*) n FROM card_evolution_logs').get().n,4);
});
test('validation rejects unknown types, duplicate IDs and oversized plans',()=>{
  const f=fixture(),base=f.plan();
  for(const patch of [{evolutionType:'SUPERSTAR'},{cardIds:['ssr-a','ssr-a']},{cardIds:[]},{cardIds:Array.from({length:21},(_,i)=>String(i))},{attemptsPerCard:0},{attemptsPerCard:1.5},{attemptsPerCard:11},{requestId:'x'}])assert.throws(()=>validateEvolutionBatch({...base,...patch}));
});
test('maximum 20 sources x 10 attempts is bounded and audited, including zero successes',async()=>{
  const f=fixture();f.db.exec("UPDATE app_meta SET value='{\"successRate\":0,\"pityAttempts\":100}' WHERE key='card_evolution_settings_v1'");
  const ids=Array.from({length:20},(_,i)=>`batch-source-${i}`);ids.forEach(id=>f.add(id,'SSR',2,10));
  const result=await f.call(f.plan('SSR_TO_MA',ids,10));assert.equal(result.status,200);assert.equal(result.body.attemptCount,200);assert.equal(result.body.successCount,0);
  assert.equal(f.db.prepare('SELECT COUNT(*) n FROM card_evolution_logs').get().n,200);
  assert.ok(f.env.DB.statements.length<150);assert.ok(f.env.DB.statements.every(s=>s.args.length<=100));
});
test('CMS policy changes after confirmation are rejected without consuming materials',async()=>{
  const f=fixture();const result=await f.call({...f.plan(),expectedPolicy:{coinCost:50000,shardCost:1500,masterStarCost:0,successRate:99,pityAttempts:2}});
  assert.equal(result.body.code,'EVOLUTION_POLICY_CHANGED');assert.equal(f.db.prepare('SELECT COUNT(*) n FROM card_evolution_logs').get().n,0);
});
test('feature OFF blocks a new batch but a committed receipt remains readable',async()=>{
  const f=fixture(),plan=f.plan();await f.call(plan);
  f.db.exec("UPDATE app_meta SET value='{\"enabled\":false}' WHERE key='card_evolution_settings_v1'");
  assert.equal((await f.call(f.plan())).status,503);assert.equal((await f.call(plan)).body.replayed,true);
});
test('batch SQL is accepted by the production PostgreSQL translator',async()=>{
  const f=fixture();await f.call(f.plan('MA_TO_PRESTIGE',['ma-a','ma-b'],5));
  for(const s of f.env.DB.statements){const sql=__postgresCompatTest.translateDialect(s.sql);assert.equal(__postgresCompatTest.bindQuestionMarks(sql).count,s.args.length);assert.doesNotMatch(sql,/\bjson_each\(/)}
});
test('UI uses actual batch endpoint, scoped styles, persistent request ID and simple three tabs',()=>{
  const client=fs.readFileSync(new URL('../js/evolution.js',import.meta.url),'utf8');
  assert.match(client,/apiRequest\('evolution\/batch'/);assert.match(client,/localStorage\.setItem\(storageKey\(\)/);
  assert.match(client,/중복 보유분 전체/);assert.match(client,/MA 진화/);assert.match(client,/프레스티지 진화/);assert.match(client,/제니스 진화/);
  assert.doesNotMatch(client,/evolution-process-grid/);assert.match(client,/aria-modal="true"/);assert.match(client,/aria-pressed/);
});
