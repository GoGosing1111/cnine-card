import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {MERCENARY_LEVEL_KEY,mercenaryLevelState,levelProgress,validateMercenaryLevelPolicy,mercenaryLevelReadiness} from '../../shared/mercenary-level-v1.mjs';
import {LIMITED_MERCENARIES} from '../../shared/mercenary-limited-catalog-v1.mjs';

export const OP='ops:visualgang-valter-level3:20261020:v1';
export const TARGET=Object.freeze({id:81,nickname:'비쥬얼깡패',provider:'PLAYDK',providerUserId:'03320b3e',code:'V-996',name:'발테르',rank:'SSS',level:3});
export const AUTHORIZATION='비쥬얼깡패 발테르 레벨 3로 변경해줘',ACTION='OPS_MERCENARY_LEVEL_SET';
const hash=v=>createHash('sha256').update(JSON.stringify(v)).digest('hex');
export const BEFORE=Object.freeze({level:1,experience:0,breakthroughMask:0,revision:0});
export const AFTER=Object.freeze({...BEFORE,level:3,revision:1});
export const PLAN_HASH=hash({OP,TARGET,AUTHORIZATION,BEFORE,AFTER});
const q=async(c,s,a=[])=>(await c.query(s,a)).rows;
const one=rows=>{assert.equal(rows.length,1,'Expected one exact row');return rows[0];};
const array=sql=>`COALESCE((SELECT jsonb_agg(t) FROM (${sql}) t),'[]'::jsonb)`;

export async function inspect(c){
 const fields={
  users:'SELECT u.id::text,u.nickname,u.status,u.role,v.provider,v.provider_user_id FROM users u LEFT JOIN user_second_verifications v ON v.user_id=u.id WHERE u.id=$1 OR u.nickname=$2 ORDER BY u.id',
  owned:'SELECT * FROM user_mercenary_cards_v1 WHERE user_id=$1 AND mercenary_code=$3',
  levels:'SELECT * FROM user_mercenary_levels_v1 WHERE user_id=$1 AND mercenary_code=$3',
  policy:'SELECT value FROM app_meta WHERE key=$4',
  receipts:'SELECT value FROM app_meta WHERE key=$5',
  audits:'SELECT id::text,admin_id::text,action_type,target_type,target_id,before_data,after_data FROM admin_logs WHERE action_type=$6 AND target_id=$5'
 };
 return one(await q(c,`SELECT jsonb_build_object(${Object.entries(fields).map(([k,s])=>`'${k}',${array(s)}`).join(',')}) data`,[TARGET.id,TARGET.nickname,TARGET.code,MERCENARY_LEVEL_KEY,OP,ACTION])).data;
}
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
 const data=one(await q(c,`SELECT jsonb_build_object(${Object.entries(fields).map(([k,s])=>`'${k}',${array(s)}`).join(',')}) data`,[TARGET.id,TARGET.code,[MERCENARY_LEVEL_KEY,`ranked_series_roster_v1:${TARGET.id}`,`mercenary_pvp_loadout_v1:${TARGET.id}`]])).data;
 return hash(data);
}
export async function verify(c,{exact=false}={}){
 const s=await inspect(c),r=JSON.parse(one(s.receipts).value),current=mercenaryLevelState(one(s.levels)),audit=one(s.audits);
 assert.equal(r.status,'COMPLETED');assert.equal(r.operationKey,OP);assert.equal(r.planHash,PLAN_HASH);assert.equal(r.authorization,AUTHORIZATION);assert.deepEqual(r.target,TARGET);
 assert.deepEqual(r.before,BEFORE);assert.deepEqual(r.after,AFTER);assert.equal(r.cost,0);assert.equal(r.materialsConsumed,0);assert.equal(r.protectedBefore,r.protectedAfter);
 assert.equal(audit.id,r.auditId);assert.equal(audit.admin_id,'1');assert.equal(audit.target_type,'USER');const {auditId,...payload}=r;assert.deepEqual(JSON.parse(audit.after_data),payload);
 assert.equal(Number(one(s.owned).total_copies),1);assert(current.revision>=AFTER.revision);if(exact)assert.deepEqual(current,AFTER);
 const policy=validateMercenaryLevelPolicy(JSON.parse(one(s.policy).value));levelProgress(policy,current,TARGET);
 return {receipt:r,summary:{status:'VERIFIED',recipient:TARGET.nickname,userId:TARGET.id,code:TARGET.code,name:TARGET.name,levelBefore:r.before.level,levelAfter:r.after.level,currentLevel:current.level,experience:current.experience,cost:0,materialsConsumed:0,holdingsAndLoadoutsPreserved:true,protectedStateVerified:true,auditId:r.auditId,completedAt:r.completedAt}};
}

// Caller holds live USER_LOCK and its DB fallback lease and owns the transaction.
export async function apply(c,approvedPlanHash,{leaseToken,lockDeadline}={}){
 assert.equal(approvedPlanHash,PLAN_HASH,'Reviewed plan required');assert.match(String(leaseToken||''),/^[a-f0-9]{64}$/);assert(Number.isSafeInteger(lockDeadline)&&lockDeadline>Date.now()+15000,'Live lease required');
 await c.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))',[OP]);
 if((await q(c,'SELECT key FROM app_meta WHERE key=$1',[OP])).length)return {...await verify(c),replayed:true};
 one(await q(c,'SELECT id FROM users WHERE id=$1 FOR UPDATE',[TARGET.id]));
 await q(c,'SELECT user_id FROM user_second_verifications WHERE user_id=$1 FOR SHARE',[TARGET.id]);
 await q(c,'SELECT user_id FROM user_mercenary_cards_v1 WHERE user_id=$1 AND mercenary_code=$2 FOR UPDATE',[TARGET.id,TARGET.code]);
 await q(c,'SELECT user_id FROM user_mercenary_levels_v1 WHERE user_id=$1 AND mercenary_code=$2 FOR UPDATE',[TARGET.id,TARGET.code]);
 await q(c,'SELECT key FROM app_meta WHERE key=$1 FOR SHARE',[MERCENARY_LEVEL_KEY]);
 await q(c,'SELECT code FROM mercenary_limited_stock_v1 WHERE code=$1 FOR SHARE',[TARGET.code]);
 one(await q(c,'SELECT user_id FROM user_mutation_locks_v1520 WHERE user_id=$1 AND token=$2 AND action_path=$3 AND lease_until_ms>$4',[TARGET.id,leaseToken,OP,Date.now()+10000]));
 assert.equal(one(await q(c,"SELECT to_char(CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Seoul','YYYY-MM-DD') AS today")).today,'2026-10-20');
 const s=await inspect(c),u=one(s.users),card=one(s.owned);
 assert.deepEqual(u,{id:'81',nickname:TARGET.nickname,status:'ACTIVE',role:'USER',provider:TARGET.provider,provider_user_id:TARGET.providerUserId});
 assert.equal(Number(card.total_copies),1);assert.equal(Number(card.duplicate_count),0);
 for(const key of ['levels','receipts','audits'])assert.equal(s[key].length,0,'Reviewed initial state changed');
 one(await q(c,"SELECT id FROM users WHERE id=1 AND role='OWNER' AND status='ACTIVE'"));
 const catalog=one(LIMITED_MERCENARIES.filter(x=>x.code===TARGET.code));assert.equal(catalog.name,TARGET.name);assert.equal(catalog.rank,TARGET.rank);
 const policy=validateMercenaryLevelPolicy(JSON.parse(one(s.policy).value));assert.equal(policy.mode,'ON');assert.equal(mercenaryLevelReadiness(policy,{requireGrowth:true}).ready,true);
 assert.deepEqual(mercenaryLevelState(s.levels[0]),BEFORE);levelProgress(policy,AFTER,TARGET);
 const protectedBefore=await protectedState(c),now=new Date().toISOString();
 one(await q(c,'INSERT INTO user_mercenary_levels_v1(user_id,mercenary_code,level,experience,breakthrough_mask,revision,updated_at) VALUES($1,$2,$3,$4,$5,$6,$7) ON CONFLICT(user_id,mercenary_code) DO NOTHING RETURNING user_id',[TARGET.id,TARGET.code,AFTER.level,AFTER.experience,AFTER.breakthroughMask,AFTER.revision,now]));
 const protectedAfter=await protectedState(c);assert.equal(protectedAfter,protectedBefore,'Protected state changed');
 const r={status:'COMPLETED',operationKey:OP,planHash:PLAN_HASH,target:TARGET,authorization:AUTHORIZATION,before:BEFORE,after:AFTER,cost:0,materialsConsumed:0,policyRevision:policy.revision,protectedBefore,protectedAfter,completedAt:now};
 r.auditId=one(await q(c,"INSERT INTO admin_logs(admin_id,action_type,target_type,target_id,before_data,after_data,created_at) VALUES(1,$1,'USER',$2,$3,$4,$5) RETURNING id::text",[ACTION,OP,JSON.stringify({targetUserId:TARGET.id,levelRows:s.levels,state:BEFORE}),JSON.stringify(r),now])).id;
 one(await q(c,'INSERT INTO app_meta(key,value,updated_at) VALUES($1,$2,$3) RETURNING key',[OP,JSON.stringify(r),now]));
 const result=await verify(c,{exact:true});assert(lockDeadline>Date.now()+5000,'Account lease expiring');return {...result,replayed:false};
}
