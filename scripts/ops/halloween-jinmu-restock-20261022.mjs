import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {HALLOWEEN_PACK_KEY,readHalloweenPackSettings,validateHalloweenPack} from '../../shared/mercenary-halloween-pack-v1.mjs';
export const OPERATION_KEY='ops:halloween-jinmu-restock:20261022:one-v1';
export const documentHash=raw=>createHash('sha256').update(raw).digest('hex');
const query=async(db,sql,args=[])=>(await db.query(sql,args)).rows;
const one=rows=>{assert.equal(rows.length,1,'Expected one row');return rows[0];};
const stockView=rows=>rows.map(s=>({code:s.code,stock_limit:Number(s.stock_limit),issued:Number(s.issued),revision:Number(s.revision)}));
export function prepareJinmuRestock(raw){
 const next=readHalloweenPackSettings(raw);
 assert.equal(next.mode,'ON','Do not reopen an operator-disabled pack');
 assert.equal(next.stockLimits['V-989'],3,'Reviewed Jinmu limit changed');
 next.stockLimits['V-989']=4;
 return validateHalloweenPack(next);
}
export async function verifyJinmuRestock(db){
 const receipt=JSON.parse(one(await query(db,'SELECT value FROM app_meta WHERE key=$1',[OPERATION_KEY])).value);
 assert.equal(receipt.status,'COMPLETED');assert.equal(receipt.operationKey,OPERATION_KEY);assert.equal(receipt.grants,0);assert.equal(receipt.stockAdded,1);
 assert.deepEqual(receipt.after.settings,prepareJinmuRestock(receipt.before.settings));assert.equal(receipt.after.revision,receipt.before.revision+1);
 const current=JSON.parse(one(await query(db,'SELECT value FROM app_meta WHERE key=$1',[HALLOWEEN_PACK_KEY])).value);
 assert(current.revision>=receipt.after.revision);if(current.revision===receipt.after.revision)assert.deepEqual(current,receipt.after);
 const stock=stockView(await query(db,'SELECT code,stock_limit,issued,revision FROM mercenary_limited_stock_v1 ORDER BY code'));
 const target=stock.find(s=>s.code==='V-989');assert.equal(target.stock_limit,4);assert(target.issued>=receipt.beforeStock.find(s=>s.code==='V-989').issued&&target.issued<=4);
 const audit=one(await query(db,'SELECT admin_id,action_type,target_id,before_data,after_data FROM admin_logs WHERE id=$1',[receipt.adminLogId]));
 assert.equal(Number(audit.admin_id),1);assert.equal(audit.action_type,'MERCENARY_HALLOWEEN_JINMU_RESTOCK');assert.equal(audit.target_id,HALLOWEEN_PACK_KEY);
 const {adminLogId,...logged}=receipt;assert.deepEqual(JSON.parse(audit.before_data),{settings:receipt.before,stock:receipt.beforeStock});assert.deepEqual(JSON.parse(audit.after_data),logged);
 return {status:'VERIFIED',receipt,stock,currentRevision:current.revision};
}
export async function restockJinmu(db,{dryRun=true,expectedDocumentHash,approvalReference=''}={}){
 assert(dryRun||approvalReference.trim(),'User additional-stock instruction is required');
 await db.query('BEGIN');
 try{
  await db.query("SET LOCAL lock_timeout='4s'");await db.query("SET LOCAL statement_timeout='20s'");
  await query(db,'SELECT pg_advisory_xact_lock(hashtextextended($1,0))',[OPERATION_KEY]);
  const stored=one(await query(db,'SELECT value FROM app_meta WHERE key=$1 FOR UPDATE',[HALLOWEEN_PACK_KEY]));
  if((await query(db,'SELECT key FROM app_meta WHERE key=$1',[OPERATION_KEY])).length){const verified=await verifyJinmuRestock(db);await db.query('ROLLBACK');return {...verified,dryRun,replayed:true};}
  assert.equal(documentHash(stored.value),expectedDocumentHash,'Pack settings changed: re-read before applying');
  one(await query(db,"SELECT id FROM users WHERE id=1 AND role='OWNER' AND status='ACTIVE'"));
  const beforeStock=stockView(await query(db,'SELECT code,stock_limit,issued,revision FROM mercenary_limited_stock_v1 ORDER BY code FOR UPDATE'));
  const target=beforeStock.find(s=>s.code==='V-989');assert.equal(target?.stock_limit,3);assert(target.issued>=0&&target.issued<=3);
  const before=JSON.parse(stored.value),settings=prepareJinmuRestock(before.settings),now=new Date().toISOString();
  const after={...before,revision:before.revision+1,settings,updatedAt:now,updatedBy:1,lastRequestId:OPERATION_KEY};
  one(await query(db,"UPDATE mercenary_limited_stock_v1 SET stock_limit=4,revision=revision+1 WHERE code='V-989' AND stock_limit=3 AND issued=$1 RETURNING code",[target.issued]));
  one(await query(db,'UPDATE app_meta SET value=$2,updated_at=$3 WHERE key=$1 AND value=$4 RETURNING key',[HALLOWEEN_PACK_KEY,JSON.stringify(after),now,stored.value]));
  const afterStock=stockView(await query(db,'SELECT code,stock_limit,issued,revision FROM mercenary_limited_stock_v1 ORDER BY code'));
  assert.deepEqual(afterStock,beforeStock.map(s=>s.code==='V-989'?{...s,stock_limit:4,revision:s.revision+1}:s));
  const receipt={status:'COMPLETED',operationKey:OPERATION_KEY,completedAt:now,approvalReference:dryRun?'TRANSACTION_ROLLBACK_CHECK':approvalReference,
   stockAdded:1,grants:0,ratesUnchanged:true,issuedUnchanged:true,before,after,beforeStock,afterStock};
  const audit=one(await query(db,"INSERT INTO admin_logs(admin_id,action_type,target_type,target_id,before_data,after_data) VALUES(1,'MERCENARY_HALLOWEEN_JINMU_RESTOCK','SETTING',$1,$2,$3) RETURNING id",
   [HALLOWEEN_PACK_KEY,JSON.stringify({settings:before,stock:beforeStock}),JSON.stringify(receipt)]));receipt.adminLogId=String(audit.id);
  one(await query(db,'INSERT INTO app_meta(key,value,updated_at) VALUES($1,$2,$3) RETURNING key',[OPERATION_KEY,JSON.stringify(receipt),now]));
  const verified=await verifyJinmuRestock(db);await db.query(dryRun?'ROLLBACK':'COMMIT');return {...verified,dryRun,replayed:false};
 }catch(error){await db.query('ROLLBACK').catch(()=>{});throw error;}
}
