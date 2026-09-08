import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import sharp from 'sharp';
import {Container,Texture} from 'pixi.js';
import {DURATION,MODES,acceptResult,phaseAt,previewResult} from '../preview/workshop-assembly-v1/source/contract.mjs';
import {MODELS,MODEL_ORDER,modelFor,resolveModel,modelPhases,suitPlacement} from '../preview/workshop-assembly-v1/source/models.mjs';
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
test('one existing shared vendor, preview controls stay isolated, no mutations or synthetic sound',async()=>{
  const source=await read('source/AssemblyFilm.js'),html=await read('index.html'),bundle=await read('assembly.bundle.js');
  assert.match(html,/ui-fx-vendor-v2045\.bundle/);assert.doesNotMatch(bundle,/class WebGLRenderer|class WebGPURenderer/);
  assert.doesNotMatch(source,/Math\.random|createOscillator|createScriptProcessor|method:\s*['"]POST|workshop\/craft/);
  for(const p of ['../js/workshop-v1881.js','../index.html'])assert.doesNotMatch(await readFile(new URL(p,import.meta.url),'utf8'),/WorkshopAssemblyPreview|source\/preview\.js|previewResult/);
  assert.match(await readFile(new URL('../js/workshop-v1881.js',import.meta.url),'utf8'),/presentWorkshopAssembly/);
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
  const {AssemblyFilm,RESOURCE_KEYS}=await import('../preview/workshop-assembly-v1/source/AssemblyFilm.js');
  for(const [key,model]of Object.entries(MODELS))for(const success of [false,true]){
    const mode=model.mode;
    const film=new AssemblyFilm({getBoundingClientRect:()=>({width:1200,height:750})},()=>{});
    film.app={stage:new Container(),renderer:{resize(){},render(){}},ticker:{started:false},destroy(){this.stage.destroy({children:true});}};
    for(const n of RESOURCE_KEYS)film.buffers[n]=Texture.EMPTY;
    film.prepare(mode,previewResult(success),key);assert.equal(film.timeline.duration(),DURATION);
    assert.equal(film.diagnostics().model,key);assert.equal(film.diagnostics().modelName,model.name);
    const head=film.renderedParts?.find(p=>p.name==='head');
    film.seek(5.3);assert.equal(film.diagnostics().time,5.3);assert.equal(film.diagnostics().playing,false);
    if(head){assert.equal(head.sprite.x,head.target.x);assert.equal(head.sprite.y,head.target.y);}
    film.seek(9);for(const p of film.renderedParts){assert.equal(p.sprite.alpha,1);assert.equal(p.sprite.rotation,0);assert.equal(p.sprite.x,p.target.x);assert.equal(p.sprite.y,p.target.y);}
    film.skip();assert.equal(film.diagnostics().finished,true);assert.equal(film.result.success,success);
    if(mode==='vehicle'){assert.equal(film.carGroup.x,success?-44:0);assert.equal(film.carGroup.y,success?20:0);}
    film.setRate(2);film.play();film.pause();assert.equal(film.timeline.timeScale(),2);
    const old=film.timeline;film.prepare(mode,previewResult(success),key);assert.equal(old.parent,null);
    film.setReducedMotion(true);film.play();assert.equal(film.diagnostics().time,DURATION);
    film.destroy();assert.equal(film.diagnostics().activeTimelines,0);assert.equal(film.audio.voices.length,0);film.destroy();
  }
  delete globalThis.location;delete globalThis.document;
});
test('E/F/G and Ignis-X map to verified CMS identities with model-specific geometry',()=>{
  assert.deepEqual(MODEL_ORDER.suit,['e','f','g','h']);assert.deepEqual(MODEL_ORDER.vehicle,['ignis','veneno']);
  assert.equal(MODELS.e.code,'BATTLE_SUIT_01');assert.equal(MODELS.f.code,'BATTLE_SUIT_02');assert.equal(MODELS.g.code,'BATTLE_SUIT_03');assert.equal(MODELS.ignis.code,'GARAGE_1787232065012');
  for(const key of ['e','f','g']){const m=modelFor('suit',key),p=suitPlacement(m);assert.equal(p.scale*(m.box[3]-m.box[1]),650);assert.equal(modelPhases('suit',key,MODES.suit.phases)[4][2].includes('INTERFACE'),true);}
  assert.throws(()=>modelFor('suit','ignis'));assert.throws(()=>modelFor('vehicle','e'));assert.equal(resolveModel('suit','unknown'),'h');
  assert.notDeepEqual(MODELS.e.joints,MODELS.f.joints);assert.notDeepEqual(MODELS.f.joints,MODELS.g.joints);
  assert.equal(phaseAt('vehicle',7.5,true,'ignis')[1],'TURBINE LOCK');assert.equal(phaseAt('vehicle',11,true,'ignis')[1],'TURBINE IGNITION');
});
test('all E/F/G visible RGBA pixels reconstruct once from cropped anatomical parts',async()=>{
  const variants=JSON.parse(await read('parts-manifest.json'));
  for(const [key,v]of Object.entries(variants)){
    const source=await readFile(new URL('..'+v.source,import.meta.url));
    assert.equal(createHash('sha256').update(source).digest('hex'),MODELS[key].sha256);
    const raw=await sharp(source).ensureAlpha().raw().toBuffer(),out=Buffer.alloc(raw.length),coverage=new Uint8Array(raw.length/4);
    for(const p of v.parts){
      const {data,info}=await sharp(await readFile(new URL(p.path,folder))).raw().toBuffer({resolveWithObject:true});assert.equal(info.channels,4);assert.equal(info.width,p.width);assert.equal(info.height,p.height);
      for(let y=0;y<p.height;y++)for(let x=0;x<p.width;x++){
        const i=(y*p.width+x)*4;if(!data[i+3])continue;const target=((y+p.y)*v.width+x+p.x)*4;
        assert.equal(coverage[target/4],0,`${key}/${p.name} overlap`);coverage[target/4]++;data.copy(out,target,i,i+4);
      }
    }
    for(let i=0;i<raw.length;i+=4)if(raw[i+3]){assert.equal(coverage[i/4],1,`${key} uncovered source pixel`);assert.deepEqual(out.subarray(i,i+4),raw.subarray(i,i+4));}
    assert.equal(v.visibleRgbaExact,true);assert.ok(v.parts.length>=10);
  }
});
test('Ignis background cleanup changes alpha only and clears turbine support openings',async()=>{
  const source=await sharp(await readFile(new URL('assets/sources/ignis-x-extracted-source-v1.png',folder))).ensureAlpha().raw().toBuffer();
  const {data,info}=await sharp(await readFile(new URL('assets/ignis-x-cutout.png',folder))).raw().toBuffer({resolveWithObject:true});
  assert.equal(info.channels,4);assert.equal(source.length,data.length);
  for(let i=0;i<data.length;i+=4){assert.equal(data[i],source[i]);assert.equal(data[i+1],source[i+1]);assert.equal(data[i+2],source[i+2]);}
  for(const [x,y]of [[0,0],[835,335],[790,350],[969,267],[1031,280],[1046,281],[733,371],[1400,100]])assert.equal(data[(y*info.width+x)*4+3],0);
  for(const [x,y]of [[1000,300],[360,485]])assert.equal(data[(y*info.width+x)*4+3],255);
});
