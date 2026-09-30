import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {createHash} from 'node:crypto';
import sharp from 'sharp';
import {Container,Sprite,Texture,TextureSource} from 'pixi.js';
import {gsap} from 'gsap';
import {MODES,makePlan,sample} from './skill.mjs';
import {KnightFX} from './source/KnightFX.js';
import {CueAudio} from './source/CueAudio.js';
const root=new URL('./',import.meta.url),project=new URL('../../',import.meta.url),manifest=JSON.parse(await fs.readFile(new URL('manifest.json',root),'utf8'));
const hash=b=>createHash('sha256').update(b).digest('hex').toUpperCase();

test('all nine modes seek deterministically, stay in authored frame bounds and clear on stop',()=>{
 for(const mode of Object.keys(MODES)){
  const plan=makePlan({mode});assert.equal(plan.damageAuthority,'NONE_VISUAL_PREVIEW');
  for(let i=0;i<=680;i++){const t=plan.duration*i/680,s=sample(plan,t);assert.deepEqual(s,sample(plan,t));assert.ok(s.pose.frame>=0&&s.pose.frame<manifest.motion[s.pose.key].frameCount);for(const f of s.effects)assert.ok(f.frame>=0&&f.frame<manifest.effects[f.key].frameCount);assert.equal('damage' in s,false);}
  for(const key of ['cancelAt','targetLostAt']){const p=makePlan({mode,[key]:.3}),s=sample(p,.3);assert.equal(s.cancelled,true);assert.equal(s.travel,0);assert.deepEqual(s.effects,[]);assert.equal(s.flash,0);assert.equal(s.trail,false);assert.ok(p.contacts.every(at=>at<.3));assert.ok(p.audioCues.every(([,at])=>at<.3));}
 }
 assert.equal(makePlan({cancelAt:2,targetLostAt:1}).stop,1);assert.throws(()=>makePlan({mode:'invalid'}));
});
test('drawn collision poses and VFX peaks meet at the same timestamp',()=>{
 for(const [mode,t,key,frame,effect,peak] of [['attack',1.77,'attack',6,'slash',9],['skill',1.77,'attack',6,'slash',9],['skill',3.65,'ultimate',6,'execution',9],['execution',2.61,'ultimate',6,'execution',9],['ultimate',2.56,'attack',6,'slash',9],['ultimate',4.44,'ultimate',6,'ultimate',10]]){
  const s=sample(makePlan({mode}),t);assert.deepEqual(s.pose,{key,frame});assert.ok(s.effects.some(f=>f.key===effect&&Math.abs(f.frame-peak)<1e-9));
 }
});
test('approved masters are byte exact and the selected sword RGB comes only from the approved source',async()=>{
 for(const [file,sha] of [[manifest.sourceArt,manifest.sourceArtSha256],[manifest.battleSprite,manifest.battleSpriteSha256]])assert.equal(hash(await fs.readFile(new URL(file,project))),sha);
 assert.equal(manifest.sourceArtSha256,'8B94E60670355AF87D13802FD68AD4DE22F8E7F23C65028CC97DD1D1F78BE838');
 assert.equal(hash(await fs.readFile(new URL('assets/user-approved/knight-base-approved.png',root))),'967113CDD1619DB498C7BE466E5F4608D2DE4B3120DE7534B3BA5C22B32CBADE');
 assert.equal(hash(await fs.readFile(new URL('assets/user-approved/idle-sheet-approved.png',root))),'DD1AA28B7BA3AC3DAB291C6037A1C3280CA83DE221D8C5930ECC60B5335507D5');
 const w=manifest.weapon,bytes=await fs.readFile(new URL(w.file,root));assert.equal(hash(bytes),w.sha256);
 const sword=await sharp(bytes).ensureAlpha().raw().toBuffer({resolveWithObject:true}),source=await sharp(await fs.readFile(new URL(w.source,root))).ensureAlpha().raw().toBuffer({resolveWithObject:true});let pixels=0;
 for(let y=0;y<sword.info.height;y++)for(let x=0;x<sword.info.width;x++){const p=(y*sword.info.width+x)*4;if(!sword.data[p+3])continue;pixels++;const q=((y+w.crop.top)*source.info.width+x+w.crop.left)*4;assert.deepEqual(sword.data.subarray(p,p+3),source.data.subarray(q,q+3));}
 assert.equal(pixels,w.selectedPixels);assert.equal(manifest.rank,null);assert.equal(manifest.runtimeEnabled,false);assert.equal(manifest.motionStatus,'USER_REVIEW_PENDING');assert.notEqual(manifest.sourceArt,manifest.battleSprite);
});
test('Native packed frames have native alpha and clear borders; every weapon has identical body-relative length',async()=>{
 let count=0;
 for(const spec of [...Object.values(manifest.motion),...Object.values(manifest.effects)]){
  assert.equal(new Set(spec.frames.map(f=>f.sha256)).size,spec.frameCount);
  const sources=spec.sources??[{file:spec.source,...spec.sourceInfo}];for(const s of sources)assert.equal(hash(await fs.readFile(new URL(s.file,root))),s.sha256);
  for(const [file,expected] of [[spec.atlas,spec.atlasSha256],[spec.pngAtlas,spec.pngAtlasSha256]]){const bytes=await fs.readFile(new URL(file,root));assert.equal(hash(bytes),expected);const info=await sharp(bytes).metadata();assert.equal(info.width,spec.columns*512);assert.equal(info.height,spec.rows*512);assert.equal(info.hasAlpha,true);}
  for(const f of spec.frames){count++;const bytes=await fs.readFile(new URL(f.file,root));assert.equal(hash(bytes),f.sha256);const {data,info}=await sharp(bytes).ensureAlpha().raw().toBuffer({resolveWithObject:true});let visible=0;
   for(let y=0;y<info.height;y++)for(let x=0;x<info.width;x++){const a=data[(y*info.width+x)*4+3];if(a>24)visible++;if(x<4||y<4||x>=info.width-4||y>=info.height-4)assert.equal(a,0,f.file+' border');}assert.ok(visible>100&&visible<512*512*.8,f.file+' alpha coverage');
   if(f.weapon){assert.equal(f.weapon.sha256,manifest.weapon.sha256);assert.equal(f.weapon.rigid,true);assert.ok(Math.abs(f.weapon.scale*f.weapon.packedUniformScale/f.bodyPixels-1/1452)<1e-10);assert.ok(Math.abs(Math.hypot(f.tip[0]-f.grip[0],f.tip[1]-f.grip[1])/f.bodyPixels-Math.hypot(11,1119)/1452)<1e-10);}
  }
 }
 assert.equal(count,manifest.counts.motion+manifest.counts.effects);assert.equal(manifest.counts.uniqueMotion,37);assert.equal(manifest.counts.effects,96);assert.equal(manifest.motion.ultimate.reuses,'attack');assert.equal(manifest.motion.guard.reuses,'ready');
});
test('Grounded strikes intersect the target body; aura follows the pose and lifecycle releases effects',()=>{
 const world=new Container(),combatLayer=new Container(),effectLayer=new Container();world.addChild(combatLayer,effectLayer);
 const sdSource=new TextureSource({width:1408,height:1664}),frameSource=new TextureSource({width:512,height:512}),sd=new Texture({source:sdSource});
 const actor=(x,y,height=260)=>{const root=new Container(),view=new Container(),s=new Sprite(sd);root.position.set(x,y);root.scale.set(.6);root.addChild(view);view.addChild(s);s.anchor.set(manifest.battleSpriteFootAnchor.x,manifest.battleSpriteFootAnchor.y);s.height=height;s.width=height*1408/1664;combatLayer.addChild(root);return {root,view,fullBodySprite:s,baseX:x,baseY:y,fullBodyHeight:height,neutralAvatarPose:{mainSprite:{}},animationController:{kill(){}}};};
 const merc=actor(495,250,manifest.displaySizing.fullBodyHeight),targets=[actor(1300,575),actor(1400,420),actor(1040,510)],engine={effectLayer,combatLayer,simpleTimelines:new Set(),allies:Array.from({length:5},()=>({})),scene:{width:1600,height:820},sortCombatDepth(){}};
 const assets={motion:{},effects:{},flash:Texture.EMPTY,smoke:Texture.EMPTY};for(const [key,spec] of Object.entries(manifest.motion))assets.motion[key]=Array.from({length:spec.frameCount},()=>new Texture({source:frameSource}));for(const [key,spec] of Object.entries(manifest.effects))assets.effects[key]=Array.from({length:spec.frameCount},()=>new Texture({source:frameSource}));
 const fx=new KnightFX(engine,merc,targets,assets,manifest,makePlan(),()=>{});
 try{
  for(const [mode,t,key] of [['attack',1.77,'attack'],['skill',3.65,'ultimate'],['execution',2.61,'ultimate'],['ultimate',2.56,'attack'],['ultimate',4.44,'ultimate']]){
   fx.setPlan(makePlan({mode}));fx.seek(t);const f=manifest.motion[key].frames[6],local={x:f.grip[0]+.72*(f.tip[0]-f.grip[0])-256,y:f.grip[1]+.72*(f.tip[1]-f.grip[1])-440},blade=effectLayer.toLocal(merc.fullBodySprite.toGlobal(local)),floor=fx.point(targets[0]),head=fx.point(targets[0],.9);
   assert.ok(Math.abs(blade.x-floor.x)<.01,mode+' blade horizontal contact');assert.ok(blade.y<floor.y&&blade.y>head.y,mode+' blade inside target body');assert.equal(merc.root.y,targets[0].root.y,mode+' grounded feet');
   fx.seek(t-.2);assert.equal(merc.root.y,targets[0].root.y,mode+' swing cannot move floor');fx.seek(t+.15);assert.equal(merc.root.y,targets[0].root.y,mode+' followthrough cannot move floor');
  }
  fx.setMotionOnly(true);fx.seek(4.44);assert.equal(fx.diagnostics().visibleSprites,0);assert.equal(fx.aura.visible,false);fx.setMotionOnly(false);
  for(const mode of Object.keys(MODES)){fx.setPlan(makePlan({mode}));fx.play();assert.equal(engine.simpleTimelines.size,1);fx.pause();for(let i=0;i<=60;i++){fx.seek(fx.plan.duration*i/60);assert.ok(fx.diagnostics().visibleSprites<=80);assert.equal(fx.diagnostics().aura.textureMatchesPose,true);}}
  fx.setPlan(makePlan({mode:'ultimate',targetLostAt:2.05}));fx.seek(3.25);assert.equal(fx.diagnostics().visibleSprites,0);assert.equal(merc.root.x,merc.baseX);fx.cancel();assert.equal(engine.simpleTimelines.size,0);assert.equal(engine.allies.length,5);assert.equal(engine.allies.includes(merc),false);
 }finally{fx.destroy();fx.destroy();assert.equal(effectLayer.children.length,0);assert.equal(merc.view.children.length,1);assert.equal(frameSource.destroyed,false);gsap.ticker.sleep();world.destroy({children:true});sd.destroy(false);sdSource.destroy();frameSource.destroy();}
});
test('licensed V3 recordings retain their hashes and <=20ms collision alignment at every speed',async()=>{
 assert.equal(manifest.audio.proceduralSynthesis,false);for(const a of Object.values(manifest.audio.assets))assert.equal(hash(await fs.readFile(new URL(a.file,project))),a.sha256.toUpperCase());
 for(const speed of [.25,.5,1,2]){const audio=new CueAudio();audio.enabled=true;let now=1.1;audio.context={currentTime:50,destination:{},createGain:()=>({gain:{value:0},connect(){},disconnect(){}}),createBufferSource:()=>({playbackRate:{value:0},connect(){},disconnect(){},start(){},stop(){}})};audio.ready=async()=>({dash:{duration:.86},slash:{duration:1.3},ultimate:{duration:2.1}});await audio.play(makePlan({mode:'ultimate'}),0,speed,()=>now);const cue=audio.scheduled.find(c=>c.key==='ultimate');assert.ok(Math.abs(cue.when+(cue.sourceSync-cue.offset)/speed-(50+(cue.contact-now)/speed))<.001);audio.stop();assert.equal(audio.nodes.size,0);}
});
