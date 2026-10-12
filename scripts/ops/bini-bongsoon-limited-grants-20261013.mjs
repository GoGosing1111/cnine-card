import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {LIMITED_MERCENARIES} from '../../shared/mercenary-limited-catalog-v1.mjs';

export const OPERATION_KEY='ops:bini-bongsoon-limited-grants:20261013:v1';
export const TARGETS=Object.freeze([
 Object.freeze({id:5504,nickname:'비_니',code:'V-990',name:'나무늘봉순',rank:'SS'}),
 Object.freeze({id:5426,nickname:'나무늘봉순',code:'V-996',name:'발테르',rank:'SSS'})
]);
export const CAPACITY=Object.freeze({'V-990':Object.freeze({before:14,add:1}),'V-996':Object.freeze({before:10,add:1})});
export const PACK_KEY='mercenary_limited_pack_v1',POLICY_KEY='mercenary_limited_draw_policy_v1';
export const AUTHORIZATION='비_니 SS 나무늘봉순 리미티드 지급 / 나무늘봉순 SSS 발테르 지급 / 두건 리미티드 횟수차감없이 지급';
export const PLAN_HASH=createHash('sha256').update(JSON.stringify({OPERATION_KEY,TARGETS,CAPACITY,AUTHORIZATION})).digest('hex');
const IDS=TARGETS.map(t=>t.id).sort((a,b)=>a-b),CODES=Object.keys(CAPACITY).sort();
const only=rows=>{assert.equal(rows.length,1,'Expected one exact row');return rows[0];};
const q=async(db,sql,args=[])=>(await db.query(sql,args)).rows;
const aid=id=>OPERATION_KEY+':'+id;
const int=(value,min=0,max=Number.MAX_SAFE_INTEGER)=>{const n=Number(value);assert(Number.isSafeInteger(n)&&n>=min&&n<=max,'Invalid count');return n;};

export async function inspectLimitedGrants(db){
 const users=await q(db,'SELECT id,nickname,status,role,coin,card_shards,magic_crystals FROM users WHERE id=ANY($1::bigint[]) ORDER BY id',[IDS]);
 const settings=await q(db,'SELECT key,value FROM app_meta WHERE key=ANY($1::text[]) ORDER BY key',[[POLICY_KEY,PACK_KEY]]);
 const packText=only(settings.filter(r=>r.key===PACK_KEY)).value;
 const stock=await q(db,'SELECT * FROM mercenary_limited_stock_v1 WHERE code=ANY($1::text[]) ORDER BY code',[CODES]);
 const issues=await q(db,'SELECT * FROM mercenary_limited_issues_v1 WHERE code=ANY($1::text[]) ORDER BY code,serial',[CODES]);
 const cards=await q(db,'SELECT * FROM user_mercenary_cards_v1 WHERE user_id=ANY($1::bigint[]) ORDER BY user_id,mercenary_code',[IDS]);
 const saved=await q(db,'SELECT value FROM app_meta WHERE key=$1',[OPERATION_KEY]);
 return {users,settings,pack:JSON.parse(packText),packText,stock,issues,cards,receipt:saved[0]?JSON.parse(saved[0].value):null};
}
async function protectedState(db){
 const state={};
 for(const [name,table,order]of [['inventory','cnine_user_inventory','user_id,item_code'],['loadout','user_mercenary_loadout_v1','user_id'],['growth','user_mercenary_growth_v1','user_id,mercenary_code']])
  state[name]=await q(db,`SELECT * FROM ${table} WHERE user_id=ANY($1::bigint[]) ORDER BY ${order}`,[IDS]);
 state.dailyUsage=await q(db,'SELECT key,value,updated_at FROM app_meta WHERE key LIKE ANY($1::text[]) ORDER BY key',[IDS.map(id=>'mercenary_limited_daily_v1:'+id+':%')]);
 return state;
}
function assertLedger(state){
 const result={};
 for(const code of CODES){
  const row=only(state.stock.filter(s=>s.code===code)),issued=int(row.issued),limit=int(row.stock_limit,issued,1000000),issues=state.issues.filter(i=>i.code===code);
  assert.equal(state.pack.settings.stockLimits[code],limit,'CMS and stock limits differ');
  assert.equal(issues.length,issued,'Issue ledger count differs from stock');
  for(let i=0;i<issued;i++)assert.equal(int(issues[i].serial,1),i+1,'Issue serial gap');
  result[code]={limit,issued,remaining:limit-issued,stockRevision:int(row.revision)};
 }
 return result;
}
export async function verifyLimitedGrants(db){
 const state=await inspectLimitedGrants(db),r=state.receipt;
 assert.equal(r?.status,'COMPLETED');assert.equal(r.operationKey,OPERATION_KEY);assert.equal(r.planHash,PLAN_HASH);
 assert.equal(r.grants.length,TARGETS.length);const current=assertLedger(state);
 for(const [code,cap]of Object.entries(CAPACITY)){
  assert.equal(r.before[code].limit,cap.before);assert.equal(r.after[code].limit,cap.before+cap.add);
  assert.equal(r.after[code].issued,r.before[code].issued+cap.add);assert.equal(r.after[code].remaining,r.before[code].remaining);
  assert(current[code].issued>=r.after[code].issued,'Issued count regressed');
 }
 for(const target of TARGETS){
  const grant=only(r.grants.filter(g=>g.userId===target.id));
  assert.equal(grant.nickname,target.nickname);assert.equal(grant.quantity,1);assert.equal(grant.code,target.code);assert.equal(grant.name,target.name);
  assert.equal(grant.rank,target.rank);assert.equal(grant.edition,'LIMITED');assert.equal(grant.acquisitionId,aid(target.id));assert.equal(grant.copiesAfter,grant.copiesBefore+1);
  const issue=only(state.issues.filter(i=>i.acquisition_id===grant.acquisitionId));
  assert.equal(Number(issue.user_id),target.id);assert.equal(issue.code,target.code);assert.equal(issue.request_id,OPERATION_KEY);assert.equal(Number(issue.serial),grant.serial);assert.equal(issue.created_at,r.completedAt);assert.equal(grant.serial,r.after[target.code].issued);
  const acquisition=only(await q(db,'SELECT * FROM mercenary_card_acquisitions_v1 WHERE acquisition_id=$1',[grant.acquisitionId]));
  assert.equal(Number(acquisition.user_id),target.id);assert.equal(acquisition.mercenary_code,target.code);assert.equal(Number(acquisition.total_copies_after),grant.copiesAfter);
  assert.equal(Number(acquisition.duplicate_count_after),grant.copiesAfter-1);assert.equal(Number(acquisition.is_duplicate),grant.copiesBefore>0?1:0);assert.equal(acquisition.created_at,r.completedAt);
  const holding=only(state.cards.filter(c=>Number(c.user_id)===target.id&&c.mercenary_code===target.code));
  assert(Number(holding.total_copies)>=grant.copiesAfter,'Granted ownership missing');assert.equal(Number(holding.duplicate_count),Number(holding.total_copies)-1);
 }
 const audits=await q(db,'SELECT id,action_type,target_id,after_data FROM admin_logs WHERE id=ANY($1::bigint[]) ORDER BY id',[r.adminLogIds]);
 assert.equal(audits.length,TARGETS.length+CODES.length);assert.deepEqual(audits.map(a=>a.action_type),[...TARGETS.map(()=>'OPS_LIMITED_MERCENARY_GRANT'),...CODES.map(()=>'OPS_LIMITED_EVENT_CAPACITY')]);
 assert.deepEqual(audits.map(a=>a.target_id),[...TARGETS.map(t=>String(t.id)),...CODES]);
 for(const [i,audit]of audits.entries()){
  const expected=i<TARGETS.length?{operationKey:OPERATION_KEY,...r.grants[i]}:{operationKey:OPERATION_KEY,addedCapacity:CAPACITY[CODES[i-TARGETS.length]].add,...r.after[CODES[i-TARGETS.length]]};
  assert.deepEqual(JSON.parse(audit.after_data),expected);
 }
 return {status:'VERIFIED',receipt:r,current,holdings:TARGETS.map(t=>{const h=only(state.cards.filter(c=>Number(c.user_id)===t.id&&c.mercenary_code===t.code));return {userId:t.id,nickname:t.nickname,code:t.code,copies:Number(h.total_copies),duplicates:Number(h.duplicate_count)};}),packMode:state.pack.settings.mode,missing:0,duplicateOperationGrants:0};
}

// One authorized operation under live USER_LOCK leases and matching database
// fallback leases. User -> configuration -> stock row order matches live draws.
export async function grantLimitedCards(db,{dryRun=false,lockDeadline,approvedPlanHash}={}){
 assert.equal(approvedPlanHash,PLAN_HASH,'Inspected operation required');
 assert(Number.isSafeInteger(lockDeadline)&&lockDeadline>Date.now()+15000,'Live account leases required');
 await db.query('BEGIN');
 try{
  await db.query("SET LOCAL lock_timeout='3s'");await db.query("SET LOCAL statement_timeout='10s'");
  assert.equal((await q(db,'SELECT id FROM users WHERE id=ANY($1::bigint[]) ORDER BY id FOR UPDATE',[IDS])).length,TARGETS.length);
  assert.equal((await q(db,'SELECT key FROM app_meta WHERE key=ANY($1::text[]) ORDER BY key FOR UPDATE',[[POLICY_KEY,PACK_KEY]])).length,2);
  assert.equal((await q(db,'SELECT code FROM mercenary_limited_stock_v1 WHERE code=ANY($1::text[]) ORDER BY code FOR UPDATE',[CODES])).length,2);
  const before=await inspectLimitedGrants(db);
  if(before.receipt){const verified=await verifyLimitedGrants(db);await db.query(dryRun?'ROLLBACK':'COMMIT');return {dryRun,replayed:true,...verified};}
  for(const target of TARGETS){
   const user=only(before.users.filter(u=>Number(u.id)===target.id));assert.equal(user.nickname,target.nickname);assert.equal(user.status,'ACTIVE');assert.equal(user.role,'USER');
   assert.equal(Number(only(await q(db,'SELECT id FROM users WHERE lower(nickname)=lower($1)',[target.nickname])).id),target.id,'Ambiguous nickname');
   const card=LIMITED_MERCENARIES.find(c=>c.code===target.code);assert.equal(card?.name,target.name);assert.equal(card.rank,target.rank);assert.equal(card.edition,'LIMITED');
  }
  const owner=only(await q(db,'SELECT id,nickname,role,status FROM users WHERE id=1'));assert.equal(owner.role,'OWNER');assert.equal(owner.status,'ACTIVE');assert.equal(owner.nickname,'핑크빛유두');
  const [day]=await q(db,"SELECT to_char(CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Seoul','YYYY-MM-DD') AS kst");assert.equal(day.kst,'2026-10-13','One-time operation expired');
  const baseline=assertLedger(before);for(const code of CODES)assert.equal(baseline[code].limit,CAPACITY[code].before,'Live cap changed; inspect before retry');
  assert.equal((await q(db,'SELECT acquisition_id FROM mercenary_card_acquisitions_v1 WHERE acquisition_id=ANY($1::text[])',[IDS.map(aid)])).length,0,'Orphan acquisition');
  assert.equal(before.issues.filter(i=>IDS.map(aid).includes(i.acquisition_id)).length,0,'Orphan issuance');
  const protectedBefore=await protectedState(db),now=new Date().toISOString(),next=structuredClone(before.pack);
  for(const code of CODES)next.settings.stockLimits[code]+=CAPACITY[code].add;
  next.revision++;next.updatedAt=now;next.updatedBy=1;next.lastRequestId=OPERATION_KEY;
  only(await q(db,'UPDATE app_meta SET value=$2,updated_at=$3 WHERE key=$1 AND value=$4 RETURNING key',[PACK_KEY,JSON.stringify(next),now,before.packText]));
  for(const code of CODES){
   const stock=only(before.stock.filter(s=>s.code===code));
   only(await q(db,'UPDATE mercenary_limited_stock_v1 SET stock_limit=stock_limit+$2,issued=issued+$2,revision=revision+1,last_token=$3 WHERE code=$1 AND stock_limit=$4 AND revision=$5 AND issued=$6 RETURNING code',[code,CAPACITY[code].add,OPERATION_KEY,CAPACITY[code].before,stock.revision,stock.issued]));
  }
  const grants=[],serials=Object.fromEntries(CODES.map(c=>[c,baseline[c].issued]));
  for(const target of TARGETS){
   const owned=before.cards.find(c=>Number(c.user_id)===target.id&&c.mercenary_code===target.code),copiesBefore=int(owned?.total_copies??0,0,2147483646);
   if(owned)assert.equal(int(owned.duplicate_count),copiesBefore-1);
   const holding=only(await q(db,`INSERT INTO user_mercenary_cards_v1(user_id,mercenary_code,total_copies,duplicate_count,first_obtained_at,last_obtained_at) VALUES($1,$2,1,0,$3,$3)
    ON CONFLICT(user_id,mercenary_code) DO UPDATE SET total_copies=user_mercenary_cards_v1.total_copies+1,duplicate_count=user_mercenary_cards_v1.duplicate_count+1,last_obtained_at=excluded.last_obtained_at RETURNING *`,[target.id,target.code,now]));
   assert.equal(Number(holding.total_copies),copiesBefore+1);assert.equal(Number(holding.duplicate_count),copiesBefore);assert.equal(holding.first_obtained_at,owned?.first_obtained_at||now);
   const serial=++serials[target.code],acquisitionId=aid(target.id);
   only(await q(db,'INSERT INTO mercenary_limited_issues_v1(acquisition_id,request_id,user_id,code,serial,created_at) VALUES($1,$2,$3,$4,$5,$6) RETURNING acquisition_id',[acquisitionId,OPERATION_KEY,target.id,target.code,serial,now]));
   only(await q(db,'INSERT INTO mercenary_card_acquisitions_v1(acquisition_id,user_id,mercenary_code,is_duplicate,total_copies_after,duplicate_count_after,created_at) VALUES($1,$2,$3,$4,$5,$6,$7) RETURNING acquisition_id',[acquisitionId,target.id,target.code,copiesBefore>0?1:0,copiesBefore+1,copiesBefore,now]));
   grants.push({userId:target.id,nickname:target.nickname,code:target.code,name:target.name,rank:target.rank,edition:'LIMITED',quantity:1,acquisitionId,serial,copiesBefore,copiesAfter:copiesBefore+1});
  }
  const after=await inspectLimitedGrants(db),final=assertLedger(after);
  for(const code of CODES){assert.equal(final[code].remaining,baseline[code].remaining);assert.equal(final[code].issued,baseline[code].issued+CAPACITY[code].add);assert.equal(final[code].limit,baseline[code].limit+CAPACITY[code].add);}
  assert.deepEqual(after.pack,next);assert.deepEqual(after.settings.filter(r=>r.key!==PACK_KEY),before.settings.filter(r=>r.key!==PACK_KEY));
  assert.deepEqual(after.users,before.users);assert.deepEqual(await protectedState(db),protectedBefore);
  const untouched=cards=>cards.filter(c=>!TARGETS.some(t=>t.id===Number(c.user_id)&&t.code===c.mercenary_code));assert.deepEqual(untouched(after.cards),untouched(before.cards));
  assert.deepEqual(after.issues.filter(i=>i.request_id!==OPERATION_KEY),before.issues);
  const receipt={status:'COMPLETED',operationKey:OPERATION_KEY,planHash:PLAN_HASH,completedAt:now,grants,before:baseline,after:final,packRevisionBefore:before.pack.revision,packRevisionAfter:next.revision,packMode:next.settings.mode,
   authorization:AUTHORIZATION,balancesPreserved:true,inventoryPreserved:true,loadoutAndGrowthPreserved:true,dailyUsagePreserved:true,otherSettingsPreserved:true,adminLogIds:[]};
  for(const grant of grants){
   const audit=only(await q(db,"INSERT INTO admin_logs(admin_id,action_type,target_type,target_id,before_data,after_data) VALUES(1,'OPS_LIMITED_MERCENARY_GRANT','USER',$1,$2,$3) RETURNING id",[String(grant.userId),JSON.stringify({operationKey:OPERATION_KEY,copies:grant.copiesBefore}),JSON.stringify({operationKey:OPERATION_KEY,...grant})]));receipt.adminLogIds.push(String(audit.id));
  }
  for(const code of CODES){
   const audit=only(await q(db,"INSERT INTO admin_logs(admin_id,action_type,target_type,target_id,before_data,after_data) VALUES(1,'OPS_LIMITED_EVENT_CAPACITY','MERCENARY_LIMITED_STOCK',$1,$2,$3) RETURNING id",[code,JSON.stringify({operationKey:OPERATION_KEY,...baseline[code]}),JSON.stringify({operationKey:OPERATION_KEY,addedCapacity:CAPACITY[code].add,...final[code]})]));receipt.adminLogIds.push(String(audit.id));
  }
  only(await q(db,'INSERT INTO app_meta(key,value,updated_at) VALUES($1,$2,$3) RETURNING key',[OPERATION_KEY,JSON.stringify(receipt),now]));
  const verified=await verifyLimitedGrants(db);assert(lockDeadline>Date.now()+5000,'Account leases expired before commit');
  await db.query(dryRun?'ROLLBACK':'COMMIT');return {dryRun,replayed:false,...verified};
 }catch(error){await db.query('ROLLBACK').catch(()=>{});throw error;}
}
