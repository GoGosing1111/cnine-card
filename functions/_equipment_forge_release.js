import {EQUIPMENT_FORGE_RELEASE_ENABLED,EQUIPMENT_FORGE_RELEASE_KEY,EQUIPMENT_FORGE_RELEASE_PROTECTION_CODE} from '../shared/equipment-forge-release-v1.mjs';
import {validateForgePolicy} from '../shared/equipment-forge-policy-v1.mjs';
import {forgePolicyReadiness} from '../shared/equipment-forge-cms-v1.mjs';
import {readJointReleaseComponent} from './_joint_release_document.js';
import {jointHash} from './_joint_transactions.js';
import {jointError} from './_joint_request.js';

export function validateEquipmentForgeRelease(document){
 if(document?.schemaVersion!==1||document.approved!==true||!Number.isSafeInteger(document.approvedBy)||document.approvedBy<1||!Number.isFinite(Date.parse(document.approvedAt))||typeof document.approvalReference!=='string'||document.approvalReference.trim().length<20)
  throw jointError('FORGE_RELEASE_PENDING','장비 강화 최종 출시 승인이 필요합니다.',423);
 const policy=validateForgePolicy(document.policy);
 if(policy.mode!=='OFF'||!forgePolicyReadiness(policy).ready||policy.protection.itemCode!==EQUIPMENT_FORGE_RELEASE_PROTECTION_CODE)throw jointError('FORGE_RELEASE_PENDING','단계별 확률·보호·복구 설정을 모두 확정해야 합니다.',423);
 return policy;
}
// No HTTP/body/environment switch can bypass the checked-in release hold.
// A saved CMS draft is never a release document and never updates a live quote.
export async function readReleasedForgePolicy(env,{enabled=EQUIPMENT_FORGE_RELEASE_ENABLED}={}){
 if(!enabled)return readJointReleaseComponent(env,'EQUIPMENT_FORGE');
 const row=await env.DB.prepare('SELECT value FROM app_meta WHERE key=?').bind(EQUIPMENT_FORGE_RELEASE_KEY).first();
 if(!row)throw jointError('FORGE_RELEASE_PENDING','검증된 장비 강화 출시 설정을 준비 중입니다.',423);
 let envelope;try{envelope=JSON.parse(row.value);}catch{throw jointError('FORGE_RELEASE_DOCUMENT','장비 강화 출시 설정을 읽을 수 없습니다.',503);}
 if(!envelope.document||envelope.sha256!==await jointHash(envelope.document))throw jointError('FORGE_RELEASE_DOCUMENT','장비 강화 출시 설정 해시가 다릅니다.',503);
 return validateEquipmentForgeRelease(envelope.document);
}
