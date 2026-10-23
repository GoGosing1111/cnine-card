import assert from 'node:assert/strict';
import {BLOODMOON_CODES,BLOODMOON_SERVER_LIMIT} from '../../shared/mercenary-bloodmoon-catalog-v1.mjs';
import {BLOODMOON_PACK_KEY,legacyBloodmoonPackDraft as bloodmoonPackDraft} from '../../shared/mercenary-bloodmoon-pack-v1.mjs';
export const BLOODMOON_REGISTRATION_KEY='ops:bloodmoon-codex-registration:20261023:v1';
export async function readBloodmoonRegistration(db){
 const stock=(await db.query('SELECT code,stock_limit,issued,revision FROM mercenary_limited_stock_v1 WHERE code=ANY($1::text[]) ORDER BY code',[BLOODMOON_CODES])).rows;
 const settings=(await db.query('SELECT value FROM app_meta WHERE key=$1',[BLOODMOON_PACK_KEY])).rows[0];
 const receipt=(await db.query('SELECT value FROM app_meta WHERE key=$1',[BLOODMOON_REGISTRATION_KEY])).rows[0];
 const owned=(await db.query('SELECT mercenary_code FROM user_mercenary_cards_v1 WHERE mercenary_code=ANY($1::text[])',[BLOODMOON_CODES])).rows;
 const issues=(await db.query('SELECT code FROM mercenary_limited_issues_v1 WHERE code=ANY($1::text[])',[BLOODMOON_CODES])).rows;
 return {stock:stock.map(s=>({code:s.code,limit:Number(s.stock_limit),issued:Number(s.issued),revision:Number(s.revision)})),settings:settings?JSON.parse(settings.value):null,receipt:receipt?JSON.parse(receipt.value):null,ownershipRows:owned.length,issueRows:issues.length};
}
function verify(state){
 assert.deepEqual(state.stock.map(s=>s.code),BLOODMOON_CODES);
 for(const stock of state.stock){assert.equal(stock.limit,BLOODMOON_SERVER_LIMIT);assert.equal(stock.issued,0);}
 assert.deepEqual(state.settings?.settings,bloodmoonPackDraft());assert.equal(state.ownershipRows,0);assert.equal(state.issueRows,0);
 assert.equal(state.receipt?.operationKey,BLOODMOON_REGISTRATION_KEY);
 return state;
}
export async function registerBloodmoonCodex(db,{dryRun=false}={}){
 await db.query('BEGIN');
 try{
  await db.query("SET LOCAL lock_timeout='3s'");await db.query("SET LOCAL statement_timeout='15s'");
  await db.query('SELECT pg_advisory_xact_lock(hashtext($1))',[BLOODMOON_REGISTRATION_KEY]);
  const owner=(await db.query('SELECT role FROM users WHERE id=1')).rows[0];assert.equal(owner?.role,'OWNER');
  const before=await readBloodmoonRegistration(db);
  if(before.receipt){const result=verify(before);await db.query(dryRun?'ROLLBACK':'COMMIT');return {status:'VERIFIED',replayed:true,...result};}
  assert.equal(before.stock.length,0,'Unregistered stock already exists');assert.equal(before.settings,null,'Unregistered pack settings already exist');
  assert.equal(before.ownershipRows,0);assert.equal(before.issueRows,0);
  for(const code of BLOODMOON_CODES)await db.query('INSERT INTO mercenary_limited_stock_v1(code,stock_limit,issued) VALUES($1,$2,0)',[code,BLOODMOON_SERVER_LIMIT]);
  const settings={revision:1,settings:bloodmoonPackDraft(),updatedAt:new Date().toISOString()};
  await db.query('INSERT INTO app_meta(key,value) VALUES($1,$2)',[BLOODMOON_PACK_KEY,JSON.stringify(settings)]);
  const receipt={operationKey:BLOODMOON_REGISTRATION_KEY,approval:'리미티드 도감에 반영해 한도 10장씩 현재는 개봉불가 / SS 리미티드',codes:BLOODMOON_CODES,rank:'SS',limitPerCharacter:10,mode:'OFF',grants:0,createdAt:settings.updatedAt};
  const log=(await db.query('INSERT INTO admin_logs(admin_id,action_type,target_type,target_id,before_data,after_data) VALUES(1,$1,$2,$3,$4,$5) RETURNING id',['MERCENARY_BLOODMOON_CODEX_REGISTER','SETTING',BLOODMOON_PACK_KEY,JSON.stringify(before),JSON.stringify(receipt)])).rows[0];
  receipt.adminLogId=String(log.id);
  await db.query('INSERT INTO app_meta(key,value) VALUES($1,$2)',[BLOODMOON_REGISTRATION_KEY,JSON.stringify(receipt)]);
  const result=verify(await readBloodmoonRegistration(db));await db.query(dryRun?'ROLLBACK':'COMMIT');
  return {status:dryRun?'DRY_RUN_PASSED':'APPLIED',replayed:false,...result};
 }catch(error){await db.query('ROLLBACK');throw error;}
}
