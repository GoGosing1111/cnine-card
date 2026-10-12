import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {LIMITED_MERCENARIES} from '../../shared/mercenary-limited-catalog-v1.mjs';

export const OPERATION_KEY='ops:diim-valter-grant:20261013:v1';
export const TARGET=Object.freeze({id:4773,nickname:'진짜디임'});
export const CARDS=Object.freeze([
 Object.freeze({code:'V-996',name:'발테르',rank:'SSS',edition:'LIMITED',quantity:1})
]);
export const PACK_KEY='mercenary_limited_pack_v1',POLICY_KEY='mercenary_limited_draw_policy_v1';
export const LIMITED_CODE='V-996',EXPECTED_LIMIT=8;
export const PLAN=Object.freeze({operationKey:OPERATION_KEY,target:TARGET,cards:CARDS,addedCapacity:1,expectedLimit:EXPECTED_LIMIT,
 authorization:'진짜디임 계정에 sss 발테르 발급하고 차감안되게 해',delivery:'DIRECT',permanent:true,cost:0,remainingStockDeduction:0});
export const PLAN_HASH=createHash('sha256').update(JSON.stringify(PLAN)).digest('hex');
const q=async(db,sql,args=[])=>(await db.query(sql,args)).rows;
const only=rows=>{assert.equal(rows.length,1,'Exactly one row required');return rows[0];};
const aid=code=>OPERATION_KEY+':'+code;
const count=value=>{const n=Number(value);assert(Number.isSafeInteger(n)&&n>=0,'Invalid count');return n;};

export async function inspectDiimValter(db){
 const users=await q(db,'SELECT id,nickname,status,role,coin,card_shards,magic_crystals FROM users WHERE id=$1 OR nickname=$2 ORDER BY id',[TARGET.id,TARGET.nickname]);
 const settings=await q(db,'SELECT key,value FROM app_meta WHERE key=ANY($1::text[]) ORDER BY key',[[PACK_KEY,POLICY_KEY]]);
 const packText=only(settings.filter(s=>s.key===PACK_KEY)).value;
 const stock=only(await q(db,'SELECT * FROM mercenary_limited_stock_v1 WHERE code=$1',[LIMITED_CODE]));
 const issues=await q(db,'SELECT * FROM mercenary_limited_issues_v1 WHERE code=$1 ORDER BY serial',[LIMITED_CODE]);
 const cards=await q(db,'SELECT * FROM user_mercenary_cards_v1 WHERE user_id=$1 ORDER BY mercenary_code',[TARGET.id]);
 const saved=await q(db,'SELECT value FROM app_meta WHERE key=$1',[OPERATION_KEY]);
 return {users,settings,pack:JSON.parse(packText),packText,stock,issues,cards,receipt:saved[0]?JSON.parse(saved[0].value):null};
}

async function protectedState(db){
 const result={};
 for(const [name,table,order]of [['inventory','cnine_user_inventory','item_code'],['loadout','user_mercenary_loadout_v1','user_id'],['growth','user_mercenary_growth_v1','mercenary_code']])
  result[name]=await q(db,`SELECT * FROM ${table} WHERE user_id=$1 ORDER BY ${order}`,[TARGET.id]);
 result.cms=await q(db,"SELECT * FROM mercenary_cms_documents_v1 WHERE doc_key='config'");
 result.draw=await q(db,'SELECT * FROM mercenary_draw_config_v1 WHERE id=1');
 return result;
}

function ledger(state){
 const limit=count(state.stock.stock_limit),issued=count(state.stock.issued);
 assert(limit>=issued);assert.equal(state.pack.settings.stockLimits[LIMITED_CODE],limit,'CMS/stock mismatch');
 assert.equal(state.issues.length,issued,'Issue ledger mismatch');
 state.issues.forEach((issue,i)=>assert.equal(count(issue.serial),i+1,'Issue serial gap'));
 return {limit,issued,remaining:limit-issued};
}

export async function verifyDiimValter(db){
 const state=await inspectDiimValter(db),receipt=state.receipt;
 assert.equal(receipt?.status,'COMPLETED');assert.equal(receipt.operationKey,OPERATION_KEY);assert.equal(receipt.planHash,PLAN_HASH);
 assert.deepEqual(receipt.plan,PLAN);assert.equal(receipt.grants.length,1);
 assert.equal(receipt.before.limit,EXPECTED_LIMIT);assert.equal(receipt.after.limit,EXPECTED_LIMIT+1);
 assert.equal(receipt.after.issued,receipt.before.issued+1);assert.equal(receipt.after.remaining,receipt.before.remaining);
 const current=ledger(state);assert(current.issued>=receipt.after.issued);
 for(const card of CARDS){
  const grant=only(receipt.grants.filter(g=>g.code===card.code));
  assert.equal(grant.userId,TARGET.id);assert.equal(grant.nickname,TARGET.nickname);
  for(const [key,value]of Object.entries(card))assert.equal(grant[key],value);
  assert.equal(grant.acquisitionId,aid(card.code));assert.equal(grant.copiesAfter,grant.copiesBefore+1);
  const acquisition=only(await q(db,'SELECT * FROM mercenary_card_acquisitions_v1 WHERE acquisition_id=$1',[aid(card.code)]));
  assert.equal(Number(acquisition.user_id),TARGET.id);assert.equal(acquisition.mercenary_code,card.code);
  assert.equal(Number(acquisition.total_copies_after),grant.copiesAfter);assert.equal(Number(acquisition.duplicate_count_after),grant.copiesAfter-1);
  assert.equal(Number(acquisition.is_duplicate),grant.copiesBefore>0?1:0);assert.equal(acquisition.created_at,receipt.completedAt);
  const holding=only(state.cards.filter(c=>c.mercenary_code===card.code));
  assert(count(holding.total_copies)>=grant.copiesAfter);assert.equal(count(holding.duplicate_count),count(holding.total_copies)-1);
  const issues=await q(db,'SELECT * FROM mercenary_limited_issues_v1 WHERE acquisition_id=$1',[aid(card.code)]);
  if(card.edition==='LIMITED'){
   const issue=only(issues);assert.equal(issue.code,LIMITED_CODE);assert.equal(Number(issue.user_id),TARGET.id);
   assert.equal(issue.request_id,OPERATION_KEY);assert.equal(Number(issue.serial),grant.serial);assert.equal(grant.serial,receipt.after.issued);
   assert.equal(issue.created_at,receipt.completedAt);
  }else assert.equal(issues.length,0);
 }
 const audits=await q(db,'SELECT id,action_type,target_type,target_id,before_data,after_data FROM admin_logs WHERE id=ANY($1::bigint[]) ORDER BY id',[receipt.adminLogIds]);
 assert.equal(audits.length,2);assert.deepEqual(audits.map(a=>a.action_type),['OPS_LIMITED_MERCENARY_GRANT','OPS_LIMITED_EVENT_CAPACITY']);
 for(let i=0;i<CARDS.length;i++){
  assert.equal(audits[i].target_type,'USER');assert.equal(audits[i].target_id,String(TARGET.id));
  assert.deepEqual(JSON.parse(audits[i].after_data),{operationKey:OPERATION_KEY,...receipt.grants[i]});
 }
 assert.equal(audits[1].target_type,'MERCENARY_LIMITED_STOCK');assert.equal(audits[1].target_id,LIMITED_CODE);
 assert.deepEqual(JSON.parse(audits[1].after_data),{operationKey:OPERATION_KEY,addedCapacity:1,...receipt.after});
 return {status:'VERIFIED',receipt,current,holdings:CARDS.map(card=>({code:card.code,copies:count(only(state.cards.filter(c=>c.mercenary_code===card.code)).total_copies)})),missing:0,duplicateOperationGrants:0};
}

// One explicit operation, called under the live account lease plus its DB fallback.
// Ownership, +1 capacity/+1 issued, serial, and audit receipt commit atomically.
export async function grantDiimValter(db,{dryRun=false,lockDeadline,approvedPlanHash}={}){
 assert.equal(approvedPlanHash,PLAN_HASH,'Reviewed plan required');
 assert(Number.isSafeInteger(lockDeadline)&&lockDeadline>Date.now()+15000,'Live account lease required');
 await db.query('BEGIN');
 try{
  await db.query("SET LOCAL lock_timeout='3s'");await db.query("SET LOCAL statement_timeout='10s'");
  only(await q(db,'SELECT id FROM users WHERE id=$1 FOR UPDATE',[TARGET.id]));
  assert.equal((await q(db,'SELECT key FROM app_meta WHERE key=ANY($1::text[]) ORDER BY key FOR UPDATE',[[PACK_KEY,POLICY_KEY]])).length,2);
  only(await q(db,'SELECT code FROM mercenary_limited_stock_v1 WHERE code=$1 FOR UPDATE',[LIMITED_CODE]));
  const before=await inspectDiimValter(db);
  if(before.receipt){const result=await verifyDiimValter(db);await db.query(dryRun?'ROLLBACK':'COMMIT');return {...result,dryRun,replayed:true};}
  const user=only(before.users);assert.equal(Number(user.id),TARGET.id);assert.equal(user.nickname,TARGET.nickname);
  assert.equal(user.status,'ACTIVE');assert.equal(user.role,'USER');
  const owner=only(await q(db,"SELECT id,nickname,role,status FROM users WHERE id=1"));assert.equal(owner.role,'OWNER');assert.equal(owner.status,'ACTIVE');
  const day=only(await q(db,"SELECT to_char(CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Seoul','YYYY-MM-DD') AS kst"));assert.equal(day.kst,'2026-10-13','One-time operation expired');
  const protectedBefore=await protectedState(db);
  const valter=only(LIMITED_MERCENARIES.filter(c=>c.code===LIMITED_CODE));assert.equal(valter.name,'발테르');assert.equal(valter.rank,'SSS');assert.equal(valter.edition,'LIMITED');
  const baseline=ledger(before);assert.equal(baseline.limit,EXPECTED_LIMIT,'Reviewed limited capacity changed');
  for(const table of ['mercenary_card_acquisitions_v1','mercenary_limited_issues_v1'])
   assert.equal((await q(db,`SELECT acquisition_id FROM ${table} WHERE acquisition_id=ANY($1::text[])`,[CARDS.map(c=>aid(c.code))])).length,0,'Orphan acquisition requires inspection');
  const now=new Date().toISOString(),next=structuredClone(before.pack);
  next.settings.stockLimits[LIMITED_CODE]++;next.revision=count(next.revision)+1;next.updatedAt=now;next.updatedBy=1;next.lastRequestId=OPERATION_KEY;
  only(await q(db,'UPDATE app_meta SET value=$2,updated_at=$3 WHERE key=$1 AND value=$4 RETURNING key',[PACK_KEY,JSON.stringify(next),now,before.packText]));
  const stock=only(await q(db,'UPDATE mercenary_limited_stock_v1 SET stock_limit=stock_limit+1,issued=issued+1,revision=revision+1,last_token=$2 WHERE code=$1 AND stock_limit=$3 AND revision=$4 AND issued=$5 RETURNING *',[LIMITED_CODE,OPERATION_KEY,EXPECTED_LIMIT,before.stock.revision,before.stock.issued]));
  const grants=[];
  for(const card of CARDS){
   const owned=before.cards.find(c=>c.mercenary_code===card.code),copiesBefore=count(owned?.total_copies??0);
   assert(copiesBefore<2147483647);if(owned)assert.equal(count(owned.duplicate_count),copiesBefore-1);
   const holding=only(await q(db,`INSERT INTO user_mercenary_cards_v1(user_id,mercenary_code,total_copies,duplicate_count,first_obtained_at,last_obtained_at) VALUES($1,$2,1,0,$3,$3)
    ON CONFLICT(user_id,mercenary_code) DO UPDATE SET total_copies=user_mercenary_cards_v1.total_copies+1,duplicate_count=user_mercenary_cards_v1.duplicate_count+1,last_obtained_at=excluded.last_obtained_at RETURNING *`,[TARGET.id,card.code,now]));
   assert.equal(Number(holding.total_copies),copiesBefore+1);assert.equal(Number(holding.duplicate_count),copiesBefore);
   assert.equal(holding.first_obtained_at,owned?.first_obtained_at??now);
   only(await q(db,'INSERT INTO mercenary_card_acquisitions_v1(acquisition_id,user_id,mercenary_code,is_duplicate,total_copies_after,duplicate_count_after,created_at) VALUES($1,$2,$3,$4,$5,$6,$7) RETURNING acquisition_id',[aid(card.code),TARGET.id,card.code,copiesBefore>0?1:0,copiesBefore+1,copiesBefore,now]));
   const grant={userId:TARGET.id,nickname:TARGET.nickname,...card,acquisitionId:aid(card.code),copiesBefore,copiesAfter:copiesBefore+1};
   if(card.edition==='LIMITED'){
    grant.serial=count(stock.issued);
    only(await q(db,'INSERT INTO mercenary_limited_issues_v1(acquisition_id,request_id,user_id,code,serial,created_at) VALUES($1,$2,$3,$4,$5,$6) RETURNING acquisition_id',[aid(card.code),OPERATION_KEY,TARGET.id,card.code,grant.serial,now]));
   }
   grants.push(grant);
  }
  const after=await inspectDiimValter(db),final=ledger(after);
  assert.deepEqual(final,{limit:baseline.limit+1,issued:baseline.issued+1,remaining:baseline.remaining});
  assert.deepEqual(after.pack,next);assert.deepEqual(after.settings.filter(s=>s.key!==PACK_KEY),before.settings.filter(s=>s.key!==PACK_KEY));
  assert.deepEqual(after.users,before.users);assert.deepEqual(await protectedState(db),protectedBefore);
  const other=rows=>rows.filter(c=>!CARDS.some(t=>t.code===c.mercenary_code));assert.deepEqual(other(after.cards),other(before.cards));
  assert.deepEqual(after.issues.slice(0,baseline.issued),before.issues);
  const receipt={status:'COMPLETED',operationKey:OPERATION_KEY,planHash:PLAN_HASH,plan:PLAN,actor:'CODEX_OPERATIONS',completedAt:now,
   grants,before:baseline,after:final,packMode:next.settings.mode,preserved:{balances:true,inventory:true,loadout:true,growth:true,otherCards:true,otherSettings:true},adminLogIds:[]};
  for(const grant of grants){
   const log=only(await q(db,"INSERT INTO admin_logs(admin_id,action_type,target_type,target_id,before_data,after_data) VALUES(1,$1,'USER',$2,$3,$4) RETURNING id",[grant.edition==='LIMITED'?'OPS_LIMITED_MERCENARY_GRANT':'OPS_MERCENARY_GRANT',String(TARGET.id),JSON.stringify({operationKey:OPERATION_KEY,code:grant.code,copies:grant.copiesBefore}),JSON.stringify({operationKey:OPERATION_KEY,...grant})]));receipt.adminLogIds.push(String(log.id));
  }
  const capacityLog=only(await q(db,"INSERT INTO admin_logs(admin_id,action_type,target_type,target_id,before_data,after_data) VALUES(1,'OPS_LIMITED_EVENT_CAPACITY','MERCENARY_LIMITED_STOCK',$1,$2,$3) RETURNING id",[LIMITED_CODE,JSON.stringify({operationKey:OPERATION_KEY,...baseline}),JSON.stringify({operationKey:OPERATION_KEY,addedCapacity:1,...final})]));receipt.adminLogIds.push(String(capacityLog.id));
  only(await q(db,'INSERT INTO app_meta(key,value,updated_at) VALUES($1,$2,$3) RETURNING key',[OPERATION_KEY,JSON.stringify(receipt),now]));
  const verified=await verifyDiimValter(db);assert(lockDeadline>Date.now()+5000,'Account lease expired before commit');
  await db.query(dryRun?'ROLLBACK':'COMMIT');return {...verified,dryRun,replayed:false};
 }catch(error){await db.query('ROLLBACK').catch(()=>{});throw error;}
}
