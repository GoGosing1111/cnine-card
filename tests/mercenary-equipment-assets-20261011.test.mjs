import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import sharp from 'sharp';
import {REGION_EQUIPMENT} from '../shared/legion-regions-v1.mjs';
import {mercenaryEquipmentImage} from '../shared/mercenary-equipment-v1.mjs';
async function readAsset(file){try{return await fs.readFile(file);}catch(e){if(e.code!=='ENOENT')throw e;const entry=execFileSync('git',['ls-files','-v','--',file],{encoding:'utf8'});assert.ok(entry.startsWith('S '),'only unchanged sparse assets can come from Git');return execFileSync('git',['cat-file','blob','HEAD:'+file],{maxBuffer:40000000});}}
test('all thirty regional equipment items have distinct complete transparent art and preserved generated sources',async()=>{
  const dir='preview/legion-mercenary-equipment-20261011';
  const manifest=JSON.parse(await fs.readFile(dir+'/assets.json','utf8')),prompts=JSON.parse(await fs.readFile(dir+'/generation-manifest.json','utf8'));
  assert.equal(manifest.assets.length,30);assert.equal(prompts.assets.length,30);assert.equal(new Set(manifest.assets.map(row=>row.sourceSha256)).size,30);
  assert.equal(new Set(REGION_EQUIPMENT.map(item=>item.image)).size,30);
  for(const item of REGION_EQUIPMENT){
    assert.equal(mercenaryEquipmentImage(item.code),item.image);
    const asset=manifest.assets.find(row=>'/'+row.target===item.image);assert.ok(asset,item.code);
    const [data,source]=await Promise.all([readAsset(asset.target),readAsset(asset.source)]),meta=await sharp(data).metadata(),stats=await sharp(data).stats();
    assert.equal(meta.width,512);assert.equal(meta.height,512);assert.equal(meta.hasAlpha,true);assert.equal(stats.channels[3].min,0);assert.equal(stats.channels[3].max,255);assert.ok(data.length<250000);
    assert.equal(createHash('sha256').update(source).digest('hex'),asset.sourceSha256);assert.ok(prompts.assets.find(row=>row.id===asset.id)?.prompt);
  }
});
