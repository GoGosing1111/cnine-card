import assert from 'node:assert/strict';
import {LIMITED_MERCENARIES} from '../../shared/mercenary-limited-catalog-v1.mjs';

export const OPERATION_KEY='ops:bongsoon-limited-event-two:20261011:v1';
export const TARGETS=Object.freeze([{id:218,nickname:'현하루'},{id:4582,nickname:'족단'}]);
export const CODE='V-990',PACK_KEY='mercenary_limited_pack_v1',POLICY_KEY='mercenary_limited_draw_policy_v1';
export const EXPECTED_LIMIT=10,ADDED_CAPACITY=2;
const IDS=TARGETS.map(t=>t.id),only=rows=>{assert.equal(rows.length,1);return rows[0];};
const q=async(db,sql,args=[])=>(await db.query(sql,args)).rows;
const acquisitionId=id=>OPERATION_KEY+':'+id;
const int=(value,min=0,max=Number.MAX_SAFE_INTEGER)=>{const n=Number(value);assert(Number.isSafeInteger(n)&&n>=min&&n<=max,'Invalid count');return n;};

export async function inspectBongsoonEventGrant(db){
 const users=await q(db,'SELECT id,nickname,status,role,coin,card_shards,magic_crystals FROM users WHERE id=ANY($1::bigint[]) ORDER BY id',[IDS]);
 const settings=await q(db,'SELECT key,value FROM app_meta WHERE key=ANY($1::text[]) ORDER BY key',[[POLICY_KEY,PACK_KEY]]);
 const packText=only(settings.filter(r=>r.key===PACK_KEY)).value;
 const stock=only(await q(db,'SELECT * FROM mercenary_limited_stock_v1 WHERE code=$1',[CODE]));
 const issues=await q(db,'SELECT * FROM mercenary_limited_issues_v1 WHERE code=$1 ORDER BY serial',[CODE]);
 const cards=await q(db,'SELECT * FROM user_mercenary_cards_v1 WHERE user_id=ANY($1::bigint[]) ORDER BY user_id,mercenary_code',[IDS]);
 const saved=await q(db,'SELECT value FROM app_meta WHERE key=$1',[OPERATION_KEY]);
 return {users,settings,pack:JSON.parse(packText),packText,stock,issues,cards,receipt:saved[0]?JSON.parse(saved[0].value):null};
}

async function protectedState(db){
 const state={};
 for(const [name,table,order]of [['inventory','cnine_user_inventory','user_id,item_code'],['loadout','user_mercenary_loadout_v1','user_id'],['growth','user_mercenary_growth_v1','user_id,mercenary_code']])
  state[name]=await q(db,`SELECT * FROM ${table} WHERE user_id=ANY($1::bigint[]) ORDER BY ${order}`,[IDS]);
 return state;
}

function assertLedger(state){
 const issued=int(state.stock.issued),limit=int(state.stock.stock_limit,issued,1000000);
 assert.equal(state.pack.settings.stockLimits[CODE],limit,'CMS and stock limits differ');
 assert.equal(state.issues.length,issued,'Issue ledger count differs from stock');
 for(let i=0;i<issued;i++)assert.equal(int(state.issues[i].serial,1),i+1,'Issue serial gap');
 return {limit,issued,remaining:limit-issued,packRevision:int(state.pack.revision),stockRevision:int(state.stock.revision)};
}

export async function verifyBongsoonEventGrant(db){
 const state=await inspectBongsoonEventGrant(db),r=state.receipt;
 assert.equal(r?.status,'COMPLETED');assert.equal(r.operationKey,OPERATION_KEY);assert.equal(r.code,CODE);assert.equal(r.addedCapacity,ADDED_CAPACITY);
 assert.equal(r.before.limit,EXPECTED_LIMIT);assert.equal(r.after.limit,r.before.limit+ADDED_CAPACITY);
 assert.equal(r.after.issued,r.before.issued+TARGETS.length);assert.equal(r.after.remaining,r.before.remaining);
 assert.equal(r.grants.length,TARGETS.length);
 const current=assertLedger(state);assert(current.issued>=r.after.issued,'Issued count regressed');
 for(const target of TARGETS){
  const grant=only(r.grants.filter(g=>g.userId===target.id));assert.equal(grant.nickname,target.nickname);assert.equal(grant.quantity,1);
  assert.equal(grant.code,CODE);assert.equal(grant.rank,'SS');assert.equal(grant.edition,'LIMITED');
  assert.equal(grant.acquisitionId,acquisitionId(target.id));assert.equal(grant.copiesAfter,grant.copiesBefore+1);
  const issue=only(state.issues.filter(i=>i.acquisition_id===grant.acquisitionId));
  assert.equal(Number(issue.user_id),target.id);assert.equal(issue.request_id,OPERATION_KEY);assert.equal(Number(issue.serial),grant.serial);
  const acquisition=only(await q(db,'SELECT * FROM mercenary_card_acquisitions_v1 WHERE acquisition_id=$1',[grant.acquisitionId]));
  assert.equal(Number(acquisition.user_id),target.id);assert.equal(acquisition.mercenary_code,CODE);assert.equal(Number(acquisition.total_copies_after),grant.copiesAfter);
  assert.equal(Number(acquisition.duplicate_count_after),grant.copiesAfter-1);assert.equal(Number(acquisition.is_duplicate),grant.copiesBefore>0?1:0);
  const holding=only(state.cards.filter(c=>Number(c.user_id)===target.id&&c.mercenary_code===CODE));
  assert(Number(holding.total_copies)>=grant.copiesAfter,'Granted ownership missing');assert.equal(Number(holding.duplicate_count),Number(holding.total_copies)-1);
 }
 const audits=await q(db,'SELECT id,action_type,target_id,after_data FROM admin_logs WHERE id=ANY($1::bigint[]) ORDER BY id',[r.adminLogIds]);
 assert.equal(audits.length,3);assert.deepEqual(audits.map(a=>a.action_type),['OPS_LIMITED_MERCENARY_GRANT','OPS_LIMITED_MERCENARY_GRANT','OPS_LIMITED_EVENT_CAPACITY']);
 assert.deepEqual(audits.map(a=>a.target_id),[...IDS.map(String),CODE]);for(const audit of audits)assert.equal(JSON.parse(audit.after_data).operationKey,OPERATION_KEY);
 return {status:'VERIFIED',receipt:r,current,holdings:state.cards.filter(c=>c.mercenary_code===CODE).map(c=>({userId:Number(c.user_id),copies:Number(c.total_copies),duplicates:Number(c.duplicate_count)})),packMode:state.pack.settings.mode};
}

// Caller holds the production USER_LOCK leases for both exact accounts. The
// existing users -> configuration -> stock order also matches live draw locks.
// This is an explicit one-time event grant, never an HTTP seed or pack opening.
export async function grantBongsoonEventTwo(db,{dryRun=false,lockDeadline}={}){
 assert(Number.isSafeInteger(lockDeadline)&&lockDeadline>Date.now()+15000,'Live account leases required');
 await db.query('BEGIN');
 try{
  await db.query("SET LOCAL lock_timeout='3s'");await db.query("SET LOCAL statement_timeout='10s'");
  assert.equal((await q(db,'SELECT id FROM users WHERE id=ANY($1::bigint[]) ORDER BY id FOR UPDATE',[IDS])).length,2);
  assert.equal((await q(db,'SELECT key FROM app_meta WHERE key=ANY($1::text[]) ORDER BY key FOR UPDATE',[[POLICY_KEY,PACK_KEY]])).length,2);
  only(await q(db,'SELECT code FROM mercenary_limited_stock_v1 WHERE code=$1 FOR UPDATE',[CODE]));
  const before=await inspectBongsoonEventGrant(db);
  if(before.receipt){const verified=await verifyBongsoonEventGrant(db);await db.query(dryRun?'ROLLBACK':'COMMIT');return {dryRun,replayed:true,...verified};}
  for(const target of TARGETS){
   const user=only(before.users.filter(u=>Number(u.id)===target.id));assert.equal(user.nickname,target.nickname);assert.equal(user.status,'ACTIVE');assert.equal(user.role,'USER');
   assert.equal(Number(only(await q(db,'SELECT id FROM users WHERE nickname=$1',[target.nickname])).id),target.id,'Ambiguous nickname');
  }
  const owner=only(await q(db,'SELECT id,nickname,role,status FROM users WHERE id=1'));
  assert.equal(owner.role,'OWNER');assert.equal(owner.status,'ACTIVE');assert.equal(owner.nickname,'핑크빛유두');
  const card=LIMITED_MERCENARIES.find(c=>c.code===CODE);assert.equal(card?.name,'나무늘봉순');assert.equal(card.rank,'SS');assert.equal(card.edition,'LIMITED');
  const [day]=await q(db,"SELECT to_char(CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Seoul','YYYY-MM-DD') AS kst");assert.equal(day.kst,'2026-10-11','One-time operation expired');
  const baseline=assertLedger(before);assert.equal(baseline.limit,EXPECTED_LIMIT,'Live cap changed; inspect before retry');
  assert.equal((await q(db,'SELECT acquisition_id FROM mercenary_card_acquisitions_v1 WHERE acquisition_id=ANY($1::text[])',[IDS.map(acquisitionId)])).length,0,'Orphan acquisition');
  const protectedBefore=await protectedState(db),now=new Date().toISOString();
  const next=structuredClone(before.pack);next.settings.stockLimits[CODE]+=ADDED_CAPACITY;next.revision++;next.updatedAt=now;next.updatedBy=1;next.lastRequestId=OPERATION_KEY;
  only(await q(db,'UPDATE app_meta SET value=$2,updated_at=$3 WHERE key=$1 AND value=$4 RETURNING key',[PACK_KEY,JSON.stringify(next),now,before.packText]));
  const stock=only(await q(db,'UPDATE mercenary_limited_stock_v1 SET stock_limit=stock_limit+$2,issued=issued+$2,revision=revision+1,last_token=$3 WHERE code=$1 AND stock_limit=$4 AND revision=$5 AND issued=$6 RETURNING *',[CODE,ADDED_CAPACITY,OPERATION_KEY,EXPECTED_LIMIT,before.stock.revision,before.stock.issued]));
  const grants=[];
  for(const [index,target]of TARGETS.entries()){
   const owned=before.cards.find(c=>Number(c.user_id)===target.id&&c.mercenary_code===CODE),copiesBefore=int(owned?.total_copies??0,0,2147483646);
   if(owned)assert.equal(int(owned.duplicate_count),copiesBefore-1);
   const holding=only(await q(db,`INSERT INTO user_mercenary_cards_v1(user_id,mercenary_code,total_copies,duplicate_count,first_obtained_at,last_obtained_at) VALUES($1,$2,1,0,$3,$3)
    ON CONFLICT(user_id,mercenary_code) DO UPDATE SET total_copies=user_mercenary_cards_v1.total_copies+1,duplicate_count=user_mercenary_cards_v1.duplicate_count+1,last_obtained_at=excluded.last_obtained_at RETURNING *`,[target.id,CODE,now]));
   assert.equal(Number(holding.total_copies),copiesBefore+1);assert.equal(Number(holding.duplicate_count),copiesBefore);if(owned)assert.equal(holding.first_obtained_at,owned.first_obtained_at);
   const serial=baseline.issued+index+1,aid=acquisitionId(target.id);
   only(await q(db,'INSERT INTO mercenary_limited_issues_v1(acquisition_id,request_id,user_id,code,serial,created_at) VALUES($1,$2,$3,$4,$5,$6) RETURNING acquisition_id',[aid,OPERATION_KEY,target.id,CODE,serial,now]));
   only(await q(db,'INSERT INTO mercenary_card_acquisitions_v1(acquisition_id,user_id,mercenary_code,is_duplicate,total_copies_after,duplicate_count_after,created_at) VALUES($1,$2,$3,$4,$5,$6,$7) RETURNING acquisition_id',[aid,target.id,CODE,copiesBefore>0?1:0,copiesBefore+1,copiesBefore,now]));
   grants.push({userId:target.id,nickname:target.nickname,code:CODE,name:card.name,rank:card.rank,edition:card.edition,quantity:1,acquisitionId:aid,serial,copiesBefore,copiesAfter:copiesBefore+1});
  }
  const after=await inspectBongsoonEventGrant(db),final=assertLedger(after);
  assert.equal(final.remaining,baseline.remaining);assert.equal(final.issued,baseline.issued+ADDED_CAPACITY);assert.equal(final.limit,baseline.limit+ADDED_CAPACITY);
  assert.deepEqual(after.pack,next);assert.deepEqual(after.settings.filter(r=>r.key!==PACK_KEY),before.settings.filter(r=>r.key!==PACK_KEY));
  assert.deepEqual(after.users,before.users);assert.deepEqual(await protectedState(db),protectedBefore);
  assert.deepEqual(after.cards.filter(c=>c.mercenary_code!==CODE),before.cards.filter(c=>c.mercenary_code!==CODE));
  assert.deepEqual(after.issues.slice(0,baseline.issued),before.issues);assert.equal(Number(stock.issued),final.issued);
  const receipt={status:'COMPLETED',operationKey:OPERATION_KEY,code:CODE,addedCapacity:ADDED_CAPACITY,completedAt:now,grants,before:baseline,after:final,packMode:next.settings.mode,
   authorization:'현하루·족단 SS 리미티드 나무늘봉순 각 1장 지급, 이벤트 지급분만큼 한정수량 추가',balancesPreserved:true,inventoryPreserved:true,loadoutAndGrowthPreserved:true,otherSettingsPreserved:true,adminLogIds:[]};
  for(const grant of grants){
   const audit=only(await q(db,"INSERT INTO admin_logs(admin_id,action_type,target_type,target_id,before_data,after_data) VALUES(1,'OPS_LIMITED_MERCENARY_GRANT','USER',$1,$2,$3) RETURNING id",[String(grant.userId),JSON.stringify({operationKey:OPERATION_KEY,copies:grant.copiesBefore}),JSON.stringify({operationKey:OPERATION_KEY,...grant})]));receipt.adminLogIds.push(String(audit.id));
  }
  const audit=only(await q(db,"INSERT INTO admin_logs(admin_id,action_type,target_type,target_id,before_data,after_data) VALUES(1,'OPS_LIMITED_EVENT_CAPACITY','MERCENARY_LIMITED_STOCK',$1,$2,$3) RETURNING id",[CODE,JSON.stringify({operationKey:OPERATION_KEY,...baseline}),JSON.stringify({operationKey:OPERATION_KEY,addedCapacity:ADDED_CAPACITY,...final})]));receipt.adminLogIds.push(String(audit.id));
  only(await q(db,'INSERT INTO app_meta(key,value,updated_at) VALUES($1,$2,$3) RETURNING key',[OPERATION_KEY,JSON.stringify(receipt),now]));
  const verified=await verifyBongsoonEventGrant(db);assert(lockDeadline>Date.now()+5000,'Account leases expired before commit');
  await db.query(dryRun?'ROLLBACK':'COMMIT');return {dryRun,replayed:false,...verified};
 }catch(error){await db.query('ROLLBACK').catch(()=>{});throw error;}
}
