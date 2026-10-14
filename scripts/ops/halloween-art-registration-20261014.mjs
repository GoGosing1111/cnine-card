import assert from 'node:assert/strict';
import {HALLOWEEN_MERCENARIES} from '../../shared/mercenary-halloween-catalog-v1.mjs';
import {HALLOWEEN_PACK_KEY,halloweenPackDraft,validateHalloweenPack} from '../../shared/mercenary-halloween-pack-v1.mjs';
export const HALLOWEEN_REGISTRATION_KEY='ops:halloween-art-registration:20261014:v1';
const codes=HALLOWEEN_MERCENARIES.map(c=>c.code);
export async function prepareHalloweenRegistration(db,{dryRun=false}={}){
 await db.query('BEGIN');
 try{
  await db.query("SET LOCAL lock_timeout='3s'");await db.query("SET LOCAL statement_timeout='15s'");
  await db.query('SELECT pg_advisory_xact_lock(hashtext($1))',[HALLOWEEN_REGISTRATION_KEY]);
  const owner=(await db.query('SELECT id,role FROM users WHERE id=1')).rows[0];assert.equal(owner?.role,'OWNER');
  const prior=(await db.query('SELECT value FROM app_meta WHERE key=$1',[HALLOWEEN_REGISTRATION_KEY])).rows[0];
  if(!prior){
   const owned=(await db.query('SELECT mercenary_code FROM user_mercenary_cards_v1 WHERE mercenary_code=ANY($1::text[]) LIMIT 1',[codes])).rows;
   const issued=(await db.query('SELECT code FROM mercenary_limited_issues_v1 WHERE code=ANY($1::text[]) LIMIT 1',[codes])).rows;
   assert.equal(owned.length,0,'Unexpected pre-existing Halloween ownership');assert.equal(issued.length,0,'Unexpected pre-existing Halloween issuance');
   for(const code of codes)await db.query('INSERT INTO mercenary_limited_stock_v1(code,stock_limit,issued) VALUES($1,5,0) ON CONFLICT(code) DO NOTHING',[code]);
   const settings={revision:1,settings:halloweenPackDraft(),updatedAt:null};
   await db.query('INSERT INTO app_meta(key,value) VALUES($1,$2) ON CONFLICT(key) DO NOTHING',[HALLOWEEN_PACK_KEY,JSON.stringify(settings)]);
   const receipt={status:'COMPLETED',operationKey:HALLOWEEN_REGISTRATION_KEY,codes,serverLimitPerCharacter:5,mode:'OFF',pricesAssigned:false,probabilitiesAssigned:false,grants:0,createdAt:new Date().toISOString()};
   await db.query('INSERT INTO admin_logs(admin_id,action_type,target_type,target_id,before_data,after_data) VALUES(1,$1,$2,$3,$4,$5)',['MERCENARY_HALLOWEEN_ART_REGISTER','SETTING',HALLOWEEN_PACK_KEY,'null',JSON.stringify(receipt)]);
   await db.query('INSERT INTO app_meta(key,value) VALUES($1,$2)',[HALLOWEEN_REGISTRATION_KEY,JSON.stringify(receipt)]);
  }
  const saved=JSON.parse((await db.query('SELECT value FROM app_meta WHERE key=$1',[HALLOWEEN_PACK_KEY])).rows[0].value);validateHalloweenPack(saved.settings);
  const stock=(await db.query('SELECT code,stock_limit,issued FROM mercenary_limited_stock_v1 WHERE code=ANY($1::text[]) ORDER BY code',[codes])).rows;
  assert.deepEqual(stock.map(s=>s.code),codes);for(const row of stock){assert.equal(Number(row.stock_limit),5);assert.equal(Number(row.issued),0);}
  await db.query(dryRun?'ROLLBACK':'COMMIT');
  return {status:dryRun?'DRY_RUN_PASSED':'VERIFIED',replayed:Boolean(prior),mode:saved.settings.mode,prices:saved.settings.prices,cardRatesPpm:saved.settings.cardRatesPpm,missRatePpm:saved.settings.missRatePpm,stock:stock.map(s=>({code:s.code,limit:Number(s.stock_limit),issued:Number(s.issued)})),grants:0};
 }catch(error){await db.query('ROLLBACK');throw error;}
}
