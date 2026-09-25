import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {MERCENARY_CMS_SEED as seed} from '../../functions/_mercenary_cms_seed.js';
import {expandMercenarySkillCatalog,validateMercenaryCms} from '../../shared/mercenary-cms-model-v1.mjs';
import {validateMercenaryDraw,mercenaryGradePools,mercenaryCardChances} from '../../shared/mercenary-draw-policy-v1.mjs';
import {sniperOrikkungSelectionWeights,SNIPER_ORIKKUNG_BALANCE} from '../../shared/mercenary-sniper-orikkung-v1.mjs';
export const OPERATION_KEY='ops:sniper-orikkung-release:20260926:v1';
export const CMS_REQUEST='sniper-orikkung-release-20260926-cms-v1',DRAW_REQUEST='sniper-orikkung-release-20260926-draw-v1';
const parse=x=>typeof x==='string'?JSON.parse(x):x,sha=x=>createHash('sha256').update(x).digest('hex');
export function planSniperOrikkungRelease(rawConfig,rawDraw){
 const before=parse(rawConfig),drawBefore=validateMercenaryDraw(parse(rawDraw));
 assert.ok(!before.mercenaries.some(c=>c.code==='V-050'),'New code already persisted: inspect before changing');
 const document=validateMercenaryCms(expandMercenarySkillCatalog(before,seed.document,seed.catalog),seed.catalog);
 for(const key of ['mercenaries','skills','assignments']){
  const id=key==='skills'?'id':'code';for(const row of before[key])assert.deepEqual(document[key].find(r=>r[id]===row[id]),row,'Existing CMS data changed');
 }
 assert.deepEqual(document.settings,before.settings);
 const card=document.mercenaries.find(c=>c.code==='V-050');assert.equal(card.name,'저격 오리꿍');assert.equal(card.rank,'SS');
 assert.deepEqual(document.skills.find(s=>s.id==='MS-050').balance,SNIPER_ORIKKUNG_BALANCE);
 const ss=mercenaryGradePools(document.mercenaries,seed.catalog.cards.map(c=>c.code)).SS;
 const policy=validateMercenaryDraw({...drawBefore,notes:drawBefore.notes+' 2026-09-26 저격 오리꿍 SS 출시: SS 내 1%, 다른 SS 상대 가중치 보존. 전체 SS 등급·재화 확률과 개봉 조건 유지.',cardRules:{...drawBefore.cardRules,cardWeights:sniperOrikkungSelectionWeights(ss,drawBefore.cardRules.cardWeights)}},{catalogCodes:seed.catalog.cards.map(c=>c.code)});
 assert.deepEqual(policy.outcomes,drawBefore.outcomes);
 const chances=mercenaryCardChances(policy.outcomes.find(o=>o.id==='CARD_SS').chancePpm,ss,policy.cardRules),odds=chances.find(c=>c.code==='V-050');
 assert.ok(Math.abs(odds.withinRankPercent-1)<1e-12);
 for(const [code,weight]of Object.entries(drawBefore.cardRules.cardWeights))if(!ss.includes(code))assert.equal(policy.cardRules.cardWeights[code],weight);
 return {document,policy,chances,odds};
}
// Caller owns a single PostgreSQL transaction. No schema/flags/account data are mutated.
export async function applySniperOrikkungRelease(q,{expectedCmsRevision,expectedDrawRevision}){
 const [prior]=await q('SELECT value FROM app_meta WHERE key=$1',[OPERATION_KEY]);
 if(prior){const receipt=parse(prior.value);assert.equal(receipt.status,'COMPLETED');assert.equal(receipt.operationKey,OPERATION_KEY);
  const audits=await q('SELECT request_id FROM mercenary_cms_audit_v1 WHERE request_id=$1 UNION ALL SELECT request_id FROM mercenary_draw_audit_v1 WHERE request_id=$2',[CMS_REQUEST,DRAW_REQUEST]);assert.equal(audits.length,2);return {...receipt,replayed:true};}
 const [owner]=await q("SELECT id FROM users WHERE id=1 AND role='OWNER' AND status='ACTIVE'");assert.ok(owner,'Authorized operator missing');
 const [cms]=await q("SELECT * FROM mercenary_cms_documents_v1 WHERE doc_key='config' FOR UPDATE"),[draw]=await q('SELECT * FROM mercenary_draw_config_v1 WHERE id=1 FOR UPDATE');
 assert.equal(Number(cms.revision),expectedCmsRevision,'CMS revision changed');assert.equal(Number(draw.revision),expectedDrawRevision,'Draw revision changed');
 const planned=planSniperOrikkungRelease(cms.payload_json,draw.payload_json),document=JSON.stringify(planned.document),policy=JSON.stringify(planned.policy),now=new Date().toISOString();
 const reason='사용자 승인: 저격 오리꿍 SS 원거리 최상위 출시, SS 내 1% 희귀 추첨 및 전용 스킬·SD 적용';
 const savedCms=await q("UPDATE mercenary_cms_documents_v1 SET payload_json=$1,revision=revision+1,last_request_id=$2,updated_by=1,updated_at=$3 WHERE doc_key='config' AND revision=$4 RETURNING revision",[document,CMS_REQUEST,now,expectedCmsRevision]);assert.equal(savedCms.length,1);
 await q('INSERT INTO mercenary_cms_audit_v1(request_id,actor_id,payload_hash,revision,action,created_at) VALUES($1,1,$2,$3,$4,$5)',[CMS_REQUEST,sha('1:'+expectedCmsRevision+':'+document),Number(savedCms[0].revision),'SAVE',now]);
 const savedDraw=await q('UPDATE mercenary_draw_config_v1 SET payload_json=$1,revision=revision+1,last_request_id=$2,updated_by=1,updated_at=$3 WHERE id=1 AND revision=$4 RETURNING revision',[policy,DRAW_REQUEST,now,expectedDrawRevision]);assert.equal(savedDraw.length,1);
 await q('INSERT INTO mercenary_draw_audit_v1(request_id,actor_id,payload_hash,revision,reason,before_json,after_json,created_at) VALUES($1,1,$2,$3,$4,$5,$6,$7)',[DRAW_REQUEST,sha('1:'+expectedDrawRevision+':'+reason+':'+policy),Number(savedDraw[0].revision),reason,draw.payload_json,policy,now]);
 const receipt={status:'COMPLETED',operationKey:OPERATION_KEY,code:'V-050',name:'저격 오리꿍',rank:'SS',skillId:'MS-050',balance:SNIPER_ORIKKUNG_BALANCE,cmsRevision:Number(savedCms[0].revision),drawRevision:Number(savedDraw[0].revision),withinSsPercent:planned.odds.withinRankPercent,overallPercent:planned.odds.percent,weights:planned.policy.cardRules.cardWeights,completedAt:now};
 const audit=await q('INSERT INTO admin_logs(admin_id,action_type,target_type,target_id,before_data,after_data) VALUES(1,$1,$2,$3,$4,$5) RETURNING id',['MERCENARY_RELEASE','MERCENARY','V-050',JSON.stringify({cmsRevision:Number(cms.revision),drawRevision:Number(draw.revision)}),JSON.stringify(receipt)]);
 assert.equal(audit.length,1);receipt.adminAuditId=Number(audit[0].id);
 await q('INSERT INTO app_meta(key,value) VALUES($1,$2)',[OPERATION_KEY,JSON.stringify(receipt)]);
 return {...receipt,replayed:false};
}
