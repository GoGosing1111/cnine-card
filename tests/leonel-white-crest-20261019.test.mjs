import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createHash} from 'node:crypto';
import {MODES} from '../preview/mercenary-leonel-sss-limited-20261018-v2/motion.mjs';
import {isProductionFile} from '../scripts/prepare-production-assets.mjs';
const root='preview/mercenary-leonel-sss-limited-20261018-v2/',m=JSON.parse(fs.readFileSync(root+'manifest.json'));
const sha=p=>createHash('sha256').update(fs.readFileSync(root+p)).digest('hex');
test('white crest runtime uses approved original drawings, a single immutable sword, and registered transparent assets',()=>{
 assert.equal(sha(m.whiteCrest.approvedConcept),m.whiteCrest.approvedConceptSha256);
 assert.equal(sha(m.weapon.url),'c932515485dadcd0a0d3826f37f42f5b29a43311ab0104f390c5347e3ffe2894');
 let count=0;for(const [key,s]of Object.entries(m.motionBody)){
  assert.equal(s.referenceHeight,305);assert.equal(s.frames.length,m.motion[key].frames.length);
  for(const page of s.pages){assert.equal(sha(page.url),page.sha256);assert(isProductionFile(root+page.url));assert(page.width<=4096&&page.height<=4096);}
  for(const f of s.frames){count++;assert.equal(sha(m.motion[key].frames[f.index].bodyFile),f.sourceSha256);assert.deepEqual(f.pivot,{x:320,y:540});}
 }
 assert.equal(count,40);
 for(const s of Object.values(m.whiteCrest.sprites)){assert.equal(sha(s.url),s.sha256);assert.equal(sha(s.source),s.sourceSha256);assert(isProductionFile(root+s.url));}
 const sword=m.whiteCrest.sprites.sword;assert.equal(sword.frames.length,12);
 for(const f of sword.frames){assert(f.axis.start.x<f.axis.end.x);assert(f.axis.start.y>0&&f.axis.start.y<f.rect.height);assert.equal(f.axis.start.y,f.axis.end.y);}
 assert.equal(m.whiteCrest.motionPolicy.cutIn,'FIRST_ULTIMATE_PER_BATTLE');
});
test('body/effect pacing and authoritative impact times retain the released contract',()=>{
 assert.deepEqual(Object.fromEntries(['attack','skill','ultimate'].map(k=>[k,{duration:MODES[k].duration,rate:MODES[k].rate,contacts:MODES[k].physicalContacts}])),{
  attack:{duration:.7,rate:2,contacts:[.21]},skill:{duration:1.55,rate:2,contacts:[.24,.47,.73]},ultimate:{duration:4.25,rate:2,contacts:[1.79]}
 });
 const report=JSON.parse(fs.readFileSync(root+'qa/white-crest-20261019/report.json'));
 assert.equal(report.status,'PASS');assert.equal(report.results.length,2);
 for(const r of report.results){assert(r.continuity.rigidSwordLengthRange<1e-6);assert(r.continuity.phaseError<1e-6);assert(r.continuity.recoveryGripError<1e-6);assert.deepEqual(r.repeated,{first:true,second:false});assert.deepEqual(r.errors,[]);}
});
