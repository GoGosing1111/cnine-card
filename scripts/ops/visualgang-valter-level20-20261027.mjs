import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {MERCENARY_LEVEL_KEY,mercenaryLevelState,levelProgress,validateMercenaryLevelPolicy,mercenaryLevelReadiness,MERCENARY_LEVEL_RELEASE_ENABLED} from '../../shared/mercenary-level-v1.mjs';
import {LIMITED_MERCENARIES} from '../../shared/mercenary-limited-catalog-v1.mjs';

export const OP='ops:visualgang-valter-level20:20261027:v1',IDS=['81'],ACTION='OPS_MERCENARY_LEVEL_SET';
export const TARGET={"id":81,"nickname":"비쥬얼깡패","role":"USER","status":"ACTIVE","identityHash":"6050169c2537716e2a3995c7ea229bfe50a0437e9f01c9f58a1f1544e0b587a4"};
export const PLAN={"operationKey":"ops:visualgang-valter-level20:20261027:v1","authorization":"비쥬얼깡패 발테르 20레벨","target":{"id":81,"nickname":"비쥬얼깡패","role":"USER","status":"ACTIVE","identityHash":"6050169c2537716e2a3995c7ea229bfe50a0437e9f01c9f58a1f1544e0b587a4"},"code":"V-996","name":"발테르","rank":"SSS","before":{"level":14,"experience":0,"breakthroughMask":3,"revision":2},"after":{"level":20,"experience":0,"breakthroughMask":7,"revision":3},"experiencePolicy":"PRESERVE_EXISTING","cost":0,"materialsConsumed":0};
export const hash=v=>createHash('sha256').update(JSON.stringify(v)).digest('hex'),HASH=hash(PLAN);
const q=async(c,s,a=[])=>(await c.query(s,a)).rows,one=r=>(assert.equal(r.length,1,'Expected exactly one row'),r[0]),parse=v=>typeof v==='string'?JSON.parse(v):v;
export async function receipt(c){const rows=await q(c,'SELECT value FROM app_meta WHERE key=$1',[OP]);return rows.length?parse(one(rows).value):null;}
export async function artifacts(c){return {receipt:await receipt(c),audit:await q(c,'SELECT id::text,admin_id::text,target_type,target_id,before_data,after_data FROM admin_logs WHERE action_type=$1 AND target_id=$2',[ACTION,OP])};}
export async function snapshot(c){
 const s={};for(const [key,sql,args] of [
  ['user','SELECT id::text,nickname,role,status,coin::text,card_shards::text,magic_crystals::text FROM users WHERE id=81',[]],
  ['identity','SELECT provider,provider_user_id FROM user_second_verifications WHERE user_id=81',[]],
  ['inventory','SELECT * FROM cnine_user_inventory WHERE user_id=81 ORDER BY item_code',[]],
  ['cards','SELECT * FROM user_mercenary_cards_v1 WHERE user_id=81 ORDER BY mercenary_code',[]],
  ['levels','SELECT * FROM user_mercenary_levels_v1 WHERE user_id=81 ORDER BY mercenary_code',[]],
  ['legacyGrowth','SELECT * FROM user_mercenary_growth_v1 WHERE user_id=81 ORDER BY mercenary_code',[]],
  ['loadout','SELECT * FROM user_mercenary_loadout_v1 WHERE user_id=81',[]],
  ['settings','SELECT key,value FROM app_meta WHERE key=ANY($1::text[]) ORDER BY key',[[MERCENARY_LEVEL_KEY,'mercenary_pvp_loadout_v1:81','ranked_series_roster_v1:81','mercenary_experience_transfer_v1:81']]],
  ['stock','SELECT * FROM mercenary_limited_stock_v1 WHERE code=$1',[PLAN.code]],
  ['sync','SELECT user_id::text,revision::text,domains FROM account_sync_versions_v1 WHERE user_id=81',[]],
  ['ranked','SELECT user_id::text,source_version::text FROM ranked_duo_accounts_v1 WHERE user_id=81',[]]
 ])s[key]=await q(c,sql,args);
 s.identity=s.identity.map(x=>({identityHash:hash({provider:x.provider,providerUserId:x.provider_user_id})}));return JSON.parse(JSON.stringify(s));
}
const protectedState=s=>({...s,levels:s.levels.filter(x=>x.mercenary_code!==PLAN.code),sync:undefined,ranked:undefined});
export async function verify(c,r=undefined,{exact=false}={}){
 r??=await receipt(c);assert.equal(r?.status,'COMPLETED');assert.equal(r.operationKey,OP);assert.equal(r.actor,'CODEX_OPERATIONS');assert.equal(r.planHash,HASH);assert.deepEqual(r.plan,PLAN);assert.equal(r.protectedBeforeHash,r.protectedAfterHash);
 assert.deepEqual(mercenaryLevelState(r.before),PLAN.before);assert.deepEqual(mercenaryLevelState(r.after),PLAN.after);
 const a=await artifacts(c),audit=one(a.audit),{auditId,...payload}=r;assert.deepEqual(a.receipt,r);assert.equal(audit.id,auditId);assert.equal(audit.admin_id,'1');assert.equal(audit.target_type,'USER');assert.deepEqual(parse(audit.after_data),payload);assert.deepEqual(parse(audit.before_data),r.before);
 const row=one(await q(c,'SELECT * FROM user_mercenary_levels_v1 WHERE user_id=81 AND mercenary_code=$1',[PLAN.code])),current=mercenaryLevelState(row);
 assert(current.revision>=PLAN.after.revision);if(exact||current.revision===PLAN.after.revision)assert.deepEqual(current,PLAN.after);
 const owned=one(await q(c,'SELECT total_copies FROM user_mercenary_cards_v1 WHERE user_id=81 AND mercenary_code=$1',[PLAN.code]));assert(Number(owned.total_copies)>=1);
 const policy=validateMercenaryLevelPolicy(parse(one(await q(c,'SELECT value FROM app_meta WHERE key=$1',[MERCENARY_LEVEL_KEY])).value));levelProgress(policy,current,PLAN);
 assert.equal(BigInt(r.syncAfter.revision),BigInt(r.syncBefore.revision)+1n);for(const domain of ['collection','loadout'])assert.equal(r.syncAfter.domains[domain],r.syncAfter.revision);
 return {status:'VERIFIED',userId:81,nickname:TARGET.nickname,code:PLAN.code,name:PLAN.name,levelBefore:PLAN.before.level,levelAfter:PLAN.after.level,currentLevel:current.level,experience:current.experience,breakthroughMask:current.breakthroughMask,heldCopies:Number(owned.total_copies),auditId,completedAt:r.completedAt,cost:0,materialsConsumed:0};
}
// Caller owns one transaction, the production USER_LOCK and its SQL lease.
export async function grant(c,{leaseToken,lockDeadline}={}){
 const prior=await receipt(c);if(prior)return {replayed:true,receipt:prior,verification:await verify(c,prior)};
 assert.match(String(leaseToken),/^[a-f0-9]{64}$/);assert(lockDeadline>Date.now()+20000);
 await q(c,'SELECT pg_advisory_xact_lock(hashtextextended($1,0))',[OP]);
 one(await q(c,'SELECT user_id FROM account_sync_versions_v1 WHERE user_id=81 FOR UPDATE'));one(await q(c,'SELECT id FROM users WHERE id=81 FOR UPDATE'));
 const lease=async()=>{assert(lockDeadline>Date.now()+5000);one(await q(c,'SELECT user_id FROM user_mutation_locks_v1520 WHERE user_id=81 AND token=$1 AND action_path=$2 AND lease_until_ms>$3',[leaseToken,OP,Date.now()+5000]));};await lease();
 await q(c,'SELECT user_id FROM user_second_verifications WHERE user_id=81 FOR SHARE');
 one(await q(c,'SELECT user_id FROM user_mercenary_cards_v1 WHERE user_id=81 AND mercenary_code=$1 FOR UPDATE',[PLAN.code]));one(await q(c,'SELECT user_id FROM user_mercenary_levels_v1 WHERE user_id=81 AND mercenary_code=$1 FOR UPDATE',[PLAN.code]));
 one(await q(c,'SELECT key FROM app_meta WHERE key=$1 FOR SHARE',[MERCENARY_LEVEL_KEY]));await q(c,'SELECT code FROM mercenary_limited_stock_v1 WHERE code=$1 FOR SHARE',[PLAN.code]);
 const before=await snapshot(c),user=one(before.user);for(const k of ['nickname','role','status'])assert.equal(user[k],TARGET[k]);assert.equal(user.id,'81');assert.equal(one(before.identity).identityHash,TARGET.identityHash);
 assert.equal(one(await q(c,'SELECT id::text FROM users WHERE nickname=$1',[TARGET.nickname])).id,'81');one(await q(c,"SELECT id FROM users WHERE id=1 AND role='OWNER' AND status='ACTIVE'"));
 const owned=one(before.cards.filter(x=>x.mercenary_code===PLAN.code));assert(Number(owned.total_copies)>=1);
 const old=one(before.levels.filter(x=>x.mercenary_code===PLAN.code));assert.deepEqual(mercenaryLevelState(old),PLAN.before,'Account growth changed since inspection');assert.equal((await artifacts(c)).audit.length,0,'Orphan audit found');
 const catalog=one(LIMITED_MERCENARIES.filter(x=>x.code===PLAN.code));assert.equal(catalog.name,PLAN.name);assert.equal(catalog.rank,PLAN.rank);assert.equal(MERCENARY_LEVEL_RELEASE_ENABLED,true);
 const policy=validateMercenaryLevelPolicy(parse(one(before.settings.filter(x=>x.key===MERCENARY_LEVEL_KEY)).value));assert.equal(policy.mode,'ON');assert(mercenaryLevelReadiness(policy,{requireGrowth:true}).ready);levelProgress(policy,PLAN.after,PLAN);
 const now=new Date().toISOString(),after=PLAN.after;
 const changed=one(await q(c,'UPDATE user_mercenary_levels_v1 SET level=$2,breakthrough_mask=$3,revision=revision+1,updated_at=$4 WHERE user_id=81 AND mercenary_code=$1 AND level=$5 AND experience=$6 AND breakthrough_mask=$7 AND revision=$8 RETURNING *',[PLAN.code,after.level,after.breakthroughMask,now,PLAN.before.level,PLAN.before.experience,PLAN.before.breakthroughMask,PLAN.before.revision]));assert.deepEqual(mercenaryLevelState(changed),after);
 one(await q(c,"UPDATE account_sync_versions_v1 SET revision=revision+1,domains=domains||jsonb_build_object('collection',(revision+1)::text,'loadout',(revision+1)::text),updated_at=clock_timestamp() WHERE user_id=81 RETURNING user_id"));
 const final=await snapshot(c);assert.deepEqual(protectedState(final),protectedState(before));assert.deepEqual(mercenaryLevelState(one(final.levels.filter(x=>x.mercenary_code===PLAN.code))),after);
 const syncBefore=one(before.sync),syncAfter=one(final.sync);assert.equal(BigInt(syncAfter.revision),BigInt(syncBefore.revision)+1n);for(const domain of Object.keys(syncBefore.domains))if(!['collection','loadout'].includes(domain))assert.equal(syncAfter.domains[domain],syncBefore.domains[domain]);
 if(before.ranked.length)assert.equal(BigInt(one(final.ranked).source_version),BigInt(one(before.ranked).source_version)+1n);else assert.deepEqual(final.ranked,before.ranked);
 const r={status:'COMPLETED',actor:'CODEX_OPERATIONS',operationKey:OP,planHash:HASH,plan:PLAN,before:old,after:JSON.parse(JSON.stringify(changed)),policyRevision:policy.revision,syncBefore,syncAfter,protectedBeforeHash:hash(protectedState(before)),protectedAfterHash:hash(protectedState(final)),completedAt:now};
 r.auditId=one(await q(c,"INSERT INTO admin_logs(admin_id,action_type,target_type,target_id,before_data,after_data) VALUES(1,$1,'USER',$2,$3,$4) RETURNING id::text",[ACTION,OP,JSON.stringify(old),JSON.stringify(r)])).id;
 await q(c,'INSERT INTO app_meta(key,value,updated_at) VALUES($1,$2,$3)',[OP,JSON.stringify(r),now]);await lease();return {replayed:false,receipt:r,verification:await verify(c,r,{exact:true})};
}
