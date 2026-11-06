import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import plan from './plan.json' with {type:'json'};
const folder='pepegu-draw-winners-20261106',drawFolder='pepegu-roster32-draw10-20261106';
const load=async file=>JSON.parse(await fs.readFile(new URL(file,import.meta.url),'utf8'));
const [a,d,v,i,tests]=await Promise.all(['evidence/apply.json','evidence/dry-run.json','evidence/verify.json','evidence/independent.json','evidence/tests.json'].map(load));
assert.equal(tests.exitCode,0);assert.equal(tests.passed,4);assert.equal(tests.failed,0);assert.equal(a.replayed,false);
for(const r of [d,v]){assert.equal(r.sourceSha256,a.sourceSha256);assert.equal(r.planHash,a.planHash);assert.equal(r.verification.recipientCount,10);assert.equal(r.verification.totalPets,10);}
for(const key of ['rollbackVerified','injectedFailureRollback','noWriteReplayVerified','leasesReleased'])assert.equal(d[key],true);
assert(a.leasesReleased&&v.independentConnection&&v.noWriteReplayVerified);assert.equal(i.auditId,a.receipt.auditId);assert.equal(i.actualPetReadersChecked,10);assert.equal(i.operationLocksRemaining,0);assert.equal(i.productionWrites,0);assert.equal(i.missing,0);assert.equal(i.duplicates,0);assert.equal(i.existingRentalsPreserved,4);assert(i.previousBoxReceiptPreserved);
const r=a.receipt,kst=new Intl.DateTimeFormat('sv-SE',{timeZone:'Asia/Seoul',dateStyle:'short',timeStyle:'medium'}).format(new Date(r.completedAt))+' KST';
const files=['source.json','plan.json','preflight.json','evidence/tests.json','evidence/tests.log','evidence/dry-run.json','evidence/commit-candidate-snapshots.json','evidence/commit-confirmed.json','evidence/apply.json','evidence/verify.json','evidence/independent.json'];
const evidence=await Promise.all(files.map(async file=>({file,sha256:createHash('sha256').update(await fs.readFile(new URL(file,import.meta.url))).digest('hex')})));
const completion={status:'COMPLETED_AND_INDEPENDENTLY_VERIFIED',operationKey:plan.operationKey,authorization:'지급해',drawOperationKey:'draw:pepegu:roster32:100to1:20261106:v1',drawResultSha256:plan.drawResultSha256,completedAt:r.completedAt,completedAtKst:kst,auditId:r.auditId,recipientCount:10,petCode:plan.petCode,petName:plan.petName,totalPets:10,quantityEach:1,ownership:'PERMANENT',petAudits:10,summaryAudits:1,missing:0,duplicates:0,planHash:a.planHash,sourceSha256:a.sourceSha256,targetedTests:4,actualPetReadersChecked:10,collectionSyncVerified:10,failedAndSuccessfulRehearsalsRolledBack:true,noWriteReplayVerified:true,independentReadOnly:true,leasesReleased:true,existingRentalsPreserved:4,previousBoxReceiptPreserved:true,redraw:false,autoEquip:false,petPolicyChanges:false,messagesSent:0,gameDeployment:false,storageMaintenance:false,scheduledAutomations:0,recipients:i.recipients,evidence};
const rows=i.recipients.map(t=>`| ${t.order} | ${t.nickname} | ${t.userId} | 1 | ${t.permanentBefore} → ${t.permanentAfter} | ${t.petAuditId} |`).join('\n');
const doc=`# 페페구 추첨 당첨자10명 지급 완료 — 2026-11-06

**${kst} · 감사${r.auditId} · 10명 각1마리·총10마리 영구 보유 지급 완료.** 전원 영구 보유0→1, 실제 펫 보유/도감 읽기와 별도 READ ONLY 연결로 확인했다.

사용자 “지급해”는 직전 32명·113장 가중 추첨에서 선정한10명에게 페페구 PET-PEPEGU를1마리씩 지급하는 후속 지시다. 추첨 결과 SHA-256 ${plan.drawResultSha256}를 고정하고 재추첨하지 않았다. 수량은 각1마리이며 응모권 수와 별개다.

| 추첨 순서 | 닉네임 | 계정 ID | 지급 | 영구 보유 전후 | PET_GRANT 감사 |
| ---: | --- | ---: | ---: | --- | ---: |
${rows}

기존 정규 OWNER 펫 지급과 같은 pet_collection_v1·PET_GRANT·pet_grant_receipt_v1 형식으로 처리했다. 랭크전 상점의30일 상품과 별도인 운영자 영구보유 지급이다. 0수표·베베킹·족단·학벌의 기존 기간제4기록을 그대로 보존했다. 기존 장착/잠재력·다른 펫·지갑/인벤토리·CMS r${plan.petCmsRevision}·앞선32명565박스 지급 영수증 감사54585를 보존했다.

관련 PostgreSQL4검사: 정확당첨자/신규·기존영구보유 가산/기간제보존/실제도감/사용후 SELECT재실행, 늦은 감사·영수증 실패 전체원복, 신원/닉네임/정책/이전영수증/잠금 변화 차단, 수량한도/고립영수증 차단. 운영 USER_LOCK·DB 이중잠금 아래 실패와 정상 예행 모두 원복한 후, 보유10/개별감사10/요약감사1/개별영수증10/완료영수증1을 단일거래로 확정했다. collection 동기화10건 증가·잠금반환 확인.

독립 READ ONLY 조회에서 당첨자 신원·원본추첨해시·개별감사·영수증·영구보유·도감·기존기간제4·이전박스영수증·collection동기화10·작업잠금0을 확인했다. SELECT 전용 재실행 추가지급0·누락0·중복0.

완료키 **${plan.operationKey}**. 같은요청 새키재지급·이후정상사용 보유복구 금지. 계획해시 ${a.planHash}, 실행해시 ${a.sourceSha256}. 원본증거와 해시목록은 operations/${folder}/에 보존했다. 자동장착·메시지·정책변경·게임재배포·유지관리·삭제·예약0. 기존폴더/의존성 재사용·Git자동정리OFF.
`;
const entry=`## 페페구 추첨 당첨10명 각1마리 지급 완료 — 2026-11-06

- **운영 완료:** **${kst}·감사${r.auditId}**, **PET-PEPEGU 10명 각1마리·총10마리 영구보유0→1**. **족단·0수표·세라네꼬라지·베베킹·블랙캐슬·점빡이·학벌·핫시·랄네미탱탱·숭구릭**. 직전32명113장 추첨정본 사용·재추첨0.
- 완료키 **${plan.operationKey}**. 같은요청 새키재지급·정상사용후 보유복구 금지. USER_LOCK/DB 이중잠금·보유10/개별감사10/요약감사/영수증 단일거래·실패/정상예행원복·관련4검사·독립READ ONLY·실제보유/도감10·SELECT재실행쓰기0·동기화10·잠금반환·누락/중복0.
- 0수표/베베킹/족단/학벌 기간제4기록·장착/잠재력/다른펫·재화/인벤토리·CMS45·앞선32명565박스 감사54585 영수증해시 보존. 기존 추첨기록의 지급전 상태는 과거이력이며 이 완료기록과 draw폴더 fulfillment.json이 후속지급 정본.
- 기록 docs/qa/${folder}/, 원본 operations/${folder}/. 자동장착/메시지/정책변경/게임재배포/유지관리/삭제/예약0·기존폴더/의존성재사용·Git자동정리OFF.

`;
const write=(file,text)=>fs.writeFile(new URL(file,import.meta.url),text,{flag:'wx'});
await write('completion.json',JSON.stringify(completion,null,2)+'\n');await write('README.md',doc);await write('evidence/agents-entry.md',entry);
const fulfillment={status:'GRANTED_AND_VERIFIED',drawOperationKey:completion.drawOperationKey,drawResultSha256:plan.drawResultSha256,grantOperationKey:plan.operationKey,completedAt:r.completedAt,completedAtKst:kst,auditId:r.auditId,totalPets:10,ownership:'PERMANENT',recipients:i.recipients,completionPath:'operations/'+folder+'/completion.json'};
await fs.writeFile(new URL('../'+drawFolder+'/fulfillment.json',import.meta.url),JSON.stringify(fulfillment,null,2)+'\n',{flag:'wx'});
const docs=new URL('../../docs/qa/'+folder+'/',import.meta.url);await fs.mkdir(docs,{recursive:true});await fs.writeFile(new URL('README.md',docs),doc,{flag:'wx'});await fs.writeFile(new URL('completion.json',docs),JSON.stringify(completion,null,2)+'\n',{flag:'wx'});
const agents=new URL('../../AGENTS.md',import.meta.url),current=await fs.readFile(agents,'utf8');assert(!current.includes(plan.operationKey));await fs.writeFile(agents,entry+current);
// Reuse the established alternate-index record publisher; no checkout or dependency copy.
let record=await fs.readFile(new URL('../reversecall-streamer-box-100to5-20261105/record-completion.mjs',import.meta.url),'utf8');
record=record.replaceAll('reversecall-streamer-box-100to5-20261105',folder).replaceAll('totalBoxes','totalPets').replaceAll('summary.recipientCount,32','summary.recipientCount,10').replaceAll('summary.totalPets,565','summary.totalPets,10').replaceAll('recipients:32','recipients:10').replaceAll('totalPets:565','totalPets:10');
record=record.replace("'run.mjs','locks.mjs','lock-worker.mjs'","'run.mjs','lock-worker.mjs'");
record=record.replace("files.push('docs/qa/'","files.push('operations/"+drawFolder+"/fulfillment.json');\nfiles.push('docs/qa/'");
record=record.replace('ops: grant 565 ReverseCall streamer boxes to 32 named accounts','ops: grant one permanent Pepegu to each of ten saved raffle winners');
await write('record-completion.mjs',record);
console.log(JSON.stringify({status:completion.status,recipients:10,totalPets:10,ownership:'PERMANENT',auditId:r.auditId,completedAtKst:kst}));
