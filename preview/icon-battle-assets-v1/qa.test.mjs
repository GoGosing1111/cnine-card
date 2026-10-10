import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import crypto from 'node:crypto';
import sharp from 'sharp';
import {Container,Texture} from 'pixi.js';
import {ICON_CARD_ROSTER} from '../../shared/icon-card-roster-v1.mjs';
import {sampleIconSequence} from './sequence.mjs';
import {IconEffectPlayback} from './source/IconEffectPlayback.js';

const root=new URL('./',import.meta.url),read=path=>fs.readFile(new URL(path,root));
const manifest=JSON.parse(await read('manifest.json'));
const hash=bytes=>crypto.createHash('sha256').update(bytes).digest('hex').toUpperCase();
const visibleRgbaHash=bytes=>{
  // Lossless WebP may choose arbitrary RGB under alpha=0; alpha and every
  // nontransparent pixel must still match exactly, with no error tolerance.
  const canonical=Buffer.from(bytes);
  for(let i=0;i<canonical.length;i+=4)if(canonical[i+3]===0)canonical.fill(0,i,i+3);
  return hash(canonical);
};
// Keep failed pixel assertions bounded: printing two 0.6 MB Buffers can
// exhaust the assertion diff formatter without identifying the actual issue.
sharp.cache(false);
test('all seven approved photographs remain separate from SD and playable release stays locked',async()=>{
  assert.equal(manifest.characters.length,8);assert.equal(manifest.releaseEnabled,false);assert.equal(manifest.acquisitionEnabled,false);assert.equal(manifest.damageCalculation,false);
  for(const c of manifest.characters){
    const card=ICON_CARD_ROSTER.find(row=>row.code===c.code);
    const joeun=c.code==='ICON-OH-JOEUN';
    assert.equal(card.portraitApproval.scope,joeun?'SOURCE_ILLUSTRATION_AND_BATTLE_SD':c.code==='ICON-ZEUS-CHEOLGU'?'SOURCE_PHOTO_WITH_REQUESTED_QUALITY_ENHANCEMENT':'SOURCE_PHOTO_ONLY');assert.equal(c.sourceArt,card.sourceArt);assert.equal(c.sourceArtSha256,card.sourceSha256);
    assert.equal(hash(await read('../../'+card.sourceArt)),card.sourceSha256);
    assert.notEqual(c.runtime,c.sourceArt);assert.equal(c.visualApproval,joeun?'USER_APPROVED_20261006':c.code==='ICON-ZEUS-CHEOLGU'?'CREATED_FOR_USER_REQUEST_20261010':'USER_REVIEW_PENDING');assert.equal(c.releaseEnabled,false);
    assert.equal(hash(await read(c.source)),c.sourceSha256);assert.equal(hash(await read(c.runtime)),c.runtimeSha256);
    const meta=await sharp(await read(c.runtime)).metadata();assert.deepEqual([meta.width,meta.height,meta.hasAlpha],[768,768,true]);
    assert.ok(c.runtimeAlpha.transparentFraction>.2);assert.equal(c.runtimeAlpha.edgeMax,0);
    assert.ok(c.footAnchor.x>.3&&c.footAnchor.x<.7);assert.ok(c.footAnchor.y>.85&&c.footAnchor.y<1);
  }
});
test('7 hits + 7 skills + 4 unique concepts have independent generated sources, not recolors',()=>{
  assert.equal(manifest.effects.length,20);assert.equal(manifest.frameCount,320);
  for(const kind of ['HIT','SKILL','UNIQUE'])assert.equal(manifest.effects.filter(e=>e.kind===kind).length,kind==='UNIQUE'?4:8);
  assert.equal(new Set(manifest.effects.map(e=>e.sourceSha256)).size,20);
  for(const character of manifest.characters){assert.ok(manifest.effects.find(e=>e.id===character.hitEffect));assert.ok(manifest.effects.find(e=>e.id===character.skillEffect))}
});
for(const e of manifest.effects)test(`${e.id}: 16 unique hash-bound frames, real alpha, lossless atlas`,async()=>{
  assert.equal(e.frameCount,16);assert.equal(e.visualApproval,e.id.startsWith('zeus-cheolgu-')?'CREATED_FOR_USER_REQUEST_20261010':'USER_REVIEW_PENDING');assert.equal(e.releaseEnabled,false);
  const source=await read(e.source),atlas=await read(e.runtime);assert.equal(hash(source),e.sourceSha256);assert.equal(hash(atlas),e.runtimeSha256);
  const meta=await sharp(atlas).metadata();assert.deepEqual([meta.width,meta.height,meta.hasAlpha],[1536,1536,true]);
  assert.ok(e.sourceAlpha.transparentFraction>.1);assert.equal(new Set(e.frames.map(f=>f.rawSha256)).size,16);
  for(const f of e.frames){
    assert.ok(f.edgeMax<=12);assert.equal(hash(await read(f.file)),f.sha256);
    const rect=f.sourceRect,raw=await sharp(source).extract(rect).ensureAlpha().raw().toBuffer();assert.equal(hash(raw),f.rawSha256);
    const decoded=await sharp(await read(f.file)).ensureAlpha().raw().toBuffer();
    const tile=await sharp(atlas).extract({left:f.index%4*384,top:Math.floor(f.index/4)*384,width:384,height:384}).ensureAlpha().raw().toBuffer();
    assert.equal(visibleRgbaHash(tile),visibleRgbaHash(decoded),`${e.id}/${f.index}: alpha and every visible atlas pixel must match the standalone frame exactly`);
  }
});
test('every contact frame uses the same clock at 0.25x / 1x / 2x, and seeking backwards is deterministic',()=>{
  for(const e of manifest.effects){
    for(const speed of [.25,1,2]){const time=e.contactAt/speed*speed,state=sampleIconSequence(e,time);assert.equal(state.frame,e.collisionFrame);assert.equal(state.contactReached,true)}
    const peak=sampleIconSequence(e,e.contactAt);sampleIconSequence(e,e.duration);assert.deepEqual(sampleIconSequence(e,e.contactAt),peak);
    assert.equal(sampleIconSequence(e,0).visible,false);assert.equal(sampleIconSequence(e,e.duration).visible,false);
  }
});
test('play, pause, seek, cancel, restart, destroy leave no registered timeline or effect object',()=>{
  const engine={effectLayer:new Container(),simpleTimelines:new Set()};
  const actor={root:new Container(),fullBodyHeight:260},target={root:new Container(),fullBodyHeight:260};
  const effect=manifest.effects[0],sequence={frames:Array.from({length:16},()=>Texture.EMPTY)};
  const fx=new IconEffectPlayback(engine,{actor,target,effect,sequence});
  fx.play();assert.equal(engine.simpleTimelines.size,1);fx.pause();assert.equal(engine.simpleTimelines.size,0);
  fx.seek(effect.contactAt);assert.equal(fx.diagnostics().frame,4);assert.equal(fx.diagnostics().activeSprites,2);
  fx.setSpeed(.25);assert.equal(fx.diagnostics().speed,.25);fx.cancel();assert.equal(fx.diagnostics().activeSprites,0);assert.equal(engine.simpleTimelines.size,0);
  fx.play();assert.equal(engine.simpleTimelines.size,1);fx.destroy();assert.equal(engine.simpleTimelines.size,0);assert.equal(engine.effectLayer.children.length,0);
  fx.destroy();actor.root.destroy();target.root.destroy();engine.effectLayer.destroy();
});
test('preview reuses shared V3 and photos in the unchanged live card dock, no live registration',async()=>{
  const code=String(await read('source/preview.js')),fx=String(await read('source/IconEffectPlayback.js'));
  assert.match(code,/mountForBattle.*project-v-pixi-battle/);assert.match(code,/ProjectVBattleV3Live.createRenderer/);
  assert.match(code,/displayCharacters=.*slice\(0,4\)/);assert.match(code,/const deck=\[\.\.\.cards,targets\[4\]\]/);
  assert.doesNotMatch(code,/new Application|setFormationMercenaries|\/api\//);assert.doesNotMatch(fx,/AnimatedSprite|setInterval|requestAnimationFrame/);
  assert.match(fx,/engine.effectLayer.addChild/);assert.match(fx,/gsap.timeline/);assert.match(fx,/simpleTimelines/);
  for(const file of ['index.html','js/app.js','js/battle-v3-live.js','functions/api/[[path]].js'])assert.doesNotMatch(String(await read('../../'+file)),/icon-battle-assets-v1|ICON_PREVIEW_EFFECT/);
});
