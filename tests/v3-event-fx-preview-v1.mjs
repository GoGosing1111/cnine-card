import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';

const ROOT=process.cwd();
const PREVIEW=path.join(ROOT,'preview','project-v-v3-event-fx-v1');
const manifest=JSON.parse(fs.readFileSync(path.join(PREVIEW,'manifest.json'),'utf8'));
const html=fs.readFileSync(path.join(PREVIEW,'index.html'),'utf8');
const client=fs.readFileSync(path.join(PREVIEW,'preview.js'),'utf8');
const runtimeFiles=[
  'preview/project-v-v3/source/battle/SkillEffectFX.js',
  'preview/project-v-v3/source/battle/BattleEngine.js',
  'preview/project-v-v3/source/battle/RoleAudioSpriteManifest.js'
].map(file=>fs.readFileSync(path.join(ROOT,file),'utf8'));

assert.equal(manifest.previewOnly,true);
assert.equal(manifest.runtimeConnected,false);
assert.equal(manifest.effects.length,6);
assert.deepEqual(manifest.effects.map(item=>item.id),['critical','counter','ultimate','boss-ultimate','dodge','revive']);
assert.equal(manifest.frameContract.count,12);
assert.equal(manifest.frameContract.alpha,true);
assert.equal(manifest.audioContract.runtimeSynthesis,false);
assert.equal(manifest.audioContract.sampleRate,48_000);
assert.match(html,/게임에는 연결되지 않았습니다/);
assert.match(client,/framePattern\.replace\('%02d'/);
assert.match(client,/new Audio\(/);
assert.match(client,/effect\.collisionFrame/);

for(const runtime of runtimeFiles){
  assert.doesNotMatch(runtime,/project-v-v3-event-fx-v1|boss-ultimate-atlas-v1|critical-atlas-v1/,'preview assets leaked into the production runtime');
}

for(const effect of manifest.effects){
  assert.equal(effect.frameCount,12,`${effect.id} frame count`);
  assert.equal(effect.frameSize,512,`${effect.id} frame size`);
  const atlasPath=path.join(PREVIEW,effect.atlas);
  const atlasInfo=await sharp(atlasPath).metadata();
  assert.equal(atlasInfo.width,2048,`${effect.id} atlas width`);
  assert.equal(atlasInfo.height,1536,`${effect.id} atlas height`);
  assert.equal(atlasInfo.hasAlpha,true,`${effect.id} atlas alpha`);
  const atlasData=JSON.parse(fs.readFileSync(path.join(PREVIEW,effect.atlasData),'utf8'));
  assert.equal(Object.keys(atlasData.frames).length,12,`${effect.id} atlas JSON frames`);
  assert.equal(atlasData.animations.impact.length,12,`${effect.id} atlas animation`);
  assert.equal(atlasData.meta.collisionFrame,effect.collisionFrame,`${effect.id} collision frame`);
  assert.equal(atlasData.meta.fps,effect.fps,`${effect.id} fps`);

  const hashes=new Set();
  for(let frame=0;frame<12;frame+=1){
    const framePath=path.join(PREVIEW,effect.framePattern.replace('%02d',String(frame).padStart(2,'0')));
    const payload=fs.readFileSync(framePath);
    hashes.add(crypto.createHash('sha256').update(payload).digest('hex'));
    const frameInfo=await sharp(payload).metadata();
    assert.equal(frameInfo.width,512,`${effect.id} frame ${frame} width`);
    assert.equal(frameInfo.height,512,`${effect.id} frame ${frame} height`);
    assert.equal(frameInfo.hasAlpha,true,`${effect.id} frame ${frame} alpha`);
  }
  assert.equal(hashes.size,12,`${effect.id} must contain twelve distinct images`);

  const audioPath=path.join(PREVIEW,effect.src);
  const audio=fs.readFileSync(audioPath);
  assert.equal(audio.subarray(0,3).toString('ascii'),'ID3',`${effect.id} MP3 header`);
  assert.equal(audio.byteLength,effect.bytes,`${effect.id} MP3 bytes`);
  assert.ok(effect.syncPointMs>0&&effect.syncPointMs<effect.durationMs,`${effect.id} audio sync point`);
  assert.ok(fs.statSync(path.join(PREVIEW,effect.waveform)).size>2_000,`${effect.id} waveform`);
}

console.log('Project V V3 event FX preview-only contract: PASS');
