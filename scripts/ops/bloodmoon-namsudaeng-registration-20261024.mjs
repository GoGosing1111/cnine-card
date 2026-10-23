import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {NAMSUDAENG_CODE} from '../../shared/mercenary-bloodmoon-namsudaeng-v1.mjs';
import {BLOODMOON_PACK_KEY} from '../../shared/mercenary-bloodmoon-pack-v1.mjs';
export const NAMSUDAENG_REGISTRATION_KEY='ops:bloodmoon-namsudaeng-registration:20261024:v1';
const hash=s=>createHash('sha256').update(s??'null').digest('hex');
export async function readNamsudaengRegistration(db){
 const stock=(await db.query('SELECT code,stock_limit,issued,revision FROM mercenary_limited_stock_v1 WHERE code=$1',[NAMSUDAENG_CODE])).rows;
 const pack=(await db.query('SELECT value FROM app_meta WHERE key=$1',[BLOODMOON_PACK_KEY])).rows[0]?.value??null;
 const receipt=(await db.query('SELECT value FROM app_meta WHERE key=$1',[NAMSUDAENG_REGISTRATION_KEY])).rows[0]?.value;
 const owned=Number((await db.query('SELECT COUNT(*) AS count FROM user_mercenary_cards_v1 WHERE mercenary_code=$1',[NAMSUDAENG_CODE])).rows[0].count);
 const issues=Number((await db.query('SELECT COUNT(*) AS count FROM mercenary_limited_issues_v1 WHERE code=$1',[NAMSUDAENG_CODE])).rows[0].count);
 return {stock:stock.map(s=>({code:s.code,limit:Number(s.stock_limit),issued:Number(s.issued),revision:Number(s.revision)})),
  packSha256:hash(pack),packMode:pack?JSON.parse(pack).settings.mode:null,packRevision:pack?JSON.parse(pack).revision:null,
  receipt:receipt?JSON.parse(receipt):null,ownershipRows:owned,issueRows:issues};
}
export async function registerNamsudaengStock(db,{dryRun=false}={}){
 await db.query('BEGIN');
 try{
  await db.query("SET LOCAL lock_timeout='3s'");await db.query("SET LOCAL statement_timeout='15s'");
  await db.query('SELECT pg_advisory_xact_lock(hashtext($1))',[NAMSUDAENG_REGISTRATION_KEY]);
  assert.equal((await db.query('SELECT role FROM users WHERE id=1')).rows[0]?.role,'OWNER');
  const before=await readNamsudaengRegistration(db);
  if(before.receipt){assert.equal(before.stock[0]?.limit,10);await db.query(dryRun?'ROLLBACK':'COMMIT');return {status:'VERIFIED',replayed:true,...before};}
  assert.equal(before.stock.length,0,'Unexpected existing NamSuDaeng stock');assert.equal(before.ownershipRows,0);assert.equal(before.issueRows,0);
  const existing=(await db.query('SELECT code,stock_limit,issued,revision FROM mercenary_limited_stock_v1 WHERE code<>$1 ORDER BY code',[NAMSUDAENG_CODE])).rows;
  await db.query('INSERT INTO mercenary_limited_stock_v1(code,stock_limit,issued) VALUES($1,10,0)',[NAMSUDAENG_CODE]);
  const receipt={operationKey:NAMSUDAENG_REGISTRATION_KEY,approval:'승인하고 라이브 반영, 그리고 블러드문팩에도 올려 10장 똑같이 / 이름 블러드문 남수댕',
   code:NAMSUDAENG_CODE,name:'블러드문 남수댕',rank:'SS',limit:10,grants:0,packSha256:before.packSha256,packSettingsChanged:false,createdAt:new Date().toISOString()};
  const log=(await db.query('INSERT INTO admin_logs(admin_id,action_type,target_type,target_id,before_data,after_data) VALUES(1,$1,$2,$3,$4,$5) RETURNING id',
   ['MERCENARY_BLOODMOON_NAMSUDAENG_REGISTER','MERCENARY',NAMSUDAENG_CODE,JSON.stringify(before),JSON.stringify(receipt)])).rows[0];
  receipt.adminLogId=String(log.id);await db.query('INSERT INTO app_meta(key,value) VALUES($1,$2)',[NAMSUDAENG_REGISTRATION_KEY,JSON.stringify(receipt)]);
  const after=await readNamsudaengRegistration(db);assert.equal(after.stock[0].limit,10);assert.equal(after.stock[0].issued,0);assert.equal(after.ownershipRows,0);assert.equal(after.issueRows,0);
  assert.equal(after.packSha256,before.packSha256);assert.deepEqual((await db.query('SELECT code,stock_limit,issued,revision FROM mercenary_limited_stock_v1 WHERE code<>$1 ORDER BY code',[NAMSUDAENG_CODE])).rows,existing);
  await db.query(dryRun?'ROLLBACK':'COMMIT');return {status:dryRun?'DRY_RUN_PASSED':'APPLIED',replayed:false,...after};
 }catch(e){await db.query('ROLLBACK');throw e;}
}
