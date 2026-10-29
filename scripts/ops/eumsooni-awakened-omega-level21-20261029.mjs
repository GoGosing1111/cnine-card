import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {MERCENARY_LEVEL_KEY,mercenaryLevelStateFromStorage,mercenaryLevelStorageLevel,levelProgress,validateMercenaryLevelPolicy,mercenaryLevelReadiness,MERCENARY_LEVEL_RELEASE_ENABLED} from '../../shared/mercenary-level-v1.mjs';
import {AWAKENED_OMEGA_ART} from '../../shared/mercenary-awakened-omega-v1.mjs';

export const OP='ops:eumsooni-awakened-omega-level21:20261029:v1',IDS=['65'],ACTION='OPS_MERCENARY_LEVEL_SET';
export const TARGET={id:65,nickname:'음순이',role:'USER',status:'ACTIVE',identityHash:'2f77e6e1664c782d529261c6fe33038227b5a88eba0f86f414eb5a0f6bba0cc3'};
export const PLAN={"operationKey":"ops:eumsooni-awakened-omega-level21:20261029:v1","authorization":"음순이 각성오메가 21레벨로 변경","target":{"id":65,"nickname":"음순이","role":"USER","status":"ACTIVE","identityHash":"2f77e6e1664c782d529261c6fe33038227b5a88eba0f86f414eb5a0f6bba0cc3"},"code":"V-972","name":"각성 오메가","rank":"SSS","before":{"level":1,"experience":0,"breakthroughMask":0,"revision":0},"after":{"level":21,"experience":0,"breakthroughMask":15,"revision":1},"beforeRowExists":false,"storageLevel":20,"experiencePolicy":"TERMINAL_MAX_REQUIRES_ZERO","cost":0,"materialsConsumed":0};
export const hash=v=>createHash('sha256').update(JSON.stringify(v)).digest('hex'),HASH=hash(PLAN);
const q=async(c,s,a=[])=>(await c.query(s,a)).rows,one=r=>(assert.equal(r.length,1,'Expected exactly one row'),r[0]),parse=v=>typeof v==='string'?JSON.parse(v):v;
export async function receipt(c){const rows=await q(c,'SELECT value FROM app_meta WHERE key=$1',[OP]);return rows.length?parse(one(rows).value):null;}
export async function artifacts(c){return {receipt:await receipt(c),audit:await q(c,'SELECT id::text,admin_id::text,target_type,target_id,before_data,after_data FROM admin_logs WHERE action_type=$1 AND target_id=$2',[ACTION,OP])};}
export async function snapshot(c){
 const s={};for(const [key,sql,args] of [
  ['user','SELECT id::text,nickname,role,status,coin::text,card_shards::text,magic_crystals::text FROM users WHERE id=65',[]],
  ['identity','SELECT provider,provider_user_id FROM user_second_verifications WHERE user_id=65',[]],
  ['inventory','SELECT * FROM cnine_user_inventory WHERE user_id=65 ORDER BY item_code',[]],
  ['cards','SELECT * FROM user_mercenary_cards_v1 WHERE user_id=65 ORDER BY mercenary_code',[]],
  ['levels','SELECT * FROM user_mercenary_levels_v1 WHERE user_id=65 ORDER BY mercenary_code',[]],
  ['legacyGrowth','SELECT * FROM user_mercenary_growth_v1 WHERE user_id=65 ORDER BY mercenary_code',[]],
  ['loadout','SELECT * FROM user_mercenary_loadout_v1 WHERE user_id=65',[]],
  ['settings','SELECT key,value FROM app_meta WHERE key=ANY($1::text[]) ORDER BY key',[[MERCENARY_LEVEL_KEY,'mercenary_pvp_loadout_v1:65','ranked_series_roster_v1:65','mercenary_experience_transfer_v1:65','mercenary_dual_loadout_v2:65']]],
  ['stock','SELECT * FROM mercenary_limited_stock_v1 WHERE code=$1',[PLAN.code]],
  ['sync','SELECT user_id::text,revision::text,domains FROM account_sync_versions_v1 WHERE user_id=65',[]],
  ['ranked','SELECT user_id::text,source_version::text FROM ranked_duo_accounts_v1 WHERE user_id=65',[]]
 ])s[key]=await q(c,sql,args);
 s.identity=s.identity.map(x=>({identityHash:hash(x)}));return JSON.parse(JSON.stringify(s));
}
const protectedState=s=>({...s,levels:s.levels.filter(x=>x.mercenary_code!==PLAN.code),sync:undefined,ranked:undefined});
export async function verify(c,r=undefined,{exact=false}={}){
 r??=await receipt(c);assert.equal(r?.status,'COMPLETED');assert.equal(r.operationKey,OP);assert.equal(r.actor,'CODEX_OPERATIONS');assert.equal(r.planHash,HASH);assert.deepEqual(r.plan,PLAN);assert.equal(r.protectedBeforeHash,r.protectedAfterHash);
 assert.deepEqual(mercenaryLevelStateFromStorage(r.before),PLAN.before);assert.deepEqual(mercenaryLevelStateFromStorage(r.after),PLAN.after);
 const a=await artifacts(c),audit=one(a.audit),{auditId,...payload}=r;assert.deepEqual(a.receipt,r);assert.equal(audit.id,auditId);assert.equal(audit.admin_id,'1');assert.equal(audit.target_type,'USER');assert.deepEqual(parse(audit.after_data),payload);assert.deepEqual(parse(audit.before_data),r.before);
 const row=one(await q(c,'SELECT * FROM user_mercenary_levels_v1 WHERE user_id=65 AND mercenary_code=$1',[PLAN.code])),current=mercenaryLevelStateFromStorage(row);
 assert(current.revision>=PLAN.after.revision);if(exact||current.revision===PLAN.after.revision)assert.deepEqual(current,PLAN.after);
 const owned=one(await q(c,'SELECT total_copies FROM user_mercenary_cards_v1 WHERE user_id=65 AND mercenary_code=$1',[PLAN.code]));assert(Number(owned.total_copies)>=1);
 const policy=validateMercenaryLevelPolicy(parse(one(await q(c,'SELECT value FROM app_meta WHERE key=$1',[MERCENARY_LEVEL_KEY])).value));assert(levelProgress(policy,current,PLAN).complete);
 assert.equal(BigInt(r.syncAfter.revision),BigInt(r.syncBefore.revision)+1n);for(const domain of ['collection','loadout'])assert.equal(r.syncAfter.domains[domain],r.syncAfter.revision);
 return {status:'VERIFIED',userId:65,nickname:TARGET.nickname,code:PLAN.code,name:PLAN.name,levelBefore:PLAN.before.level,levelAfter:PLAN.after.level,currentLevel:current.level,complete:levelProgress(policy,current,PLAN).complete,experience:current.experience,breakthroughMask:current.breakthroughMask,heldCopies:Number(owned.total_copies),auditId,completedAt:r.completedAt,cost:0,materialsConsumed:0};
}
// Caller owns one transaction, the production USER_LOCK and its SQL lease.
export async function grant(c,{leaseToken,lockDeadline}={}){
 const prior=await receipt(c);if(prior)return {replayed:true,receipt:prior,verification:await verify(c,prior)};
 assert.match(String(leaseToken),/^[a-f0-9]{64}$/);assert(lockDeadline>Date.now()+20000);
 await q(c,'SELECT pg_advisory_xact_lock(hashtextextended($1,0))',[OP]);
 one(await q(c,'SELECT user_id FROM account_sync_versions_v1 WHERE user_id=65 FOR UPDATE'));one(await q(c,'SELECT id FROM users WHERE id=65 FOR UPDATE'));
 const lease=async()=>{assert(lockDeadline>Date.now()+5000);one(await q(c,'SELECT user_id FROM user_mutation_locks_v1520 WHERE user_id=65 AND token=$1 AND action_path=$2 AND lease_until_ms>$3',[leaseToken,OP,Date.now()+5000]));};await lease();
 await q(c,'SELECT user_id FROM user_second_verifications WHERE user_id=65 FOR SHARE');
 one(await q(c,'SELECT user_id FROM user_mercenary_cards_v1 WHERE user_id=65 AND mercenary_code=$1 FOR UPDATE',[PLAN.code]));const lockedLevels=await q(c,'SELECT user_id FROM user_mercenary_levels_v1 WHERE user_id=65 AND mercenary_code=$1 FOR UPDATE',[PLAN.code]);assert.equal(lockedLevels.length,0,'Account growth changed since inspection');
 one(await q(c,'SELECT key FROM app_meta WHERE key=$1 FOR SHARE',[MERCENARY_LEVEL_KEY]));await q(c,'SELECT code FROM mercenary_limited_stock_v1 WHERE code=$1 FOR SHARE',[PLAN.code]);
 const before=await snapshot(c),user=one(before.user);for(const k of ['nickname','role','status'])assert.equal(user[k],TARGET[k]);assert.equal(user.id,'65');assert.equal(one(before.identity).identityHash,TARGET.identityHash);
 assert.equal(one(await q(c,'SELECT id::text FROM users WHERE nickname=$1',[TARGET.nickname])).id,'65');one(await q(c,"SELECT id FROM users WHERE id=1 AND role='OWNER' AND status='ACTIVE'"));
 const owned=one(before.cards.filter(x=>x.mercenary_code===PLAN.code));assert(Number(owned.total_copies)>=1);
 const old=before.levels.find(x=>x.mercenary_code===PLAN.code)||null;assert.equal(old,null,'Account growth changed since inspection');assert.deepEqual(mercenaryLevelStateFromStorage(old),PLAN.before,'Account growth changed since inspection');assert.equal((await artifacts(c)).audit.length,0,'Orphan audit found');
 const catalog=AWAKENED_OMEGA_ART;assert.equal(catalog.code,PLAN.code);assert.equal(catalog.name,PLAN.name);assert.equal(catalog.rank,PLAN.rank);assert.equal(MERCENARY_LEVEL_RELEASE_ENABLED,true);
 const policy=validateMercenaryLevelPolicy(parse(one(before.settings.filter(x=>x.key===MERCENARY_LEVEL_KEY)).value));assert.equal(policy.mode,'ON');assert(mercenaryLevelReadiness(policy,{requireGrowth:true}).ready);assert.equal(PLAN.after.level,21);assert.equal(PLAN.after.experience,0);assert.equal(PLAN.after.breakthroughMask,15);assert(levelProgress(policy,PLAN.after,PLAN).complete);
 const now=new Date().toISOString(),after=PLAN.after;
 const changed=one(await q(c,'INSERT INTO user_mercenary_levels_v1(user_id,mercenary_code,level,experience,breakthrough_mask,revision,updated_at) VALUES(65,$1,$2,$3,$4,$5,$6) RETURNING *',[PLAN.code,mercenaryLevelStorageLevel(after),after.experience,after.breakthroughMask,after.revision,now]));assert.deepEqual(mercenaryLevelStateFromStorage(changed),after);
 one(await q(c,"UPDATE account_sync_versions_v1 SET revision=revision+1,domains=domains||jsonb_build_object('collection',(revision+1)::text,'loadout',(revision+1)::text),updated_at=clock_timestamp() WHERE user_id=65 RETURNING user_id"));
 const final=await snapshot(c);assert.deepEqual(protectedState(final),protectedState(before));assert.deepEqual(mercenaryLevelStateFromStorage(one(final.levels.filter(x=>x.mercenary_code===PLAN.code))),after);
 const syncBefore=one(before.sync),syncAfter=one(final.sync);assert.equal(BigInt(syncAfter.revision),BigInt(syncBefore.revision)+1n);for(const domain of Object.keys(syncBefore.domains))if(!['collection','loadout'].includes(domain))assert.equal(syncAfter.domains[domain],syncBefore.domains[domain]);
 if(before.ranked.length)assert.equal(BigInt(one(final.ranked).source_version),BigInt(one(before.ranked).source_version)+1n);else assert.deepEqual(final.ranked,before.ranked);
 const r={status:'COMPLETED',actor:'CODEX_OPERATIONS',operationKey:OP,planHash:HASH,plan:PLAN,before:old,after:JSON.parse(JSON.stringify(changed)),policyRevision:policy.revision,syncBefore,syncAfter,protectedBeforeHash:hash(protectedState(before)),protectedAfterHash:hash(protectedState(final)),completedAt:now};
 r.auditId=one(await q(c,"INSERT INTO admin_logs(admin_id,action_type,target_type,target_id,before_data,after_data) VALUES(1,$1,'USER',$2,$3,$4) RETURNING id::text",[ACTION,OP,JSON.stringify(old),JSON.stringify(r)])).id;
 await q(c,'INSERT INTO app_meta(key,value,updated_at) VALUES($1,$2,$3)',[OP,JSON.stringify(r),now]);await lease();return {replayed:false,receipt:r,verification:await verify(c,r,{exact:true})};
}
