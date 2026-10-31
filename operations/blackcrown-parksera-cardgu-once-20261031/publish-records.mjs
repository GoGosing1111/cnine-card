import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {fileURLToPath} from 'node:url';
import {execFileSync} from 'node:child_process';
const root=fileURLToPath(new URL('../../',import.meta.url)),dir=fileURLToPath(new URL('./',import.meta.url)),folder=path.basename(dir),evidence=path.join(dir,'evidence');
const summary=JSON.parse(fs.readFileSync(path.join(dir,'completion.json'),'utf8'));assert.equal(summary.status,'COMPLETED_AND_INDEPENDENTLY_VERIFIED');assert.equal(summary.userId,45);assert.equal(summary.cardCode,'V-970');assert.equal(summary.auditId,'53414');
const entry=fs.readFileSync(path.join(evidence,'agents-entry.md'),'utf8');assert(entry.includes(summary.operationKey)&&entry.includes(summary.auditId));
const index=path.join(evidence,'records-'+Date.now()+'.index');
const git=(args,options={})=>execFileSync('git',['-c','gc.auto=0','-c','maintenance.auto=false',...args],{cwd:root,env:{...process.env,GIT_INDEX_FILE:index},encoding:'utf8',windowsHide:true,maxBuffer:6*1024*1024,...options}).trim();
const files=['.gitignore','preflight.mjs','arm.mjs','lock-worker.mjs','wrangler.jsonc','cardgu-once.test.mjs','witness.mjs','record.mjs','publish-records.mjs','completion.json','README.md'].map(f=>'operations/'+folder+'/'+f);
files.push('docs/qa/'+folder+'/README.md');
const branch='refs/heads/codex/'+folder,message=path.join(evidence,'commit-message.txt');
fs.writeFileSync(message,'ops: arm Parksera Cardgu once on next Blackcrown opening [CF-Pages-Skip]\n',{flag:'wx'});
let prior='0'.repeat(40),published;
for(let attempt=1;attempt<=3;attempt++){
 git(['fetch','--no-auto-maintenance','origin','main']);const base=git(['rev-parse','origin/main']);
 const remoteAgents=git(['show',base+':AGENTS.md']);assert(!remoteAgents.includes(summary.operationKey),'Already recorded; do not duplicate');
 git(['read-tree',base]);git(['add','--',...files]);
 const agentsBlob=git(['hash-object','-w','--stdin'],{input:entry+remoteAgents+'\n'});git(['update-index','--add','--cacheinfo','100644',agentsBlob,'AGENTS.md']);
 const changed=git(['diff','--cached','--name-only',base]).split(/\r?\n/).filter(Boolean);assert.deepEqual(changed.sort(),[...files,'AGENTS.md'].sort());git(['diff','--cached','--check',base]);
 const stat=git(['diff','--cached','--stat',base]),tree=git(['write-tree']),commit=git(['commit-tree',tree,'-p',base,'-F',message]);
 git(['update-ref',branch,commit,prior]);prior=commit;
 fs.writeFileSync(path.join(evidence,'records-commit-'+attempt+'.json'),JSON.stringify({base,commit,branch,files:changed,stat},null,2)+'\n',{flag:'wx'});
 try{git(['push','origin',branch+':refs/heads/main']);published={base,commit,branch,files:changed};break;}
 catch(e){const error=String(e.stderr||e.message);if(attempt===3||!/(fetch first|non-fast-forward)/i.test(error))throw e;}
}
assert(published);const remote=git(['ls-remote','origin','refs/heads/main']).split(/\s+/)[0];
if(remote!==published.commit){git(['fetch','--no-auto-maintenance','origin','main']);git(['merge-base','--is-ancestor',published.commit,'origin/main']);}
fs.writeFileSync(path.join(evidence,'records-published.json'),JSON.stringify({...published,remote,completedAt:new Date().toISOString()},null,2)+'\n',{flag:'wx'});
console.log(JSON.stringify({status:'PUBLISHED',commit:published.commit,remote,userId:45,auditId:summary.auditId}));
