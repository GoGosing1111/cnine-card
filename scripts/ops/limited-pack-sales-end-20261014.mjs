import assert from 'node:assert/strict';
import {LIMITED_PACK_KEY} from '../../shared/mercenary-limited-pack-v1.mjs';

export const OPERATION_KEY='ops:limited-pack-sales-end:20261014:v1';
export const AUTHORIZATION='리미티드 하이퍼팩 판매 종료 관련 API 차단 / 용병 리미티드팩만';
const q=async(db,sql,args=[])=>(await db.query(sql,args)).rows;
const one=rows=>{assert.equal(rows.length,1,'Expected one exact row');return rows[0];};
const read=async(db,key)=>(await q(db,'SELECT value FROM app_meta WHERE key=$1',[key]))[0]?.value??null;

export async function limitedSalesState(db){
 const raw=await read(db,LIMITED_PACK_KEY),saved=await read(db,OPERATION_KEY);
 return {pack:raw?JSON.parse(raw):null,raw,receipt:saved?JSON.parse(saved):null,
  hyper:await read(db,'hyper_pack_opening_v2093'),policy:await read(db,'mercenary_limited_draw_policy_v1'),
  stock:await q(db,'SELECT * FROM mercenary_limited_stock_v1 ORDER BY code')};
}

export async function endLimitedSales(db,{dryRun=false}={}){
 await db.query('BEGIN ISOLATION LEVEL REPEATABLE READ');
 try{
  await db.query("SET LOCAL lock_timeout='5s'");await db.query("SET LOCAL statement_timeout='15s'");
  const owner=one(await q(db,'SELECT id,nickname,role,status FROM users WHERE id=1'));
  assert.equal(owner.nickname,'핑크빛유두');assert.equal(owner.role,'OWNER');assert.equal(owner.status,'ACTIVE');
  // Purchases take FOR SHARE on this same policy before debit. Wait for those
  // transactions, then change the exact value their commit guard compares.
  one(await q(db,'SELECT key FROM app_meta WHERE key=$1 FOR UPDATE',[LIMITED_PACK_KEY]));
  const before=await limitedSalesState(db);
  if(before.receipt){
   assert.equal(before.receipt.operationKey,OPERATION_KEY);assert.equal(before.pack.settings.mode,'OFF','Sales were later reopened; inspect before another closure');
   await db.query(dryRun?'ROLLBACK':'COMMIT');return {status:'COMPLETED',replayed:true,dryRun,receipt:before.receipt};
  }
  assert(['ON','OFF'].includes(before.pack?.settings?.mode));assert(Number.isSafeInteger(before.pack.revision));
  const now=new Date().toISOString(),next={...before.pack,revision:before.pack.revision+1,
   settings:{...before.pack.settings,mode:'OFF'},updatedAt:now,updatedBy:1,lastRequestId:OPERATION_KEY};
  one(await q(db,'UPDATE app_meta SET value=$1,updated_at=$2 WHERE key=$3 AND value=$4 RETURNING key',[JSON.stringify(next),now,LIMITED_PACK_KEY,before.raw]));
  const after=await limitedSalesState(db);
  assert.equal(after.pack.settings.mode,'OFF');assert.equal(after.pack.revision,next.revision);
  for(const key of ['hyper','policy','stock'])assert.deepEqual(after[key],before[key],key+' changed');
  assert.deepEqual({...after.pack.settings,mode:before.pack.settings.mode},before.pack.settings);
  const receipt={status:'COMPLETED',operationKey:OPERATION_KEY,authorization:AUTHORIZATION,completedAt:now,
   packId:'mercenary-limited',modeBefore:before.pack.settings.mode,modeAfter:'OFF',revisionBefore:before.pack.revision,revisionAfter:next.revision,
   hyperMode:before.hyper?JSON.parse(before.hyper).mode:null,preserved:{hyper:true,prices:true,odds:true,stock:true,ownedCards:true,completedReceipts:true}};
  const log=one(await q(db,"INSERT INTO admin_logs(admin_id,action_type,target_type,target_id,before_data,after_data) VALUES(1,'OPS_LIMITED_PACK_SALES_END','APP_META',$1,$2,$3) RETURNING id",[LIMITED_PACK_KEY,before.raw,JSON.stringify({operationKey:OPERATION_KEY,settings:next})]));
  receipt.adminLogId=String(log.id);
  await q(db,'INSERT INTO app_meta(key,value,updated_at) VALUES($1,$2,$3)',[OPERATION_KEY,JSON.stringify(receipt),now]);
  await db.query(dryRun?'ROLLBACK':'COMMIT');return {status:'COMPLETED',replayed:false,dryRun,receipt};
 }catch(error){await db.query('ROLLBACK').catch(()=>{});throw error;}
}
