import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {PLAN,OP,HASH} from './grant.mjs';
const folder='cnine-streamer-box-named-20261103',load=async file=>JSON.parse(await fs.readFile(new URL(file,import.meta.url),'utf8'));
const [a,d,v,replay,i,tests]=await Promise.all(['evidence/apply.json','evidence/dry-run.json','evidence/verify.json','evidence/replay.json','evidence/independent.json','evidence/tests.json'].map(load));
assert.equal(tests.passed,4);assert.equal(tests.failed,0);assert.equal(tests.exitCode,0);
for(const r of [a,d,v,replay]){assert.equal(r.sourceSha256,a.sourceSha256);assert.equal(r.planHash,HASH);assert.equal(r.verification.totalBoxes,222);assert.equal(r.verification.recipients,37);}
assert(a.leasesReleased&&a.noWriteReplayVerified&&a.onlyExpectedWrites&&d.leasesReleased&&d.rollbackVerified&&d.injectedFailureRollback&&d.noWriteReplayVerified&&d.onlyExpectedWrites);assert(v.independentReadOnlyConnection&&replay.independentReadOnlyConnection&&replay.noWriteReplayVerified);assert.equal(replay.additionalWrites,0);
assert(i.independentReadOnly);assert.equal(i.productionWrites,0);assert.equal(i.operationLocksRemaining,0);assert.equal(i.auditId,a.receipt.auditId);assert.equal(i.inventorySyncVerified,37);assert.equal(i.totalBoxes,222);assert.equal(i.missing,0);assert.equal(i.duplicates,0);
const r=a.receipt,completedAtKst=new Intl.DateTimeFormat('sv-SE',{timeZone:'Asia/Seoul',dateStyle:'short',timeStyle:'medium'}).format(new Date(r.completedAt))+' KST';
const evidence=['preflight.json','plan.json','source.json','evidence/tests.json','evidence/tests.log','evidence/aborted-dry-run-readonly.json','evidence/dry-run.json','evidence/commit-candidate.json','evidence/commit-confirmed.json','evidence/apply.json','evidence/verify.json','evidence/replay.json','evidence/independent.json'];
const hashes=await Promise.all(evidence.map(async file=>({file,sha256:createHash('sha256').update(await fs.readFile(new URL(file,import.meta.url))).digest('hex')})));
const completion={status:'COMPLETED_AND_INDEPENDENTLY_VERIFIED',operationKey:OP,itemCode:PLAN.itemCode,itemName:PLAN.itemName,authorization:PLAN.authorization,clarification:PLAN.clarification,delivery:PLAN.delivery,recipientCount:37,totalBoxes:222,groupCounts:PLAN.groupCounts,completedAt:r.completedAt,completedAtKst,auditId:r.auditId,planHash:HASH,sourceSha256:a.sourceSha256,testsPassed:4,inventoryLogs:37,inventorySyncVerified:37,missing:0,duplicates:0,pending:0,atomic:true,failedAndSuccessfulRehearsalsRolledBack:true,independentReadOnly:true,noWriteReplay:true,locksReleased:true,messagesSent:0,automaticOpening:false,gameDeployment:false,storageMaintenance:false,scheduledAutomations:0,recipients:i.recipients,evidence:hashes};
const table=i.recipients.map(t=>`| ${t.inputNickname} | ${t.nickname} | ${t.userId} | ${t.marker} | ${t.amount} | ${t.before} → ${t.after} | ${t.logId} |`).join('\n');
const readme=`# 씨나인 스트리머 박스 명단 지급 — 2026-11-03

**운영 지급 완료: ${completedAtKst} · 감사 ${r.auditId}. 37명에게 총 222개를 인벤토리에 직접 가산했다.**

- 309개 명단: 23명 × 7개 = 161개.
- 209개 명단: 쟁이 중복 제외 11명 × 5개 = 55개.
- 109개 명단: 3명 × 2개 = 6개.
- 사용자 후속 답변 **“7개만 지급”**에 따라 쟁이는 7개 한 번만 지급했다. 쟁이→˚쟁이。 ID4705, 찡찡→찡찡ෆ ID4562. 다른35명은 정확한 닉네임으로 대조했으며 전원 ACTIVE·고유 인증 연결을 확인했다.

지급 아이템은 **CNINE_STREAMER_BOX / 씨나인 스트리머 박스**다. 미개봉 박스를 추가했으며 코인·마스터의 별 등 내용물을 자동 지급하거나 개봉하지 않았다.

| 입력 이름 | 실제 닉네임 | 계정 ID | 원문 구분 | 지급 박스 | 지급 직전 → 직후 | 지급 원장 |
| --- | --- | ---: | ---: | ---: | ---: | ---: |
${table}
| **합계** | **37명** | | | **222** | | |

USER_LOCK·DB 임대/계정/동기화/인벤토리 행 잠금, 현재 수량 비교, 인벤토리37·원장37·요약감사1·완료영수증1을 단일 거래로 확정했다. 인벤토리 동기화37명 증가와 다른 재화/보유 및 기존 리버스콜 박스 보존을 확인했다.

관련 PostgreSQL4검사: 정확수량/중복이름/후속개봉 후 SELECT재실행, 원장·감사·영수증 실패 전체원복, 신원·닉네임·카탈로그·잠금 변경 차단, 수량범위·고립원장 차단. 실제 실패/정상 예행을 모두 원복하고 동일 실행해시로 적용했다. 최초 운영 예행의 쓰기범위 검사가 잠금 취득37건을 예상 밖으로 분류하여 중단됐고, 독립 READ ONLY에서 지급원장/감사/영수증/잠금0을 확인한 뒤 잠금 제어 기록의 검사 조건만 수정했다. 지급 함수는 변경하지 않았다.

별도 READ ONLY 연결에서 실제 계정·원장37·감사·영수증·현재 보유와 이후 사용을 대조했다. SELECT전용 재실행 추가쓰기0, 누락/중복/보류0, 작업 잠금0. 정상 개봉/사용 이후 수량을 덮어쓰지 않는다.

완료 키 **${OP}**. 같은 요청 새 키 재지급 금지. 계획 SHA-256 ${HASH}, 실행 SHA-256 ${a.sourceSha256}. 원본 증거 operations/${folder}/evidence/, 해시 completion.json. 메시지/게임재배포/사용자화면조작/유지관리/새예약0. 기존 폴더·의존성 재사용·Git 자동정리 OFF.
`;
const entry=`## 씨나인 스트리머 박스 명단37명·222개 지급 완료 — 2026-11-03

- **운영 완료:** **${completedAtKst}·감사${r.auditId}**, 씨나인 스트리머 박스 **CNINE_STREAMER_BOX 37명·총222개** 직접가산. **309명단23명×7개 / 209명단11명×5개 / 109명단3명×2개**. 사용자 후속 **쟁이7개만** 반영·중복5개0.
- 쟁이→˚쟁이。 ID4705·찡찡→찡찡ෆ ID4562, 다른35명 정확닉네임/전원ACTIVE·인증대조. 완료키 **${OP}**. 같은요청 새키재지급·이후정상개봉 보유복구 금지.
- 관련4검사·USER_LOCK/DB 이중잠금·현재수량비교·보유37/원장37/감사/영수증 단일거래·실패/정상예행원복·독립READ ONLY·SELECT재실행쓰기0·인벤토리동기화37·잠금반환·누락/중복/보류0. 최초예행 잠금기록검사 중단원복 보존.
- 기존리버스콜/재화/다른보유보존·자동개봉/메시지/게임재배포/화면조작/유지관리/예약0. 기록 docs/qa/${folder}/, 원본증거 operations/${folder}/. 기존폴더/의존성재사용·Git자동정리OFF.

`;
const write=(file,text)=>fs.writeFile(new URL(file,import.meta.url),text,{flag:'wx'});
await write('completion.json',JSON.stringify(completion,null,2)+'\n');await write('README.md',readme);await write('evidence/agents-entry.md',entry);
const docs=new URL('../../docs/qa/'+folder+'/',import.meta.url);await fs.mkdir(docs,{recursive:true});await fs.writeFile(new URL('README.md',docs),readme,{flag:'wx'});await fs.writeFile(new URL('completion.json',docs),JSON.stringify(completion,null,2)+'\n',{flag:'wx'});
const agents=new URL('../../AGENTS.md',import.meta.url),current=await fs.readFile(agents,'utf8');assert(!current.includes(OP));await fs.writeFile(agents,entry+current);
console.log(JSON.stringify({status:completion.status,recipients:37,totalBoxes:222,auditId:r.auditId,completedAtKst}));
