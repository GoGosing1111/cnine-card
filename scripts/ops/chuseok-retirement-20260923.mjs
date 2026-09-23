// User-authorized retirement: ONLY PINGDU_OLD_AXE holdings/catalog/coupons.
// Receipts and all previously awarded prizes/vouchers are retained.
// preview executes the exact migration and rolls back. apply is receipt-idempotent.
import {CHUSEOK_SCHEMA,CHUSEOK_ITEM} from '../../functions/_chuseok.js';
import {MERCENARY_ACCOUNTING_SCHEMA} from '../../functions/_mercenary_draw_accounting.js';
import {CHUSEOK_KEY,cleanChuseokSettings} from '../../js/chuseok-model-v1.js';
export const RETIREMENT_KEY='ops:chuseok-retirement:20260923:v1';
const OLD='PINGDU_OLD_AXE',OLD_KEY='pingdu_golden_axe_v1';
const check=(v,m)=>{if(!v)throw Error(m);};
export async function inspect(client){
 const q=async(text,values=[])=>(await client.query(text,values)).rows;
 const holdings=await q('SELECT COUNT(*) accounts,COUNT(*) FILTER(WHERE quantity>0) positive_accounts,COALESCE(SUM(quantity),0) quantity FROM cnine_user_inventory WHERE item_code=$1',[OLD]);
 const coupons=await q('SELECT COUNT(*) total,COUNT(*) FILTER(WHERE is_active=1 AND deleted_at IS NULL) active FROM coupons WHERE reward_type=$1',[OLD]);
 const items=await q('SELECT code,name,is_active FROM inventory_items WHERE code=ANY($1::text[])',[[OLD,CHUSEOK_ITEM[0]]]);
 const states=await q('SELECT key,value FROM app_meta WHERE key=ANY($1::text[])',[[OLD_KEY,CHUSEOK_KEY,RETIREMENT_KEY]]);
 return {holdings:holdings[0],coupons:coupons[0],items,states};
}
async function operation(client,commit){
 const q=async(text,values=[])=>(await client.query(text,values)).rows;
 await q('BEGIN');try{
  await q("SET LOCAL lock_timeout='5s'");await q("SET LOCAL statement_timeout='25s'");
  await q('SELECT pg_advisory_xact_lock(hashtextextended($1,0))',[RETIREMENT_KEY]);
  const [prior]=await q('SELECT value FROM app_meta WHERE key=$1',[RETIREMENT_KEY]);if(prior){await q('ROLLBACK');return {summary:{...JSON.parse(prior.value),replayed:true}};}
  const [owner]=await q("SELECT id FROM users WHERE role='OWNER' AND status='ACTIVE' ORDER BY id LIMIT 1");check(owner,'Active owner for audit missing');
  // Same lock order as the retired event and coupon grants: accounts first.
  await q('SELECT id FROM users WHERE id IN(SELECT user_id FROM cnine_user_inventory WHERE item_code=$1) ORDER BY id FOR UPDATE',[OLD]);
  const [old]=await q('SELECT value FROM app_meta WHERE key=$1 FOR UPDATE',[OLD_KEY]);check(old,'Old event settings missing');
  const [nextMeta]=await q('SELECT value FROM app_meta WHERE key=$1 FOR UPDATE',[CHUSEOK_KEY]);
  const next=nextMeta?JSON.parse(nextMeta.value):{...cleanChuseokSettings(),revision:crypto.randomUUID()};
  check(Object.values(cleanChuseokSettings(next).events).every(e=>!e.enabled),'Chuseok has been enabled by an operator; review before retirement');
  for(const [table,columns] of [
   ['alchemy_reward_pool_v1',['reward_type','reward_ref']],['prime_draw_extra_pool_v1987',['reward_type','reward_ref']],['unified_drop_entries_v1667',['reward_type','reward_ref']],
   ['alchemy_input_items_v1',['item_code']],['workshop_recipe_materials_v1668',['item_code']],['clan_championship_rewards',['reward_type']],['user_message_rewards',['reward_type']]
  ]){
   const [schema]=await q('SELECT to_regclass($1) AS relation',['public.'+table]);if(!schema?.relation)continue;
   const refs=await q(`SELECT 1 FROM ${table} WHERE ${columns.map(c=>c+'=$1').join(' OR ')} LIMIT 1`,[OLD]);check(!refs.length,'Retired axe still referenced by '+table+'; review before removal');
  }
  const holdings=await q('SELECT * FROM cnine_user_inventory WHERE item_code=$1 ORDER BY user_id FOR UPDATE',[OLD]);
  const coupons=await q('SELECT * FROM coupons WHERE reward_type=$1 ORDER BY id FOR UPDATE',[OLD]);
  const items=await q('SELECT * FROM inventory_items WHERE code=$1 FOR UPDATE',[OLD]);check(items.length===1,'Unexpected old axe catalog');
  check(holdings.every(r=>BigInt(r.quantity)>=0n),'Negative old axe quantity');
  const total=holdings.reduce((n,r)=>n+BigInt(r.quantity),0n);
  for(const row of holdings.filter(r=>BigInt(r.quantity)>0n)){
   const log=await q("INSERT INTO inventory_logs(user_id,item_code,change_amount,balance_after,reason,reference_type,reference_id,admin_id) VALUES($1,$2,$3,0,'도끼 이벤트 종료 · 낡은도끼 회수','EVENT_RETIREMENT',$4,$5) RETURNING user_id",[row.user_id,OLD,String(-BigInt(row.quantity)),RETIREMENT_KEY,owner.id]);check(log.length===1,'Retirement ledger failed');
  }
  const deleted=await q('DELETE FROM cnine_user_inventory WHERE item_code=$1 RETURNING user_id',[OLD]);check(deleted.length===holdings.length,'Inventory removal count mismatch');
  const retired=await q('UPDATE inventory_items SET is_active=0 WHERE code=$1 RETURNING code',[OLD]);check(retired.length===1,'Old axe catalog retirement failed');
  const retiredCoupons=await q('UPDATE coupons SET is_active=0,deleted_at=COALESCE(deleted_at,sqlite_now()),deleted_by=COALESCE(deleted_by,$2),updated_at=sqlite_now() WHERE reward_type=$1 RETURNING id',[OLD,owner.id]);check(retiredCoupons.length===coupons.length,'Old coupon retirement count mismatch');
  const now=new Date().toISOString(),oldNext={...JSON.parse(old.value),visible:false,enabled:false,retiredAt:now,revision:crypto.randomUUID()};
  await q('UPDATE app_meta SET value=$2,updated_at=sqlite_now() WHERE key=$1',[OLD_KEY,JSON.stringify(oldNext)]);
  for(const sql of CHUSEOK_SCHEMA.split(';').filter(s=>s.trim()))await q(sql);
  for(const sql of MERCENARY_ACCOUNTING_SCHEMA)await q(sql);
  await q('INSERT INTO inventory_items(code,name,subtitle,description,category,rarity,image_url,sort_order,is_active) VALUES($1,$2,$3,$4,$5,$6,$7,$8,1) ON CONFLICT(code) DO NOTHING',CHUSEOK_ITEM);
  if(!nextMeta)await q('INSERT INTO app_meta(key,value,updated_at) VALUES($1,$2,sqlite_now())',[CHUSEOK_KEY,JSON.stringify(next)]);
  const backup={oldSettings:JSON.parse(old.value),items,holdings,coupons};
  const summary={operation:RETIREMENT_KEY,completedAt:now,removedAccounts:holdings.length,positiveAccounts:holdings.filter(r=>BigInt(r.quantity)>0n).length,removedQuantity:String(total),retiredCoupons:coupons.length,newEventVisible:next.visible,songpyeonEnabled:false,envelopeEnabled:false,automaticCoinGrant:false};
  const [audit]=await q("INSERT INTO admin_logs(admin_id,action_type,target_type,target_id,before_data,after_data) VALUES($1,'EVENT_RETIRE_AND_REPLACE','EVENT',$2,$3,$4) RETURNING id",[owner.id,RETIREMENT_KEY,JSON.stringify(backup),JSON.stringify(summary)]);check(audit,'Audit write missing');summary.auditId=String(audit.id);
  await q('INSERT INTO app_meta(key,value,updated_at) VALUES($1,$2,sqlite_now())',[RETIREMENT_KEY,JSON.stringify(summary)]);
  await q(commit?'COMMIT':'ROLLBACK');return {summary:{...summary,dryRun:!commit},backup};
 }catch(e){await q('ROLLBACK').catch(()=>{});throw e;}
}
export const preview=client=>operation(client,false);
export const apply=client=>operation(client,true);
export async function verify(client){
 const state=await inspect(client),marker=state.states.find(r=>r.key===RETIREMENT_KEY);check(marker,'Retirement receipt missing');
 const summary=JSON.parse(marker.value),old=JSON.parse(state.states.find(r=>r.key===OLD_KEY).value),next=JSON.parse(state.states.find(r=>r.key===CHUSEOK_KEY).value);
 check(Number(state.holdings.accounts)===0&&Number(state.coupons.active)===0,'Old axe holdings or active coupons remain');
 check(old.visible===false&&old.enabled===false&&Object.values(cleanChuseokSettings(next).events).every(e=>!e.enabled),'An event is unexpectedly enabled');
 check(state.items.find(i=>i.code===OLD)?.is_active==0&&state.items.find(i=>i.code===CHUSEOK_ITEM[0])?.is_active==1,'Catalog retirement or coin registration missing');
 const {rows:[ledger]}=await client.query("SELECT COUNT(*) accounts,COALESCE(SUM(change_amount),0) delta FROM inventory_logs WHERE reference_type='EVENT_RETIREMENT' AND reference_id=$1",[RETIREMENT_KEY]);
 check(BigInt(ledger.delta)===-BigInt(summary.removedQuantity)&&Number(ledger.accounts)===summary.positiveAccounts,'Retirement ledger mismatch');
 return {...summary,verified:true,oldHoldings:state.holdings,activeOldCoupons:Number(state.coupons.active),ledger,events:next.events};
}
