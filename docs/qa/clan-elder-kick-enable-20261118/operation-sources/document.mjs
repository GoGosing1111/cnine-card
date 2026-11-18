import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {out,source,read,git,hash,save} from './common.mjs';

const live=read('live-verification'),deployment=read('deployed'),plan=read('deployment-plan');
assert.equal(deployment.exitCode,0);assert.equal(live.tests,32);assert.equal(git('rev-parse','HEAD'),deployment.head);assert.equal(git('status','--porcelain'),'');
const relative='docs/qa/clan-elder-kick-enable-20261118',target=path.join(source,relative);
assert(!fs.existsSync(target));fs.mkdirSync(target,{recursive:true});
const metrics=(phase,platform)=>JSON.parse(fs.readFileSync(path.join(out,'portal',phase+'-'+platform+'-'+(['android','ios','h5'].includes(platform)?390:1440),'metrics.json')));
const publicUi=metrics('public','desktop');assert(publicUi.cancelWithoutMutation&&publicUi.removedBothRostersOnce&&publicUi.dialogListenersReleased);assert.equal(publicUi.postExit,0);
const platforms=['desktop','android','ios','windows','h5'].map(platform=>({platform,before:metrics('before',platform),after:metrics('candidate',platform)}));
const service=Object.fromEntries(['before','after'].map(phase=>{const s=read('service-'+phase);return [phase,{capturedAt:s.at,conditions:s.conditions,actorId:s.actor.id,roundId:s.round.id,roster:s.roster.length,elders:s.elders.length,eligibleTargets:s.roster.filter(m=>m.canKick).length,samples:s.samples,queryTimings:s.queries.map(q=>({sql:q.sql,ms:q.ms})),totalQueryMs:s.queries.reduce((n,q)=>n+q.ms,0)}];}));
const completion={
 completedAt:new Date().toISOString(),status:'DEPLOYED_VERIFIED',request:'원로가 클랜원 추방할수있게 활성화',sourceCommit:live.sourceCommit,
 behavior:{enabled:true,authorization:'Latest explicit request resumes the feature previously disabled on 2026-10-30.',entry:'로비 → 전체 메뉴 → 클랜 → 내 클랜 → 방출',allowed:'Current active elder may remove an ordinary member of the same current clan.',protected:['self','other elders','other clans','non-elder actors, including OWNER without elder membership','active battle, settlement and reserved defense restrictions','round/revision/joined-at freshness'],atomicEffects:['organization membership','regular-season membership','both faction formations and captain/empty-defense cleanup','audit and idempotency receipt'],preserved:['funds','currency','past combat and reward records','voluntary leave seven-day cooldown','current season admission/review rules'],retry:'Successful replay does not remove a member who later rejoins; a new request with the stale membership timestamp is rejected.'},
 implementation:{policy:'Enable the existing shared policy; retain existing server authorization and transactional removal.',dialog:'Position the native confirmation inside the visible parent game viewport, including the command header, because an auto-height iframe otherwise centers the buttons offscreen.',renderWork:'Coalesce scroll/resize into one animation frame, avoid unchanged style writes, and disconnect all new listeners/observer and cancel pending frame on close/pagehide.',cache:'Version the organization document/module import chain with 20261118-elder-kick.'},
 verification:{tests:32,failed:0,files:plan.tests,checks:plan.checks,cases:['actual organization and legacy clan routes','current season five elder/ordinary/owner/foreign authority','battle, settlement and reservation locks','two-roster/faction consistency','injected audit and receipt failures roll back','competing elders and repeat requests','rejoin followed by old receipt and stale request','current admission and voluntary leave cooldown'],browser:'Five actual lobby entry paths with isolated PGlite APIs, cancel without POST, confirm once, both rosters removed once, listener counts restored, then exit with zero requests.',publicUi},
 performance:{conditions:'Windows headless Chromium and WebKit; Android/iOS/Windows launch URL/H5 iframe emulation. No physical handset or installed-client measurements. Local source assets plus isolated PGlite APIs for before/after; actual CDN assets plus isolated APIs for public smoke. Single samples; no overall speed improvement claimed.',service,bottleneck:'The unchanged ten database round trips dominate production overview latency. No additional SQL or per-member request was introduced. Dialog positioning work is scheduled at most once per animation frame and stops on close.',platforms,limitations:['Before frame sampling covers the roster because removal is disabled; after sampling additionally covers opening, cancelling and confirming. These frame workloads are not equivalent.','WebKit retains its existing ResizeObserver warning; enabled-action sampling recorded one 295 ms long frame. This is recorded, not claimed fixed.','Desktop before/after was repeated after the test process had finished to avoid test CPU contention.','Loading samples include local process/browser/cache variation; Windows and H5 observations are emulated entry paths.']},
 deployment:{command:'npm run deploy:production -- --scoped',base:plan.base,...live,log:deployment.log},
 productionEffects:{accountWrites:0,memberRemovals:0,messages:0,schemaChanges:0},
 qaNotes:['Initial new-season test failed because its admission-only fixture lacked clan_faction_state. A dedicated kick fixture adds the isolated table; the final release gate passes all 32 tests.','Initial UI confirmation placed its controls below the parent viewport. The scoped dialog positioning fix was then verified across the five platforms.','The old OFF regression assertions were replaced with the previously reviewed ON suites and current-season coverage. Historical OFF records remain preserved.'],
 screenshots:['ui-pc-confirmation.png','ui-android-confirmation.png','ui-public-confirmation.png'],
 localEvidence:'operations/clan-elder-kick-enable-20261118/'
};
fs.writeFileSync(path.join(target,'completion.json'),JSON.stringify(completion,null,2)+'\n');
for(const [from,to] of [['candidate-desktop-1440','ui-pc-confirmation.png'],['candidate-android-390','ui-android-confirmation.png'],['public-desktop-1440','ui-public-confirmation.png']])fs.copyFileSync(path.join(out,'portal',from,'elder-confirmation.png'),path.join(target,to));
fs.copyFileSync(path.join(out,deployment.log),path.join(target,deployment.log));
fs.mkdirSync(path.join(target,'operation-sources'));
for(const file of ['common.mjs','capture.mjs','portal.mjs','browser-suite.mjs','release.mjs','commit.mjs','document.mjs'])fs.copyFileSync(path.join(out,file),path.join(target,'operation-sources',file));
fs.writeFileSync(path.join(target,'operation-sources','README.txt'),'Evidence copies from operations/clan-elder-kick-enable-20261118. Run from that original directory; relative imports reuse the existing production checkout and prior read-only connection helpers. No credentials are embedded. Baseline runtime and full read-only samples are preserved there. Production deployment must always use the scoped release command. Browser mutations are intercepted into isolated PGlite fixtures, never real users.\n');
const table=platforms.map(p=>'| '+p.platform+' | '+p.before.entry.map(e=>e.ms).join(' / ')+' | '+p.after.entry.map(e=>e.ms).join(' / ')+' | '+p.after.frames.p95Ms+' / '+p.after.frames.maxMs+' | '+p.after.frames.over50+' |').join('\n');
fs.writeFileSync(path.join(target,'README.md'),`# 원로 클랜원 추방 활성화 — 2026-11-18

현재 원로가 자기 클랜의 일반 클랜원을 방출할 수 있다. 사용자 최신 요청으로 10월 30일 OFF 지시를 갱신했다. 경로는 **로비 → 전체 메뉴 → 클랜 → 내 클랜 → 방출**이다.

본인·다른 원로·타 클랜원은 보호하며, 진행 중 전투·정산·예약 방어 제한을 유지한다. 두 가입 명단과 편성·지정은 한 거래로 정리하고 재화·과거 전투·보상 기록을 보존한다. 응답 재시도나 재가입 후 이전 요청으로 다시 추방하지 않는다. 기존 자진 탈퇴 7일 제한은 그대로다.

자동 높이 iframe 안의 확인창이 화면 아래에 배치되던 문제도 수정했다. 현재 보이는 게임 영역에 취소·방출 버튼이 표시되며, 닫으면 추가 스크롤·크기 관찰과 예약 프레임을 해제한다.

소스 ${live.sourceCommit}, Pages ${live.pages.id}. 두 Worker 100%, 관련 32검사와 컴파일 검사 통과. 운영 공개 파일 ${live.files.length}개와 Windows 매니페스트 ${live.windowsManifest.verified}개 해시 일치. 실제 운영 계정 변경·추방·메시지 발송은 0건이다. 화면의 확인 동작은 격리 PostgreSQL에서만 실행했다.

## 성능과 검수 조건

Windows Node에서 실제 운영 개요 서비스를 READ ONLY로 호출했다. 첫/반복 957/790 → 913/800ms, SQL 10회 유지. 주 대기는 DB 왕복이며 추가 조회가 없다. 네트워크 포함 단회이므로 속도 개선을 단정하지 않는다.

Windows headless Chromium/WebKit에서 실제 로비 메뉴로 진입했다. Android·iOS·Windows URL·H5는 에뮬레이션이며 실휴대기기·설치형 앱 측정이 아니다. PC 비교는 테스트 프로세스가 끝난 후 실행했다.

| 경로 | 이전 첫/재진입 ms | 이후 첫/재진입 ms | 이후 프레임 p95/최대 ms | 50ms 초과 |
|---|---:|---:|---:|---:|
${table}

이전 프레임은 명단, 이후는 확인창 열기·취소·방출을 포함하여 동작 부하가 같지 않다. WebKit 기존 ResizeObserver 경고와 이후 295ms 긴 프레임 1건을 기록했다. 모든 경로에서 퇴장 후 클랜 요청 0건, 확인창 종료 후 추가 리스너 0건이다. 운영 CDN 화면도 같은 핵심 동작을 확인했다.

상세 수치·검사·배포 버전은 [completion.json](completion.json)에 보존했다.
`);
const agentPath=path.join(source,'AGENTS.md'),previous=fs.readFileSync(agentPath,'utf8');
const header=`## 원로 클랜원 추방 ON — 2026-11-18 최신

- 사용자 최신 요청으로 10월 30일 원로 추방 OFF를 해제했다. **클랜 → 내 클랜 → 방출**에서 현재 원로가 자기 클랜의 일반 클랜원을 추방할 수 있다. 본인·다른 원로·타 클랜과 전투·정산·예약 방어 보호는 유지한다.
- 두 가입 명단·편성·지정 정리를 기존 단일 거래로 처리하며 재화·과거 기록·자진 탈퇴7일 규칙을 보존한다. 동시 원로 요청·실패 롤백·재가입 후 옛 요청을 검증했다. 실제 운영 계정 변경·추방·메시지0건.
- iframe 높이 때문에 확인 버튼이 화면 밖에 있던 문제를 수정했다. 보이는 게임 영역에 확인창을 맞추고 닫을 때 관찰·리스너·예약 프레임을 해제한다.
- 소스 ${live.sourceCommit.slice(0,9)} · Pages ${live.pages.id.slice(0,8)} · 두 Worker100%. 관련32검사, 운영 파일${live.files.length}개·Windows 매니페스트${live.windowsManifest.verified}개 해시 일치 및 운영 CDN 핵심 동작 확인.
- PC·Android/WebKit·Windows URL·H5 실제 로비 경로의 첫/재진입·프레임·퇴장을 확인했다. 실휴대기기·설치형 앱 측정 아님. PC1490/471→1325/343ms(로컬 단회), 운영 READ ONLY957/790→913/800ms(SQL10회 유지·DB 왕복이 주 대기). 로딩 개선을 주장하지 않는다. WebKit 기존 경고·방출 중 긴 프레임1건 기록, 퇴장 후 클랜 요청0건. [운영·권한·검증·성능](${relative}/completion.json).

`;
assert(!previous.startsWith('## 원로 클랜원 추방 ON — 2026-11-18'));
fs.writeFileSync(agentPath,header+previous);
const files=['AGENTS.md',...fs.readdirSync(target,{recursive:true}).filter(f=>fs.statSync(path.join(target,f)).isFile()).map(f=>relative+'/'+f.replaceAll('\\','/'))];
save('documentation-ready',{at:new Date().toISOString(),sourceCommit:live.sourceCommit,files,evidenceHash:hash(fs.readFileSync(path.join(target,'completion.json')))});
console.log(JSON.stringify({files:files.length,folder:relative}));
