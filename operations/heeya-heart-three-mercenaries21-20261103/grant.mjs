import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {MERCENARY_LEVEL_KEY,mercenaryLevelStateFromStorage,mercenaryLevelStorageLevel,levelProgress,validateMercenaryLevelPolicy,mercenaryLevelReadiness,MERCENARY_LEVEL_RELEASE_ENABLED} from '../../shared/mercenary-level-v1.mjs';
import {ALL_LIMITED_MERCENARIES} from '../../shared/mercenary-limited-catalog-v1.mjs';
import {GENERAL_JOK_ART} from '../../shared/mercenary-general-jok-v1.mjs';
export const PLAN=JSON.parse(readFileSync(new URL('./plan.json',import.meta.url),'utf8'));
export const OP=PLAN.operationKey,ACTION='OPS_MERCENARY_GRANT_OR_LEVEL',IDS=[PLAN.target.id],CODES=PLAN.targets.map(t=>t.code).sort();
export const hash=v=>createHash('sha256').update(JSON.stringify(v)).digest('hex'),HASH=hash(PLAN);
const q=async(c,s,a=[])=>(await c.query(s,a)).rows,one=r=>(assert.equal(r.length,1,'Expected exactly one row'),r[0]),parse=v=>typeof v==='string'?JSON.parse(v):v;
const SETTINGS=[MERCENARY_LEVEL_KEY,'mercenary_blackcrown_ss_pack_v1','mercenary_limited_pack_v1','mercenary_limited_draw_policy_v1','mercenary_halloween_ss_pack_v1','mercenary_halloween_pack_v1','mercenary_bloodmoon_ss_pack_v1','sss_miracle_cube_policy_20261021_v1','mercenary_runtime_policy_v1'];
const arr=s=>`COALESCE((SELECT jsonb_agg(t) FROM (${s}) t),'[]'::jsonb)`;
export function decide(card,row){
 const copies=Number(card?.total_copies||0),before=mercenaryLevelStateFromStorage(row);assert(Number.isSafeInteger(copies)&&copies>=0);if(card)assert.equal(Number(card.duplicate_count),Math.max(0,copies-1));
 const after=before.level===21?before:{level:21,experience:0,breakthroughMask:15,revision:before.revision+1};
 return {copiesBefore:copies,quantity:copies>0?0:1,before,after,levelChanged:before.level!==21};
}
function validate(expected=HASH){
 assert.equal(expected,HASH,'Reviewed plan required');assert.equal(OP,'ops:heeya-heart-three-mercenaries21:20261103:v1');assert.deepEqual(IDS,['4977']);assert.equal(PLAN.target.nickname,'하이희야♡');assert.equal(PLAN.target.role,'USER');assert.equal(PLAN.target.status,'ACTIVE');
 assert.equal(PLAN.stockPolicy,'DIRECT_ADMIN_GRANT_PRESERVE_PUBLIC_STOCK');assert.equal(PLAN.ownershipRule,'GRANT_ONE_ONLY_WHEN_UNOWNED');for(const k of ['cost','materialsConsumed'])assert.equal(PLAN[k],0);for(const k of ['automaticLoadout','sendMessages'])assert.equal(PLAN[k],false);
 assert.deepEqual(PLAN.targets.map(t=>[t.code,t.name,t.rank,t.season]),[['V-974','제너럴 족','SSS',null],['V-950','희야','SS','BLACKCROWN'],['V-982','하이희야','SS','HALLOWEEN']]);assert.equal(MERCENARY_LEVEL_RELEASE_ENABLED,true);
 const catalog=[GENERAL_JOK_ART,...ALL_LIMITED_MERCENARIES];for(const t of PLAN.targets){const art=one(catalog.filter(a=>a.code===t.code));for(const k of ['name','rank'])assert.equal(t[k],art[k]);assert.equal(t.season,art.season||null);const d=decide(t.expectedCard,t.expectedLevelRow);for(const k of ['copiesBefore','quantity','before','after'])assert.deepEqual(t[k],d[k]);assert.equal(t.storedLevel,mercenaryLevelStorageLevel(d.after));}
}
export async function snapshot(c){
 const fields={
  users:'SELECT u.id::text,u.nickname,u.role,u.status,u.coin::text,u.card_shards::text,u.magic_crystals::text,v.provider,v.provider_user_id FROM users u LEFT JOIN user_second_verifications v ON v.user_id=u.id WHERE u.id=ANY($1::bigint[]) ORDER BY u.id',
  cards:'SELECT * FROM user_mercenary_cards_v1 WHERE user_id=ANY($1::bigint[]) ORDER BY user_id,mercenary_code',
  levels:'SELECT * FROM user_mercenary_levels_v1 WHERE user_id=ANY($1::bigint[]) ORDER BY user_id,mercenary_code',
  growth:'SELECT * FROM user_mercenary_growth_v1 WHERE user_id=ANY($1::bigint[]) ORDER BY user_id,mercenary_code',
  inventory:'SELECT * FROM cnine_user_inventory WHERE user_id=ANY($1::bigint[]) ORDER BY user_id,item_code',
  pig:'SELECT * FROM pig_coin_wallets_v1 WHERE user_id=ANY($1::bigint[]) ORDER BY user_id',
  loadout:'SELECT * FROM user_mercenary_loadout_v1 WHERE user_id=ANY($1::bigint[]) ORDER BY user_id',
  sync:'SELECT user_id::text,revision::text,domains FROM account_sync_versions_v1 WHERE user_id=ANY($1::bigint[]) ORDER BY user_id',
  ranked:'SELECT user_id::text,source_version::text FROM ranked_duo_accounts_v1 WHERE user_id=ANY($1::bigint[]) ORDER BY user_id',
  stock:'SELECT * FROM mercenary_limited_stock_v1 WHERE code=ANY($2::text[]) ORDER BY code',
  issues:'SELECT * FROM mercenary_limited_issues_v1 WHERE code=ANY($2::text[]) ORDER BY code,serial',
  settings:'SELECT key,value FROM app_meta WHERE key=ANY($3::text[]) ORDER BY key',
  craft:"SELECT output_ref,COUNT(*)::text rows,COALESCE(SUM(output_quantity) FILTER(WHERE success=1),0)::text crafted FROM workshop_craft_logs_v1668 WHERE output_type='MERCENARY' AND output_ref=ANY($2::text[]) GROUP BY output_ref ORDER BY output_ref",
  accountSettings:"SELECT key,value FROM app_meta WHERE key LIKE '%:4977' OR key LIKE 'mercenary%:4977:%' ORDER BY key"
 };
 const s=one(await q(c,`SELECT jsonb_build_object(${Object.entries(fields).map(([k,v])=>`'${k}',${arr(v)}`).join(',')}) data`,[IDS,CODES,SETTINGS])).data;
 s.users=s.users.map(({provider,provider_user_id,...u})=>({...u,identityHash:hash({provider,providerUserId:provider_user_id})}));return s;
}
export const protectedState=s=>({...s,cards:s.cards.filter(x=>!CODES.includes(x.mercenary_code)),levels:s.levels.filter(x=>!CODES.includes(x.mercenary_code)),sync:undefined,ranked:undefined});
export async function receipt(c){const r=await q(c,'SELECT value FROM app_meta WHERE key=$1',[OP]);return r.length?parse(one(r).value):null;}
export async function artifacts(c){return {receipt:await receipt(c),audit:await q(c,'SELECT id::text FROM admin_logs WHERE target_id=$1',[OP]),acquisitions:await q(c,'SELECT acquisition_id FROM mercenary_card_acquisitions_v1 WHERE acquisition_id LIKE $1 ORDER BY acquisition_id',[OP+':%']),issues:await q(c,'SELECT acquisition_id FROM mercenary_limited_issues_v1 WHERE request_id=$1 OR acquisition_id LIKE $2',[OP,OP+':%'])};}
export async function verify(c,r=undefined,{exact=false}={}){
 validate();r??=await receipt(c);assert.equal(r?.status,'COMPLETED');assert.equal(r.actor,'CODEX_OPERATIONS');assert.equal(r.operationKey,OP);assert.equal(r.planHash,HASH);assert.deepEqual(r.plan,PLAN);assert.deepEqual(await receipt(c),r);assert.equal(r.protectedBeforeHash,r.protectedAfterHash);assert.deepEqual(r.stockBefore,r.stockAfter);assert.deepEqual(r.issuesBefore,r.issuesAfter);
 const s=await snapshot(c),records=await q(c,'SELECT * FROM mercenary_card_acquisitions_v1 WHERE acquisition_id LIKE $1 ORDER BY acquisition_id',[OP+':%']);assert.equal(records.length,PLAN.targets.reduce((n,t)=>n+t.quantity,0));assert.equal(r.grants.length,3);
 const result=[];for(const t of PLAN.targets){
  const g=one(r.grants.filter(g=>g.code===t.code)),h=one(s.cards.filter(x=>x.mercenary_code===t.code)),l=one(s.levels.filter(x=>x.mercenary_code===t.code)),current=mercenaryLevelStateFromStorage(l);
  assert.equal(g.quantity,t.quantity);assert.equal(g.copiesBefore,t.copiesBefore);assert.equal(g.copiesAfter,t.copiesBefore+t.quantity);assert.deepEqual(mercenaryLevelStateFromStorage(g.levelBefore),t.before);assert.deepEqual(mercenaryLevelStateFromStorage(g.levelAfter),t.after);
  if(exact){assert.equal(Number(h.total_copies),g.copiesAfter);assert.deepEqual(current,t.after);}else assert(current.revision>=t.after.revision);
  if(t.quantity){const a=one(records.filter(a=>a.mercenary_code===t.code));assert.equal(a.acquisition_id,`${OP}:${IDS[0]}:${t.code}:1`);assert.equal(String(a.user_id),IDS[0]);assert.equal(Number(a.is_duplicate),0);assert.equal(Number(a.total_copies_after),1);assert.equal(Number(a.duplicate_count_after),0);assert.equal(a.created_at,r.completedAt);}else{assert.equal(records.filter(a=>a.mercenary_code===t.code).length,0);assert.deepEqual(g.holdingBefore,g.holdingAfter);}
  result.push({code:t.code,name:t.name,season:t.season,quantityGranted:g.quantity,copiesBefore:g.copiesBefore,copiesAfter:g.copiesAfter,currentCopies:Number(h.total_copies),levelBefore:t.before.level,levelAfter:t.after.level,currentLevel:current.level,breakthroughMask:current.breakthroughMask});
 }
 assert.equal((await artifacts(c)).issues.length,0);const audit=one(await q(c,'SELECT id::text,admin_id::text,action_type,target_type,after_data FROM admin_logs WHERE target_id=$1',[OP]));assert.equal(audit.id,r.auditId);assert.equal(audit.admin_id,'1');assert.equal(audit.action_type,ACTION);assert.equal(audit.target_type,'USER');const {auditId,...payload}=r;assert.deepEqual(parse(audit.after_data),payload);
 if(exact)assert.equal(hash(protectedState(s)),r.protectedBeforeHash);
 return {status:'VERIFIED',userId:IDS[0],nickname:PLAN.target.nickname,grants:result,totalGranted:records.length,auditId:r.auditId,completedAt:r.completedAt,stockCountersChanged:false,cost:0,materialsConsumed:0};
}
// Caller owns the SQL transaction and both production account locks.
export async function grant(c,expected=HASH,{leaseToken,lockDeadline}={}){
 validate(expected);let saved=await receipt(c);if(saved)return {replayed:true,receipt:saved,verification:await verify(c,saved)};
 assert.match(String(leaseToken),/^[a-f0-9]{64}$/);assert(lockDeadline>Date.now()+20000,'Live account lease required');
 await q(c,'SELECT pg_advisory_xact_lock(hashtextextended($1,0))',[OP]);saved=await receipt(c);if(saved)return {replayed:true,receipt:saved,verification:await verify(c,saved)};
 const lease=async()=>{assert(lockDeadline>Date.now()+5000);one(await q(c,'SELECT user_id FROM user_mutation_locks_v1520 WHERE user_id=$1 AND token=$2 AND action_path=$3 AND lease_until_ms>$4',[IDS[0],leaseToken,OP,Date.now()+5000]));};
 one(await q(c,'SELECT user_id FROM account_sync_versions_v1 WHERE user_id=$1 FOR UPDATE',[IDS[0]]));one(await q(c,'SELECT id FROM users WHERE id=$1 FOR UPDATE',[IDS[0]]));await lease();
 await q(c,'SELECT user_id FROM user_second_verifications WHERE user_id=$1 FOR SHARE',[IDS[0]]);await q(c,'SELECT code FROM mercenary_limited_stock_v1 WHERE code=ANY($1::text[]) ORDER BY code FOR SHARE',[CODES]);await q(c,'SELECT key FROM app_meta WHERE key=ANY($1::text[]) ORDER BY key FOR SHARE',[SETTINGS]);
 await q(c,'SELECT user_id FROM user_mercenary_cards_v1 WHERE user_id=$1 ORDER BY mercenary_code FOR UPDATE',[IDS[0]]);await q(c,'SELECT user_id FROM user_mercenary_levels_v1 WHERE user_id=$1 AND mercenary_code=ANY($2::text[]) ORDER BY mercenary_code FOR UPDATE',[IDS[0],CODES]);
 const before=await snapshot(c),u=one(before.users);for(const k of ['id','nickname','role','status','identityHash'])assert.equal(u[k],PLAN.target[k],`Recipient ${k} changed`);
 assert.equal(one(await q(c,'SELECT id::text FROM users WHERE nickname=$1',[PLAN.target.nickname])).id,IDS[0]);one(await q(c,"SELECT id FROM users WHERE id=1 AND role='OWNER' AND status='ACTIVE'"));const prior=await artifacts(c);assert.equal(prior.receipt,null);for(const key of ['audit','acquisitions','issues'])assert.equal(prior[key].length,0,'Orphan operation artifact');
 const policy=validateMercenaryLevelPolicy(parse(one(before.settings.filter(x=>x.key===MERCENARY_LEVEL_KEY)).value));assert.equal(policy.mode,'ON');assert(mercenaryLevelReadiness(policy,{requireGrowth:true}).ready);
 for(const t of PLAN.targets){const card=before.cards.find(x=>x.mercenary_code===t.code)||null,row=before.levels.find(x=>x.mercenary_code===t.code)||null,d=decide(card,row);assert.equal(!!card,!!t.expectedCard,'Holding changed since inspection');assert.equal(!!row,!!t.expectedLevelRow,'Growth changed since inspection');for(const k of ['copiesBefore','quantity','before','after'])assert.deepEqual(d[k],t[k],'Account changed since inspection');assert(levelProgress(policy,d.after,t).complete);}
 const now=new Date().toISOString(),grants=[];
 for(const t of PLAN.targets){
  const old=before.cards.find(x=>x.mercenary_code===t.code)||null,row=before.levels.find(x=>x.mercenary_code===t.code)||null;
  if(t.quantity){
   if(old)one(await q(c,'UPDATE user_mercenary_cards_v1 SET total_copies=1,duplicate_count=0,last_obtained_at=$3 WHERE user_id=$1 AND mercenary_code=$2 AND total_copies=0 RETURNING user_id',[IDS[0],t.code,now]));
   else one(await q(c,'INSERT INTO user_mercenary_cards_v1(user_id,mercenary_code,total_copies,duplicate_count,first_obtained_at,last_obtained_at) VALUES($1,$2,1,0,$3,$3) RETURNING user_id',[IDS[0],t.code,now]));
   one(await q(c,'INSERT INTO mercenary_card_acquisitions_v1(acquisition_id,user_id,mercenary_code,is_duplicate,total_copies_after,duplicate_count_after,created_at) VALUES($1,$2,$3,0,1,0,$4) RETURNING acquisition_id',[`${OP}:${IDS[0]}:${t.code}:1`,IDS[0],t.code,now]));
  }
  if(t.before.level!==21){
   const args=[IDS[0],t.code,t.storedLevel,t.after.experience,t.after.breakthroughMask,t.after.revision,now];
   if(row)one(await q(c,'UPDATE user_mercenary_levels_v1 SET level=$3,experience=$4,breakthrough_mask=$5,revision=$6,updated_at=$7 WHERE user_id=$1 AND mercenary_code=$2 AND revision=$8 AND level=$9 AND experience=$10 AND breakthrough_mask=$11 RETURNING user_id',[...args,t.before.revision,mercenaryLevelStorageLevel(t.before),t.before.experience,t.before.breakthroughMask]));
   else one(await q(c,'INSERT INTO user_mercenary_levels_v1(user_id,mercenary_code,level,experience,breakthrough_mask,revision,updated_at) VALUES($1,$2,$3,$4,$5,$6,$7) RETURNING user_id',args));
  }
  grants.push({code:t.code,name:t.name,quantity:t.quantity,copiesBefore:t.copiesBefore,copiesAfter:t.copiesBefore+t.quantity,holdingBefore:old,levelBefore:row});
 }
 const granted=PLAN.targets.reduce((n,t)=>n+t.quantity,0),leveled=PLAN.targets.filter(t=>t.before.level!==21).length;
 if(granted||leveled)one(await q(c,"UPDATE account_sync_versions_v1 SET revision=revision+1,domains=domains||jsonb_build_object('collection',(revision+1)::text,'loadout',(revision+1)::text),updated_at=clock_timestamp() WHERE user_id=$1 RETURNING user_id",[IDS[0]]));
 const after=await snapshot(c);assert.deepEqual(protectedState(after),protectedState(before),'Protected state changed');
 for(const g of grants){g.holdingAfter=one(after.cards.filter(x=>x.mercenary_code===g.code));g.levelAfter=one(after.levels.filter(x=>x.mercenary_code===g.code));const t=one(PLAN.targets.filter(t=>t.code===g.code));assert.equal(Number(g.holdingAfter.total_copies),g.copiesAfter);assert.deepEqual(mercenaryLevelStateFromStorage(g.levelAfter),t.after);if(!g.quantity)assert.deepEqual(g.holdingBefore,g.holdingAfter);if(t.before.level===21)assert.deepEqual(g.levelBefore,g.levelAfter);}
 assert.equal(BigInt(one(after.sync).revision),BigInt(one(before.sync).revision)+BigInt(granted+(granted||leveled?1:0)));for(const k of Object.keys(one(before.sync).domains))if(!['collection','loadout'].includes(k))assert.equal(one(after.sync).domains[k],one(before.sync).domains[k]);
 if(before.ranked.length)assert.equal(BigInt(one(after.ranked).source_version),BigInt(one(before.ranked).source_version)+BigInt(granted+leveled));else assert.deepEqual(after.ranked,before.ranked);
 const r={status:'COMPLETED',actor:'CODEX_OPERATIONS',operationKey:OP,planHash:HASH,plan:PLAN,completedAt:now,grants,policyRevision:policy.revision,syncBefore:before.sync,syncAfter:after.sync,rankedBefore:before.ranked,rankedAfter:after.ranked,stockBefore:before.stock,stockAfter:after.stock,issuesBefore:before.issues,issuesAfter:after.issues,protectedBeforeHash:hash(protectedState(before)),protectedAfterHash:hash(protectedState(after))};
 r.auditId=one(await q(c,"INSERT INTO admin_logs(admin_id,action_type,target_type,target_id,before_data,after_data) VALUES(1,$1,'USER',$2,$3,$4) RETURNING id::text",[ACTION,OP,JSON.stringify({grants:grants.map(({code,holdingBefore,levelBefore})=>({code,holdingBefore,levelBefore})),protectedHash:r.protectedBeforeHash}),JSON.stringify(r)])).id;
 one(await q(c,'INSERT INTO app_meta(key,value,updated_at) VALUES($1,$2,$3) RETURNING key',[OP,JSON.stringify(r),now]));await lease();return {replayed:false,receipt:r,verification:await verify(c,r,{exact:true})};
}
