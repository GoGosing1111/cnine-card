import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {createHash} from 'node:crypto';
const read=async file=>JSON.parse(await fs.readFile(new URL('./evidence/'+file,import.meta.url),'utf8'));
const [apply,dry,replay,independent,snapshots]=await Promise.all(['apply.json','dry-run.json','replay.json','independent.json','committed-snapshots.json'].map(read));
assert.equal(apply.replayed,false);assert.equal(apply.leasesReleased,true);assert.equal(dry.rollbackVerified,true);assert.equal(dry.injectedFailureRollback,true);assert.equal(dry.leasesReleased,true);assert.equal(replay.noWriteReplayVerified,true);assert.equal(independent.status,'INDEPENDENTLY_VERIFIED');assert.equal(independent.operationalWrites,0);
assert.equal(apply.sourceSha256,dry.sourceSha256);assert.equal(replay.sourceSha256,apply.sourceSha256);assert.equal(independent.auditId,apply.receipt.auditId);
assert.deepEqual(snapshots.before.state.stock,snapshots.after.state.stock);assert.deepEqual(snapshots.before.state.issues,snapshots.after.state.issues);assert.deepEqual(snapshots.before.state.otherTitleOwners,snapshots.after.state.otherTitleOwners);assert.deepEqual(snapshots.before.state.titleLoadout,snapshots.after.state.titleLoadout);
const completedAtKst=new Date(Date.parse(independent.completedAt)+9*3600000).toISOString().slice(0,19).replace('T',' ')+' KST';
const hashes={};for(const f of ['preflight.json','before.json','read.json','dry-run.json','apply.json','committed-snapshots.json','independent.json','replay.json'])hashes[f]=createHash('sha256').update(await fs.readFile(new URL('./evidence/'+f,import.meta.url))).digest('hex');
const result={status:'COMPLETED_AND_INDEPENDENTLY_VERIFIED',operationKey:independent.operationKey,userId:independent.user.id,nickname:independent.user.nickname,completedAt:independent.completedAt,completedAtKst,auditId:independent.auditId,title:independent.title,mercenary:independent.mercenary,quantity:1,copiesBefore:0,copiesAfter:1,planHash:apply.planHash,sourceSha256:apply.sourceSha256,stock:independent.stock,limitedStockConsumed:0,limitedIssueRecordsAdded:0,otherTitleOwnersPreserved:true,titleLoadoutPreserved:true,unitTests:{total:4,passed:4},injectedFailureRollback:true,normalDryRunRollback:true,selectOnlyReplay:true,leasesReleased:true,independentReadOnly:true,independentQueries:independent.selectQueries,automaticEquip:false,messagesSent:0,gameDeployments:0,storageMaintenance:0,schedulesCreated:0,evidenceHashes:hashes};
await fs.writeFile(new URL('./completion.json',import.meta.url),JSON.stringify(result,null,2)+'\n',{flag:'wx'});
const text=`# 찬호 버스기사 칭호·은설 지급 — 2026-11-05

운영 지급 완료: **${completedAtKst} · 감사 ${result.auditId}**.

사용자 “찬호 계정에 버스기사 칭호 지급하고 은설 용병까지 지급해” 요청으로 정확한 닉네임·ID·인증 신원을 확인한 **찬호 ID4597**에게 다음을 직접 지급했다.

- **버스기사 RAID_BUS_DRIVER / 655095**: 미보유 → 영구 보유. 기존 다른 5명 보유와 찬호의 칭호 장착 유지.
- **은설 V-973 / SSS LIMITED**: 0 → 1장, 기본 1레벨. 실제 계정 목록과 랭크용 보유 조회에서 표시·편성 가능 확인.
- 관리자 직접 지급으로 팩 한도4/발행3, 큐브 한도5/발행2, 기존 한정 발행·제작 집계를 유지했다. 코인·다른 재화·성장·다른 보유·용병 편성 보존.
- USER_LOCK·DB 계정 잠금과 현재 보유 비교 후 칭호/용병/획득/감사/영수증을 한 거래로 확정. collection +1, 랭크 원본 버전 +2, 랭크 점수 변경 없음.
- 관련 4검사 통과: 원자 지급·보존·재시도, 중간/최종 실패 원복, 계획/신원/잠금 검증, 조회 이후 보유 변경 차단. 초기 테스트 생성기의 SQL 달러 인용 오류를 수정한 뒤 4건 모두 통과했다.
- 운영 실패/정상 예행연습 원복, 독립 READ ONLY 30조회, SELECT 전용 재실행 추가쓰기0, 잠금 반환 확인. 실기기 화면 검수는 수행하지 않았다.

완료 키: \`${result.operationKey}\`. 같은 요청을 새 키로 반복 지급하거나 이후 정상 소비·성장·칭호 변경을 덮지 않는다. 기존 버스기사 보유자 코인 지급을 재실행하지 않았다.

계획 SHA-256: \`${result.planHash}\`. 실행 파일 집합 SHA-256: \`${result.sourceSha256}\`.
계획·실행기·검사·완료 요약은 \`operations/chanho-bus-driver-eunseol-20261105/\`, 원본 사전조회·전후 스냅샷·감사/영수증 및 독립검증은 해당 \`evidence/\`에 보존한다. 변경 복구는 이 기록과 이후 정상 거래를 대조하여 별도 지시로 수행하며 자동 역지급하지 않는다.

자동 장착·메시지·게임 재배포·유지관리·삭제·예약0. 기존 작업 폴더·의존성 재사용.
`;
await fs.writeFile(new URL('./README.md',import.meta.url),text,{flag:'wx'});
const qa=new URL('../../docs/qa/chanho-bus-driver-eunseol-20261105/',import.meta.url);await fs.mkdir(qa,{recursive:true});await fs.writeFile(new URL('README.md',qa),text,{flag:'wx'});
console.log(JSON.stringify({status:result.status,userId:result.userId,nickname:result.nickname,title:result.title.name,mercenary:result.mercenary.name,quantity:1,auditId:result.auditId,completedAtKst}));
