import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {LIMITED_MERCENARIES} from '../../shared/mercenary-limited-catalog-v1.mjs';

export const PLAN=Object.freeze({
 operationKey:'ops:heeya-bongsoon-ss-limited:20261010:v1',
 authorization:'하이희야♡ ss 리미티드 하이희야 지급\n나무늘봉순 ss리미티드 나무늘봉순 지급',
 delivery:'DIRECT',permanent:true,
 targets:[
  {userId:'4977',nickname:'하이희야♡',code:'V-998',name:'하이희야',rank:'SS',edition:'LIMITED',quantity:1,stockLimit:10},
  {userId:'5426',nickname:'나무늘봉순',code:'V-990',name:'나무늘봉순',rank:'SS',edition:'LIMITED',quantity:1,stockLimit:10}
 ],
 settingsHash:'3e4a530298e51a190204de5d8585747378a58b88e69e4ec8d66af671f5ee115f',
 catalogSourceHash:'a261f2ec009e4123c6e8a757d9f60867d7c7b71a9b759ead1a9c2bab888fc101'
});
export const OPERATION_KEY=PLAN.operationKey;
export const PLAN_HASH=createHash('sha256').update(JSON.stringify(PLAN)).digest('hex');
export const ACTION='OPS_LIMITED_MERCENARY_GRANT';
export const acquisitionId=t=>OPERATION_KEY+':'+t.code;
const SETTINGS=['mercenary_limited_draw_policy_v1','mercenary_limited_pack_v1'];
const q=async(c,sql,values=[])=>(await c.query(sql,values)).rows;
const only=rows=>{assert.equal(rows.length,1,'Expected exactly one row');return rows[0];};

export async function lockGrant(c){
 assert.equal((await q(c,'SELECT id FROM users WHERE id=ANY($1::bigint[]) ORDER BY id FOR UPDATE',[PLAN.targets.map(t=>t.userId)])).length,2);
 assert.equal((await q(c,'SELECT key FROM app_meta WHERE key=ANY($1::text[]) ORDER BY key FOR SHARE',[SETTINGS])).length,2);
 assert.equal((await q(c,'SELECT code FROM mercenary_limited_stock_v1 WHERE code=ANY($1::text[]) ORDER BY code FOR UPDATE',[PLAN.targets.map(t=>t.code)])).length,2);
}

export async function grantState(c){
 const users=PLAN.targets.map(t=>t.userId),codes=PLAN.targets.map(t=>t.code);
 return {
  users:await q(c,'SELECT id::text,nickname,status,role,coin::text,card_shards::text,magic_crystals::text FROM users WHERE id=ANY($1::bigint[]) ORDER BY id',[users]),
  settings:await q(c,'SELECT key,value FROM app_meta WHERE key=ANY($1::text[]) ORDER BY key',[SETTINGS]),
  stocks:await q(c,'SELECT * FROM mercenary_limited_stock_v1 WHERE code=ANY($1::text[]) ORDER BY code',[codes]),
  cards:await q(c,'SELECT * FROM user_mercenary_cards_v1 WHERE user_id=ANY($1::bigint[]) ORDER BY user_id,mercenary_code',[users]),
  loadouts:await q(c,'SELECT * FROM user_mercenary_loadout_v1 WHERE user_id=ANY($1::bigint[]) ORDER BY user_id',[users]),
  growth:await q(c,'SELECT * FROM user_mercenary_growth_v1 WHERE user_id=ANY($1::bigint[]) ORDER BY user_id,mercenary_code',[users])
 };
}

export async function verifyLimitedGrants(c,receipt,{exact=false}={}){
 assert.equal(receipt.status,'COMPLETED');assert.equal(receipt.operationKey,OPERATION_KEY);
 assert.equal(receipt.planHash,PLAN_HASH);assert.deepEqual(receipt.plan,PLAN);assert.equal(receipt.grants.length,2);
 const verified=[];
 for(const t of PLAN.targets){
  const r=only(receipt.grants.filter(g=>g.userId===t.userId&&g.code===t.code));
  assert.equal(r.acquisitionId,acquisitionId(t));assert.equal(r.copiesAfter,r.copiesBefore+1);
  assert.equal(r.duplicatesAfter,r.copiesAfter-1);assert.equal(r.serial,Number(r.stockBefore.issued)+1);
  const issue=only(await q(c,'SELECT * FROM mercenary_limited_issues_v1 WHERE acquisition_id=$1',[r.acquisitionId]));
  assert.equal(String(issue.user_id),t.userId);assert.equal(issue.code,t.code);assert.equal(issue.request_id,OPERATION_KEY);
  assert.equal(Number(issue.serial),r.serial);assert.equal(issue.created_at,receipt.completedAt);
  const acquisition=only(await q(c,'SELECT * FROM mercenary_card_acquisitions_v1 WHERE acquisition_id=$1',[r.acquisitionId]));
  assert.equal(String(acquisition.user_id),t.userId);assert.equal(acquisition.mercenary_code,t.code);
  assert.equal(Number(acquisition.total_copies_after),r.copiesAfter);assert.equal(Number(acquisition.duplicate_count_after),r.duplicatesAfter);
  assert.equal(Number(acquisition.is_duplicate),r.copiesBefore>0?1:0);assert.equal(acquisition.created_at,receipt.completedAt);
  const holding=only(await q(c,'SELECT * FROM user_mercenary_cards_v1 WHERE user_id=$1 AND mercenary_code=$2',[t.userId,t.code]));
  assert.ok(Number(holding.total_copies)>=r.copiesAfter);assert.equal(Number(holding.duplicate_count),Number(holding.total_copies)-1);
  const stock=only(await q(c,'SELECT * FROM mercenary_limited_stock_v1 WHERE code=$1',[t.code]));
  assert.ok(Number(stock.issued)>=r.serial&&Number(stock.stock_limit)>=Number(stock.issued));
  const audit=only(await q(c,'SELECT * FROM admin_logs WHERE id=$1::bigint',[r.adminLogId]));
  assert.equal(String(audit.admin_id),receipt.adminId);assert.equal(audit.action_type,ACTION);assert.equal(audit.target_type,'USER');assert.equal(audit.target_id,t.userId);
  const {adminLogId,...logged}=r;
  assert.deepEqual(JSON.parse(audit.after_data),{operationKey:OPERATION_KEY,planHash:PLAN_HASH,completedAt:receipt.completedAt,grant:logged});
  assert.deepEqual(JSON.parse(audit.before_data),{operationKey:OPERATION_KEY,holding:r.holdingBefore,stock:r.stockBefore});
  if(exact){
   assert.equal(Number(holding.total_copies),r.copiesAfter);assert.equal(holding.last_obtained_at,receipt.completedAt);
   assert.equal(Number(stock.issued),r.serial);assert.equal(Number(stock.stock_limit),t.stockLimit);
   assert.equal(Number(stock.revision),Number(r.stockBefore.revision)+1);assert.equal(stock.last_token,OPERATION_KEY);
  }
  verified.push({userId:t.userId,nickname:t.nickname,code:t.code,name:t.name,rank:t.rank,edition:t.edition,quantity:1,
   serial:r.serial,copiesBefore:r.copiesBefore,copiesAfter:r.copiesAfter,currentCopies:Number(holding.total_copies),adminLogId:r.adminLogId});
 }
 assert.equal((await q(c,'SELECT acquisition_id FROM mercenary_limited_issues_v1 WHERE request_id=$1',[OPERATION_KEY])).length,2);
 return {status:'VERIFIED',targets:verified,acquisitionRecords:2,issueRecords:2,adminRecords:2,missing:0,duplicateOperationGrants:0};
}

// The caller owns one transaction for both users. Lock order matches the live
// limited-pack path: users, settings, then sorted limited stock rows.
export async function grantLimitedMercenaries(c,inspectedPlanHash){
 assert.equal(inspectedPlanHash,PLAN_HASH,'Inspected plan hash required');
 await c.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))',[OPERATION_KEY]);
 const [saved]=await q(c,'SELECT value FROM app_meta WHERE key=$1 FOR UPDATE',[OPERATION_KEY]);
 if(saved){const receipt=JSON.parse(saved.value);return {receipt,replayed:true,verification:await verifyLimitedGrants(c,receipt)};}
 await lockGrant(c);const before=await grantState(c);
 assert.equal(createHash('sha256').update(JSON.stringify(before.settings)).digest('hex'),PLAN.settingsHash,'Limited settings changed; inspect before grant');
 const pack=JSON.parse(before.settings.find(r=>r.key==='mercenary_limited_pack_v1').value);
 for(const t of PLAN.targets){
  const user=only(before.users.filter(r=>r.id===t.userId)),card=only(LIMITED_MERCENARIES.filter(r=>r.code===t.code));
  assert.equal(user.nickname,t.nickname);assert.equal(user.status,'ACTIVE');assert.equal(user.role,'USER');
  assert.equal(String(only(await q(c,'SELECT id FROM users WHERE nickname=$1',[t.nickname])).id),t.userId);
  assert.equal(card.name,t.name);assert.equal(card.rank,t.rank);assert.equal(card.edition,t.edition);
  const stock=only(before.stocks.filter(r=>r.code===t.code));assert.equal(Number(stock.stock_limit),t.stockLimit);
  assert.equal(pack.settings.stockLimits[t.code],t.stockLimit);assert.ok(Number(stock.issued)<t.stockLimit,'Limited stock exhausted');
  const issued=only(await q(c,'SELECT COUNT(*)::int AS count,MAX(serial)::text AS "maxSerial" FROM mercenary_limited_issues_v1 WHERE code=$1',[t.code]));
  assert.equal(issued.count,Number(stock.issued));assert.equal(Number(issued.maxSerial||0),Number(stock.issued));
 }
 for(const table of ['mercenary_card_acquisitions_v1','mercenary_limited_issues_v1'])assert.equal((await q(c,`SELECT acquisition_id FROM ${table} WHERE acquisition_id=ANY($1::text[])`,[PLAN.targets.map(acquisitionId)])).length,0,'Orphan issuance requires reconciliation');
 const owner=only(await q(c,"SELECT id::text FROM users WHERE role='OWNER' AND status='ACTIVE' ORDER BY id LIMIT 1"));
 const now=new Date().toISOString(),grants=[];
 for(const t of PLAN.targets){
  const holdingBefore=before.cards.find(r=>String(r.user_id)===t.userId&&r.mercenary_code===t.code)||null;
  const copiesBefore=Number(holdingBefore?.total_copies||0);if(holdingBefore)assert.equal(Number(holdingBefore.duplicate_count),copiesBefore-1);
  assert.ok(Number.isSafeInteger(copiesBefore)&&copiesBefore>=0&&copiesBefore<2147483647);
  const stock=only(await q(c,`UPDATE mercenary_limited_stock_v1 SET issued=issued+1,revision=revision+1,last_token=$2
   WHERE code=$1 AND stock_limit=$3 AND issued<stock_limit RETURNING *`,[t.code,OPERATION_KEY,t.stockLimit]));
  const holding=only(await q(c,`INSERT INTO user_mercenary_cards_v1(user_id,mercenary_code,total_copies,duplicate_count,first_obtained_at,last_obtained_at)
   VALUES($1,$2,1,0,$3,$3) ON CONFLICT(user_id,mercenary_code) DO UPDATE SET total_copies=user_mercenary_cards_v1.total_copies+1,
   duplicate_count=user_mercenary_cards_v1.duplicate_count+1,last_obtained_at=excluded.last_obtained_at RETURNING *`,[t.userId,t.code,now]));
  assert.equal(Number(holding.total_copies),copiesBefore+1);assert.equal(Number(holding.duplicate_count),copiesBefore);
  assert.equal(holding.first_obtained_at,holdingBefore?.first_obtained_at||now);
  only(await q(c,`INSERT INTO mercenary_limited_issues_v1(acquisition_id,request_id,user_id,code,serial,created_at)
   VALUES($1,$2,$3,$4,$5,$6) RETURNING acquisition_id`,[acquisitionId(t),OPERATION_KEY,t.userId,t.code,stock.issued,now]));
  only(await q(c,`INSERT INTO mercenary_card_acquisitions_v1(acquisition_id,user_id,mercenary_code,is_duplicate,total_copies_after,duplicate_count_after,created_at)
   VALUES($1,$2,$3,$4,$5,$6,$7) RETURNING acquisition_id`,[acquisitionId(t),t.userId,t.code,copiesBefore>0?1:0,holding.total_copies,holding.duplicate_count,now]));
  const grant={...t,acquisitionId:acquisitionId(t),holdingBefore,stockBefore:only(before.stocks.filter(r=>r.code===t.code)),
   serial:Number(stock.issued),copiesBefore,copiesAfter:Number(holding.total_copies),duplicatesAfter:Number(holding.duplicate_count)};
  const audit=only(await q(c,`INSERT INTO admin_logs(admin_id,action_type,target_type,target_id,before_data,after_data)
   VALUES($1,$2,'USER',$3,$4,$5) RETURNING id::text`,[owner.id,ACTION,t.userId,
   JSON.stringify({operationKey:OPERATION_KEY,holding:holdingBefore,stock:grant.stockBefore}),JSON.stringify({operationKey:OPERATION_KEY,planHash:PLAN_HASH,completedAt:now,grant})]));
  grants.push({...grant,adminLogId:audit.id});
 }
 const after=await grantState(c);
 for(const field of ['users','settings','loadouts','growth'])assert.deepEqual(after[field],before[field],field+' changed unexpectedly');
 const others=cards=>cards.filter(r=>!PLAN.targets.some(t=>String(r.user_id)===t.userId&&r.mercenary_code===t.code));
 assert.deepEqual(others(after.cards),others(before.cards));
 const receipt={status:'COMPLETED',operationKey:OPERATION_KEY,planHash:PLAN_HASH,plan:PLAN,actor:'CODEX_OPERATIONS',adminId:owner.id,
  completedAt:now,grants,preserved:{balances:true,settings:true,stockLimits:true,loadouts:true,growth:true,otherMercenaries:true}};
 only(await q(c,'INSERT INTO app_meta(key,value,updated_at) VALUES($1,$2,$3) RETURNING key',[OPERATION_KEY,JSON.stringify(receipt),now]));
 return {receipt,replayed:false,verification:await verifyLimitedGrants(c,receipt,{exact:true})};
}
