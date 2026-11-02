import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import {fileURLToPath} from 'node:url';
import {execFileSync} from 'node:child_process';

const root=fileURLToPath(new URL('../../',import.meta.url)),folder='jjok-equipped-weapon15-20261102';
const summary=JSON.parse(await fs.readFile(new URL('completion.json',import.meta.url),'utf8'));
assert.equal(summary.status,'COMPLETED_AND_INDEPENDENTLY_VERIFIED');assert.equal(summary.userId,'303');assert.equal(summary.changedEquipment,1);assert.equal(summary.targetLevel,15);
const entry=`## [C9]족쪽이 장착 무기 15강 완료 — 2026-11-02

- **운영 완료:** **${summary.completedAtKst}·감사${summary.auditId}**, **[C9]족쪽이 ID303**의 장착 무기 **東方軍火商(동방무기상) 0→15강**. 고유 장비 ID3033292392·카탈로그ID40·코드EQ_1788486888336·장착 보존. 기존 강화 상태 없음→level15/revision1.
- 완료키 **${summary.operationKey}**. 같은 요청 새키 재실행·이후 정상 변경 덮기 금지. 무기 상태/감사/영수증 단일거래·기존 강화행 충돌시 중단. 앞선 방어구 작업키 재실행0·기존4개15강과 revision 그대로 유지.
- 관련3검사·USER_LOCK/DB 이중잠금 실패/정상 원복·독립 READ ONLY·실제 장비조회5개15강/전투 강화합계·SELECT 전용 재실행쓰기0·inventory/랭크 캐시 갱신·잠금 반환. 다른 장비/연마/수량/재화/재료 보존·비용0·메시지/게임재배포/유지관리/예약0.
- 기록 docs/qa/${folder}/, 증거 operations/${folder}/. 기존 폴더/의존성 재사용·Git 자동정리 OFF.

`;
const dir=fileURLToPath(new URL('evidence/',import.meta.url)),index=path.join(dir,'records-'+Date.now()+'.index');
const git=(args,options={})=>execFileSync('git',['-c','gc.auto=0','-c','maintenance.auto=false',...args],{cwd:root,env:{...process.env,GIT_INDEX_FILE:index},encoding:'utf8',windowsHide:true,maxBuffer:6*1024*1024,...options}).trim();
const files=['.gitignore','plan.json','discover.mjs','prepare-discovery.mjs','prepare.mjs','prepare-records.mjs','grant.mjs','grant.test.mjs','run.mjs','lock-worker.mjs','wrangler.jsonc','finalize.mjs','record-completion.mjs','README.md','completion.json'].map(file=>'operations/'+folder+'/'+file);
files.push('docs/qa/'+folder+'/README.md');
const branch='refs/heads/codex/'+folder,message=path.join(dir,'commit-message.txt');
await fs.writeFile(message,'ops: set Jjok equipped weapon to level 15 [CF-Pages-Skip]\n',{flag:'wx'});
let prior='0'.repeat(40),published;
for(let attempt=1;attempt<=3;attempt++){
 git(['fetch','--no-auto-maintenance','origin','main']);const base=git(['rev-parse','origin/main']),remoteAgents=git(['show',base+':AGENTS.md']);assert(!remoteAgents.includes(summary.operationKey),'Operation already recorded');
 git(['read-tree',base]);git(['add','--',...files]);
 const agentsBlob=git(['hash-object','-w','--stdin'],{input:entry+remoteAgents+'\n'});git(['update-index','--add','--cacheinfo','100644',agentsBlob,'AGENTS.md']);
 const changed=git(['diff','--cached','--name-only',base]).split(/\r?\n/).filter(Boolean);assert.deepEqual(changed.sort(),[...files,'AGENTS.md'].sort());git(['diff','--cached','--check',base]);
 const stat=git(['diff','--cached','--stat',base]),tree=git(['write-tree']),commit=git(['commit-tree',tree,'-p',base,'-F',message]);git(['update-ref',branch,commit,prior]);prior=commit;
 await fs.writeFile(path.join(dir,'records-commit-'+attempt+'.json'),JSON.stringify({base,commit,branch,files:changed,stat},null,2)+'\n',{flag:'wx'});
 try{git(['push','origin',branch+':refs/heads/main']);published={base,commit,branch,files:changed};break;}
 catch(error){const message=String(error.stderr||error.message);if(attempt===3||!/(fetch first|non-fast-forward)/i.test(message))throw error;}
}
assert(published);const remote=git(['ls-remote','origin','refs/heads/main']).split(/\s+/)[0];
if(remote!==published.commit){git(['fetch','--no-auto-maintenance','origin','main']);git(['merge-base','--is-ancestor',published.commit,'origin/main']);}
const localAgents=await fs.readFile(path.join(root,'AGENTS.md'),'utf8');if(!localAgents.includes(summary.operationKey))await fs.writeFile(path.join(root,'AGENTS.md'),entry+localAgents);
await fs.writeFile(path.join(dir,'records-published.json'),JSON.stringify({...published,remote,completedAt:new Date().toISOString()},null,2)+'\n',{flag:'wx'});
console.log(JSON.stringify({status:'PUBLISHED',commit:published.commit,remote,auditId:summary.auditId,userId:'303',changedEquipment:1,targetLevel:15}));
