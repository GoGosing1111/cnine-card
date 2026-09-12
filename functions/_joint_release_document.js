import {V3_JOINT_RELEASE_ENABLED,V3_JOINT_RELEASE_VERSION,V3_JOINT_COMPONENTS} from '../shared/v3-joint-release-v1.mjs';
import {jointError} from './_joint_request.js';
import {jointHash} from './_joint_transactions.js';
export const JOINT_RELEASE_DOCUMENT_KEY=`v3_joint_release_${V3_JOINT_RELEASE_VERSION}`;
export const JOINT_APPROVALS=Object.freeze(['economy','mercenaryRanksAndStats','userSkillAssignments','skillVisualsAndSound','equipmentProtectionAndRecovery','desktopMobile','jointActivation']);
export function validateJointReleaseDocument(raw){
 const fail=()=>{throw jointError('JOINT_RELEASE_PENDING','공동 출시 승인본을 확인하세요.',423);};
 if(raw?.version!==V3_JOINT_RELEASE_VERSION||raw.approved!==true||!Number.isSafeInteger(raw.approvedBy)||raw.approvedBy<1||!Number.isFinite(Date.parse(raw.approvedAt))||typeof raw.approvalReference!=='string'||raw.approvalReference.trim().length<20)fail();
 if(JOINT_APPROVALS.some(key=>raw.approvals?.[key]!==true)||V3_JOINT_COMPONENTS.some(key=>!raw.components?.[key]))fail();
 return structuredClone(raw);
}
// Immutable, versioned release document. Editing CMS drafts never changes a
// running season. No request flag, environment override or draft can approve it.
export async function readJointReleaseComponent(env,component,{enabled=V3_JOINT_RELEASE_ENABLED}={}){
 if(!enabled)return null;
 if(!V3_JOINT_COMPONENTS.includes(component))throw jointError('JOINT_RELEASE_COMPONENT','공동 출시 구성을 확인하세요.',503);
 const row=await env.DB.prepare('SELECT value FROM app_meta WHERE key=?').bind(JOINT_RELEASE_DOCUMENT_KEY).first();
 if(!row)throw jointError('JOINT_RELEASE_PENDING','공동 출시 승인본을 준비 중입니다.',423);
 let envelope;try{envelope=JSON.parse(row.value);}catch{throw jointError('JOINT_RELEASE_DOCUMENT','공동 출시 승인본을 읽을 수 없습니다.',503);}
 if(envelope.sha256!==await jointHash(envelope.document))throw jointError('JOINT_RELEASE_DOCUMENT','공동 출시 승인본 해시가 다릅니다.',503);
 return validateJointReleaseDocument(envelope.document).components[component];
}
