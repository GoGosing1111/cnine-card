import test from 'node:test';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {readFile,access} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import path from 'node:path';
import {prepareProductionAssets,isProductionFile} from '../scripts/prepare-production-assets.mjs';

test('Seal UI ships all six images, player/CMS modules and browser fixtures within Pages cap; exact authoring assets remain in Git',async()=>{
 const hash=b=>createHash('sha256').update(b).digest('hex');
 const manifest=JSON.parse(await readFile('assets/ui/seal-battle/ritual-20261021/manifest.json','utf8'));
 const tracked=execFileSync('git',['ls-files','-z'],{maxBuffer:40e6}).toString().split('\0').filter(Boolean);
 const staticFiles=tracked.filter(isProductionFile).filter(f=>!f.startsWith('functions/')&&!['_headers','_redirects','_routes.json','_worker.js'].includes(f));
 assert.ok(staticFiles.length+1<=20000,`Pages has ${staticFiles.length+1} assets`);
 const root='preview/seal-battle-rework-20261021/';
 const runtime=['js/seal-battle.js','css/seal-battle.css','admin/seal-battle-admin.js','admin/seal-battle-admin.css',...['index.html','admin.html','fixture.js'].map(f=>root+f),...manifest.assets.map(a=>a.runtime)];
 const authoring=[manifest.promptSet,'assets/ui/seal-battle/ritual-20261021/manifest.json','docs/seal-battle-rework-20261021.md',...manifest.assets.map(a=>a.source),...['build-assets.mjs','serve.mjs','verify-ui.mjs','qa/verification.json','qa/mobile-active.png'].map(f=>root+f)];
 const stage=await prepareProductionAssets({files:[...runtime,...authoring]});
 try{
  for(const file of runtime)assert.equal(hash(await readFile(path.join(stage.directory,file))),hash(await readFile(file)),file);
  for(const file of authoring){await assert.rejects(access(path.join(stage.directory,file)));await access(file);}
  for(const asset of manifest.assets){assert.equal(hash(await readFile(asset.source)),asset.sourceSha256);assert.equal(hash(await readFile(asset.runtime)),asset.sha256);}
  const desktop=JSON.parse(await readFile(path.join(stage.directory,'client/windows/manifest.json'),'utf8'));
  for(const asset of manifest.assets)assert.ok(desktop.files.some(f=>f.path==='/'+asset.runtime));
  console.log(`Seal delivery: ${staticFiles.length+1} / 20000 assets; authoring files retained in Git.`);
 }finally{await stage.dispose();}
});
