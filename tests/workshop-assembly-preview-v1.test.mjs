import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import sharp from 'sharp';
import {Container,Texture} from 'pixi.js';
import {DURATION,MODES,acceptResult,phaseAt,previewResult} from '../preview/workshop-assembly-v1/source/contract.mjs';
const folder=new URL('../preview/workshop-assembly-v1/',import.meta.url);
const read=p=>readFile(new URL(p,folder),'utf8');
test('only an authoritative boolean outcome with a request identity is accepted',()=>{
  for(const value of [undefined,{success:'true',requestId:'x'},{success:true,requestId:'x'},{success:false,requestId:''}])assert.throws(()=>acceptResult(value));
  const input={success:true,requestId:'confirmed-1',output:{name:'H-BODY'}};
  const frozen=acceptResult(input);input.output.name='changed';assert.equal(frozen.output.name,'H-BODY');assert.ok(Object.isFrozen(frozen.output));
});
test('both films are distinct nine-phase sequences with deterministic failure/success',()=>{
  assert.notDeepEqual(MODES.suit.phases,MODES.vehicle.phases);
  for(const mode of Object.keys(MODES)){
    assert.equal(MODES[mode].phases.length,9);
    for(let i=1;i<9;i++)assert.ok(MODES[mode].phases[i][0]>MODES[mode].phases[i-1][0]);
    assert.equal(phaseAt(mode,12,false)[1],'ASSEMBLY FAILED');assert.notEqual(phaseAt(mode,12,true)[1],'ASSEMBLY FAILED');
  }
});
test('all H-BODY RGBA source pixels reassemble exactly once without artwork changes',async()=>{
  const report=JSON.parse(await read('build-report.json'));
  const source=await readFile(new URL('../assets/items/h-body-v2066.png',import.meta.url));
  assert.equal(createHash('sha256').update(source).digest('hex'),report.hBodySha256);
  const raw=await sharp(source).ensureAlpha().raw().toBuffer();
  const sum=new Uint16Array(raw.length);const coverage=new Uint8Array(raw.length/4);
  for(const name of report.parts){
    const piece=await sharp(new URL(`assets/parts/${name}.png`,folder).pathname.replace(/^\/([A-Za-z]:)/,'$1')).raw().toBuffer();
    assert.equal(piece.length,raw.length);for(let i=0;i<piece.length;i++)sum[i]+=piece[i];
    for(let i=3;i<piece.length;i+=4)if(piece[i])coverage[(i-3)/4]++;
  }
  for(let i=0;i<raw.length;i++)assert.equal(sum[i],raw[i],`pixel byte ${i}`);
  assert.ok(coverage.every(v=>v<=1));assert.equal(report.hBodyPartitionPixelExact,true);
});
test('car and actuator assets contain genuine transparency',async()=>{
  for(const p of ['assets/car-cutout.png','assets/parts/robot-upper.png','assets/parts/robot-lower.png','assets/parts/robot-grip.png']){
    const {data,info}=await sharp(await readFile(new URL(p,folder))).raw().toBuffer({resolveWithObject:true});assert.equal(info.channels,4);
    let empty=0,visible=0;for(let i=3;i<data.length;i+=4){if(data[i]===0)empty++;if(data[i]>100)visible++;}
    assert.ok(empty>data.length/4*.1,p);assert.ok(visible>1000,p);
  }
});
test('one existing shared vendor, isolated preview, no mutations or synthetic sound',async()=>{
  const source=await read('source/AssemblyFilm.js'),html=await read('index.html'),bundle=await read('assembly.bundle.js');
  assert.match(html,/ui-fx-vendor-v2045\.bundle/);assert.doesNotMatch(bundle,/class WebGLRenderer|class WebGPURenderer/);
  assert.doesNotMatch(source,/Math\.random|createOscillator|createScriptProcessor|method:\s*['"]POST|workshop\/craft/);
  for(const p of ['../js/workshop-v1881.js','../index.html'])assert.doesNotMatch(await readFile(new URL(p,import.meta.url),'utf8'),/workshop-assembly-v1|AssemblyFilm/);
});
test('recorded Foley assets match source manifest hashes',async()=>{
  const m=JSON.parse(await read('assets/audio/manifest.json'));assert.equal(m.proceduralSynthesis,false);assert.equal(m.records.length,4);
  for(const r of m.records){const b=await readFile(new URL(r.local,folder));assert.equal(createHash('sha256').update(b).digest('hex'),r.sha256);assert.equal(b.toString('ascii',0,4),'RIFF');}
});
test('real GSAP timelines seek, skip, restart and cancel without altering outcome or leaking timelines',async()=>{
  // Pixi display objects and real GSAP run without a GPU. Only renderer I/O is
  // stubbed; object tweens, cleanup and time ownership are the actual code.
  globalThis.location={href:'http://localhost/preview/workshop-assembly-v1/',origin:'http://localhost'};
  globalThis.document={removeEventListener(){},createElement:()=>({getContext:()=>null})};
  const {AssemblyFilm}=await import('../preview/workshop-assembly-v1/source/AssemblyFilm.js');
  for(const mode of ['suit','vehicle'])for(const success of [false,true]){
    const film=new AssemblyFilm({getBoundingClientRect:()=>({width:1200,height:750})},()=>{});
    film.app={stage:new Container(),renderer:{resize(){},render(){}},ticker:{started:false},destroy(){this.stage.destroy({children:true});}};
    for(const n of ['suitBackground','vehicleBackground','suit','car','frame','engine','helmet','torso','hips','shoulderL','shoulderR','armL','armR','legL','legR','core','robot-upper','robot-lower','robot-grip'])film.buffers[n]=Texture.EMPTY;
    film.prepare(mode,previewResult(success));assert.equal(film.timeline.duration(),DURATION);
    film.seek(5.3);assert.equal(film.diagnostics().time,5.3);assert.equal(film.diagnostics().playing,false);
    film.skip();assert.equal(film.diagnostics().finished,true);assert.equal(film.result.success,success);
    film.setRate(2);film.play();film.pause();assert.equal(film.timeline.timeScale(),2);
    const old=film.timeline;film.prepare(mode,previewResult(success));assert.equal(old.parent,null);
    film.setReducedMotion(true);film.play();assert.equal(film.diagnostics().time,DURATION);
    film.destroy();assert.equal(film.diagnostics().activeTimelines,0);assert.equal(film.audio.voices.length,0);film.destroy();
  }
  delete globalThis.location;delete globalThis.document;
});
