import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
const folder='ranked-start250-20261104',out=new URL('./evidence/',import.meta.url),read=async name=>JSON.parse(await fs.readFile(new URL(name+'.json',out),'utf8'));
const [apply,rehearse,verify,replay,independent,tests]=await Promise.all(['apply','rehearse','verify','replay','independent','tests'].map(read));
for(const r of [rehearse,verify,replay])assert.equal(r.sourceHash,apply.sourceHash);
assert.equal(apply.committed,true);assert.equal(apply.correctedCount,1886);assert.equal(tests.passed,5);assert.equal(tests.failed,0);assert.equal(replay.additionalWrites,0);assert.equal(independent.unplayedScoreMismatch,0);assert.equal(independent.productionWrites,0);assert.equal(independent.operationSessionsRemaining,0);assert.equal(independent.protectedPlayedAtCommit,109);assert.equal(independent.auditId,apply.auditId);
const r=apply.receipt,completedAtKst=new Intl.DateTimeFormat('sv-SE',{timeZone:'Asia/Seoul',dateStyle:'short',timeStyle:'medium'}).format(new Date(r.completedAt))+' KST';
const evidence=['inspect.json','plan.json','preflight-profiles.json','runtime-sources.json','correct.mjs','correct.test.mjs','run.mjs','evidence/tests.json','evidence/rehearse.json','evidence/apply.json','evidence/commit-candidate.json','evidence/verify.json','evidence/replay.json','evidence/independent.json'];
const completion={status:'COMPLETED_AND_INDEPENDENTLY_VERIFIED',operationKey:r.operationKey,seasonKey:r.seasonKey,completedAt:r.completedAt,completedAtKst,auditId:r.auditId,correctedCount:1886,oldScore:1000,newScore:250,highestScoreCorrected:250,playedAccountsPreserved:109,initialScore:250,initialScoreAlreadySavedBeforeOperation:true,nextSeasonInitialScore:250,settingsWrites:0,archiveCount:1886,accountSyncCount:1886,remainingUnplayedScoreMismatch:0,sourceHash:apply.sourceHash,planHash:apply.planHash,testsPassed:5,failureRollback:true,normalRollback:true,concurrentFightAndProfileWritesBlocked:true,seasonLifecycleBlocked:true,independentReadOnly:true,selectOnlyReplay:true,additionalReplayWrites:0,messagesSent:0,gameDeployment:false,storageMaintenance:false,scheduledAutomations:0,evidence:await Promise.all(evidence.map(async file=>({file,sha256:createHash('sha256').update(await fs.readFile(new URL(file,import.meta.url))).digest('hex')})))};
const readme=`# 랭크전 미참여 계정 250점 보정 — 2026-11-04

**운영 완료: ${completedAtKst} · 감사 ${r.auditId}. 시즌 25 미참여 1,886계정의 현재 점수·시즌 최고 점수를 1,000→250으로 보정했다. 이미 직접 경기를 치른 109계정의 점수·최고점·승패는 보존했다.**

사용자 요청: “현 진행중인 랭크전 한판도 안한사람들 싹다 250점으로 변경해 최초 시작 점수 250점으로 변경”.

운영 pvp_settings_v1.initialScore와 tier_settings_v1.pvp.initialScore는 첫 조회 시 이미 250으로 저장되어 있었다(설정 갱신시각 2026-11-04 00:41:39 KST). 이 설정을 다시 쓰지 않고 보존했다. 실제 서버 설정 정규화·신규 프로필 생성·다음 시즌 설정 전달 함수를 검사해 250점 시작을 확인했다. 아직 랭크 프로필이 없는 2,012계정은 첫 진입 시 기존 생성 경로에서 250점으로 시작하며, 프로필을 인위적으로 만들지 않았다.

대상은 현재 시즌 wins=0, losses=0이고 현재 시즌 공격 경기 이력·완료 영수증·전투 감사가 모두 없는 기존 프로필이다. 자동 방어전만 있었던 36계정과 이전 시즌에만 플레이한 계정은 포함한다. 일반 USER 1,879계정(정상 1,851·BANNED 28), ADMIN 3, OWNER 4를 포함한 전체 미참여 프로필 1,886개다. 정지·권한 상태는 변경하지 않았다. 듀오 점수·이전 시즌 정산·보상·재화·편성은 변경하지 않았다.

- 실제 경기의 pvp_settings_v1 FOR SHARE와 맞물리는 FOR UPDATE 잠금, 신규 프로필·다른 점수 쓰기를 막는 pvp_profiles 테이블 잠금, 시즌 전환 잠금으로 현재 시즌과 대상 목록을 고정했다. 두 번째 연결에서 각 경합이 차단됨을 확인했다. USER_LOCK 서비스를 호출한 작업은 아니다.
- 기존 ranked_reform_profile_archive_v1에 원래 1,886행을 보존하고 현재/최고점·감사·완료 영수증을 단일 거래로 적용했다. 전후 전체 프로필 비교로 비대상 109개가 동일함을 확인했다. pvp 동기화 1,886개가 갱신됐다.
- 관련 PostgreSQL 검사 5개 통과: 미참여·방어전/이전시즌 구분, 사전조회 후 첫 경기 보존, 기록 모순/설정변경/시즌전환 차단, 후반 쓰기 실패 전체원복, 실제 서버의 신규·다음시즌 250점 시작. 최초 검사 코드 문법 오류를 수정한 로그도 보존했다.
- 운영 후반 영수증 쓰기 실패 주입 및 정상 예행연습을 모두 원복한 뒤 같은 소스 해시로 1회 적용했다. 독립 READ ONLY에서 현재 미참여 1,886명 전원250·불일치0·보존 원본/감사/영수증/동기화와 실제 서버 조회를 검증했다. SELECT전용 재실행 추가쓰기0·운영 잠금 세션0.

완료키 **${r.operationKey}**. 같은 요청을 새 키로 반복하거나 이후 정상 경기 점수를 250으로 되돌리지 않는다. 원본 계획·계정별 전후 스냅샷·실행 로그는 operations/${folder}/에 보존하며 공개 소스 기록에는 계정별 원본을 포함하지 않는다. completion.json에 증거 해시를 기록했다. 소스 변경이 필요 없는 운영 데이터 보정이므로 게임 재배포 없음. 메시지·화면조작·용량 유지관리·자동화 예약 없음.
`;
const entry=`## 랭크전 시즌25 미참여 1,886계정 250점 보정 완료 — 2026-11-04

- **운영 완료:** **${completedAtKst}·감사${r.auditId}**. 시즌25 직접 경기0회 **1,886계정 현재/시즌최고 1,000→250**, 기존참가109계정 점수/승패 보존. 자동방어만36 포함·현재시즌 공격이력/영수증/감사0 대조.
- **시작점수250은 운영 두설정에 이미 저장됨을 확인**, 실제 신규생성/다음시즌250 검사. 설정추가쓰기0·듀오/과거정산/재화/편성 보존.
- 완료키 **${r.operationKey}**. 동일요청 새키반복·이후 정상경기점수 덮기 금지. 경기설정/프로필/시즌전환 DB잠금·원본1886행/보정/감사/영수증 단일거래·관련5검사·실패/정상예행원복·독립READ ONLY·SELECT재실행쓰기0·동기화1886·잠금세션0.
- 기록 docs/qa/${folder}/, 원본증거 operations/${folder}/. 메시지/게임재배포/화면조작/유지관리/예약0·기존폴더/의존성 재사용·Git자동정리OFF.

`;
const write=(name,value)=>fs.writeFile(new URL(name,import.meta.url),value,{flag:'wx'});
await write('completion.json',JSON.stringify(completion,null,2)+'\n');await write('README.md',readme);await write('evidence/agents-entry.md',entry);
const docs=new URL('../../docs/qa/'+folder+'/',import.meta.url);await fs.mkdir(docs,{recursive:true});await fs.writeFile(new URL('README.md',docs),readme,{flag:'wx'});await fs.writeFile(new URL('completion.json',docs),JSON.stringify(completion,null,2)+'\n',{flag:'wx'});
const agents=new URL('../../AGENTS.md',import.meta.url),current=await fs.readFile(agents,'utf8');assert(!current.includes(r.operationKey));await fs.writeFile(agents,entry+current);console.log(JSON.stringify({status:completion.status,correctedCount:1886,auditId:r.auditId,completedAtKst}));
