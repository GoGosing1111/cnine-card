// User-authorized: reopen for seven days, reset participation, retire Chuseok.
// Historical award receipts, inventory and balances remain immutable.
import {AXE_KEY,OLD_AXE,AXE_REWARDS,cleanAxeSettings} from '../../js/golden-axe-model-v1.js';
import {CHUSEOK_KEY,CHUSEOK_COIN} from '../../js/chuseok-model-v1.js';
import {MERCENARY_CMS_SEED} from '../../functions/_mercenary_cms_seed.js';
import {mercenaryCardChances} from '../../shared/mercenary-draw-policy-v1.mjs';
export const REOPEN_KEY='ops:golden-axe-reopen:20261002:v1';
const check=(value,message)=>{if(!value)throw Error(message);};
export async function inspect(client){
 const q=async(sql,args=[])=>(await client.query(sql,args)).rows;
 return {
  states:await q('SELECT key,value FROM app_meta WHERE key=ANY($1::text[]) ORDER BY key',[[AXE_KEY,CHUSEOK_KEY,REOPEN_KEY]]),
  items:await q('SELECT code,name,is_active FROM inventory_items WHERE code=ANY($1::text[]) ORDER BY code',[[OLD_AXE,CHUSEOK_COIN]]),
  coupons:await q('SELECT reward_type,COUNT(*) total,COUNT(*) FILTER(WHERE is_active=1 AND deleted_at IS NULL) active FROM coupons WHERE reward_type=ANY($1::text[]) GROUP BY reward_type ORDER BY reward_type',[[OLD_AXE,CHUSEOK_COIN]]),
  holdings:await q('SELECT item_code,COUNT(*) accounts,COALESCE(SUM(quantity),0) quantity FROM cnine_user_inventory WHERE item_code=ANY($1::text[]) GROUP BY item_code ORDER BY item_code',[[OLD_AXE,CHUSEOK_COIN]]),
  receipts:await q("SELECT 'AXE' event,COUNT(*) total FROM golden_axe_receipts_v1 UNION ALL SELECT 'CHUSEOK',COUNT(*) FROM chuseok_receipts_v1")
 };
}
async function operation(client,commit){
 const q=async(sql,args=[])=>(await client.query(sql,args)).rows;
 await q('BEGIN');try{
  await q("SET LOCAL lock_timeout='5s'");await q("SET LOCAL statement_timeout='25s'");
  await q('SELECT pg_advisory_xact_lock(hashtextextended($1,0))',[REOPEN_KEY]);
  const [prior]=await q('SELECT value FROM app_meta WHERE key=$1',[REOPEN_KEY]);
  if(prior){await q('ROLLBACK');return {summary:{...JSON.parse(prior.value),replayed:true}};}
  const [owner]=await q("SELECT id FROM users WHERE role='OWNER' AND status='ACTIVE' ORDER BY id LIMIT 1");check(owner,'Active owner missing');
  // Same advisory locks as the two CMS save operations, followed by metadata rows.
  for(const key of [AXE_KEY,CHUSEOK_KEY])await q('SELECT pg_advisory_xact_lock(hashtextextended($1,0))',[key]);
  const rows=await q('SELECT key,value FROM app_meta WHERE key=ANY($1::text[]) ORDER BY key FOR UPDATE',[[AXE_KEY,CHUSEOK_KEY]]);
  const raw=Object.fromEntries(rows.map(r=>[r.key,JSON.parse(r.value)]));check(raw[AXE_KEY]&&raw[CHUSEOK_KEY],'Existing event settings missing');
  const settings=cleanAxeSettings(raw[AXE_KEY]);check(settings.axeCost===1&&settings.dailyLimit===5,'Existing participation policy changed');
  const equipment=await q('SELECT code FROM character_equipment_items WHERE is_active=1 AND is_public=1 AND slot=$1 FOR SHARE',['BATTLE_SUIT']);
  const items=await q('SELECT code FROM inventory_items WHERE is_active=1 FOR SHARE');
  const [cms]=await q("SELECT payload_json FROM mercenary_cms_documents_v1 WHERE doc_key='config' FOR SHARE");
  const mercenaries=cms?JSON.parse(cms.payload_json).mercenaries:[];
  const [policy]=await q('SELECT payload_json FROM mercenary_draw_config_v1 WHERE id=1 FOR SHARE');
  const eligible=new Set(mercenaryCardChances(null,MERCENARY_CMS_SEED.catalog.cards.map(c=>c.code),policy?JSON.parse(policy.payload_json).cardRules:undefined).filter(c=>c.weight>0).map(c=>c.code));
  for(const reward of AXE_REWARDS.filter(r=>settings.rates[r.key]>0)){
   if(reward.kind==='EQUIPMENT')check(equipment.some(i=>i.code===reward.code),'Unavailable equipment: '+reward.code);
   if(reward.kind==='ITEM')check(items.some(i=>i.code===reward.code),'Unavailable item: '+reward.code);
   if(reward.kind==='MERCENARY')check(mercenaries.some(m=>m.rank===reward.rank&&eligible.has(m.code)),reward.rank+' mercenary pool missing');
  }
  const before=await inspect(client);
  const couponBackup=await q('SELECT id,code,is_active,deleted_at,deleted_by FROM coupons WHERE reward_type=$1 ORDER BY id FOR UPDATE',[CHUSEOK_COIN]);
  const [clock]=await q('SELECT clock_timestamp() AS now'),startsAt=new Date(clock.now).toISOString(),endsAt=new Date(Date.parse(startsAt)+7*86400000).toISOString();
  const next={...cleanAxeSettings({...settings,visible:true,enabled:true,startsAt,endsAt}),revision:crypto.randomUUID(),historyStartsAt:startsAt};
  const retired={...raw[CHUSEOK_KEY],visible:false,retiredAt:startsAt,revision:crypto.randomUUID(),events:Object.fromEntries(Object.entries(raw[CHUSEOK_KEY].events).map(([key,event])=>[key,{...event,enabled:false}]))};
  for(const [key,value] of [[AXE_KEY,next],[CHUSEOK_KEY,retired]])await q('UPDATE app_meta SET value=$2,updated_at=sqlite_now() WHERE key=$1',[key,JSON.stringify(value)]);
  const axe=await q('UPDATE inventory_items SET is_active=1 WHERE code=$1 RETURNING code',[OLD_AXE]);check(axe.length===1,'Old axe catalog missing');
  const coin=await q('UPDATE inventory_items SET is_active=0 WHERE code=$1 RETURNING code',[CHUSEOK_COIN]);check(coin.length===1,'Chuseok coin catalog missing');
  const coupons=await q('UPDATE coupons SET is_active=0,deleted_at=COALESCE(deleted_at,sqlite_now()),deleted_by=COALESCE(deleted_by,$2),updated_at=sqlite_now() WHERE reward_type=$1 RETURNING id',[CHUSEOK_COIN,owner.id]);
  check(coupons.length===couponBackup.length,'Coupon retirement count mismatch');
  const summary={operation:REOPEN_KEY,startsAt,endsAt,historyStartsAt:startsAt,axeCost:next.axeCost,dailyLimit:next.dailyLimit,rates:next.rates,retiredChuseokCoupons:coupons.length,oldAxeCouponsReactivated:0,automaticAxeGrant:false,historyReceiptsPreserved:before.receipts};
  const [audit]=await q("INSERT INTO admin_logs(admin_id,action_type,target_type,target_id,before_data,after_data) VALUES($1,'EVENT_REOPEN_AND_RETIRE','EVENT',$2,$3,$4) RETURNING id",[owner.id,REOPEN_KEY,JSON.stringify({...before,couponBackup}),JSON.stringify(summary)]);check(audit,'Audit missing');summary.auditId=String(audit.id);
  await q('INSERT INTO app_meta(key,value,updated_at) VALUES($1,$2,sqlite_now())',[REOPEN_KEY,JSON.stringify(summary)]);
  await q(commit?'COMMIT':'ROLLBACK');return {summary:{...summary,dryRun:!commit}};
 }catch(error){await q('ROLLBACK').catch(()=>{});throw error;}
}
export const preview=client=>operation(client,false);
export const apply=client=>operation(client,true);
export async function verify(client){
 const state=await inspect(client),raw=Object.fromEntries(state.states.map(r=>[r.key,JSON.parse(r.value)])),summary=raw[REOPEN_KEY];
 check(summary,'Reopen receipt missing');const axe=raw[AXE_KEY],chuseok=raw[CHUSEOK_KEY];
 check(axe.enabled&&axe.visible&&axe.historyStartsAt===summary.historyStartsAt&&axe.startsAt===summary.startsAt&&axe.endsAt===summary.endsAt,'Reopened period/reset mismatch');
 check(Date.parse(axe.endsAt)-Date.parse(axe.startsAt)===7*86400000,'Period is not seven days');
 check(!chuseok.visible&&Object.values(chuseok.events).every(e=>!e.enabled),'Chuseok still active');
 check(state.items.find(i=>i.code===OLD_AXE)?.is_active==1&&state.items.find(i=>i.code===CHUSEOK_COIN)?.is_active==0,'Catalog state mismatch');
 check(!state.coupons.some(c=>c.reward_type===CHUSEOK_COIN&&Number(c.active)>0),'Active Chuseok coupons remain');
 for(const receipt of summary.historyReceiptsPreserved)check(BigInt(state.receipts.find(r=>r.event===receipt.event).total)>=BigInt(receipt.total),'Historical receipt loss');
 return {...summary,verified:true,holdings:state.holdings,coupons:state.coupons};
}
