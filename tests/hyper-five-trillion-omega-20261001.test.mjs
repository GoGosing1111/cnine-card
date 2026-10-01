import test from 'node:test';
import assert from 'node:assert/strict';
import {PGlite} from '@electric-sql/pglite';
import {MERCENARY_ACCOUNTING_SCHEMA} from '../functions/_mercenary_draw_accounting.js';
import {scope,inspectHyperEligibility,grantBatch,verifyBatch} from '../scripts/ops/hyper-five-trillion-omega-20261001.mjs';

async function fixture(){
 const pg=new PGlite(),targets=scope(1).targets;
 await pg.exec(`
 CREATE TABLE users(id BIGINT PRIMARY KEY,nickname TEXT,role TEXT,status TEXT,coin BIGINT DEFAULT 123,card_shards BIGINT DEFAULT 456,magic_crystals BIGINT DEFAULT 789);
 INSERT INTO users(id,nickname,role,status) VALUES(1,'운영자','OWNER','ACTIVE'),(999,'Unrelated','USER','ACTIVE');
 CREATE TABLE joint_operations_v1(id BIGSERIAL PRIMARY KEY,user_id BIGINT,kind TEXT,status TEXT,plan_json TEXT,completed_at TEXT);
 CREATE TABLE mercenary_cms_documents_v1(doc_key TEXT PRIMARY KEY,revision INTEGER,payload_json TEXT);
 CREATE TABLE mercenary_draw_config_v1(id INTEGER PRIMARY KEY,payload_json TEXT);
 CREATE TABLE user_mercenary_loadout_v1(user_id BIGINT PRIMARY KEY,mercenary_code TEXT);
 CREATE TABLE user_mercenary_growth_v1(user_id BIGINT,mercenary_code TEXT,level INTEGER);
 CREATE TABLE user_message_rewards(id BIGSERIAL PRIMARY KEY,user_id BIGINT,reward_type TEXT,claimed_at TEXT);
 CREATE TABLE app_meta(key TEXT PRIMARY KEY,value TEXT,updated_at TEXT);
 CREATE TABLE admin_logs(id BIGSERIAL PRIMARY KEY,admin_id BIGINT,action_type TEXT,target_type TEXT,target_id TEXT,before_data TEXT,after_data TEXT);
 `);
 for(const sql of MERCENARY_ACCOUNTING_SCHEMA)await pg.exec(sql);
 await pg.query("INSERT INTO mercenary_cms_documents_v1 VALUES('config',60,$1)",[JSON.stringify({mercenaries:[{code:'V-021',name:'오메가-X',rank:'SSS'},{code:'V-046',name:'라그니엘',rank:'SSS'}]})]);
 await pg.query('INSERT INTO mercenary_draw_config_v1 VALUES(1,$1)',[JSON.stringify({cardRules:{cardWeights:{'V-021':100}}})]);
 for(const t of targets){
  await pg.query("INSERT INTO users(id,nickname,role,status) VALUES($1,$2,$3,'ACTIVE')",[t.id,t.nickname,t.role]);
  await pg.query("INSERT INTO joint_operations_v1(user_id,kind,status,plan_json,completed_at) VALUES($1,'MERCENARY_OPEN','COMPLETED',$2,'2026-10-01T12:00:00Z')",[t.id,JSON.stringify({coinCost:'5000000000000',count:10000})]);
  await pg.query("INSERT INTO user_mercenary_loadout_v1 VALUES($1,'V-001')",[t.id]);
  await pg.query("INSERT INTO user_mercenary_growth_v1 VALUES($1,'V-001',8)",[t.id]);
 }
 let failAudit=0,audits=0;
 const q=async(sql,args=[])=>{
  if(sql.includes("to_char(CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Seoul'"))return [{kst:'2026-10-01'}];
  if(sql.startsWith('INSERT INTO admin_logs')&&++audits===failAudit)throw Error('Injected audit failure');
  return (await pg.query(sql,args)).rows;
 };
 const transaction=async(fn,{rollback=false}={})=>{await pg.exec('BEGIN');try{const result=await fn();await pg.exec(rollback?'ROLLBACK':'COMMIT');return result;}catch(e){await pg.exec('ROLLBACK');throw e;}};
 const snapshot=async()=>{const state={};for(const table of ['users','user_mercenary_cards_v1','mercenary_card_acquisitions_v1','mercenary_card_atomic_guard_v1','user_mercenary_loadout_v1','user_mercenary_growth_v1','app_meta','admin_logs'])state[table]=(await pg.query('SELECT * FROM '+table+' ORDER BY 1')).rows;return state;};
 return {pg,q,targets,transaction,snapshot,fail:()=>{failAudit=2;audits=0;}};
}

test('inclusive threshold counts completed spending and excludes prior SSS and pending Omega',async()=>{
 const f=await fixture();try{
  const [a,b,c,d,e]=f.targets;
  await f.pg.query("UPDATE joint_operations_v1 SET plan_json=$2 WHERE user_id=$1",[b.id,JSON.stringify({coinCost:'4999999999999',count:9999})]);
  await f.pg.query("INSERT INTO joint_operations_v1(user_id,kind,status,plan_json) VALUES($1,'MERCENARY_OPEN','PENDING',$2)",[b.id,JSON.stringify({coinCost:'99999999999999',count:1})]);
  await f.pg.query("INSERT INTO mercenary_card_acquisitions_v1 VALUES('prior-history',$1,'V-046',0,1,0,'2026-09-30')",[c.id]);
  await f.pg.query("INSERT INTO user_message_rewards(user_id,reward_type) VALUES($1,'MERCENARY_OMEGA_X')",[d.id]);
  await f.pg.query("INSERT INTO user_mercenary_cards_v1 VALUES($1,'V-046',1,0,'2026-09-30','2026-09-30')",[e.id]);
  const report=await inspectHyperEligibility(f.q);assert.equal(report.eligibleCount,1);assert.equal(Number(report.eligible[0].user_id),a.id);assert.equal(report.eligible[0].spent_coin,'5000000000000');
 }finally{await f.pg.close();}
});

test('grant rolls back on rehearsal, delivers once, preserves other state, and replays once',async()=>{
 const f=await fixture();try{
  const before=await f.snapshot();
  await f.transaction(async()=>{assert.equal((await grantBatch(f.q,1)).count,5);assert.equal((await grantBatch(f.q,1)).replayed,true);},{rollback:true});
  assert.deepEqual(await f.snapshot(),before);
  const result=await f.transaction(()=>grantBatch(f.q,1)),after=await f.snapshot();assert.equal(result.count,5);
  for(const key of ['users','user_mercenary_loadout_v1','user_mercenary_growth_v1'])assert.deepEqual(after[key],before[key]);
  assert.equal(after.user_mercenary_cards_v1.length,5);for(const h of after.user_mercenary_cards_v1){assert.equal(h.total_copies,1);assert.equal(h.duplicate_count,0);}
  assert.equal(after.mercenary_card_acquisitions_v1.length,5);assert.equal(after.admin_logs.length,5);assert.equal((await verifyBatch(f.q,1)).count,5);
  assert.equal((await f.transaction(()=>grantBatch(f.q,1))).replayed,true);assert.deepEqual(await f.snapshot(),after);
 }finally{await f.pg.close();}
});

test('audit failure rolls back partial grants and newly acquired SSS is skipped at apply',async()=>{
 const f=await fixture();try{
  const before=await f.snapshot();f.fail();await assert.rejects(f.transaction(()=>grantBatch(f.q,1)),/audit/);assert.deepEqual(await f.snapshot(),before);
  const target=f.targets[0];await f.pg.query("INSERT INTO mercenary_card_acquisitions_v1 VALUES('newly-acquired',$1,'V-046',0,1,0,'2026-10-01')",[target.id]);
  const result=await f.transaction(()=>grantBatch(f.q,1));assert.equal(result.count,4);assert.deepEqual(result.skipped,[{userId:target.id,nickname:target.nickname,reason:'SSS_ALREADY_ACQUIRED'}]);
  assert.equal((await verifyBatch(f.q,1)).count,4);
 }finally{await f.pg.close();}
});
