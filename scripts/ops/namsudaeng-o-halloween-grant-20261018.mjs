import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {HALLOWEEN_MERCENARIES} from '../../shared/mercenary-halloween-catalog-v1.mjs';
export const PLAN=Object.freeze({
 operationKey:'ops:namsudaeng-o:halloween-namsudaeng:no-stock:20261018:v1',
 authorization:'남수댕ㅗ 계정에 리미티드 할로윈 남수댕 지급해 횟수증가없이 예외지급',
 dateKST:'2026-10-18',userId:'5950',nickname:'남수댕ㅗ',code:'V-986',name:'남수댕',rank:'SS',edition:'HALLOWEEN_LIMITED',
 quantity:1,permanent:true,delivery:'DIRECT',stockPolicy:'EXEMPT_NO_COUNTER_CHANGE',allowExhaustedStock:true,
 limitedIssueRecord:false,serial:null
});
export const OP=PLAN.operationKey,HASH=createHash('sha256').update(JSON.stringify(PLAN)).digest('hex');
export const ACTION='OPS_HALLOWEEN_MERCENARY_STOCK_EXEMPT_GRANT';
const PACK='mercenary_halloween_ss_pack_v1';
const q=async(c,s,v=[])=>(await c.query(s,v)).rows;
const one=xs=>{assert.equal(xs.length,1,'Expected one row');return xs[0];};
export async function state(c){
 return {
  user:one(await q(c,'SELECT id::text,nickname,status,role,coin::text,card_shards::text,magic_crystals::text FROM users WHERE id=$1',[PLAN.userId])),
  pack:await q(c,'SELECT key,value FROM app_meta WHERE key=$1',[PACK]),
  stock:one(await q(c,'SELECT * FROM mercenary_limited_stock_v1 WHERE code=$1',[PLAN.code])),
  issueCount:one(await q(c,'SELECT COUNT(*)::text AS count FROM mercenary_limited_issues_v1 WHERE code=$1',[PLAN.code])).count,
  cards:await q(c,'SELECT * FROM user_mercenary_cards_v1 WHERE user_id=$1 ORDER BY mercenary_code',[PLAN.userId]),
  loadout:await q(c,'SELECT * FROM user_mercenary_loadout_v1 WHERE user_id=$1',[PLAN.userId]),
  inventory:await q(c,'SELECT * FROM cnine_user_inventory WHERE user_id=$1 ORDER BY item_code',[PLAN.userId]),
  levels:await q(c,'SELECT * FROM user_mercenary_levels_v1 WHERE user_id=$1 ORDER BY mercenary_code',[PLAN.userId]),
  drawUsage:await q(c,"SELECT key,value FROM app_meta WHERE key LIKE 'mercenary%:'||$1||':%' ORDER BY key",[PLAN.userId]),
  growth:await q(c,'SELECT * FROM user_mercenary_growth_v1 WHERE user_id=$1 ORDER BY mercenary_code',[PLAN.userId])
 };
}
export async function verify(c,receipt,{exact=false}={}){
 assert.equal(receipt.status,'COMPLETED');assert.equal(receipt.operationKey,OP);assert.equal(receipt.planHash,HASH);assert.deepEqual(receipt.plan,PLAN);
 assert.equal(receipt.copiesAfter,receipt.copiesBefore+1);assert.equal(receipt.duplicatesAfter,receipt.copiesAfter-1);
 assert.deepEqual(receipt.stockAfter,receipt.stockBefore);assert.equal(receipt.issueCountAfter,receipt.issueCountBefore);
 const acquisition=one(await q(c,'SELECT * FROM mercenary_card_acquisitions_v1 WHERE acquisition_id=$1',[OP]));
 assert.equal(String(acquisition.user_id),PLAN.userId);assert.equal(acquisition.mercenary_code,PLAN.code);
 assert.equal(Number(acquisition.total_copies_after),receipt.copiesAfter);assert.equal(Number(acquisition.duplicate_count_after),receipt.duplicatesAfter);
 assert.equal(Number(acquisition.is_duplicate),receipt.copiesBefore>0?1:0);assert.equal(acquisition.created_at,receipt.completedAt);
 assert.equal((await q(c,'SELECT acquisition_id FROM mercenary_limited_issues_v1 WHERE acquisition_id=$1 OR request_id=$1',[OP])).length,0,'Stock-exempt grant must not create a numbered pack issue');
 const holding=one(await q(c,'SELECT * FROM user_mercenary_cards_v1 WHERE user_id=$1 AND mercenary_code=$2',[PLAN.userId,PLAN.code]));
 assert.ok(Number(holding.total_copies)>=receipt.copiesAfter);assert.equal(Number(holding.duplicate_count),Number(holding.total_copies)-1);
 const audit=one(await q(c,'SELECT id::text,admin_id::text,action_type,target_type,target_id,before_data,after_data FROM admin_logs WHERE id=$1::bigint',[receipt.adminLogId]));
 assert.equal(audit.admin_id,receipt.adminId);assert.equal(audit.action_type,ACTION);assert.equal(audit.target_type,'USER');assert.equal(audit.target_id,PLAN.userId);
 const {adminLogId,...logged}=receipt;assert.deepEqual(JSON.parse(audit.after_data),logged);
 if(exact){
  assert.equal(Number(holding.total_copies),receipt.copiesAfter);assert.equal(holding.last_obtained_at,receipt.completedAt);
  const stock=one(await q(c,'SELECT * FROM mercenary_limited_stock_v1 WHERE code=$1',[PLAN.code]));assert.deepEqual(stock,receipt.stockBefore);
  assert.equal(one(await q(c,'SELECT COUNT(*)::text AS count FROM mercenary_limited_issues_v1 WHERE code=$1',[PLAN.code])).count,receipt.issueCountBefore);
 }
 return {status:'VERIFIED',userId:PLAN.userId,nickname:PLAN.nickname,code:PLAN.code,name:PLAN.name,rank:PLAN.rank,edition:PLAN.edition,
  quantity:1,copiesBefore:receipt.copiesBefore,copiesAfter:receipt.copiesAfter,currentCopies:Number(holding.total_copies),
  stockChanged:false,stockLimit:receipt.stockAfter.stock_limit,issued:receipt.stockAfter.issued,
  remaining:String(BigInt(receipt.stockAfter.stock_limit)-BigInt(receipt.stockAfter.issued)),acquisitionRecords:1,numberedIssueRecords:0,auditRecords:1,duplicateOperationGrants:0};
}
export async function grant(c,expectedHash,{lockDeadline}={}){
 assert.ok(Number.isSafeInteger(lockDeadline)&&lockDeadline>Date.now()+15000,'Live account lease required');
 const catalog=HALLOWEEN_MERCENARIES.find(r=>r.code===PLAN.code);assert.equal(catalog?.name,PLAN.name);assert.equal(catalog.rank,PLAN.rank);
 assert.equal(expectedHash,HASH);assert.equal(PLAN.stockPolicy,'EXEMPT_NO_COUNTER_CHANGE');assert.equal(PLAN.quantity,1);
 await c.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))',[OP]);
 const [saved]=await q(c,'SELECT value FROM app_meta WHERE key=$1 FOR UPDATE',[OP]);
 if(saved){const receipt=JSON.parse(saved.value);return {replayed:true,receipt,verification:await verify(c,receipt)};}
 one(await q(c,'SELECT id FROM users WHERE id=$1 FOR UPDATE',[PLAN.userId]));
 one(await q(c,'SELECT key FROM app_meta WHERE key=$1 FOR SHARE',[PACK]));
 one(await q(c,'SELECT code FROM mercenary_limited_stock_v1 WHERE code=$1 FOR SHARE',[PLAN.code]));
 await q(c,'SELECT user_id FROM user_mercenary_cards_v1 WHERE user_id=$1 AND mercenary_code=$2 FOR UPDATE',[PLAN.userId,PLAN.code]);
 const before=await state(c);
 assert.equal(before.user.nickname,PLAN.nickname);assert.equal(before.user.status,'ACTIVE');
 assert.equal(String(one(await q(c,'SELECT id FROM users WHERE nickname=$1',[PLAN.nickname])).id),PLAN.userId);
 // Explicit user authorization exempts this single gift from pack stock and pack availability.
 // Never increase a stock limit, decrease a remaining count, or fabricate an issue serial.
 for(const table of ['mercenary_card_acquisitions_v1','mercenary_limited_issues_v1'])
  assert.equal((await q(c,`SELECT acquisition_id FROM ${table} WHERE acquisition_id=$1`,[OP])).length,0,'Orphan grant record requires reconciliation');
 assert.equal((await q(c,'SELECT id FROM admin_logs WHERE action_type=$1 AND target_id=$2 AND after_data::jsonb->>\'operationKey\'=$3',[ACTION,PLAN.userId,OP])).length,0);
 const owner=one(await q(c,"SELECT id::text FROM users WHERE role='OWNER' AND status='ACTIVE' ORDER BY id LIMIT 1"));
 const holdingBefore=before.cards.find(r=>r.mercenary_code===PLAN.code)||null,copiesBefore=Number(holdingBefore?.total_copies||0);
 assert.ok(Number.isSafeInteger(copiesBefore)&&copiesBefore>=0&&copiesBefore<2147483647);
 if(holdingBefore)assert.equal(Number(holdingBefore.duplicate_count),copiesBefore-1);
 const now=new Date().toISOString();
 const holding=one(await q(c,`INSERT INTO user_mercenary_cards_v1(user_id,mercenary_code,total_copies,duplicate_count,first_obtained_at,last_obtained_at)
 VALUES($1,$2,1,0,$3,$3) ON CONFLICT(user_id,mercenary_code) DO UPDATE SET
 total_copies=user_mercenary_cards_v1.total_copies+1,duplicate_count=user_mercenary_cards_v1.duplicate_count+1,last_obtained_at=excluded.last_obtained_at
 RETURNING *`,[PLAN.userId,PLAN.code,now]));
 assert.equal(Number(holding.total_copies),copiesBefore+1);assert.equal(Number(holding.duplicate_count),copiesBefore);
 assert.equal(holding.first_obtained_at,holdingBefore?.first_obtained_at||now);
 one(await q(c,`INSERT INTO mercenary_card_acquisitions_v1(acquisition_id,user_id,mercenary_code,is_duplicate,total_copies_after,duplicate_count_after,created_at)
 VALUES($1,$2,$3,$4,$5,$6,$7) RETURNING acquisition_id`,[OP,PLAN.userId,PLAN.code,copiesBefore>0?1:0,holding.total_copies,holding.duplicate_count,now]));
 const after=await state(c);
 for(const key of ['user','pack','stock','issueCount','loadout','growth','inventory','levels','drawUsage'])assert.deepEqual(after[key],before[key],key+' changed unexpectedly');
 const other=cards=>cards.filter(r=>r.mercenary_code!==PLAN.code);assert.deepEqual(other(after.cards),other(before.cards));
 const receipt={status:'COMPLETED',operationKey:OP,planHash:HASH,plan:PLAN,actor:'CODEX_OPERATIONS',adminId:owner.id,completedAt:now,
  holdingBefore,copiesBefore,copiesAfter:Number(holding.total_copies),duplicatesAfter:Number(holding.duplicate_count),
  stockBefore:before.stock,stockAfter:after.stock,issueCountBefore:before.issueCount,issueCountAfter:after.issueCount,
  preserved:{balances:true,packSettings:true,stockCounters:true,numberedIssues:true,otherMercenaries:true,loadout:true,growth:true,inventory:true,levels:true,drawUsage:true}};
 const audit=one(await q(c,`INSERT INTO admin_logs(admin_id,action_type,target_type,target_id,before_data,after_data)
 VALUES($1,$2,'USER',$3,$4,$5) RETURNING id::text`,[owner.id,ACTION,PLAN.userId,JSON.stringify({operationKey:OP,holding:holdingBefore,stock:before.stock}),JSON.stringify(receipt)]));
 receipt.adminLogId=audit.id;
 const verification=await verify(c,receipt,{exact:true});
 one(await q(c,'INSERT INTO app_meta(key,value,updated_at) VALUES($1,$2,$3) RETURNING key',[OP,JSON.stringify(receipt),now]));
 assert.ok(lockDeadline>Date.now()+5000,'Account lease nearing expiration');
 return {replayed:false,receipt,verification};
}
