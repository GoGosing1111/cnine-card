import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {PLAN,OP,HASH} from './grant.mjs';
const folder='cnine-streamer-box-bini-add2-20261103',load=async p=>JSON.parse(await fs.readFile(new URL(p,import.meta.url),'utf8'));
const [a,d,v,replay,i,t]=await Promise.all(['evidence/apply.json','evidence/dry-run.json','evidence/verify.json','evidence/replay.json','evidence/independent.json','evidence/tests.json'].map(load));
assert.equal(t.exitCode,0);assert.equal(t.passed,4);assert.equal(t.failed,0);for(const r of [a,d,v,replay]){assert.equal(r.planHash,HASH);assert.equal(r.sourceSha256,a.sourceSha256);assert.equal(r.verification.recipients,1);assert.equal(r.verification.totalBoxes,2);}
assert(a.leasesReleased&&d.leasesReleased&&d.rollbackVerified&&d.injectedFailureRollback&&a.noWriteReplayVerified&&replay.noWriteReplayVerified);assert.equal(replay.additionalWrites,0);assert(i.independentReadOnly&&i.parentReceiptPreserved&&i.inventorySyncVerified);assert.equal(i.productionWrites,0);assert.equal(i.operationLocksRemaining,0);assert.equal(i.auditId,a.receipt.auditId);
const r=a.receipt,g=r.grants[0],completedAtKst=new Intl.DateTimeFormat('sv-SE',{timeZone:'Asia/Seoul',dateStyle:'short',timeStyle:'medium'}).format(new Date(r.completedAt))+' KST';
const evidence=['preflight.json','source.json','plan.json','evidence/tests.json','evidence/tests.log','evidence/tests-initial-fixture-failure.json','evidence/dry-run.json','evidence/apply.json','evidence/commit-candidate.json','evidence/commit-confirmed.json','evidence/verify.json','evidence/replay.json','evidence/independent.json'];
const completion={status:'COMPLETED_AND_INDEPENDENTLY_VERIFIED',operationKey:OP,parentOperation:PLAN.parentOperation,parentReceiptHash:PLAN.parentReceiptHash,userId:'4595',nickname:'비니',itemCode:'CNINE_STREAMER_BOX',amount:2,priorGranted:5,combinedGranted:7,before:g.before,after:g.after,logId:g.logId,auditId:r.auditId,completedAt:r.completedAt,completedAtKst,planHash:HASH,sourceSha256:a.sourceSha256,testsPassed:4,independentReadOnly:true,parentReceiptPreserved:true,noWriteReplay:true,locksReleased:true,inventorySyncVerified:true,missing:0,duplicates:0,messagesSent:0,automaticOpening:false,gameDeployment:false,storageMaintenance:false,scheduledAutomations:0,evidence:await Promise.all(evidence.map(async file=>({file,sha256:createHash('sha256').update(await fs.readFile(new URL(file,import.meta.url))).digest('hex')})))};
const readme=`# 비니 씨나인 스트리머 박스 2개 추가 지급 — 2026-11-03

**운영 완료: ${completedAtKst} · 감사 ${r.auditId}. 비니 ID4595에 CNINE_STREAMER_BOX 2개 추가, 지급 직전 ${g.before} → 지급 직후 ${g.after}개. 원장 ${g.logId}.**

사용자 요청 “비니 2개 추가지급”. 앞선 명단 지급의 5개(감사54105·원장88407617)와 합쳐 이번 명단 누적 지급은 7개다. 미개봉 인벤토리에 직접 가산했으며 다른 계정 지급 및 자동개봉은 없다.

- 기존37명·222개 완료영수증의 해시 ${PLAN.parentReceiptHash} 유지. 앞선 지급을 재실행하거나 정상 사용 후 수량을 복구하지 않는다.
- USER_LOCK/DB 이중잠금·현재수량비교·인벤토리/원장/감사/완료영수증 단일거래. 인벤토리 동기화와 다른 재화/보유 보존 확인.
- PostgreSQL4검사: 정확한 추가2개·재실행 및 사용 후 보유 보존, 원장/감사/영수증 SQL실패 전체원복, 신원/이름/아이템/잠금 변경 차단, 잘못된수량/고립원장/기존영수증변경 차단. 최초 테스트 fixture의 기존영수증 행 때문에 실패한 CHECK 조건은 신규 쓰기만 검증하도록 수정했고 실패로그 보존. 운영지급 함수 변경0.
- 실제 실패/정상 예행연습 원복 후 같은 실행해시로 지급. 별도 READ ONLY에서 계정·지급원장·감사·기존영수증·현재보유/후속사용 확인, SELECT전용 재실행 추가쓰기0·잠금0·누락/중복0.

완료키 **${OP}**. 이 추가 요청을 새 키로 반복 지급하지 않는다. 원본증거 operations/${folder}/evidence/, 계획/실행/증거해시 completion.json. 메시지/게임재배포/화면조작/유지관리/예약0. 기존폴더/의존성재사용·Git자동정리OFF.
`;
const entry=`## 비니 씨나인 스트리머 박스2개 추가 지급 완료 — 2026-11-03

- **운영 완료:** **${completedAtKst}·감사${r.auditId}**, **비니 ID4595·CNINE_STREAMER_BOX 2개 추가·${g.before}→${g.after}개**, 원장${g.logId}. 앞선5개와 이번명단 누적7개. 기존37명/222개 완료키·감사54105·영수증해시 보존.
- 완료키 **${OP}**. 같은추가요청 새키재지급·정상개봉후 보유복구 금지. 관련4검사·USER_LOCK/DB 이중잠금·현재수량비교·인벤토리/원장/감사/영수증 단일거래·실패/정상예행원복·독립READ ONLY·SELECT재실행쓰기0·동기화/잠금반환·누락/중복0.
- 다른계정/재화/보유보존·자동개봉/메시지/게임재배포/화면조작/유지관리/예약0. 기록 docs/qa/${folder}/, 원본증거 operations/${folder}/. 기존폴더/의존성재사용·Git자동정리OFF.

`;
const write=(p,s)=>fs.writeFile(new URL(p,import.meta.url),s,{flag:'wx'});await write('completion.json',JSON.stringify(completion,null,2)+'\n');await write('README.md',readme);await write('evidence/agents-entry.md',entry);
const docs=new URL('../../docs/qa/'+folder+'/',import.meta.url);await fs.mkdir(docs,{recursive:true});await fs.writeFile(new URL('README.md',docs),readme,{flag:'wx'});await fs.writeFile(new URL('completion.json',docs),JSON.stringify(completion,null,2)+'\n',{flag:'wx'});
const agents=new URL('../../AGENTS.md',import.meta.url),current=await fs.readFile(agents,'utf8');assert(!current.includes(OP));await fs.writeFile(agents,entry+current);
let record=await fs.readFile(new URL('../cnine-streamer-box-named-20261103/record-completion.mjs',import.meta.url),'utf8');record=record.replaceAll('cnine-streamer-box-named-20261103',folder).replace('summary.recipientCount,37','summary.userId,\'4595\'').replace('summary.totalBoxes,222','summary.amount,2').replace('grant 222 CNINE streamer boxes to 37 confirmed accounts','grant 2 additional CNINE streamer boxes to Bini').replace('recipients:37,totalBoxes:222','recipients:1,totalBoxes:2');
const fileStart=record.indexOf('const files='),fileEnd=record.indexOf('\nfiles.push',fileStart);assert(fileStart>=0&&fileEnd>fileStart);
record=record.slice(0,fileStart)+"const files=['.gitignore','source.json','plan.json','grant.mjs','grant.test.mjs','run.mjs','locks.mjs','lock-worker.mjs','wrangler.jsonc','preflight.mjs','independent.mjs','test-run.mjs','prepare.mjs','finalize.mjs','record-completion.mjs','README.md','completion.json'].map(f=>'operations/'+folder+'/'+f);"+record.slice(fileEnd);
await write('record-completion.mjs',record);console.log(JSON.stringify({status:completion.status,nickname:'비니',amount:2,priorGranted:5,combinedGranted:7,before:g.before,after:g.after,auditId:r.auditId,completedAtKst}));
