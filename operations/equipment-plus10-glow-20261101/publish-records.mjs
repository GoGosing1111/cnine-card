import fs from 'node:fs';import path from 'node:path';import assert from 'node:assert/strict';import {fileURLToPath} from 'node:url';import {execFileSync} from 'node:child_process';
const root=fileURLToPath(new URL('../../',import.meta.url)),dir=fileURLToPath(new URL('./',import.meta.url)),folder=path.basename(dir),summary=JSON.parse(fs.readFileSync(path.join(dir,'completion.json'),'utf8'));assert.equal(summary.status,'DEPLOYED_AND_VERIFIED');
const localAgents=fs.readFileSync(path.join(root,'AGENTS.md'),'utf8'),end=localAgents.indexOf('\n## ',1),entry=localAgents.slice(0,end)+'\n\n';assert(entry.startsWith('## 장비창 10강 광채 강화'));assert(entry.includes(summary.sourceCommit.slice(0,9)));
const evidence=path.join(dir,'evidence');fs.mkdirSync(evidence,{recursive:true});const index=path.join(evidence,'records-'+Date.now()+'.index');
const git=(args,options={})=>execFileSync('git',['-c','gc.auto=0','-c','maintenance.auto=false','-c','core.safecrlf=false',...args],{cwd:root,env:{...process.env,GIT_INDEX_FILE:index},encoding:'utf8',windowsHide:true,maxBuffer:8e6,...options}).trim();
const files=['.gitignore','release.mjs','browser.mjs','before.css','comparison.mjs','comparison.png','finalize.mjs','publish-records.mjs','completion.json','source.json','deployment-plan.json','deployment-result.json','live-verification.json'].map(f=>'operations/'+folder+'/'+f);files.push('docs/qa/'+folder+'/completion.json','docs/qa/'+folder+'/README.md');
const branch='refs/heads/codex/equipment-plus10-glow-records-20261101';let prior='0'.repeat(40),published;
for(let attempt=1;attempt<=3;attempt++){
 git(['fetch','--no-auto-maintenance','origin','main']);const base=git(['rev-parse','origin/main']),remoteAgents=git(['show',base+':AGENTS.md']);assert(!remoteAgents.includes('## 장비창 10강 광채 강화 · 기존 크기 유지'),'Already recorded');
 git(['read-tree',base]);git(['add','--sparse','--',...files]);const blob=git(['hash-object','-w','--stdin'],{input:entry+remoteAgents+'\n'});git(['update-index','--add','--cacheinfo','100644',blob,'AGENTS.md']);
 const changed=git(['diff','--cached','--name-only',base]).split(/\r?\n/).filter(Boolean);assert.deepEqual(changed.sort(),[...files,'AGENTS.md'].sort());git(['diff','--cached','--check',base]);
 const tree=git(['write-tree']),commit=git(['commit-tree',tree,'-p',base,'-m','docs: record enhanced plus-ten equipment glow with unchanged dimensions [CF-Pages-Skip]']);git(['update-ref',branch,commit,prior]);prior=commit;
 try{git(['push','origin',branch+':refs/heads/main']);published={base,commit,branch,files:changed};break;}catch(e){if(attempt===3||!/(fetch first|non-fast-forward)/i.test(String(e.stderr||e.message)))throw e;}
}
assert(published);const remote=git(['ls-remote','origin','refs/heads/main']).split(/\s+/)[0];if(remote!==published.commit){git(['fetch','--no-auto-maintenance','origin','main']);git(['merge-base','--is-ancestor',published.commit,'origin/main']);}
fs.writeFileSync(path.join(evidence,'published.json'),JSON.stringify({...published,remote,completedAt:new Date().toISOString()},null,2)+'\n',{flag:'wx'});console.log(JSON.stringify({status:'PUBLISHED',commit:published.commit,remote}));
