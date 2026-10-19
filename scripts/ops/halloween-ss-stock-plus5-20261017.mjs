import assert from 'node:assert/strict';
import {HALLOWEEN_PACK_KEY,validateHalloweenPack,readHalloweenPackSettings} from '../../shared/mercenary-halloween-pack-v1.mjs';

export const HALLOWEEN_SS_STOCK_PLUS5_KEY='ops:halloween-ss-stock:20261017:plus5-v1';
// Freeze this completed operation's original seven identities as new cards arrive.
const codes=['V-980','V-981','V-982','V-983','V-984','V-985','V-986'],allCodes=[...codes,'V-989','V-999'].sort();
const stockView=rows=>rows.map(s=>({code:s.code,limit:Number(s.stock_limit),issued:Number(s.issued),remaining:Number(s.stock_limit)-Number(s.issued)}));

// Explicit user request: add five slots to each seasonal SS, preserving issues,
// holdings, SSS stock, odds, prices and mode. Deploy compatible readers first.
export async function increaseHalloweenSsStock(db,{dryRun=false}={}){
 await db.query('BEGIN');
 try{
  await db.query("SET LOCAL lock_timeout='4s'");
  await db.query("SET LOCAL statement_timeout='20s'");
  await db.query('SELECT pg_advisory_xact_lock(hashtext($1))',[HALLOWEEN_SS_STOCK_PLUS5_KEY]);
  assert.equal((await db.query('SELECT role FROM users WHERE id=1')).rows[0]?.role,'OWNER');
  const prior=(await db.query('SELECT value FROM app_meta WHERE key=$1',[HALLOWEEN_SS_STOCK_PLUS5_KEY])).rows[0];
  const raw=(await db.query('SELECT value FROM app_meta WHERE key=$1 FOR UPDATE',[HALLOWEEN_PACK_KEY])).rows[0]?.value;
  assert.ok(raw,'Existing Halloween settings required');
  const before=JSON.parse(raw);readHalloweenPackSettings(before.settings);
  const beforeStock=(await db.query('SELECT code,stock_limit,issued,revision FROM mercenary_limited_stock_v1 WHERE code=ANY($1::text[]) ORDER BY code FOR UPDATE',[allCodes])).rows;
  assert.deepEqual(beforeStock.map(s=>s.code),allCodes);
  let receipt;
  if(prior){
   receipt=JSON.parse(prior.value);
   assert.equal(receipt.status,'COMPLETED');
   for(const code of codes){assert.equal(before.settings.stockLimits[code],10);assert.equal(Number(beforeStock.find(s=>s.code===code).stock_limit),10);}
  }else{
   assert.equal(before.settings.format,'MERCENARY_HALLOWEEN_SS_PACK_V3');
   assert.ok(Number.isSafeInteger(before.revision)&&before.revision>=1&&before.revision<2147483646);
   for(const code of codes){
    const stock=beforeStock.find(s=>s.code===code);
    assert.equal(before.settings.stockLimits[code],5,'Only the original five-copy limit may be expanded');
    assert.equal(Number(stock.stock_limit),5);assert.ok(Number(stock.issued)>=0&&Number(stock.issued)<=5);
   }
   const next=structuredClone(before),at=new Date().toISOString();
   for(const code of codes)next.settings.stockLimits[code]=10;
   validateHalloweenPack(next.settings,{allowLegacyStock:true});
   next.revision++;next.updatedAt=at;next.updatedBy=1;next.lastRequestId='halloween-ss-plus5-20261017-v1';
   const changed=await db.query('UPDATE mercenary_limited_stock_v1 SET stock_limit=10,revision=revision+1 WHERE code=ANY($1::text[]) AND stock_limit=5 RETURNING code',[codes]);
   assert.equal(changed.rows.length,7);
   const saved=await db.query('UPDATE app_meta SET value=$1 WHERE key=$2 AND value=$3 RETURNING key',[JSON.stringify(next),HALLOWEEN_PACK_KEY,raw]);
   assert.equal(saved.rows.length,1);
   const afterStock=(await db.query('SELECT code,stock_limit,issued,revision FROM mercenary_limited_stock_v1 WHERE code=ANY($1::text[]) ORDER BY code',[allCodes])).rows;
   for(const stock of afterStock){
    const old=beforeStock.find(s=>s.code===stock.code);
    assert.equal(Number(stock.issued),Number(old.issued));
    if(!codes.includes(stock.code))assert.deepEqual(stock,old);
   }
   receipt={status:'COMPLETED',operationKey:HALLOWEEN_SS_STOCK_PLUS5_KEY,createdAt:at,reason:'사용자 요청: 할로윈 리미티드 SS 등급들 5장씩 한도 추가',addedPerCharacter:5,totalAdded:35,settingsRevision:next.revision,before:stockView(beforeStock),after:stockView(afterStock),grants:0};
   await db.query('INSERT INTO admin_logs(admin_id,action_type,target_type,target_id,before_data,after_data) VALUES(1,$1,$2,$3,$4,$5)',['MERCENARY_HALLOWEEN_SS_STOCK_PLUS5','SETTING',HALLOWEEN_PACK_KEY,JSON.stringify({settings:before,stock:stockView(beforeStock)}),JSON.stringify({settings:next,receipt})]);
   await db.query('INSERT INTO app_meta(key,value) VALUES($1,$2)',[HALLOWEEN_SS_STOCK_PLUS5_KEY,JSON.stringify(receipt)]);
  }
  await db.query(dryRun?'ROLLBACK':'COMMIT');
  return {status:dryRun?'DRY_RUN_PASSED':'VERIFIED',replayed:Boolean(prior),receipt};
 }catch(error){await db.query('ROLLBACK');throw error;}
}
