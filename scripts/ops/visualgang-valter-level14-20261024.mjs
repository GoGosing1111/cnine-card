import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {MERCENARY_LEVEL_KEY,mercenaryLevelState,levelProgress,validateMercenaryLevelPolicy,mercenaryLevelReadiness} from '../../shared/mercenary-level-v1.mjs';
import {LIMITED_MERCENARIES} from '../../shared/mercenary-limited-catalog-v1.mjs';
import {protectedState} from './visualgang-valter-level3-20261020.mjs';
export const OP='ops:visualgang-valter-level14:20261024:v1';
export const PLAN={userId:81,nickname:'비쥬얼깡패',code:'V-996',name:'발테르',rank:'SSS',authorization:'비쥬얼깡패 발테르 14레벨 만들어',before:{level:3,experience:0,breakthroughMask:0,revision:1},after:{level:14,experience:0,breakthroughMask:3,revision:2},cost:0,materialsConsumed:0};
export const HASH=createHash('sha256').update(JSON.stringify(PLAN)).digest('hex');
const q=async(c,sql,args=[])=>(await c.query(sql,args)).rows;
const one=rows=>(assert.equal(rows.length,1,'Expected exactly one row'),rows[0]);
export async function receipt(c){const rows=await q(c,'SELECT value FROM app_meta WHERE key=$1',[OP]);return rows.length?JSON.parse(one(rows).value):null;}
export async function artifacts(c){return q(c,"SELECT id::text,admin_id::text,target_type,before_data,after_data FROM admin_logs WHERE action_type='OPS_MERCENARY_LEVEL_SET' AND target_id=$1",[OP]);}
export async function state(c){return {
 user:one(await q(c,'SELECT u.id::text,u.nickname,u.status,u.role,v.provider,v.provider_user_id FROM users u LEFT JOIN user_second_verifications v ON v.user_id=u.id WHERE u.id=$1 OR u.nickname=$2 ORDER BY u.id',[PLAN.userId,PLAN.nickname])),
 owned:one(await q(c,'SELECT * FROM user_mercenary_cards_v1 WHERE user_id=$1 AND mercenary_code=$2',[PLAN.userId,PLAN.code])),
 level:one(await q(c,'SELECT * FROM user_mercenary_levels_v1 WHERE user_id=$1 AND mercenary_code=$2',[PLAN.userId,PLAN.code])),
 policy:one(await q(c,'SELECT value FROM app_meta WHERE key=$1',[MERCENARY_LEVEL_KEY])).value,
 protected:await protectedState(c)
};}
export async function verify(c,r,{exact=false}={}){
 assert.equal(r.status,'COMPLETED');assert.equal(r.operationKey,OP);assert.equal(r.planHash,HASH);assert.deepEqual(r.plan,PLAN);
 assert.deepEqual(r.before,PLAN.before);assert.deepEqual(r.after,PLAN.after);assert.equal(r.protectedBefore,r.protectedAfter);
 const audit=one(await artifacts(c)),{auditId,...payload}=r;assert.equal(audit.id,auditId);assert.equal(audit.admin_id,'1');assert.equal(audit.target_type,'USER');assert.deepEqual(JSON.parse(audit.after_data),payload);
 const current=mercenaryLevelState(one(await q(c,'SELECT * FROM user_mercenary_levels_v1 WHERE user_id=$1 AND mercenary_code=$2',[PLAN.userId,PLAN.code])));
 assert(current.revision>=PLAN.after.revision);if(exact)assert.deepEqual(current,PLAN.after);
 return {verified:true,currentLevel:current.level,currentState:current,cost:0,materialsConsumed:0};
}
// Caller holds the existing account DO and SQL leases and owns the transaction.
export async function grant(c,planHash,{leaseToken,lockDeadline}={}){
 assert.equal(planHash,HASH);const prior=await receipt(c);if(prior)return {replayed:true,receipt:prior,verification:await verify(c,prior)};
 assert(lockDeadline>Date.now()+15000);
 one(await q(c,'SELECT user_id FROM user_mutation_locks_v1520 WHERE user_id=$1 AND token=$2 AND action_path=$3 AND lease_until_ms>$4 FOR UPDATE',[PLAN.userId,leaseToken,OP,Date.now()+10000]));
 one(await q(c,'SELECT id FROM users WHERE id=$1 FOR UPDATE',[PLAN.userId]));
 await q(c,'SELECT user_id FROM user_second_verifications WHERE user_id=$1 FOR SHARE',[PLAN.userId]);
 one(await q(c,'SELECT user_id FROM user_mercenary_cards_v1 WHERE user_id=$1 AND mercenary_code=$2 FOR UPDATE',[PLAN.userId,PLAN.code]));
 one(await q(c,'SELECT user_id FROM user_mercenary_levels_v1 WHERE user_id=$1 AND mercenary_code=$2 FOR UPDATE',[PLAN.userId,PLAN.code]));
 one(await q(c,'SELECT key FROM app_meta WHERE key=$1 FOR SHARE',[MERCENARY_LEVEL_KEY]));
 one(await q(c,'SELECT code FROM mercenary_limited_stock_v1 WHERE code=$1 FOR SHARE',[PLAN.code]));
 const before=await state(c);
 assert.deepEqual(before.user,{id:'81',nickname:PLAN.nickname,status:'ACTIVE',role:'USER',provider:'PLAYDK',provider_user_id:'03320b3e'});
 assert.equal(Number(before.owned.total_copies),1);assert.equal(Number(before.owned.duplicate_count),0);
 assert.deepEqual(mercenaryLevelState(before.level),PLAN.before,'Account growth changed since inspection');assert.equal((await artifacts(c)).length,0);
 one(await q(c,"SELECT id FROM users WHERE id=1 AND status='ACTIVE' AND role='OWNER'"));
 const catalog=one(LIMITED_MERCENARIES.filter(row=>row.code===PLAN.code));assert.equal(catalog.name,PLAN.name);assert.equal(catalog.rank,PLAN.rank);
 const policy=validateMercenaryLevelPolicy(JSON.parse(before.policy));assert.equal(policy.mode,'ON');assert(mercenaryLevelReadiness(policy,{requireGrowth:true}).ready);levelProgress(policy,PLAN.after,PLAN);
 const now=new Date().toISOString(),after=PLAN.after;
 one(await q(c,'UPDATE user_mercenary_levels_v1 SET level=$3,experience=$4,breakthrough_mask=$5,revision=$6,updated_at=$7 WHERE user_id=$1 AND mercenary_code=$2 AND level=$8 AND experience=$9 AND breakthrough_mask=$10 AND revision=$11 RETURNING user_id',[PLAN.userId,PLAN.code,after.level,after.experience,after.breakthroughMask,after.revision,now,PLAN.before.level,PLAN.before.experience,PLAN.before.breakthroughMask,PLAN.before.revision]));
 const protectedAfter=await protectedState(c);assert.equal(protectedAfter,before.protected,'Other account state changed');
 const r={status:'COMPLETED',operationKey:OP,planHash:HASH,plan:PLAN,before:PLAN.before,after:PLAN.after,protectedBefore:before.protected,protectedAfter,completedAt:now};
 r.auditId=one(await q(c,"INSERT INTO admin_logs(admin_id,action_type,target_type,target_id,before_data,after_data,created_at) VALUES(1,'OPS_MERCENARY_LEVEL_SET','USER',$1,$2,$3,$4) RETURNING id::text",[OP,JSON.stringify({targetUserId:PLAN.userId,levelRow:before.level}),JSON.stringify(r),now])).id;
 one(await q(c,'INSERT INTO app_meta(key,value,updated_at) VALUES($1,$2,$3) RETURNING key',[OP,JSON.stringify(r),now]));
 return {replayed:false,receipt:r,verification:await verify(c,r,{exact:true})};
}
