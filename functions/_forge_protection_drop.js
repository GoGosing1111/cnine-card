import {readReleasedForgePolicy} from './_equipment_forge_release.js';
import {mercenaryRandomInt} from './_mercenary_draw_accounting.js';
import {FORGE_PROTECTION_SOURCES} from '../shared/equipment-forge-policy-v1.mjs';
import {jointError} from './_joint_request.js';
import {EQUIPMENT_FORGE_RELEASE_ENABLED} from '../shared/equipment-forge-release-v1.mjs';
import {readForgeSettings} from './_equipment_forge_public.js';
export async function readActiveForgeProtectionPolicy(env){
 const policy=await readReleasedForgePolicy(env);if(!policy)return null;
 if(EQUIPMENT_FORGE_RELEASE_ENABLED){const {settings}=await readForgeSettings(env);if(!settings.publicVisible||settings.executionMode!=='ON')return null;}
 return policy;
}
export function protectionDrop(policy,sourceType,{cleared,eligible=true,randomInt=mercenaryRandomInt}={}){
 if(!cleared||!eligible||!FORGE_PROTECTION_SOURCES.includes(sourceType))return [];
 const rule=policy?.protection?.sources?.find(r=>r.content===sourceType&&r.enabled);if(!rule)return [];
 const roll=randomInt(1000000);if(!Number.isInteger(roll)||roll<0||roll>=1000000)throw Error('INVALID_PROTECTION_RANDOM');if(roll>=rule.chancePpm)return [];
 return [{rewardType:'INVENTORY_ITEM',rewardRef:policy.protection.itemCode,rewardName:'장비보호권',quantity:rule.quantity,poolId:null,entryId:null,protectionAuthority:'JOINT_APPROVED_GAMEPLAY'}];
}
export async function planForgeProtectionDrop(env,sourceType,conditions){return protectionDrop(await readActiveForgeProtectionPolicy(env),sourceType,conditions);}
export function assertProtectionGrant(plan,policy){
 const code=policy?.protection?.itemCode;if(!code)return;
 for(const r of plan.rewards||[])if(r.rewardType==='INVENTORY_ITEM'&&r.rewardRef===code){
  const rule=policy.protection.sources.find(s=>s.enabled&&s.content===plan.sourceType);
  if(!rule||plan.triggerType!=='CLEAR'||r.protectionAuthority!=='JOINT_APPROVED_GAMEPLAY'||r.quantity!==rule.quantity||r.poolId!=null||r.entryId!=null)throw jointError('FORGE_PROTECTION_SOURCE','장비보호권은 승인한 게임 내 희귀 드롭으로만 획득합니다.',409);
 }
}
export async function guardForgeProtectionGrant(env,plan){assertProtectionGrant(plan,await readReleasedForgePolicy(env));}
