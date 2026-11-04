import fs from 'node:fs/promises';import path from 'node:path';import {execFile} from 'node:child_process';import {promisify} from 'node:util';import {fileURLToPath} from 'node:url';import {createHash} from 'node:crypto';
const qa=fileURLToPath(new URL('.',import.meta.url)),base=path.resolve(qa,'../..'),repo=path.resolve(base,'../..'),prefix=path.relative(repo,base).replaceAll('\\','/'),run=promisify(execFile);
const git=async(args,env={})=>(await run('git',['-c','gc.auto=0','-c','maintenance.auto=false',...args],{cwd:repo,windowsHide:true,encoding:'utf8',maxBuffer:20e6,env:{...process.env,...env}})).stdout.trim();
const rootFiles=['PROJECT.md','REJECTION.json','AdvancementEffects.mjs','catalog.mjs','workbench.src.mjs','workbench.bundle.js','battle-v3-live.pinned.js','v3-source-ref.txt','index.html','build.mjs','serve.mjs','bake.mjs','bake.html','pack.mjs','qa/build.json'];
const files=rootFiles.map(f=>path.join(base,f));
async function walk(dir){for(const entry of await fs.readdir(dir,{withFileTypes:true})){const full=path.join(dir,entry.name);if(entry.isDirectory())await walk(full);else if(!['scoped-index','scoped-index.lock','preservation.json','server.log','server-error.log','delivery.json'].includes(entry.name))files.push(full);}}
await walk(path.join(base,'painted-v2'));
const rows=[];for(const file of files){const b=await fs.readFile(file);rows.push({path:path.relative(repo,file).replaceAll('\\','/'),bytes:b.length,sha256:createHash('sha256').update(b).digest('hex')});}
const manifest=path.join(qa,'delivery.json');await fs.writeFile(manifest,JSON.stringify({status:'LOCAL_REVIEW_CANDIDATE',productionDeployed:false,userVisualApproval:false,builtInImageGen:true,sourceArtCount:16,paintedPhases:128,sourcePreserved:true,rows},null,2));files.push(manifest);
const parent=await git(['rev-parse','origin/main']),branch='codex/mercenary-advancement-fx-20261105-painted';
if(await git(['ls-remote','--heads','origin','refs/heads/'+branch]))throw Error('Branch already exists; refusing replacement');
const env={GIT_INDEX_FILE:path.join(qa,'scoped-index')};await git(['read-tree',parent],env);
for(let i=0;i<files.length;i+=120)await git(['add','-f','--',...files.slice(i,i+120).map(f=>path.relative(repo,f).replaceAll('\\','/'))],env);
// Preserve only this task's AGENTS entry atop current remote documentation.
// The user's shared dirty index/worktree and unrelated root edits stay intact.
const original=await git(['show',parent+':AGENTS.md']),entry=await fs.readFile(path.join(qa,'agents-entry.txt'),'utf8');
const agentsFile=path.join(qa,'agents-scoped.txt');await fs.writeFile(agentsFile,entry.trimEnd()+'\n\n'+original+'\n');
const agentsHash=await git(['hash-object','-w',agentsFile]);await git(['update-index','--add','--cacheinfo','100644,'+agentsHash+',AGENTS.md'],env);
const tree=await git(['write-tree'],env),changed=(await git(['diff','--name-only',parent,tree])).split('\n').filter(Boolean);
if(changed.some(p=>p!=='AGENTS.md'&&!p.startsWith(prefix+'/')))throw Error('Unexpected path in scoped tree');
const commit=await git(['commit-tree',tree,'-p',parent,'-m','feat: prepare sixteen painted mercenary advancement effects [CF-Pages-Skip]']);
await git(['update-ref','refs/heads/'+branch,commit,'0000000000000000000000000000000000000000']);
await git(['push','origin','refs/heads/'+branch+':refs/heads/'+branch]);
const remote=(await git(['ls-remote','--heads','origin','refs/heads/'+branch])).split(/\s+/)[0];if(remote!==commit)throw Error('Remote branch mismatch');
await fs.writeFile(path.join(qa,'preservation.json'),JSON.stringify({branch,commit,parent,changedPaths:changed.length,remoteVerified:true,productionDeployed:false,sharedIndexModified:false,checkoutCreated:false,autoMaintenance:false,deliveryManifest:'delivery.json'},null,2));
console.log(JSON.stringify({branch,commit,files:changed.length,remoteVerified:remote===commit,productionDeployed:false}));
