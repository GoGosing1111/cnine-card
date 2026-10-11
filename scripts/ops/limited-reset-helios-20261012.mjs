import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {LIMITED_MERCENARIES} from '../../shared/mercenary-limited-catalog-v1.mjs';
import {LIMITED_DAILY_CAP} from '../../shared/mercenary-limited-daily-v1.mjs';

export const DAY='2026-10-12';
export const OPERATION_KEY='ops:limited-reset-helios:20261012:v1';
export const TARGET=Object.freeze({id:65,nickname:'음순이',code:'V-999',name:'헬리오스',quantity:1});
export const ACQUISITION_ID=OPERATION_KEY+':65';
export const CONFIG_KEYS=['mercenary_limited_draw_policy_v1','mercenary_limited_pack_v1'];
export const AUTHORIZATION='12일 용병 리미티드팩 구매한도 리셋 / 헬리오스 음순이 계정에 지급';
export const PLAN_HASH=createHash('sha256').update(JSON.stringify({DAY,OPERATION_KEY,TARGET,AUTHORIZATION})).digest('hex');
const DAILY_PATTERN='^mercenary_limited_daily_v1:[0-9]+:'+DAY+'$';
const q=async(db,sql,args=[])=>(await db.query(sql,args)).rows;
const only=rows=>{assert.equal(rows.length,1,'Expected exactly one row');return rows[0];};
const integer=(value,min=0,max=Number.MAX_SAFE_INTEGER)=>{const n=Number(value);assert(value!==null&&Number.isSafeInteger(n)&&n>=min&&n<=max,'Invalid count');return n;};

export async function inspectLimitedResetHelios(db){
 const users=await q(db,'SELECT id,nickname,role,status,coin,card_shards,magic_crystals FROM users WHERE id IN (1,65) ORDER BY id');
 const settings=await q(db,'SELECT key,value FROM app_meta WHERE key=ANY($1::text[]) ORDER BY key',[CONFIG_KEYS]);
 const daily=await q(db,"SELECT m.key,m.value,m.updated_at,u.id,u.nickname FROM app_meta m LEFT JOIN users u ON u.id=split_part(m.key,':',2)::bigint WHERE m.key ~ $1 ORDER BY u.id",[DAILY_PATTERN]);
 const stock=only(await q(db,'SELECT * FROM mercenary_limited_stock_v1 WHERE code=$1',[TARGET.code]));
 const issues=await q(db,'SELECT * FROM mercenary_limited_issues_v1 WHERE code=$1 ORDER BY serial',[TARGET.code]);
 const cards=await q(db,'SELECT * FROM user_mercenary_cards_v1 WHERE user_id=$1 ORDER BY mercenary_code',[TARGET.id]);
 const saved=await q(db,'SELECT value FROM app_meta WHERE key=$1',[OPERATION_KEY]);
 return {users,settings,daily,stock,issues,cards,receipt:saved[0]?JSON.parse(saved[0].value):null};
}
function ledger(state){
 const pack=JSON.parse(only(state.settings.filter(r=>r.key===CONFIG_KEYS[1])).value);
 const issued=integer(state.stock.issued),limit=integer(state.stock.stock_limit,issued,1000000);
 assert.equal(pack.settings.stockLimits[TARGET.code],limit,'CMS and stock limit mismatch');
 assert.equal(state.issues.length,issued,'Issuance count mismatch');
 state.issues.forEach((row,i)=>assert.equal(integer(row.serial,1),i+1,'Issuance sequence mismatch'));
 return {limit,issued,remaining:limit-issued,revision:integer(state.stock.revision)};
}
async function protectedTarget(db){
 const result={};
 for(const [table,order] of [['cnine_user_inventory','item_code'],['user_mercenary_loadout_v1','user_id'],['user_mercenary_growth_v1','mercenary_code']])
  result[table]=await q(db,'SELECT * FROM '+table+' WHERE user_id=$1 ORDER BY '+order,[TARGET.id]);
 return result;
}
export async function verifyLimitedResetHelios(db){
 const state=await inspectLimitedResetHelios(db),r=state.receipt;
 assert.equal(r?.status,'COMPLETED');assert.equal(r.operationKey,OPERATION_KEY);assert.equal(r.planHash,PLAN_HASH);
 const current=ledger(state),g=r.grant;
 assert.equal(g.userId,TARGET.id);assert.equal(g.nickname,TARGET.nickname);assert.equal(g.code,TARGET.code);assert.equal(g.quantity,1);
 assert.equal(g.acquisitionId,ACQUISITION_ID);assert.equal(g.copiesAfter,g.copiesBefore+1);
 assert.equal(r.reset.day,DAY);assert.equal(r.reset.limit,LIMITED_DAILY_CAP);assert.equal(r.reset.affectedUsers,r.reset.targets.length);
 assert.equal(r.reset.restoredPurchases,r.reset.targets.reduce((n,t)=>n+t.usedBefore,0));
 for(const target of r.reset.targets){assert.equal(target.key,'mercenary_limited_daily_v1:'+target.userId+':'+DAY);assert(target.usedBefore>0&&target.usedBefore<=LIMITED_DAILY_CAP);assert.equal(target.usedAfter,0);}
 assert.equal(r.stockAfter.limit,r.stockBefore.limit);assert.equal(r.stockAfter.issued,r.stockBefore.issued+1);assert.equal(r.stockAfter.remaining,r.stockBefore.remaining-1);
 assert(current.issued>=r.stockAfter.issued);
 const issue=only(state.issues.filter(i=>i.acquisition_id===ACQUISITION_ID));
 assert.equal(Number(issue.user_id),TARGET.id);assert.equal(issue.code,TARGET.code);assert.equal(issue.request_id,OPERATION_KEY);assert.equal(Number(issue.serial),g.serial);
 const acquired=only(await q(db,'SELECT * FROM mercenary_card_acquisitions_v1 WHERE acquisition_id=$1',[ACQUISITION_ID]));
 assert.equal(Number(acquired.user_id),TARGET.id);assert.equal(acquired.mercenary_code,TARGET.code);assert.equal(Number(acquired.total_copies_after),g.copiesAfter);assert.equal(Number(acquired.duplicate_count_after),g.copiesBefore);assert.equal(Number(acquired.is_duplicate),g.copiesBefore>0?1:0);
 const holding=only(state.cards.filter(c=>c.mercenary_code===TARGET.code));assert(Number(holding.total_copies)>=g.copiesAfter);assert.equal(Number(holding.duplicate_count),Number(holding.total_copies)-1);
 const audits=await q(db,'SELECT id,action_type,target_id,after_data FROM admin_logs WHERE id=ANY($1::bigint[]) ORDER BY id',[r.auditIds]);
 assert.equal(audits.length,2);assert.deepEqual(audits.map(a=>a.action_type),['OPS_LIMITED_DAILY_RESET','OPS_LIMITED_MERCENARY_GRANT']);
 assert.deepEqual(audits.map(a=>a.target_id),[DAY,String(TARGET.id)]);for(const a of audits)assert.equal(JSON.parse(a.after_data).operationKey,OPERATION_KEY);
 return {status:'VERIFIED',receipt:r,stock:current,holding:{userId:TARGET.id,nickname:TARGET.nickname,code:TARGET.code,copies:Number(holding.total_copies),serial:g.serial},currentDayUsed:state.daily.reduce((n,row)=>n+integer(row.value),0)};
}

// The caller holds the live USER_LOCK lease for account 65. All pack purchases
// lock their user first, then these configuration rows FOR SHARE. FOR UPDATE
// provides one global reset boundary without changing policy or touching receipts.
export async function applyLimitedResetHelios(db,{dryRun=false,lockDeadline,approvedPlanHash}={}){
 assert.equal(approvedPlanHash,PLAN_HASH,'Inspected plan required');
 assert(Number.isSafeInteger(lockDeadline)&&lockDeadline>Date.now()+15000,'Live account lease required');
 await db.query('BEGIN');
 try{
  await db.query("SET LOCAL lock_timeout='3s'");await db.query("SET LOCAL statement_timeout='10s'");
  only(await q(db,'SELECT id FROM users WHERE id=$1 FOR UPDATE',[TARGET.id]));
  assert.equal((await q(db,'SELECT key FROM app_meta WHERE key=ANY($1::text[]) ORDER BY key FOR UPDATE',[CONFIG_KEYS])).length,2);
  only(await q(db,'SELECT code FROM mercenary_limited_stock_v1 WHERE code=$1 FOR UPDATE',[TARGET.code]));
  const before=await inspectLimitedResetHelios(db);
  if(before.receipt){const verified=await verifyLimitedResetHelios(db);await db.query(dryRun?'ROLLBACK':'COMMIT');return {replayed:true,dryRun,...verified};}
  assert.equal(only(await q(db,"SELECT to_char(CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Seoul','YYYY-MM-DD') AS kst")).kst,DAY,'One-time reset day expired');
  const user=only(before.users.filter(u=>Number(u.id)===TARGET.id)),owner=only(before.users.filter(u=>Number(u.id)===1));
  assert.equal(user.nickname,TARGET.nickname);assert.equal(user.status,'ACTIVE');assert.equal(user.role,'USER');
  assert.equal(Number(only(await q(db,'SELECT id FROM users WHERE lower(nickname)=lower($1)',[TARGET.nickname])).id),TARGET.id,'Ambiguous nickname');
  assert.equal(owner.role,'OWNER');assert.equal(owner.status,'ACTIVE');assert.equal(owner.nickname,'핑크빛유두');
  const card=LIMITED_MERCENARIES.find(c=>c.code===TARGET.code);assert.equal(card?.name,TARGET.name);assert.equal(card.rank,'SSS');assert.equal(card.edition,'LIMITED');
  const stockBefore=ledger(before);assert(stockBefore.remaining>=1,'No authorized stock remains');
  assert.equal((await q(db,'SELECT acquisition_id FROM mercenary_card_acquisitions_v1 WHERE acquisition_id=$1',[ACQUISITION_ID])).length,0,'Orphan acquisition');
  assert.equal(before.issues.filter(r=>r.acquisition_id===ACQUISITION_ID).length,0,'Orphan issuance');
  const protectedBefore=await protectedTarget(db),now=new Date().toISOString();
  const targets=before.daily.filter(row=>integer(row.value,0,LIMITED_DAILY_CAP)>0).map(row=>({key:row.key,userId:integer(row.id,1),nickname:row.nickname,usedBefore:integer(row.value),usedAfter:0}));
  const changed=await q(db,"UPDATE app_meta SET value='0',updated_at=$2 WHERE key ~ $1 AND CAST(value AS BIGINT)>0 RETURNING key",[DAILY_PATTERN,now]);
  assert.deepEqual(changed.map(r=>r.key).sort(),targets.map(r=>r.key).sort(),'Reset target set changed');
  only(await q(db,'UPDATE mercenary_limited_stock_v1 SET issued=issued+1,revision=revision+1,last_token=$2 WHERE code=$1 AND issued=$3 AND revision=$4 AND issued<stock_limit RETURNING code',[TARGET.code,OPERATION_KEY,before.stock.issued,before.stock.revision]));
  const existing=before.cards.find(c=>c.mercenary_code===TARGET.code),copiesBefore=integer(existing?.total_copies??0,0,2147483646);
  if(existing)assert.equal(integer(existing.duplicate_count),copiesBefore-1);
  const holding=only(await q(db,`INSERT INTO user_mercenary_cards_v1(user_id,mercenary_code,total_copies,duplicate_count,first_obtained_at,last_obtained_at) VALUES($1,$2,1,0,$3,$3)
    ON CONFLICT(user_id,mercenary_code) DO UPDATE SET total_copies=user_mercenary_cards_v1.total_copies+1,duplicate_count=user_mercenary_cards_v1.duplicate_count+1,last_obtained_at=excluded.last_obtained_at RETURNING *`,[TARGET.id,TARGET.code,now]));
  assert.equal(Number(holding.total_copies),copiesBefore+1);assert.equal(Number(holding.duplicate_count),copiesBefore);assert.equal(holding.first_obtained_at,existing?.first_obtained_at||now);
  const serial=stockBefore.issued+1;
  only(await q(db,'INSERT INTO mercenary_limited_issues_v1(acquisition_id,request_id,user_id,code,serial,created_at) VALUES($1,$2,$3,$4,$5,$6) RETURNING acquisition_id',[ACQUISITION_ID,OPERATION_KEY,TARGET.id,TARGET.code,serial,now]));
  only(await q(db,'INSERT INTO mercenary_card_acquisitions_v1(acquisition_id,user_id,mercenary_code,is_duplicate,total_copies_after,duplicate_count_after,created_at) VALUES($1,$2,$3,$4,$5,$6,$7) RETURNING acquisition_id',[ACQUISITION_ID,TARGET.id,TARGET.code,copiesBefore>0?1:0,copiesBefore+1,copiesBefore,now]));
  const after=await inspectLimitedResetHelios(db),stockAfter=ledger(after);
  assert.deepEqual(after.settings,before.settings);assert.deepEqual(after.users,before.users);assert.deepEqual(await protectedTarget(db),protectedBefore);
  assert.deepEqual(after.cards.filter(c=>c.mercenary_code!==TARGET.code),before.cards.filter(c=>c.mercenary_code!==TARGET.code));
  assert.deepEqual(after.issues.filter(i=>i.acquisition_id!==ACQUISITION_ID),before.issues);
  assert.equal(after.daily.reduce((n,row)=>n+integer(row.value),0),0,'Reset did not clear current day');
  const grant={userId:TARGET.id,nickname:TARGET.nickname,code:TARGET.code,name:TARGET.name,rank:'SSS',edition:'LIMITED',quantity:1,acquisitionId:ACQUISITION_ID,serial,copiesBefore,copiesAfter:copiesBefore+1};
  const reset={day:DAY,limit:LIMITED_DAILY_CAP,affectedUsers:targets.length,restoredPurchases:targets.reduce((n,t)=>n+t.usedBefore,0),targets};
  const receipt={status:'COMPLETED',operationKey:OPERATION_KEY,planHash:PLAN_HASH,authorization:AUTHORIZATION,completedAt:now,reset,grant,stockBefore,stockAfter,settingsPreserved:true,balancesPreserved:true,inventoryLoadoutGrowthPreserved:true,auditIds:[]};
  for(const [action,type,id,old,next]of [['OPS_LIMITED_DAILY_RESET','MERCENARY_LIMITED_DAILY',DAY,{targets:targets.map(t=>({key:t.key,used:t.usedBefore}))},reset],['OPS_LIMITED_MERCENARY_GRANT','USER',String(TARGET.id),{copies:copiesBefore,stock:stockBefore},{...grant,stock:stockAfter}]]){
   const row=only(await q(db,'INSERT INTO admin_logs(admin_id,action_type,target_type,target_id,before_data,after_data) VALUES(1,$1,$2,$3,$4,$5) RETURNING id',[action,type,id,JSON.stringify({operationKey:OPERATION_KEY,...old}),JSON.stringify({operationKey:OPERATION_KEY,...next})]));receipt.auditIds.push(String(row.id));
  }
  only(await q(db,'INSERT INTO app_meta(key,value,updated_at) VALUES($1,$2,$3) RETURNING key',[OPERATION_KEY,JSON.stringify(receipt),now]));
  const verified=await verifyLimitedResetHelios(db);assert(lockDeadline>Date.now()+5000,'Lease expired before commit');
  await db.query(dryRun?'ROLLBACK':'COMMIT');return {replayed:false,dryRun,...verified};
 }catch(error){await db.query('ROLLBACK').catch(()=>{});throw error;}
}
