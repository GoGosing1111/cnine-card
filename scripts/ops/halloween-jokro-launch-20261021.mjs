import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {HALLOWEEN_PACK_KEY,readHalloweenPackSettings,validateHalloweenPack,halloweenEffectivePercent} from '../../shared/mercenary-halloween-pack-v1.mjs';
import {limitedRateUnits,LIMITED_RATE_SCALE} from '../../shared/mercenary-limited-rates-v1.mjs';
import {JOKRO_CODE} from '../../shared/mercenary-jokro-v1.mjs';
export const OPERATION_KEY='ops:halloween-jokro-launch:20261021:v1';
export const documentHash=raw=>createHash('sha256').update(raw).digest('hex');
const query=async(db,sql,args=[])=>(await db.query(sql,args)).rows;
const one=rows=>{assert.equal(rows.length,1,'Expected one row');return rows[0];};
const stockView=rows=>rows.map(s=>({code:s.code,stock_limit:Number(s.stock_limit),issued:Number(s.issued),revision:Number(s.revision)}));
export function prepareHalloweenJokroLaunch(raw,stock){
 const next=readHalloweenPackSettings(raw);
 assert.equal(next.mode,'ON','Do not reopen an operator-disabled pack');
 assert.equal(next.cardRatesPpm[JOKRO_CODE],0,'Jokro probability already changed');
 assert.equal(next.stockLimits[JOKRO_CODE],3);
 const helios=stock.find(s=>s.code==='V-999');
 assert(helios&&Number(helios.stock_limit)>0&&Number(helios.issued)===Number(helios.stock_limit),'Helios must remain sold out');
 const reference=limitedRateUnits(next.cardRatesPpm['V-989']),remainder=limitedRateUnits(next.normalSssRatePpm);
 assert(reference>0&&next.normalRankRatesPpm.SSS>0,'Jinmu must have positive configured odds');
 assert(remainder>=reference,'Not enough ordinary SSS remainder');
 next.cardRatesPpm[JOKRO_CODE]=reference/LIMITED_RATE_SCALE;
 next.normalSssRatePpm=(remainder-reference)/LIMITED_RATE_SCALE;
 return validateHalloweenPack(next);
}
export async function verifyHalloweenJokroLaunch(db){
 const receipt=JSON.parse(one(await query(db,'SELECT value FROM app_meta WHERE key=$1',[OPERATION_KEY])).value);
 assert.equal(receipt.status,'COMPLETED');assert.equal(receipt.operationKey,OPERATION_KEY);assert.equal(receipt.grants,0);
 assert.deepEqual(receipt.after.settings,prepareHalloweenJokroLaunch(receipt.before.settings,receipt.beforeStock));
 assert.equal(receipt.after.revision,receipt.before.revision+1);
 const current=JSON.parse(one(await query(db,'SELECT value FROM app_meta WHERE key=$1',[HALLOWEEN_PACK_KEY])).value);
 assert(current.revision>=receipt.after.revision);if(current.revision===receipt.after.revision)assert.deepEqual(current,receipt.after);
 const stock=stockView(await query(db,'SELECT code,stock_limit,issued,revision FROM mercenary_limited_stock_v1 ORDER BY code'));
 const jokro=stock.find(s=>s.code===JOKRO_CODE);assert.equal(jokro?.stock_limit,3);assert(jokro.issued>=0&&jokro.issued<=3);
 const helios=stock.find(s=>s.code==='V-999'),previousHelios=receipt.beforeStock.find(s=>s.code==='V-999');
 assert.equal(helios.stock_limit,previousHelios.stock_limit);assert.equal(helios.issued,previousHelios.issued);
 const audit=one(await query(db,'SELECT admin_id,action_type,target_id,before_data,after_data FROM admin_logs WHERE id=$1',[receipt.adminLogId]));
 assert.equal(Number(audit.admin_id),1);assert.equal(audit.action_type,'MERCENARY_HALLOWEEN_JOKRO_LAUNCH');assert.equal(audit.target_id,HALLOWEEN_PACK_KEY);
 const {adminLogId,...logged}=receipt;
 assert.deepEqual(JSON.parse(audit.before_data),{settings:receipt.before,stock:receipt.beforeStock});assert.deepEqual(JSON.parse(audit.after_data),logged);
 return {status:'VERIFIED',receipt,stock,currentRevision:current.revision};
}
export async function launchHalloweenJokro(db,{dryRun=true,expectedDocumentHash,approvalReference=''}={}){
 assert(dryRun||approvalReference.trim(),'User release/odds/quantity instruction is required');
 await db.query('BEGIN');
 try{
  await db.query("SET LOCAL lock_timeout='4s'");await db.query("SET LOCAL statement_timeout='20s'");
  await query(db,'SELECT pg_advisory_xact_lock(hashtextextended($1,0))',[OPERATION_KEY]);
  const stored=one(await query(db,'SELECT value FROM app_meta WHERE key=$1 FOR UPDATE',[HALLOWEEN_PACK_KEY]));
  if((await query(db,'SELECT key FROM app_meta WHERE key=$1',[OPERATION_KEY])).length){
   const verified=await verifyHalloweenJokroLaunch(db);await db.query('ROLLBACK');return {...verified,dryRun,replayed:true};
  }
  assert.equal(documentHash(stored.value),expectedDocumentHash,'Pack settings changed: re-read before applying');
  one(await query(db,"SELECT id FROM users WHERE id=1 AND role='OWNER' AND status='ACTIVE'"));
  const beforeStock=stockView(await query(db,'SELECT code,stock_limit,issued,revision FROM mercenary_limited_stock_v1 ORDER BY code FOR UPDATE'));
  assert(!beforeStock.some(s=>s.code===JOKRO_CODE),'Jokro stock already exists; do not reset issuance');
  assert.equal((await query(db,'SELECT code FROM mercenary_limited_issues_v1 WHERE code=$1 LIMIT 1',[JOKRO_CODE])).length,0,'Existing Jokro issuance requires review');
  const before=JSON.parse(stored.value),settings=prepareHalloweenJokroLaunch(before.settings,beforeStock),now=new Date().toISOString();
  const after={...before,revision:before.revision+1,settings,updatedAt:now,updatedBy:1,lastRequestId:OPERATION_KEY};
  one(await query(db,'INSERT INTO mercenary_limited_stock_v1(code,stock_limit,issued,revision) VALUES($1,3,0,0) RETURNING code',[JOKRO_CODE]));
  one(await query(db,'UPDATE app_meta SET value=$2,updated_at=$3 WHERE key=$1 AND value=$4 RETURNING key',[HALLOWEEN_PACK_KEY,JSON.stringify(after),now,stored.value]));
  const afterStock=stockView(await query(db,'SELECT code,stock_limit,issued,revision FROM mercenary_limited_stock_v1 ORDER BY code'));
  assert.deepEqual(afterStock.filter(s=>s.code!==JOKRO_CODE),beforeStock);
  assert.deepEqual(afterStock.find(s=>s.code===JOKRO_CODE),{code:JOKRO_CODE,stock_limit:3,issued:0,revision:0});
  const receipt={status:'COMPLETED',operationKey:OPERATION_KEY,completedAt:now,approvalReference:dryRun?'TRANSACTION_ROLLBACK_CHECK':approvalReference,
   jokroRatePpm:settings.cardRatesPpm[JOKRO_CODE],effectivePercent:halloweenEffectivePercent(settings.normalRankRatesPpm.SSS,settings.cardRatesPpm[JOKRO_CODE]),
   stockAdded:3,grants:0,existingRatesUnchanged:true,exclusiveGrantExcluded:true,before,after,beforeStock,afterStock};
  const audit=one(await query(db,"INSERT INTO admin_logs(admin_id,action_type,target_type,target_id,before_data,after_data) VALUES(1,'MERCENARY_HALLOWEEN_JOKRO_LAUNCH','SETTING',$1,$2,$3) RETURNING id",
   [HALLOWEEN_PACK_KEY,JSON.stringify({settings:before,stock:beforeStock}),JSON.stringify(receipt)]));
  receipt.adminLogId=String(audit.id);
  one(await query(db,'INSERT INTO app_meta(key,value,updated_at) VALUES($1,$2,$3) RETURNING key',[OPERATION_KEY,JSON.stringify(receipt),now]));
  const verified=await verifyHalloweenJokroLaunch(db);await db.query(dryRun?'ROLLBACK':'COMMIT');return {...verified,dryRun,replayed:false};
 }catch(error){await db.query('ROLLBACK').catch(()=>{});throw error;}
}
