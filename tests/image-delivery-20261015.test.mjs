import test from 'node:test';import assert from 'node:assert/strict';
import {readFile,mkdtemp,mkdir,writeFile,access,realpath,rm} from 'node:fs/promises';
import {createHash} from 'node:crypto';import {tmpdir} from 'node:os';import path from 'node:path';
import {prepareProductionAssets,isProductionFile} from '../scripts/prepare-production-assets.mjs';
test('overlapping Pages image rules emit one cache lifetime and keep immutable limited to hashed derivatives',async()=>{
 const headers=await readFile(new URL('../_headers',import.meta.url),'utf8'),rules=[];let route;
 for(const line of headers.split(/\r?\n/)){
  if(line.startsWith('/'))route=line.trim();
  const value=line.match(/^\s+Cache-Control:\s*(.+)$/i)?.[1];if(value)rules.push({route,value});
 }
 const cacheFor=url=>rules.filter(({route})=>route.endsWith('*')?url.startsWith(route.slice(0,-1)):url===route).map(row=>row.value).join(', ');
 for(const url of ['/assets/optimized/20261015-v1/hash.webp','/assets/approved.png']){
  const directives=cacheFor(url).split(',').map(value=>value.trim());
  assert.equal(directives.filter(value=>/^max-age=/.test(value)).length,1,'conflicting lifetimes invalidate caching');
  assert.ok(directives.includes('max-age=86400'));
  assert.equal(directives.includes('immutable'),url.includes('/optimized/'));
 }
 assert.equal(cacheFor('/api/sync/state'),'');
});
test('all delivery mappings preserve their originals and resolve to verified smaller derivatives',async()=>{
 const manifest=JSON.parse(await readFile(new URL('../docs/image-delivery-20261015/manifest.json',import.meta.url),'utf8')),checked=new Set();
 const hash=b=>createHash('sha256').update(b).digest('hex');let source=0,compressed=0;
 for(const row of manifest.files){
  const original=await readFile(new URL('../'+row.path,import.meta.url));assert.equal(hash(original),row.sourceHash,row.path+' original changed');assert.equal(original.length,row.sourceBytes);
  if(!checked.has(row.destination)){const target=await readFile(new URL('../'+row.destination,import.meta.url));assert.equal(hash(target),row.optimizedHash,row.destination);assert.equal(target.length,row.optimizedBytes);checked.add(row.destination);}
  assert(row.optimizedBytes<row.sourceBytes*.92&&row.pixelExact&&row.width>0&&row.height>0);source+=row.sourceBytes;compressed+=row.optimizedBytes;
 }
 assert.equal(source,manifest.sourceBytes);assert.equal(compressed,manifest.optimizedBytes);assert(compressed<source*.7);
});
test('Pages staging preserves fixture imports and images and generates a desktop resource manifest',async()=>{
 const parent=await mkdtemp(path.join(tmpdir(),'cnine-stage-test-'));let stage;
 try{
  const root=path.join(parent,'source'),deps=path.join(parent,'dependencies');await mkdir(root);await mkdir(deps);
  const files=['index.html','assets/approved.png','tests/a.test.mjs','tests/b.browser.mjs','preview/example/qa.test.mjs','preview/example/qa.browser.mjs','tests/fixtures/live.json','tests/helpers/live.mjs','functions/api/test.js','packaging/windows-client/main.mjs','docs/qa/review/report.json','docs/qa/review/screenshot.png'];
  for(const f of files){await mkdir(path.dirname(path.join(root,f)),{recursive:true});await writeFile(path.join(root,f),'preserved '+f);}
  stage=await prepareProductionAssets({root,files,tempRoot:parent,dependencies:deps});assert.equal(stage.assetCount,5);assert.equal(stage.excluded,7);
  const desktop=JSON.parse(await readFile(path.join(stage.directory,'client/windows/manifest.json'),'utf8'));
  assert.deepEqual(desktop.files.map(f=>f.path),['/assets/approved.png','/index.html']);
  for(const file of files)if(isProductionFile(file))assert.equal(await readFile(path.join(stage.directory,file),'utf8'),'preserved '+file);else await assert.rejects(access(path.join(stage.directory,file)));
  for(const file of files.filter(f=>f.startsWith('docs/qa/')))assert.equal(await readFile(path.join(root,file),'utf8'),'preserved '+file,'QA originals remain in the repository');
  await stage.dispose();stage=null;assert.equal(await realpath(deps),deps);assert.equal(await readFile(path.join(root,'assets/approved.png'),'utf8'),'preserved assets/approved.png');
 }finally{await stage?.dispose();const resolved=await realpath(parent);assert.equal(path.dirname(resolved),await realpath(tmpdir()));assert(path.basename(resolved).startsWith('cnine-stage-test-'));await rm(resolved,{recursive:true,force:true});}
});
