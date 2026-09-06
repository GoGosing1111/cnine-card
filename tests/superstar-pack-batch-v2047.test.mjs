import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync} from 'node:fs';
import {handleSuperstarPackDraw,superstarPackSettings,ensureSuperstarPackPublicRelease,__superstarPackTest} from '../functions/_superstar_pack.js';
import {__postgresCompatTest} from '../functions/_postgres_d1_compat.js';

const SETTINGS='superstar_pack_settings_v1',RELEASE='superstar_pack_public_release_v2047';
class Statement{
  constructor(owner,sql,values=[]){Object.assign(this,{owner,sql,values})}
  bind(...values){return new Statement(this.owner,this.sql,values)}
  async first(){return this.owner.sqlite.prepare(this.sql).get(...this.values)||null}
  async all(){return {results:this.owner.sqlite.prepare(this.sql).all(...this.values)}}
  async run(){
    if(this.owner.fail?.(this))throw new Error('injected write failure');
    if(this.owner.skip?.(this))return {meta:{changes:0}};
    const query=this.owner.sqlite.prepare(this.sql);
    if(query.columns().length)return this.all();
    return {meta:{changes:Number(query.run(...this.values).changes)}};
  }
}
class DB{
  constructor(sqlite){this.sqlite=sqlite;this.recorded=[]}
  prepare(sql){return new Statement(this,sql)}
  async batch(list){
    this.recorded.push(...list);
    if(list.some(row=>row.sql.includes('INSERT OR IGNORE INTO superstar_pack_debits'))&&this.beforePayment){this.beforePayment();this.beforePayment=null;}
    this.sqlite.exec('BEGIN IMMEDIATE');
    try{const out=[];for(const statement of list)out.push(await statement.run());this.sqlite.exec('COMMIT');return out}catch(error){this.sqlite.exec('ROLLBACK');throw error}
  }
}
function fixture({coin=5000000000,owned=0,enabled=true,winSlots=[],release=true,settings={}}={}){
  const sqlite=new DatabaseSync(':memory:');
  sqlite.exec(`
    CREATE TABLE app_meta(key TEXT PRIMARY KEY,value TEXT,updated_at TEXT);
    CREATE TABLE users(id INTEGER PRIMARY KEY,nickname TEXT,role TEXT,status TEXT,coin INTEGER,card_shards INTEGER);
    INSERT INTO users VALUES(1,'일반유저','USER','ACTIVE',${coin},100),(2,'다른유저','USER','ACTIVE',5000000000,0);
    CREATE TABLE members(id INTEGER PRIMARY KEY,name TEXT,is_active INTEGER);
    INSERT INTO members VALUES(1,'멤버',1);
    CREATE TABLE cards(id TEXT PRIMARY KEY,title TEXT,rarity TEXT,image_url TEXT,focus_x INTEGER,focus_y INTEGER,power_type TEXT,base_power INTEGER,member_id INTEGER,is_active INTEGER,card_status TEXT);
    INSERT INTO cards VALUES('S1','슈퍼스타','SUPERSTAR','assets/superstar/1.jpg',50,50,'FIXED',15500,1,1,'PUBLIC');
    CREATE VIEW cards_effective_v1210 AS SELECT * FROM cards;
    CREATE TABLE user_cards(user_id INTEGER,card_id TEXT,quantity INTEGER,last_obtained_at TEXT,PRIMARY KEY(user_id,card_id));
    CREATE TABLE draw_logs(draw_group_id TEXT,user_id INTEGER,pack_id TEXT,card_id TEXT,rarity TEXT,coin_used INTEGER,is_new INTEGER);
    CREATE TABLE coin_logs(user_id INTEGER,change_amount INTEGER,balance_after INTEGER,reason TEXT);
    CREATE TABLE shard_logs(user_id INTEGER,change_amount INTEGER,balance_after INTEGER,reason TEXT,card_id TEXT);
    CREATE TABLE administration_treasury_v2030(id INTEGER PRIMARY KEY,balance INTEGER,total_collected INTEGER,total_disbursed INTEGER,total_refunded INTEGER,tax_bps INTEGER,reserve_bps INTEGER,version INTEGER,updated_at TEXT);
    INSERT INTO administration_treasury_v2030 VALUES(1,0,0,0,0,100,2000,0,NULL);
    CREATE TABLE administration_tax_receipts_v2030(source_type TEXT,source_request_id TEXT,user_id INTEGER,gross_coin INTEGER,tax_coin INTEGER,status TEXT,label TEXT,updated_at TEXT,PRIMARY KEY(source_type,source_request_id));
    CREATE TABLE administration_treasury_ledger_v2030(reference_key TEXT PRIMARY KEY,entry_type TEXT,amount INTEGER,balance_after INTEGER,user_id INTEGER,source_type TEXT,source_request_id TEXT,memo TEXT);
  `);
  sqlite.prepare('INSERT INTO app_meta VALUES(?,?,NULL)').run(SETTINGS,JSON.stringify({drawEnabled:enabled,price:300000000,successRate:10,...settings}));
  if(release)sqlite.prepare('INSERT INTO app_meta VALUES(?,?,NULL)').run(RELEASE,'1');
  if(owned)sqlite.prepare('INSERT INTO user_cards VALUES(1,?,?,NULL)').run('S1',owned);
  const db=new DB(sqlite),env={DB:db};let randomIndex=0,currentId=1;
  const deps={authenticate:async()=>sqlite.prepare('SELECT * FROM users WHERE id=?').get(currentId),readBody:async request=>request.json(),json:(body,status=200)=>({body,status}),randomUnit:()=>{const index=randomIndex++;return index%2?0:winSlots.includes(Math.floor(index/2))?0:.9;}};
  const call=(count=10,id=crypto.randomUUID(),extra={})=>handleSuperstarPackDraw({env,deps,request:new Request('https://game.example/api/superstar-pack/draw',{method:'POST',headers:{'content-type':'application/json',origin:'https://game.example','x-cnine-draw-client':'client_1234567890abcdef'},body:JSON.stringify({count,requestId:id,...extra})})});
  return {sqlite,db,env,call,deps,setUser:id=>{currentId=id},user:()=>sqlite.prepare('SELECT * FROM users WHERE id=1').get(),n:table=>sqlite.prepare(`SELECT COUNT(*) n FROM ${table}`).get().n};
}

test('public release changes only visibility/opening, preserves CMS odds/price, and never reopens a later OFF',async()=>{
  const f=fixture({release:false,enabled:false,settings:{price:400000000,successRate:7.5,imageUrl:'custom.png',operatorNote:'preserve'}});
  await ensureSuperstarPackPublicRelease(f.env);
  const raw=JSON.parse(f.sqlite.prepare('SELECT value FROM app_meta WHERE key=?').get(SETTINGS).value);
  assert.deepEqual(raw,{drawEnabled:true,price:400000000,successRate:7.5,imageUrl:'custom.png',operatorNote:'preserve',visible:true});
  f.sqlite.prepare('UPDATE app_meta SET value=? WHERE key=?').run(JSON.stringify({...raw,drawEnabled:false}),SETTINGS);
  assert.equal((await superstarPackSettings(f.env,true)).drawEnabled,false);
  assert.equal(__superstarPackTest.superstarPackCatalogRow(raw).maxDrawCount,10);
});

test('10 independent misses atomically charge 3 billion once and collect the existing 1% tax',async()=>{
  const f=fixture(),id=crypto.randomUUID(),first=await f.call(10,id,{expectedCost:3000000000});
  assert.equal(first.status,200);assert.equal(first.body.results.length,10);assert.equal(first.body.hitCount,0);
  assert.equal(first.body.cost,3000000000);assert.equal(f.user().coin,2000000000);assert.equal(f.user().card_shards,100);
  assert.equal(f.n('user_cards'),0);assert.equal(f.n('coin_logs'),1);assert.equal(f.n('superstar_pack_debits_v1'),1);
  assert.equal(f.sqlite.prepare('SELECT balance FROM administration_treasury_v2030').get().balance,30000000);
  assert.deepEqual(await f.call(10,id),first);assert.equal(f.user().coin,2000000000);
  f.sqlite.prepare('UPDATE app_meta SET value=? WHERE key=?').run(JSON.stringify({drawEnabled:false}),SETTINGS);
  assert.deepEqual(await f.call(10,id),first,'paid results are recoverable while OFF and after balance drops below cost');
});

test('repeated cards within one batch advance quantity and duplicate shards per slot',async()=>{
  const f=fixture({winSlots:[0,1,2,3,4,5,6,7,8,9]}),response=await f.call();
  assert.equal(response.status,200);const r=response.body;
  assert.equal(r.hitCount,10);assert.equal(r.shardGained,5400);assert.equal(f.user().card_shards,5500);
  assert.deepEqual(r.results.map(row=>row.quantityAfter),[1,2,3,4,5,6,7,8,9,10]);
  assert.equal(r.results[0].duplicate,false);assert.ok(r.results.slice(1).every(row=>row.duplicate));
  assert.equal(f.sqlite.prepare('SELECT quantity FROM user_cards').get().quantity,10);
  assert.equal(f.n('draw_logs'),10);assert.equal(f.n('superstar_pack_atomic_guard_v2047'),0);
});

test('mixed outcomes retain 10 exact ordered slots; existing owners receive duplicate rewards for every win',async()=>{
  const f=fixture({owned:2,winSlots:[0,4,8]}),r=(await f.call()).body;
  assert.deepEqual(r.results.map(row=>row.hit),[true,false,false,false,true,false,false,false,true,false]);
  assert.equal(r.hitCount,3);assert.equal(r.missCount,7);assert.equal(r.shardGained,1800);
  assert.equal(f.sqlite.prepare('SELECT quantity FROM user_cards').get().quantity,5);
});

test('old receipt replay returns current quantities without restoring consumed cards or granting again',async()=>{
  const f=fixture({owned:2,winSlots:[0,4,8]}),id=crypto.randomUUID(),first=(await f.call(10,id)).body;
  assert.equal(first.currentQuantities.S1,5);
  for(const quantity of [8,1,0]){
    f.sqlite.prepare('UPDATE user_cards SET quantity=? WHERE card_id=?').run(quantity,'S1');
    f.sqlite.exec('UPDATE users SET coin=12345,card_shards=7 WHERE id=1');
    const replay=await f.call(10,id);assert.equal(replay.status,200);assert.equal(replay.body.currentQuantities.S1,quantity);
    assert.deepEqual(replay.body.results,first.results);assert.equal(replay.body.coin,12345);assert.equal(replay.body.cardShards,7);
    assert.equal(f.sqlite.prepare('SELECT quantity FROM user_cards').get().quantity,quantity);assert.equal(f.n('draw_logs'),3);assert.equal(f.n('superstar_pack_debits_v1'),1);
  }
});

test('one-pack clients keep the original top-level result and 300m cost',async()=>{
  const f=fixture({winSlots:[0]}),r=await f.call(1);
  assert.equal(r.status,200);assert.equal(r.body.count,1);assert.equal(r.body.cost,300000000);
  assert.equal(r.body.hit,true);assert.equal(r.body.card.id,'S1');assert.equal(r.body.quantityAfter,1);
});

test('insufficient total coins, invalid counts and changed price never debit',async()=>{
  const f=fixture({coin:2999999999});
  assert.equal((await f.call()).status,400);assert.equal(f.user().coin,2999999999);
  for(const count of [0,2,9,11,-10,1.5,'10',true])assert.equal((await f.call(count)).status,400);
  assert.equal((await f.call(1,crypto.randomUUID(),{expectedCost:1})).body.code,'SUPERSTAR_PRICE_CHANGED');
  assert.equal(f.n('superstar_pack_debits_v1'),0);assert.equal(f.n('coin_logs'),0);
});

test('request IDs cannot change count or transfer a receipt to another user',async()=>{
  const f=fixture(),id=crypto.randomUUID();await f.call(1,id);
  assert.equal((await f.call(10,id)).body.code,'SUPERSTAR_DRAW_COUNT_MISMATCH');
  f.setUser(2);assert.equal((await f.call(1,id)).status,409);
  assert.equal(f.sqlite.prepare('SELECT coin FROM users WHERE id=2').get().coin,5000000000);
});

test('wallet/ownership changes and zero-row grants roll back the entire batch',async()=>{
  for(const fault of ['wallet','ownership','zero-grant','zero-receipt','write-error']){
    const f=fixture({owned:1,winSlots:[0,2]});
    if(fault==='wallet')f.db.beforePayment=()=>f.sqlite.exec('UPDATE users SET coin=coin-100 WHERE id=1');
    if(fault==='ownership')f.db.beforePayment=()=>f.sqlite.exec('UPDATE user_cards SET quantity=2 WHERE user_id=1');
    if(fault==='zero-grant')f.db.skip=statement=>statement.sql.includes('INSERT INTO user_cards');
    if(fault==='zero-receipt')f.db.skip=statement=>statement.sql.includes("SET status='COMPLETED'");
    if(fault==='write-error')f.db.fail=statement=>statement.sql.includes('INSERT INTO draw_logs');
    const r=await f.call();assert.equal(r.status,409,fault);
    assert.equal(f.user().coin,fault==='wallet'?4999999900:5000000000,fault);
    assert.equal(f.user().card_shards,100);assert.equal(f.n('superstar_pack_debits_v1'),0);assert.equal(f.n('coin_logs'),0);
    assert.equal(f.n('draw_logs'),0);assert.equal(f.n('administration_tax_receipts_v2030'),0);
    assert.equal(f.sqlite.prepare('SELECT quantity FROM user_cards').get().quantity,fault==='ownership'?2:1);
  }
});

test('SQL count parameters and new guard DDL survive PostgreSQL translation without 32-bit truncation',async()=>{
  const f=fixture({winSlots:[0,4,8]});assert.equal((await f.call()).status,200);
  for(const statement of f.db.recorded){
    const translated=__postgresCompatTest.translateDialect(statement.sql),bound=__postgresCompatTest.bindQuestionMarks(translated);
    assert.equal(bound.count,statement.values.length,statement.sql);
  }
  const source=readFileSync(new URL('../functions/_superstar_pack.js',import.meta.url),'utf8');
  assert.match(source,/SELECT id FROM users WHERE id=\? FOR UPDATE/);
  assert.doesNotMatch(source,/let settingsCache|foundationByDatabase|Math\.random/);
});
