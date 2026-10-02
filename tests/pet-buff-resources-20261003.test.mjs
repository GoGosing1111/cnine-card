import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import sharp from 'sharp';
import {PET_BUFF_TYPES} from '../shared/pet-cms-v1.mjs';
import {PET_BUFF_VISUALS,petBuffVisual} from '../shared/pet-buff-visuals-v1.mjs';
const root=new URL('../',import.meta.url),sha=bytes=>createHash('sha256').update(bytes).digest('hex');
test('each supported pet buff has a complete transparent atlas and readable icon',async()=>{
  assert.deepEqual(Object.keys(PET_BUFF_VISUALS),Object.keys(PET_BUFF_TYPES));
  assert.equal(petBuffVisual('__proto__'),null);
  const manifest=JSON.parse(await readFile(new URL('assets/ui/pets/buffs-v1/manifest.json',root),'utf8'));
  for(const v of Object.values(PET_BUFF_VISUALS)){
    const entry=manifest.resources.find(row=>row.type===v.type);
    for(const key of ['source','atlas','icon'])assert.equal(sha(await readFile(new URL(entry[key].path,root))),entry[key].sha256);
    const atlas=await sharp(await readFile(new URL(v.atlas.slice(1),root))).ensureAlpha().raw().toBuffer({resolveWithObject:true});
    assert.equal(atlas.info.width,1280);assert.equal(atlas.info.height,640);assert.equal(atlas.info.channels,4);
    for(let f=0;f<8;f++){
      let opaque=0,edges=0;
      for(let y=0;y<320;y++)for(let x=0;x<320;x++){
        const alpha=atlas.data[((y+Math.floor(f/4)*320)*1280+x+f%4*320)*4+3];
        if(alpha>20){opaque++;if(x<2||x>317||y<2||y>317)edges++;}
      }
      assert.ok(opaque>8000,v.type+' frame '+f+' must contain an effect');
      assert.equal(edges,0,v.type+' frame '+f+' must not be visibly clipped');
    }
    const icon=await sharp(await readFile(new URL(v.icon.slice(1),root))).metadata();
    assert.equal(icon.width,192);assert.equal(icon.height,192);assert.ok(icon.hasAlpha);
  }
});
