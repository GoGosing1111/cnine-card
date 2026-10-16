import {loadDuoProfiles,duoVersions} from './_ranked_duo_profiles.js';
import {ORGANIZATION_LIMITS,orgAssert} from '../shared/organization-system-v1.mjs';
import {readForgeAdvancedPolicy} from './_equipment_forge_advanced.js';
import {FORGE_ADVANCED_KEY} from '../shared/equipment-forge-advanced-v1.mjs';

// Reuse the existing account potential rating: owned cards, enhanced equipment,
// vehicles, titles and mercenaries. Enrollment is not a fixed battle loadout.
// The existing duo schema/version triggers must already have been installed.
export async function loadOrganizationRatings(env,userIds,deps,{now=Date.now()}={}){
  orgAssert(userIds.length>0&&userIds.length<=ORGANIZATION_LIMITS.ratingBatch,'RATING_BATCH','전력 평가는 한 번에 최대 12명입니다.');
  await env.DB.batch(userIds.map(id=>env.DB.prepare('INSERT INTO ranked_duo_accounts_v1(user_id) VALUES(?) ON CONFLICT(user_id) DO NOTHING').bind(id)));
  const before=await readForgeAdvancedPolicy(env.DB);
  // A nearly expired duo cache cannot serve as a new, reviewable assignment
  // snapshot. Rebuild it; never extend a cached title/equipment expiry.
  const profiles=await loadDuoProfiles(env,userIds,{mercenaryWeights:{}},deps,{now,allowOwner:true,minimumValidityMs:299000});
  const after=await readForgeAdvancedPolicy(env.DB);
  orgAssert(before.revision===after.revision,'RATING_CHANGED','강화 설정이 변경되었습니다. 전력을 다시 평가하세요.');
  return profiles.map(p=>({userId:p.userId,power:p.power,sourceVersion:p.sourceVersion,policyRevision:p.policyRevision,advancedForgeRevision:after.revision,expiresAt:Date.parse(p.expiresAt),breakdown:p.breakdown,source:'ACCOUNT_POTENTIAL_V1'}));
}
export async function validateOrganizationRatings(env,ratings,{now=Date.now()}={}){
  orgAssert(ratings.length>0&&ratings.length<=150,'RATING_BATCH','전력 평가 범위를 확인하세요.');
  const rows=await duoVersions(env,ratings.map(r=>r.userId));
  const advanced=await readForgeAdvancedPolicy(env.DB);
  return ratings.every(r=>r.expiresAt>now&&r.advancedForgeRevision===advanced.revision&&rows.some(v=>Number(v.user_id)===r.userId&&v.status==='ACTIVE'&&(!v.banned_until||Date.parse(v.banned_until)<=now)&&Number(v.source_version)===r.sourceVersion&&Number(v.policy_revision)===r.policyRevision));
}
export async function staleOrganizationRatingIds(q,ratings,{now=Date.now(),minimumValidityMs=0,lock=false}={}){
  if(!ratings.length)return [];
  const [advanced]=await q('SELECT value FROM app_meta WHERE key=$1'+(lock?' FOR SHARE':''),[FORGE_ADVANCED_KEY]);
  const advancedForgeRevision=advanced?JSON.parse(advanced.value).revision:0;
  const rows=await q(`SELECT a.user_id,a.source_version,v.revision AS policy_revision,u.status,u.role,u.banned_until FROM ranked_duo_accounts_v1 a JOIN users u ON u.id=a.user_id CROSS JOIN ranked_duo_policy_version_v1 v WHERE v.id=1 AND a.user_id=ANY($1::bigint[]) ORDER BY a.user_id${lock?' FOR SHARE OF a,u,v':''}`,[ratings.map(r=>r.userId)]);
  return ratings.filter(r=>!(r.expiresAt>now+minimumValidityMs&&r.advancedForgeRevision===advancedForgeRevision&&rows.some(v=>Number(v.user_id)===r.userId&&v.status==='ACTIVE'&&(!v.banned_until||Date.parse(v.banned_until)<=now)&&Number(v.source_version)===r.sourceVersion&&Number(v.policy_revision)===r.policyRevision))).map(r=>r.userId);
}
export async function validateOrganizationRatingsLocked(q,ratings,{now=Date.now()}={}){
  return (await staleOrganizationRatingIds(q,ratings,{now,lock:true})).length===0;
}
