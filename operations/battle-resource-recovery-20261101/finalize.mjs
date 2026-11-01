import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
const project=path.resolve('C:/Users/User/Downloads/upload/cnine-card');
const checkout=path.join(project,'tmp/duo-settlement-recovery-20261027');
const out=path.join(project,'operations/battle-resource-recovery-20261101');
const read=file=>JSON.parse(fs.readFileSync(path.join(out,file),'utf8'));
const deploy=read('deployment-result.json'),live=read('live-verification.json');
assert.equal(deploy.exitCode,0);assert.equal(live.pages.commit,deploy.head);
const browsers={chromium:read('local-chromium/report.json'),webkit:read('local-webkit/report.json'),publicWebkit:read('public-webkit-retry/report.json')};
assert.deepEqual(Object.values(browsers).map(b=>b.reports.length),[6,3,2]);
assert(Object.values(browsers).every(b=>b.productionWrites===0&&b.reports.every(r=>r.result&&r.return)));
assert.equal(live.assets.length,8);assert.equal(live.clientManifest.files.length,3);
const result={status:'DEPLOYED_AND_VERIFIED',completedAt:new Date().toISOString(),sourceCommit:deploy.head,pages:live.pages,workers:live.workers,rootCause:'Package release cache marker accidentally inserted into the lobby battle runtime requirement; shipped wrapper and engine remained valid. Both initial readiness and one-time recovery were rejected.',change:'Restore the exact shipped battle version, refresh the shell URL/cache key, regenerate the store variant, and automatically require real loader tests on future main/store app changes.',validation:{baseline:{total:10,pass:8,fail:2},focusedDeployTests:26,chromiumScenarios:6,webkitScenarios:3,publicWebkitScenarios:2,firstEntry:true,repeatPve:true,pveToPvp:true,obsoleteRendererRecovery:true,staticFiles:8,windowsManifestFiles:3,realIphoneHardware:false,installedElectron:false},productionAccountWrites:0,messagesSent:0,battleEngineChanged:false,rewardsChanged:false,storageMaintenancePerformed:false};
result.validation.publicInitialAttempt={error:read('public-webkit/failure.json').error,entryWaitMs:30000,retryEntryWaitMs:60000,productChangedBetweenAttempts:false};
fs.writeFileSync(path.join(out,'completion.json'),JSON.stringify(result,null,2)+'\n');
for(const root of [project,checkout]){
 const target=path.join(root,'docs/qa/battle-resource-recovery-20261101');fs.mkdirSync(target,{recursive:true});
 for(const file of ['completion.json','diagnosis.json','deployment-plan.json','deployment-result.json','live-verification.json'])fs.copyFileSync(path.join(out,file),path.join(target,file));
 for(const [key,name]of [['chromium','browser-chromium.json'],['webkit','browser-webkit.json'],['publicWebkit','public-browser.json']])fs.writeFileSync(path.join(target,name),JSON.stringify(browsers[key],null,2)+'\n');
 const agents=path.join(root,'AGENTS.md'),old=fs.readFileSync(agents,'utf8');
 const note=`## 공통 전투 리소스 준비 오류 복구 — 2026-11-01 최신\n\n- **운영 반영 완료:** 소스 ${deploy.head.slice(0,9)} · Pages ${live.pages.id.slice(0,8)}. 패키지 배포 표기가 메인 전투 요구 버전에 잘못 삽입되어 정상 엔진도 거부하던 오류 복구. 토벌·랭크 등 공통 로더를 사용한 경로에 적용. 기존 래퍼/엔진 버전으로 정확히 복원하고 셸 캐시·원스토어 파생물 갱신.\n- 이후 메인/원스토어 app.js 변경도 실제 번들/로더 검사를 scoped 배포에 강제 포함. 두 배포판 정상 준비·구버전 거부·1회 복구 확인. 전투 엔진·수치·보상/입장·계정 데이터 보존.\n- 관련26검사·Chromium PC/모바일6경로·WebKit 모바일3경로·공개WebKit 토벌/PVP2경로에서 시작→결과→복귀, 재입장/구버전 갱신 확인. 공개8파일·Windows 필수3파일 해시·두Worker100%. 운영계정쓰기0·메시지0, 실기기/설치Electron검사로 기록하지 않는다.\n- 기록 docs/qa/battle-resource-recovery-20261101/, 증거 operations/battle-resource-recovery-20261101/. 기존 폴더/의존성 재사용·Git자동정리OFF·승인없는 유지관리/예약 없음.\n\n`;
 assert(!old.includes('## 공통 전투 리소스 준비 오류 복구 — 2026-11-01 최신'));fs.writeFileSync(agents,note+old);
}
const readme=path.join(checkout,'docs/qa/battle-resource-recovery-20261101/README.md');
fs.appendFileSync(readme,`\n운영 완료: 소스 ${deploy.head.slice(0,9)}, Pages ${live.pages.id.slice(0,8)}. 최종 scoped 검사 26개와 위 브라우저 검증이 모두 통과했다. 배포 후 공개 파일로 WebKit 토벌/PVP 시작→결과→복귀를 재확인했으며 공개8파일·Windows 필수3파일 해시와 두 Worker 100% 활성 버전이 일치했다.\n`);
fs.copyFileSync(readme,path.join(project,'docs/qa/battle-resource-recovery-20261101/README.md'));
console.log(JSON.stringify(result));
