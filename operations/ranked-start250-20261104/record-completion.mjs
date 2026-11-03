import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import {fileURLToPath} from 'node:url';
import {execFileSync} from 'node:child_process';
const root=fileURLToPath(new URL('../../',import.meta.url)),folder='ranked-start250-20261104';
const summary=JSON.parse(await fs.readFile(new URL('./completion.json',import.meta.url),'utf8'));assert.equal(summary.status,'COMPLETED_AND_INDEPENDENTLY_VERIFIED');assert.equal(summary.correctedCount,1886);
const entry=await fs.readFile(new URL('./evidence/agents-entry.md',import.meta.url),'utf8');assert(entry.includes(summary.operationKey));assert(entry.includes(summary.auditId));
const dir=fileURLToPath(new URL('./evidence/',import.meta.url)),index=path.join(dir,'records-'+Date.now()+'.index');
const git=(args,options={})=>execFileSync('git',['-c','gc.auto=0','-c','maintenance.auto=false',...args],{cwd:root,env:{...process.env,GIT_INDEX_FILE:index},encoding:'utf8',windowsHide:true,maxBuffer:6*1024*1024,...options}).trim();
const files=['.gitignore','inspect.mjs','prepare.mjs','correct.mjs','correct.test.mjs','run.mjs','independent.mjs','test-run.mjs','finalize.mjs','record-completion.mjs','README.md','completion.json'].map(f=>'operations/'+folder+'/'+f);
files.push('docs/qa/'+folder+'/README.md','docs/qa/'+folder+'/completion.json');
const branch='refs/heads/codex/'+folder,message=path.join(dir,'commit-message.txt');await fs.writeFile(message,'ops: set unplayed ranked season 25 profiles to 250 points [CF-Pages-Skip]\n',{flag:'wx'});
let prior='0'.repeat(40),published;
for(let attempt=1;attempt<=3;attempt++){
 git(['fetch','--no-auto-maintenance','origin','main']);const base=git(['rev-parse','origin/main']),remoteAgents=git(['show',base+':AGENTS.md']);assert(!remoteAgents.includes(summary.operationKey),'Already recorded');
 git(['read-tree',base]);git(['add','--',...files]);const agentsBlob=git(['hash-object','-w','--stdin'],{input:entry+remoteAgents+'\n'});git(['update-index','--add','--cacheinfo','100644',agentsBlob,'AGENTS.md']);
 const changed=git(['diff','--cached','--name-only',base]).split(/\r?\n/).filter(Boolean);assert.deepEqual(changed.sort(),[...files,'AGENTS.md'].sort());git(['diff','--cached','--check',base]);
 const stat=git(['diff','--cached','--stat',base]),tree=git(['write-tree']),commit=git(['commit-tree',tree,'-p',base,'-F',message]);git(['update-ref',branch,commit,prior]);prior=commit;
 await fs.writeFile(path.join(dir,'records-commit-'+attempt+'.json'),JSON.stringify({base,commit,branch,files:changed,stat},null,2)+'\n',{flag:'wx'});
 try{git(['push','origin',branch+':refs/heads/main']);published={base,commit,branch,files:changed};break;}catch(e){const error=String(e.stderr||e.message);if(attempt===3||!/(fetch first|non-fast-forward)/i.test(error))throw e;}
}
assert(published);const remote=git(['ls-remote','origin','refs/heads/main']).split(/\s+/)[0];if(remote!==published.commit){git(['fetch','--no-auto-maintenance','origin','main']);git(['merge-base','--is-ancestor',published.commit,'origin/main']);}
await fs.writeFile(path.join(dir,'records-published.json'),JSON.stringify({...published,remote,completedAt:new Date().toISOString()},null,2)+'\n',{flag:'wx'});console.log(JSON.stringify({status:'PUBLISHED',commit:published.commit,remote,correctedCount:1886,auditId:summary.auditId,gameDeployment:false}));
