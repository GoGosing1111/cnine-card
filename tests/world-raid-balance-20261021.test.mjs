import test from 'node:test';
import assert from 'node:assert/strict';
import {PGlite} from '@electric-sql/pglite';
import baseline from './fixtures/world-raid-cms-20261021.json' with {type:'json'};
import {applyWorldRaidBalance20261021,verifyWorldRaidBalance20261021,buildWorldRaidPlan20261021,OPERATION_KEY} from '../scripts/ops/world-raid-balance-20261021.mjs';
import {settingsFor} from '../scripts/measure-world-raid-balance-20261021.mjs';
import {raidRewardPlanV1293,cleanRaidSettingsV1293} from '../functions/_raid_overhaul.js';
const proof={releaseCommit:'a'.repeat(40)};
async function fixture(t){
 const c=new PGlite();t.after(()=>c.close());
 await c.exec(`CREATE TABLE app_meta(key TEXT PRIMARY KEY,value TEXT,updated_at TEXT);
 CREATE TABLE raid_bosses(id BIGINT PRIMARY KEY,name TEXT,max_hp BIGINT,defense_rate INT,is_active BIGINT,updated_at TEXT);
 CREATE TABLE users(id BIGINT PRIMARY KEY,role TEXT,status TEXT,coin BIGINT);INSERT INTO users VALUES(1,'OWNER','ACTIVE',123),(2,'USER','ACTIVE',456);
 CREATE TABLE raid_instance_v1293(instance_id BIGINT PRIMARY KEY,settings_json TEXT);
 INSERT INTO raid_instance_v1293 VALUES(1,'{"battleSeconds":1000,"rewards":{"clear":[{"type":"COIN","amount":10000000000}]}}');
 CREATE TABLE admin_logs(id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,admin_id BIGINT,action_type TEXT,target_type TEXT,target_id TEXT,before_data TEXT,after_data TEXT);`);
 for(const r of baseline.meta)await c.query('INSERT INTO app_meta(key,value) VALUES($1,$2)',[r.key,r.value]);
 for(const r of baseline.bosses)await c.query('INSERT INTO raid_bosses(id,name,max_hp,defense_rate,is_active) VALUES($1,$2,$3,$4,$5)',[r.id,r.name,r.max_hp,r.defense_rate,r.is_active]);
 return c;
}
const state=async c=>({meta:(await c.query('SELECT key,value FROM app_meta ORDER BY key')).rows,bosses:(await c.query('SELECT id,name,max_hp,defense_rate,is_active FROM raid_bosses ORDER BY id')).rows,rooms:(await c.query('SELECT * FROM raid_instance_v1293')).rows,accounts:(await c.query('SELECT * FROM users ORDER BY id')).rows});
test('measured 10–15 player difficulty and 1,000억 coins commit once; dry-run, old rooms and account balances stay intact',async t=>{
 const c=await fixture(t),before=await state(c);
 const dry=await applyWorldRaidBalance20261021(c,{...proof,dryRun:true});assert.equal(dry.dryRun,true);assert.deepEqual(await state(c),before);assert.equal((await c.query('SELECT * FROM admin_logs')).rows.length,0);
 const applied=await applyWorldRaidBalance20261021(c,proof);assert.equal(applied.receipt.clearCoin,100_000_000_000);assert.equal(applied.receipt.battleSeconds,720);
 const after=await state(c);assert.deepEqual(after.rooms,before.rooms);assert.deepEqual(after.accounts,before.accounts);
 const verified=await verifyWorldRaidBalance20261021(c);assert.deepEqual(verified.receipt,applied.receipt);
 const replay=await applyWorldRaidBalance20261021({query(sql,args){assert.ok(!/^\s*(INSERT|UPDATE|DELETE)\b/i.test(sql),'Replay must not write');return c.query(sql,args);}},proof);assert.equal(replay.replayed,true);assert.deepEqual(replay.receipt,applied.receipt);
 assert.equal((await c.query('SELECT * FROM admin_logs')).rows.length,1);assert.equal((await c.query('SELECT * FROM app_meta WHERE key=$1',[OPERATION_KEY])).rows.length,1);
});
test('a concurrent CMS edit or late audit failure rolls back every boss and setting',async t=>{
 const c=await fixture(t),before=await state(c);
 await c.query("UPDATE app_meta SET value='{}' WHERE key='raid_settings_v1'");await assert.rejects(()=>applyWorldRaidBalance20261021(c,proof),/CMS changed/);
 const original=baseline.meta.find(r=>r.key==='raid_settings_v1');await c.query('UPDATE app_meta SET value=$1 WHERE key=$2',[original.value,original.key]);
 await c.exec("ALTER TABLE admin_logs ADD CONSTRAINT reject_test CHECK(action_type<>'WORLD_RAID_BALANCE_20261021')");
 await assert.rejects(()=>applyWorldRaidBalance20261021(c,proof),/reject_test/);assert.deepEqual(await state(c),before);
});
test('1,000억 survives room normalization, per-player bonuses and reward display without changing past room rewards',()=>{
 buildWorldRaidPlan20261021();
 for(const [code,baseTotal] of [['NAGATO',100008280000],['YORIICHI',100009160000],['ICHIGO',100010040000]]){
  const cfg=settingsFor(code,true),old=settingsFor(code,false),args={instanceId:1,userId:2,totalDamage:50000000,finalRank:1,cleared:true,minionsDefeated:2};
  const newPlan=raidRewardPlanV1293({...args,cfg:cleanRaidSettingsV1293(JSON.parse(JSON.stringify(cfg)))});assert.equal(newPlan.coin,baseTotal);
  const bonus=raidRewardPlanV1293({...args,cfg,collectionBonuses:{coinPercent:45,dropPercent:0}});assert.equal(bonus.coin,baseTotal*145/100);
  assert.equal(raidRewardPlanV1293({...args,cfg:old}).coin,baseTotal-90000000000);
  assert.equal(raidRewardPlanV1293({...args,cfg,cleared:false}).coin,baseTotal-100000000000);
  const coinEntries=newPlan.entries.filter(e=>e.type==='COIN');assert.equal(coinEntries.reduce((s,e)=>s+e.amount,0),baseTotal);
 }
});
