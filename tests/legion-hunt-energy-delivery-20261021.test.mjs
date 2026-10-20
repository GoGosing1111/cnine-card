import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile,mkdtemp,access,rm,realpath} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {prepareProductionAssets} from '../scripts/prepare-production-assets.mjs';

test('Pages ships legion policy, controller and original art while preserving energy audit files only in Git',async()=>{
  const runtime=['index.html','js/legion-hunt-entry-v1.mjs','shared/legion-hunt-energy-v1.mjs','shared/content-energy-v1.mjs','assets/ui/brand/reverse-call-20261016/icon-512.png'];
  const audits=['docs/content-energy-20261020.md','docs/content-energy-20261020-release.json','docs/content-energy-clock-fix-20261020.md','docs/content-energy-clock-fix-20261020-release.json','docs/legion-hunt-daily-energy-20261021.md'];
  const files=[...runtime,...audits],hash=data=>createHash('sha256').update(data).digest('hex'),originals=new Map();
  for(const file of files)originals.set(file,hash(await readFile(file)));
  const temp=await mkdtemp(path.join(tmpdir(),'legion-delivery-'));let stage;
  try{
    stage=await prepareProductionAssets({files,tempRoot:temp});
    assert.equal(stage.assetCount,runtime.length+1);assert.equal(stage.excluded,audits.length);
    for(const file of runtime)assert.equal(hash(await readFile(path.join(stage.directory,file))),originals.get(file));
    for(const file of audits)await assert.rejects(access(path.join(stage.directory,file)));
    const desktop=JSON.parse(await readFile(path.join(stage.directory,'client/windows/manifest.json'),'utf8'));
    assert.ok(desktop.files.some(file=>file.path==='/shared/legion-hunt-energy-v1.mjs'));
    await stage.dispose();stage=null;
    for(const file of files)assert.equal(hash(await readFile(file)),originals.get(file),'repository original retained: '+file);
  }finally{
    await stage?.dispose();
    const resolved=await realpath(temp);
    assert.equal(path.dirname(resolved),await realpath(tmpdir()));assert(path.basename(resolved).startsWith('legion-delivery-'));
    await rm(resolved,{recursive:true,force:true});
  }
});
