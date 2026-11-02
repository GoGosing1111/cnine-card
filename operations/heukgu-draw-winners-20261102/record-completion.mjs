import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import {fileURLToPath} from 'node:url';
import {execFileSync} from 'node:child_process';
const root=fileURLToPath(new URL('../../',import.meta.url)),folder='heukgu-draw-winners-20261102';
const summary=JSON.parse(await fs.readFile(new URL('completion.json',import.meta.url),'utf8'));
assert.equal(summary.status,'COMPLETED_AND_INDEPENDENTLY_VERIFIED');assert.equal(summary.recipientCount,3);assert.equal(summary.totalPets,3);
const entry=`## 추첨 당첨자3명 흑구 각1마리 지급 완료 — 2026-11-02

- **운영 지급 완료:** **${summary.completedAtKst}·감사${summary.auditId}**, **˚쟁이。 ID4705·Moo날두 ID4415·박사 ID164에 흑구 PET-HEUKGU 각1마리·총3마리**, 각0→1. 직전 응모권153장/42명 추첨 당첨자이며 재추첨 없음.
- 완료 키 **${summary.operationKey}**. 같은 요청 새 키 재지급·이후 정상 보유 복구 금지. 개별 PET_GRANT 감사3·영수증3·요약감사1·collection 동기화3 확인.
- 관련4검사·실제 이중잠금 실패/정상 원복·독립 READ ONLY·실제 보유/도감3계정·SELECT 전용 재실행 쓰기0·누락/중복0·잠금 반환 확인. 기존 펫/장착/잠재력/재화/인벤토리/CMS 유지, 자동장착·메시지·게임 재배포 없음.
- 기록 docs/qa/${folder}/, 증거 operations/${folder}/. 기존 폴더/의존성 재사용·Git 자동정리 OFF·승인 없는 유지관리/예약 없음.

`;
const dir=fileURLToPath(new URL('evidence/',import.meta.url)),index=path.join(dir,'records-'+Date.now()+'.index');
const git=(args,options={})=>execFileSync('git',['-c','gc.auto=0','-c','maintenance.auto=false',...args],{cwd:root,env:{...process.env,GIT_INDEX_FILE:index},encoding:'utf8',windowsHide:true,maxBuffer:6*1024*1024,...options}).trim();
const files=['.gitignore','source.json','plan.json','preflight.mjs','prepare.mjs','grant.mjs','grant.test.mjs','run.mjs','lock-worker.mjs','wrangler.jsonc','finalize.mjs','record-completion.mjs','README.md','completion.json'].map(f=>'operations/'+folder+'/'+f);files.push('docs/qa/'+folder+'/README.md');
const branch='refs/heads/codex/'+folder,message=path.join(dir,'commit-message.txt');await fs.writeFile(message,'ops: grant one Heukgu pet to each of three lottery winners [CF-Pages-Skip]\n',{flag:'wx'});
let prior='0'.repeat(40),published;
for(let attempt=1;attempt<=3;attempt++){
 git(['fetch','--no-auto-maintenance','origin','main']);const base=git(['rev-parse','origin/main']),remoteAgents=git(['show',base+':AGENTS.md']);assert(!remoteAgents.includes(summary.operationKey),'Operation already recorded');
 git(['read-tree',base]);git(['add','--',...files]);
 const agentsBlob=git(['hash-object','-w','--stdin'],{input:entry+remoteAgents+'\n'});git(['update-index','--add','--cacheinfo','100644',agentsBlob,'AGENTS.md']);
 const changed=git(['diff','--cached','--name-only',base]).split(/\r?\n/).filter(Boolean);assert.deepEqual(changed.sort(),[...files,'AGENTS.md'].sort());git(['diff','--cached','--check',base]);
 const stat=git(['diff','--cached','--stat',base]),tree=git(['write-tree']),commit=git(['commit-tree',tree,'-p',base,'-F',message]);git(['update-ref',branch,commit,prior]);prior=commit;
 await fs.writeFile(path.join(dir,'records-commit-'+attempt+'.json'),JSON.stringify({base,commit,branch,files:changed,stat},null,2)+'\n',{flag:'wx'});
 try{git(['push','origin',branch+':refs/heads/main']);published={base,commit,branch,files:changed};break;}catch(e){const error=String(e.stderr||e.message);if(attempt===3||!/(fetch first|non-fast-forward)/i.test(error))throw e;}
}
assert(published);const remote=git(['ls-remote','origin','refs/heads/main']).split(/\s+/)[0];if(remote!==published.commit){git(['fetch','--no-auto-maintenance','origin','main']);git(['merge-base','--is-ancestor',published.commit,'origin/main']);}
const localAgents=await fs.readFile(path.join(root,'AGENTS.md'),'utf8');if(!localAgents.includes(summary.operationKey))await fs.writeFile(path.join(root,'AGENTS.md'),entry+localAgents);
await fs.writeFile(path.join(dir,'records-published.json'),JSON.stringify({...published,remote,completedAt:new Date().toISOString()},null,2)+'\n',{flag:'wx'});
console.log(JSON.stringify({status:'PUBLISHED',commit:published.commit,remote,auditId:summary.auditId,recipients:3,pets:3}));
