import test from 'node:test';import assert from 'node:assert/strict';
import {readFile,mkdtemp,mkdir,writeFile,access,realpath,rm} from 'node:fs/promises';
import {createHash} from 'node:crypto';import {tmpdir} from 'node:os';import path from 'node:path';
import {prepareProductionAssets,isProductionFile} from '../scripts/prepare-production-assets.mjs';
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
test('Pages staging excludes only test executables, preserving preview fixture imports and original images',async()=>{
 const parent=await mkdtemp(path.join(tmpdir(),'cnine-stage-test-'));let stage;
 try{
  const root=path.join(parent,'source'),deps=path.join(parent,'dependencies');await mkdir(root);await mkdir(deps);
  const files=['index.html','assets/approved.png','tests/a.test.mjs','tests/b.browser.mjs','tests/fixtures/live.json','tests/helpers/live.mjs','functions/api/test.js'];
  for(const f of files){await mkdir(path.dirname(path.join(root,f)),{recursive:true});await writeFile(path.join(root,f),'preserved '+f);}
  stage=await prepareProductionAssets({root,files,tempRoot:parent,dependencies:deps});assert.equal(stage.assetCount,4);assert.equal(stage.excluded,2);
  for(const file of files)if(isProductionFile(file))assert.equal(await readFile(path.join(stage.directory,file),'utf8'),'preserved '+file);else await assert.rejects(access(path.join(stage.directory,file)));
  await stage.dispose();stage=null;assert.equal(await realpath(deps),deps);assert.equal(await readFile(path.join(root,'assets/approved.png'),'utf8'),'preserved assets/approved.png');
 }finally{await stage?.dispose();const resolved=await realpath(parent);assert.equal(path.dirname(resolved),await realpath(tmpdir()));assert(path.basename(resolved).startsWith('cnine-stage-test-'));await rm(resolved,{recursive:true,force:true});}
});
