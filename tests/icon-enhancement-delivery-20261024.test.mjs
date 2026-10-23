import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import path from 'node:path';import {createHash} from 'node:crypto';
import {isProductionFile,prepareProductionAssets} from '../scripts/prepare-production-assets.mjs';
test('ICON enhancement ships its actual UI resources and keeps exact generated originals in Git',async()=>{
  const source='preview/icon-enhancement-20261024/',art=JSON.parse(fs.readFileSync(source+'manifest.json','utf8'));
  const hash=p=>createHash('sha256').update(fs.readFileSync(p)).digest('hex');
  for(const asset of art.assets){assert.equal(hash(asset.source),asset.sourceSha256);assert.equal(hash(asset.runtime),asset.runtimeSha256);assert.equal(isProductionFile(asset.source),false);assert.equal(isProductionFile(asset.runtime),true);}
  const runtime=['admin/icon-enhancement-admin-v1.mjs','js/icon-enhancement-v1.mjs','shared/icon-enhancement-v1.mjs','css/icon-enhancement-v1.css',...art.assets.map(a=>a.runtime)],stage=await prepareProductionAssets({files:[...runtime,...art.assets.map(a=>a.source)]});
  try{for(const file of runtime)assert.equal(hash(path.join(stage.directory,file)),hash(file));for(const a of art.assets)assert.equal(fs.existsSync(path.join(stage.directory,a.source)),false);}finally{await stage.dispose();}
  const read=p=>fs.readFileSync(p,'utf8');
  assert.match(read('js/icon-role-view-v1.mjs'),/mountIconEnhancement\(modal.querySelector\('\.ir-enhancement'\)/);
  assert.match(read('admin/icon-admin-v1.mjs'),/mountIconEnhancementSettings\(\$\('\.ic-enhancement-controls'\)\)/);
  assert.match(read('admin/icon-admin-v1.mjs'),/b.closest\('\.ic-fusion-controls,\.ic-enhancement-controls,/);
  assert.match(read('index.html'),/iconEnhancement=20261024-v1/);assert.match(read('service-worker.js'),/icon-enhancement-20261024-v1/);
  for(const asset of art.assets)assert.ok(read('css/icon-enhancement-v1.css').includes(asset.runtime));
});
