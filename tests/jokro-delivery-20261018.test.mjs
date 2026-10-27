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

test('every shared battle consumer embeds the approved Jokro metadata without a runtime manifest request',()=>{
 const report=JSON.parse(fs.readFileSync('preview/project-v-v3/grid-build-report.json'));
 for(const {file} of report.outputs){
  const bundle=fs.readFileSync(file,'utf8');
  assert(bundle.includes('jokro-iaido'),file);
  assert(!bundle.includes('manifest.json?jokro='),file);
  assert(!bundle.includes('JOKRO_MOTION_ASSETS'),file);
 }
});
