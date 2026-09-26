import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {MERCENARY_CMS_SEED as seed} from '../../functions/_mercenary_cms_seed.js';
import {expandMercenarySkillCatalog,validateMercenaryCms} from '../../shared/mercenary-cms-model-v1.mjs';
import {validateMercenaryDraw,mercenaryGradePools,mercenaryCardChances} from '../../shared/mercenary-draw-policy-v1.mjs';
import {NURSE_CODES,NURSE_NAMES,NURSE_SKILL_ID,NURSE_BALANCE,nurseSelectionWeights} from '../../shared/mercenary-nurse-healers-v1.mjs';
export const OPERATION_KEY='ops:nurse-healers-release:20260927:v1';
export const CMS_REQUEST='nurse-healers-release-20260927-cms-v1',DRAW_REQUEST='nurse-healers-release-20260927-draw-v1';
const parse=x=>typeof x==='string'?JSON.parse(x):x,sha=x=>createHash('sha256').update(x).digest('hex');
export function planNurseRelease(rawConfig,rawDraw){
 const before=parse(rawConfig),drawBefore=validateMercenaryDraw(parse(rawDraw));
 assert.ok(!before.mercenaries.some(c=>NURSE_CODES.includes(c.code)),'Nurses already persisted: inspect before changing');
 const document=validateMercenaryCms(expandMercenarySkillCatalog(before,seed.document,seed.catalog),seed.catalog);
 for(const key of ['mercenaries','skills','assignments']){const id=key==='skills'?'id':'code';for(const row of before[key])assert.deepEqual(document[key].find(r=>r[id]===row[id]),row,'Existing CMS data changed');}
 assert.deepEqual(document.settings,before.settings);
 for(const [i,code] of NURSE_CODES.entries()){
  const c=document.mercenaries.find(c=>c.code===code);assert.equal(c.name,NURSE_NAMES[i]);assert.equal(c.rank,'SS');assert.equal(c.role,'SUPPORT');
  assert.deepEqual(document.assignments.find(a=>a.code===code).skillIds,[NURSE_SKILL_ID]);
 }
 assert.deepEqual(document.skills.find(s=>s.id===NURSE_SKILL_ID).balance,NURSE_BALANCE);
 const ss=mercenaryGradePools(document.mercenaries,seed.catalog.cards.map(c=>c.code)).SS,weights=nurseSelectionWeights(ss,drawBefore.cardRules.cardWeights);
 assert.ok(NURSE_CODES.every(c=>Number.isSafeInteger(weights[c])),'Prior SS policy differs from the reviewed operating policy');
 const policy=validateMercenaryDraw({...drawBefore,notes:drawBefore.notes+' 2026-09-27 사용자 후속 지시: 간호사 4종 각각 동일 가중치 3. 기존 용병 가중치 및 등급 확률 유지.',cardRules:{...drawBefore.cardRules,cardWeights:weights}},{catalogCodes:seed.catalog.cards.map(c=>c.code)});
 assert.deepEqual(policy.outcomes,drawBefore.outcomes);
 for(const [code,weight] of Object.entries(drawBefore.cardRules.cardWeights))assert.equal(policy.cardRules.cardWeights[code],weight);
 const chances=mercenaryCardChances(policy.outcomes.find(o=>o.id==='CARD_SS').chancePpm,ss,policy.cardRules);
 assert.ok(NURSE_CODES.every(c=>policy.cardRules.cardWeights[c]===3));
 return {document,policy,chances};
}
// Caller owns one PostgreSQL transaction; no schema, flags or account data changes.
export async function applyNurseRelease(q,{expectedCmsRevision,expectedDrawRevision}){
 const [prior]=await q('SELECT value FROM app_meta WHERE key=$1',[OPERATION_KEY]);
 if(prior){const receipt=parse(prior.value);assert.equal(receipt.status,'COMPLETED');assert.equal(receipt.operationKey,OPERATION_KEY);
  const audits=await q('SELECT request_id FROM mercenary_cms_audit_v1 WHERE request_id=$1 UNION ALL SELECT request_id FROM mercenary_draw_audit_v1 WHERE request_id=$2',[CMS_REQUEST,DRAW_REQUEST]);assert.equal(audits.length,2);return {...receipt,replayed:true};}
 const [owner]=await q("SELECT id FROM users WHERE id=1 AND role='OWNER' AND status='ACTIVE'");assert.ok(owner,'Authorized operator missing');
 const [cms]=await q("SELECT * FROM mercenary_cms_documents_v1 WHERE doc_key='config' FOR UPDATE"),[draw]=await q('SELECT * FROM mercenary_draw_config_v1 WHERE id=1 FOR UPDATE');
 assert.equal(Number(cms.revision),expectedCmsRevision,'CMS revision changed');assert.equal(Number(draw.revision),expectedDrawRevision,'Draw revision changed');
 const planned=planNurseRelease(cms.payload_json,draw.payload_json),document=JSON.stringify(planned.document),policy=JSON.stringify(planned.policy),now=new Date().toISOString();
 const reason='사용자 배포 승인: 간호사 4명 SS 힐러, 각각 동일 가중치3. 공통 백의의 맹세 총 공격력320% 분배·4턴·자원25. 기존 등급 확률·용병 가중치 유지';
 const savedCms=await q("UPDATE mercenary_cms_documents_v1 SET payload_json=$1,revision=revision+1,last_request_id=$2,updated_by=1,updated_at=$3 WHERE doc_key='config' AND revision=$4 RETURNING revision",[document,CMS_REQUEST,now,expectedCmsRevision]);assert.equal(savedCms.length,1);
 await q('INSERT INTO mercenary_cms_audit_v1(request_id,actor_id,payload_hash,revision,action,created_at) VALUES($1,1,$2,$3,$4,$5)',[CMS_REQUEST,sha('1:'+expectedCmsRevision+':'+document),Number(savedCms[0].revision),'SAVE',now]);
 const savedDraw=await q('UPDATE mercenary_draw_config_v1 SET payload_json=$1,revision=revision+1,last_request_id=$2,updated_by=1,updated_at=$3 WHERE id=1 AND revision=$4 RETURNING revision',[policy,DRAW_REQUEST,now,expectedDrawRevision]);assert.equal(savedDraw.length,1);
 await q('INSERT INTO mercenary_draw_audit_v1(request_id,actor_id,payload_hash,revision,reason,before_json,after_json,created_at) VALUES($1,1,$2,$3,$4,$5,$6,$7)',[DRAW_REQUEST,sha('1:'+expectedDrawRevision+':'+reason+':'+policy),Number(savedDraw[0].revision),reason,draw.payload_json,policy,now]);
 const receipt={status:'COMPLETED',operationKey:OPERATION_KEY,codes:NURSE_CODES,names:NURSE_NAMES,rank:'SS',skillId:NURSE_SKILL_ID,balance:NURSE_BALANCE,cmsRevision:Number(savedCms[0].revision),drawRevision:Number(savedDraw[0].revision),chances:planned.chances.filter(c=>NURSE_CODES.includes(c.code)||c.code==='V-050'),completedAt:now};
 const audit=await q('INSERT INTO admin_logs(admin_id,action_type,target_type,target_id,before_data,after_data) VALUES(1,$1,$2,$3,$4,$5) RETURNING id',['MERCENARY_RELEASE','MERCENARY',NURSE_CODES.join(','),JSON.stringify({cmsRevision:Number(cms.revision),drawRevision:Number(draw.revision)}),JSON.stringify(receipt)]);assert.equal(audit.length,1);receipt.adminAuditId=Number(audit[0].id);
 await q('INSERT INTO app_meta(key,value) VALUES($1,$2)',[OPERATION_KEY,JSON.stringify(receipt)]);return {...receipt,replayed:false};
}
