import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {BLOODMOON_PACK_KEY,BLOODMOON_PACK_RELEASE_ENABLED,readBloodmoonPackSettings,validateBloodmoonPack} from '../../shared/mercenary-bloodmoon-pack-v1.mjs';
// Preserve the original 5/3/3 opening authorization for this historical operation.
const BLOODMOON_SSS_STOCK_LIMITS=Object.freeze({'V-978':5,'V-974':3,'V-975':3});
import {PRIME_CRAFT_RELEASE_ENABLED} from '../../shared/mercenary-prime-material-v1.mjs';
import {readBloodmoonPackState} from '../../functions/_mercenary_bloodmoon_pack.js';
import {__postgresCompatTest} from '../../functions/_postgres_d1_compat.js';

export const BLOODMOON_OPEN_OPERATION='ops:bloodmoon-open:20261025:v1';
const codes=Object.keys(BLOODMOON_SSS_STOCK_LIMITS),hash=s=>createHash('sha256').update(s??'null').digest('hex');
const protectedKeys=['mercenary_halloween_ss_pack_v1','mercenary_prime_craft_v1'];
const adapter=db=>({DB:new __postgresCompatTest.PostgresD1Database({query:input=>db.query(typeof input==='string'?input:input.text,typeof input==='string'?[]:input.values||[])})});
export async function readBloodmoonOpening(db){
 const pack=(await db.query('SELECT value FROM app_meta WHERE key=$1',[BLOODMOON_PACK_KEY])).rows[0]?.value??null;
 const receipt=(await db.query('SELECT value FROM app_meta WHERE key=$1',[BLOODMOON_OPEN_OPERATION])).rows[0]?.value;
 const stock=(await db.query('SELECT code,stock_limit,issued,revision FROM mercenary_limited_stock_v1 WHERE code=ANY($1::text[]) ORDER BY code',[codes])).rows;
 const protectedSettings=(await db.query('SELECT key,value FROM app_meta WHERE key=ANY($1::text[]) ORDER BY key',[protectedKeys])).rows;
 const ownership=(await db.query('SELECT row_to_json(t) AS row FROM user_mercenary_cards_v1 t WHERE mercenary_code=ANY($1::text[]) ORDER BY user_id,mercenary_code',[codes])).rows;
 return {pack:pack?JSON.parse(pack):null,packSha256:hash(pack),stock,protectedSettingsSha256:hash(JSON.stringify(protectedSettings)),ownershipSha256:hash(JSON.stringify(ownership)),receipt:receipt?JSON.parse(receipt):null};
}
export async function enableBloodmoonOpening(db,{dryRun=false,expectedPackSha256}={}){
 assert.equal(BLOODMOON_PACK_RELEASE_ENABLED,true);assert.equal(PRIME_CRAFT_RELEASE_ENABLED,false);
 await db.query('BEGIN');
 try{
  await db.query("SET LOCAL lock_timeout='3s'");await db.query("SET LOCAL statement_timeout='15s'");
  await db.query('SELECT pg_advisory_xact_lock(hashtext($1))',[BLOODMOON_OPEN_OPERATION]);
  assert.equal((await db.query('SELECT role FROM users WHERE id=1')).rows[0]?.role,'OWNER');
  await db.query('SELECT value FROM app_meta WHERE key=$1 FOR UPDATE',[BLOODMOON_PACK_KEY]);
  const before=await readBloodmoonOpening(db);
  if(before.receipt){await db.query('ROLLBACK');return {status:'ALREADY_APPLIED',replayed:true,...before};}
  assert.equal(before.packSha256,expectedPackSha256,'Pack changed since reviewed preflight');assert(before.pack);assert.equal(before.pack.settings.mode,'OFF');
  assert.equal(before.stock.length,0,'Refuse to reset existing SSS pack stock');
  assert.equal(Number((await db.query('SELECT COUNT(*) AS n FROM mercenary_limited_issues_v1 WHERE code=ANY($1::text[])',[codes])).rows[0].n),0,'Unexpected existing SSS pack issues');
  for(const [code,limit] of Object.entries(BLOODMOON_SSS_STOCK_LIMITS))await db.query('INSERT INTO mercenary_limited_stock_v1(code,stock_limit,issued) VALUES($1,$2,0)',[code,limit]);
  const prior=readBloodmoonPackSettings(before.pack.settings);
  const settings=validateBloodmoonPack({...prior,stockLimits:{...prior.stockLimits,...BLOODMOON_SSS_STOCK_LIMITS},mode:'ON'},{allowLegacyStock:true});
  const next={...before.pack,revision:before.pack.revision+1,settings,updatedAt:new Date().toISOString(),updatedBy:1,lastRequestId:'bloodmoon-open-20261025-v1'};
  const changed=await db.query('UPDATE app_meta SET value=$1 WHERE key=$2 AND value::jsonb=$3::jsonb RETURNING key',[JSON.stringify(next),BLOODMOON_PACK_KEY,JSON.stringify(before.pack)]);
  assert.equal(changed.rows.length,1,'Pack compare-and-swap failed');
  const state=await readBloodmoonPackState(adapter(db));assert.equal(state.userOpeningEnabled,true,state.readiness.blockers.join(' '));
  const receipt={operationKey:BLOODMOON_OPEN_OPERATION,approval:'블러드팩 블러드문팩으로 이름바꾸고 개봉 ON시켜 / 레오넬 5장 · 제너럴 족 3장 · 프라임 재료 3장',limits:BLOODMOON_SSS_STOCK_LIMITS,beforeRevision:before.pack.revision,revision:next.revision,grants:0,charges:0,primeCraftLocked:true,createdAt:next.updatedAt};
  const log=(await db.query('INSERT INTO admin_logs(admin_id,action_type,target_type,target_id,before_data,after_data) VALUES(1,$1,$2,$3,$4,$5) RETURNING id',['MERCENARY_BLOODMOON_OPEN_ENABLE','SETTING',BLOODMOON_PACK_KEY,JSON.stringify(before),JSON.stringify({...receipt,settings})])).rows[0];
  receipt.adminLogId=String(log.id);await db.query('INSERT INTO app_meta(key,value) VALUES($1,$2)',[BLOODMOON_OPEN_OPERATION,JSON.stringify(receipt)]);
  const after=await readBloodmoonOpening(db);assert.equal(after.protectedSettingsSha256,before.protectedSettingsSha256);assert.equal(after.ownershipSha256,before.ownershipSha256);
  assert.deepEqual({...after.pack.settings,mode:'OFF',stockLimits:before.pack.settings.stockLimits},before.pack.settings);
  await db.query(dryRun?'ROLLBACK':'COMMIT');return {status:dryRun?'DRY_RUN_PASSED':'APPLIED',replayed:false,...after};
 }catch(error){await db.query('ROLLBACK');throw error;}
}
