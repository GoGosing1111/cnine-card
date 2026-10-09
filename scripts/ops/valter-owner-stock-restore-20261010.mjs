import assert from 'node:assert/strict';

export const OPERATION_KEY='ops:valter-owner-stock-restore:20261010:v1';
export const ORIGINAL_GRANT='ops:pink-valter-chicken-once:20261008:v1';
export const PACK_KEY='mercenary_limited_pack_v1';
export const CODE='V-996';
const one=rows=>{assert.equal(rows.length,1);return rows[0]};
const rows=async(db,sql,values=[])=>(await db.query(sql,values)).rows;

export async function inspectValterStock(db){
 const stock=one(await rows(db,'SELECT * FROM mercenary_limited_stock_v1 WHERE code=$1',[CODE]));
 const packRow=one(await rows(db,'SELECT value FROM app_meta WHERE key=$1',[PACK_KEY]));
 const holders=await rows(db,'SELECT c.user_id,u.nickname,c.total_copies,c.duplicate_count,c.first_obtained_at,c.last_obtained_at FROM user_mercenary_cards_v1 c JOIN users u ON u.id=c.user_id WHERE c.mercenary_code=$1 AND c.total_copies>0 ORDER BY c.user_id',[CODE]);
 const issues=await rows(db,'SELECT * FROM mercenary_limited_issues_v1 WHERE code=$1 ORDER BY serial',[CODE]);
 const saved=await rows(db,'SELECT value FROM app_meta WHERE key=$1',[OPERATION_KEY]);
 return {stock,pack:JSON.parse(packRow.value),packText:packRow.value,holders,issues,receipt:saved[0]?JSON.parse(saved[0].value):null};
}

export async function verifyValterStockRestore(db){
 const state=await inspectValterStock(db),r=state.receipt;assert.equal(r?.operationKey,OPERATION_KEY);assert.equal(r.status,'COMPLETED');
 assert.equal(r.originalGrant,ORIGINAL_GRANT);assert.equal(r.ownerUserId,1);assert.equal(r.restoredCapacity,1);assert.equal(r.before.limit,7);assert.equal(r.after.limit,8);assert.equal(r.before.issued,r.after.issued);
 assert.equal(Number(state.stock.stock_limit),8);assert.equal(state.pack.settings.stockLimits[CODE],8);assert.ok(Number(state.stock.issued)>=r.after.issued);
 assert.equal(state.issues.length,Number(state.stock.issued));assert.equal(new Set(state.issues.map(i=>Number(i.serial))).size,state.issues.length);
 const original=one(state.issues.filter(i=>i.acquisition_id===ORIGINAL_GRANT));assert.equal(Number(original.user_id),1);assert.equal(Number(original.serial),1);
 const audit=one(await rows(db,'SELECT id,after_data FROM admin_logs WHERE action_type=$1 AND target_id=$2 AND after_data LIKE $3',['OPS_LIMITED_STOCK_RESTORE',CODE,'%'+OPERATION_KEY+'%']));
 assert.equal(String(audit.id),r.adminLogId);assert.equal(JSON.parse(audit.after_data).operationKey,OPERATION_KEY);
 return {status:'VERIFIED',receipt:r,stock:state.stock,packRevision:state.pack.revision,packMode:state.pack.settings.mode,holders:state.holders,issues:state.issues};
}

// Stock and CMS configuration share one transaction. No card is granted or
// removed, and the monotonic issue count/serials are never decremented.
export async function restoreValterOwnerStock(db,{dryRun=false}={}){
 await db.query('BEGIN');
 try{
  // Match CMS save lock ordering: configuration first, then stock. Taking this
  // existing row lock before reading our receipt also serializes retries.
  one(await rows(db,'SELECT value FROM app_meta WHERE key=$1 FOR UPDATE',[PACK_KEY]));
  one(await rows(db,'SELECT code FROM mercenary_limited_stock_v1 WHERE code=$1 FOR UPDATE',[CODE]));
  const before=await inspectValterStock(db);
  if(before.receipt){const verification=await verifyValterStockRestore(db);await db.query(dryRun?'ROLLBACK':'COMMIT');return {dryRun,replayed:true,...verification};}
  const owner=one(await rows(db,'SELECT id,nickname,role,status FROM users WHERE id=1'));
  assert.equal(owner.nickname,'핑크빛유두');assert.equal(owner.role,'OWNER');assert.equal(owner.status,'ACTIVE');
  const grant=JSON.parse(one(await rows(db,'SELECT value FROM app_meta WHERE key=$1',[ORIGINAL_GRANT])).value);
  assert.equal(grant.status,'COMPLETED');assert.equal(grant.grant?.userId,1);assert.equal(grant.grant?.code,CODE);assert.equal(grant.grant?.quantity,1);assert.equal(grant.grant?.serial,1);
  const original=one(before.issues.filter(i=>i.acquisition_id===ORIGINAL_GRANT));assert.equal(Number(original.user_id),1);assert.equal(Number(original.serial),1);
  assert.ok(Number(before.holders.find(h=>Number(h.user_id)===1)?.total_copies)>=1,'Original owner card must remain held');
  assert.equal(Number(before.stock.stock_limit),7,'Live stock limit changed; inspect before retrying');assert.equal(before.pack.settings.stockLimits[CODE],7,'CMS and stock limits must agree');
  assert.equal(before.issues.length,Number(before.stock.issued));assert.ok(Number.isSafeInteger(before.pack.revision));
  const now=new Date().toISOString(),next=structuredClone(before.pack);next.settings.stockLimits[CODE]=8;next.revision++;next.updatedAt=now;next.updatedBy=1;next.lastRequestId=OPERATION_KEY;
  one(await rows(db,'UPDATE app_meta SET value=$2,updated_at=$3 WHERE key=$1 AND value=$4 RETURNING key',[PACK_KEY,JSON.stringify(next),now,before.packText]));
  const stock=one(await rows(db,'UPDATE mercenary_limited_stock_v1 SET stock_limit=stock_limit+1,revision=revision+1 WHERE code=$1 AND stock_limit=7 AND revision=$2 AND issued=$3 RETURNING *',[CODE,before.stock.revision,before.stock.issued]));
  assert.equal(Number(stock.issued),Number(before.stock.issued));assert.equal(stock.last_token,before.stock.last_token);
  const after=await inspectValterStock(db);assert.deepEqual(after.holders,before.holders);assert.deepEqual(after.issues,before.issues);assert.deepEqual(after.pack,next);
  const receipt={status:'COMPLETED',operationKey:OPERATION_KEY,originalGrant:ORIGINAL_GRANT,ownerUserId:1,code:CODE,restoredCapacity:1,completedAt:now,
   before:{limit:7,issued:Number(before.stock.issued),remaining:7-Number(before.stock.issued),packRevision:before.pack.revision,stockRevision:Number(before.stock.revision)},
   after:{limit:8,issued:Number(stock.issued),remaining:8-Number(stock.issued),packRevision:next.revision,stockRevision:Number(stock.revision)},
   packMode:next.settings.mode,holdingsPreserved:true,issueSerialsPreserved:true,otherPackSettingsPreserved:true,adminLogId:null};
  const audit=one(await rows(db,'INSERT INTO admin_logs(admin_id,action_type,target_type,target_id,before_data,after_data) VALUES(1,$1,$2,$3,$4,$5) RETURNING id',['OPS_LIMITED_STOCK_RESTORE','MERCENARY_LIMITED_STOCK',CODE,JSON.stringify({stock:before.stock,pack:before.pack}),JSON.stringify(receipt)]));receipt.adminLogId=String(audit.id);
  one(await rows(db,'INSERT INTO app_meta(key,value,updated_at) VALUES($1,$2,$3) RETURNING key',[OPERATION_KEY,JSON.stringify(receipt),now]));
  const verification=await verifyValterStockRestore(db);
  await db.query(dryRun?'ROLLBACK':'COMMIT');return {dryRun,replayed:false,...verification};
 }catch(error){await db.query('ROLLBACK').catch(()=>{});throw error;}
}
