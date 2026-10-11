import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {JINMU_CODE,JINMU_OWNER_ID} from '../../shared/mercenary-jinmu-v1.mjs';
export const OPERATION_KEY='ops:jinmu-owner-grant:20261012:v1';
export const TARGET=Object.freeze({id:JINMU_OWNER_ID,nickname:'핑크빛유두',code:JINMU_CODE,quantity:1});
const q=async(db,sql,args=[])=>(await db.query(sql,args)).rows;
const one=rows=>{assert.equal(rows.length,1,'Expected one exact row');return rows[0];};
const digest=value=>createHash('sha256').update(JSON.stringify(value)).digest('hex');
async function limitedState(db){
 return {stock:await q(db,'SELECT * FROM mercenary_limited_stock_v1 ORDER BY code'),
  issues:await q(db,'SELECT * FROM mercenary_limited_issues_v1 ORDER BY code,serial'),
  settings:await q(db,"SELECT key,value FROM app_meta WHERE key IN ('mercenary_limited_pack_v1','mercenary_limited_draw_policy_v1') ORDER BY key")};
}
export async function inspectJinmuGrant(db){
 const owner=one(await q(db,'SELECT id,nickname,role,status FROM users WHERE id=$1',[TARGET.id]));
 const holders=await q(db,'SELECT user_id,mercenary_code,total_copies,duplicate_count FROM user_mercenary_cards_v1 WHERE mercenary_code=$1 ORDER BY user_id',[TARGET.code]);
 const saved=await q(db,'SELECT value FROM app_meta WHERE key=$1',[OPERATION_KEY]);
 const limited=await limitedState(db);
 return {owner,holders,limitedDigest:digest(limited),limitedKinds:limited.stock.length,
  limitedIssued:limited.stock.reduce((n,s)=>n+Number(s.issued),0),
  jinmuStock:limited.stock.filter(s=>s.code===TARGET.code),jinmuIssues:limited.issues.filter(s=>s.code===TARGET.code),
  receipt:saved[0]?JSON.parse(saved[0].value):null};
}
export async function verifyJinmuGrant(db){
 const s=await inspectJinmuGrant(db),r=s.receipt;
 assert.equal(r?.status,'COMPLETED');assert.equal(r.operationKey,OPERATION_KEY);assert.deepEqual(r.target,TARGET);
 assert.equal(r.limitedDigestBefore,r.limitedDigestAfter);assert.equal(r.countedInLimited,false);
 assert.equal(s.jinmuStock.length,0);assert.equal(s.jinmuIssues.length,0);
 const h=one(s.holders);assert.equal(Number(h.user_id),TARGET.id);assert.equal(Number(h.total_copies),1);assert.equal(Number(h.duplicate_count),0);
 const acquisition=one(await q(db,'SELECT * FROM mercenary_card_acquisitions_v1 WHERE acquisition_id=$1',[OPERATION_KEY]));
 assert.equal(Number(acquisition.user_id),TARGET.id);assert.equal(acquisition.mercenary_code,TARGET.code);
 assert.equal(Number(acquisition.total_copies_after),1);assert.equal(Number(acquisition.is_duplicate),0);
 const log=one(await q(db,'SELECT id,after_data FROM admin_logs WHERE id=$1',[r.adminLogId]));
 assert.equal(JSON.parse(log.after_data).operationKey,OPERATION_KEY);
 return {status:'VERIFIED',...s};
}
// No stock, issue serial, draw policy, loadout or wallet write is permitted here.
// The exact owner row serializes retries; the receipt commits with the holding.
export async function grantJinmuOwner(db,{dryRun=false}={}){
 await db.query('BEGIN ISOLATION LEVEL REPEATABLE READ');
 try{
  const owner=one(await q(db,'SELECT id,nickname,role,status FROM users WHERE id=$1 FOR UPDATE',[TARGET.id]));
  assert.equal(owner.nickname,TARGET.nickname);assert.equal(owner.role,'OWNER');assert.equal(owner.status,'ACTIVE');
  const before=await inspectJinmuGrant(db);
  if(before.receipt){const result=await verifyJinmuGrant(db);await db.query(dryRun?'ROLLBACK':'COMMIT');return {dryRun,replayed:true,...result};}
  assert.equal(before.holders.length,0,'Unreceipted holding already exists; inspect before granting');
  assert.equal(before.jinmuStock.length,0);assert.equal(before.jinmuIssues.length,0);
  const now=new Date().toISOString();
  await db.query('INSERT INTO user_mercenary_cards_v1(user_id,mercenary_code,total_copies,duplicate_count,first_obtained_at,last_obtained_at) VALUES($1,$2,1,0,$3,$3)',[TARGET.id,TARGET.code,now]);
  await db.query('INSERT INTO mercenary_card_acquisitions_v1(acquisition_id,user_id,mercenary_code,is_duplicate,total_copies_after,duplicate_count_after,created_at) VALUES($1,$2,$3,0,1,0,$4)',[OPERATION_KEY,TARGET.id,TARGET.code,now]);
  const after=await inspectJinmuGrant(db);assert.equal(after.limitedDigest,before.limitedDigest,'Limited stock and configuration must be untouched');
  const receipt={status:'COMPLETED',operationKey:OPERATION_KEY,target:TARGET,completedAt:now,countedInLimited:false,
   limitedDigestBefore:before.limitedDigest,limitedDigestAfter:after.limitedDigest,limitedKinds:before.limitedKinds,
   limitedIssued:before.limitedIssued,automaticLoadout:false};
  const audit=one(await q(db,'INSERT INTO admin_logs(admin_id,action_type,target_type,target_id,before_data,after_data) VALUES($1,$2,$3,$4,$5,$6) RETURNING id',
   [TARGET.id,'OPS_EXCLUSIVE_MERCENARY_GRANT','MERCENARY',TARGET.code,JSON.stringify({holders:before.holders}),JSON.stringify(receipt)]));
  receipt.adminLogId=String(audit.id);
  await db.query('INSERT INTO app_meta(key,value,updated_at) VALUES($1,$2,$3)',[OPERATION_KEY,JSON.stringify(receipt),now]);
  const verified=await verifyJinmuGrant(db);await db.query(dryRun?'ROLLBACK':'COMMIT');return {dryRun,replayed:false,...verified};
 }catch(error){await db.query('ROLLBACK').catch(()=>{});throw error;}
}
