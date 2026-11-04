import fs from 'node:fs/promises';import path from 'node:path';import {execFile} from 'node:child_process';import {promisify} from 'node:util';import {fileURLToPath} from 'node:url';import {createHash} from 'node:crypto';
const qa=fileURLToPath(new URL('.',import.meta.url)),base=path.resolve(qa,'../..'),repo=path.resolve(base,'../..'),prefix=path.relative(repo,base).replaceAll('\\','/'),run=promisify(execFile);
const git=async(args,env={})=>(await run('git',['-c','gc.auto=0','-c','maintenance.auto=false',...args],{cwd:repo,windowsHide:true,encoding:'utf8',maxBuffer:32e6,env:{...process.env,...env}})).stdout.trim();
const branch='codex/mercenary-advancement-fx-20261105-painted',parent='f001ce2a21cd66d1b2ebad8226e02368970668db';
if(await git(['rev-parse',branch])!==parent)throw Error('Prepared branch changed; inspect before preserving');
if((await git(['ls-remote','--heads','origin','refs/heads/'+branch])).split(/\s+/)[0]!==parent)throw Error('Remote branch changed; no overwrite');
const verification={phase:'PREPARED_LOCAL_ONLY',productionDeployed:false,userVisualApproval:false,physicalDevice:false,modelTests:{count:8,passed:8,command:'node --test preview/v35-advancement-fx-20261104/ui/qa/model.test.mjs',observedExitCode:0},suites:[]};
for(const rel of ['ui/qa/verification.json','states-v3/qa/verification.json','ui/qa/burst-regression.json']){
 const report=JSON.parse(await fs.readFile(path.join(base,rel),'utf8')),checks=report.reports.flatMap(r=>Object.values(r.checks));
 if(checks.some(v=>v!==true)||report.reports.some(r=>(r.errors||r.pageErrors||[]).length))throw Error('Failed QA '+rel);
 verification.suites.push({path:rel,checks:checks.length,passed:checks.length});
}
const native=JSON.parse(await fs.readFile(path.join(base,'states-v3/qa/native.json'),'utf8'));
if(native.length!==3||native.some(r=>!r.roundTripBinaryEqual))throw Error('Native roundtrip check');
const videos=JSON.parse(await fs.readFile(path.join(base,'states-v3/qa/video-check.json'),'utf8'));
if(videos.reports.some(r=>!r.endedWithoutResidue||!r.noErrors||!r.singleCanvas))throw Error('Video residue/errors');
verification.nativeRoundTrips=3;verification.videoDecodes=2;verification.extractedVideoFrames=14;
await fs.writeFile(path.join(qa,'summary.json'),JSON.stringify(verification,null,2));
const rootFiles=['PROJECT.md','AdvancementEffects.mjs','AdvancementStateEffects.mjs','workbench.src.mjs','workbench.bundle.js','index.html','qa/build.json','integration-contract.json'];
const files=rootFiles.map(f=>path.join(base,f));
async function walk(dir){for(const entry of await fs.readdir(dir,{withFileTypes:true})){const full=path.join(dir,entry.name);if(entry.isDirectory())await walk(full);else if(!['scoped-index','scoped-index.lock','agents-scoped.txt','preservation.json','delivery.json'].includes(entry.name))files.push(full);}}
await walk(path.join(base,'states-v3'));await walk(path.join(base,'ui'));
const rows=[];for(const file of files){const bytes=await fs.readFile(file);rows.push({path:path.relative(repo,file).replaceAll('\\','/'),bytes:bytes.length,sha256:createHash('sha256').update(bytes).digest('hex')});}
const delivery=path.join(qa,'delivery.json');await fs.writeFile(delivery,JSON.stringify({status:'PREPARED_LOCAL_ONLY',parentPreparedCommit:parent,sourceArt:'built-in ImageGen; original files preserved',runtime:'Existing V3 Pixi/GSAP; native Effekseer offline only',productionDeployed:false,userVisualApproval:false,rows},null,2));files.push(delivery);
const env={GIT_INDEX_FILE:path.join(qa,'scoped-index')};await git(['read-tree',parent],env);
for(let i=0;i<files.length;i+=100)await git(['add','-f','--',...files.slice(i,i+100).map(f=>path.relative(repo,f).replaceAll('\\','/'))],env);
const original=await git(['show',parent+':AGENTS.md']),entry=await fs.readFile(path.join(qa,'agents-entry.txt'),'utf8'),agents=path.join(qa,'agents-scoped.txt');
await fs.writeFile(agents,entry.trimEnd()+'\n\n'+original+'\n');const agentsHash=await git(['hash-object','-w',agents]);await git(['update-index','--add','--cacheinfo','100644,'+agentsHash+',AGENTS.md'],env);
const tree=await git(['write-tree'],env),changed=(await git(['diff','--name-only',parent,tree])).split('\n').filter(Boolean);
if(changed.some(p=>p!=='AGENTS.md'&&!p.startsWith(prefix+'/')))throw Error('Out of scope tree change');
const commit=await git(['commit-tree',tree,'-p',parent,'-m','feat: prepare mercenary advancement state effects and dialog [CF-Pages-Skip] [skip ci]']);
await git(['update-ref','refs/heads/'+branch,commit,parent]);await git(['push','origin','refs/heads/'+branch+':refs/heads/'+branch]);
const remote=(await git(['ls-remote','--heads','origin','refs/heads/'+branch])).split(/\s+/)[0];if(remote!==commit)throw Error('Remote verification mismatch');
const report={branch,commit,parent,changedPaths:changed.length,remoteVerified:true,productionDeployed:false,sharedIndexModified:false,checkoutCreated:false,maintenanceExecuted:false,summary:'summary.json',delivery:'delivery.json'};
await fs.writeFile(path.join(qa,'preservation.json'),JSON.stringify(report,null,2));console.log(JSON.stringify(report));
