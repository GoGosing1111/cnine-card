import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
import plan from './plan.json' with {type:'json'};
import {connect,safe,hash} from '../rap-contest-rewards-20261027/preflight.mjs';
import {inspect} from './grant.mjs';
import {readPetCollection} from '../../output/revan-live-20261027/release-checkout/functions/_pet_account.js';
import {petCatalogFrom} from '../../output/revan-live-20261027/release-checkout/functions/_pet_equipment.js';
const read=async n=>JSON.parse(await fs.readFile(new URL('evidence/'+n+'.json',import.meta.url),'utf8'));
const applied=await read('apply'),dry=await read('dry-run'),verified=await read('verify');
assert.equal(applied.replayed,false);assert.equal(verified.verification.status,'VERIFIED');assert.equal(applied.receipt.auditId,verified.verification.auditId);assert.equal(applied.sourceSha256,dry.sourceSha256);assert.equal(applied.sourceSha256,verified.sourceSha256);
for(const k of ['rollbackVerified','injectedFailureRollback','noWriteReplayVerified','leasesReleased'])assert.equal(dry[k],true);assert(applied.leasesReleased&&verified.independentConnection&&verified.noWriteReplayVerified);
const db=connect();let live;
try{
 await db.connect();await db.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');await db.query("SET LOCAL statement_timeout='20s'");
 const current=await inspect(db);assert.equal(hash(current.settings),plan.settingsHash);
 const cms=JSON.parse(current.settings.find(r=>r.key==='pet_cms_preparation_v1').value),cards=[];
 const env={DB:{prepare:sql=>({bind:(...args)=>({first:async()=>{assert.match(sql,/^SELECT\b/i);return(await db.query(sql.replaceAll('?','$1'),args)).rows[0]??null;}})})}};
 for(const t of plan.targets){const c=await readPetCollection(env,t.userId),g=applied.receipt.petGrants.find(g=>g.userId===t.userId);assert.equal(c.state.pets[plan.petCode],g.afterQuantity);assert(c.state.revision>=g.afterRevision);
  const card=petCatalogFrom(cms.document,{review:false,includeUnowned:true,collection:c.state.pets}).find(p=>p.code===plan.petCode);assert(card.owned);assert.equal(card.quantity,g.afterQuantity);cards.push({userId:t.userId,nickname:t.nickname,quantity:card.quantity,owned:card.owned});}
 live={checkedAt:new Date().toISOString(),readOnly:true,reader:'readPetCollection',catalog:'petCatalogFrom',cards,totalPets:3,cmsPreserved:true};await db.query('ROLLBACK');
}catch(e){await db.query('ROLLBACK').catch(()=>{});console.error(safe(e));process.exitCode=1;}finally{await db.end().catch(()=>{});}
assert(live,'Independent live ownership check required');await fs.writeFile(new URL('evidence/live-ownership-verify.json',import.meta.url),JSON.stringify(live,null,2)+'\n',{flag:'wx'});
const receipt=applied.receipt,kst=v=>new Date(new Date(v).getTime()+9*3600000).toISOString().replace('T',' ').slice(0,19)+' KST';
const summary={status:'COMPLETED_AND_INDEPENDENTLY_VERIFIED',operationKey:plan.operationKey,authorization:plan.authorization,completedAt:receipt.completedAt,completedAtKst:kst(receipt.completedAt),verifiedAt:live.checkedAt,auditId:receipt.auditId,recipientCount:3,petCode:plan.petCode,petName:plan.petName,totalPets:3,quantityEach:1,petAudits:3,missing:0,duplicates:0,planHash:applied.planHash,sourceSha256:applied.sourceSha256,targetedTests:4,actualPetReadersChecked:3,rollbackVerified:true,injectedFailureRollback:true,noWriteReplayVerified:true,independentConnection:true,leasesReleased:true,autoEquip:false,petPolicyChanges:false,messagesSent:false,deployment:false,storageMaintenance:false,petGrants:receipt.petGrants};
await fs.writeFile(new URL('completion.json',import.meta.url),JSON.stringify(summary,null,2)+'\n',{flag:'wx'});
const rows=[...plan.targets].sort((a,b)=>a.order-b.order).map(t=>{const g=receipt.petGrants.find(g=>g.userId===t.userId);return`| ${t.nickname} | ${t.userId} | 1 | ${g.beforeQuantity} → ${g.afterQuantity} | ${g.auditId} |`;}).join('\n');
const doc=`# 추첨 당첨자 3명 흑구 지급 — 2026-11-02

**완료: ${summary.completedAtKst} · 감사 ${summary.auditId} · 3명 각1마리·총3마리**. 정확한 계정/인증 신원과 실제 펫 보유·도감 읽기에서 모두 확인했다.

사용자 요청 “3명 흑구 지급해”는 직전 추첨의 ˚쟁이。·Moo날두·박사에게 흑구 PET-HEUKGU를 1마리씩 지급하는 지시다. 앞선 응모권 숫자는 추첨 가중치이며 지급 수량은 각1마리다. 재추첨하지 않았다. 당첨 순서와 응모권153장/42명, 추첨 결과는 source.json에 보존했다.

| 닉네임 | ID | 지급 | 흑구 보유 전후 | PET_GRANT 감사 |
| --- | ---: | ---: | --- | ---: |
${rows}

완료 키: \`${plan.operationKey}\`. 같은 요청을 새 키로 다시 지급하거나 이후 정상 보유량을 되돌리지 않는다. 정규 pet_collection_v1 저장 형식과 PET_GRANT 감사·pet_grant_receipt_v1 영수증을 사용했다.

- 관련 거래4검사 통과: 3명 실제 보유/도감 읽기, 신규·기존 펫 가산, 다른 자산 보존, 늦은 실패 시 전체 원복, 신원/설정/잠금 변경·비정상 수량·고아 영수증 차단, SELECT 전용 재실행 쓰기0.
- 실제 USER_LOCK+DB 이중잠금 아래 실패/정상 예행연습을 원복한 뒤, 펫3건·개별 감사3건·요약감사1건·완료 영수증을 한 거래로 확정했다. collection 동기화3계정·잠금 반환 확인.
- 독립 READ ONLY 확인 및 실제 readPetCollection/petCatalogFrom으로3계정 보유/도감 확인. 펫 CMS r${plan.petCmsRevision}·장착·잠재력·다른 펫·지갑·인벤토리 보존.
- 자동장착·펫 효과/확률/획득 정책 변경·메시지·게임 재배포·예약·저장공간 유지관리 없음. 기존 폴더/의존성 재사용·Git 자동정리 OFF.

계획 SHA-256: \`${summary.planHash}\`. 실행 파일 집합 SHA-256: \`${summary.sourceSha256}\`. source.json/plan.json/completion.json 및 evidence/에 계획·전후·검증 기록을 보존했다.
`;
await fs.writeFile(new URL('README.md',import.meta.url),doc,{flag:'wx'});const docs=new URL('../../docs/qa/heukgu-draw-winners-20261102/',import.meta.url);await fs.mkdir(docs,{recursive:true});await fs.writeFile(new URL('README.md',docs),doc,{flag:'wx'});
console.log(JSON.stringify({status:summary.status,auditId:summary.auditId,completedAtKst:summary.completedAtKst,recipients:3,totalPets:3,grants:receipt.petGrants.map(g=>({nickname:g.nickname,id:g.userId,before:g.beforeQuantity,after:g.afterQuantity}))}));
