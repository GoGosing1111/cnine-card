import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {PLAN,OP,HASH} from './grant.mjs';
const folder='hakbeol-ranked-coin500-20261104',load=async p=>JSON.parse(await fs.readFile(new URL(p,import.meta.url),'utf8'));
const [a,d,v,replay,i,t]=await Promise.all(['evidence/apply.json','evidence/dry-run.json','evidence/verify.json','evidence/replay.json','evidence/independent.json','evidence/tests.json'].map(load));
assert.equal(t.exitCode,0);assert.equal(t.passed,4);assert.equal(t.failed,0);for(const r of [a,d,v,replay]){assert.equal(r.planHash,HASH);assert.equal(r.sourceSha256,a.sourceSha256);assert.equal(r.verification.recipients,1);assert.equal(r.verification.totalAmount,500);}
assert(a.leasesReleased&&d.leasesReleased&&d.rollbackVerified&&d.injectedFailureRollback&&a.noWriteReplayVerified&&replay.noWriteReplayVerified);assert.equal(replay.additionalWrites,0);assert(i.independentReadOnly&&i.inventorySyncVerified&&i.ordinaryCurrencyAndOtherInventoryPreserved);assert.equal(i.productionWrites,0);assert.equal(i.operationLocksRemaining,0);assert.equal(i.auditId,a.receipt.auditId);
const r=a.receipt,g=r.grants[0],completedAtKst=new Intl.DateTimeFormat('sv-SE',{timeZone:'Asia/Seoul',dateStyle:'short',timeStyle:'medium'}).format(new Date(r.completedAt))+' KST';
const evidence=['preflight.json','source.json','plan.json','evidence/tests.json','evidence/tests.log','evidence/dry-run.json','evidence/apply.json','evidence/commit-candidate.json','evidence/commit-confirmed.json','evidence/verify.json','evidence/replay.json','evidence/independent.json'];
const completion={status:'COMPLETED_AND_INDEPENDENTLY_VERIFIED',operationKey:OP,userId:'4627',nickname:'학벌',itemCode:'RANKED_COIN',itemName:'랭크전 코인',amount:500,before:g.before,after:g.after,logId:g.logId,auditId:r.auditId,completedAt:r.completedAt,completedAtKst,planHash:HASH,sourceSha256:a.sourceSha256,testsPassed:4,independentReadOnly:true,rankedServiceBalanceAtVerification:i.rankedServiceBalance,noWriteReplay:true,locksReleased:true,inventorySyncVerified:true,ordinaryCurrencyAndOtherInventoryPreserved:true,missing:0,duplicates:0,messagesSent:0,gameDeployment:false,storageMaintenance:false,scheduledAutomations:0,evidence:await Promise.all(evidence.map(async file=>({file,sha256:createHash('sha256').update(await fs.readFile(new URL(file,import.meta.url))).digest('hex')})))};
completion.postGrantUsage={checkedAt:i.checkedAt,currentQuantity:i.currentQuantity,subsequentLedgerEntries:i.subsequentLedgerEntries,subsequentChange:i.subsequentChange,preserved:true};
const readme=`# 학벌 랭크전 코인 500개 지급 — 2026-11-04

**운영 완료: ${completedAtKst} · 감사 ${r.auditId}. 학벌 ID4627에 RANKED_COIN 500개 추가, 지급 직전 ${g.before} → 지급 직후 ${g.after}개. 원장 ${g.logId}.**

사용자 요청 “학벌 계정에 랭크전 코인 500개 지급해”. 정확한 닉네임·ACTIVE·인증 연결과 운영 카탈로그의 RANKED_COIN / 랭크전 코인을 확인하고 전용 인벤토리 잔액에 가산했다.

- USER_LOCK/DB 이중잠금·현재수량비교·인벤토리/원장/감사/완료영수증 단일거래. 인벤토리 동기화와 일반 코인·다른 재화/보유 보존 확인. 랭크 점수·티어·시즌 정산/상점 구매 기록 변경 없음.
- PostgreSQL4검사: 정확500개·중복방지·사용 후 재실행 보유 보존, 원장/감사/영수증 SQL실패 전체원복, 신원/이름/아이템/잠금 변경 차단, 잘못된수량·고립원장 차단. 실제 실패/정상 예행연습 모두 원복 후 같은 실행해시로 지급했다.
- 별도 READ ONLY에서 계정·지급원장·감사·영수증·현재보유/후속사용 및 실제 rankedCoinBalance 함수를 조회했다. 지급 이후 원장 ${i.subsequentLedgerEntries}건 합계 ${i.subsequentChange}개와 검증시 잔액 ${i.currentQuantity}개를 대조했으며 추가로 쓰거나 지급 직후 잔액으로 복구하지 않았다. SELECT전용 재실행 추가쓰기0·잠금0·누락/중복0.

완료키 **${OP}**. 같은 요청 새 키 재지급·이후 정상 소비 수량 덮기 금지. 원본증거 operations/${folder}/evidence/, 계획/실행/증거해시 completion.json. 메시지/게임재배포/화면조작/유지관리/예약0. 기존폴더/의존성재사용·Git자동정리OFF.
`;
const entry=`## 학벌 랭크전 코인500개 지급 완료 — 2026-11-04

- **운영 완료:** **${completedAtKst}·감사${r.auditId}**, **학벌 ID4627·RANKED_COIN 500개 추가·${g.before}→${g.after}개**, 원장${g.logId}. 랭크전 전용 코인 인벤토리 가산.
- 완료키 **${OP}**. 같은요청 새키재지급·이후정상소비 덮기 금지. 관련4검사·USER_LOCK/DB 이중잠금·현재수량비교·인벤토리/원장/감사/영수증 단일거래·실패/정상예행원복·독립READ ONLY·실제rankedCoinBalance·SELECT재실행쓰기0·동기화/잠금반환 확인.
- 일반코인/다른재화/보유·랭크점수/티어/시즌정산/상점구매 보존. 메시지/게임재배포/화면조작/유지관리/예약0. 기록 docs/qa/${folder}/, 원본증거 operations/${folder}/. 기존폴더/의존성재사용·Git자동정리OFF.

`;
const write=(p,s)=>fs.writeFile(new URL(p,import.meta.url),s,{flag:'wx'});await write('completion.json',JSON.stringify(completion,null,2)+'\n');await write('README.md',readme);await write('evidence/agents-entry.md',entry);
const docs=new URL('../../docs/qa/'+folder+'/',import.meta.url);await fs.mkdir(docs,{recursive:true});await fs.writeFile(new URL('README.md',docs),readme,{flag:'wx'});await fs.writeFile(new URL('completion.json',docs),JSON.stringify(completion,null,2)+'\n',{flag:'wx'});
const agents=new URL('../../AGENTS.md',import.meta.url),current=await fs.readFile(agents,'utf8');assert(!current.includes(OP));await fs.writeFile(agents,entry+current);
let record=await fs.readFile(new URL('../cnine-streamer-box-bini-add2-20261103/record-completion.mjs',import.meta.url),'utf8');record=record.replaceAll('cnine-streamer-box-bini-add2-20261103',folder).replace("summary.userId,'4595'","summary.userId,'4627'").replace('summary.amount,2','summary.amount,500').replace('grant 2 additional CNINE streamer boxes to Bini','grant 500 ranked coins to Hakbeol').replace('recipients:1,totalBoxes:2','recipients:1,totalAmount:500');await write('record-completion.mjs',record);
console.log(JSON.stringify({status:completion.status,nickname:'학벌',itemCode:'RANKED_COIN',amount:500,before:g.before,after:g.after,auditId:r.auditId,completedAtKst}));
