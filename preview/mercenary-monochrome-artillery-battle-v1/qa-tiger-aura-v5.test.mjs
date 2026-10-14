import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import sharp from 'sharp';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {MODES} from './skill.mjs';
const file=p=>fileURLToPath(new URL(p,import.meta.url)),hash=s=>createHash('sha256').update(s).digest('hex');
const m=JSON.parse(await fs.readFile(file('manifest.json'),'utf8')),previous=JSON.parse(await fs.readFile(file('manifest-v4.json'),'utf8'));
const baseline=JSON.parse(await fs.readFile(file('qa/aura-v5/scope-baseline.json'),'utf8'));
for(const key of ['motion','weapon','displaySizing','headHalo','combatPreparation'])assert.deepEqual(m[key],previous[key]);
for(const key of Object.keys(previous.effects).filter(k=>k!=='ballistic-aura'))assert.deepEqual(m.effects[key],previous.effects[key]);
for(const mode of ['attack','skill','ultimate'])assert.deepEqual(MODES[mode],baseline.modes[mode]);
const code=await fs.readFile(file('source/BallisticArtilleryFX.js'),'utf8');
assert.equal(hash(code.slice(code.indexOf(' skullBurst('),code.indexOf(' render(t)')).replaceAll('\r\n','\n')),baseline.attackMethodsSha256);
assert.equal(m.effects['ballistic-aura'].previewEnabled,false);
assert.equal(m.bodyAura.ambientOnly,true);assert.equal(m.bodyAura.attackEffectsAdded,false);
assert.ok(!Object.keys(m.effects).some(k=>/tiger.*(claw|roar|aim|attack)/.test(k)));
const source=m.effects['white-tiger-aura'];assert.equal(source.frameCount,4);
assert.equal(new Set(source.frames.map(f=>f.sha256)).size,4);
for(let i=0;i<4;i++){
 const layers=await Promise.all(['white-tiger-aura','white-tiger-aura-rear','white-tiger-aura-front'].map(async key=>{
  const s=m.effects[key],f=s.frames[i];assert.equal(f.maxBorderAlpha<=64,true);assert.deepEqual(f.anchor,source.frames[i].anchor);
  const bytes=await fs.readFile(file(f.file));assert.equal(hash(bytes),f.sha256);return sharp(bytes).ensureAlpha().raw().toBuffer();
 }));
 for(let p=3;p<layers[0].length;p+=4)assert.equal(layers[1][p]+layers[2][p],layers[0][p],'front/rear must preserve original opacity');
}
const report={status:'PASS',scope:'AMBIENT_AURA_ONLY',unchanged:['body and rigid rifle','head halo','9-shot AR attack','30-shot skill and skull','25-shot cover and 5 central artillery salvos','combat preparation and release flags'],authoredAuraFrames:4,derivedLayers:2,attackEffectsAdded:0,sourceAlphaPreserved:true};
await fs.writeFile(file('qa/aura-v5/scope-report.json'),JSON.stringify(report,null,2)+'\n');console.log('PASS: aura-only scope, original combat/attack paths, four registered frames and complementary alpha.');
