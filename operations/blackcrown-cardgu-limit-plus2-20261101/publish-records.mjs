import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {fileURLToPath} from 'node:url';
import {execFileSync} from 'node:child_process';
const root=fileURLToPath(new URL('../../',import.meta.url)),dir=fileURLToPath(new URL('./',import.meta.url)),folder=path.basename(dir);
const summary=JSON.parse(fs.readFileSync(path.join(dir,'completion.json'),'utf8'));
assert.equal(summary.status,'COMPLETED_AND_INDEPENDENTLY_VERIFIED');assert.equal(summary.auditId,'53447');assert.equal(summary.limitAfter,7);
const localAgents=fs.readFileSync(path.join(root,'AGENTS.md'),'utf8'),end=localAgents.indexOf('\n## ',1),entry=localAgents.slice(0,end)+'\n\n';
assert(entry.startsWith('## 카드구 블랙크라운팩 발행 한도 2장 증액 완료'));assert(entry.includes(summary.operationKey));
const evidence=path.join(dir,'evidence');fs.mkdirSync(evidence,{recursive:true});
const index=path.join(evidence,'records-'+Date.now()+'.index');
const git=(args,options={})=>execFileSync('git',['-c','gc.auto=0','-c','maintenance.auto=false',...args],{cwd:root,env:{...process.env,GIT_INDEX_FILE:index},encoding:'utf8',windowsHide:true,maxBuffer:6*1024*1024,...options}).trim();
const files=['.gitignore','preflight.mjs','increase.mjs','run.mjs','increase.test.mjs','public.mjs','completion.json','publish-records.mjs'].map(f=>'operations/'+folder+'/'+f);
files.push('docs/qa/'+folder+'/completion.json');
const branch='refs/heads/codex/'+folder;let prior='0'.repeat(40),published;
for(let attempt=1;attempt<=3;attempt++){
 git(['fetch','--no-auto-maintenance','origin','main']);const base=git(['rev-parse','origin/main']);
 const remoteAgents=git(['show',base+':AGENTS.md']);assert(!remoteAgents.includes(summary.operationKey),'Already recorded');
 git(['read-tree',base]);git(['add','--',...files]);
 const blob=git(['hash-object','-w','--stdin'],{input:entry+remoteAgents+'\n'});git(['update-index','--add','--cacheinfo','100644',blob,'AGENTS.md']);
 const changed=git(['diff','--cached','--name-only',base]).split(/\r?\n/).filter(Boolean);assert.deepEqual(changed.sort(),[...files,'AGENTS.md'].sort());git(['diff','--cached','--check',base]);
 const tree=git(['write-tree']),commit=git(['commit-tree',tree,'-p',base,'-m','ops: add two Cardgu Blackcrown issuance slots [CF-Pages-Skip]']);
 git(['update-ref',branch,commit,prior]);prior=commit;
 try{git(['push','origin',branch+':refs/heads/main']);published={base,commit,branch,files:changed};break;}
 catch(e){if(attempt===3||!/(fetch first|non-fast-forward)/i.test(String(e.stderr||e.message)))throw e;}
}
assert(published);const remote=git(['ls-remote','origin','refs/heads/main']).split(/\s+/)[0];
if(remote!==published.commit){git(['fetch','--no-auto-maintenance','origin','main']);git(['merge-base','--is-ancestor',published.commit,'origin/main']);}
fs.writeFileSync(path.join(evidence,'published.json'),JSON.stringify({...published,remote,completedAt:new Date().toISOString()},null,2)+'\n',{flag:'wx'});
console.log(JSON.stringify({status:'PUBLISHED',commit:published.commit,remote,auditId:summary.auditId}));
