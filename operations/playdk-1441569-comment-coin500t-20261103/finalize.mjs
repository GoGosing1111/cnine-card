import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {PLAN,OP,HASH,AMOUNT} from './grant.mjs';
const folder='playdk-1441569-comment-coin500t-20261103',load=async p=>JSON.parse(await fs.readFile(new URL(p,import.meta.url),'utf8'));
const [apply,dry,independent,replay,tests,source]=await Promise.all(['evidence/apply.json','evidence/dry-run.json','evidence/independent.json','evidence/replay.json','evidence/tests.json','source.json'].map(load));
assert.equal(tests.passed,4);assert.equal(tests.failed,0);assert.equal(tests.exitCode,0);
for(const item of [apply,dry,replay]){assert.equal(item.planHash,HASH);assert.equal(item.sourceSha256,apply.sourceSha256);assert.equal(item.verification.recipients,96);assert.equal(item.verification.totalAmount,PLAN.totalAmount);}
assert(apply.leasesReleased&&dry.leasesReleased&&dry.rollbackVerified&&dry.injectedFailureRollback&&apply.noWriteReplayVerified&&replay.noWriteReplayVerified);assert.equal(replay.additionalWrites,0);assert.equal(independent.productionWrites,0);assert.equal(independent.operationLocksRemaining,0);assert.equal(independent.verifiedRecipients,96);assert.equal(independent.auditId,apply.receipt.auditId);
const r=apply.receipt,kst=d=>new Intl.DateTimeFormat('sv-SE',{timeZone:'Asia/Seoul',dateStyle:'short',timeStyle:'medium'}).format(new Date(d))+' KST',completedAtKst=kst(r.completedAt),sourceCutoffKst=kst(source.collectedAt);
const recipients=PLAN.targets.map(t=>{const g=r.grants.find(g=>g.userId===t.id);assert(g);assert.equal(g.amount,AMOUNT);return {dkNames:t.dkNames,gameNickname:t.nickname,userId:t.id,commentIds:t.commentIds,amount:AMOUNT,coinLogId:g.logId};});
const completion={status:'COMPLETED_AND_INDEPENDENTLY_VERIFIED',operationKey:OP,authorization:PLAN.authorization,sourceUrl:source.sourceUrl,sourceCutoff:source.collectedAt,sourceCutoffKst,commentCount:104,uniqueAuthors:97,duplicateComments:7,replyComments:5,recipientCount:96,excluded:[{name:'닥터피쉬',reason:'NO_MATCHING_PLAYDK_SECOND_VERIFICATION'}],delivery:'DIRECT_WALLET',amountPerRecipient:AMOUNT,totalAmount:PLAN.totalAmount,completedAt:r.completedAt,completedAtKst,auditId:r.auditId,sourceHash:PLAN.sourceHash,planHash:HASH,executionSourceSha256:apply.sourceSha256,recipients,verification:{coinLogs:96,auditRecords:1,missing:0,duplicates:0,walletSyncChanged:96,testsPassed:4,failedDryRunRolledBack:true,successfulDryRunRolledBack:true,independentReadOnly:true,replayAdditionalWrites:0,locksReleased:true},priorDryRunFailures:2,messagesSent:0,gameDeployment:false,storageMaintenance:false,scheduledAutomations:0};
const escape=s=>String(s).replaceAll('|','\\|').replaceAll('\n',' '),table=recipients.map(t=>`| ${t.dkNames.map(escape).join(', ')} | ${escape(t.gameNickname)} | ${t.userId} | 500조 | ${t.coinLogId} |`).join('\n');
const readme=`# PLAYDK 1441569 전체 댓글 인증 검증 · 각500조 지급 — 2026-11-03

**운영 지급 완료: ${completedAtKst} · 감사 ${r.auditId}.** [요청 게시글](${source.sourceUrl})의 댓글 작성자 중 PLAYDK 2차 인증을 확인한 **96명에게 각500조, 총4경8,000조**를 직접 지급했다.

- 수집 기준 **${sourceCutoffKst}**. 댓글 API 3페이지 전체104개(답글5개 포함), 고유 작성자97명. 페이지별 total 일치·고유 댓글ID104·첫페이지 재조회·게시글 댓글수104를 대조했다. 중복 작성7건은 추가 지급하지 않는다. 기준 이후의 새 댓글을 자동 지급하는 예약은 없다.
- 공개 작성자 UUID를 운영 PLAYDK 2차 인증 provider_user_id와 정확 대조했다. 활성 인증 계정96명(USER94·ADMIN2), 닉네임 변경은 안정적인 인증ID로 연결했다. **닥터피쉬 1명은 일치하는 PLAYDK 2차 인증 및 동명 게임계정이 없어 미지급**. 닉네임 추측 대체 지급0.
- 기존 잔액에 각500조를 가산했다. USER_LOCK·SQL 임대 및 계정/동기화 행 잠금, 현재 잔액 비교, bulk UPDATE96·코인 원장96·요약감사1·완료영수증1을 한 거래로 확정했다. wallet 동기화96건 확인. 다른 재화·용병/인벤토리·성장·편성·패키지 장부 보존.
- PostgreSQL 관련4검사: 정확금액/중복재실행/후속소비 보존, 늦은 실패 전체원복, 인증변경/정지계정/범위초과 차단, 잘못된계획/잠금누락 차단. 실제 예행연습 첫2회는 임시 DO 잠금 소실 감지로 중단·원복되었고 영수증 없음. 만료 전 일부 잠금이 사라진 것은 관찰했으나 서비스 재시작/유휴제거 등 구체적 원인을 단정하지 않는다. 20명씩5묶음 잠금을 동시에 조회하고 2초 간격으로 유지 상태를 확인하도록 실행기만 보강했다. 이후 실패주입/정상 예행연습 원복·동일해시 확정·별도 READ ONLY 독립검증·SELECT전용 재실행쓰기0·잠금0 확인. 원본 실패증거 보존.
- 예행연습 감사53978은 확정 지급이 아니다. 지급 후 정상 소비/획득 잔액을 영수증 값으로 덮지 않는다. 메시지/게시글 댓글/공지 발송0, 게임 재배포0, 저장공간 유지관리/예약0.

완료 키 **${OP}**. 같은 요청에 새 키를 생성하거나 전체 명단을 재지급하지 않는다. 후속 미인증자/추가댓글 지급은 별도 사용자 요청과 당시 인증 확인이 필요하다.

| PLAYDK 닉네임 | 게임 닉네임 | 계정ID | 지급 | 원장ID |
| --- | --- | ---: | ---: | ---: |
${table}

소스목록/작성자/댓글ID: source.json. 고정지급계획: plan.json. 원본 응답/전후잔액/원복/영수증: evidence/. 계획해시 ${HASH}, 실행파일집합해시 ${apply.sourceSha256}. 기존 폴더/의존성 재사용·Git자동정리OFF.
`;
const entry=`## PLAYDK 1441569 댓글 인증96명 각500조 지급 완료 — 2026-11-03

- **운영 완료:** **${completedAtKst}·감사${r.auditId}**, 댓글104개/고유97명 중 **PLAYDK 2차인증96명 각500조·총4경8,000조 직접가산**. 수집기준 ${sourceCutoffKst}, 답글5포함·중복댓글7건 추가지급0. 닥터피쉬1명 인증연결없어 미지급.
- 완료키 **${OP}**. 같은요청 새키 재지급·이후 정상소비 잔액 덮기 금지. 작성자UUID/인증ID 정확대조·USER_LOCK/DB 이중잠금·잔액비교·96잔액/96원장/감사/영수증 단일거래·wallet96 동기화.
- 관련4검사·실제 실패/정상예행원복·독립 READ ONLY·SELECT재실행쓰기0·누락/중복0·잠금반환. 잠금소실로 중단된 예행2회 원복·증거보존 후 동시묶음/2초조회 보강. 다른재화/보유/성장/편성/장부보존.
- 기록 docs/qa/${folder}/, 증거 operations/${folder}/. 메시지/댓글/공지/게임재배포/화면조작/유지관리/예약0. 기존폴더·의존성재사용·Git자동정리OFF.

`;
for(const [name,data] of [['completion.json',JSON.stringify(completion,null,2)+'\n'],['README.md',readme],['memory.txt',entry]])await fs.writeFile(new URL(name,import.meta.url),data,{flag:'wx'});
const dir=new URL('../../docs/qa/'+folder+'/',import.meta.url);await fs.mkdir(dir,{recursive:true});await fs.writeFile(new URL('README.md',dir),readme,{flag:'wx'});await fs.writeFile(new URL('verification.json',dir),JSON.stringify(independent,null,2)+'\n',{flag:'wx'});
console.log(JSON.stringify({status:completion.status,recipients:96,totalAmount:PLAN.totalAmount,auditId:r.auditId,completedAtKst,excluded:completion.excluded}));
