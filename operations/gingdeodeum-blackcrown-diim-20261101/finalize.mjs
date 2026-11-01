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
const summary={status:'COMPLETED_AND_INDEPENDENTLY_VERIFIED',operationKey:plan.operationKey,authorization:plan.authorization,stockAuthorization:plan.stockAuthorization,completedAt:apply.receipt.completedAt,completedAtKst:kst(apply.receipt.completedAt),auditId:apply.receipt.auditId,userId:'5877',nickname:'깅더듬',code:'V-953',name:'디임',title:'블랙크라운 SS 리미티드',rank:'SS',edition:'LIMITED',season:'BLACKCROWN',quantity:1,before:independent.before,after:independent.after,level:access.card.level,stock:independent.stock,stockCountersChanged:false,limitedIssuesAdded:0,craftCountsChanged:false,protectedStatePreserved:true,acquisitionId:apply.receipt.acquisitions[0],acquisitionRecords:1,auditRecords:1,visibleInAccount:true,growthVisible:true,rankedVisible:true,pveAndPvpSelectable:true,planHash:apply.planHash,sourceSha256:apply.sourceSha256,targetedTests:4,rollbackVerified:true,injectedFailureRollback:true,noWriteReplayVerified:true,independentReadOnly:true,leasesReleased:true,automaticLoadout:false,messagesSent:false,deployment:false,storageMaintenance:false};
await fs.writeFile(new URL('./completion.json',import.meta.url),JSON.stringify(summary,null,2)+'\n',{flag:'wx'});
const doc=`# 깅더듬 블랙크라운 SS 리미티드 디임 1장 예외 지급 — 2026-11-01

**운영 완료: ${summary.completedAtKst} · 감사 ${summary.auditId}**.

사용자 “깅더듬 계정에 블랙크라운 ss 리미티드 디임 지급해” 및 후속 “기존 한도는 그대로 두고 예외로 1장 지급”에 따라 **깅더듬 ID5877에 블랙크라운 SS 리미티드 디임 V-953 1장**을 영구 직접 지급했다. 보유 **0→1**, 기본 **1레벨**이다.

- 정확한 닉네임·기존 인증 신원과 블랙크라운 SS 카탈로그를 대조했다. 일반 디임·블러드문 디임·ICON 디임과 다른 V-953이다.
- 발행 한도40/발행40/잔여0 그대로 유지. 새 한정 시리얼0, 제작 집계 차감0. 수량 한도 증액 없이 사용자 승인 예외 지급이다.
- 기존 코인/재화·다른 카드·인벤토리·성장·PVE/PVP 편성·정책 보존, collection 동기화 버전 증가.
- 관련4검사: 정확한1장/한도 보존 및 SELECT 재실행, 최종 실패 전체 롤백, 기보유 블랙크라운 SS 중복 차단, 계획/신원/잠금 보호. 실제 두 잠금 아래 실패/정상 예행연습 전체 원복 후 단일 거래 확정.
- 별도 READ ONLY 연결로 보유/원장/감사/발행수량 확인. 실제 계정·랭크·성장·PVE/PVP 선택 함수에서 접근 확인. SELECT 전용 재실행 추가쓰기0·잠금 반환 확인.
- 자동 편성·메시지·게임 재배포·예약·저장공간 유지관리 없음. 기존 작업 폴더/의존성 재사용·Git 자동정리 OFF.

완료 키: \`${summary.operationKey}\`. 같은 요청을 새 키로 반복 지급하거나 이후 정상 보유/성장을 덮지 않는다.
획득 ID: \`${summary.acquisitionId}\`.
계획 SHA-256: \`${summary.planHash}\`. 실행 파일 집합 SHA-256: \`${summary.sourceSha256}\`.
계획 plan.json, 완료 completion.json, 독립조회 independent.json, 전후 스냅샷/검증 evidence/ 보존.
`;
await fs.writeFile(new URL('./README.md',import.meta.url),doc,{flag:'wx'});
const docs=new URL('../../docs/qa/gingdeodeum-blackcrown-diim-20261101/',import.meta.url);await fs.mkdir(docs,{recursive:true});
await fs.writeFile(new URL('README.md',docs),doc,{flag:'wx'});await fs.writeFile(new URL('completion.json',docs),JSON.stringify(summary,null,2)+'\n',{flag:'wx'});
console.log(JSON.stringify({status:summary.status,userId:summary.userId,nickname:summary.nickname,code:summary.code,title:summary.title,quantity:1,before:0,after:1,level:summary.level,stock:summary.stock,auditId:summary.auditId,completedAtKst:summary.completedAtKst}));
