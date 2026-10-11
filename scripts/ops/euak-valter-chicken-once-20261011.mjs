import assert from 'node:assert/strict';
import {chickenLimitedOnceKey,chickenLimitedOnceState} from '../../functions/_chicken_limited_once.js';
import {CHICKEN_KEY,CHICKEN_TICKET,cleanChickenSettings,chickenPhase} from '../../shared/chicken-event-v1.mjs';

export const OPERATION_KEY='ops:euak-valter-chicken-once:20261011:v1';
export const TARGET=Object.freeze({id:5010,nickname:'으악'});
export const CODE='V-996',ENTITLEMENT_KEY=chickenLimitedOnceKey(TARGET.id);
const SETTINGS=[CHICKEN_KEY,'mercenary_limited_pack_v1','mercenary_limited_draw_policy_v1'];
const q=async(db,sql,args=[])=>(await db.query(sql,args)).rows;
const only=rows=>{assert.equal(rows.length,1);return rows[0];};
const json=row=>row?JSON.parse(row.value):null;
async function preservedState(db){
 return {
  user:await q(db,'SELECT id,nickname,status,role,coin,card_shards,magic_crystals FROM users WHERE id=$1',[TARGET.id]),
  settings:await q(db,'SELECT key,value FROM app_meta WHERE key=ANY($1::text[]) ORDER BY key',[SETTINGS]),
  stock:only(await q(db,'SELECT * FROM mercenary_limited_stock_v1 WHERE code=$1',[CODE])),
  cards:await q(db,'SELECT * FROM user_mercenary_cards_v1 WHERE user_id=$1 ORDER BY mercenary_code',[TARGET.id]),
  inventory:await q(db,'SELECT * FROM cnine_user_inventory WHERE user_id=$1 ORDER BY item_code',[TARGET.id]),
  loadout:await q(db,'SELECT * FROM user_mercenary_loadout_v1 WHERE user_id=$1',[TARGET.id]),
  growth:await q(db,'SELECT * FROM user_mercenary_growth_v1 WHERE user_id=$1 ORDER BY mercenary_code',[TARGET.id]),
  orders:await q(db,'SELECT request_id FROM chicken_event_receipts_v1 WHERE user_id=$1 ORDER BY request_id',[TARGET.id]),
  issues:await q(db,'SELECT * FROM mercenary_limited_issues_v1 WHERE user_id=$1 ORDER BY acquisition_id',[TARGET.id]),
 };
}

export async function verifyEuakValterOnce(db){
 const receipt=json(only(await q(db,'SELECT value FROM app_meta WHERE key=$1',[OPERATION_KEY])));
 assert.equal(receipt.status,'COMPLETED');assert.equal(receipt.operationKey,OPERATION_KEY);
 assert.deepEqual(receipt.target,TARGET);assert.equal(receipt.guarantee.code,CODE);assert.equal(receipt.guarantee.quantity,1);
 const state=json(only(await q(db,'SELECT value FROM app_meta WHERE key=$1',[ENTITLEMENT_KEY])));
 assert.equal(state.operationId,OPERATION_KEY);assert.equal(state.userId,TARGET.id);assert.equal(state.actorId,1);
 assert.equal(state.mercenaryCode,CODE);assert.equal(state.rank,'SSS');assert.equal(state.quantity,1);
 assert.ok(['ARMED','CONSUMED'].includes(state.status));
 if(state.status==='ARMED')assert.deepEqual(state,chickenLimitedOnceState({...state,now:state.createdAt}));
 else{
  const order=JSON.parse(only(await q(db,'SELECT result_json FROM chicken_event_receipts_v1 WHERE user_id=$1 AND request_id=$2',[TARGET.id,state.requestId])).result_json);
  assert.equal(order.status,'COMPLETED');assert.equal(order.grantKind,'ONE_TIME_SSS_LIMITED_GUARANTEE');
  assert.equal(order.reward.code,CODE);assert.equal(order.reward.quantity,1);assert.equal(order.ticketCost,1);
  assert.equal(order.reward.serial,state.serial);assert.equal(state.acquisitionId,'chicken:'+state.requestId);
 }
 const audit=only(await q(db,'SELECT action_type,target_id,after_data FROM admin_logs WHERE id=$1',[receipt.adminLogId]));
 assert.equal(audit.action_type,'CHICKEN_LIMITED_ONCE_ARMED');assert.equal(audit.target_id,String(TARGET.id));
 assert.equal(JSON.parse(audit.after_data).operationId,OPERATION_KEY);
 return {status:'VERIFIED',receipt,entitlement:state,remaining:state.status==='ARMED'?1:0};
}

// Live orders lock this same users row before inspecting the entitlement. This
// operation only arms app_meta; it neither places an order nor issues a card.
export async function armEuakValterOnce(db,{commit=false}={}){
 await db.query('BEGIN');
 try{
  await db.query("SET LOCAL lock_timeout='3s'");await db.query("SET LOCAL statement_timeout='10s'");
  const database=only(await q(db,'SELECT current_database() db,pg_is_in_recovery() recovery'));
  assert.equal(database.db,'cnine');assert.equal(database.recovery,false);
  await q(db,'SELECT pg_advisory_xact_lock(hashtext($1))',[OPERATION_KEY]);
  const user=only(await q(db,'SELECT id,nickname,status,role,(banned_until IS NOT NULL AND banned_until>sqlite_now()) banned FROM users WHERE id=$1 FOR UPDATE',[TARGET.id]));
  assert.equal(user.nickname,TARGET.nickname);assert.equal(user.status,'ACTIVE');assert.equal(user.role,'USER');assert.equal(user.banned,false);
  assert.equal(Number(only(await q(db,'SELECT id FROM users WHERE nickname=$1 ORDER BY id LIMIT 2',[TARGET.nickname])).id),TARGET.id);
  const saved=await q(db,'SELECT value FROM app_meta WHERE key=$1',[OPERATION_KEY]);
  if(saved.length){const result=await verifyEuakValterOnce(db);await db.query('ROLLBACK');return {...result,committed:false,replayed:true};}
  const owner=only(await q(db,'SELECT nickname,status,role FROM users WHERE id=1'));
  assert.equal(owner.nickname,'핑크빛유두');assert.equal(owner.status,'ACTIVE');assert.equal(owner.role,'OWNER');
  const clock=only(await q(db,"SELECT clock_timestamp() now,to_char(CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Seoul','YYYY-MM-DD') kst"));
  assert.equal(clock.kst,'2026-10-11','One-time operation expired');
  assert.equal((await q(db,'SELECT key FROM app_meta WHERE key=ANY($1::text[]) ORDER BY key FOR SHARE',[SETTINGS])).length,SETTINGS.length);
  only(await q(db,'SELECT code FROM mercenary_limited_stock_v1 WHERE code=$1 FOR SHARE',[CODE]));
  assert.equal((await q(db,'SELECT value FROM app_meta WHERE key=$1 FOR UPDATE',[ENTITLEMENT_KEY])).length,0,'Existing entitlement must not be overwritten');
  const before=await preservedState(db),cfg=cleanChickenSettings(json(before.settings.find(r=>r.key===CHICKEN_KEY)).settings);
  const phase=chickenPhase(cfg,new Date(clock.now).getTime());assert.equal(phase,'OPEN','Event is not open');
  const limit=Number(before.stock.stock_limit),issued=Number(before.stock.issued);
  assert.equal(limit,8,'Live cap changed; inspect before retry');assert.ok(Number.isSafeInteger(issued)&&issued>=0&&issued<limit,'Valter sold out');
  assert.equal(json(before.settings.find(r=>r.key==='mercenary_limited_pack_v1')).settings.stockLimits[CODE],limit);
  const now=new Date(clock.now).toISOString();
  const entitlement=chickenLimitedOnceState({userId:TARGET.id,actorId:1,operationId:OPERATION_KEY,mercenaryCode:CODE,reason:'사용자 지정: 으악 계정 철구네치킨집 다음 정상 주문 1회 SSS 발테르 확정, 이후 일반 확률 적용',now});
  only(await q(db,'INSERT INTO app_meta(key,value,updated_at) VALUES($1,$2,$3) RETURNING key',[ENTITLEMENT_KEY,JSON.stringify(entitlement),now]));
  const audit=only(await q(db,"INSERT INTO admin_logs(admin_id,action_type,target_type,target_id,before_data,after_data) VALUES(1,'CHICKEN_LIMITED_ONCE_ARMED','USER',$1,$2,$3) RETURNING id",[String(TARGET.id),JSON.stringify({operationKey:OPERATION_KEY,entitlement:null}),JSON.stringify(entitlement)]));
  assert.deepEqual(await preservedState(db),before,'Account, event settings or limited stock changed unexpectedly');
  const receipt={status:'COMPLETED',operationKey:OPERATION_KEY,target:TARGET,completedAt:now,
   guarantee:{key:ENTITLEMENT_KEY,code:CODE,name:'발테르',rank:'SSS',edition:'LIMITED',quantity:1,status:'ARMED',nextValidParticipation:true,subsequent:'NORMAL_PROBABILITY'},
   eventPhase:phase,ticketCost:1,ticketsAtArm:Number(before.inventory.find(r=>r.item_code===CHICKEN_TICKET)?.quantity||0),
   stock:{limit,issued,remaining:limit-issued},settingsPreserved:true,balancesAndInventoryPreserved:true,holdingsAndLoadoutPreserved:true,noOrderPlaced:true,noCardIssued:true,adminLogId:String(audit.id)};
  only(await q(db,'INSERT INTO app_meta(key,value,updated_at) VALUES($1,$2,$3) RETURNING key',[OPERATION_KEY,JSON.stringify(receipt),now]));
  const verified=await verifyEuakValterOnce(db);
  await db.query(commit?'COMMIT':'ROLLBACK');return {...verified,committed:commit,replayed:false};
 }catch(error){await db.query('ROLLBACK').catch(()=>{});throw error;}
}
