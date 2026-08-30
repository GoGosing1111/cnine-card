import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import sharp from 'sharp';

const ROOT=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const PREVIEW=path.join(ROOT,'preview','project-v-v3-live-style-event-fx-v2');
const MANIFEST=JSON.parse(await fs.readFile(path.join(PREVIEW,'manifest.json'),'utf8'));
const EXPECTED_IDS=['critical','counter','ultimate','boss-ultimate','dodge','revive'];

const hash=async file=>createHash('sha256').update(await fs.readFile(file)).digest('hex');
const resolvePreview=relative=>path.join(PREVIEW,...relative.split('/'));

test('preview remains unassigned and disconnected',()=>{
  assert.equal(MANIFEST.previewOnly,true);
  assert.equal(MANIFEST.runtimeConnected,false);
  assert.equal(MANIFEST.deployAllowed,false);
  assert.equal(MANIFEST.assignment.status,'UNASSIGNED');
  assert.equal(MANIFEST.assignment.decisionOwner,'USER');
  assert.equal(MANIFEST.assignment.auditionLabelsOnly,true);
  assert.deepEqual(MANIFEST.resources.map(item=>item.id),EXPECTED_IDS);
  assert.ok(MANIFEST.resources.every(item=>item.binding===null));
});

test('all original, processed, atlas and audio hashes are fixed',async()=>{
  for(const resource of MANIFEST.resources){
    assert.equal(await hash(resolvePreview(resource.raw.path)),resource.raw.sha256,`${resource.id} raw hash`);
    assert.equal(await hash(resolvePreview(resource.sourceSheet.path)),resource.sourceSheet.sha256,`${resource.id} source hash`);
    assert.equal(await hash(resolvePreview(resource.atlas.png)),resource.atlas.pngSha256,`${resource.id} atlas PNG hash`);
    assert.equal(await hash(resolvePreview(resource.atlas.json)),resource.atlas.jsonSha256,`${resource.id} atlas JSON hash`);
    assert.equal(await hash(resolvePreview(resource.audio.path)),resource.audio.sha256,`${resource.id} audio hash`);
    assert.equal((await fs.stat(resolvePreview(resource.audio.path))).size,resource.audio.bytes,`${resource.id} audio bytes`);
    assert.equal(resource.audio.reusedUnmodified,true);
  }
});

test('Pixi atlases meet the 12-frame RGBA contract',async()=>{
  for(const resource of MANIFEST.resources){
    const json=JSON.parse(await fs.readFile(resolvePreview(resource.atlas.json),'utf8'));
    const pngMeta=await sharp(resolvePreview(resource.atlas.png)).metadata();
    assert.equal(pngMeta.width,MANIFEST.atlasContract.atlasWidth,`${resource.id} atlas width`);
    assert.equal(pngMeta.height,MANIFEST.atlasContract.atlasHeight,`${resource.id} atlas height`);
    assert.equal(pngMeta.hasAlpha,true,`${resource.id} atlas alpha`);
    const names=Object.keys(json.frames);
    assert.equal(names.length,MANIFEST.atlasContract.frameCount,`${resource.id} frame count`);
    names.forEach((name,index)=>{
      assert.equal(name,`${resource.id}_${String(index).padStart(2,'0')}.png`);
      assert.equal(json.frames[name].frame.w,MANIFEST.atlasContract.frameWidth);
      assert.equal(json.frames[name].frame.h,MANIFEST.atlasContract.frameHeight);
    });
    assert.equal(json.meta.collisionFrame,resource.collisionFrame);
    assert.equal(json.meta.fps,resource.fps);
  }
});

test('recorded audio peaks align with collision frames',()=>{
  for(const resource of MANIFEST.resources){
    const collisionMs=resource.collisionFrame*1000/resource.fps;
    assert.ok(Math.abs(collisionMs-resource.audio.syncPointMs)<=1,`${resource.id}: ${collisionMs} vs ${resource.audio.syncPointMs}`);
    assert.ok(Math.abs(collisionMs-resource.collisionSyncMs)<=1,`${resource.id}: manifest collision sync`);
  }
});

test('preview source uses live V3-style layers without procedural fallbacks',async()=>{
  const files=await Promise.all([
    'source/EventEffectFX.js',
    'source/EventAudioMixer.js',
    'source/EventTimeline.js',
    'source/live-style-event-fx-lab.src.js',
    'index.html'
  ].map(async relative=>[relative,await fs.readFile(path.join(PREVIEW,relative),'utf8')]));
  const text=files.map(([,value])=>value).join('\n');
  for(const layer of MANIFEST.implementation.layers)assert.match(text,new RegExp(layer));
  assert.match(text,/WebAudio|AudioContext/);
  assert.match(text,/gsap/);
  assert.match(text,/project-v-v3-live-style-event-fx-v2\/assets\/audio/);
  assert.match(text,/Range:'bytes=0-'/);
  assert.match(text,/BINDING UNASSIGNED|UNASSIGNED/);
  assert.doesNotMatch(text,/UNIQUE TRAIT CANDIDATE|COUNTER TRAIT CANDIDATE|RAID BOSS CANDIDATE/);
  assert.doesNotMatch(text,/createOscillator|OscillatorNode|procedural fallback enabled/i);
  assert.equal(MANIFEST.implementation.proceduralVisualFallback,false);
  assert.equal(MANIFEST.implementation.proceduralAudioFallback,false);
});
