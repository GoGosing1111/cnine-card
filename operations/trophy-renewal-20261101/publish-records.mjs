import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {fileURLToPath} from 'node:url';
import {execFileSync} from 'node:child_process';

const root=fileURLToPath(new URL('../../',import.meta.url));
const dir=fileURLToPath(new URL('./',import.meta.url));
const folder=path.basename(dir);
const summary=JSON.parse(fs.readFileSync(path.join(dir,'completion.json'),'utf8'));
assert.equal(summary.status,'DEPLOYED_ACTIVATED_AND_VERIFIED');
const entry=fs.readFileSync(path.join(dir,'agents-entry.txt'),'utf8');
assert(entry.startsWith('## 트로피 새 4종 · 적용 이후 지급'));
assert(entry.includes(summary.sourceCommit.slice(0,9)));
const evidence=path.join(dir,'evidence');
fs.mkdirSync(evidence,{recursive:true});
const index=path.join(evidence,'records-'+Date.now()+'.index');
const git=(args,options={})=>execFileSync('git',['-c','gc.auto=0','-c','maintenance.auto=false','-c','core.safecrlf=false',...args],{cwd:root,env:{...process.env,GIT_INDEX_FILE:index},encoding:'utf8',windowsHide:true,maxBuffer:8e6,...options}).trim();
const names=['.gitignore','activate.mjs','release.mjs','browser.mjs','hydrate.mjs','assets.mjs','finalize.mjs','publish-records.mjs','completion.json','deployment-plan.json','deployment-result.json','live-verification.json','apply.json','local-browser.json','public-browser.json','local-1440-new.png','public-webkit-390-new.png','public-webkit-390-legacy.png'];
const files=names.map(f=>'operations/'+folder+'/'+f);
files.push('docs/qa/'+folder+'/completion.json','docs/qa/'+folder+'/README.md');
const branch='refs/heads/codex/trophy-renewal-records-20261101';
let prior='0'.repeat(40),published;
for(let attempt=1;attempt<=3;attempt++){
  git(['fetch','--no-auto-maintenance','origin','main']);
  const base=git(['rev-parse','origin/main']);
  git(['merge-base','--is-ancestor',summary.sourceCommit,base]);
  const remoteAgents=git(['show',base+':AGENTS.md']);
  assert(!remoteAgents.includes('## 트로피 새 4종 · 적용 이후 지급'),'Already recorded');
  git(['read-tree',base]);
  git(['add','--sparse','--',...files]);
  const blob=git(['hash-object','-w','--stdin'],{input:entry+remoteAgents+'\n'});
  git(['update-index','--add','--cacheinfo','100644',blob,'AGENTS.md']);
  const changed=git(['diff','--cached','--name-only',base]).split(/\r?\n/).filter(Boolean);
  assert.deepEqual(changed.sort(),[...files,'AGENTS.md'].sort());
  git(['diff','--cached','--check',base]);
  const tree=git(['write-tree']);
  const commit=git(['commit-tree',tree,'-p',base,'-m','docs: record new trophy artwork and prospective award cutover [CF-Pages-Skip]']);
  git(['update-ref',branch,commit,prior]);
  prior=commit;
  try{git(['push','origin',branch+':refs/heads/main']);published={base,commit,branch,files:changed};break;}
  catch(e){if(attempt===3||!/(fetch first|non-fast-forward)/i.test(String(e.stderr||e.message)))throw e;}
}
assert(published);
const remote=git(['ls-remote','origin','refs/heads/main']).split(/\s+/)[0];
if(remote!==published.commit){git(['fetch','--no-auto-maintenance','origin','main']);git(['merge-base','--is-ancestor',published.commit,'origin/main']);}
fs.writeFileSync(path.join(evidence,'published.json'),JSON.stringify({...published,remote,completedAt:new Date().toISOString()},null,2)+'\n',{flag:'wx'});
console.log(JSON.stringify({status:'PUBLISHED',commit:published.commit,remote}));
