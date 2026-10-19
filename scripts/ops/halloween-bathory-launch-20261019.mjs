import assert from 'node:assert/strict';
import {HALLOWEEN_PACK_KEY,readHalloweenPackSettings,validateHalloweenPack} from '../../shared/mercenary-halloween-pack-v1.mjs';
import {limitedRateUnits,LIMITED_RATE_SCALE} from '../../shared/mercenary-limited-rates-v1.mjs';
import {BATHORY_CODE} from '../../shared/mercenary-bathory-v1.mjs';
import {documentHash,verifyBathoryRegistration} from './bathory-registration-20261019.mjs';
export const OPERATION_KEY='ops:bathory-halloween-launch:20261019:v1';
export const ORIGINAL_CODES=Object.freeze(['V-980','V-981','V-982','V-983','V-984','V-985','V-986']);
const allCodes=[BATHORY_CODE,...ORIGINAL_CODES,'V-989','V-996','V-999'].sort();
const query=async(db,sql,args=[])=>(await db.query(sql,args)).rows;
const one=rows=>{assert.equal(rows.length,1,'Expected one row');return rows[0];};
const stockView=rows=>rows.map(s=>({code:s.code,stock_limit:Number(s.stock_limit),issued:Number(s.issued),revision:Number(s.revision)}));
export function prepareHalloweenBathoryLaunch(raw,stock){
 const next=readHalloweenPackSettings(raw);
 assert.equal(next.mode,'ON','Do not reopen an operator-disabled pack');
 assert.equal(next.cardRatesPpm[BATHORY_CODE],0,'Bathory probability already changed');
 assert.equal(next.stockLimits[BATHORY_CODE],10);
 const originalRate=limitedRateUnits(next.cardRatesPpm[ORIGINAL_CODES[0]]);
 assert(originalRate>0&&Number.isSafeInteger(originalRate/2),'Existing odds must have an exact positive half');
 assert(ORIGINAL_CODES.every(code=>limitedRateUnits(next.cardRatesPpm[code])===originalRate),'Existing Halloween odds differ; do not guess a reference');
 const half=originalRate/2,remainder=limitedRateUnits(next.normalSssRatePpm);assert(remainder>=half,'Not enough ordinary SSS remainder');
 for(const code of ORIGINAL_CODES){
  const row=stock.find(s=>s.code===code);assert(row,'Missing seasonal stock');
  assert.equal(next.stockLimits[code],10,'Reviewed seasonal limit changed');
  assert.equal(Number(row.stock_limit),10,'Reviewed stock limit changed');
  assert.equal(Number(row.issued),10,'Only the reviewed sold-out cards may receive a slot');
  next.stockLimits[code]=11;
 }
 next.cardRatesPpm[BATHORY_CODE]=half/LIMITED_RATE_SCALE;
 next.normalSssRatePpm=(remainder-half)/LIMITED_RATE_SCALE;
 return validateHalloweenPack(next);
}
export async function verifyHalloweenBathoryLaunch(db){
 const receipt=JSON.parse(one(await query(db,'SELECT value FROM app_meta WHERE key=$1',[OPERATION_KEY])).value);
 assert.equal(receipt.status,'COMPLETED');assert.equal(receipt.operationKey,OPERATION_KEY);assert.equal(receipt.grants,0);assert.equal(receipt.totalAdded,7);
 assert.deepEqual(receipt.after.settings,prepareHalloweenBathoryLaunch(receipt.before.settings,receipt.beforeStock));
 assert.equal(receipt.after.revision,receipt.before.revision+1);
 const current=JSON.parse(one(await query(db,'SELECT value FROM app_meta WHERE key=$1',[HALLOWEEN_PACK_KEY])).value);
 assert(current.revision>=receipt.after.revision);if(current.revision===receipt.after.revision)assert.deepEqual(current,receipt.after);
 const stock=stockView(await query(db,'SELECT code,stock_limit,issued,revision FROM mercenary_limited_stock_v1 WHERE code=ANY($1::text[]) ORDER BY code',[allCodes]));
 for(const code of [...ORIGINAL_CODES,BATHORY_CODE]){const row=stock.find(s=>s.code===code);assert.equal(row.stock_limit,code===BATHORY_CODE?10:11);assert(row.issued>=(code===BATHORY_CODE?0:10)&&row.issued<=row.stock_limit);}
 const audit=one(await query(db,'SELECT admin_id,action_type,target_id,before_data,after_data FROM admin_logs WHERE id=$1',[receipt.adminLogId]));
 assert.equal(Number(audit.admin_id),1);assert.equal(audit.action_type,'MERCENARY_HALLOWEEN_BATHORY_LAUNCH');assert.equal(audit.target_id,HALLOWEEN_PACK_KEY);
 const {adminLogId,...logged}=receipt;assert.deepEqual(JSON.parse(audit.before_data),{settings:receipt.before,stock:receipt.beforeStock});assert.deepEqual(JSON.parse(audit.after_data),logged);
 return {status:'VERIFIED',receipt,stock,currentRevision:current.revision};
}
export async function launchHalloweenBathory(db,{dryRun=true,expectedDocumentHash,approvalReference=''}={}){
 assert(dryRun||approvalReference.trim(),'User release/odds/restock approval is required');
 await db.query('BEGIN');
 try{
  await db.query("SET LOCAL lock_timeout='4s'");await db.query("SET LOCAL statement_timeout='20s'");
  await query(db,'SELECT pg_advisory_xact_lock(hashtextextended($1,0))',[OPERATION_KEY]);
  const stored=one(await query(db,'SELECT value FROM app_meta WHERE key=$1 FOR UPDATE',[HALLOWEEN_PACK_KEY]));
  if((await query(db,'SELECT key FROM app_meta WHERE key=$1',[OPERATION_KEY])).length){const verified=await verifyHalloweenBathoryLaunch(db);await db.query('ROLLBACK');return{...verified,dryRun,replayed:true};}
  assert.equal(documentHash(stored.value),expectedDocumentHash,'Pack settings changed: re-read before applying');
  one(await query(db,"SELECT id FROM users WHERE id=1 AND role='OWNER' AND status='ACTIVE'"));
  await verifyBathoryRegistration(db);
  const beforeStock=stockView(await query(db,'SELECT code,stock_limit,issued,revision FROM mercenary_limited_stock_v1 WHERE code=ANY($1::text[]) ORDER BY code FOR UPDATE',[allCodes]));
  assert.deepEqual(beforeStock.map(s=>s.code),allCodes);
  const before=JSON.parse(stored.value),settings=prepareHalloweenBathoryLaunch(before.settings,beforeStock),now=new Date().toISOString();
  const after={...before,revision:before.revision+1,settings,updatedAt:now,updatedBy:1,lastRequestId:OPERATION_KEY};
  for(const code of ORIGINAL_CODES)one(await query(db,'UPDATE mercenary_limited_stock_v1 SET stock_limit=stock_limit+1,revision=revision+1 WHERE code=$1 AND stock_limit=10 AND issued=10 RETURNING code',[code]));
  one(await query(db,'UPDATE app_meta SET value=$2,updated_at=$3 WHERE key=$1 AND value=$4 RETURNING key',[HALLOWEEN_PACK_KEY,JSON.stringify(after),now,stored.value]));
  const afterStock=stockView(await query(db,'SELECT code,stock_limit,issued,revision FROM mercenary_limited_stock_v1 WHERE code=ANY($1::text[]) ORDER BY code',[allCodes]));
  for(const row of afterStock){const prior=beforeStock.find(s=>s.code===row.code);assert.deepEqual(row,ORIGINAL_CODES.includes(row.code)?{...prior,stock_limit:prior.stock_limit+1,revision:prior.revision+1}:prior);}
  const receipt={status:'COMPLETED',operationKey:OPERATION_KEY,completedAt:now,approvalReference:dryRun?'TRANSACTION_ROLLBACK_CHECK':approvalReference,bathoryRatePpm:settings.cardRatesPpm[BATHORY_CODE],existingRatesUnchanged:true,addedPerSoldOutCharacter:1,totalAdded:7,grants:0,before,after,beforeStock,afterStock};
  const audit=one(await query(db,"INSERT INTO admin_logs(admin_id,action_type,target_type,target_id,before_data,after_data) VALUES(1,'MERCENARY_HALLOWEEN_BATHORY_LAUNCH','SETTING',$1,$2,$3) RETURNING id",[HALLOWEEN_PACK_KEY,JSON.stringify({settings:before,stock:beforeStock}),JSON.stringify(receipt)]));receipt.adminLogId=String(audit.id);
  one(await query(db,'INSERT INTO app_meta(key,value,updated_at) VALUES($1,$2,$3) RETURNING key',[OPERATION_KEY,JSON.stringify(receipt),now]));
  const verified=await verifyHalloweenBathoryLaunch(db);await db.query(dryRun?'ROLLBACK':'COMMIT');return{...verified,dryRun,replayed:false};
 }catch(error){await db.query('ROLLBACK').catch(()=>{});throw error;}
}
