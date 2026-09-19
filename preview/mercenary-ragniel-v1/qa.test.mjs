import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {createHash} from 'node:crypto';
import sharp from 'sharp';
import {MODES,makePlan,sample} from './skill.mjs';
import {CueAudio} from './source/CueAudio.js';
import {Container,Sprite,Texture,TextureSource} from 'pixi.js';
import {gsap} from 'gsap';
import {RagnielSkillFX} from './source/RagnielSkillFX.js';
const root=new URL('./',import.meta.url),project=new URL('../../',import.meta.url);
const manifest=JSON.parse(await fs.readFile(new URL('manifest.json',root),'utf8'));
const hash=bytes=>createHash('sha256').update(bytes).digest('hex').toUpperCase();

test('backward scrubbing is deterministic and never accumulates gameplay effects',()=>{
 for(const mode of Object.keys(MODES)){
  const plan=makePlan({mode});const frames=Array.from({length:101},(_,i)=>i/100*plan.duration);
  const forward=frames.map(t=>sample(plan,t));
  frames.slice().reverse().forEach(t=>{assert.deepEqual(sample(plan,t),forward[frames.indexOf(t)]);});
  assert.equal(plan.damageAuthority,'NONE_VISUAL_PREVIEW');assert.equal('damage' in forward[50],false);
  for(const at of [0,plan.duration,plan.duration+1]){const s=sample(plan,at);assert.equal(s.pose,null);assert.equal(s.travel,0);assert.equal(s.judgment,null);assert.equal(s.slash,null);}
 }
});

test('cancellation and target loss stop all future contacts, poses, glow and movement',()=>{
 for(const mode of Object.keys(MODES))for(const key of ['cancelAt','targetLostAt'])for(const at of [0,.3,.55,1.5,2.05]){
  const plan=makePlan({mode,[key]:at});assert.ok(plan.contacts.every(t=>t<at));
  if(at>plan.duration)continue;
  for(const t of [at,(at+plan.duration)/2,plan.duration]){
   const s=sample(plan,t);assert.equal(s.cancelled,true);assert.equal(s.travel,0);assert.equal(s.pose,null);assert.equal(s.slash,null);assert.equal(s.judgment,null);assert.equal(s.charge,0);assert.equal(s.flash,0);assert.equal(s.recoil,0);assert.equal(s.trail,false);
  }
 }
 const firstStop=makePlan({cancelAt:2,targetLostAt:1});assert.equal(firstStop.stop,1);assert.equal(firstStop.contacts.length,0);
});

test('contact cues select the actual authored sword and ultimate collision frames',()=>{
 const slash=sample(makePlan({mode:'slash'}),.66),sword=sample(makePlan(),1.58),impact=sample(makePlan(),2.42);
 for(const state of [slash,sword]){assert.deepEqual(state.pose,{key:'slash',frame:6});assert.equal(state.slash.frame,manifest.effects.slash.collisionFrame);}
 assert.deepEqual(impact.pose,{key:'cast',frame:5});assert.equal(impact.judgment.frame,manifest.effects.judgment.collisionFrame);
 assert.ok(sample(makePlan(),2.32).judgment.frame<impact.judgment.frame);
 assert.ok(sample(makePlan(),4.7).judgment.frame>impact.judgment.frame);
});

test('user-selected source and separate native-alpha SD are immutable',async()=>{
 assert.equal(manifest.name,'라그니엘');assert.equal(manifest.rank,'SSS');assert.equal(manifest.runtimeEnabled,false);assert.notEqual(manifest.sourceArt,manifest.battleSprite);
 assert.equal(hash(await fs.readFile(new URL(manifest.sourceArt,project))),'B6EC66166A3AF153A9A6BAB827C0FE998E94855B16F67E0683BBFF4B0CCD0F89');
 const bytes=await fs.readFile(new URL(manifest.battleSprite,project));assert.equal(hash(bytes),'5283F8D4D2850D271D3396358333D53242491E5650E952B853B7EC646A86A194');
 const m=await sharp(bytes).metadata();assert.equal(m.hasAlpha,true);assert.equal(manifest.battleSpriteInfo.border,0);assert.ok(manifest.battleSpriteInfo.clear>.5);assert.ok(manifest.battleSpriteInfo.solid>.4);
});

test('54 distinct RGBA frames retain original masters and have transparent atlas padding',async()=>{
 let count=0;
 for(const spec of [...Object.values(manifest.motion),...Object.values(manifest.effects)]){
  assert.equal(new Set(spec.frames.map(f=>f.sha256)).size,spec.frameCount);
  assert.equal(hash(await fs.readFile(new URL(spec.source,root))),spec.sourceInfo.sha256);
  const atlas=await fs.readFile(new URL(spec.atlas,root));assert.equal(hash(atlas),spec.atlasSha256);
  const m=await sharp(atlas).metadata();assert.equal(m.width,spec.cellSize*spec.columns);assert.equal(m.height,spec.cellSize*spec.rows);assert.equal(m.hasAlpha,true);
  for(const frame of spec.frames){
   count++;const bytes=await fs.readFile(new URL(frame.file,root));assert.equal(hash(bytes),frame.sha256);
   const {data,info}=await sharp(bytes).ensureAlpha().raw().toBuffer({resolveWithObject:true});let pixels=0;
   for(let y=0;y<info.height;y++)for(let x=0;x<info.width;x++){const alpha=data[(y*info.width+x)*4+3];if(alpha>24)pixels++;if(x<4||y<4||x>=info.width-4||y>=info.height-4)assert.equal(alpha,0,`${frame.file}: unsafe edge`);}
   assert.ok(pixels>100,`${frame.file}: empty frame`);assert.ok(pixels<info.width*info.height*.75,`${frame.file}: opaque background`);
   const anchor=frame.footAnchor||frame.anchor;assert.ok(anchor.x>0&&anchor.x<1&&anchor.y>0&&anchor.y<1);
  }
 }
 assert.equal(count,54);
});

test('recorded sound masters match declared license, sources and synchronization points',async()=>{
 assert.equal(manifest.audio.proceduralSynthesis,false);assert.equal(manifest.audio.license,'Mixkit Free License');
 for(const [key,sync]of [['dash',178],['slash',250],['ultimate',333]]){
  const a=manifest.audio.assets[key];assert.equal(a.syncPointMs,sync);assert.ok(a.sourceIds.length>=3);assert.equal(hash(await fs.readFile(new URL(a.file,project))),a.sha256.toUpperCase());
 }
});

function audioHarness(){
 const audio=new CueAudio();audio.enabled=true;const nodes=[];audio.context={currentTime:50,destination:{},createGain:()=>({gain:{value:0},connect(){},disconnect(){}}),createBufferSource:()=>{const node={playbackRate:{value:0},connect(){},disconnect(){},start(when,offset){this.when=when;this.offset=offset;},stop(){this.stopped=true;}};nodes.push(node);return node;}};
 const buffers={dash:{duration:.86},slash:{duration:1.3},ultimate:{duration:2.1}};return {audio,nodes,buffers};
}
test('first audio decode latency uses the current animation clock and speed for contact alignment',async()=>{
 for(const speed of [.25,.5,1,2]){
  const {audio,buffers}=audioHarness();let resolve;audio.ready=()=>new Promise(r=>resolve=r);let now=0;
  const pending=audio.play(makePlan(),now,speed,()=>now);now=1.7;resolve(buffers);await pending;
  const cue=audio.scheduled.find(c=>c.key==='ultimate');assert.ok(cue);
  const actualPeak=cue.when+(cue.sourceSync-cue.offset)/speed,expectedPeak=50+(cue.contact-now)/speed;
  assert.ok(Math.abs(actualPeak-expectedPeak)<.001);audio.stop();assert.equal(audio.nodes.size,0);
 }
});
test('cancel during asynchronous audio loading cannot restart stale sound',async()=>{
 const {audio,buffers,nodes}=audioHarness();let resolve;audio.ready=()=>new Promise(r=>resolve=r);
 const pending=audio.play(makePlan(),0,1);audio.stop();resolve(buffers);await pending;assert.equal(nodes.length,0);assert.equal(audio.scheduled.length,0);
 audio.ready=async()=>buffers;await audio.play(makePlan({targetLostAt:2.05}),0,1);assert.equal(audio.scheduled.some(c=>c.key==='ultimate'),false);audio.stop();assert.ok(nodes.every(n=>n.stopped));
});

test('actual Pixi renderer aligns the blade, fits the mobile corona and clears owned timelines and sprites',()=>{
 const world=new Container(),combatLayer=new Container(),effectLayer=new Container();world.addChild(combatLayer,effectLayer);
 const sources=[new TextureSource({width:1254,height:1254}),new TextureSource({width:768,height:768}),new TextureSource({width:512,height:512})];
 const sd=new Texture({source:sources[0]});
 const actor=(x,y,height)=>{const root=new Container(),view=new Container(),s=new Sprite(sd);root.position.set(x,y);root.scale.set(.6);root.addChild(view);view.addChild(s);s.anchor.set(.49,1234/1254);s.height=height;s.width=height;combatLayer.addChild(root);return {root,view,fullBodySprite:s,baseX:x,baseY:y,fullBodyHeight:height,neutralAvatarPose:{mainSprite:{}},animationController:{kill(){}}};};
 const merc=actor(495,250,380),targets=[actor(1300,575,260),actor(1400,420,260),actor(1040,510,260)];
 const engine={effectLayer,combatLayer,simpleTimelines:new Set(),allies:Array.from({length:5},()=>({})),scene:{width:1600,height:820},sortCombatDepth(){}};
 const assets={motion:{},effects:{},flash:Texture.EMPTY,smoke:Texture.EMPTY};
 for(const [key,spec]of Object.entries(manifest.motion))assets.motion[key]=Array.from({length:spec.frameCount},()=>new Texture({source:sources[1]}));
 for(const [key,spec]of Object.entries(manifest.effects))assets.effects[key]=Array.from({length:spec.frameCount},()=>new Texture({source:sources[2]}));
 const fx=new RagnielSkillFX(engine,merc,targets,assets,manifest,makePlan(),()=>{});
 try{
  fx.seek(1.58);const reg=manifest.motion.slash.contactRegistration;
  const blade=effectLayer.toLocal(merc.fullBodySprite.toGlobal({x:reg.sourcePoint[0]-reg.sourceFoot[0],y:reg.sourcePoint[1]-reg.sourceFoot[1]})),torso=fx.point(targets[0],reg.targetHeightFraction);
  assert.ok(Math.hypot(blade.x-torso.x,blade.y-torso.y)<.01,'Blade and target contact must coincide');
  fx.play();assert.equal(engine.simpleTimelines.size,1);fx.pause();assert.equal(fx.playing,false);
  for(const width of [1600,1050]){
   engine.scene.width=width;targets[0].root.x=targets[0].baseX=width-130;targets[0].root.y=targets[0].baseY=width===1050?996:575;fx.captureFormation();
   for(let i=0;i<=116;i++){
    fx.seek(i*.05);assert.ok(fx.diagnostics().visibleSprites<=64);
    for(const sprite of fx.pool.filter(s=>s.visible&&assets.effects.judgment.includes(s.texture))){assert.ok(sprite.x-sprite.width*.34>=19.99);assert.ok(sprite.x+sprite.width*.34<=width-19.99);assert.ok(sprite.width>650,'Small viewports retain a large area strike');}
   }
  }
  fx.setPlan(makePlan({cancelAt:2.05}));fx.seek(2.5);assert.equal(fx.diagnostics().visibleSprites,0);assert.equal(merc.root.x,merc.baseX);
  fx.cancel();assert.equal(engine.simpleTimelines.size,0);assert.equal(fx.ground.context.instructions.length,0);assert.equal(fx.trails.context.instructions.length,0);
  assert.equal(engine.allies.length,5);assert.equal(engine.allies.includes(merc),false);
 }finally{fx.destroy();fx.destroy();assert.equal(effectLayer.children.length,0);assert.ok(sources.every(s=>!s.destroyed));gsap.ticker.sleep();world.destroy({children:true});sd.destroy(false);sources.forEach(s=>s.destroy());}
});
