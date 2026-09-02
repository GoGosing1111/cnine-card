import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const ROOT=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const PREVIEW=path.join(ROOT,'preview','prime-draw-opening-v1');
const read=relative=>fs.readFile(path.join(PREVIEW,...relative.split('/')),'utf8');
const CONFIG=JSON.parse(await read('config/prime-drop-pools.v1.json'));
const MANIFEST=JSON.parse(await read('manifest.json'));

test('preview is disconnected and every prime pool is isolated from legacy inventory',()=>{
  assert.equal(CONFIG.status,'PREVIEW_ONLY');
  assert.equal(CONFIG.runtimeConnected,false);
  assert.equal(CONFIG.legacyPoolShared,false);
  assert.equal(MANIFEST.previewOnly,true);
  assert.equal(MANIFEST.runtimeConnected,false);
  assert.equal(MANIFEST.deployAllowed,false);
  for(const pool of CONFIG.pools){
    assert.notEqual(pool.itemCode,pool.legacyItemCode);
    assert.equal(pool.shopEnabled,false);
    assert.equal(pool.openEnabled,false);
    assert.ok(!CONFIG.legacyItemCodes.includes(pool.itemCode));
  }
});

test('each pool is normalized and supports per-item reveal decisions',()=>{
  for(const pool of CONFIG.pools){
    const total=pool.entries.reduce((sum,entry)=>sum+entry.weight,0);
    assert.ok(Math.abs(total-100)<1e-9,`${pool.code} weight sum`);
    assert.ok(pool.entries.some(entry=>entry.presentation.enabled));
    assert.ok(pool.entries.some(entry=>!entry.presentation.enabled));
    for(const entry of pool.entries){
      assert.equal(typeof entry.presentation.enabled,'boolean');
      assert.match(entry.presentation.tier,/^(STANDARD|FEATURED|HERO|CINEMATIC)$/);
      assert.equal(typeof entry.presentation.effectKey,'string');
    }
  }
});

test('inventory batch opening contract includes 1, 10, 50 and MAX',()=>{
  assert.deepEqual(CONFIG.batchOpen.options,[1,10,50,'MAX']);
  assert.equal(CONFIG.batchOpen.maxPerRequest,500);
  assert.equal(CONFIG.batchOpen.resolution,'ATOMIC_SERVER_RECEIPT');
  assert.equal(CONFIG.batchOpen.unlockGesture,'ONE_SWIPE_PER_BATCH');
  assert.equal(CONFIG.batchOpen.premiumQueue,'SHOW_EVERY_RESULT_WITH_PRESENTATION_ENABLED');
  assert.equal(CONFIG.batchOpen.normalResultMode,'AGGREGATED_SUMMARY');
  assert.deepEqual(MANIFEST.batchOpen.options,[1,10,50,'MAX']);
});

test('preview uses Pixi WebGL and GSAP without stylesheet-driven effects',async()=>{
  const source=await read('source/prime-draw-opening.src.js');
  const html=await read('index.html');
  assert.match(source,/from 'pixi\.js'/);
  assert.match(source,/from 'gsap'/);
  assert.match(source,/preference:'webgl'/);
  assert.match(source,/duration:\.05/);
  assert.match(source,/pointerdown/);
  assert.match(source,/specialQueue/);
  assert.match(source,/\[1,10,50,'MAX'\]/);
  assert.doesNotMatch(html,/<style\b/i);
  assert.doesNotMatch(html,/<link[^>]+stylesheet/i);
  assert.equal(MANIFEST.renderer.cssEffects,false);
});

test('preview audio is licensed recorded material with no runtime synthesis',async()=>{
  const source=await read('source/prime-draw-opening.src.js');
  for(const audio of MANIFEST.audio.sources){
    assert.match(source,new RegExp(audio.path.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')));
    const localPath=path.join(ROOT,...audio.path.slice(1).split('/'));
    const provenancePath=path.join(ROOT,...audio.provenance.slice(1).split('/'));
    assert.ok((await fs.stat(localPath)).size>0);
    assert.match(await fs.readFile(provenancePath,'utf8'),/Mixkit Sound Effects Free License/);
  }
  assert.equal(MANIFEST.audio.masterVolume,0.12);
  assert.equal(MANIFEST.audio.proceduralSynthesis,false);
  assert.doesNotMatch(source,/createOscillator|OscillatorNode/);
});
