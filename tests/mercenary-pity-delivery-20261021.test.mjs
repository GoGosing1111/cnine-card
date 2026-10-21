import test from 'node:test';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {readFile,access} from 'node:fs/promises';
import path from 'node:path';
import {prepareProductionAssets,isProductionFile} from '../scripts/prepare-production-assets.mjs';

test('pity runtime ships in Pages and desktop; Git-only audit document keeps release within 20,000 files',async()=>{
 const runtime=['mercenary-codex/leveling/index.html','mercenary-codex/leveling/app.mjs','mercenary-codex/leveling/breakthrough.mjs','shared/mercenary-level-v1.mjs','shared/mercenary-breakthrough-pity-v1.mjs'];
 const audit='docs/qa/mercenary-breakthrough-pity-20261021/README.md';
 const tracked=execFileSync('git',['ls-files','-z'],{maxBuffer:40e6}).toString().split('\0').filter(Boolean);
 const staticFiles=tracked.filter(isProductionFile).filter(file=>!file.startsWith('functions/')&&!['_headers','_redirects','_routes.json','_worker.js'].includes(file));
 assert.ok(staticFiles.length+1<=20000,`Pages has ${staticFiles.length+1} assets`);
 const stage=await prepareProductionAssets({files:[...runtime,audit]});
 try{
  for(const file of runtime)assert.deepEqual(await readFile(path.join(stage.directory,file)),await readFile(file));
  await assert.rejects(access(path.join(stage.directory,audit)));await access(audit);
  const manifest=JSON.parse(await readFile(path.join(stage.directory,'client/windows/manifest.json'),'utf8'));
  assert.ok(manifest.files.some(row=>row.path==='/shared/mercenary-breakthrough-pity-v1.mjs'));
  assert.ok(!manifest.files.some(row=>row.path==='/'+audit));
 }finally{await stage.dispose();}
});
