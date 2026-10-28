import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {createHash} from 'node:crypto';
import sharp from 'sharp';
import {ICON_EXPANSION_CARDS} from '../shared/icon-expansion-v1.mjs';
import {ICON_LIVE_CARDS} from '../shared/icon-fusion-policy-v1.mjs';
const base=new URL('../preview/icon-bongsoon-battle-20261016-v1/',import.meta.url);
const read=file=>fs.readFile(new URL(file,base)),json=async file=>JSON.parse(await read(file));
const hash=buffer=>createHash('sha256').update(buffer).digest('hex').toUpperCase();
test('new Bongsoon preserves her photo and is separate from the existing Bongsoon',async()=>{
 const manifest=await json('manifest.json'),input=await json('input.json'),card=ICON_EXPANSION_CARDS.find(c=>c.code==='ICON-NAMUNEUL-BONGSOON-20261016');
 assert.equal(hash(await read(manifest.sourceArt.file)),'06F470732BE2F36D62DA074F23287619572F3E0E1B5EE2964A20E86FA62BF53E');
 assert.equal(card.cardId,'CN-1C000013');assert.equal(card.techniqueCode,'RETURN_OATH');assert.equal(card.releaseEnabled,true);
 assert.equal(ICON_LIVE_CARDS.find(c=>c.code==='ICON-NAMUNEUL-BONGSOON').cardId,'CN-1C000003');
 assert.equal(ICON_LIVE_CARDS.length,13);assert.equal(manifest.acquisitionEnabled,false);assert.equal(manifest.battleEnabled,false);
 assert.equal(input.techniqueAssignment,'AGENT_DESIGNED_USER_REQUESTED_PREPARATION');
 assert.deepEqual(card.tuning,{firstAction:1,cooldownActions:4,maxCasts:2,reviveHpPercent:35,bossDamagePercent:10,windowActions:5});
 assert.equal(hash(await read(manifest.sourceArt.runtime)),manifest.sourceArt.runtimeSha256);
 const existing=ICON_LIVE_CARDS.find(c=>c.code==='ICON-NAMUNEUL-BONGSOON');assert.equal(hash(await fs.readFile(new URL('../'+existing.sourceArt,import.meta.url))),'B056757989C7F4E5FED48668AE4FA46C2276598B7FB6E8C1A655C265E8B2856E');
});
test('transparent SD and sixteen independent generated FX cells are preserved in the runtime atlas',async()=>{
 const manifest=await json('manifest.json');
 assert.equal(hash(await read(manifest.character.source)),manifest.character.sourceSha256);
 assert.equal(hash(await read(manifest.character.runtime)),manifest.character.runtimeSha256);
 assert.equal(hash(await read(manifest.effect.source)),manifest.effect.sourceSha256);
 assert.equal(hash(await read(manifest.effect.runtime)),manifest.effect.runtimeSha256);
 const sd=await sharp(await read(manifest.character.runtime)).metadata();assert.deepEqual([sd.width,sd.height,sd.hasAlpha],[768,768,true]);
 assert.ok(manifest.character.runtimeAlpha.edgeMax<=12);assert.ok(manifest.character.runtimeAlpha.transparentFraction>.2);
 assert.equal(new Set(manifest.effect.frames.map(f=>f.rawSha256)).size,16);
 for(const frame of manifest.effect.frames){
  const {width,height}=frame.sourceRect,left=frame.index%4*384+Math.floor((384-width)/2),top=Math.floor(frame.index/4)*384+Math.floor((384-height)/2);
  const raw=await sharp(await read(manifest.effect.runtime)).extract({left,top,width,height}).ensureAlpha().raw().toBuffer();
  const source=await sharp(await read(manifest.effect.source)).extract(frame.sourceRect).ensureAlpha().raw().toBuffer();assert.equal(hash(source),frame.rawSha256);
  // Lossless WebP can normalize hidden RGB; alpha and every visible sample stay exact.
  for(let i=0;i<raw.length;i+=4){assert.equal(raw[i+3],source[i+3]);if(source[i+3])for(let c=0;c<3;c++)assert.equal(raw[i+c],source[i+c]);}assert.ok(frame.edgeMax<=12);
 }
});
test('real server scenarios enforce kill, boss damage and deadline outcomes without activating production',async()=>{
 const fixtures=await json('fixtures.json');
 for(const key of ['PVP','PVE','FAIL']){
  const f=fixtures[key],events=f.battleV2.result.timeline,rows=events.filter(e=>e.techniqueCode==='RETURN_OATH');
  assert.equal(f.review.authority,'REAL_SERVER_SYMBOL_SIMULATION');assert.equal(f.review.productionActivation,false);
  for(const [phase,field] of [['APPLY','oaths'],['REVIVE','revivals'],['FAIL','failures']])assert.equal(rows.filter(e=>e.phase===phase).length,f.review[field]);
  const apply=rows.find(e=>e.phase==='APPLY');assert.equal(apply.remaining,5);
  const revivals=rows.filter(e=>e.phase==='REVIVE');assert.equal(new Set(revivals.map(e=>e.targetId)).size,revivals.length);
  if(key==='FAIL'){assert.equal(revivals.length,0);assert.ok(rows.some(e=>e.phase==='FAIL'&&e.reason==='DEADLINE'));}
  else {assert.equal(revivals.length,1);const r=revivals[0];assert.equal(r.targetHpAfter,Math.round(r.targetMaxHp*.35));assert.equal(r.reviveHpPercent,35);}
  if(key==='PVE'){assert.equal(apply.bossGoal,true);assert.equal(apply.goal,4000);assert.ok(rows.some(e=>e.phase==='PROGRESS'));}
  else assert.equal(apply.bossGoal,false);
  const caster=f.battleV2.teams.A.cards.find(c=>c.id===f.review.casterId);assert.equal(caster.cardId,'PREVIEW:NAMUNEUL-BONGSOON-20261016');assert.ok(caster.projectVBattleArt.primaryUrl.endsWith('/assets/bongsoon-sd.webp'));
 }
});
