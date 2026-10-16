import assert from 'node:assert/strict';
export const HALLOWEEN_SSS_STOCK_KEY='ops:halloween-sss-stock:20261017:v1';

// User: Helios uses existing remaining stock; Jinmu gets three pack copies,
// excluding the original exclusive owner copy. No grants or settings changes.
export async function registerHalloweenSssStock(db,{dryRun=false}={}){
 await db.query('BEGIN');
 try{
  await db.query("SET LOCAL lock_timeout='3s'");await db.query("SET LOCAL statement_timeout='15s'");
  await db.query('SELECT pg_advisory_xact_lock(hashtext($1))',[HALLOWEEN_SSS_STOCK_KEY]);
  assert.equal((await db.query('SELECT role FROM users WHERE id=1')).rows[0]?.role,'OWNER');
  const setting=(await db.query("SELECT value FROM app_meta WHERE key='mercenary_halloween_ss_pack_v1' FOR SHARE")).rows[0];
  assert.equal(JSON.parse(setting?.value||'null')?.settings?.mode,'OFF','Halloween must remain OFF');
  const prior=(await db.query('SELECT value FROM app_meta WHERE key=$1',[HALLOWEEN_SSS_STOCK_KEY])).rows[0];
  const helios=(await db.query("SELECT code,stock_limit,issued FROM mercenary_limited_stock_v1 WHERE code='V-999' FOR UPDATE")).rows[0];
  assert.ok(helios&&Number(helios.stock_limit)>=Number(helios.issued),'Existing Helios stock required');
  if(!prior){
   assert.equal((await db.query("SELECT code FROM mercenary_limited_stock_v1 WHERE code='V-989'")).rows.length,0,'Unexpected Jinmu counter; never reset');
   assert.equal((await db.query("SELECT code FROM mercenary_limited_issues_v1 WHERE code='V-989' LIMIT 1")).rows.length,0,'Unexpected public Jinmu issue');
   const holders=(await db.query("SELECT user_id,total_copies FROM user_mercenary_cards_v1 WHERE mercenary_code='V-989' AND total_copies>0 ORDER BY user_id")).rows;
   assert.equal(holders.length,1);assert.equal(Number(holders[0].user_id),1);assert.equal(Number(holders[0].total_copies),1);
   await db.query("INSERT INTO mercenary_limited_stock_v1(code,stock_limit,issued) VALUES('V-989',3,0)");
   const receipt={status:'COMPLETED',operationKey:HALLOWEEN_SSS_STOCK_KEY,createdAt:new Date().toISOString(),jinmu:{limit:3,issued:0,exclusiveCopiesExcluded:1},helios:{limit:Number(helios.stock_limit),issued:Number(helios.issued),remaining:Number(helios.stock_limit)-Number(helios.issued),sharedExistingCounter:true},grants:0,settingsChanged:false};
   await db.query('INSERT INTO admin_logs(admin_id,action_type,target_type,target_id,before_data,after_data) VALUES(1,$1,$2,$3,$4,$5)',['MERCENARY_HALLOWEEN_SSS_STOCK','SETTING','V-989','null',JSON.stringify(receipt)]);
   await db.query('INSERT INTO app_meta(key,value) VALUES($1,$2)',[HALLOWEEN_SSS_STOCK_KEY,JSON.stringify(receipt)]);
  }
  const stock=(await db.query("SELECT code,stock_limit,issued FROM mercenary_limited_stock_v1 WHERE code IN ('V-989','V-999') ORDER BY code")).rows;
  assert.equal(Number(stock.find(s=>s.code==='V-989')?.stock_limit),3);
  const receipt=JSON.parse((await db.query('SELECT value FROM app_meta WHERE key=$1',[HALLOWEEN_SSS_STOCK_KEY])).rows[0].value);
  await db.query(dryRun?'ROLLBACK':'COMMIT');
  return {status:dryRun?'DRY_RUN_PASSED':'VERIFIED',replayed:Boolean(prior),stock:stock.map(s=>({code:s.code,limit:Number(s.stock_limit),issued:Number(s.issued),remaining:Number(s.stock_limit)-Number(s.issued)})),receipt};
 }catch(error){await db.query('ROLLBACK');throw error;}
}
