import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {BATHORY_CODE,BATHORY_SERVER_LIMIT} from '../../shared/mercenary-bathory-v1.mjs';
import {HALLOWEEN_PACK_KEY,readHalloweenPackSettings,validateHalloweenPack} from '../../shared/mercenary-halloween-pack-v1.mjs';
export const OPERATION_KEY='ops:bathory-halloween-registration:20261019:v1';
export const documentHash=value=>createHash('sha256').update(value).digest('hex');
const rows=async(db,sql,args=[])=>(await db.query(sql,args)).rows;
const one=r=>{assert.equal(r.length,1,'Expected one row');return r[0];};
export function prepareBathorySettings(raw){
 assert(!Object.hasOwn(raw.cardRatesPpm,BATHORY_CODE)||raw.cardRatesPpm[BATHORY_CODE]===0,'Bathory probability already edited');
 const settings=readHalloweenPackSettings(raw);
 assert.equal(settings.cardRatesPpm[BATHORY_CODE],0);
 assert.equal(settings.stockLimits[BATHORY_CODE],BATHORY_SERVER_LIMIT);
 validateHalloweenPack(settings,{allowLegacyStock:true});
 return settings;
}
export async function verifyBathoryRegistration(db){
 const receipt=JSON.parse(one(await rows(db,'SELECT value FROM app_meta WHERE key=$1',[OPERATION_KEY])).value);
 assert.equal(receipt.status,'COMPLETED');assert.equal(receipt.operationKey,OPERATION_KEY);assert.equal(receipt.grants,0);
 assert.deepEqual(receipt.after.settings,prepareBathorySettings(receipt.before.settings));
 assert.equal(receipt.after.revision,receipt.before.revision+1);
 const stock=one(await rows(db,'SELECT code,stock_limit,issued FROM mercenary_limited_stock_v1 WHERE code=$1',[BATHORY_CODE]));
 assert.equal(Number(stock.stock_limit),BATHORY_SERVER_LIMIT);assert(Number(stock.issued)>=0&&Number(stock.issued)<=BATHORY_SERVER_LIMIT);
 const current=JSON.parse(one(await rows(db,'SELECT value FROM app_meta WHERE key=$1',[HALLOWEEN_PACK_KEY])).value);
 assert(current.revision>=receipt.after.revision);
 if(current.revision===receipt.after.revision)assert.deepEqual(current,receipt.after);
 const audit=one(await rows(db,'SELECT admin_id,action_type,target_id,before_data,after_data FROM admin_logs WHERE id=$1',[receipt.adminLogId]));
 assert.equal(Number(audit.admin_id),1);assert.equal(audit.action_type,'MERCENARY_BATHORY_REGISTER');assert.equal(audit.target_id,BATHORY_CODE);
 const {adminLogId,...logged}=receipt;assert.deepEqual(JSON.parse(audit.before_data),receipt.before);assert.deepEqual(JSON.parse(audit.after_data),logged);
 return {status:'VERIFIED',receipt,stock,currentRevision:current.revision};
}
export async function registerBathory(db,{dryRun=true,releaseApproved=false,approvalReference='',expectedDocumentHash}={}){
 assert(dryRun||releaseApproved===true&&approvalReference.trim().length>0,'User visual/release approval is required');
 await db.query('BEGIN');
 try{
  await db.query("SET LOCAL lock_timeout='3s'");await db.query("SET LOCAL statement_timeout='15s'");
  await rows(db,'SELECT pg_advisory_xact_lock(hashtextextended($1,0))',[OPERATION_KEY]);
  const stored=one(await rows(db,'SELECT value FROM app_meta WHERE key=$1 FOR UPDATE',[HALLOWEEN_PACK_KEY]));
  if((await rows(db,'SELECT key FROM app_meta WHERE key=$1',[OPERATION_KEY])).length){const result=await verifyBathoryRegistration(db);await db.query('ROLLBACK');return {...result,dryRun,replayed:true};}
  assert.equal(documentHash(stored.value),expectedDocumentHash,'Pack settings changed: review current settings again');
  one(await rows(db,"SELECT id FROM users WHERE id=1 AND role='OWNER' AND status='ACTIVE'"));
  assert.equal((await rows(db,'SELECT code FROM mercenary_limited_stock_v1 WHERE code=$1',[BATHORY_CODE])).length,0,'Existing stock: do not reset');
  assert.equal((await rows(db,'SELECT mercenary_code FROM user_mercenary_cards_v1 WHERE mercenary_code=$1 LIMIT 1',[BATHORY_CODE])).length,0,'Existing ownership');
  assert.equal((await rows(db,'SELECT code FROM mercenary_limited_issues_v1 WHERE code=$1 LIMIT 1',[BATHORY_CODE])).length,0,'Existing issuance');
  assert.equal((await rows(db,'SELECT doc_key FROM mercenary_cms_documents_v1 WHERE payload_json LIKE $1',['%'+BATHORY_CODE+'%'])).length,0,'Existing CMS identity');
  const before=JSON.parse(stored.value),settings=prepareBathorySettings(before.settings),now=new Date().toISOString();
  const after={...before,revision:before.revision+1,settings,updatedAt:now,updatedBy:1,lastRequestId:OPERATION_KEY};
  one(await rows(db,'INSERT INTO mercenary_limited_stock_v1(code,stock_limit,issued) VALUES($1,$2,0) RETURNING code',[BATHORY_CODE,BATHORY_SERVER_LIMIT]));
  one(await rows(db,'UPDATE app_meta SET value=$2,updated_at=$3 WHERE key=$1 AND value=$4 RETURNING key',[HALLOWEEN_PACK_KEY,JSON.stringify(after),now,stored.value]));
  const receipt={status:'COMPLETED',operationKey:OPERATION_KEY,completedAt:now,code:BATHORY_CODE,serverLimit:BATHORY_SERVER_LIMIT,grants:0,otherStockChanged:false,probabilityAssigned:false,approvalReference:dryRun?'LOCAL_TRANSACTION_TEST':approvalReference,before,after};
  const audit=one(await rows(db,"INSERT INTO admin_logs(admin_id,action_type,target_type,target_id,before_data,after_data) VALUES(1,'MERCENARY_BATHORY_REGISTER','MERCENARY',$1,$2,$3) RETURNING id",[BATHORY_CODE,JSON.stringify(before),JSON.stringify(receipt)]));receipt.adminLogId=String(audit.id);
  one(await rows(db,'INSERT INTO app_meta(key,value,updated_at) VALUES($1,$2,$3) RETURNING key',[OPERATION_KEY,JSON.stringify(receipt),now]));
  const result=await verifyBathoryRegistration(db);await db.query(dryRun?'ROLLBACK':'COMMIT');return {...result,dryRun,replayed:false};
 }catch(e){await db.query('ROLLBACK').catch(()=>{});throw e;}
}
