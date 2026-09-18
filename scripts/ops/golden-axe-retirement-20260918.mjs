// Authorized retirement only: old wish tickets/coupons, never awarded gear or vehicles.
// preview executes every mutation and rolls back; apply is receipt-idempotent.
import {AXE_SCHEMA,AXE_ITEMS,goldenAxeAdmin} from '../../functions/_golden_axe.js';
import {MERCENARY_ACCOUNTING_SCHEMA} from '../../functions/_mercenary_draw_accounting.js';
import {AXE_KEY,cleanAxeSettings} from '../../js/golden-axe-model-v1.js';
const OLD='PINGDU_WISH_TICKET',OLD_KEY='pingdu_wish_lamp_v2077',RECEIPT='ops:golden-axe-retirement:20260918:v1';
const check=(value,message)=>{if(!value)throw Error(message);};
async function operation(client,commit){
 const q=async(text,values=[])=>(await client.query(text,values)).rows;
 await q('BEGIN');try{
  await q("SET LOCAL lock_timeout='5s'");await q("SET LOCAL statement_timeout='20s'");
  await q('SELECT pg_advisory_xact_lock(hashtextextended($1,0))',[RECEIPT]);
  const [prior]=await q('SELECT value FROM app_meta WHERE key=$1',[RECEIPT]);
  if(prior){await q('ROLLBACK');return {summary:{...JSON.parse(prior.value),replayed:true}};}
  const [owner]=await q("SELECT id FROM users WHERE role='OWNER' AND status='ACTIVE' ORDER BY id LIMIT 1 FOR SHARE");check(owner,'Active owner for audit missing');
  const [old]=await q('SELECT value FROM app_meta WHERE key=$1 FOR UPDATE',[OLD_KEY]);check(old,'Old event settings missing');
  const newMeta=await q('SELECT value FROM app_meta WHERE key=$1 FOR UPDATE',[AXE_KEY]);check(!newMeta.length,'New event already configured; do not overwrite');
  for(const table of ['alchemy_reward_pool_v1','prime_draw_extra_pool_v1987','unified_drop_entries_v1667']){
   const rows=await q(`SELECT 1 FROM ${table} WHERE reward_type=$1 OR reward_ref=$1 LIMIT 1`,[OLD]);check(!rows.length,`Retired item referenced by ${table}; review before deletion`);
  }
  for(const [table,column] of [['alchemy_input_items_v1','item_code'],['workshop_recipe_materials_v1668','item_code'],['clan_championship_rewards','reward_type'],['user_message_rewards','reward_type']]){
   const rows=await q(`SELECT 1 FROM ${table} WHERE ${column}=$1 LIMIT 1`,[OLD]);check(!rows.length,`Retired item referenced by ${table}; review before deletion`);
  }
  await q('SELECT id FROM users WHERE id IN(SELECT user_id FROM cnine_user_inventory WHERE item_code=$1) ORDER BY id FOR UPDATE',[OLD]);
  const holdings=await q('SELECT * FROM cnine_user_inventory WHERE item_code=$1 ORDER BY user_id FOR UPDATE',[OLD]);
  const coupons=await q('SELECT * FROM coupons WHERE reward_type=$1 ORDER BY id FOR UPDATE',[OLD]);
  const items=await q('SELECT * FROM inventory_items WHERE code=$1 FOR UPDATE',[OLD]);check(items.length===1,'Unexpected old item catalog');
  const total=holdings.reduce((sum,row)=>sum+BigInt(row.quantity),0n);check(holdings.every(row=>BigInt(row.quantity)>=0n),'Negative old ticket quantity');
  for(const row of holdings.filter(row=>BigInt(row.quantity)>0n))await q("INSERT INTO inventory_logs(user_id,item_code,change_amount,balance_after,reason,reference_type,reference_id,admin_id) VALUES($1,$2,$3,0,'소원램프 종료 · 소원권 일괄 회수','EVENT_RETIREMENT',$4,$5)",[row.user_id,OLD,String(-BigInt(row.quantity)),RECEIPT,owner.id]);
  const deleted=await q('DELETE FROM cnine_user_inventory WHERE item_code=$1 RETURNING user_id',[OLD]);check(deleted.length===holdings.length,'Inventory deletion count mismatch');
  const retired=await q('UPDATE inventory_items SET is_active=0 WHERE code=$1 RETURNING code',[OLD]);check(retired.length===1,'Retirement catalog update missing');
  const retiredCoupons=await q('UPDATE coupons SET is_active=0,deleted_at=COALESCE(deleted_at,sqlite_now()),deleted_by=COALESCE(deleted_by,$2),updated_at=sqlite_now() WHERE reward_type=$1 RETURNING id',[OLD,owner.id]);check(retiredCoupons.length===coupons.length,'Coupon retirement mismatch');
  const now=new Date().toISOString(),oldNext={...JSON.parse(old.value),visible:false,enabled:false,retiredAt:now,revision:crypto.randomUUID()};
  await q('UPDATE app_meta SET value=$2,updated_at=sqlite_now() WHERE key=$1',[OLD_KEY,JSON.stringify(oldNext)]);
  for(const sql of AXE_SCHEMA.split(';').filter(s=>s.trim()))await q(sql);
  for(const sql of MERCENARY_ACCOUNTING_SCHEMA)await q(sql);
  for(const row of AXE_ITEMS)await q('INSERT INTO inventory_items(code,name,subtitle,description,category,rarity,image_url,sort_order,is_active) VALUES($1,$2,$3,$4,$5,$6,$7,$8,1) ON CONFLICT(code) DO NOTHING',row);
  const next={...cleanAxeSettings(),revision:crypto.randomUUID()};
  await q('INSERT INTO app_meta(key,value,updated_at) VALUES($1,$2,sqlite_now())',[AXE_KEY,JSON.stringify(next)]);
  const summary={operation:RECEIPT,completedAt:now,removedAccounts:holdings.length,removedQuantity:String(total),retiredCoupons:coupons.length,newEventEnabled:false,newEventVisible:false,ratesConfigured:false};
  const [audit]=await q("INSERT INTO admin_logs(admin_id,action_type,target_type,target_id,before_data,after_data) VALUES($1,'EVENT_RETIRE_AND_REPLACE','EVENT',$2,$3,$4) RETURNING id",[owner.id,RECEIPT,JSON.stringify({oldSettings:JSON.parse(old.value),items,holdings,coupons}),JSON.stringify(summary)]);check(audit,'Audit write missing');summary.auditId=String(audit.id);
  await q('INSERT INTO app_meta(key,value,updated_at) VALUES($1,$2,sqlite_now())',[RECEIPT,JSON.stringify(summary)]);
  const [after]=await q('SELECT COUNT(*) n FROM cnine_user_inventory WHERE item_code=$1',[OLD]);check(Number(after.n)===0,'Old holdings remain');
  await q(commit?'COMMIT':'ROLLBACK');return {summary:{...summary,dryRun:!commit},backup:{oldSettings:JSON.parse(old.value),items,holdings,coupons}};
 }catch(error){await q('ROLLBACK').catch(()=>{});throw error;}
}
export const preview=client=>operation(client,false);
export const apply=client=>operation(client,true);
export async function verify(client){
 const q=async(text,values=[])=>(await client.query(text,values)).rows;
 const [receipt]=await q('SELECT value FROM app_meta WHERE key=$1',[RECEIPT]);
 const [holdings]=await q('SELECT COUNT(*) accounts,COALESCE(SUM(quantity),0) quantity FROM cnine_user_inventory WHERE item_code=$1',[OLD]);
 const [coupons]=await q('SELECT COUNT(*) n FROM coupons WHERE reward_type=$1 AND(is_active<>0 OR deleted_at IS NULL)',[OLD]);
 const items=await q('SELECT code,is_active FROM inventory_items WHERE code=ANY($1::text[])',[[OLD,...AXE_ITEMS.map(r=>r[0])]]);
 const states=await q('SELECT key,value FROM app_meta WHERE key=ANY($1::text[])',[[OLD_KEY,AXE_KEY]]);
 const ledger=await q("SELECT COUNT(*) accounts,COALESCE(SUM(change_amount),0) delta FROM inventory_logs WHERE reference_type='EVENT_RETIREMENT' AND reference_id=$1",[RECEIPT]);
 check(receipt&&Number(holdings.accounts)===0&&Number(coupons.n)===0,'Retirement verification failed');
 for(const row of states){const s=JSON.parse(row.value);check(s.enabled===false&&s.visible===false,'An event is unexpectedly enabled');if(row.key===AXE_KEY)check(Object.values(s.rates).every(v=>v===null)&&s.axeCost===null&&s.dailyLimit===null&&!s.startsAt&&!s.endsAt,'New event economics unexpectedly configured');}
 check(items.length===4&&items.every(i=>Number(i.is_active)===(i.code===OLD?0:1)),'Item registration verification failed');
 const result=JSON.parse(receipt.value);check(BigInt(ledger[0].delta)===-BigInt(result.removedQuantity),'Recovery log delta mismatch');
 const live=await goldenAxeAdmin({DB:{dialect:'postgres',client,enqueue:task=>task()}},{id:0});
 check(!live.settings.enabled&&!live.complete&&live.rewards.every(r=>r.available),'Live event configuration or reward catalog invalid');
 return {summary:{...result,verified:true,oldHoldings:holdings,remainingOldCoupons:Number(coupons.n),items,ledger,rewards:live.rewards.map(r=>({key:r.key,available:r.available}))},states};
}
