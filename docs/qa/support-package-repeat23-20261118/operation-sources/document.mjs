import fs from 'node:fs';import path from 'node:path';import assert from 'node:assert/strict';
import {out,source,read,save,git,hash} from './common.mjs';
const live=read('live-verification'),deployed=read('deployed'),plan=read('deployment-plan'),preview=read('progress-preview');
assert.equal(live.tests,43);assert.equal(deployed.exitCode,0);assert.equal(git('rev-parse','HEAD'),live.sourceCommit);assert.equal(git('status','--porcelain'),'');
const relative='docs/qa/support-package-repeat23-20261118',folder=path.join(source,relative);assert(!fs.existsSync(folder));fs.mkdirSync(folder,{recursive:true});
const platforms=['desktop','android','ios','windows','h5'].map(platform=>({platform,before:read('ui-before-'+platform),after:read('ui-candidate-'+platform)}));
const publicUi=['desktop','h5'].map(p=>read('ui-public-'+p));for(const r of publicUi){assert.deepEqual(r.errors,[]);assert.equal(r.productionWrites,0);assert.equal(r.entries.length,2);}
const before=read('service-before'),after=read('service-after');
const completion={completedAt:new Date().toISOString(),status:'DEPLOYED_VERIFIED',sourceCommit:live.sourceCommit,runtimeCommit:read('committed').head,
 request:{priceWon:49800,salesThrough:'2026-11-23 23:59 KST',exclusiveCutoff:'2026-11-24T00:00:00+09:00',confirmedChoice:'앞으로도 10회마다 자동 반복'},
 behavior:{repeatEveryPurchases:10,rewardsPerCycle:[{purchases:1,bonusTrillions:1000,cubes:5},{purchases:2,bonusTrillions:2000,cubes:10},{purchases:3,bonusTrillions:3000,cubes:15},{purchases:4,bonusTrillions:6000,cubes:20},{purchases:5,bonusTrillions:8000,cubes:40},{purchases:10,bonusTrillions:8000,cubes:100}],totalBonusPerCycle:{coins:'28000000000000000',cubes:190},existingAtLeastTen:'Next purchase begins at tier one, including existing counts of 12 and 20; no retroactive rewards for old excess purchases.',existingBelowTen:'Preserve current progress toward ten.',bulk:'One through 100 purchased units cross cycle boundaries and grant every newly reached tier. Example 100 fresh units: 330000000000000000 coins including base packages and 1900 bonus cubes.',pending:'Existing pending orders can still be fulfilled after closing; completed receipts replay unchanged.',preserved:['price and base package items','season-pass eligibility','ONE store exclusion','original purchase count and already delivered rewards','older immutable product snapshots','purchase/payment/refund history','previous operator reset markers','account lock, state compare-and-swap and atomic receipt'],entry:'로비 → 전체 메뉴 → 서버 안내 → 패키지 구매'},
 implementation:{policyCode:'SUPPORT_PACKAGE_PURCHASE_BONUS_20261115_V1',stateVersion:2,baseline:'The next ordinary fulfillment stores a validated repeatBaseline in the existing counter transaction. Original records are never reset by deployment or GET. Existing version-one counts at least ten start at zero effective cycle progress; lower counts retain progress.',validation:'Exact BigInt coin totals and safe integer cube counts are checked against the preserved baseline plus newly earned tiers. Corrupt totals fail closed.',workBound:'At most eleven cycles for a maximum 100-unit order, irrespective of historical purchase count. Aggregate one coin grant and one cube item grant; no per-cycle database call.',cache:'Buyer/CMS imports use 20261118-package-repeat23-v1; root shell and service worker share package-repeat23-20261118-v1 prefix.'},
 existingAccounts:{readOnlySnapshotAt:preview.sourceSnapshotAt,validated:preview.rows.length,restartAtOne:preview.restartAtOne,preservePartial:preview.preservePartial,productionWrites:0,detailsKeptLocally:'operations/support-package-repeat23-20261118/progress-preview.json'},
 verification:{uniqueTests:43,firstGate:{tests:43,passed:41,failed:2,log:plan.retainedPassingTests.log,explanation:'Both failures were a pre-existing base-items-only assertion in cutoff fulfillment, omitting the existing first-purchase five cube bonus. Corrected the expected items without changing runtime code.'},finalGate:{tests:4,passed:4,failed:0,retainedPassingTests:39,runtimeIdenticalTo:plan.retainedPassingTests.head},testFiles:plan.initialTests,checks:plan.checks,cases:['current and historical policies','partial and completed old counters','9→10→11 and 19→20→21 boundaries','multi-cycle 100-unit orders','SQLite and PostgreSQL exact grants and accounting','inventory, audit and receipt failure rollback','concurrent confirmation and repeated receipt','old receipt after later cycles','corrupt baseline/totals rejection','November 19 stays open; all of November 23 stays open; November 24 rejects new orders','post-cutoff pending fulfillment and replay','eligibility, CMS quote/session recovery and ONE store exclusion'],publicUi},
 performance:{conditions:'Single samples, Windows Node and Windows headless Chromium/WebKit; browser/PWA paths plus Android/iOS/Windows URL emulation. No physical device or installed-native-client measurement. UI uses actual lobby navigation, source/CDN assets and isolated PostgreSQL APIs; production services use live PostgreSQL READ ONLY. No overall speed improvement claimed.',beforeService:before,afterService:after,bottleneck:'Production service latency is dominated by its existing database round trips; query counts remain eight on the first catalog access and seven thereafter. Repeat calculation adds no SQL. Each order aggregates rewards instead of writing a row per cycle.',platforms,limits:['WebKit has long frames before and after while changing quantities and retains its existing ResizeObserver warning. No claim that these are resolved.','A background server-support/status poll belongs to the lobby navigation; exit checks count package data requests separately. Detached package DOM mutations and new package requests are zero.','Browser sync/ticket POST attempts were intercepted and blocked; no package purchase POST or production write was made.','H5 retains its existing generated production variant because this package is excluded there. Its menu exclusion and absence of package requests were verified.']},
 deployment:{...live,command:'npm run deploy:production -- --scoped',base:plan.base,log:deployed.log},
 productionEffects:{directAccountWrites:0,manualResets:0,coinsGranted:0,cubesGranted:0,ordersCreated:0,messages:0,schemaChanges:0},
 qaNotes:['An initial UI guard counted an unrelated blocked sync/ticket request as a package mutation; final verification records that blocked background request and requires no package POST.','An iOS exit assertion initially included a normal lobby status poll; the final package-specific exit measure is zero requests and zero detached DOM changes.','The optional old standalone H5 authoring builder failed on its pre-existing js/app.js patch, which this task did not edit. The production release uses the unchanged generated H5 variant; no unrelated patch repair or variant rebuild was attempted. The source cache-match string was kept consistent for future builds.'],
 screenshots:['desktop-one.png','android-one.png','desktop-bulk100.png','public-desktop-one.png','public-desktop-deadline.png'],localEvidence:'operations/support-package-repeat23-20261118/'
};
fs.writeFileSync(path.join(folder,'completion.json'),JSON.stringify(completion,null,2)+'\n');
for(const [from,to]of [['candidate-desktop-one.png','desktop-one.png'],['candidate-android-one.png','android-one.png'],['candidate-desktop-bulk100.png','desktop-bulk100.png'],['public-desktop-one.png','public-desktop-one.png'],['public-desktop-deadline.png','public-desktop-deadline.png']])fs.copyFileSync(path.join(out,from),path.join(folder,to));
for(const name of [deployed.log,plan.retainedPassingTests.log])fs.copyFileSync(path.join(out,name),path.join(folder,name));
fs.mkdirSync(path.join(folder,'operation-sources'));
for(const name of ['common.mjs','preflight.mjs','capture.mjs','progress-preview.mjs','ui.mjs','browser-suite.mjs','release.mjs','document.mjs'])fs.copyFileSync(path.join(out,name),path.join(folder,'operation-sources',name));
fs.writeFileSync(path.join(folder,'operation-sources','README.txt'),'Evidence copies from operations/support-package-repeat23-20261118. Run from the original directory, reusing the existing production checkout and connection helpers. No credentials are embedded. Baseline runtime and full read-only counter records remain in the original directory. All fulfillment tests use isolated databases; live service captures are READ ONLY. Production release goes through the scoped pipeline.\n');
const table=platforms.map(p=>`| ${p.platform} | ${p.before.entries.map(e=>e.interactiveMs).join(' / ')} | ${p.after.entries.map(e=>e.interactiveMs).join(' / ')} | ${p.platform==='h5'?'패키지 미노출':p.after.entries.map(e=>Math.round(e.frames.maxMs)).join(' / ')} |`).join('\n');
fs.writeFileSync(path.join(folder,'README.md'),`# 49,800원 패키지 23일까지 · 10회 보상 자동 반복

판매 기간은 **2026년 11월 23일 23:59까지(한국시간)**이며 11월 24일 00:00부터 신규 신청을 차단한다. 사용자 확인에 따라 누적 보상은 앞으로도 10회마다 반복한다.

기존 10회 이상 계정은 다음 구매부터 1회차 보상으로 시작한다. 10회 미만은 현재 진행도를 이어가며 기존 보상·결제·주문·초기화 기록은 보존한다. 확인한 34개 기록 중 완료 13개·진행 중 21개다. 배포 시 계정 기록을 일괄 수정하지 않으며, 다음 정상 구매 승인 거래에서 반복 계산 기준을 함께 저장한다. 조회만으로는 쓰지 않는다.

매 주기 1·2·3·4·5·10회 보상은 그대로이며, 총 보너스는 코인 2경 8,000조·큐브 190개다. 일괄 구매도 경계를 넘어 모든 회차 보상을 받는다. 최대 100회는 기본 포함 코인 33경·큐브 1,900개이며 한 거래에서 지급한다. 기존 종료 후 대기 주문 처리와 응답 재시도 방지를 유지한다.

소스 ${live.sourceCommit} (게임 변경 ${read('committed').head}), Pages ${live.pages.id}, 두 Worker 100%. 고유 검사 43개 통과. 첫 게이트의 오래된 큐브 누락 기대값 2건만 보완해 마감 검사 4개를 재실행했고, 게임 코드가 동일한 나머지 39개 결과를 유지했다. 공개 파일 ${live.files.length}개와 Windows 매니페스트 ${live.windowsManifest.verified}개 해시를 대조했다. 실제 계정 직접 지급·회수·초기화·주문 접수·메시지는 0건이다.

## 성능과 검수 조건

Windows Node 운영 READ ONLY 패키지 조회: 12회 계정 첫/반복 688/555 → 614/510ms, SQL 8/7회 유지. 5회 계정은 547/559 → 512/520ms, SQL 7회 유지다. DB 왕복이 주 대기이며 단회·네트워크 포함 측정이다. 반복 계산은 최대 11개 주기로 제한하고 코인·큐브를 합산하여 추가 조회나 주기별 쓰기를 만들지 않았다. 속도 개선을 단정하지 않는다.

실제 로비 → 전체 메뉴 → 서버 안내 → 패키지 경로를 Windows headless Chromium/WebKit에서 확인했다. Android·iOS·Windows URL은 에뮬레이션이며 실휴대기기·설치형 앱 측정은 아니다. H5는 기존 패키지 미노출을 확인했다.

| 경로 | 이전 첫/재진입 ms | 이후 첫/재진입 ms | 이후 최대 프레임 ms |
|---|---:|---:|---:|
${table}

WebKit 수량 변경 중 긴 프레임과 기존 ResizeObserver 경고가 이전·이후에 관측됐다. 화면 종료 후 패키지 요청과 분리된 DOM 갱신은 모두 0건이다. 로비의 기존 상태 조회는 별도로 기록했다. 운영 CDN에서도 구매 화면과 H5 미노출을 확인했다.

상세 사례·초기 실패 사유·배포·수치는 [completion.json](completion.json)에 보존했다.
`);
const agents=path.join(source,'AGENTS.md'),old=fs.readFileSync(agents,'utf8');assert(!old.startsWith('## 49,800원 패키지 11월 23일까지'));
fs.writeFileSync(agents,`## 49,800원 패키지 11월 23일까지 · 10회마다 자동 반복 — 2026-11-18 최신

- 사용자 선택 **앞으로도 10회마다 자동 반복**. 판매는 **11월 23일 23:59 KST까지**, 24일00:00 신규 신청 차단이다. 매 주기1·2·3·4·5·10회 보너스 코인 합계2경8,000조·큐브190개와 기본 구성·가격을 유지한다. 1~100회 일괄 구매도 모든 주기를 계산한다.
- 기존10회 이상은 다음 구매부터1회차, 10회 미만은 진행도 유지. READ ONLY34개 기록에서 완료13·진행21개를 대조했다. 기존 지급·주문·수령·초기화 기록은 보존하며 운영 직접 쓰기·추가 지급·메시지0건이다.
- 기존 캠페인 키에 version2 repeatBaseline을 다음 정상 구매 승인 거래에서 저장한다. 원래 총 구매 횟수·지급 합계를 보존하므로 이후 운영 처리는 현재 supportPackageWithBonus/AdvanceBonus 기준을 사용한다. 조회 시 기록 변경 없음. 과거 영수증은 그대로 재생하며 일괄 초기화나 과거 초과 구매분 소급 지급이 아니다.
- 소스 ${live.sourceCommit.slice(0,9)}(게임 ${read('committed').head.slice(0,9)}) · Pages ${live.pages.id.slice(0,8)} · 두 Worker100%. 고유43검사. 초기 마감 검사2건의 기존 큐브5개 누락 기대값만 수정하여 해당4검사 재통과, 나머지39검사 유지. 운영 파일${live.files.length}개·Windows 매니페스트${live.windowsManifest.verified}개 대조.
- PC·Android/WebKit·Windows URL의 실제 로비 경로와 H5 패키지 미노출, 운영 CDN을 검수했다. 실기기·설치형 앱 아님. 운영 READ ONLY 첫/반복688/555→614/510ms(SQL8/7 유지·DB 왕복이 주 대기), 추가 SQL0·최대11주기 계산·합산 지급. UI 단회값과 WebKit 기존 경고·긴 프레임 기록, 퇴장 후 패키지 요청/DOM갱신0. 속도 개선은 주장하지 않는다. [조건·지급·배포·성능](${relative}/completion.json).

`+old);
const files=['AGENTS.md',...fs.readdirSync(folder,{recursive:true}).filter(f=>fs.statSync(path.join(folder,f)).isFile()).map(f=>relative+'/'+f.replaceAll('\\','/'))];save('documentation-ready',{at:new Date().toISOString(),sourceCommit:live.sourceCommit,files,evidenceHash:hash(fs.readFileSync(path.join(folder,'completion.json')))});console.log(JSON.stringify({files:files.length,folder:relative}));
