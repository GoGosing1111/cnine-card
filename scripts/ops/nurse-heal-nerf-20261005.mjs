import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {NURSE_CODES,NURSE_SKILL_ID,NURSE_MECHANIC,NURSE_BALANCE,NURSE_HEAL_POLICY,nurseSkillText} from '../../shared/mercenary-nurse-healers-v1.mjs';
export const OPERATION_KEY='ops:nurse-heal-nerf:20261005:v1';
export const CMS_REQUEST='nurse-heal-nerf-20261005-cms-v1';
export const PREVIOUS_BALANCE=Object.freeze({damageRatio:3.2,cooldownTurns:4,cost:25});
const parse=x=>typeof x==='string'?JSON.parse(x):x;
export function planNurseHealNerf(raw){
 const before=parse(raw),document=structuredClone(before),index=document.skills.findIndex(s=>s.id===NURSE_SKILL_ID);
 assert.ok(index>=0,'Nurse skill missing');
 const skill=document.skills[index];assert.equal(skill.mechanic,NURSE_MECHANIC);
 assert.deepEqual(skill.balance,PREVIOUS_BALANCE,'Nurse balance changed: inspect before applying');
 for(const code of NURSE_CODES)assert.deepEqual(document.assignments.find(a=>a.code===code)?.skillIds,[NURSE_SKILL_ID]);
 document.skills[index]=nurseSkillText({...skill,balance:{...NURSE_BALANCE}});
 return {document,beforeSkill:before.skills[index],afterSkill:document.skills[index]};
}
// Caller supplies one PostgreSQL transaction. Update only the shared skill;
// retain acquisition, combat snapshots, accounts and every other CMS field.
export async function applyNurseHealNerf(q,{expectedCmsRevision}){
 await q('SELECT pg_advisory_xact_lock(hashtext($1))',[OPERATION_KEY]);
 const [prior]=await q('SELECT value FROM app_meta WHERE key=$1',[OPERATION_KEY]);
 if(prior){const receipt=parse(prior.value);assert.equal(receipt.status,'COMPLETED');assert.equal(receipt.operationKey,OPERATION_KEY);
  const audits=await q('SELECT request_id FROM mercenary_cms_audit_v1 WHERE request_id=$1',[CMS_REQUEST]);assert.equal(audits.length,1);return {...receipt,replayed:true};}
 const [owner]=await q("SELECT id FROM users WHERE id=1 AND role='OWNER' AND status='ACTIVE'");assert.ok(owner,'Authorized operator missing');
 const [cms]=await q("SELECT * FROM mercenary_cms_documents_v1 WHERE doc_key='config' FOR UPDATE");
 assert.equal(Number(cms?.revision),expectedCmsRevision,'CMS revision changed');
 const planned=planNurseHealNerf(cms.payload_json),payload=JSON.stringify(planned.document),now=new Date().toISOString();
 const saved=await q("UPDATE mercenary_cms_documents_v1 SET payload_json=$1,revision=revision+1,last_request_id=$2,updated_by=1,updated_at=$3 WHERE doc_key='config' AND revision=$4 RETURNING revision",[payload,CMS_REQUEST,now,expectedCmsRevision]);assert.equal(saved.length,1);
 const hash=createHash('sha256').update('1:'+expectedCmsRevision+':'+payload).digest('hex');
 await q('INSERT INTO mercenary_cms_audit_v1(request_id,actor_id,payload_hash,revision,action,created_at) VALUES($1,1,$2,$3,$4,$5)',[CMS_REQUEST,hash,Number(saved[0].revision),'SAVE',now]);
 const receipt={status:'COMPLETED',operationKey:OPERATION_KEY,codes:NURSE_CODES,skillId:NURSE_SKILL_ID,before:planned.beforeSkill,after:planned.afterSkill,healingPolicy:NURSE_HEAL_POLICY,cmsRevision:Number(saved[0].revision),completedAt:now,
  reason:'사용자 요청: 격전지 간호사 과도한 회복 너프. 총 공격력320%→160%, 재사용4→6턴, 신규 전투 대상별 최대HP15% 상한. 자원25 및 기타 정책 유지.'};
 const audit=await q('INSERT INTO admin_logs(admin_id,action_type,target_type,target_id,before_data,after_data) VALUES(1,$1,$2,$3,$4,$5) RETURNING id',['MERCENARY_BALANCE','MERCENARY_SKILL',NURSE_SKILL_ID,JSON.stringify({cmsRevision:expectedCmsRevision,skill:planned.beforeSkill}),JSON.stringify(receipt)]);assert.equal(audit.length,1);receipt.adminAuditId=Number(audit[0].id);
 await q('INSERT INTO app_meta(key,value) VALUES($1,$2)',[OPERATION_KEY,JSON.stringify(receipt)]);
 return {...receipt,replayed:false};
}
