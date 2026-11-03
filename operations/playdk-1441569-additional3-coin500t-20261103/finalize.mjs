import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {PLAN,OP,HASH,AMOUNT} from './grant.mjs';
const folder='playdk-1441569-additional3-coin500t-20261103',load=async p=>JSON.parse(await fs.readFile(new URL(p,import.meta.url),'utf8'));
const [apply,dry,independent,replay,tests,source]=await Promise.all(['evidence/apply.json','evidence/dry-run.json','evidence/independent.json','evidence/replay.json','evidence/tests.json','source.json'].map(load));
assert.equal(tests.passed,5);assert.equal(tests.failed,0);assert.equal(tests.exitCode,0);
for(const item of [apply,dry,replay]){assert.equal(item.planHash,HASH);assert.equal(item.sourceSha256,apply.sourceSha256);assert.equal(item.verification.recipients,3);assert.equal(item.verification.totalAmount,PLAN.totalAmount);}
assert(apply.leasesReleased&&dry.leasesReleased&&dry.rollbackVerified&&dry.injectedFailureRollback&&apply.noWriteReplayVerified&&replay.noWriteReplayVerified);assert.equal(replay.additionalWrites,0);assert.equal(independent.productionWrites,0);assert.equal(independent.operationLocksRemaining,0);assert(independent.parentReceiptPreserved&&independent.noOverlapWithOriginal96);assert.equal(independent.auditId,apply.receipt.auditId);
const r=apply.receipt,completedAtKst=new Intl.DateTimeFormat('sv-SE',{timeZone:'Asia/Seoul',dateStyle:'short',timeStyle:'medium'}).format(new Date(r.completedAt))+' KST';
const completion={status:'COMPLETED_AND_INDEPENDENTLY_VERIFIED',operationKey:OP,parentOperation:PLAN.parentOperation,parentReceiptHash:PLAN.parentReceiptHash,authorization:PLAN.authorization,delivery:'DIRECT_WALLET',recipientCount:3,amountPerRecipient:AMOUNT,totalAmount:PLAN.totalAmount,completedAt:r.completedAt,completedAtKst,auditId:r.auditId,sourceHash:PLAN.sourceHash,planHash:HASH,executionSourceSha256:apply.sourceSha256,recipients:independent.recipients,verification:{coinLogs:3,auditRecords:1,missing:0,duplicates:0,walletSyncChanged:3,testsPassed:5,failedDryRunRolledBack:true,successfulDryRunRolledBack:true,independentReadOnly:true,replayAdditionalWrites:0,locksReleased:true,parent96ReceiptPreserved:true,noOverlapWithParent:true},messagesSent:0,gameDeployment:false,storageMaintenance:false,scheduledAutomations:0};
const table=independent.recipients.map(t=>`| ${t.dkName} | ${t.gameName} | ${t.userId} | 500조 | ${t.coinLogId} |`).join('\n');
const readme=`# PLAYDK 1441569 지정 3명 추가 · 각500조 지급 — 2026-11-03

**운영 지급 완료: ${completedAtKst} · 감사 ${r.auditId}.** 앞선 댓글 인증96명 보상에 이어 사용자가 링크로 지정한 세 명에게 **각500조, 총1,500조**를 직접 지급했다.

| PLAYDK 닉네임 | 게임 계정 | ID | 지급 | 코인 원장 |
| --- | --- | ---: | ---: | ---: |
${table}

- 튜브브브브(70cfc2ad)→겨밥디임4712, ShowMaker(25958d94)→ShowMaker233, 범용e(6bfab491)→지엘라4917. 세 PLAYDK UUID와 운영 2차 인증을 정확히 대조했다. 전원 ACTIVE이며 기존96명 지급/관련후속영수증/원장에 없었다.
- 세 사람의 현 게시글 댓글도 확인했다. 튜브브브브1개·ShowMaker3개·범용e1개이며 계정당1회 지급했다. 지급 대상은 이번 사용자가 지정한3명으로 고정했다. 다른 추가 댓글/닥터피쉬 미인증자에게 지급하지 않았다.
- USER_LOCK·SQL 임대/계정/동기화 행 잠금, 현재 잔액 비교, 코인 가산3·원장3·감사1·완료영수증을 단일 거래로 확정했다. wallet3 동기화와 그 외 동기화 도메인 보존 확인. 재화/용병/인벤토리/성장/편성/패키지 회계 보존.
- 관련 PostgreSQL5검사 통과: 정확금액·재실행 후 정상 소비 보존, 늦은 SQL 실패 전체원복, 인증변경/비활성/잔액범위 차단, 잘못된계획/잠금누락 차단, 기존 지급영수증 보존/다른추가지급 경합 중복차단. 실제 실패/정상 예행연습 원복 후 동일해시로 지급했다. 예행감사53981은 확정 지급이 아니다.
- 별도 READ ONLY 독립확인·SELECT전용 재실행 추가쓰기0·작업 잠금0·누락/중복0. 기존96명 영수증 감사53979·해시 ${PLAN.parentReceiptHash} 그대로 보존했고 기존계정 잔액을 다시 쓰지 않았다. 메시지/공지/게시글 댓글/게임재배포/화면조작/유지관리/예약0.

완료 키 **${OP}**. 같은 요청 새 키 재지급·이후 정상 소비 잔액 덮기 금지. 원래 완료키 **${PLAN.parentOperation}** 재실행 없음.

계획해시 ${HASH}, 실행파일집합해시 ${apply.sourceSha256}. 원본 요청/수집댓글 source.json·evidence/post-comments.json, 전후잔액/잠금/원복/검증 evidence/. 기존폴더/의존성재사용·Git자동정리OFF.
`;
const memory=`## PLAYDK 댓글 추가3명 각500조 지급 완료 — 2026-11-03

- **운영 완료:** **${completedAtKst}·감사${r.auditId}**, **튜브브브브→겨밥디임 ID4712·ShowMaker ID233·범용e→지엘라 ID4917** 각500조·총1,500조 직접가산. PLAYDK UUID/2차인증/ACTIVE 정확대조·앞선96명과 중복0.
- 완료키 **${OP}**. 같은요청 새키재지급·이후 정상소비덮기 금지. 원래96명 완료키/감사53979/영수증해시 보존·재실행0. USER_LOCK/DB 이중잠금·잔액비교·잔액3/원장3/감사/영수증 단일거래·wallet3 동기화.
- 관련5검사·실제 실패/정상예행원복·독립 READ ONLY·SELECT재실행쓰기0·누락/중복0·잠금반환. 다른재화/보유/성장/편성/장부보존. 메시지/댓글/공지/게임재배포/화면조작/유지관리/예약0.
- 기록 docs/qa/${folder}/, 증거 operations/${folder}/. 기존폴더·의존성재사용·Git자동정리OFF.

`;
for(const [name,data] of [['completion.json',JSON.stringify(completion,null,2)+'\n'],['README.md',readme],['memory.txt',memory]])await fs.writeFile(new URL(name,import.meta.url),data,{flag:'wx'});
const dir=new URL('../../docs/qa/'+folder+'/',import.meta.url);await fs.mkdir(dir,{recursive:true});await fs.writeFile(new URL('README.md',dir),readme,{flag:'wx'});await fs.writeFile(new URL('verification.json',dir),JSON.stringify(independent,null,2)+'\n',{flag:'wx'});
console.log(JSON.stringify({status:completion.status,recipients:3,totalAmount:PLAN.totalAmount,auditId:r.auditId,completedAtKst}));
