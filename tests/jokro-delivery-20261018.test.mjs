import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {isProductionFile} from '../scripts/prepare-production-assets.mjs';
import {JOKRO_ART} from '../shared/mercenary-jokro-v1.mjs';
test('Jokro ships every runtime atlas and approved original while retaining unshipped individual QA frames in Git',()=>{
 const root='preview/mercenary-jokro-iaido-20261017-v1/',m=JSON.parse(fs.readFileSync(root+'manifest.json'));
 for(const p of [JOKRO_ART.sourceArt,JOKRO_ART.battleSprite,JOKRO_ART.frame,root+'manifest.json',root+'qa/motion-contact-sheet.png']){assert(isProductionFile(p));assert(fs.statSync(p).size>0);}
 let frames=0;for(const spec of [...Object.values(m.motion),...Object.values(m.effects)]){
  assert(isProductionFile(root+spec.atlas));assert(fs.statSync(root+spec.atlas).size>0);
  for(const f of spec.frames){assert(!isProductionFile(root+f.file));assert(fs.statSync(root+f.file).size>0);frames++;}
 }
 assert.equal(frames,132);
});
