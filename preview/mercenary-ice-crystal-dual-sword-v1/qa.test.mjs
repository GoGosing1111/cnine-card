import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {createHash} from 'node:crypto';
import sharp from 'sharp';
import {Container,Sprite,Texture,TextureSource} from 'pixi.js';
import {gsap} from 'gsap';
import {MODES,makePlan,sample} from './skill.mjs';
import {CueAudio} from './source/CueAudio.js';
import {IceDualSwordFX} from './source/IceDualSwordFX.js';
const root=new URL('./',import.meta.url),project=new URL('../../',import.meta.url),manifest=JSON.parse(await fs.readFile(new URL('manifest.json',root),'utf8'));
const hash=bytes=>createHash('sha256').update(bytes).digest('hex').toUpperCase();

test('all seven sequences seek deterministically and never alter gameplay',()=>{
 for(const mode of Object.keys(MODES)){
  const plan=makePlan({mode}),times=Array.from({length:121},(_,i)=>i/120*plan.duration),states=times.map(t=>sample(plan,t));
  times.slice().reverse().forEach(t=>assert.deepEqual(sample(plan,t),states[times.indexOf(t)]));
  assert.equal(plan.damageAuthority,'NONE_VISUAL_PREVIEW');assert.equal('damage' in states[50],false);
  for(const t of [0,plan.duration,plan.duration+1]){const s=sample(plan,t);assert.equal(s.pose,null);assert.equal(s.travel,0);assert.equal(s.effects.length,0);}
  for(const s of states){if(s.pose)assert.ok(s.pose.frame<manifest.motion[s.pose.key].frameCount);for(const fx of s.effects)assert.ok(fx.frame>=0&&fx.frame<manifest.effects[fx.key].frameCount);}
 }
});
test('interrupt, target loss and earliest cancellation clear transient effects',()=>{
 for(const mode of Object.keys(MODES))for(const key of ['cancelAt','targetLostAt'])for(const at of [0,.3,.65,1.2,2.05]){
  const plan=makePlan({mode,[key]:at});assert.ok(plan.contacts.every(t=>t<at));assert.ok(plan.audioCues.every(([,t])=>t<at));
  if(at>plan.duration)continue;
  for(const t of [at,(at+plan.duration)/2,plan.duration]){const s=sample(plan,t);assert.equal(s.cancelled,true);assert.equal(s.travel,0);assert.equal(s.pose,null);assert.equal(s.effects.length,0);assert.equal(s.charge,0);assert.equal(s.flash,0);assert.equal(s.recoil,0);assert.equal(s.trail,false);assert.equal(s.auraBoost,0);}
 }
 assert.equal(makePlan({mode:'ultimate',cancelAt:2,targetLostAt:1}).stop,1);
 assert.throws(()=>makePlan({mode:'unknown'}));assert.throws(()=>makePlan({cancelAt:-1}));
});
test('every collision cue selects authored contact poses and effect peaks',()=>{
 for(const [mode,time,poseKey,poseFrame,effectKey,fxFrame] of [['attack',.53,'attack',4,'slash',4],['attack',.78,'attack',7,'slash',4],['cross',.68,'cross',3,'cross',4],['cyclone',.74,'cyclone',2,'slash',4],['cyclone',1.26,'cyclone',7,'cyclone',8],['guard',.74,'guard',3,'guard',5],['ultimate',1.3,'cross',3,'cross',4],['ultimate',2.62,'cast',5,'ultimate',5]]){
  const s=sample(makePlan({mode}),time);assert.deepEqual(s.pose,{key:poseKey,frame:poseFrame});assert.ok(s.effects.some(f=>f.key===effectKey&&f.frame===fxFrame));
 }
});
test('approved source and SD are preserved, separate and explicitly approved for release',async()=>{
 assert.equal(manifest.rank,'SSS');assert.equal(manifest.runtimeEnabled,true);assert.equal(manifest.skillsAssigned,true);assert.notEqual(manifest.sourceArt,manifest.battleSprite);
 assert.equal(hash(await fs.readFile(new URL(manifest.sourceArt,project))),'321600E04E4CDB3ABD9D35CCEEFCF4AFBD9F34AED73ABD5A8AD038123A999535');
 assert.equal(hash(await fs.readFile(new URL(manifest.battleSprite,project))),'DAE9EAA500E924E8561D6823D1A89C90F63A77EF5C8727A835E196C6F98016BD');
 assert.equal(manifest.battleSpriteStatus,'USER_APPROVED_BATTLE_SPRITE');assert.equal(manifest.codeStatus,'LIVE_APPROVED');assert.equal(manifest.name,'크라이베른');assert.equal(manifest.title,'');assert.ok(manifest.battleSpriteInfo.clear>.7);assert.equal(manifest.battleSpriteInfo.border,0);
});
test('134 distinct generated frames preserve original alpha, sources and atlas borders',async()=>{
 const specs=[...Object.values(manifest.motion),...Object.values(manifest.effects)];
 assert.equal(new Set(specs.map(s=>s.atlas)).size,specs.length,'Motion/FX atlas paths must not collide');
 let count=0;
 for(const spec of [...Object.values(manifest.motion),...Object.values(manifest.effects)]){
  assert.equal(new Set(spec.frames.map(f=>f.sha256)).size,spec.frameCount);assert.equal(hash(await fs.readFile(new URL(spec.source,root))),spec.sourceInfo.sha256);
  const atlas=await fs.readFile(new URL(spec.atlas,root));assert.equal(hash(atlas),spec.atlasSha256);const metadata=await sharp(atlas).metadata();assert.equal(metadata.width,spec.cellSize*spec.columns);assert.equal(metadata.height,spec.cellSize*spec.rows);assert.equal(metadata.hasAlpha,true);
  for(const f of spec.frames){
   count++;const bytes=await fs.readFile(new URL(f.file,root));assert.equal(hash(bytes),f.sha256);const {data,info}=await sharp(bytes).ensureAlpha().raw().toBuffer({resolveWithObject:true});let visible=0;
   for(let y=0;y<info.height;y++)for(let x=0;x<info.width;x++){const a=data[(y*info.width+x)*4+3];if(a>24)visible++;if(x<4||y<4||x>=info.width-4||y>=info.height-4)assert.equal(a,0,f.file+' border');}
   assert.ok(visible>100,f.file+' empty');assert.ok(visible<info.width*info.height*.75,f.file+' opaque');const anchor=f.footAnchor||f.anchor;assert.ok(anchor.x>0&&anchor.x<1&&anchor.y>0&&anchor.y<1);
  }
 }
 assert.equal(count,134);assert.equal(Object.values(manifest.motion).reduce((s,v)=>s+v.frameCount,0),54);
});
test('every implemented mode has its own well-formed preview select option',async()=>{
 const html=await fs.readFile(new URL('index.html',root),'utf8');
 for(const key of Object.keys(MODES))assert.ok(html.includes('<option value="'+key+'">'),key+' select option');
 assert.equal(html.includes('</option value='),false);
});
test('recorded audio matches license, original assets and sync points',async()=>{
 assert.equal(manifest.audio.proceduralSynthesis,false);assert.equal(manifest.audio.license,'Mixkit Free License');
 for(const [key,sync] of [['dash',178],['slash',250],['ultimate',333]]){const a=manifest.audio.assets[key];assert.equal(a.syncPointMs,sync);assert.ok(a.sourceIds.length>=3);assert.equal(hash(await fs.readFile(new URL(a.file,project))),a.sha256.toUpperCase());}
});
function audioHarness(){
 const audio=new CueAudio();audio.enabled=true;const nodes=[];audio.context={currentTime:50,destination:{},createGain:()=>({gain:{value:0},connect(){},disconnect(){}}),createBufferSource:()=>{const node={playbackRate:{value:0},connect(){},disconnect(){},start(when,offset){this.when=when;this.offset=offset;},stop(){this.stopped=true;}};nodes.push(node);return node;}};return {audio,nodes,buffers:{dash:{duration:.86},slash:{duration:1.3},ultimate:{duration:2.1}}};
}
test('audio decode delay and 0.25/0.5/1/2x retain sub-20ms contact alignment',async()=>{
 for(const speed of [.25,.5,1,2]){const {audio,buffers}=audioHarness();let resolve,now=0;audio.ready=()=>new Promise(r=>resolve=r);const pending=audio.play(makePlan({mode:'ultimate'}),now,speed,()=>now);now=1.7;resolve(buffers);await pending;const cue=audio.scheduled.find(c=>c.key==='ultimate');assert.ok(cue);assert.ok(Math.abs(cue.when+(cue.sourceSync-cue.offset)/speed-(50+(cue.contact-now)/speed))<.001);audio.stop();assert.equal(audio.nodes.size,0);}
});
test('stale sound never restarts after cancellation during loading',async()=>{
 const {audio,buffers,nodes}=audioHarness();let resolve;audio.ready=()=>new Promise(r=>resolve=r);const pending=audio.play(makePlan({mode:'ultimate'}),0,1);audio.stop();resolve(buffers);await pending;assert.equal(nodes.length,0);
 audio.ready=async()=>buffers;await audio.play(makePlan({mode:'ultimate',targetLostAt:2.05}),0,1);assert.equal(audio.scheduled.some(c=>c.key==='ultimate'),false);audio.stop();assert.ok(nodes.every(n=>n.stopped));
});

test('actual Pixi transforms align each blade, follow every pose and clean up without touching shared textures',()=>{
 const world=new Container(),combatLayer=new Container(),effectLayer=new Container();world.addChild(combatLayer,effectLayer);
 const sources=[new TextureSource({width:1254,height:1254}),new TextureSource({width:768,height:768}),new TextureSource({width:512,height:512})],sd=new Texture({source:sources[0]});
 const actor=(x,y,height)=>{const root=new Container(),view=new Container(),s=new Sprite(sd);root.position.set(x,y);root.scale.set(.6);root.addChild(view);view.addChild(s);s.anchor.set(manifest.battleSpriteFootAnchor.x,manifest.battleSpriteFootAnchor.y);s.height=height;s.width=height;combatLayer.addChild(root);return {root,view,fullBodySprite:s,baseX:x,baseY:y,fullBodyHeight:height,neutralAvatarPose:{mainSprite:{}},animationController:{kill(){}}};};
 const merc=actor(495,250,380),targets=[actor(1300,575,260),actor(1400,420,260),actor(1040,510,260)],engine={effectLayer,combatLayer,simpleTimelines:new Set(),allies:Array.from({length:5},()=>({})),scene:{width:1600,height:820},sortCombatDepth(){}};
 const assets={motion:{},effects:{},flash:Texture.EMPTY,smoke:Texture.EMPTY};
 for(const [key,spec] of Object.entries(manifest.motion))assets.motion[key]=Array.from({length:spec.frameCount},()=>new Texture({source:sources[1]}));
 for(const [key,spec] of Object.entries(manifest.effects))assets.effects[key]=Array.from({length:spec.frameCount},()=>new Texture({source:sources[2]}));
 const fx=new IceDualSwordFX(engine,merc,targets,assets,manifest,makePlan(),()=>{});
 try{
  for(const [mode,t,key,index] of [['attack',.53,'attack',0],['attack',.78,'attack',1],['cross',.68,'cross',0],['cyclone',.74,'cyclone',0],['cyclone',1.26,'cyclone',1],['ultimate',1.3,'cross',0]]){
   fx.setPlan(makePlan({mode}));fx.seek(t);const reg=manifest.motion[key].contacts[index];const blade=effectLayer.toLocal(merc.fullBodySprite.toGlobal({x:reg.sourcePoint[0]-reg.sourceFoot[0],y:reg.sourcePoint[1]-reg.sourceFoot[1]})),torso=fx.point(targets[0],reg.targetHeightFraction);
   assert.ok(Math.hypot(blade.x-torso.x,blade.y-torso.y)<.01,mode+' blade contact');
  }
  for(const mode of Object.keys(MODES)){
   fx.setPlan(makePlan({mode}));fx.play();assert.equal(engine.simpleTimelines.size,1);fx.pause();assert.equal(fx.playing,false);
   for(let i=0;i<=100;i++){fx.seek(fx.plan.duration*i/100);assert.ok(fx.diagnostics().visibleSprites<=80);assert.equal(fx.diagnostics().aura.textureMatchesPose,true);assert.equal(fx.outer.anchor.x,merc.fullBodySprite.anchor.x);assert.equal(fx.outer.scale.x,merc.fullBodySprite.scale.x);}
  }
  fx.setAura(false);assert.equal(fx.aura.visible,false);fx.setAura(true);assert.equal(fx.aura.visible,true);
  fx.setPlan(makePlan({mode:'ultimate',cancelAt:2.05}));fx.seek(2.5);assert.equal(fx.diagnostics().visibleSprites,0);assert.equal(merc.root.x,merc.baseX);
  fx.cancel();assert.equal(engine.simpleTimelines.size,0);assert.equal(fx.ground.context.instructions.length,0);assert.equal(fx.trails.context.instructions.length,0);
  assert.equal(engine.allies.length,5);assert.equal(engine.allies.includes(merc),false);
 }finally{fx.destroy();fx.destroy();assert.equal(effectLayer.children.length,0);assert.equal(merc.view.children.length,1);assert.ok(sources.every(s=>!s.destroyed));gsap.ticker.sleep();world.destroy({children:true});sd.destroy(false);sources.forEach(s=>s.destroy());}
});
