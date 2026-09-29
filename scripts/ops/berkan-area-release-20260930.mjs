import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {MERCENARY_CMS_SEED as seed} from '../../functions/_mercenary_cms_seed.js';
import {expandMercenarySkillCatalog,validateMercenaryCms} from '../../shared/mercenary-cms-model-v1.mjs';
import {validateMercenaryDraw,mercenaryCardChances} from '../../shared/mercenary-draw-policy-v1.mjs';
import {BERKAN_AREA_SKILL_ID} from '../../shared/mercenary-berkan-v1.mjs';

export const RELEASE_ID='berkan-area-sss-uniform-20260930-v1';
export const RELEASE_REASON='사용자 승인: 흑금 천우 PVE 연결, PVP 제외. SSS 전체 0.1%, SSS 4종 균등 추첨 및 베르칸 획득 ON.';
const sha=s=>createHash('sha256').update(s).digest('hex');
export function prepareRelease({cms,draw}){
 const document=structuredClone(expandMercenarySkillCatalog(JSON.parse(cms.payload_json),seed.document,seed.catalog));
 const assignment=document.assignments.find(a=>a.code==='V-055');
 assert.ok(assignment);if(!assignment.skillIds.includes(BERKAN_AREA_SKILL_ID))assignment.skillIds.push(BERKAN_AREA_SKILL_ID);
 const area=document.skills.find(s=>s.id===BERKAN_AREA_SKILL_ID);assert.equal(area.review,'REVIEWED');
 validateMercenaryCms(document,seed.catalog);
 const policy=validateMercenaryDraw(JSON.parse(draw.payload_json));
 const sss=policy.outcomes.find(o=>o.id==='CARD_SSS'),none=policy.outcomes.find(o=>o.id==='NONE');
 none.chancePpm+=sss.chancePpm-1000;sss.chancePpm=1000;
 const codes=document.mercenaries.filter(c=>c.rank==='SSS').map(c=>c.code).sort();
 assert.deepEqual(codes,['V-021','V-046','V-049','V-055']);
 for(const code of codes)policy.cardRules.cardWeights[code]=1;
 policy.notes+='\n2026-09-30 사용자 후속 확정(위 과거 SSS 설정 대체): SSS 전체 0.1%, 오메가-X·라그니엘·크라이베른·베르칸 균등 25%, 각 최종 0.025%. 베르칸 획득 ON. 증가분 0.095%는 꽝에서 이동.';
 validateMercenaryDraw(policy,{catalogCodes:seed.catalog.cards.map(c=>c.code)});
 const chances=mercenaryCardChances(1000,codes,policy.cardRules);
 assert.ok(chances.every(c=>c.weight===1&&c.percent===.025));
 return {document,policy,chances,cmsRevision:Number(cms.revision)+1,drawRevision:Number(draw.revision)+1};
}

// One existing PostgreSQL transaction covers both versioned settings and all
// receipts. No schema change, account balance mutation or pack opening occurs.
export async function applyRelease(db,{expectedCmsRevision,expectedDrawRevision,ownerId=1}={}){
 await db.query('BEGIN');
 try{
  await db.query("SET LOCAL lock_timeout='3s'; SET LOCAL statement_timeout='15s'; SET LOCAL TIME ZONE 'UTC'");
  const cms=(await db.query("SELECT * FROM mercenary_cms_documents_v1 WHERE doc_key='config' FOR UPDATE")).rows[0];
  const draw=(await db.query('SELECT * FROM mercenary_draw_config_v1 WHERE id=1 FOR UPDATE')).rows[0];
  const receipts=(await db.query('SELECT request_id FROM mercenary_cms_audit_v1 WHERE request_id=$1',[RELEASE_ID])).rows;
  if(receipts.length){
   const drawReceipt=(await db.query('SELECT request_id FROM mercenary_draw_audit_v1 WHERE request_id=$1',[RELEASE_ID])).rows;
   assert.equal(drawReceipt.length,1,'INCOMPLETE_RELEASE_RECEIPT');await db.query('COMMIT');return {replayed:true};
  }
  const owner=(await db.query("SELECT id FROM users WHERE id=$1 AND role='OWNER' AND status='ACTIVE'",[ownerId])).rows[0];assert.ok(owner,'OWNER_REQUIRED');
  assert.equal(Number(cms.revision),expectedCmsRevision,'CMS_REVISION_CHANGED');assert.equal(Number(draw.revision),expectedDrawRevision,'DRAW_REVISION_CHANGED');
  const opening=(await db.query("SELECT value FROM app_meta WHERE key='hyper_pack_opening_v2093' FOR SHARE")).rows[0];assert.equal(JSON.parse(opening.value).mode,'ON','OPENING_MODE_CHANGED');
  const next=prepareRelease({cms,draw}),doc=JSON.stringify(next.document),policy=JSON.stringify(next.policy),now=new Date().toISOString();
  const savedCms=await db.query("UPDATE mercenary_cms_documents_v1 SET payload_json=$1,revision=$2,last_request_id=$3,updated_by=$4,updated_at=$5 WHERE doc_key='config' AND revision=$6",[doc,next.cmsRevision,RELEASE_ID,ownerId,now,expectedCmsRevision]);assert.equal(savedCms.rowCount,1);
  const savedDraw=await db.query('UPDATE mercenary_draw_config_v1 SET payload_json=$1,revision=$2,last_request_id=$3,updated_by=$4,updated_at=$5 WHERE id=1 AND revision=$6',[policy,next.drawRevision,RELEASE_ID,ownerId,now,expectedDrawRevision]);assert.equal(savedDraw.rowCount,1);
  await db.query("INSERT INTO mercenary_cms_audit_v1(request_id,actor_id,payload_hash,revision,action,created_at) VALUES($1,$2,$3,$4,'SAVE',$5)",[RELEASE_ID,ownerId,sha(`${ownerId}:${expectedCmsRevision}:${doc}`),next.cmsRevision,now]);
  await db.query('INSERT INTO mercenary_draw_audit_v1(request_id,actor_id,payload_hash,revision,reason,before_json,after_json,created_at) VALUES($1,$2,$3,$4,$5,$6,$7,$8)',[RELEASE_ID,ownerId,sha(`${ownerId}:${expectedDrawRevision}:${RELEASE_REASON}:${policy}`),next.drawRevision,RELEASE_REASON,draw.payload_json,policy,now]);
  const audit=await db.query("INSERT INTO admin_logs(admin_id,action_type,target_type,target_id,before_data,after_data) VALUES($1,'BERKAN_AREA_SSS_RELEASE','MERCENARY_CMS',$2,$3,$4) RETURNING id",[ownerId,RELEASE_ID,JSON.stringify({cmsRevision:expectedCmsRevision,drawRevision:expectedDrawRevision,document:JSON.parse(cms.payload_json),policy:JSON.parse(draw.payload_json)}),JSON.stringify({reason:RELEASE_REASON,cmsRevision:next.cmsRevision,drawRevision:next.drawRevision,document:next.document,policy:next.policy})]);
  await db.query('COMMIT');return {replayed:false,requestId:RELEASE_ID,cmsRevision:next.cmsRevision,drawRevision:next.drawRevision,adminLogId:audit.rows[0].id,chances:next.chances,assignment:next.document.assignments.find(a=>a.code==='V-055'),opening:'ON',at:now};
 }catch(error){await db.query('ROLLBACK');throw error;}
}
