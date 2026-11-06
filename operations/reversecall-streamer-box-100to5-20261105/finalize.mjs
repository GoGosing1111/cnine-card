import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {PLAN,OP,HASH} from './grant.mjs';
const folder='reversecall-streamer-box-100to5-20261105',load=async file=>JSON.parse(await fs.readFile(new URL(file,import.meta.url),'utf8'));
const [a,d,v,replay,i,tests]=await Promise.all(['evidence/apply.json','evidence/dry-run.json','evidence/verify.json','evidence/replay.json','evidence/independent.json','evidence/tests.json'].map(load));
assert.equal(tests.passed,4);assert.equal(tests.failed,0);assert.equal(tests.exitCode,0);
for(const r of [a,d,v,replay]){assert.equal(r.sourceSha256,a.sourceSha256);assert.equal(r.planHash,HASH);assert.equal(r.verification.totalBoxes,565);assert.equal(r.verification.recipients,32);}
assert(a.leasesReleased&&a.noWriteReplayVerified&&a.onlyExpectedWrites&&d.leasesReleased&&d.rollbackVerified&&d.injectedFailureRollback&&d.noWriteReplayVerified&&d.onlyExpectedWrites);assert(v.independentReadOnlyConnection&&replay.independentReadOnlyConnection&&replay.noWriteReplayVerified);assert.equal(replay.additionalWrites,0);
assert(i.independentReadOnly);assert.equal(i.productionWrites,0);assert.equal(i.operationLocksRemaining,0);assert.equal(i.auditId,a.receipt.auditId);assert.equal(i.inventorySyncVerified,32);assert.equal(i.totalBoxes,565);assert.equal(i.missing,0);assert.equal(i.duplicates,0);
const r=a.receipt,completedAtKst=new Intl.DateTimeFormat('sv-SE',{timeZone:'Asia/Seoul',dateStyle:'short',timeStyle:'medium'}).format(new Date(r.completedAt))+' KST';
const releaseNote={stage:'POST_COMMIT_RELEASE',observedMessage:'ACCOUNT_LOCK_STATE_MISMATCH owned=30 expected=32 remainingMs=109301',assessment:'After COMMITTED, an already pending heartbeat overlapped release. The release method then verified USER_LOCK owned=0 and DB own-token rows=0; apply exited 0 with leasesReleased=true. Independent read-only verification also found operationLocksRemaining=0. No grant rerun or grant write followed this message.',auditId:r.auditId,applyLeasesReleased:a.leasesReleased,independentOperationLocksRemaining:i.operationLocksRemaining};
await fs.writeFile(new URL('./evidence/release-heartbeat-note.json',import.meta.url),JSON.stringify(releaseNote,null,2)+'\n',{flag:'wx'});
const evidence=['preflight.json','plan.json','source.json','evidence/tests.json','evidence/tests.log','evidence/dry-run.json','evidence/commit-candidate.json','evidence/commit-confirmed.json','evidence/apply.json','evidence/verify.json','evidence/replay.json','evidence/independent.json','evidence/release-heartbeat-note.json'];
const hashes=await Promise.all(evidence.map(async file=>({file,sha256:createHash('sha256').update(await fs.readFile(new URL(file,import.meta.url))).digest('hex')})));
const completion={status:'COMPLETED_AND_INDEPENDENTLY_VERIFIED',operationKey:OP,itemCode:PLAN.itemCode,itemName:PLAN.itemName,authorization:PLAN.authorization,calculation:PLAN.calculation,rounding:PLAN.rounding,delivery:PLAN.delivery,recipientCount:32,totalBoxes:565,groupCounts:PLAN.groupCounts,markerCounts:PLAN.markerCounts,completedAt:r.completedAt,completedAtKst,auditId:r.auditId,planHash:HASH,sourceSha256:a.sourceSha256,testsPassed:4,inventoryLogs:32,inventorySyncVerified:32,missing:0,duplicates:0,pending:0,atomic:true,failedAndSuccessfulRehearsalsRolledBack:true,independentReadOnly:true,noWriteReplay:true,locksReleased:true,messagesSent:0,automaticOpening:false,gameDeployment:false,storageMaintenance:false,scheduledAutomations:0,recipients:i.recipients,evidence:hashes};
const table=i.recipients.map(t=>`| ${t.inputNickname} | ${t.userId} | ${t.marker} | ${t.amount} | ${t.before} → ${t.after} | ${t.logId} |`).join('\n');
const readme=`# 리버스콜 스트리머 박스 100개당 5개 지급 — 2026-11-05

**운영 지급 완료: ${completedAtKst} · 감사 ${r.auditId}. 32명에게 총 565개를 인벤토리에 직접 가산했다.**

사용자 원문 기준 100개당 5박스를 계산했다. 100개 미만 나머지는 제외했다. 전게씹선미아웃의 Markdown 강조 기호만 제거했으며 32명 모두 정확한 닉네임·ACTIVE 상태·고유 인증 연결로 대조했다.

| 원문 수량 | 인원 | 1인 박스 | 소계 |
| ---: | ---: | ---: | ---: |
| 509 | 19 | 25 | 475 |
| 209 | 2 | 10 | 20 |
| 109 | 6 | 5 | 30 |
| 100 | 4 | 5 | 20 |
| 400 (찬호) | 1 | 20 | 20 |
| **합계** | **32** | | **565** |

아이템은 **REVERSECALL_STREAMER_GIFT_BOX / 리버스콜 스트리머 선물**이다. 미개봉 박스를 지급했다. 기존 씨나인 스트리머 박스와 다른 재화/보유는 보존했다.

| 정확한 닉네임 | 계정 ID | 원문 수량 | 지급 박스 | 지급 직전 → 직후 | 지급 원장 |
| --- | ---: | ---: | ---: | ---: | ---: |
${table}
| **합계** | **32명** | | **565** | | |

USER_LOCK·DB 임대/계정/동기화/인벤토리 행 잠금 아래 현재 수량을 비교하고, 인벤토리32·원장32·요약감사1·완료영수증1을 단일 거래로 확정했다. 인벤토리 동기화32명 증가와 관련 없는 재화/보유 보존을 확인했다.

관련 PostgreSQL4검사 통과: 정확수량/다른자산보존/개봉후 SELECT재실행, 원장·감사·영수증 실패 전체원복, 인증·닉네임 중복·카탈로그·잠금 변경 차단, 수량 범위·고립 원장 차단. 실제 운영 실패/정상 예행도 모두 원복하고 동일 실행해시로 적용했다.

별도 READ ONLY 연결에서 계정·원장32·감사·영수증·현재 보유와 후속 사용을 대조했다. SELECT전용 재실행 추가쓰기0·누락0·중복0·보류0·작업 잠금0. 이후 정상 개봉·사용으로 바뀐 수량을 복구하지 않는다.

COMMITTED 이후 잠금 반환 중 이미 진행 중이던 heartbeat가 owned30/expected32 상태를 출력했다. 반환 함수의 최종 USER_LOCK 소유0·DB 소유토큰0, apply 종료0·leasesReleased=true, 독립 조회의 작업잠금0을 확인했다. 재지급하지 않았으며 release-heartbeat-note.json에 경과를 보존했다.

완료 키 **${OP}**. 동일 요청 새키 재지급 금지. 계획 SHA-256 ${HASH}, 실행 SHA-256 ${a.sourceSha256}. 원본 증거 operations/${folder}/evidence/, 해시 completion.json. 자동개봉·메시지·게임재배포·사용자화면조작·유지관리·새예약0. 기존폴더/의존성 재사용·Git자동정리OFF.
`;
const entry=`## 리버스콜 스트리머 박스 32명·565개 지급 완료 — 2026-11-05

- **운영 완료:** **${completedAtKst}·감사${r.auditId}**, **REVERSECALL_STREAMER_GIFT_BOX 32명·총565개** 인벤토리 직접가산. **100개당5박스·나머지제외**, 509명단19명×25·209명단2명×10·109/100명단10명×5·찬호400→20.
- 전원 정확닉네임·ACTIVE·고유인증 대조. 완료키 **${OP}**. 같은요청 새키재지급·정상개봉후 보유복구 금지. 기존 씨나인박스·다른재화/보유 보존.
- 관련4검사·USER_LOCK/DB 이중잠금·현재수량비교·인벤토리32/원장32/감사/영수증 단일거래·실패/정상예행원복·독립READ ONLY·SELECT재실행쓰기0·동기화32·잠금반환·누락/중복/보류0.
- 기록 docs/qa/${folder}/, 원본 operations/${folder}/. 자동개봉/메시지/게임재배포/사용자화면조작/유지관리/삭제/예약0·기존폴더/의존성재사용·Git자동정리OFF.

`;
const write=(file,text)=>fs.writeFile(new URL(file,import.meta.url),text,{flag:'wx'});
await write('completion.json',JSON.stringify(completion,null,2)+'\n');await write('README.md',readme);await write('evidence/agents-entry.md',entry);
const docs=new URL('../../docs/qa/'+folder+'/',import.meta.url);await fs.mkdir(docs,{recursive:true});await fs.writeFile(new URL('README.md',docs),readme,{flag:'wx'});await fs.writeFile(new URL('completion.json',docs),JSON.stringify(completion,null,2)+'\n',{flag:'wx'});
const agents=new URL('../../AGENTS.md',import.meta.url),current=await fs.readFile(agents,'utf8');assert(!current.includes(OP));await fs.writeFile(agents,entry+current);
console.log(JSON.stringify({status:completion.status,recipients:32,totalBoxes:565,auditId:r.auditId,completedAtKst}));
