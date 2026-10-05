import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {ICON_ROLES_KEY,defaultIconRoles,validateIconRoles} from '../../shared/icon-roles-v1.mjs';

export const OPERATION_KEY='ops:icon-support-defense-buff:20261006:v1';
export const PATCHES=Object.freeze({
 'ICON-KANGGUYEOL':Object.freeze({firstAction:1,cooldownActions:3,pvpScale:100,damagePercent:210,guardThresholdPercent:70,guardSharePercent:40,guardBudgetPercent:160,shieldPercent:35,storedDamagePercent:70,storedCapPercent:100}),
 'ICON-OH-JOEUN':Object.freeze({firstAction:2,cooldownActions:4,pveScale:125,pvpScale:150,healPercent:25,resonancePercent:3,maxStacks:8,healBudgetPercent:150,nextAttackPercent:35,durationActions:3})
});
export function buffDocument(document){
 const before=validateIconRoles(document),next=structuredClone(before);
 assert.equal(before.enabled,true,'ICON roles must already be enabled');
 assert.equal(before.scopes.pve,true);assert.equal(before.scopes.pvp,true);
 for(const [code,patch] of Object.entries(PATCHES)){
  const row=next.cards.find(c=>c.code===code);assert.equal(row?.enabled,true,'Requested ICON must already be enabled');
  Object.assign(row.tuning,patch);
 }
 const validated=validateIconRoles(next);
 assert.deepEqual(validated.cards.filter(c=>!PATCHES[c.code]),before.cards.filter(c=>!PATCHES[c.code]));
 assert.deepEqual(validated.scopes,before.scopes);
 return validated;
}

const parse=v=>typeof v==='string'?JSON.parse(v):v;
const hash=v=>createHash('sha256').update(v).digest('hex');
const REQUEST_ID='icon-support-defense-buff-20261006-v1';
async function read(client){
 const record=(await client.query('SELECT value FROM app_meta WHERE key=$1',[ICON_ROLES_KEY])).rows[0];
 const raw=record?.value??null,state=raw===null?{revision:1,document:defaultIconRoles(),audit:[],updatedAt:null,updatedBy:null}:parse(raw);
 assert.ok(Number.isSafeInteger(state.revision)&&state.revision>=1&&state.revision<2147483646);assert.ok(Array.isArray(state.audit)&&state.audit.length<=50);
 state.document=validateIconRoles(state.document);
 return {raw,state,stateHash:hash(raw===null?'null':raw)};
}
export async function inspectBuff(client){
 const before=await read(client),documentAfter=buffDocument(before.state.document);
 const saved=(await client.query('SELECT value FROM app_meta WHERE key=$1',[OPERATION_KEY])).rows[0];
 return {operationKey:OPERATION_KEY,stateHash:before.stateHash,revisionBefore:before.state.revision,documentBefore:before.state.document,documentAfter,
  changes:Object.entries(PATCHES).map(([code,patch])=>({code,fields:Object.keys(patch).map(key=>({key,before:before.state.document.cards.find(c=>c.code===code).tuning[key],after:patch[key]}))})),receipt:saved?parse(saved.value):null};
}
export async function verifyBuff(client,receipt){
 const current=await read(client);
 assert.equal(receipt.status,'COMPLETED');assert.equal(receipt.operationKey,OPERATION_KEY);assert.equal(receipt.revisionAfter,receipt.revisionBefore+1);
 assert.deepEqual(buffDocument(receipt.documentBefore),receipt.documentAfter);
 assert.equal(current.state.revision,receipt.revisionAfter,'CMS changed after this operation; do not overwrite');
 assert.deepEqual(current.state.document,receipt.documentAfter,'Live role tuning differs');
 const entry=current.state.audit.find(a=>a.requestId===REQUEST_ID);assert.ok(entry);assert.equal(entry.payloadHash,receipt.payloadHash);assert.equal(entry.revision,receipt.revisionAfter);
 if(receipt.adminLogId){
  const audits=(await client.query('SELECT after_data FROM admin_logs WHERE id=$1 AND action_type=$2 AND target_id=$3',[receipt.adminLogId,'OPS_ICON_ROLE_BALANCE',OPERATION_KEY])).rows;
  assert.equal(audits.length,1);const {adminLogId,...audited}=receipt;assert.deepEqual(parse(audits[0].after_data),audited);
 }
 return {status:'VERIFIED',revision:current.state.revision,changedCodes:Object.keys(PATCHES),otherRolesPreserved:true,scopesAndFlagsPreserved:true};
}
// One-time authorized CMS tuning only. Existing combat code, snapshots, wallets,
// collection power, other five roles and all release flags remain unchanged.
export async function applyBuff(client,{expectedStateHash,dryRun=false}={}){
 assert.match(String(expectedStateHash||''),/^[a-f0-9]{64}$/);
 await client.query('BEGIN ISOLATION LEVEL REPEATABLE READ');
 try{
  await client.query("SET LOCAL lock_timeout='5s'");await client.query("SET LOCAL statement_timeout='20s'");
  const reserved=await client.query('INSERT INTO app_meta(key,value,updated_at) VALUES($1,$2,CURRENT_TIMESTAMP) ON CONFLICT(key) DO NOTHING RETURNING key',[OPERATION_KEY,JSON.stringify({status:'PENDING'})]);
  if(!reserved.rows.length){
   const receipt=parse((await client.query('SELECT value FROM app_meta WHERE key=$1',[OPERATION_KEY])).rows[0].value),verification=await verifyBuff(client,receipt);
   await client.query('ROLLBACK');return {receipt,verification,replayed:true};
  }
  const before=await read(client);assert.equal(before.stateHash,expectedStateHash,'CMS changed; inspect again');
  const owner=(await client.query("SELECT id FROM users WHERE id=1 AND role='OWNER' AND status='ACTIVE'")).rows[0];assert.ok(owner,'Active audit OWNER required');
  const document=buffDocument(before.state.document),revision=before.state.revision+1,now=new Date().toISOString();
  const payloadHash=hash(JSON.stringify([String(owner.id),before.state.revision,document]));
  const next={revision,document,updatedAt:now,updatedBy:Number(owner.id),audit:[{requestId:REQUEST_ID,payloadHash,actorId:Number(owner.id),revision,createdAt:now},...before.state.audit].slice(0,50)};
  const saved=before.raw===null
   ?await client.query('INSERT INTO app_meta(key,value,updated_at) VALUES($1,$2,CURRENT_TIMESTAMP) ON CONFLICT(key) DO NOTHING RETURNING key',[ICON_ROLES_KEY,JSON.stringify(next)])
   :await client.query('UPDATE app_meta SET value=$2,updated_at=CURRENT_TIMESTAMP WHERE key=$1 AND value=$3 RETURNING key',[ICON_ROLES_KEY,JSON.stringify(next),before.raw]);
  assert.equal(saved.rows.length,1,'CMS revision conflict');
  const receipt={status:'COMPLETED',operationKey:OPERATION_KEY,actor:'SYSTEM_OPS',authorization:'강구열 조은 아이콘 성능 안좋다는데 상향좀해봐 임마',stateHashBefore:before.stateHash,revisionBefore:before.state.revision,revisionAfter:revision,documentBefore:before.state.document,documentAfter:document,payloadHash,completedAt:now};
  await verifyBuff(client,receipt);
  const audit=await client.query('INSERT INTO admin_logs(admin_id,action_type,target_type,target_id,before_data,after_data) VALUES($1,$2,$3,$4,$5,$6) RETURNING id',[owner.id,'OPS_ICON_ROLE_BALANCE','APP_META',OPERATION_KEY,JSON.stringify({state:before.state}),JSON.stringify(receipt)]);
  assert.equal(audit.rows.length,1);receipt.adminLogId=String(audit.rows[0].id);
  assert.equal((await client.query('UPDATE app_meta SET value=$2,updated_at=CURRENT_TIMESTAMP WHERE key=$1 RETURNING key',[OPERATION_KEY,JSON.stringify(receipt)])).rows.length,1);
  const verification=await verifyBuff(client,receipt);
  await client.query(dryRun?'ROLLBACK':'COMMIT');return {receipt,verification,dryRun,replayed:false};
 }catch(error){await client.query('ROLLBACK').catch(()=>{});throw error;}
}
