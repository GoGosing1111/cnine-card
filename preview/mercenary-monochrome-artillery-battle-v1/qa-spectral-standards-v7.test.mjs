import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import sharp from 'sharp';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {MODES} from './skill.mjs';
const file=p=>fileURLToPath(new URL(p,import.meta.url)),hash=b=>createHash('sha256').update(b).digest('hex');
const m=JSON.parse(await fs.readFile(file('manifest.json'),'utf8')),previous=JSON.parse(await fs.readFile(file('manifest-v6.json'),'utf8')),baseline=JSON.parse(await fs.readFile(file('qa/aura-v5/scope-baseline.json'),'utf8'));
for(const key of ['motion','weapon','displaySizing','headHalo','combatPreparation'])assert.deepEqual(m[key],previous[key]);
for(const key of Object.keys(previous.effects))assert.deepEqual(m.effects[key],previous.effects[key]);
for(const mode of ['attack','skill','ultimate'])assert.deepEqual(MODES[mode],baseline.modes[mode]);
const code=await fs.readFile(file('source/BallisticArtilleryFX.js'),'utf8');
assert.equal(hash(code.slice(code.indexOf(' skullBurst('),code.indexOf(' render(t)')).replaceAll('\r\n','\n')),baseline.attackMethodsSha256);
assert.equal(m.bodyAura.kind,'SPECTRAL_STANDARDS');assert.equal(m.bodyAura.layer,'REAR_ONLY');assert.equal(m.bodyAura.attackEffectsAdded,false);
assert.ok(Object.entries(m.effects).filter(([k])=>k.startsWith('white-tiger-')||k==='ballistic-aura').every(([,v])=>v.previewEnabled===false));
assert.equal(new Set(m.effects['spectral-standards'].frames.map(f=>f.sha256)).size,4);
let maxPoleError=0;
for(let i=0;i<4;i++){
 const layers=await Promise.all(['spectral-standards','spectral-standard-left','spectral-standard-right'].map(async key=>{
  const spec=m.effects[key],f=spec.frames[i],bytes=await fs.readFile(file(f.file));assert.equal(hash(bytes),f.sha256);assert.ok(f.maxBorderAlpha<=1);
  if(f.landmarks){const side=key.endsWith('left')?0:1,v=m.bodyAura.poleVectors[side],dx=(f.landmarks.top.x-f.landmarks.base.x)*f.scaleInBodyHeights,dy=(f.landmarks.top.y-f.landmarks.base.y)*f.scaleInBodyHeights;
   const e=Math.hypot(dx*Math.cos(f.rotation)-dy*Math.sin(f.rotation)-v.x,dx*Math.sin(f.rotation)+dy*Math.cos(f.rotation)-v.y);maxPoleError=Math.max(maxPoleError,e);assert.ok(e<1e-12);}
  return sharp(bytes).ensureAlpha().raw().toBuffer();
 }));
 for(let p=3;p<layers[0].length;p+=4)assert.equal(layers[1][p]+layers[2][p],layers[0][p],'split must preserve original alpha exactly');
}
for(const key of ['spectral-standards','spectral-standard-left','spectral-standard-right'])assert.equal(hash(await fs.readFile(file(m.effects[key].atlas))),m.effects[key].sha256);
assert.equal(hash(await fs.readFile(file('assets/locked/approved-rifle.png'))),'57331f625b12d0c1ea258814d19ae425cb160ff158ddfc7f499680f25fcaf0ff');
const sourceHash=hash(await fs.readFile(file('assets/sources/spectral-standards-v7.png')));
assert.equal(sourceHash,m.effects['spectral-standards'].sourceSha256);
const report={status:'PASS',scope:'SPECTRAL_BANNER_AMBIENT_ONLY',authoredPairFrames:4,derivedLayers:2,sourceHash,maxPoleError,sourceAlphaPreserved:true,previousMotionWeaponHaloAndCombatPreserved:true,attackMethodsSha256:baseline.attackMethodsSha256,rejectedAuraAssetsDisabled:true};
await fs.writeFile(file('qa/standards-v7/scope-report.json'),JSON.stringify(report,null,2)+'\n');console.log('PASS: four authored cloth phases, two fixed endpoints per standard, exact alpha split; body/rifle/halo/AR/artillery/balance unchanged.');
