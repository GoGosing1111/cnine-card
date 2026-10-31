import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
import plan from './plan.json' with {type:'json'};
const read=async n=>JSON.parse(await fs.readFile(new URL('./evidence/'+n+'.json',import.meta.url),'utf8'));
const apply=await read('apply'),dry=await read('dry-run'),replay=await read('replay'),access=await read('access');
const independent=JSON.parse(await fs.readFile(new URL('./independent.json',import.meta.url),'utf8'));
assert.equal(apply.replayed,false);assert.equal(independent.status,'VERIFIED');assert.equal(access.status,'VERIFIED');assert.equal(independent.auditId,apply.receipt.auditId);assert.equal(access.auditId,apply.receipt.auditId);
assert.equal(apply.sourceSha256,dry.sourceSha256);assert.equal(apply.sourceSha256,replay.sourceSha256);
for(const key of ['rollbackVerified','injectedFailureRollback','noWriteReplayVerified','leasesReleased'])assert.equal(dry[key],true);assert.equal(apply.leasesReleased,true);assert.equal(replay.noWriteReplayVerified,true);
assert.equal(independent.stockUnchanged,true);assert.equal(independent.serialsUnchanged,true);assert.equal(independent.craftUnchanged,true);assert.equal(independent.remainingOperationLocks,0);
assert.equal(access.visibleInAccount,true);assert.equal(access.rankedVisible,true);assert.equal(access.growthVisible,true);assert(access.battle.PVE.selectable&&access.battle.PVP.selectable);
const kst=v=>new Date(new Date(v).getTime()+9*3600000).toISOString().replace('T',' ').slice(0,19)+' KST';
const summary={status:'COMPLETED_AND_INDEPENDENTLY_VERIFIED',operationKey:plan.operationKey,authorization:plan.authorization,completedAt:apply.receipt.completedAt,completedAtKst:kst(apply.receipt.completedAt),auditId:apply.receipt.auditId,userId:'16',nickname:'오승환이다',code:'V-978',name:'레오넬',rank:'SSS LIMITED',quantity:1,before:independent.before,after:independent.after,level:access.card.level,stock:independent.stock,cubeStock:independent.cubeStock,stockCountersChanged:false,limitedIssuesAdded:0,craftCountsChanged:false,protectedStatePreserved:true,acquisitionId:apply.receipt.acquisitions[0],acquisitionRecords:1,auditRecords:1,visibleInAccount:true,growthVisible:true,rankedVisible:true,pveAndPvpSelectable:true,planHash:apply.planHash,sourceSha256:apply.sourceSha256,targetedTests:4,rollbackVerified:true,injectedFailureRollback:true,noWriteReplayVerified:true,independentReadOnly:true,leasesReleased:true,automaticLoadout:false,messagesSent:false,deployment:false,storageMaintenance:false};
await fs.writeFile(new URL('./completion.json',import.meta.url),JSON.stringify(summary,null,2)+'\n',{flag:'wx'});
const doc=`# 오승환이다 레오넬 한도 예외 지급 — 2026-10-31

**운영 완료: ${summary.completedAtKst} · 감사 ${summary.auditId}**.

사용자 “오승환이다 계정에 레오넬 한도차감없이 지급해”에 따라 **오승환이다 ID16에 레오넬 V-978 / SSS LIMITED 1장**을 영구 직접 지급했다. 보유 **${summary.before}→${summary.after}**, 기본${summary.level}레벨이다.

- 팩 한도${summary.stock.limit}/발행${summary.stock.issued}/잔여${summary.stock.remaining}, 큐브 한도${summary.cubeStock.limit}/발행${summary.cubeStock.issued}/잔여${summary.cubeStock.remaining} 그대로 유지. 새 한정 시리얼0, 제작 집계 차감0.
- 기존 코인/재화·다른 카드·인벤토리·성장·PVE/PVP 편성·정책 보존, collection 동기화 버전 증가.
- 별도 READ ONLY 연결에서 실계정 보유/원장/감사/한도 확인. 실제 mercenaryAccountState·rankedOwnedMercenaries·성장 목록·PVE/PVP 선택 함수에서 레오넬 접근 확인.
- 관련4검사: 정확한1장/자산·한도 보존, 최종 실패 전체 롤백, 기보유 가산 시 성장/첫획득 보존, 계획/신원/잠금 보호. 실제 두 잠금에서 실패/정상 예행연습 원복 후 단일 거래 확정, SELECT 전용 재실행 추가쓰기0, 잠금 반환.
- 자동 편성·메시지·게임 재배포·예약·저장공간 유지관리 없음. 기존 작업 폴더/의존성 재사용·Git 자동정리 OFF.

완료 키: \`${summary.operationKey}\`. 같은 요청을 새 키로 반복 지급하거나 이후 정상 성장을 덮지 않는다.
획득 ID: \`${summary.acquisitionId}\`.
계획 SHA-256: \`${summary.planHash}\`. 실행 파일 집합 SHA-256: \`${summary.sourceSha256}\`.
계획 plan.json, 완료 completion.json, 독립조회 independent.json, 전후 스냅샷/검증 evidence/ 보존.
`;
await fs.writeFile(new URL('./README.md',import.meta.url),doc,{flag:'wx'});const docs=new URL('../../docs/qa/ohseunghwan-leonel-exempt-20261031/',import.meta.url);await fs.mkdir(docs,{recursive:true});await fs.writeFile(new URL('README.md',docs),doc,{flag:'wx'});
console.log(JSON.stringify({status:summary.status,auditId:summary.auditId,completedAtKst:summary.completedAtKst,userId:'16',nickname:'오승환이다',code:'V-978',quantity:1,before:summary.before,after:summary.after,stockCountersChanged:false,craftCountsChanged:false}));
