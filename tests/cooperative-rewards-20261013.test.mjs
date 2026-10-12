import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {PGlite} from '@electric-sql/pglite';
import {__postgresCompatTest} from '../functions/_postgres_d1_compat.js';
import {settleCoopRewards,coopDailyReward} from '../functions/_cooperative_rewards.js';
import {defaultCoopRewards,validateCoopRewards,freezeCoopReward,coopRewardDay,COOP_SETTINGS_KEY} from '../shared/cooperative-rewards-v1.mjs';

const at=Date.parse('2026-10-13T23:59:58+09:00');
const settings=()=>{
 const rewards=defaultCoopRewards();rewards.enabled=true;
 for(const row of rewards.difficulties)Object.assign(row,{coin:100,masterStars:7,items:[{code:'EMPEROR_ENERGY',quantity:2},{code:'PET_ESSENCE',quantity:3}]});
 return {mode:'ON',revision:9,rewards};
};
const room=(n,{config=settings(),finishedAt=at,difficulty='NORMAL',defeat=[],status='VICTORY'}={})=>({id:String(n).padStart(10,'0'),creationRequest:'qa-clear-'+n,createdAt:finishedAt-60000,finishedAt,status,difficulty,rewardPolicy:freezeCoopReward(config,difficulty),members:[1,2,3].map(id=>({id,result:defeat.includes(id)?'DEFEAT':status}))});
async function fixture(postgres=false){
 let pg,sqlite,DB;
 if(postgres){
  pg=new PGlite();await pg.exec("CREATE FUNCTION sqlite_now() RETURNS text LANGUAGE SQL STABLE AS $$SELECT to_char(timezone('UTC',CURRENT_TIMESTAMP),'YYYY-MM-DD HH24:MI:SS')$$;");
  DB=new __postgresCompatTest.PostgresD1Database({async query(q){const r=await pg.query(q.text||q,q.values||[]);return {...r,rowCount:r.affectedRows??r.rows.length};}});
 }else{
  sqlite=new DatabaseSync(':memory:');
  DB={prepare(sql){return {sql,args:[],bind(...args){return {...this,args};},async first(){return sqlite.prepare(sql).get(...this.args)||null;},async all(){return {results:sqlite.prepare(sql).all(...this.args)};},async run(){return {meta:{changes:Number(sqlite.prepare(sql).run(...this.args).changes)}};}};},async batch(rows){sqlite.exec('BEGIN');try{const result=rows.map(row=>({meta:{changes:Number(sqlite.prepare(row.sql).run(...row.args).changes)}}));sqlite.exec('COMMIT');return result;}catch(e){sqlite.exec('ROLLBACK');throw e;}}};
 }
 const schema=`CREATE TABLE app_meta(key TEXT PRIMARY KEY,value TEXT,updated_at TEXT);CREATE TABLE users(id INTEGER PRIMARY KEY,coin BIGINT);INSERT INTO users VALUES(1,1000),(2,1000),(3,1000);CREATE TABLE inventory_items(code TEXT PRIMARY KEY,name TEXT,is_active INTEGER);INSERT INTO inventory_items VALUES('MASTER_STAR','마스터의 별',1),('EMPEROR_ENERGY','엠퍼러 에너지',1),('PET_ESSENCE','펫 정수',1);CREATE TABLE cnine_user_inventory(user_id INTEGER,item_code TEXT,quantity BIGINT,unseen_quantity BIGINT,updated_at TEXT,PRIMARY KEY(user_id,item_code));CREATE TABLE inventory_logs(user_id INTEGER,item_code TEXT,change_amount BIGINT,balance_after BIGINT,reason TEXT,reference_type TEXT,reference_id TEXT);CREATE TABLE coin_logs(user_id INTEGER,change_amount BIGINT,balance_after BIGINT,reason TEXT);`;
 if(pg)await pg.exec(schema);else sqlite.exec(schema);
 const env={DB},writeSettings=cfg=>DB.prepare('INSERT INTO app_meta(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value').bind(COOP_SETTINGS_KEY,JSON.stringify(cfg)).run();
 await writeSettings(settings());
 return {env,writeSettings,first:sql=>DB.prepare(sql).first(),run:sql=>DB.prepare(sql).run(),close:()=>pg?pg.close():sqlite.close()};
}
test('three per KST day, validated multi-item rewards, no implicit draft activation',()=>{
 assert.equal(defaultCoopRewards().enabled,false);assert.equal(defaultCoopRewards().dailyLimit,3);
 assert.equal(freezeCoopReward({mode:'ON',revision:0,economyDraft:{coin:999999}},'NORMAL').enabled,false);
 assert.equal(coopRewardDay(at).day,'2026-10-13');assert.equal(coopRewardDay(at+2000).day,'2026-10-14');assert.equal(coopRewardDay(at).resetAt,at+2000);
 assert.equal(freezeCoopReward({...settings(),mode:'TEST'},'NORMAL').enabled,false);
 for(const change of [v=>v.dailyLimit=4,v=>v.enabled='true',v=>v.difficulties[0].coin=-1,v=>v.difficulties[0].items[0].quantity=1.5,v=>v.difficulties[0].items.push(v.difficulties[0].items[0]),v=>v.difficulties[0].items[0].code='MASTER_STAR']){const v=settings().rewards;change(v);assert.throws(()=>validateCoopRewards(v));}
 const empty=defaultCoopRewards();empty.enabled=true;assert.throws(()=>validateCoopRewards(empty));
 const cfg=settings(),snapshot=freezeCoopReward(cfg,'NORMAL');cfg.rewards.difficulties[0].coin=999;assert.equal(snapshot.coin,100);
});
for(const postgres of [false,true])test(`${postgres?'PostgreSQL':'SQLite'} atomic reward receipt: quota, midnight, snapshot, OFF, no duplicate grants`,async()=>{
 const f=await fixture(postgres);try{
  const first=await settleCoopRewards(f.env,room(1,{defeat:[3]}));assert.equal(first[1].status,'GRANTED');assert.equal(first[3].status,'DEFEAT');assert.equal(first[1].items[0].name,'엠퍼러 에너지');
  assert.deepEqual(await settleCoopRewards(f.env,room(1,{defeat:[3]})),first,'lost DO acknowledgement replays exact receipt');
  await settleCoopRewards(f.env,room(2,{difficulty:'HARD'}));await settleCoopRewards(f.env,room(3,{difficulty:'EXTREME'}));
  const fourth=await settleCoopRewards(f.env,room(4));assert.equal(fourth[1].status,'DAILY_LIMIT');assert.equal(fourth[2].status,'DAILY_LIMIT');assert.equal(fourth[3].status,'GRANTED');
  assert.equal((await coopDailyReward(f.env,1,at)).used,3);assert.equal(Number((await f.first('SELECT coin FROM users WHERE id=1')).coin),1300);
  assert.equal(Number((await f.first("SELECT quantity FROM cnine_user_inventory WHERE user_id=1 AND item_code='MASTER_STAR'")).quantity),21);
  assert.equal(Number((await f.first("SELECT COUNT(*) n FROM inventory_logs WHERE user_id=1")).n),9);
  const nextDay=await settleCoopRewards(f.env,room(5,{finishedAt:at+2000}));assert.equal(nextDay[1].dailyReward.used,1);assert.equal(nextDay[1].dailyReward.day,'2026-10-14');
  const changed=settings();changed.rewards.difficulties[0].coin=500;await f.writeSettings(changed);
  assert.equal((await settleCoopRewards(f.env,room(6,{finishedAt:at+3000})))[1].coin,100,'existing room freezes original quantities');
  changed.rewards.enabled=false;await f.writeSettings(changed);
  assert.equal((await settleCoopRewards(f.env,room(7,{finishedAt:at+4000})))[1].status,'DISABLED','emergency OFF prevents unsettled grants');
  changed.rewards.enabled=true;await f.writeSettings(changed);
  assert.equal((await settleCoopRewards(f.env,room(7,{finishedAt:at+4000})))[1].status,'DISABLED','OFF receipt cannot become payable after ON');
  for(const r of [room(8,{config:{...settings(),mode:'TEST'}}),room(9,{status:'DEFEAT'})])assert.equal((await settleCoopRewards(f.env,r))[1].granted,false);
  assert.equal((await coopDailyReward(f.env,1,at+4000)).used,2);
  const legacy=room(10);delete legacy.rewardPolicy;assert.equal((await settleCoopRewards(f.env,legacy))[1].status,'DISABLED');
  await assert.rejects(settleCoopRewards(f.env,{...room(11),status:'ACTIVE'}));
 }finally{await f.close();}
});
for(const postgres of [false,true])test(`${postgres?'PostgreSQL':'SQLite'} later participant failure rolls back all balances, counters, receipt and logs`,async()=>{
 const f=await fixture(postgres);try{
  await f.run('DELETE FROM users WHERE id=3');
  await assert.rejects(settleCoopRewards(f.env,room(21)));
  assert.equal(Number((await f.first('SELECT coin FROM users WHERE id=1')).coin),1000);
  assert.equal((await coopDailyReward(f.env,1,at)).used,0);assert.equal(Number((await f.first('SELECT COUNT(*) n FROM inventory_logs')).n),0);
  assert.equal(await f.first("SELECT value FROM app_meta WHERE key='coop_reward_receipt_v1:0000000021'"),null);
  await f.run('INSERT INTO users VALUES(3,1000)');assert.equal((await settleCoopRewards(f.env,room(21)))[1].status,'GRANTED');
  await f.run("UPDATE inventory_items SET is_active=0 WHERE code='PET_ESSENCE'");await assert.rejects(settleCoopRewards(f.env,room(22)));
  assert.equal((await coopDailyReward(f.env,1,at)).used,1);
 }finally{await f.close();}
});
test('concurrent rooms cannot exceed the shared daily limit or duplicate a room',async()=>{
 const f=await fixture();try{
  const rooms=[room(31),room(32),room(33),room(34)];
  await Promise.all(rooms.map(r=>settleCoopRewards(f.env,r)));
  assert.equal((await coopDailyReward(f.env,1,at)).used,3);assert.equal(Number((await f.first('SELECT coin FROM users WHERE id=1')).coin),1300);
  const r=room(35,{finishedAt:at+2000});await Promise.all([settleCoopRewards(f.env,r),settleCoopRewards(f.env,r)]);
  assert.equal((await coopDailyReward(f.env,1,at+2000)).used,1);
 }finally{await f.close();}
});
