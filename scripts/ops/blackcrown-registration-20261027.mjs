import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {BLACKCROWN_MERCENARIES,BLACKCROWN_CODES} from '../../shared/mercenary-blackcrown-catalog-v1.mjs';
import {BLACKCROWN_PACK_KEY,validateBlackcrownPack} from '../../shared/mercenary-blackcrown-pack-v1.mjs';
import {BLOODMOON_PACK_KEY,readBloodmoonPackSettings} from '../../shared/mercenary-bloodmoon-pack-v1.mjs';
export const BLACKCROWN_REGISTRATION_KEY='ops:blackcrown-pack-clone:20261027:v1';
const digest=value=>createHash('sha256').update(JSON.stringify(value)).digest('hex');
export function cloneBlackcrownSettings(raw){
 const source=readBloodmoonPackSettings(raw),mapping=Object.fromEntries(BLACKCROWN_MERCENARIES.map(c=>[c.templateCode,c.code]));
 const cardRatesPpm=Object.fromEntries(Object.entries(source.cardRatesPpm).filter(([code])=>mapping[code]||code==='V-058').map(([code,rate])=>[mapping[code]||code,rate]));
 const removed=['V-978','V-974','V-975','V-973'];const rates=[source.normalSssRatePpm,...removed.map(code=>source.cardRatesPpm[code])];
 const normalSssRatePpm=rates.some(rate=>rate==null)?null:rates.reduce((sum,rate)=>sum+Math.round(rate*10000),0)/10000;
 return validateBlackcrownPack({...structuredClone(source),mode:'OFF',format:'MERCENARY_BLACKCROWN_SS_PACK_V3',cardRatesPpm,normalSssRatePpm,stockLimits:Object.fromEntries(BLACKCROWN_CODES.map(code=>[code,10]))});
}
export async function inspectBlackcrownRegistration(db){
 const rows=(await db.query('SELECT key,value FROM app_meta WHERE key=ANY($1::text[]) ORDER BY key',[[BLACKCROWN_PACK_KEY,BLOODMOON_PACK_KEY,BLACKCROWN_REGISTRATION_KEY]])).rows;
 const get=key=>{const row=rows.find(r=>r.key===key);return row?JSON.parse(row.value):null;};
 const source=get(BLOODMOON_PACK_KEY),pack=get(BLACKCROWN_PACK_KEY),receipt=get(BLACKCROWN_REGISTRATION_KEY);
 assert(source,'Bloodmoon settings must exist');
 const stock=(await db.query('SELECT code,stock_limit,issued,revision FROM mercenary_limited_stock_v1 WHERE code=ANY($1::text[]) ORDER BY code',[BLACKCROWN_CODES])).rows;
 const occupied=(await db.query('SELECT mercenary_code,COUNT(*) AS owners FROM user_mercenary_cards_v1 WHERE mercenary_code=ANY($1::text[]) GROUP BY mercenary_code ORDER BY mercenary_code',[BLACKCROWN_CODES])).rows;
 const issues=(await db.query('SELECT COUNT(*) AS count FROM mercenary_limited_issues_v1 WHERE code=ANY($1::text[])',[BLACKCROWN_CODES])).rows[0];
 const sourceStock=(await db.query('SELECT code,stock_limit,issued,revision FROM mercenary_limited_stock_v1 WHERE code=ANY($1::text[]) ORDER BY code',[Object.keys(source.settings.stockLimits)])).rows;
 return {source,sourceSha256:digest(source),pack,receipt,stock,occupied,issueCount:Number(issues.count),sourceStock,sourceStockSha256:digest(sourceStock)};
}
export async function registerBlackcrownPack(db,{dryRun=false,expectedSourceSha256,failAfterWrite=false}={}){
 // Completed operations are SELECT-only and never restore old live settings.
 const done=(await db.query('SELECT value FROM app_meta WHERE key=$1',[BLACKCROWN_REGISTRATION_KEY])).rows[0];
 if(done)return {status:'ALREADY_APPLIED',replayed:true,receipt:JSON.parse(done.value)};
 await db.query('BEGIN');
 try{
  await db.query("SET LOCAL lock_timeout='3s'");await db.query("SET LOCAL statement_timeout='15s'");
  await db.query('SELECT pg_advisory_xact_lock(hashtext($1))',[BLACKCROWN_REGISTRATION_KEY]);
  const raced=(await db.query('SELECT value FROM app_meta WHERE key=$1',[BLACKCROWN_REGISTRATION_KEY])).rows[0];
  if(raced){await db.query('ROLLBACK');return {status:'ALREADY_APPLIED',replayed:true,receipt:JSON.parse(raced.value)};}
  await db.query('SELECT value FROM app_meta WHERE key=$1 FOR SHARE',[BLOODMOON_PACK_KEY]);
  const before=await inspectBlackcrownRegistration(db);
  assert.equal(before.sourceSha256,expectedSourceSha256,'Source changed: read the current policy again');
  assert.equal(before.pack,null,'A Black Crown policy already exists');assert.equal(before.stock.length,0);assert.equal(before.occupied.length,0);assert.equal(before.issueCount,0);
  const owner=(await db.query('SELECT role FROM users WHERE id=1')).rows[0];assert.equal(owner?.role,'OWNER');
  const settings=cloneBlackcrownSettings(before.source.settings),now=new Date().toISOString();
  for(const code of BLACKCROWN_CODES)await db.query('INSERT INTO mercenary_limited_stock_v1(code,stock_limit,issued) VALUES($1,$2,0)',[code,settings.stockLimits[code]]);
  const pack={revision:1,settings,updatedAt:now,updatedBy:1,clonedFrom:{key:BLOODMOON_PACK_KEY,revision:before.source.revision,sha256:before.sourceSha256}};
  await db.query('INSERT INTO app_meta(key,value) VALUES($1,$2)',[BLACKCROWN_PACK_KEY,JSON.stringify(pack)]);
  if(failAfterWrite)throw Error('BLACKCROWN_INJECTED_FAILURE');
  const receipt={operationKey:BLACKCROWN_REGISTRATION_KEY,createdAt:now,approval:'블러드문팩과 동일하게 블랙크라운팩 복사하고 CMS추가 / 블랙크라운 SS 리미티드의 서로 다른 종류 수',sourceRevision:before.source.revision,sourceSha256:before.sourceSha256,codes:BLACKCROWN_CODES,settings,ssStock:'SEPARATE_NEW_CODES',sssStock:'EXISTING_SHARED',grants:0};
  const log=(await db.query('INSERT INTO admin_logs(admin_id,action_type,target_type,target_id,before_data,after_data) VALUES(1,$1,$2,$3,$4,$5) RETURNING id',['MERCENARY_BLACKCROWN_REGISTER','SETTING',BLACKCROWN_PACK_KEY,JSON.stringify({source:before.source,sourceStock:before.sourceStock}),JSON.stringify(receipt)])).rows[0];
  receipt.adminLogId=String(log.id);
  await db.query('INSERT INTO app_meta(key,value) VALUES($1,$2)',[BLACKCROWN_REGISTRATION_KEY,JSON.stringify(receipt)]);
  const after=await inspectBlackcrownRegistration(db);
  assert.deepEqual(after.source,before.source);assert.equal(after.sourceStockSha256,before.sourceStockSha256);
  assert.equal(after.occupied.length,0);assert.equal(after.issueCount,0);assert.equal(after.stock.length,6);
  assert.deepEqual(after.pack.settings,settings);
  await db.query(dryRun?'ROLLBACK':'COMMIT');
  return {status:dryRun?'DRY_RUN_PASSED':'APPLIED',replayed:false,...after};
 }catch(error){await db.query('ROLLBACK');throw error;}
}
