import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {MERCENARY_LEVEL_KEY,mercenaryLevelState,levelProgress,validateMercenaryLevelPolicy,mercenaryLevelReadiness} from '../../shared/mercenary-level-v1.mjs';
import {JOKRO_CODE,JOKRO_ART} from '../../shared/mercenary-jokro-v1.mjs';

export const OP='ops:jokgeida-jokro-level7:20261024:v1';
export const PLAN={userId:4111,nickname:'족게이다',code:'V-979',name:'족로',rank:'SSS',authorization:'족게이다 계정 족로 7레벨로 변경',before:{level:5,experience:1800,breakthroughMask:0,revision:11},after:{level:7,experience:0,breakthroughMask:1,revision:12},cost:0,materialsConsumed:0};
const hash=value=>createHash('sha256').update(JSON.stringify(value)).digest('hex');
export const HASH=hash(PLAN);
const q=async(c,sql,args=[])=>(await c.query(sql,args)).rows;
const one=rows=>(assert.equal(rows.length,1,'Expected exactly one row'),rows[0]);
const array=sql=>`COALESCE((SELECT jsonb_agg(t) FROM (${sql}) t),'[]'::jsonb)`;

export async function protectedState(c){
 const fields={
  user:'SELECT id::text,nickname,status,role,coin::text,card_shards::text,magic_crystals::text FROM users WHERE id=$1',
  inventory:'SELECT * FROM cnine_user_inventory WHERE user_id=$1 ORDER BY item_code',
  cards:'SELECT * FROM user_mercenary_cards_v1 WHERE user_id=$1 ORDER BY mercenary_code',
  loadout:'SELECT * FROM user_mercenary_loadout_v1 WHERE user_id=$1',
  otherLevels:'SELECT * FROM user_mercenary_levels_v1 WHERE user_id=$1 AND mercenary_code<>$2 ORDER BY mercenary_code',
  legacyGrowth:'SELECT * FROM user_mercenary_growth_v1 WHERE user_id=$1 ORDER BY mercenary_code',
  settings:'SELECT key,value FROM app_meta WHERE key=ANY($3::text[]) ORDER BY key',
  stock:'SELECT * FROM mercenary_limited_stock_v1 WHERE code=$2'
 };
 const data=one(await q(c,`SELECT jsonb_build_object(${Object.entries(fields).map(([key,sql])=>`'${key}',${array(sql)}`).join(',')}) data`,[PLAN.userId,PLAN.code,[MERCENARY_LEVEL_KEY,`ranked_series_roster_v1:${PLAN.userId}`,`mercenary_pvp_loadout_v1:${PLAN.userId}`]])).data;
 return hash(data);
}
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
 const policy=validateMercenaryLevelPolicy(JSON.parse(one(await q(c,'SELECT value FROM app_meta WHERE key=$1',[MERCENARY_LEVEL_KEY])).value));
 levelProgress(policy,current,JOKRO_ART);
 return {verified:true,currentLevel:current.level,currentState:current,cost:0,materialsConsumed:0};
}
// Caller holds the production USER_LOCK and SQL lease and owns the transaction.
export async function grant(c,planHash,{leaseToken,lockDeadline}={}){
 assert.equal(planHash,HASH);const prior=await receipt(c);if(prior)return {replayed:true,receipt:prior,verification:await verify(c,prior)};
 assert.match(String(leaseToken||''),/^[a-f0-9]{64}$/);assert(Number.isSafeInteger(lockDeadline)&&lockDeadline>Date.now()+15000);
 await c.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))',[OP]);
 one(await q(c,'SELECT user_id FROM user_mutation_locks_v1520 WHERE user_id=$1 AND token=$2 AND action_path=$3 AND lease_until_ms>$4 FOR UPDATE',[PLAN.userId,leaseToken,OP,Date.now()+10000]));
 one(await q(c,'SELECT id FROM users WHERE id=$1 FOR UPDATE',[PLAN.userId]));
 await q(c,'SELECT user_id FROM user_second_verifications WHERE user_id=$1 FOR SHARE',[PLAN.userId]);
 one(await q(c,'SELECT user_id FROM user_mercenary_cards_v1 WHERE user_id=$1 AND mercenary_code=$2 FOR UPDATE',[PLAN.userId,PLAN.code]));
 one(await q(c,'SELECT user_id FROM user_mercenary_levels_v1 WHERE user_id=$1 AND mercenary_code=$2 FOR UPDATE',[PLAN.userId,PLAN.code]));
 one(await q(c,'SELECT key FROM app_meta WHERE key=$1 FOR SHARE',[MERCENARY_LEVEL_KEY]));
 await q(c,'SELECT code FROM mercenary_limited_stock_v1 WHERE code=$1 FOR SHARE',[PLAN.code]);
 const before=await state(c);
 assert.deepEqual(before.user,{id:'4111',nickname:PLAN.nickname,status:'ACTIVE',role:'USER',provider:'PLAYDK',provider_user_id:'6c8a26e9'});
 assert.equal(Number(before.owned.total_copies),1);assert.equal(Number(before.owned.duplicate_count),0);
 assert.deepEqual(mercenaryLevelState(before.level),PLAN.before,'Account growth changed since inspection');assert.equal((await artifacts(c)).length,0);
 one(await q(c,"SELECT id FROM users WHERE id=1 AND status='ACTIVE' AND role='OWNER'"));
 assert.equal(JOKRO_CODE,PLAN.code);assert.equal(JOKRO_ART.name,PLAN.name);assert.equal(JOKRO_ART.rank,PLAN.rank);
 const policy=validateMercenaryLevelPolicy(JSON.parse(before.policy));assert.equal(policy.mode,'ON');assert(mercenaryLevelReadiness(policy,{requireGrowth:true}).ready);levelProgress(policy,PLAN.after,JOKRO_ART);
 const now=new Date().toISOString(),after=PLAN.after;
 one(await q(c,'UPDATE user_mercenary_levels_v1 SET level=$3,experience=$4,breakthrough_mask=$5,revision=$6,updated_at=$7 WHERE user_id=$1 AND mercenary_code=$2 AND level=$8 AND experience=$9 AND breakthrough_mask=$10 AND revision=$11 RETURNING user_id',[PLAN.userId,PLAN.code,after.level,after.experience,after.breakthroughMask,after.revision,now,PLAN.before.level,PLAN.before.experience,PLAN.before.breakthroughMask,PLAN.before.revision]));
 const protectedAfter=await protectedState(c);assert.equal(protectedAfter,before.protected,'Other account state changed');
 const r={status:'COMPLETED',operationKey:OP,planHash:HASH,plan:PLAN,before:PLAN.before,after:PLAN.after,policyRevision:policy.revision,protectedBefore:before.protected,protectedAfter,completedAt:now};
 r.auditId=one(await q(c,"INSERT INTO admin_logs(admin_id,action_type,target_type,target_id,before_data,after_data,created_at) VALUES(1,'OPS_MERCENARY_LEVEL_SET','USER',$1,$2,$3,$4) RETURNING id::text",[OP,JSON.stringify({targetUserId:PLAN.userId,levelRow:before.level}),JSON.stringify(r),now])).id;
 one(await q(c,'INSERT INTO app_meta(key,value,updated_at) VALUES($1,$2,$3) RETURNING key',[OP,JSON.stringify(r),now]));
 assert(lockDeadline>Date.now()+5000,'Account lease expiring');
 return {replayed:false,receipt:r,verification:await verify(c,r,{exact:true})};
}
