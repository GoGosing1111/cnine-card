import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {fileURLToPath} from 'node:url';
const out=fileURLToPath(new URL('./',import.meta.url)),root=path.resolve(out,'../..'),release=path.join(root,'output/revan-live-20261027/release-checkout');
const load=n=>JSON.parse(fs.readFileSync(path.join(out,n+'.json'),'utf8'));
const live=load('live-verification'),applied=load('apply'),verified=load('verify'),entry=load('entry-local/report'),publicUi=load('entry-public/report'),codex=load('codex-browser-v3/browser-report'),dry=load('dry-run');
assert.equal(live.status,'VERIFIED');assert(applied.committed&&applied.noWriteReplayVerified);assert(verified.readOnly&&verified.verification.verified);assert(dry.rollbackVerified);assert.deepEqual(applied.receipt,verified.receipt);assert.equal(codex.status,'PASSED');assert.equal(entry.reports.length,4);assert.equal(publicUi.reports.length,2);assert.equal(live.scopedTests,14);
const receipt=applied.receipt,art=JSON.parse(fs.readFileSync(path.join(release,'docs/qa/pet-pepegu-20261101/approval-20261101.json'))).assets[0];
const kst=new Intl.DateTimeFormat('sv-SE',{timeZone:'Asia/Seoul',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit',hour12:false}).format(new Date(receipt.completedAt))+' KST';
const completion={status:'DEPLOYED_REGISTERED_AND_VERIFIED',sourceCommit:live.sourceCommit,pages:live.pages,workers:live.workers,operationKey:receipt.operationKey,completedAt:receipt.completedAt,completedAtKst:kst,auditId:receipt.auditId,revision:receipt.revision,previousRevision:receipt.previousRevision,petCount:verified.petCount,pet:receipt.addedPets[0],asset:art,originalBytesUnchanged:true,imageGenerationUsed:false,displayReference:'PET-HEUKGU',battleSizeFactor:.92,mobileCodexHeight:210,existingPetsPreserved:receipt.preservedRows,settingsUnchanged:true,grants:0,messages:0,newAcquisitionRoutes:0,liveEffectsEnabled:false,unitTests:22,localCodexChecks:codex.reports.length,localEntryChecks:entry.reports.length,publicEntryChecks:publicUi.reports.length,browserScope:'Headless Chromium; actual main start/result/return and actual codex/OWNER component with isolated account fixtures, no real device or installed app claim',publicFiles:live.assets.length,clientManifestFiles:live.clientManifest.files.length,readOnlyIndependentVerification:true,noWriteReplayVerified:true,recordedAt:new Date().toISOString()};
fs.writeFileSync(path.join(out,'completion.json'),JSON.stringify(completion,null,2)+'\n',{flag:'wx'});
const end='\n## 운영 완료\n\n'+kst+' · 감사 '+completion.auditId+' · CMS r'+completion.previousRevision+'→r'+completion.revision+' / 총 '+completion.petCount+'종.\n\n소스 `'+live.sourceCommit+'`, Pages `'+live.pages.id+'`. 공개 '+live.assets.length+'파일의 정확한 바이트와 클라이언트 필수 3파일 해시, 두 Worker 100%를 확인했다. 관련 검사 22건, PC/모바일 도감·OWNER 표시와 실제 시작→결과→복귀 4경로, 공개 모바일 2경로가 통과했다. 운영 등록 뒤 독립 READ ONLY 검증 및 재실행 추가 쓰기 0을 확인했다. 기존 24종과 획득/잠재력 설정은 그대로이며 계정 지급·메시지는 없다.\n';
const qaRel='docs/qa/pet-pepegu-20261101',readme=fs.readFileSync(path.join(release,qaRel,'README.md'),'utf8');
assert(!readme.includes('## 운영 완료'));
for(const base of [release,root]){
 const qa=path.join(base,qaRel);fs.mkdirSync(qa,{recursive:true});
 fs.writeFileSync(path.join(qa,'README.md'),readme+end);
 for(const file of ['completion','apply','verify','live-verification','deployment-plan','deployment-result'])fs.copyFileSync(path.join(out,file+'.json'),path.join(qa,file+'.json'));
 fs.copyFileSync(path.join(out,'entry-public/report.json'),path.join(qa,'public-browser.json'));
}
const title='## 페페구 원본 등록 · 흑구 동일 크기 — 2026-11-01 최신';
const entryText=title+'\n\n- **운영 반영 완료:** 소스 '+live.sourceCommit.slice(0,9)+' · Pages '+live.pages.id.slice(0,8)+' · **'+kst+'·감사'+completion.auditId+'**. **페페구 PET-PEPEGU**, 사용자 첨부 200×200 투명 PNG 33,345bytes 그대로 등록. 재생성/보정/리사이즈0, SHA-256 `'+art.sha256+'`.\n- 전투 크기 **흑구와 같은 0.92배**, 모바일 도감210px. 기존 접지/보조광·다른 펫 크기 보존. CMS r'+completion.previousRevision+'→r'+completion.revision+'·기존24종 유지·총25종. 버프수치미정·실전효과OFF·획득경로/잠재력 설정/계정보유 보존.\n- 완료키 **'+receipt.operationKey+'**. 같은요청 재등록·후속운영설정 덮기 금지. 관련22검사·PC/모바일 도감/OWNER·실제 전투 시작/결과/복귀4경로·공개모바일2경로·공개23파일·클라이언트필수3해시·두Worker100%. 예행연습원복·독립READ ONLY·재실행쓰기0. 실기기/설치앱검사 아님. 계정지급0·메시지0.\n- 원본 assets/ui/pets/pepegu-20261101/, 기록 docs/qa/pet-pepegu-20261101/, 증거 operations/pet-pepegu-20261101/. 기존 체크아웃/의존성 재사용·Git자동정리OFF·승인없는 유지관리/예약 없음.\n\n';
for(const base of [release,root]){const file=path.join(base,'AGENTS.md'),prior=fs.readFileSync(file,'utf8');assert(!prior.includes(title));fs.writeFileSync(file,entryText+prior);}
const operationDir=path.join(release,'operations/pet-pepegu-20261101');fs.mkdirSync(operationDir,{recursive:true});
for(const file of ['run.mjs','release.mjs','verify-live.mjs','finalize.mjs','entry-browser.mjs','read.json','dry-run.json','apply.json','verify.json','deployment-plan.json','deployment-result.json','live-verification.json','completion.json'])fs.copyFileSync(path.join(out,file),path.join(operationDir,file));
fs.writeFileSync(path.join(operationDir,'README.md'),'# 페페구 등록 완료 기록\n\n완료 키 `'+receipt.operationKey+'` · 감사 '+receipt.auditId+' · '+kst+'. 동일 요청을 새 키로 반복하지 않는다. `run.mjs`와 `release.mjs`는 이 작업의 기존 체크아웃/검토 증거를 지정하며, 단순 실행용 범용 도구가 아니다. 원시 이미지·실패와 성공 검수·배포 로그는 원래 작업 폴더에 보존한다.\n');
console.log(JSON.stringify({status:completion.status,source:completion.sourceCommit,pages:live.pages.id,pet:completion.pet.code,audit:completion.auditId,completedAt:completion.completedAtKst}));
