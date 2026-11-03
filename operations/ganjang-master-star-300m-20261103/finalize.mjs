import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {OP,HASH,PLAN,AMOUNT} from './grant.mjs';
const root='C:/Users/User/Downloads/upload/cnine-card',checkout=path.join(root,'output/revan-live-20261027/release-checkout'),folder='ganjang-master-star-300m-20261103',directory=import.meta.dirname;
const read=p=>JSON.parse(fs.readFileSync(path.join(directory,p),'utf8'));
const a=read('proof/apply.json'),d=read('proof/dry-run.json'),v=read('proof/verify.json'),replay=read('proof/replay.json'),independent=read('proof/independent.json'),tests=read('tests.json');
assert.equal(tests.passed,5);assert.equal(tests.failed,0);assert.equal(tests.exitCode,0);
for(const report of [a,d,v,replay]){assert.equal(report.planHash,HASH);assert.equal(report.sourceSha256,a.sourceSha256);assert.equal(report.verification.amount,AMOUNT);}
assert(d.rollbackVerified&&d.injectedFailureRollback&&d.noWriteReplayVerified&&d.leasesReleased&&a.leasesReleased&&a.noWriteReplayVerified&&v.independentConnection&&replay.noWriteReplayVerified);
assert(independent.independentReadOnly);assert.equal(independent.productionWrites,0);assert.equal(independent.operationLocksRemaining,0);assert.equal(independent.verification.auditId,a.receipt.auditId);
const r=a.receipt,g=r.grants[0],completedAtKst=new Intl.DateTimeFormat('sv-SE',{timeZone:'Asia/Seoul',dateStyle:'short',timeStyle:'medium'}).format(new Date(r.completedAt))+' KST';
const evidence=['preflight.json','plan.json','tests.json','tests.log','proof/read.json','proof/dry-run.json','proof/apply.json','proof/verify.json','proof/replay.json','proof/independent.json','proof/committed-snapshots.json'];
const completion={status:'COMPLETED_AND_INDEPENDENTLY_VERIFIED',operationKey:OP,authorization:PLAN.authorization,userId:g.userId,nickname:g.nickname,itemCode:'MASTER_STAR',amount:AMOUNT,before:g.before,after:g.after,inventoryLogId:g.logId,auditId:r.auditId,completedAt:r.completedAt,completedAtKst,planHash:HASH,sourceSha256:a.sourceSha256,testsPassed:5,atomic:true,failureAndSuccessRehearsalsRolledBack:true,independentReadOnlyVerified:true,noWriteReplayVerified:true,leasesReleased:true,inventorySyncVerified:true,postGrantUsage:{verifiedAt:independent.checkedAt,currentAtVerification:independent.masterStars,ledgerEntries:independent.subsequentLedgerEntries,amount:independent.subsequentLedgerAmount,preserved:true},messagesSent:0,gameRedeployed:false,storageMaintenance:false,scheduledAutomations:0,evidence:evidence.map(file=>({file,sha256:createHash('sha256').update(fs.readFileSync(path.join(directory,file))).digest('hex')}))};
const readme=`# 간장왕대게찜 마스터의 별3억 지급 — 2026-11-03

**운영 지급 완료: ${completedAtKst} · 감사${r.auditId}.** 정확한 닉네임·활성 계정 **${g.nickname} ID${g.userId}** 확인 후 MASTER_STAR **300,000,000개 추가**. 지급 직전 **${g.before} → 지급 직후 ${g.after}개**, 인벤토리 원장${g.logId}.

- 사용자 요청: “${PLAN.authorization}”. 개인 인벤토리 직접 가산이며 카드 조각이나 코인 지급이 아니다. 메시지0.
- USER_LOCK·DB 임대·동기화/계정/인벤토리 행 잠금, 현재 수량 CAS, 인벤토리/원장/감사/영수증 단일거래. 다른 재화·보유·성장·편성·계급·구매 회계 보존. 인벤토리 동기화 변경으로 기존 클라이언트 me/summary·인벤토리 갱신을 따른다.
- PostgreSQL5검사 통과: 정확수량·중복방지·다른보유 보존, 미보유행 생성, 늦은 SQL실패 전체원복, 계정인증 변경/수량범위 차단, 잘못된계획·잠금누락 차단과 이후 정상 소비 보존.
- 실제 실패/정상 예행연습 모두 ROLLBACK 후 동일 실행해시로 지급. 감사54007은 원복된 예행이며 실제 지급 감사는${r.auditId}다. 별도 READ ONLY·SELECT전용 재실행 추가쓰기0·작업잠금 반환 확인.
- 지급 이후 별도 확인(${independent.checkedAt})에서 원장${independent.subsequentLedgerEntries}건 합계${independent.subsequentLedgerAmount}개 변화와 잔여${independent.masterStars}개를 대조했다. 이후 사용을 되돌리거나 초기 지급 직후 수량으로 덮지 않았다.

완료키 **${OP}**. 같은 요청 새 키 재지급·이후 정상 사용 덮기 금지. 원본 증거는 프로젝트루트 operations/${folder}/proof/, 계획/실행해시와 증거 SHA는 completion.json. 기존 체크아웃/의존성 재사용, 게임재배포·화면조작·유지관리·새예약0.
`;
fs.writeFileSync(path.join(directory,'completion.json'),JSON.stringify(completion,null,2)+'\n',{flag:'wx'});fs.writeFileSync(path.join(directory,'README.md'),readme,{flag:'wx'});
for(const base of [root,checkout]){
 const docs=path.join(base,'docs/qa',folder);fs.mkdirSync(docs,{recursive:true});fs.writeFileSync(path.join(docs,'README.md'),readme,{flag:'wx'});fs.writeFileSync(path.join(docs,'completion.json'),JSON.stringify(completion,null,2)+'\n',{flag:'wx'});
 const memory=`## 간장왕대게찜 마스터의 별3억 지급 완료 — 2026-11-03\n\n- **운영 완료:** **${g.nickname} ID${g.userId}**, MASTER_STAR **3억 추가·${Number(g.before).toLocaleString('en-US')}→${Number(g.after).toLocaleString('en-US')}개**, **${completedAtKst}·감사${r.auditId}**. 원장${g.logId}.\n- 완료키 **${OP}**. 같은요청 새키재지급·이후 정상사용 덮기 금지. USER_LOCK/DB 이중잠금·CAS·인벤토리/원장/감사/영수증 단일거래. 이후 사용1억/원장5건과 검증시268,464,540개 대조·추가쓰기0.\n- 관련5검사·실제 실패/정상예행원복·독립 READ ONLY·SELECT재실행쓰기0·동기화/잠금반환 확인. 다른재화/보유/성장/편성/계급/구매장부 보존. 메시지/게임재배포/화면조작/유지관리/예약0.\n- 기록 docs/qa/${folder}/, 원본증거 operations/${folder}/. 기존체크아웃·의존성재사용·Git자동정리OFF.\n\n`;
 const agents=path.join(base,'AGENTS.md'),current=fs.readFileSync(agents,'utf8');assert(!current.includes('## 간장왕대게찜 마스터의 별3억 지급 완료'));fs.writeFileSync(agents,memory+current);
}
const archive=path.join(checkout,'operations',folder);fs.mkdirSync(archive,{recursive:true});
for(const file of ['.gitignore','preflight.mjs','plan.json','grant.mjs','grant.test.mjs','test-run.mjs','run.mjs','lock-worker.mjs','wrangler.jsonc','independent.mjs','finalize.mjs','completion.json','README.md'])fs.copyFileSync(path.join(directory,file),path.join(archive,file));
console.log(JSON.stringify({nickname:g.nickname,amount:AMOUNT,before:g.before,after:g.after,auditId:r.auditId,completedAtKst,independentlyVerified:true}));
