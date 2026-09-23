import test,{after} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {Container,Texture} from 'pixi.js';
import {gsap} from 'gsap';
import sharp from 'sharp';
import {CHIP_DRAFT,SEQUENCE,ARRIVAL_ORDER,direction,flightPoint,rocketState,launchTime,impactTime,impactFrame,cueAt} from '../preview/battle-suit-octaseeker-v1/source/sequence.mjs';
import {OctaSeekerFX} from '../preview/battle-suit-octaseeker-v1/source/OctaSeekerFX.js';
import {OctaSeekerAudio} from '../preview/battle-suit-octaseeker-v1/source/OctaSeekerAudio.js';
import {SKILL_CHIP_CATALOG} from '../shared/battle-suit-skill-chips.mjs';
const base=new URL('../preview/battle-suit-octaseeker-v1/',import.meta.url);
const read=file=>readFile(new URL(file,base),'utf8');
const near=(a,b,epsilon=1e-7)=>assert.ok(Math.abs(a-b)<epsilon,`${a} != ${b}`);
after(()=>gsap.ticker.sleep());
const points={source:{x:580,y:490},hit:{x:1100,y:558},blast:{x:1100,y:620}};
function engine(mobile=false){
  const target=new Container();target.position.set(1100,620);
  const second=new Container();second.position.set(1340,640);
  return {mobile,combatLayer:new Container(),effectLayer:new Container(),stage:new Container(),camera:{base:{x:800,y:410}},
    enemies:[{id:'fixed-enemy',hp:100,battleActive:true,root:target},{id:'other-enemy',hp:100,battleActive:true,root:second}],
    accountBattleUnit:{muzzlePoint:()=>({...points.source})}};
}
const textures=()=>({flight:Array(24).fill(Texture.EMPTY),impact:Array(24).fill(Texture.EMPTY),
  smoke:Texture.EMPTY,dust:Texture.EMPTY,flash:Texture.EMPTY,cinder:Texture.EMPTY});
const snapshot=fx=>fx.sprites.map(s=>s.visible?[s.x,s.y,s.width,s.height,s.rotation,s.alpha,s.anchor.x,s.anchor.y]:null);

test('new chip is a disabled independent draft without invented balance or acquisition',()=>{
  assert.equal(CHIP_DRAFT.liveEnabled,false);assert.equal(CHIP_DRAFT.status,'USER_REVIEW_PENDING');
  for(const key of ['damageMultiplier','intervalMs','acquisition'])assert.equal(CHIP_DRAFT[key],null);
  assert.ok(!SKILL_CHIP_CATALOG.some(c=>c.code===CHIP_DRAFT.code));
  assert.deepEqual([...ARRIVAL_ORDER].sort((a,b)=>a-b),[0,1,2,3,4,5,6,7]);
});
test('exactly eight distinct 45-degree launch directions, followed by one common endpoint',()=>{
  const angles=[];
  for(let i=0;i<8;i++){
    const p=flightPoint(i,launchTime(i)+.04,points.source,points.hit),d=direction(i);
    near((p.x-points.source.x)*d.y*.78-(p.y-points.source.y)*d.x,0);
    assert.ok((p.x-points.source.x)*d.x+(p.y-points.source.y)*d.y>0);
    angles.push(Math.round(Math.atan2((p.y-points.source.y)/.78,p.x-points.source.x)*180/Math.PI));
    assert.deepEqual(flightPoint(i,impactTime(i),points.source,points.hit),points.hit);
    assert.equal(rocketState(i,launchTime(i)-.001,points),null);
    assert.equal(rocketState(i,impactTime(i),points),null);
  }
  assert.equal(new Set(angles).size,8);
});
test('radial departure joins its homing cubic continuously in both position and velocity',()=>{
  for(let i=0;i<8;i++){
    const t=launchTime(i)+SEQUENCE.spreadDuration,e=1e-6;
    const a=flightPoint(i,t-e,points.source,points.hit),b=flightPoint(i,t,points.source,points.hit),c=flightPoint(i,t+e,points.source,points.hit);
    near((b.x-a.x)/e,(c.x-b.x)/e,.02);near((b.y-a.y)/e,(c.y-b.y)/e,.02);
    for(let step=0;step<100;step++){
      const state=rocketState(i,launchTime(i)+(impactTime(i)-launchTime(i))*step/100,points);
      for(const key of ['x','y','angle','frame'])assert.ok(Number.isFinite(state[key]));
      assert.ok(state.frame>=0&&state.frame<24);
    }
  }
});
test('dedicated impact animation traverses real frames and finishes within its visual budget',()=>{
  let previous=0;
  for(let i=0;i<120;i++){const f=impactFrame(SEQUENCE.life*i/120);assert.ok(f.index>=previous);assert.ok(f.next<24);previous=f.index;}
  assert.equal(impactFrame(-.01),null);assert.equal(impactFrame(SEQUENCE.life),null);
  assert.ok(SEQUENCE.impacts.at(-1)+SEQUENCE.life<=SEQUENCE.duration);
  assert.match(cueAt(1.48),/8 \/ 8/);assert.match(cueAt(SEQUENCE.duration),/재생 완료/);
});
test('PC and mobile show 8 projectiles, freeze one target, keep exact sole anchors and never mutate HP',()=>{
  for(const mobile of [false,true]){
    const e=engine(mobile),fx=new OctaSeekerFX(e,textures());
    try{
      fx.seek(.34);assert.equal(fx.diagnostics().activeRockets,8);assert.equal(fx.diagnostics().targetCount,1);
      fx.seek(1.48);assert.equal(fx.diagnostics().activeRockets,0);assert.equal(fx.diagnostics().impacts,8);
      for(const b of fx.blasts){assert.equal(b.first.x,1100);assert.equal(b.first.y,620);}
      e.enemies[0].root.position.set(1300,700);fx.seek(1.6);
      for(const b of fx.blasts){assert.equal(b.first.x,1100);assert.equal(b.first.y,620);}
      assert.deepEqual(e.enemies.map(t=>t.hp),[100,100]);
      fx.seek(SEQUENCE.duration);assert.equal(fx.diagnostics().visible,0);
    }finally{fx.destroy()}
  }
});
test('dead or rebound target cancels pending rockets without retargeting another enemy',()=>{
  for(const change of ['death','rebind']){
    const e=engine(),fx=new OctaSeekerFX(e,textures());
    try{
      fx.seek(1.03);assert.equal(fx.diagnostics().impacts,1);
      if(change==='death')e.enemies[0].battleActive=false;else e.enemies[0].id='replacement';
      fx.seek(1.48);assert.equal(fx.diagnostics().activeRockets,0);assert.equal(fx.diagnostics().impacts,1);
      assert.equal(fx.targetId,'fixed-enemy');assert.equal(fx.blasts[0].first.x,1100);
      assert.deepEqual(e.enemies.map(t=>t.hp),[100,100]);
    }finally{fx.destroy()}
  }
});
test('reverse seek is deterministic; 50 repeats own one timeline and bounded sprite pool',()=>{
  const e=engine(),fx=new OctaSeekerFX(e,textures()),count=fx.sprites.length;
  try{
    fx.seek(.72);const first=snapshot(fx);
    for(let i=0;i<50;i++){
      fx.seek(2.1);fx.seek(.72);assert.deepEqual(snapshot(fx),first);
      fx.setSpeed([.25,.5,1,2][i%4]);fx.play();fx.pause();
      assert.equal(fx.diagnostics().ownedTimelines,1);assert.equal(fx.sprites.length,count);
    }
    fx.seek(0);assert.equal(fx.diagnostics().visible,0);assert.equal(fx.playing,false);
    fx.lastShake={x:2,y:1};e.stage.position.set(802,411);fx.pause();assert.equal(e.stage.x,800);assert.equal(e.stage.y,410);
  }finally{fx.destroy()}
  assert.equal(e.combatLayer.children.length,0);assert.equal(e.effectLayer.children.length,0);
  assert.equal(Texture.EMPTY.destroyed,false);fx.destroy();
});
test('pause leaves visual clock stable and speed changes do not change hit timings',()=>{
  const fx=new OctaSeekerFX(engine(),textures());
  try{
    fx.seek(.72);const before=snapshot(fx);
    for(const speed of [.25,.5,1,2]){fx.setSpeed(speed);assert.equal(fx.time,.72);fx.render(fx.time);assert.deepEqual(snapshot(fx),before);}
    assert.deepEqual(fx.sequence.impacts,SEQUENCE.impacts);
  }finally{fx.destroy()}
});
test('generated atlases have 24 distinct RGBA frames, transparent gutters and locked source hashes',async()=>{
  const report=JSON.parse(await read('build-report.json')),origins=JSON.parse(await read('assets/textures/frame-origins.json'));
  for(const key of ['flight','impact']){
    const bytes=await readFile(new URL(`assets/generated/${key}-atlas.png`,base)),meta=await sharp(bytes).metadata();
    assert.equal(meta.width,1536);assert.equal(meta.height,1024);assert.ok(meta.hasAlpha);
    const stats=await sharp(bytes).stats();assert.equal(stats.channels[3].min,0);assert.ok(stats.channels[3].max>=250);
    const frameHashes=[];
    for(let i=0;i<24;i++){
      const cell=await sharp(bytes).extract({left:i%6*256,top:Math.floor(i/6)*256,width:256,height:256}).raw().toBuffer();
      frameHashes.push(createHash('sha256').update(cell).digest('hex'));
      assert.ok(origins[key][i].edgeAlphaMax<=4);assert.ok(origins[key][i].y>.4&&origins[key][i].y<1);
    }
    assert.equal(new Set(frameHashes).size,24);
    assert.equal(createHash('sha256').update(bytes).digest('hex'),report.assets.find(a=>a.path.endsWith(`${key}-atlas.png`)).sha256);
    const runtime=await sharp(await readFile(new URL(`assets/textures/${key}-atlas.webp`,base))).raw().toBuffer();
    const original=await sharp(bytes).raw().toBuffer();
    for(let i=0;i<original.length;i+=4){
      assert.equal(runtime[i+3],original[i+3]);
      if(original[i+3])for(let c=0;c<3;c++)assert.equal(runtime[i+c],original[i+c]);
    }
  }
  const icon=await sharp(await readFile(new URL('assets/textures/chip.webp',base))).metadata();
  assert.equal(icon.width,512);assert.equal(icon.height,512);assert.ok(icon.hasAlpha);
});
test('existing engine, source-art adapters and grade frames are reused; live code has no new connection',async()=>{
  const html=await read('battle.html'),source=await read('source/lab.src.js'),report=JSON.parse(await read('build-report.json'));
  assert.equal(report.pixiCopies,1);assert.equal(report.pixi,'8.20.0');assert.equal(report.gsap,'3.13.0');
  assert.match(source,/ProjectVBattleV3Live\.createRenderer/);
  for(const name of ['project-v-battle-art-adapter-v1','project-v-tier-battle-art-adapter-v1','project-v-monster-battle-art-adapter-v1','project-v-unassigned-battle-fallback-v1','battle-v3-live'])assert.ok(html.includes(`/js/${name}.js`));
  for(const name of ['card','battle-v3-live','zenith-v1','superstar-v1','faker-card-v1'])assert.ok(html.includes(`/css/${name}.css`));
  assert.doesNotMatch(source,/\/api\/|localStorage\.setItem|sessionStorage\.setItem|\.setHp\(/);
  assert.doesNotMatch(await read('preview.css'),/\.battle-v3-roster|\.card-frame|\.battle-v3-dock/);
  for(const file of ['index.html','js/app.js','js/character-loadout-v2.js','functions/api/[[path]].js','shared/battle-suit-skill-chips.mjs']){
    assert.doesNotMatch(await readFile(new URL('../'+file,import.meta.url),'utf8'),/octaseeker|OCTA_SEEKER/);
  }
});
test('recorded audio uses one launch, eight measured impact peaks and one shared tail',()=>{
  const audio=new OctaSeekerAudio(),events=audio.events();
  assert.equal(events.length,10);assert.equal(events.filter(e=>e.impact!==undefined).length,8);
  assert.deepEqual(events.filter(e=>e.impact!==undefined).map(e=>e.impact),SEQUENCE.impacts);
  assert.ok(events.filter(e=>e.impact!==undefined).every(e=>e.gain<=.22));
  const param=()=>({value:0,setValueAtTime(){},linearRampToValueAtTime(){}});
  const node=()=>({gain:param(),pan:param(),playbackRate:param(),connect(target){return target},disconnect(){},start(){},stop(){}});
  audio.context={currentTime:10,state:'running',baseLatency:.01,outputLatency:.04,getOutputTimestamp:()=>({contextTime:9.96,performanceTime:performance.now()}),createBufferSource:node,createGain:node,createStereoPanner:node};
  audio.master=node();audio.ready=true;
  for(const speed of [.25,.5,1,2]){
    audio.schedule('octaseeker',0,speed);assert.equal(audio.syncRecords.length,8);
    for(const sync of audio.syncRecords)assert.ok(Math.abs(sync.predictedOutputPeakDeltaMs)<1);
    audio.stop();assert.equal(audio.sources.size,0);
  }
  audio.setEnabled(false);audio.schedule('octaseeker');assert.equal(audio.sources.size,0);
});
test('original licensed recording bytes and no synthesized sound are preserved',async()=>{
  const sources=[['../battle-suit-skill-chip-v1/assets/audio/explosion-182797-cc0.mp3','7c5c8204d55d9127c19b389cdee2ae415cd78523eb132883497d2d5d0c5cd890'],
    ['../project-v-v3/assets/audio/firearm-qc-v1/m4a1-colt-socom-cc0-freesound-737569.mp3','1735b196b5db6369d734ee5731834e35c9ad17a2a32353e9d809b6c6c2ecb6f2']];
  for(const [file,hash] of sources)assert.equal(createHash('sha256').update(await readFile(new URL(file,base))).digest('hex'),hash);
  assert.doesNotMatch(await read('source/OctaSeekerAudio.js'),/createOscillator|createPeriodicWave|Math\.random/);
});
