import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';

const workspace='C:/Users/User/Downloads/upload/cnine-card';
const root=workspace+'/output/revan-live-20261027/release-checkout';
const folder='blackwing-confirm8-20261101',out=new URL('./',import.meta.url);
const read=name=>JSON.parse(fs.readFileSync(new URL(name+'.json',out)));
const deployment=read('deployment-result-retry'),live=read('live-verification');
const local=read('browser-local/browser-battlefield'),publicUi=read('browser-public/browser-battlefield');
assert.equal(deployment.exitCode,0);assert.equal(live.pages.commit,deployment.head);
assert.equal(local.reports.length,2);assert.equal(publicUi.reports.length,1);
assert([...local.reports,...publicUi.reports].every(r=>r.completedAfterPlanning&&r.confirmationMs===8000&&r.errors.length===0));
const git=(...args)=>execFileSync('git',['-c','gc.auto=0','-c','maintenance.auto=false',...args],{cwd:root,encoding:'utf8',windowsHide:true}).trim();
assert.equal(git('rev-parse','HEAD'),deployment.head);assert.equal(git('status','--porcelain'),'');
const log=fs.readFileSync(new URL(deployment.logfile),'utf8');
const packagingTests=Number(log.match(/ℹ tests (\d+)/)?.[1]);assert(packagingTests>0);assert(log.includes('ℹ fail 0'));
const regressionTests=read('deployment-plan-retry').retainedRegressionTests+packagingTests;
const completedAt=new Date().toISOString();
const result={status:'DEPLOYED_AND_VERIFIED',completedAt,sourceCommit:deployment.head,pages:live.pages,workers:live.workers,
 behavior:{initialPlanningMs:[24000,22000,22000,22000,20000],planningChanged:false,confirmationMs:8000,startsOn:'FIRST_VALID_CONFIRMATION',replacesPlanningDeadline:true,laterConfirmationsExtend:false,reconnectExtends:false,confirmationBoundary:'EXCLUSIVE',raidEnrageChanged:false,failedAttemptUsesOnlyOriginalPlanningRemainder:true},
 verification:{timerBoundaryTests:8,scopedRegressionTests:regressionTests,packagingTests,totalTests:regressionTests+8,workerSyntax:true,workerCompiled:true,localViewports:local.reports.map(r=>r.width),publicMobileViewport:publicUi.reports[0].width,publicAssetHashes:live.assets.length,clientManifestHashes:live.clientManifest.files.length,syntheticAccounts:true,realDevice:false,installedApp:false},
 preserved:['CMS settings','reward policy','account holdings','raid enrage','phase planning durations'],productionAccountWrites:0,messagesSent:0,storageMaintenance:false,newSchedules:false,
 evidenceDirectory:workspace+'/operations/'+folder};
fs.writeFileSync(new URL('completion.json',out),JSON.stringify(result,null,2)+'\n',{flag:'wx'});
const qa=path.join(root,'docs/qa',folder),ops=path.join(root,'operations',folder);fs.mkdirSync(ops,{recursive:true});
for(const file of ['completion.json','deployment-plan.json','deployment-result.json','deployment-plan-retry.json','deployment-result-retry.json','live-verification.json','timer-tests.log','release.mjs','finalize.mjs'])fs.copyFileSync(new URL(file,out),path.join(ops,file));
for(const[sub,name]of [['browser-local','local-browser.json'],['browser-public','public-browser.json']])fs.copyFileSync(new URL(sub+'/browser-battlefield.json',out),path.join(ops,name));
for(const file of ['completion.json','live-verification.json'])fs.copyFileSync(new URL(file,out),path.join(qa,file));
const note=`\n## 운영 반영 완료\n\n- 소스 ${deployment.head} · Pages ${live.pages.id}. 두 Worker 100% 전환 확인.\n- 관련 검사 총 ${regressionTests+8}개(신규 경계 8 + scoped ${regressionTests}) 통과, Worker 컴파일/배포 성공. 공개 ${live.assets.length}개 파일 해시와 클라이언트 매니페스트 ${live.clientManifest.files.length}개 일치.\n- 공개 모바일 리소스 + 격리 API에서도 남은 약 3초 첫 확정 → 독립 8초 → 기존 계획 마감 후 전원 성공 확인. 실기기/실계정 전투 아님.\n- 운영 계정 직접 쓰기·재화 지급·메시지·유지관리·예약 없음.\n`;
fs.appendFileSync(path.join(qa,'README.md'),note);
const summary=`## 흑익 첫 확정부터 독립8초 · 최초 고민시간 유지 — 2026-11-01 최신\n\n- **운영 반영 완료:** 소스 ${deployment.head.slice(0,9)} · Pages ${live.pages.id.slice(0,8)}. 용혈 저울 첫 유효 확정부터 **새로8초**, 최초 배치마감과 더 짧은 시간을 택하던 서버/화면 판정 수정. **남은3/5/6초도8초 보장**, 기존 단계별24/22/22/22/20초·CMS배율 유지.\n- 추가확정/중복/재접속 연장0. 오답·시간초과 후 기존계획잔여만 재시도, 소진시즉시종료. 기존침식/피해·광폭화·입장/보상/계정 유지. 전체실패의 마지막확정자 귀속0.\n- 관련${regressionTests+8}검사·PC1440/모바일390 실제클라이언트+격리6인API·공개모바일 확인. 공개${live.assets.length}파일/클라이언트${live.clientManifest.files.length}해시·두Worker100%. 실기기/설치앱 검사아님. 운영계정직접쓰기/메시지0.\n- 기록 docs/qa/${folder}/, 증거 operations/${folder}/. 기존체크아웃/의존성재사용·Git자동정리OFF·승인없는유지관리/예약없음.\n\n`;
for(const base of [root,workspace]){const file=path.join(base,'AGENTS.md'),before=fs.readFileSync(file,'utf8');assert(!before.startsWith('## 흑익 첫 확정부터 독립8초'));fs.writeFileSync(file,summary+before);}
const mainQa=path.join(workspace,'docs/qa',folder);fs.mkdirSync(mainQa,{recursive:true});
for(const file of ['README.md','completion.json','live-verification.json'])fs.copyFileSync(path.join(qa,file),path.join(mainQa,file));
console.log(JSON.stringify(result));
