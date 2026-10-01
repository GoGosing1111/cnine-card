import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {createHash} from 'node:crypto';
import sharp from 'sharp';
import {Container,Sprite,Texture,TextureSource} from 'pixi.js';
import {gsap} from 'gsap';
import {MODES,makePlan,sample,OVERHEAD,OVERHEAD_MODES,ACTIVE_MOTION_KEYS} from './skill.mjs';
import {KnightFX} from './source/KnightFX.js';
import {CueAudio} from './source/CueAudio.js';
import {weaponAt} from './compose-weapon.mjs';
import {SHOWCASE_MODES,SHOWCASE_DURATION,showcaseAt,SkillShowcase} from './showcase.mjs';
const root=new URL('./',import.meta.url),project=new URL('../../',import.meta.url),manifest=JSON.parse(await fs.readFile(new URL('manifest.json',root),'utf8'));
const hash=b=>createHash('sha256').update(b).digest('hex').toUpperCase();

test('all ten modes seek deterministically, stay in authored frame bounds and clear on stop',()=>{
 for(const mode of Object.keys(MODES)){
  const plan=makePlan({mode});assert.equal(plan.damageAuthority,'NONE_VISUAL_PREVIEW');
  for(let i=0;i<=680;i++){const t=plan.duration*i/680,s=sample(plan,t);assert.deepEqual(s,sample(plan,t));assert.ok(s.pose.frame>=0&&s.pose.frame<manifest.motion[s.pose.key].frameCount);for(const f of s.effects)assert.ok(f.frame>=0&&f.frame<manifest.effects[f.key].frameCount);assert.equal('damage' in s,false);}
  for(const key of ['cancelAt','targetLostAt']){const p=makePlan({mode,[key]:.3}),s=sample(p,.3);assert.equal(s.cancelled,true);assert.equal(s.travel,0);assert.deepEqual(s.effects,[]);assert.equal(s.flash,0);assert.equal(s.trail,false);assert.ok(p.contacts.every(at=>at<.3));assert.ok(p.audioCues.every(([,at])=>at<.3));}
 }
 assert.equal(makePlan({cancelAt:2,targetLostAt:1}).stop,1);assert.throws(()=>makePlan({mode:'invalid'}));
});
test('every living motion begins and ends on the exact approved idle texture',()=>{
 const locked=manifest.motion.idle.frames[0];
 assert.equal(manifest.returnPose.endpoint.sha256,locked.sha256);
 assert.equal(manifest.motion.idle.atlas,'assets/motion-v5/idle-atlas.webp');
 for(const mode of Object.keys(MODES)){
  const p=makePlan({mode});assert.deepEqual(sample(p,0).pose,{key:'idle',frame:0});
  if(mode!=='defeat')for(const t of [p.duration-.001,p.duration])assert.deepEqual(sample(p,t).pose,{key:'idle',frame:0},mode+' approved return');
  for(const key of ['cancelAt','targetLostAt'])assert.deepEqual(sample(makePlan({mode,[key]:.3}),.3).pose,{key:'idle',frame:0});
 }
 for(const mode of OVERHEAD_MODES)assert.deepEqual(sample(makePlan({mode}),3.16).pose,{key:'idle',frame:0},mode+' settle before returning dash');
 for(const key of ['finish','recover','twohandReturn']){const f=manifest.motion[key].frames.at(-1);assert.equal(f.source,'assets/motion-v5/ready-a-source.png');assert.equal(f.sourceIndex,0);}
});

test('drawn collision poses and VFX peaks meet at the same timestamp',()=>{
 for(const [mode,effect,peak] of [['overhead','execution',9],['attack','slash',9],['skill','execution',9],['execution','execution',9],['guard','guard',6],['ultimate','ultimate',10]]){
  const t=OVERHEAD.contact,key='twohandStrike',frame=1;
  const s=sample(makePlan({mode}),t);assert.deepEqual(s.pose,{key,frame});assert.ok(s.effects.some(f=>f.key===effect&&Math.abs(f.frame-peak)<1e-9));
 }
});
test('strike-only acceleration keeps skill duration, hit and recovery fixed',()=>{
 for(const mode of OVERHEAD_MODES){
  const p=makePlan({mode});assert.equal(p.duration,mode==='ultimate'?5.55:4.05);assert.deepEqual(p.contacts,[1.98]);
  assert.deepEqual(sample(p,1.85).pose,{key:'twohandLift',frame:3},'hold the raised blade until the shorter swing begins');
  assert.deepEqual(sample(p,1.90).pose,{key:'twohandStrike',frame:0});
  assert.deepEqual(sample(p,1.98).pose,{key:'twohandStrike',frame:1});
  assert.deepEqual(sample(p,2.12).pose,{key:'twohandStrike',frame:3},'finish the swing earlier without accelerating recovery');
  assert.deepEqual(sample(p,2.19).pose,{key:'twohandStrike',frame:3});
  assert.deepEqual(sample(p,2.20).pose,{key:'twohandReturn',frame:0});
  assert.deepEqual(sample(p,3.15).pose,{key:'idle',frame:0});
  const first=[];for(let t=1.8;t<2.2;t+=.0005){const pose=sample(p,t).pose;if(pose.key==='twohandStrike'&&first[pose.frame]===undefined)first[pose.frame]=t;}
  assert.equal(first.length,4);assert.ok(Math.abs((first[1]-first[0])-.10)<.001,'first swing frame lasts 0.10s instead of 0.12s');
 }
 assert.equal(SHOWCASE_DURATION,27.6);assert.equal(manifest.playbackTempo.rate,1.2);
});
test('approved masters are byte exact and the selected sword RGB comes only from the approved source',async()=>{
 for(const [file,sha] of [[manifest.sourceArt,manifest.sourceArtSha256],[manifest.battleSprite,manifest.battleSpriteSha256]])assert.equal(hash(await fs.readFile(new URL(file,project))),sha);
 assert.equal(manifest.sourceArtSha256,'8B94E60670355AF87D13802FD68AD4DE22F8E7F23C65028CC97DD1D1F78BE838');
 assert.equal(hash(await fs.readFile(new URL('assets/user-approved/knight-base-approved.png',root))),'967113CDD1619DB498C7BE466E5F4608D2DE4B3120DE7534B3BA5C22B32CBADE');
 assert.equal(hash(await fs.readFile(new URL('assets/user-approved/idle-sheet-approved.png',root))),'DD1AA28B7BA3AC3DAB291C6037A1C3280CA83DE221D8C5930ECC60B5335507D5');
 const w=manifest.weapon,bytes=await fs.readFile(new URL(w.file,root));assert.equal(hash(bytes),w.sha256);
 const sword=await sharp(bytes).ensureAlpha().raw().toBuffer({resolveWithObject:true}),source=await sharp(await fs.readFile(new URL(w.source,root))).ensureAlpha().raw().toBuffer({resolveWithObject:true});let pixels=0;
 for(let y=0;y<sword.info.height;y++)for(let x=0;x<sword.info.width;x++){const p=(y*sword.info.width+x)*4;if(!sword.data[p+3])continue;pixels++;const q=((y+w.crop.top)*source.info.width+x+w.crop.left)*4;assert.deepEqual(sword.data.subarray(p,p+3),source.data.subarray(q,q+3));}
 assert.equal(pixels,w.selectedPixels);assert.equal(manifest.rank,null);assert.equal(manifest.runtimeEnabled,false);assert.equal(manifest.motionStatus,'USER_ADOPTED_TWO_HAND_OVERHEAD');assert.notEqual(manifest.sourceArt,manifest.battleSprite);
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
 assert.equal(count,manifest.counts.motion+manifest.counts.effects);assert.equal(manifest.counts.uniqueMotion,54);assert.equal(manifest.counts.effects,96);assert.notEqual(manifest.motion.ultimate.atlas,manifest.motion.attack.atlas);assert.equal(manifest.motion.guard.reuses,'ready');
});
test('Grounded strikes intersect the target body; aura follows the pose and lifecycle releases effects',()=>{
 const world=new Container(),combatLayer=new Container(),effectLayer=new Container();world.addChild(combatLayer,effectLayer);
 const sdSource=new TextureSource({width:1408,height:1664}),frameSource=new TextureSource({width:512,height:512}),sd=new Texture({source:sdSource});
 const actor=(x,y,height=260)=>{const root=new Container(),view=new Container(),s=new Sprite(sd);root.position.set(x,y);root.scale.set(.6);root.addChild(view);view.addChild(s);s.anchor.set(manifest.battleSpriteFootAnchor.x,manifest.battleSpriteFootAnchor.y);s.height=height;s.width=height*1408/1664;combatLayer.addChild(root);return {root,view,fullBodySprite:s,baseX:x,baseY:y,fullBodyHeight:height,neutralAvatarPose:{mainSprite:{}},animationController:{kill(){}}};};
 const merc=actor(495,250,manifest.displaySizing.fullBodyHeight),targets=[actor(1300,575),actor(1400,420),actor(1040,510)],engine={effectLayer,combatLayer,simpleTimelines:new Set(),allies:Array.from({length:5},()=>({})),scene:{width:1600,height:820},sortCombatDepth(){}};
 const assets={motion:{},effects:{},flash:Texture.EMPTY,smoke:Texture.EMPTY};for(const [key,spec] of Object.entries(manifest.motion))assets.motion[key]=Array.from({length:spec.frameCount},()=>new Texture({source:frameSource}));for(const [key,spec] of Object.entries(manifest.effects))assets.effects[key]=Array.from({length:spec.frameCount},()=>new Texture({source:frameSource}));
 const fx=new KnightFX(engine,merc,targets,assets,manifest,makePlan(),()=>{});
 try{
  for(const mode of OVERHEAD_MODES.filter(k=>k!=='guard')){
   const t=OVERHEAD.contact,key='twohandStrike';
   fx.setPlan(makePlan({mode}));fx.seek(t);const spec=manifest.motion[key],f=spec.frames[spec.contacts[0].frame],point=p=>effectLayer.toLocal(merc.fullBodySprite.toGlobal({x:p[0]-256,y:p[1]-440})),hilt=point(f.grip),tip=point(f.tip),floor=fx.point(targets[0]),head=fx.point(targets[0],1),u=(floor.x-hilt.x)/(tip.x-hilt.x),blade={x:hilt.x+u*(tip.x-hilt.x),y:hilt.y+u*(tip.y-hilt.y)};assert.ok(u>.15&&u<.98,mode+' actual blade segment reaches target');
   assert.ok(Math.abs(blade.x-floor.x)<.01,mode+' blade horizontal contact');assert.ok(blade.y<floor.y&&blade.y>head.y,mode+' blade inside target body');assert.equal(merc.root.y,targets[0].root.y,mode+' grounded feet');
   fx.seek(t-.2);assert.equal(merc.root.y,targets[0].root.y,mode+' swing cannot move floor');fx.seek(t+.15);assert.equal(merc.root.y,targets[0].root.y,mode+' followthrough cannot move floor');
  }
  fx.setMotionOnly(true);fx.seek(1.96);assert.equal(fx.diagnostics().visibleSprites,0);assert.equal(fx.aura.visible,false);fx.setMotionOnly(false);
  for(const mode of Object.keys(MODES)){fx.setPlan(makePlan({mode}));fx.play();assert.equal(engine.simpleTimelines.size,1);fx.pause();for(let i=0;i<=60;i++){fx.seek(fx.plan.duration*i/60);assert.ok(fx.diagnostics().visibleSprites<=128);assert.equal(fx.diagnostics().aura.textureMatchesPose,true);}}
  fx.setPlan(makePlan({mode:'overhead'}));fx.seek(1.62);assert.ok(fx.sample.weaponPower>.7);assert.ok(fx.activeFrames.some(f=>f.key==='charge'));const blade=fx.weaponSegment(),before=JSON.stringify(fx.activeFrames);assert.ok(Math.hypot(blade.tip.x-blade.grip.x,blade.tip.y-blade.grip.y)>100);fx.seek(2.05);assert.ok(fx.sample.sweep>0&&fx.sample.impacts.length===1);fx.seek(1.62);assert.equal(JSON.stringify(fx.activeFrames),before,'seek reproduces authored charge frames');
  fx.setPlan(makePlan({mode:'guard'}));
  for(const scale of [.38,.6,1]){merc.root.scale.set(scale);fx.seek(1.98);const ward=fx.guardPlacement(),drawn=fx.activeFrames.find(f=>f.key==='guard');assert.deepEqual(drawn.anchor,ward.point);assert.ok(Math.abs((ward.foot.y-ward.point.y)/ward.bodyHeight-.54)<1e-8,'ward centers above feet on the torso');assert.ok(Math.abs(ward.size/ward.bodyHeight-1.45)<1e-8);const saved={...ward.point};targets[0].root.y+=50;assert.deepEqual(fx.guardPlacement().point,saved,'enemy position cannot move self ward');targets[0].root.y-=50;}
  merc.root.scale.set(.6);
  fx.setPlan(makePlan({mode:'ultimate',targetLostAt:2.05}));fx.seek(3.25);assert.equal(fx.diagnostics().visibleSprites,0);assert.equal(merc.root.x,merc.baseX);fx.cancel();assert.equal(engine.simpleTimelines.size,0);assert.equal(engine.allies.length,5);assert.equal(engine.allies.includes(merc),false);
 }finally{fx.destroy();fx.destroy();assert.equal(effectLayer.children.length,0);assert.equal(merc.view.children.length,1);assert.equal(frameSource.destroyed,false);gsap.ticker.sleep();world.destroy({children:true});sd.destroy(false);sdSource.destroy();frameSource.destroy();}
});

test('every attack and skill uses the adopted overhead frames without retired pose tracks',()=>{
 const reference=makePlan({mode:'overhead'});assert.deepEqual(manifest.activeMotionKeys,ACTIVE_MOTION_KEYS);
 for(const mode of OVERHEAD_MODES){
  const plan=makePlan({mode});assert.equal(plan.motion,OVERHEAD.motion);assert.deepEqual(plan.contacts,[1.98]);
  for(let t=.50;t<3.15;t+=.007){const current=sample(plan,t);assert.deepEqual(current.pose,sample(reference,t).pose,mode+' exact selected pose');assert.equal(current.contactTrack.key,'twohandStrike');}
  for(let t=0;t<plan.duration;t+=.011)assert.ok(ACTIVE_MOTION_KEYS.includes(sample(plan,t).pose.key),mode+' cannot use retired rising/turning tracks');
  assert.equal(sample(plan,1.98).travel,1,'all casts use the selected forward stance with overhead blade clearance');
 }
});

test('all-skills showcase advances only on the active GSAP completion and stops cleanly',()=>{
 const seen=[],fx={sample:{cancelled:false},setPlan(p){this.plan=p;},play(){seen.push(this.plan.mode);}},queue=new SkillShowcase(fx);
 queue.start();assert.equal(queue.active,true);assert.equal(fx.plan.mode,'dash');
 for(let i=0;i<SHOWCASE_MODES.length;i++)fx.onComplete();
 assert.deepEqual(seen,SHOWCASE_MODES);assert.equal(queue.completed,true);assert.equal(queue.active,false);assert.equal(fx.onComplete,null);assert.equal(fx.onCancel,null);
 queue.start();fx.onCancel();assert.equal(queue.active,false);assert.equal(fx.onComplete,null);
 queue.start();fx.sample.cancelled=true;fx.onComplete();assert.equal(queue.active,false);assert.equal(queue.completed,false);
 let offset=0;for(const mode of SHOWCASE_MODES){const point=showcaseAt(offset+.01);assert.equal(point.mode,mode);assert.ok(Math.abs(point.time-.01)<1e-8);offset+=MODES[mode].duration;}assert.equal(offset,SHOWCASE_DURATION);assert.equal(showcaseAt(offset).mode,'ultimate');
});
test('licensed V3 recordings retain their hashes and <=20ms collision alignment at every speed',async()=>{
 assert.equal(manifest.audio.proceduralSynthesis,false);for(const a of Object.values(manifest.audio.assets))assert.equal(hash(await fs.readFile(new URL(a.file,project))),a.sha256.toUpperCase());
 for(const speed of [.25,.3,.5,.6,1,1.2,2,2.4]){const audio=new CueAudio();audio.enabled=true;let now=1.1;audio.context={currentTime:50,destination:{},createGain:()=>({gain:{value:0},connect(){},disconnect(){}}),createBufferSource:()=>({playbackRate:{value:0},connect(){},disconnect(){},start(){},stop(){}})};audio.ready=async()=>({dash:{duration:.86},slash:{duration:1.3},ultimate:{duration:2.1}});await audio.play(makePlan({mode:'ultimate'}),0,speed,()=>now);const cue=audio.scheduled.find(c=>c.key==='ultimate');assert.ok(Math.abs(cue.when+(cue.sourceSync-cue.offset)/speed-(50+(cue.contact-now)/speed))<.001);audio.stop();assert.equal(audio.nodes.size,0);}
});

test('two-hand hilt underlay fills only the old hand hole using original straight-hilt material',async()=>{
 const source=await sharp(await fs.readFile(new URL(manifest.weapon.file,root))).ensureAlpha().raw().toBuffer({resolveWithObject:true});
 const placed=await weaponAt({scale:1,angle:0,grip:[156,164],fillGripOcclusion:true}),out=await sharp(placed.input).ensureAlpha().raw().toBuffer({resolveWithObject:true});
 assert.equal(out.info.width,source.info.width);assert.equal(out.info.height,source.info.height);let filled=0;
 for(let y=0;y<source.info.height;y++)for(let x=0;x<source.info.width;x++){
  const p=(y*source.info.width+x)*4,a=source.data[p+3];
  if(a===255)assert.deepEqual(out.data.subarray(p,p+4),source.data.subarray(p,p+4));
  if(a===0&&out.data[p+3]){assert.ok(x>=142&&x<165&&y>=114&&y<204);const donor=((80+(y-114)%30)*source.info.width+x)*4;assert.equal(out.data[p+3],source.data[donor+3]);for(let c=0;c<3;c++)assert.ok(Math.abs(out.data[p+c]-source.data[donor+c])<=(source.data[donor+3]===255?0:1),'premultiplied alpha edge rounding');filled++;}
 }
 assert.ok(filled>1000);assert.equal(placed.record.sha256,manifest.weapon.sha256);assert.equal(placed.record.hiltUnderlay.sourceSha256,manifest.weapon.sha256);
});
