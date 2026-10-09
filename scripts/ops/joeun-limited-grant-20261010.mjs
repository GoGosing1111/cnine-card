import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';

export const PLAN=Object.freeze({
 operationKey:'ops:joeun-ss-limited:20261010:v1',authorization:'조은 계정에 SS리미티드 조은 용병 지급해',
 userId:'4754',nickname:'조은',code:'V-991',name:'조은',rank:'SS',edition:'LIMITED',
 quantity:1,permanent:true,delivery:'DIRECT',stockLimit:7,
 settingsHash:'7a34ceacfff29ef0621667e871fbd9caecef644365f3045751e8b932b865b0b9',
 catalogSourceHash:'a1a40a0ef34b86c65111f6ccf92a01c24d903a02fe01959719a2d23eaafc01eb'
});
export const OPERATION_KEY=PLAN.operationKey;
export const ACTION='OPS_LIMITED_MERCENARY_GRANT';
export const PLAN_HASH=createHash('sha256').update(JSON.stringify(PLAN)).digest('hex');
const SETTINGS=['mercenary_limited_draw_policy_v1','mercenary_limited_pack_v1'];
const q=async(c,sql,values=[])=>(await c.query(sql,values)).rows;
const only=rows=>{assert.equal(rows.length,1,'Expected exactly one row');return rows[0];};

export async function lockGrant(c){
 only(await q(c,'SELECT id FROM users WHERE id=$1 FOR UPDATE',[PLAN.userId]));
 assert.equal((await q(c,'SELECT key FROM app_meta WHERE key=ANY($1::text[]) ORDER BY key FOR SHARE',[SETTINGS])).length,2);
 only(await q(c,'SELECT code FROM mercenary_limited_stock_v1 WHERE code=$1 FOR UPDATE',[PLAN.code]));
}

export async function grantState(c){
 const user=only(await q(c,'SELECT id::text,nickname,status,role,coin::text,card_shards::text,magic_crystals::text FROM users WHERE id=$1',[PLAN.userId]));
 return {user,
  settings:await q(c,'SELECT key,value FROM app_meta WHERE key=ANY($1::text[]) ORDER BY key',[SETTINGS]),
  stock:only(await q(c,'SELECT * FROM mercenary_limited_stock_v1 WHERE code=$1',[PLAN.code])),
  cards:await q(c,'SELECT * FROM user_mercenary_cards_v1 WHERE user_id=$1 ORDER BY mercenary_code',[PLAN.userId]),
  loadout:await q(c,'SELECT * FROM user_mercenary_loadout_v1 WHERE user_id=$1',[PLAN.userId]),
  growth:await q(c,'SELECT * FROM user_mercenary_growth_v1 WHERE user_id=$1 ORDER BY mercenary_code',[PLAN.userId])};
}

export async function verifyJoeunLimited(c,receipt,{exact=false}={}){
 assert.equal(receipt.status,'COMPLETED');assert.equal(receipt.operationKey,OPERATION_KEY);
 assert.equal(receipt.planHash,PLAN_HASH);assert.deepEqual(receipt.plan,PLAN);
 assert.equal(receipt.copiesAfter,receipt.copiesBefore+1);
 assert.equal(receipt.duplicatesAfter,receipt.copiesAfter-1);
 assert.equal(receipt.serial,Number(receipt.stockBefore.issued)+1);
 const issue=only(await q(c,'SELECT * FROM mercenary_limited_issues_v1 WHERE acquisition_id=$1',[OPERATION_KEY]));
 assert.equal(String(issue.user_id),PLAN.userId);assert.equal(issue.code,PLAN.code);
 assert.equal(issue.request_id,OPERATION_KEY);assert.equal(Number(issue.serial),receipt.serial);
 assert.equal(issue.created_at,receipt.completedAt);
 const acquisition=only(await q(c,'SELECT * FROM mercenary_card_acquisitions_v1 WHERE acquisition_id=$1',[OPERATION_KEY]));
 assert.equal(String(acquisition.user_id),PLAN.userId);assert.equal(acquisition.mercenary_code,PLAN.code);
 assert.equal(Number(acquisition.total_copies_after),receipt.copiesAfter);
 assert.equal(Number(acquisition.duplicate_count_after),receipt.duplicatesAfter);
 assert.equal(Number(acquisition.is_duplicate),receipt.copiesBefore>0?1:0);
 assert.equal(acquisition.created_at,receipt.completedAt);
 const holding=only(await q(c,'SELECT * FROM user_mercenary_cards_v1 WHERE user_id=$1 AND mercenary_code=$2',[PLAN.userId,PLAN.code]));
 assert.ok(Number(holding.total_copies)>=receipt.copiesAfter);
 assert.equal(Number(holding.duplicate_count),Number(holding.total_copies)-1);
 const stock=only(await q(c,'SELECT * FROM mercenary_limited_stock_v1 WHERE code=$1',[PLAN.code]));
 assert.ok(Number(stock.issued)>=receipt.serial&&Number(stock.stock_limit)>=Number(stock.issued));
 const audit=only(await q(c,'SELECT * FROM admin_logs WHERE id=$1::bigint',[receipt.adminLogId]));
 assert.equal(String(audit.admin_id),receipt.adminId);assert.equal(audit.action_type,ACTION);
 assert.equal(audit.target_type,'USER');assert.equal(audit.target_id,PLAN.userId);
 const {adminLogId,...logged}=receipt;assert.deepEqual(JSON.parse(audit.after_data),logged);
 assert.deepEqual(JSON.parse(audit.before_data),{operationKey:OPERATION_KEY,holding:receipt.holdingBefore,stock:receipt.stockBefore});
 if(exact){
  assert.equal(Number(holding.total_copies),receipt.copiesAfter);assert.equal(holding.last_obtained_at,receipt.completedAt);
  assert.equal(Number(stock.issued),receipt.serial);assert.equal(Number(stock.stock_limit),PLAN.stockLimit);
  assert.equal(Number(stock.revision),Number(receipt.stockBefore.revision)+1);assert.equal(stock.last_token,OPERATION_KEY);
 }
 return {status:'VERIFIED',userId:PLAN.userId,nickname:PLAN.nickname,code:PLAN.code,rank:PLAN.rank,edition:PLAN.edition,
  quantity:1,serial:receipt.serial,copiesAfter:receipt.copiesAfter,currentCopies:Number(holding.total_copies),
  acquisitionRecords:1,issueRecords:1,adminRecords:1,missing:0,duplicateOperationGrants:0};
}

// Caller owns one transaction. The existing user, settings and stock row locks
// follow the live limited-pack order. No probability, limit, loadout or coin edits.
export async function grantJoeunLimited(c,approvedPlanHash){
 assert.equal(approvedPlanHash,PLAN_HASH,'Inspected plan hash required');
 await c.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))',[OPERATION_KEY]);
 const [saved]=await q(c,'SELECT value FROM app_meta WHERE key=$1 FOR UPDATE',[OPERATION_KEY]);
 if(saved){const receipt=JSON.parse(saved.value);return {receipt,replayed:true,verification:await verifyJoeunLimited(c,receipt)};}
 await lockGrant(c);const before=await grantState(c);
 assert.equal(before.user.nickname,PLAN.nickname);assert.equal(before.user.status,'ACTIVE');assert.equal(before.user.role,'USER');
 assert.equal(String(only(await q(c,'SELECT id FROM users WHERE nickname=$1',[PLAN.nickname])).id),PLAN.userId);
 assert.equal(createHash('sha256').update(JSON.stringify(before.settings)).digest('hex'),PLAN.settingsHash,'Limited settings changed; inspect before grant');
 const pack=JSON.parse(before.settings.find(r=>r.key==='mercenary_limited_pack_v1').value);
 assert.equal(pack.settings.stockLimits[PLAN.code],PLAN.stockLimit);
 assert.equal(Number(before.stock.stock_limit),PLAN.stockLimit);assert.ok(Number(before.stock.issued)<PLAN.stockLimit,'Limited stock exhausted');
 for(const table of ['mercenary_card_acquisitions_v1','mercenary_limited_issues_v1'])assert.equal((await q(c,`SELECT acquisition_id FROM ${table} WHERE acquisition_id=$1`,[OPERATION_KEY])).length,0,'Orphan issuance requires reconciliation');
 const owner=only(await q(c,"SELECT id::text FROM users WHERE role='OWNER' AND status='ACTIVE' ORDER BY id LIMIT 1"));
 const holdingBefore=before.cards.find(r=>r.mercenary_code===PLAN.code)||null,copiesBefore=Number(holdingBefore?.total_copies||0);
 if(holdingBefore)assert.equal(Number(holdingBefore.duplicate_count),copiesBefore-1);
 assert.ok(Number.isSafeInteger(copiesBefore)&&copiesBefore<2147483647);
 const now=new Date().toISOString();
 const stock=only(await q(c,`UPDATE mercenary_limited_stock_v1 SET issued=issued+1,revision=revision+1,last_token=$2
  WHERE code=$1 AND stock_limit=$3 AND issued<stock_limit RETURNING *`,[PLAN.code,OPERATION_KEY,PLAN.stockLimit]));
 const holding=only(await q(c,`INSERT INTO user_mercenary_cards_v1(user_id,mercenary_code,total_copies,duplicate_count,first_obtained_at,last_obtained_at)
  VALUES($1,$2,1,0,$3,$3) ON CONFLICT(user_id,mercenary_code) DO UPDATE SET
  total_copies=user_mercenary_cards_v1.total_copies+1,duplicate_count=user_mercenary_cards_v1.duplicate_count+1,
  last_obtained_at=excluded.last_obtained_at RETURNING *`,[PLAN.userId,PLAN.code,now]));
 assert.equal(Number(holding.total_copies),copiesBefore+1);assert.equal(Number(holding.duplicate_count),copiesBefore);
 assert.equal(holding.first_obtained_at,holdingBefore?.first_obtained_at||now);
 only(await q(c,`INSERT INTO mercenary_limited_issues_v1(acquisition_id,request_id,user_id,code,serial,created_at)
  VALUES($1,$1,$2,$3,$4,$5) RETURNING acquisition_id`,[OPERATION_KEY,PLAN.userId,PLAN.code,stock.issued,now]));
 only(await q(c,`INSERT INTO mercenary_card_acquisitions_v1(acquisition_id,user_id,mercenary_code,is_duplicate,total_copies_after,duplicate_count_after,created_at)
  VALUES($1,$2,$3,$4,$5,$6,$7) RETURNING acquisition_id`,[OPERATION_KEY,PLAN.userId,PLAN.code,copiesBefore>0?1:0,holding.total_copies,holding.duplicate_count,now]));
 const after=await grantState(c);
 for(const field of ['user','settings','loadout','growth'])assert.deepEqual(after[field],before[field],field+' changed unexpectedly');
 const other=cards=>cards.filter(r=>r.mercenary_code!==PLAN.code);assert.deepEqual(other(after.cards),other(before.cards));
 const receipt={status:'COMPLETED',operationKey:OPERATION_KEY,planHash:PLAN_HASH,plan:PLAN,actor:'CODEX_OPERATIONS',adminId:owner.id,
  completedAt:now,holdingBefore,stockBefore:before.stock,serial:Number(stock.issued),copiesBefore,copiesAfter:Number(holding.total_copies),
  duplicatesAfter:Number(holding.duplicate_count),preserved:{balances:true,settings:true,stockLimit:true,loadout:true,growth:true,otherMercenaries:true}};
 const audit=only(await q(c,`INSERT INTO admin_logs(admin_id,action_type,target_type,target_id,before_data,after_data)
  VALUES($1,$2,'USER',$3,$4,$5) RETURNING id::text`,[owner.id,ACTION,PLAN.userId,
  JSON.stringify({operationKey:OPERATION_KEY,holding:holdingBefore,stock:before.stock}),JSON.stringify(receipt)]));
 receipt.adminLogId=audit.id;
 only(await q(c,'INSERT INTO app_meta(key,value,updated_at) VALUES($1,$2,$3) RETURNING key',[OPERATION_KEY,JSON.stringify(receipt),now]));
 return {receipt,replayed:false,verification:await verifyJoeunLimited(c,receipt,{exact:true})};
}
