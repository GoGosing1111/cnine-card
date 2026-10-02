import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import reviewed from './fur-unique-normalization-20261002.before.json' with {type:'json'};
export const CONFIG_KEY='fur_master_star_breakthrough_v1802';
export const OPERATION_KEY='ops:fur-unique-normalization:20261002:v1';
export const ACTION_TYPE='FUR_UNIQUE_NORMALIZATION';
export const EXPECTED_BEFORE=reviewed.value;
export const EXPECTED_AFTER=structuredClone(EXPECTED_BEFORE);
EXPECTED_AFTER.steps[3].uniqueBoostPercent=150;
EXPECTED_AFTER.steps[4].uniqueBoostPercent=200;
const hash=value=>createHash('sha256').update(JSON.stringify(value)).digest('hex');
export const BEFORE_HASH=hash(EXPECTED_BEFORE);
export const AFTER_HASH=hash(EXPECTED_AFTER);
const parse=value=>typeof value==='string'?JSON.parse(value):value;
const q=async(client,sql,args=[])=>(await client.query(sql,args)).rows;
function validateReceipt(receipt){
 assert.equal(receipt?.operationKey,OPERATION_KEY);assert.equal(receipt.status,'COMPLETED');
 assert.equal(receipt.beforeHash,BEFORE_HASH);assert.equal(receipt.afterHash,AFTER_HASH);
 assert.deepEqual(receipt.before,EXPECTED_BEFORE);assert.deepEqual(receipt.after,EXPECTED_AFTER);
}
export async function verifyFurUniqueNormalization(client){
 const [saved]=await q(client,'SELECT value FROM app_meta WHERE key=$1',[OPERATION_KEY]);assert.ok(saved,'Operation receipt missing');
 const receipt=parse(saved.value);validateReceipt(receipt);
 const [config]=await q(client,'SELECT value,updated_at FROM app_meta WHERE key=$1',[CONFIG_KEY]);
 assert.deepEqual(parse(config?.value),EXPECTED_AFTER,'Live FUR settings differ from approved normalization');
 const [audit]=await q(client,'SELECT before_data,after_data FROM admin_logs WHERE id=$1 AND action_type=$2 AND target_id=$3',[receipt.auditId,ACTION_TYPE,CONFIG_KEY]);
 assert.ok(audit,'Audit missing');assert.deepEqual(parse(audit.before_data),EXPECTED_BEFORE);assert.deepEqual(parse(audit.after_data),EXPECTED_AFTER);
 return {operationKey:OPERATION_KEY,status:'VERIFIED',auditId:receipt.auditId,completedAt:receipt.completedAt,updatedAt:config.updated_at,uniqueBoostPercent:EXPECTED_AFTER.steps.map(s=>s.uniqueBoostPercent),multipliers:EXPECTED_AFTER.steps.map(s=>1+s.uniqueBoostPercent/100),preserved:'All other FUR configuration fields, other grade settings and account data'};
}
export async function normalizeFurUnique(client,{dryRun=false}={}){
 await client.query('BEGIN ISOLATION LEVEL REPEATABLE READ');
 try{
  await client.query("SET LOCAL lock_timeout='5s'");await client.query("SET LOCAL statement_timeout='15s'");
  const reserved=await q(client,'INSERT INTO app_meta(key,value,updated_at) VALUES($1,$2,$3) ON CONFLICT(key) DO NOTHING RETURNING key',[OPERATION_KEY,JSON.stringify({status:'PENDING'}),new Date().toISOString()]);
  if(!reserved.length){const verification=await verifyFurUniqueNormalization(client);await client.query('ROLLBACK');return {replayed:true,verification};}
  const [current]=await q(client,'SELECT value FROM app_meta WHERE key=$1 FOR UPDATE',[CONFIG_KEY]);
  assert.ok(current,'FUR CMS settings missing');assert.deepEqual(parse(current.value),EXPECTED_BEFORE,'FUR CMS settings changed after review');
  const [owner]=await q(client,"SELECT id FROM users WHERE UPPER(role)='OWNER' AND UPPER(status)='ACTIVE' ORDER BY id LIMIT 1");assert.ok(owner,'Audit owner missing');
  const completedAt=new Date().toISOString();
  const updated=await q(client,'UPDATE app_meta SET value=$1,updated_at=$2 WHERE key=$3 AND value=$4 RETURNING key',[JSON.stringify(EXPECTED_AFTER),completedAt,CONFIG_KEY,current.value]);
  assert.equal(updated.length,1,'FUR CMS update conflict');
  const [audit]=await q(client,'INSERT INTO admin_logs(admin_id,action_type,target_type,target_id,before_data,after_data) VALUES($1,$2,$3,$4,$5,$6) RETURNING id',[owner.id,ACTION_TYPE,'APP_META',CONFIG_KEY,JSON.stringify(EXPECTED_BEFORE),JSON.stringify(EXPECTED_AFTER)]);assert.ok(audit,'Audit insertion failed');
  const receipt={operationKey:OPERATION_KEY,status:'COMPLETED',actor:'SYSTEM_OPS',beforeHash:BEFORE_HASH,afterHash:AFTER_HASH,before:EXPECTED_BEFORE,after:EXPECTED_AFTER,auditId:String(audit.id),completedAt,reason:'User approved FUR +14 unique effects x2.5 and +15 x3; preserve +13 and lower and all power/economy/ownership values.'};
  const finalized=await q(client,'UPDATE app_meta SET value=$1,updated_at=$2 WHERE key=$3 RETURNING key',[JSON.stringify(receipt),completedAt,OPERATION_KEY]);assert.equal(finalized.length,1);
  const verification=await verifyFurUniqueNormalization(client);
  await client.query(dryRun?'ROLLBACK':'COMMIT');return {receipt,verification,dryRun,replayed:false};
 }catch(error){await client.query('ROLLBACK').catch(()=>{});throw error;}
}
