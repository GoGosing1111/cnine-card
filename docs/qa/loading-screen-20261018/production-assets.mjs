import fs from 'node:fs/promises';import {createHash} from 'node:crypto';import assert from 'node:assert/strict';import path from 'node:path';
const root='C:/Users/User/.codex/worktrees/jokro-live/cnine-card',origin='https://cnine-card.pages.dev',hash=b=>createHash('sha256').update(b).digest('hex');
const paths=['index.html','service-worker.js',...['scene-wide.webp','scene-mobile.webp','rail.webp','manifest.json'].map(n=>'assets/ui/loading/reverse-call-20261018/'+n)];
const report={origin,at:new Date().toISOString(),checks:[]};
for(const file of paths){const response=await fetch(origin+'/'+file+'?loadingReview=20261018-v1',{cache:'no-store'});assert.equal(response.status,200,file);const actual=Buffer.from(await response.arrayBuffer()),local=await fs.readFile(path.join(root,file));assert.equal(hash(actual),hash(local),file+' hash');report.checks.push({file,status:response.status,bytes:actual.length,sha256:hash(actual)});}
const manifest=await(await fetch(origin+'/client/windows/manifest.json?loadingReview=20261018-v1',{cache:'no-store'})).json();
for(const file of paths.filter(n=>n.endsWith('.webp')))assert(manifest.files.some(row=>row.path==='/'+file),'Windows manifest '+file);
report.windowsManifest=true;
await fs.writeFile(path.join(root,'docs/qa/loading-screen-20261018/production-assets.json'),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report,null,2));
