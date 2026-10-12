import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {mercenaryCardAcquisitionStatements} from '../../functions/_mercenary_draw_accounting.js';

export const OPERATION_KEY='ops:sera-berkan-grant:20261013:v1';
export const TARGET=Object.freeze({id:45,nickname:'박세라-ㅂ-'});
export const CARDS=Object.freeze([Object.freeze({code:'V-055',name:'베르칸',rank:'SSS',quantity:1})]);
export const PLAN=Object.freeze({operationKey:OPERATION_KEY,target:TARGET,cards:CARDS,
 authorization:'박세라-ㅂ- 계정에 베르칸 지급해',delivery:'DIRECT',permanent:true,cost:0});
export const PLAN_HASH=createHash('sha256').update(JSON.stringify(PLAN)).digest('hex');
const q=async(db,sql,args=[])=>(await db.query(sql,args)).rows;
const only=rows=>{assert.equal(rows.length,1,'Exactly one row required');return rows[0];};
const aid=code=>OPERATION_KEY+':'+code;
const count=value=>{const n=Number(value);assert(Number.isSafeInteger(n)&&n>=0,'Invalid count');return n;};

export async function inspectSeraBerkan(db){
 const users=await q(db,'SELECT id,nickname,status,role,coin,card_shards,magic_crystals FROM users WHERE id=$1 OR nickname=$2 ORDER BY id',[TARGET.id,TARGET.nickname]);
 const cms=only(await q(db,"SELECT * FROM mercenary_cms_documents_v1 WHERE doc_key='config'"));
 const draw=only(await q(db,'SELECT * FROM mercenary_draw_config_v1 WHERE id=1'));
 const cards=await q(db,'SELECT * FROM user_mercenary_cards_v1 WHERE user_id=$1 ORDER BY mercenary_code',[TARGET.id]);
 const saved=await q(db,'SELECT value FROM app_meta WHERE key=$1',[OPERATION_KEY]);
 return {users,cms,draw,cards,receipt:saved[0]?JSON.parse(saved[0].value):null};
}

async function protectedState(db){
 const result={};
 for(const [name,table,order]of [['inventory','cnine_user_inventory','item_code'],['loadout','user_mercenary_loadout_v1','user_id'],['growth','user_mercenary_growth_v1','mercenary_code']])
  result[name]=await q(db,`SELECT * FROM ${table} WHERE user_id=$1 ORDER BY ${order}`,[TARGET.id]);
 return result;
}

export async function verifySeraBerkan(db){
 const state=await inspectSeraBerkan(db),receipt=state.receipt;
 assert.equal(receipt?.status,'COMPLETED');assert.equal(receipt.operationKey,OPERATION_KEY);assert.equal(receipt.planHash,PLAN_HASH);
 assert.deepEqual(receipt.plan,PLAN);assert.equal(receipt.grants.length,1);
 const card=CARDS[0],grant=only(receipt.grants);
 assert.equal(grant.userId,TARGET.id);assert.equal(grant.nickname,TARGET.nickname);
 for(const [key,value]of Object.entries(card))assert.equal(grant[key],value);
 assert.equal(grant.acquisitionId,aid(card.code));assert.equal(grant.copiesAfter,grant.copiesBefore+1);
 const acquisition=only(await q(db,'SELECT * FROM mercenary_card_acquisitions_v1 WHERE acquisition_id=$1',[aid(card.code)]));
 assert.equal(Number(acquisition.user_id),TARGET.id);assert.equal(acquisition.mercenary_code,card.code);
 assert.equal(Number(acquisition.total_copies_after),grant.copiesAfter);assert.equal(Number(acquisition.duplicate_count_after),grant.copiesAfter-1);
 assert.equal(Number(acquisition.is_duplicate),grant.copiesBefore>0?1:0);assert.equal(acquisition.created_at,receipt.completedAt);
 const holding=only(state.cards.filter(c=>c.mercenary_code===card.code));
 assert(count(holding.total_copies)>=grant.copiesAfter);assert.equal(count(holding.duplicate_count),count(holding.total_copies)-1);
 assert.equal((await q(db,'SELECT acquisition_id FROM mercenary_limited_issues_v1 WHERE acquisition_id=$1',[aid(card.code)])).length,0);
 const audit=only(await q(db,'SELECT id,admin_id,action_type,target_type,target_id,before_data,after_data FROM admin_logs WHERE id=ANY($1::bigint[]) ORDER BY id',[receipt.adminLogIds]));
 assert.equal(Number(audit.admin_id),1);assert.equal(audit.action_type,'OPS_MERCENARY_GRANT');
 assert.equal(audit.target_type,'USER');assert.equal(audit.target_id,String(TARGET.id));
 assert.deepEqual(JSON.parse(audit.after_data),{operationKey:OPERATION_KEY,...grant});
 return {status:'VERIFIED',receipt,holdings:[{code:card.code,copies:count(holding.total_copies)}],missing:0,duplicateOperationGrants:0};
}

// One authorized grant under the live USER_LOCK lease and matching DB fallback.
// Use the game's acquisition accounting inside the same transaction as the receipt.
export async function grantSeraBerkan(db,{dryRun=false,lockDeadline,approvedPlanHash}={}){
 assert.equal(approvedPlanHash,PLAN_HASH,'Reviewed plan required');
 assert(Number.isSafeInteger(lockDeadline)&&lockDeadline>Date.now()+15000,'Live account lease required');
 await db.query('BEGIN');
 try{
  await db.query("SET LOCAL lock_timeout='3s'");await db.query("SET LOCAL statement_timeout='10s'");
  only(await q(db,'SELECT id FROM users WHERE id=$1 FOR UPDATE',[TARGET.id]));
  only(await q(db,"SELECT doc_key FROM mercenary_cms_documents_v1 WHERE doc_key='config' FOR SHARE"));
  only(await q(db,'SELECT id FROM mercenary_draw_config_v1 WHERE id=1 FOR SHARE'));
  const before=await inspectSeraBerkan(db);
  if(before.receipt){const result=await verifySeraBerkan(db);await db.query(dryRun?'ROLLBACK':'COMMIT');return {...result,dryRun,replayed:true};}
  const user=only(before.users);assert.equal(Number(user.id),TARGET.id);assert.equal(user.nickname,TARGET.nickname);
  assert.equal(user.status,'ACTIVE');assert.equal(user.role,'USER');
  const owner=only(await q(db,'SELECT id,role,status FROM users WHERE id=1'));assert.equal(owner.role,'OWNER');assert.equal(owner.status,'ACTIVE');
  const day=only(await q(db,"SELECT to_char(CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Seoul','YYYY-MM-DD') AS kst"));assert.equal(day.kst,'2026-10-13','One-time operation expired');
  const card=CARDS[0],entry=only(JSON.parse(before.cms.payload_json).mercenaries.filter(c=>c.code===card.code));
  assert.equal(entry.name,card.name);assert.equal(entry.rank,card.rank);
  assert.notEqual(Number(JSON.parse(before.draw.payload_json).cardRules?.cardWeights?.[card.code]??1),0,'Mercenary acquisition is OFF');
  for(const table of ['mercenary_card_acquisitions_v1','mercenary_limited_issues_v1'])
   assert.equal((await q(db,`SELECT acquisition_id FROM ${table} WHERE acquisition_id=$1`,[aid(card.code)])).length,0,'Orphan acquisition requires inspection');
  const protectedBefore=await protectedState(db),owned=before.cards.find(c=>c.mercenary_code===card.code),copiesBefore=count(owned?.total_copies??0);
  assert(copiesBefore<2147483647);if(owned)assert.equal(count(owned.duplicate_count),copiesBefore-1);
  const now=new Date().toISOString();
  const adapter={dialect:'postgres',prepare(sql){return {bind(...args){let n=0;return {sql:sql.replace(/\?/g,()=>'$'+(++n)),args};}};}};
  for(const statement of mercenaryCardAcquisitionStatements(adapter,{userId:TARGET.id,mercenaryCode:card.code,acquisitionId:aid(card.code),createdAt:now}))await db.query(statement.sql,statement.args);
  const after=await inspectSeraBerkan(db),holding=only(after.cards.filter(c=>c.mercenary_code===card.code));
  assert.equal(Number(holding.total_copies),copiesBefore+1);assert.equal(Number(holding.duplicate_count),copiesBefore);
  assert.equal(holding.first_obtained_at,owned?.first_obtained_at??now);
  for(const key of ['users','cms','draw'])assert.deepEqual(after[key],before[key]);
  assert.deepEqual(await protectedState(db),protectedBefore);
  const other=rows=>rows.filter(c=>c.mercenary_code!==card.code);assert.deepEqual(other(after.cards),other(before.cards));
  const grant={userId:TARGET.id,nickname:TARGET.nickname,...card,acquisitionId:aid(card.code),copiesBefore,copiesAfter:copiesBefore+1};
  const receipt={status:'COMPLETED',operationKey:OPERATION_KEY,planHash:PLAN_HASH,plan:PLAN,actor:'CODEX_OPERATIONS',completedAt:now,
   grants:[grant],preserved:{balances:true,inventory:true,loadout:true,growth:true,otherCards:true,cms:true,drawPolicy:true},adminLogIds:[]};
  const log=only(await q(db,"INSERT INTO admin_logs(admin_id,action_type,target_type,target_id,before_data,after_data) VALUES(1,'OPS_MERCENARY_GRANT','USER',$1,$2,$3) RETURNING id",[String(TARGET.id),JSON.stringify({operationKey:OPERATION_KEY,code:card.code,copies:copiesBefore}),JSON.stringify({operationKey:OPERATION_KEY,...grant})]));receipt.adminLogIds.push(String(log.id));
  only(await q(db,'INSERT INTO app_meta(key,value,updated_at) VALUES($1,$2,$3) RETURNING key',[OPERATION_KEY,JSON.stringify(receipt),now]));
  const verified=await verifySeraBerkan(db);assert(lockDeadline>Date.now()+5000,'Account lease expired before commit');
  await db.query(dryRun?'ROLLBACK':'COMMIT');return {...verified,dryRun,replayed:false};
 }catch(error){await db.query('ROLLBACK').catch(()=>{});throw error;}
}
