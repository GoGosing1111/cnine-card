import test from 'node:test';
import assert from 'node:assert/strict';
import {PGlite} from '@electric-sql/pglite';
import {MERCENARY_ACCOUNTING_SCHEMA} from '../functions/_mercenary_draw_accounting.js';
import {TARGETS,apply,verify} from '../scripts/ops/hyper-five-trillion-omega-20261003.mjs';

async function fixture(){
 const db=new PGlite();
 await db.exec(`
 CREATE TABLE users(id BIGINT PRIMARY KEY,nickname TEXT,role TEXT,status TEXT,coin BIGINT DEFAULT 123,card_shards BIGINT DEFAULT 456,magic_crystals BIGINT DEFAULT 789);
 INSERT INTO users(id,nickname,role,status) VALUES(1,'운영자','OWNER','ACTIVE');
 CREATE TABLE joint_operations_v1(id BIGSERIAL PRIMARY KEY,user_id BIGINT,kind TEXT,status TEXT,plan_json TEXT,completed_at TEXT);
 CREATE TABLE mercenary_cms_documents_v1(doc_key TEXT PRIMARY KEY,revision INTEGER,payload_json TEXT);
 CREATE TABLE mercenary_draw_config_v1(id INTEGER PRIMARY KEY,payload_json TEXT);
 CREATE TABLE user_mercenary_loadout_v1(user_id BIGINT PRIMARY KEY,mercenary_code TEXT);
 CREATE TABLE user_mercenary_growth_v1(user_id BIGINT,mercenary_code TEXT,level INTEGER);
 CREATE TABLE user_message_rewards(id BIGSERIAL PRIMARY KEY,user_id BIGINT,reward_type TEXT,claimed_at TEXT);
 CREATE TABLE app_meta(key TEXT PRIMARY KEY,value TEXT,updated_at TEXT);
 CREATE TABLE admin_logs(id BIGSERIAL PRIMARY KEY,admin_id BIGINT,action_type TEXT,target_type TEXT,target_id TEXT,before_data TEXT,after_data TEXT);
 CREATE TABLE user_mutation_locks_v1520(user_id BIGINT PRIMARY KEY,token TEXT,action_path TEXT,lease_until_ms BIGINT,updated_at TEXT);
 `);
 for(const sql of MERCENARY_ACCOUNTING_SCHEMA)await db.exec(sql);
 await db.query("INSERT INTO mercenary_cms_documents_v1 VALUES('config',60,$1)",[JSON.stringify({mercenaries:[{code:'V-021',name:'오메가-X',rank:'SSS'},{code:'V-046',name:'라그니엘',rank:'SSS'}]})]);
 await db.query('INSERT INTO mercenary_draw_config_v1 VALUES(1,$1)',[JSON.stringify({cardRules:{cardWeights:{'V-021':100}}})]);
 const revoked={status:'COMPLETED',operationKey:'sss-rate-revision27-revoke-20260930-v1',acquisitionIds:[],before:[]};
 for(const t of TARGETS){
  await db.query("INSERT INTO users(id,nickname,role,status) VALUES($1,$2,$3,'ACTIVE')",[t.id,t.nickname,t.role]);
  await db.query("INSERT INTO joint_operations_v1(user_id,kind,status,plan_json,completed_at) VALUES($1,'MERCENARY_OPEN','COMPLETED',$2,'2026-10-03T14:00:00Z')",[t.id,JSON.stringify({coinCost:'5000000000000',count:10000})]);
  await db.query("INSERT INTO user_mercenary_cards_v1 VALUES($1,'V-001',2,1,'original','original')",[t.id]);
  await db.query("INSERT INTO user_mercenary_loadout_v1 VALUES($1,'V-001')",[t.id]);
  await db.query("INSERT INTO user_mercenary_growth_v1 VALUES($1,'V-001',8)",[t.id]);
  if(t.revokedSssAcquisitions){const id='revoked:'+t.id;revoked.acquisitionIds.push(id);revoked.before.push({userId:t.id,code:'V-046',acquisitionIds:[id]});await db.query("INSERT INTO mercenary_card_acquisitions_v1 VALUES($1,$2,'V-046',0,1,0,'2026-09-30')",[id,t.id]);}
 }
 await db.query('INSERT INTO app_meta VALUES($1,$2,$3)',[revoked.operationKey,JSON.stringify(revoked),'original']);
 let failAudit=0,audits=0;
 const client={query:async(sql,args=[])=>{if(sql.startsWith('INSERT INTO admin_logs')&&++audits===failAudit)throw Error('Injected audit failure');return db.query(sql,args);}};
 const snapshot=async()=>{const state={};for(const table of ['users','joint_operations_v1','user_mercenary_cards_v1','mercenary_card_acquisitions_v1','mercenary_card_atomic_guard_v1','user_mercenary_loadout_v1','user_mercenary_growth_v1','user_message_rewards','app_meta','admin_logs','user_mutation_locks_v1520'])state[table]=(await db.query('SELECT * FROM '+table+' ORDER BY 1,2')).rows;return state;};
 return {db,client,snapshot,fail:()=>{failAudit=3;audits=0;}};
}

test('all 11 receive one permanent Omega including revoked-only histories; rollback and retry preserve other state',async()=>{
 const f=await fixture();try{
  const before=await f.snapshot();await apply(f.client,1,{dryRun:true});assert.deepEqual(await f.snapshot(),before);
  const results=[];for(const batch of [1,2,3]){results.push(await apply(f.client,batch));await verify(f.client,batch);}
  assert.equal(results.flatMap(r=>r.recipients).length,11);assert.equal(results.flatMap(r=>r.skipped).length,0);
  const after=await f.snapshot();
  for(const table of ['users','joint_operations_v1','user_mercenary_loadout_v1','user_mercenary_growth_v1','user_message_rewards'])assert.deepEqual(after[table],before[table]);
  assert.deepEqual(after.user_mercenary_cards_v1.filter(h=>h.mercenary_code!=='V-021'),before.user_mercenary_cards_v1);
  assert.deepEqual(after.mercenary_card_acquisitions_v1.filter(a=>a.acquisition_id.startsWith('revoked:')),before.mercenary_card_acquisitions_v1);
  assert.equal(after.admin_logs.length,11);assert.equal(after.user_mutation_locks_v1520.length,0);assert.equal(after.mercenary_card_atomic_guard_v1.length,0);
  assert.equal((await apply(f.client,1)).replayed,true);assert.deepEqual(await f.snapshot(),after);
 }finally{await f.db.close();}
});

test('audit failure after partial grants rolls back the entire batch, including acquisitions and receipt',async()=>{
 const f=await fixture();try{const before=await f.snapshot();f.fail();await assert.rejects(apply(f.client,1),/audit/);assert.deepEqual(await f.snapshot(),before);}finally{await f.db.close();}
});

test('new valid SSS and pending rewards are excluded; altered identity or active opening is rejected',async()=>{
 const f=await fixture();try{
  const [a,b,c,d]=TARGETS;
  await f.db.query("UPDATE users SET nickname='changed' WHERE id=$1",[a.id]);let before=await f.snapshot();
  await assert.rejects(apply(f.client,1),/nickname changed/);assert.deepEqual(await f.snapshot(),before);
  await f.db.query('UPDATE users SET nickname=$2 WHERE id=$1',[a.id,a.nickname]);
  await f.db.query("INSERT INTO joint_operations_v1(user_id,kind,status,plan_json) VALUES($1,'MERCENARY_OPEN','PENDING','{}')",[a.id]);before=await f.snapshot();
  await assert.rejects(apply(f.client,1),/opening in progress/);assert.deepEqual(await f.snapshot(),before);
  await f.db.exec("DELETE FROM joint_operations_v1 WHERE status='PENDING'");
  await f.db.query("INSERT INTO mercenary_card_acquisitions_v1 VALUES('new-valid',$1,'V-046',0,1,0,'2026-10-03')",[a.id]);
  await f.db.query("INSERT INTO user_message_rewards(user_id,reward_type) VALUES($1,'MERCENARY_OMEGA_X')",[b.id]);
  await f.db.query("UPDATE joint_operations_v1 SET plan_json=$2 WHERE user_id=$1",[c.id,JSON.stringify({coinCost:'4999999999999',count:9999})]);
  const result=await apply(f.client,1);assert.deepEqual(result.recipients.map(r=>r.userId),[d.id]);
  assert.deepEqual(result.skipped.map(r=>r.reason),['SSS_ALREADY_ACQUIRED','OMEGA_ALREADY_DELIVERED','BELOW_THRESHOLD']);await verify(f.client,1);
 }finally{await f.db.close();}
});
