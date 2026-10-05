import test from 'node:test';
import assert from 'node:assert/strict';
import {PGlite} from '@electric-sql/pglite';
import {defaultIconRoles,ICON_ROLES_KEY} from '../shared/icon-roles-v1.mjs';
import {readIconRoleState} from '../functions/_icon_roles.js';
import {PATCHES,OPERATION_KEY,buffDocument,inspectBuff,applyBuff,verifyBuff} from '../scripts/ops/icon-support-defense-buff-20261006.mjs';
async function fixture(){
 const db=new PGlite();await db.exec(`CREATE TABLE app_meta(key TEXT PRIMARY KEY,value TEXT,updated_at TEXT);
 CREATE TABLE users(id BIGINT PRIMARY KEY,role TEXT,status TEXT);INSERT INTO users VALUES(1,'OWNER','ACTIVE');
 CREATE TABLE admin_logs(id BIGSERIAL PRIMARY KEY,admin_id BIGINT,action_type TEXT,target_type TEXT,target_id TEXT,before_data TEXT,after_data TEXT);`);
 return {db,query:(sql,args=[])=>db.query(sql,args)};
}
async function snapshot(f){return {meta:(await f.query('SELECT * FROM app_meta ORDER BY key')).rows,audit:(await f.query('SELECT * FROM admin_logs ORDER BY id')).rows};}
test('two bounded role patches preserve other roles, flags and cast caps; support retains attack cadence',()=>{
 const before=defaultIconRoles();before.cards[0].tuning.damagePercent=199;const next=buffDocument(before);
 assert.deepEqual(next.cards.filter(c=>!PATCHES[c.code]),before.cards.filter(c=>!PATCHES[c.code]));
 assert.deepEqual(next.scopes,before.scopes);assert.ok(next.cards.every(c=>c.tuning.maxCasts===6));
 assert.equal(next.cards.find(c=>c.code==='ICON-OH-JOEUN').tuning.cooldownActions,4);
 assert.equal(before.cards.find(c=>c.code==='ICON-KANGGUYEOL').tuning.shieldPercent,20);
});
test('CMS stores the requested values with audit, real server reads them, replay adds no records',async()=>{
 const f=await fixture();try{
  const plan=await inspectBuff(f),result=await applyBuff(f,{expectedStateHash:plan.stateHash});
  assert.equal(result.receipt.revisionAfter,2);assert.equal((await verifyBuff(f,result.receipt)).status,'VERIFIED');
  const env={DB:{prepare:sql=>({bind:key=>({first:async()=>{const rows=(await f.query(sql.replace('?','$1'),[key])).rows;return rows[0]||null;}})})}};
  assert.deepEqual((await readIconRoleState(env)).state.document,plan.documentAfter);
  const before=await snapshot(f);assert.equal((await applyBuff(f,{expectedStateHash:plan.stateHash})).replayed,true);assert.deepEqual(await snapshot(f),before);
 }finally{await f.db.close();}
});
test('dry run and audit failure roll back both CMS and operation receipt',async()=>{
 const f=await fixture();try{
  const plan=await inspectBuff(f),before=await snapshot(f);
  const failing={query:async(sql,args)=>{if(sql.startsWith('INSERT INTO admin_logs'))throw Error('injected audit failure');return f.query(sql,args);}};
  await assert.rejects(()=>applyBuff(failing,{expectedStateHash:plan.stateHash}),/injected audit failure/);assert.deepEqual(await snapshot(f),before);
  assert.equal((await applyBuff(f,{expectedStateHash:plan.stateHash,dryRun:true})).dryRun,true);assert.deepEqual(await snapshot(f),before);
 }finally{await f.db.close();}
});
test('concurrent CMS edit is retained; stale plan is rejected',async()=>{
 const f=await fixture();try{
  const plan=await inspectBuff(f),custom={revision:7,document:defaultIconRoles(),audit:[],updatedAt:'custom',updatedBy:1};custom.document.cards[0].tuning.damagePercent=201;
  await f.query('INSERT INTO app_meta VALUES($1,$2,$3)',[ICON_ROLES_KEY,JSON.stringify(custom),'custom']);const before=await snapshot(f);
  await assert.rejects(()=>applyBuff(f,{expectedStateHash:plan.stateHash}),/CMS changed/);assert.deepEqual(await snapshot(f),before);
  const fresh=await inspectBuff(f),result=await applyBuff(f,{expectedStateHash:fresh.stateHash});assert.equal(result.receipt.revisionAfter,8);assert.equal(result.receipt.documentAfter.cards[0].tuning.damagePercent,201);
 }finally{await f.db.close();}
});
test('lost commit response returns original receipt without another update or audit',async()=>{
 const f=await fixture();try{
  const plan=await inspectBuff(f),uncertain={query:async(sql,args)=>{const result=await f.query(sql,args);if(sql==='COMMIT')throw Error('response lost');return result;}};
  await assert.rejects(()=>applyBuff(uncertain,{expectedStateHash:plan.stateHash}),/response lost/);const before=await snapshot(f);
  const replay=await applyBuff(f,{expectedStateHash:plan.stateHash});assert.equal(replay.replayed,true);assert.equal(replay.receipt.operationKey,OPERATION_KEY);assert.deepEqual(await snapshot(f),before);
 }finally{await f.db.close();}
});
