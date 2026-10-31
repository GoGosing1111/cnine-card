import assert from 'node:assert/strict';
import {OP,PACK,CODE,hash,inspect} from './preflight.mjs';
import {validateBlackcrownPack} from '../../tmp/duo-settlement-recovery-20261027/shared/mercenary-blackcrown-pack-v1.mjs';
export const AUTHORIZATION='카드구 블랙크라운팩 한도 2장늘려라';
export const ACTION='MERCENARY_BLACKCROWN_RESTOCK';
const one=rows=>(assert.equal(rows.length,1,'Expected exactly one row'),rows[0]);
const q=async(db,sql,args=[])=>(await db.query(sql,args)).rows;
export function nextDocument(before,at){
 const settings=validateBlackcrownPack(before.settings);
 assert.equal(settings.stockLimits[CODE],5,'Reviewed Cardgu limit changed');
 settings.stockLimits[CODE]=7;validateBlackcrownPack(settings);
 return {...before,revision:before.revision+1,settings,updatedAt:at,updatedBy:1,lastRequestId:OP};
}
export async function verify(db){
 const state=await inspect(db),r=state.receipt;
 assert.equal(r?.status,'COMPLETED');assert.equal(r.operationKey,OP);assert.equal(r.code,CODE);assert.equal(r.added,2);
 assert.equal(r.authorization,AUTHORIZATION);assert.deepEqual(r.after,nextDocument(r.before,r.completedAt));
 assert.deepEqual(r.afterStock,{...r.beforeStock,stock_limit:7,revision:r.beforeStock.revision+1});
 assert.equal(r.issuesBeforeHash,r.issuesAfterHash);assert.equal(r.protectedBeforeHash,r.protectedAfterHash);
 assert.equal(state.document.settings.stockLimits[CODE],7);assert.equal(state.stock.stock_limit,7);
 assert(state.stock.issued>=r.beforeStock.issued&&state.stock.issued<=7,'Unexpected issue counter');
 assert.equal(state.issues.length,state.stock.issued);assert(state.document.revision>=r.after.revision);
 if(state.document.revision===r.after.revision)assert.deepEqual(state.document,r.after);
 const audit=one(await q(db,'SELECT admin_id,action_type,target_id,before_data,after_data FROM admin_logs WHERE id=$1',[r.auditId]));
 assert.equal(Number(audit.admin_id),1);assert.equal(audit.action_type,ACTION);assert.equal(audit.target_id,OP);
 const {auditId,...logged}=r;assert.deepEqual(JSON.parse(audit.after_data),logged);
 assert.deepEqual(JSON.parse(audit.before_data),{document:r.before,stock:r.beforeStock});
 return {verified:true,receipt:r,limit:7,issued:state.stock.issued,remaining:7-state.stock.issued,currentRevision:state.document.revision};
}
export async function increase(db,{expectedDocumentHash,dryRun=true,injectFailure=false}={}){
 if((await q(db,'SELECT key FROM app_meta WHERE key=$1',[OP])).length)return {...await verify(db),replayed:true};
 await db.query('BEGIN');
 try{
  await db.query("SET LOCAL lock_timeout='4s'");await db.query("SET LOCAL statement_timeout='15s'");
  await q(db,'SELECT pg_advisory_xact_lock(hashtext($1))',[OP]);
  const policy=one(await q(db,'SELECT value FROM app_meta WHERE key=$1 FOR UPDATE',[PACK]));
  if((await q(db,'SELECT key FROM app_meta WHERE key=$1',[OP])).length){const result=await verify(db);await db.query('ROLLBACK');return {...result,replayed:true};}
  assert.equal(hash(policy.value),expectedDocumentHash,'Pack policy changed; inspect again');
  one(await q(db,"SELECT id FROM users WHERE id=1 AND role='OWNER' AND status='ACTIVE'"));
  one(await q(db,'SELECT code FROM mercenary_limited_stock_v1 WHERE code=$1 FOR UPDATE',[CODE]));
  const before=await inspect(db);assert.equal(before.stock.stock_limit,5);assert.equal(before.stock.issued,before.issues.length);
  assert(Number.isSafeInteger(before.stock.issued)&&before.stock.issued>=0&&before.stock.issued<=5);
  assert.deepEqual(before.issues.map(row=>Number(row.serial)),Array.from({length:before.stock.issued},(_,i)=>i+1));
  const now=new Date().toISOString(),after=nextDocument(before.document,now);
  one(await q(db,'UPDATE mercenary_limited_stock_v1 SET stock_limit=7,revision=revision+1 WHERE code=$1 AND stock_limit=5 AND issued=$2 AND revision=$3 RETURNING code',[CODE,before.stock.issued,before.stock.revision]));
  if(injectFailure)throw Error('INJECTED_AFTER_STOCK_UPDATE');
  one(await q(db,'UPDATE app_meta SET value=$1,updated_at=$2 WHERE key=$3 AND value=$4 RETURNING key',[JSON.stringify(after),now,PACK,before.raw]));
  const checked=await inspect(db);
  assert.deepEqual(checked.stock,{...before.stock,stock_limit:7,revision:before.stock.revision+1});
  assert.deepEqual(checked.issues,before.issues,'Existing issuance history changed');
  assert.deepEqual(checked.protectedState,before.protectedState,'Unrelated policy or stock limit changed');
  const receipt={status:'COMPLETED',operationKey:OP,authorization:AUTHORIZATION,code:CODE,name:'카드구',added:2,directGrants:0,completedAt:now,
   before:before.document,after,beforeStock:before.stock,afterStock:checked.stock,
   issuesBeforeHash:hash(before.issues),issuesAfterHash:hash(checked.issues),protectedBeforeHash:hash(before.protectedState),protectedAfterHash:hash(checked.protectedState)};
  const audit=one(await q(db,"INSERT INTO admin_logs(admin_id,action_type,target_type,target_id,before_data,after_data) VALUES(1,$1,'SETTING',$2,$3,$4) RETURNING id",[ACTION,OP,JSON.stringify({document:before.document,stock:before.stock}),JSON.stringify(receipt)]));
  receipt.auditId=String(audit.id);
  one(await q(db,'INSERT INTO app_meta(key,value,updated_at) VALUES($1,$2,$3) RETURNING key',[OP,JSON.stringify(receipt),now]));
  const result=await verify(db);await db.query(dryRun?'ROLLBACK':'COMMIT');return {...result,replayed:false,dryRun};
 }catch(error){await db.query('ROLLBACK');throw error;}
}
