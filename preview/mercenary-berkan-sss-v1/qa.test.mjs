import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import sharp from 'sharp';
import {Container,Sprite,Texture,TextureSource,RenderTexture,RendererType,DOMAdapter} from 'pixi.js';
import {gsap} from 'gsap';
import {MODES,makePlan,sample} from './skill.mjs';
import {readImage,sha} from './image-tools.mjs';
import {BerkanFX} from './source/BerkanFX.js';
import {MERCENARY_CMS_SEED as liveSeed} from '../../functions/_mercenary_cms_seed.js';
import {suggestedMercenaryDraw} from '../../shared/mercenary-draw-policy-v1.mjs';
import {prepareBerkanCandidate,berkanSelectionWeights,planBerkanDraw,HASHES} from './release/registration.mjs';
const seed=structuredClone(liveSeed);
seed.catalog.cards=seed.catalog.cards.filter(c=>c.code!=='V-055');seed.catalog.skills=seed.catalog.skills.filter(s=>s.id!=='MS-055');
seed.document.mercenaries=seed.document.mercenaries.filter(c=>c.code!=='V-055');seed.document.assignments=seed.document.assignments.filter(c=>c.code!=='V-055');seed.document.skills=seed.document.skills.filter(s=>s.id!=='MS-055');
const root=new URL('./',import.meta.url),manifest=JSON.parse(await fs.readFile(new URL('manifest.json',root),'utf8'));
test('user art and SSS name are preserved; card art and SD stay separate',async()=>{
 assert.equal(manifest.name,'베르칸');assert.equal(manifest.rank,'SSS');assert.equal(manifest.runtimeEnabled,true);
 assert.notEqual(manifest.sourceArt,manifest.battleSprite);
 assert.equal(sha(await fs.readFile(new URL('assets/source-art.png',root))),HASHES.sourceArt);
 assert.equal(sha(await fs.readFile(new URL('assets/berkan-sd-v1.png',root))),HASHES.battleSprite);
 assert.equal(manifest.sourceArtInfo.width,1024);assert.equal(manifest.sourceArtInfo.height,1536);assert.ok(manifest.battleSpriteInfo.hasAlpha);
 assert.equal(manifest.battleSpriteInfo.border,0);assert.ok(!manifest.motion.run);
});
test('116 distinct frames have native alpha, complete margins and verified lossless atlases',async()=>{
 let count=0;const specs=[...Object.values(manifest.motion),...Object.values(manifest.effects)];
 assert.equal(new Set(specs.map(x=>x.atlas)).size,specs.length);assert.ok(manifest.renderer.atlasBytesRGBA<=128*1024*1024);
 for(const spec of specs){
  assert.equal(sha(await fs.readFile(new URL(spec.source,root))),spec.sourceInfo.sha256);assert.equal(new Set(spec.frames.map(f=>f.sha256)).size,spec.frameCount);
  const atlas=await fs.readFile(new URL(spec.atlas,root));assert.equal(sha(atlas),spec.sha256);const meta=await sharp(atlas).metadata();assert.equal(meta.width,spec.cellSize*spec.columns);assert.equal(meta.height,spec.cellSize*spec.rows);assert.equal(meta.hasAlpha,true);
  for(const frame of spec.frames){count++;const im=await readImage(new URL(frame.file,root));assert.equal(im.record.sha256,frame.sha256);assert.equal(im.record.hasAlpha,true);assert.equal(im.record.border,0);assert.ok(im.record.clear>.1);assert.ok(im.record.clear<.995);}
 }
 assert.equal(count,116);assert.equal(Object.values(manifest.motion).reduce((n,s)=>n+s.frameCount,0),56);
 assert.ok(manifest.motion.defeat.frames.at(-1).sourceBounds.y1-manifest.motion.defeat.frames.at(-1).sourceBounds.y0<manifest.motion.defeat.bodyPixels*.65,'Collapse must not grow back to standing height');
});
test('all modes seek deterministically; releases and impacts use authored frames',()=>{
 for(const mode of Object.keys(MODES)){
  const plan=makePlan({mode});for(let i=0;i<=100;i++){const t=i/100*plan.duration,s=sample(plan,t);assert.deepEqual(s,sample(plan,t));assert.equal('damage' in s,false);assert.ok(s.pose.frame<manifest.motion[s.pose.key].frameCount);for(const f of s.effects)assert.ok(f.frame>=0&&f.frame<manifest.effects[f.key].frameCount);}
  assert.equal(plan.damageAuthority,'NONE_VISUAL_PREVIEW');
 }
 assert.deepEqual(sample(makePlan({mode:'attack'}),.82).pose,{key:'attack',frame:6});
 assert.deepEqual(sample(makePlan({mode:'ultimate'}),1.7).pose,{key:'ultimate',frame:7});
 for(const mode of ['attack','ultimate']){const plan=makePlan({mode}),s=sample(plan,plan.contacts[0]);assert.equal(s.projectile,null);assert.equal(s.effects.find(f=>f.key==='impact').frame,4);}
 assert.throws(()=>makePlan({mode:'run'}));assert.throws(()=>makePlan({cancelAt:-1}));
});
test('interruption, missing target and dodge never produce false contact or lingering skill effects',()=>{
 for(const mode of Object.keys(MODES))for(const key of ['cancelAt','targetLostAt']){
  const plan=makePlan({mode,[key]:.5});assert.ok(plan.contacts.every(t=>t<.5));
  for(const t of [.5,1,plan.duration]){const s=sample(plan,t);assert.equal(s.cancelled,true);assert.equal(s.effects.length,0);assert.equal(s.projectile,null);assert.deepEqual(s.pose,{key:'idle',frame:0});}
 }
 const dodge=makePlan({mode:'ultimate',dodge:true});assert.equal(dodge.contacts.length,0);assert.equal(sample(dodge,2.08).effects.some(x=>x.key==='impact'),false);
});
test('actual Pixi transforms keep the archer planted, aura on each pose, and shared textures alive after cleanup',()=>{
 const world=new Container(),combatLayer=new Container(),effectLayer=new Container();world.addChild(combatLayer,effectLayer);
 const sources=[new TextureSource({width:1254,height:1254}),new TextureSource({width:512,height:512})],sd=new Texture({source:sources[0]});
 const actor=(x,y,h)=>{const root=new Container(),view=new Container(),sprite=new Sprite(sd);root.position.set(x,y);root.scale.set(.6);root.addChild(view);view.addChild(sprite);sprite.anchor.set(manifest.battleSpriteFootAnchor.x,manifest.battleSpriteFootAnchor.y);sprite.height=sprite.width=h;combatLayer.addChild(root);return {root,view,fullBodySprite:sprite,baseX:x,baseY:y,fullBodyHeight:h,neutralAvatarPose:{mainSprite:{}},animationController:{kill(){}}};};
 const merc=actor(420,270,380),target=actor(1200,510,260),second=actor(1350,270,260),engine={app:{renderer:{}},effectLayer,combatLayer,simpleTimelines:new Set(),sortCombatDepth(){}},assets={motion:{},effects:{}};
 target.id='T1';second.id='T2';
 for(const group of ['motion','effects'])for(const [key,spec]of Object.entries(manifest[group]))assets[group][key]=Array.from({length:spec.frameCount},()=>new Texture({source:sources[1]}));
 const adapter=DOMAdapter.get();DOMAdapter.set({...adapter,createCanvas:()=>({getContext:()=>null})});
 const fx=new BerkanFX(engine,merc,[target,second],assets,manifest,makePlan());
 DOMAdapter.set(adapter);
 try{
  // Real Pixi blur passes must clear reused WebGL scratch textures. Otherwise
  // the larger skill pose leaves rectangular gold edges around the idle pose.
  const input=RenderTexture.create({width:512,height:512}),output=RenderTexture.create({width:512,height:512});
  try{
   for(const blur of [fx.outerBlur,fx.innerBlur])for(const pass of [blur.blurXFilter,blur.blurYFilter]){
    const calls=[];pass.apply({renderer:{type:RendererType.WEBGL},applyFilter(_f,_input,target,clear){calls.push({target,clear});}},input,output,false);
    assert.equal(calls.length,2);assert.equal(calls[0].clear,true,'Intermediate texture must clear old skill pixels');assert.notEqual(calls[0].target,output);assert.equal(calls[1].target,output);assert.equal(calls[1].clear,false);
   }
  }finally{input.destroy(true);output.destroy(true);}
  for(const mode of Object.keys(MODES)){
   fx.setPlan(makePlan({mode}));fx.play();assert.equal(engine.simpleTimelines.size,1);fx.pause();assert.equal(fx.playing,false);
   for(const speed of [.25,.5,1,2]){fx.setSpeed(speed);assert.equal(fx.timeline.timeScale(),speed);}
   for(let i=0;i<=80;i++){fx.seek(fx.plan.duration*i/80);assert.equal(merc.root.x,420);assert.equal(merc.root.y,270);assert.ok(fx.used<=40);if(mode!=='defeat'){assert.equal(fx.outer.texture,merc.fullBodySprite.texture);assert.equal(fx.outer.scale.x,merc.fullBodySprite.scale.x);}else assert.equal(fx.aura.visible,false);}
   fx.cancel();assert.equal(engine.simpleTimelines.size,0);assert.equal(fx.used,0);assert.deepEqual(fx.sample.pose,{key:'idle',frame:0});
  }
  fx.setPlan(makePlan({mode:'ultimate'}));fx.seek(1.9);assert.equal(fx.time,1.9);assert.equal(fx.activeFrames.filter(f=>f.key==='projectile').length,2);
  fx.seek(2.08);assert.equal(fx.activeFrames.filter(f=>f.key==='impact').length,2);
  fx.plan.targetDodges={T2:true};fx.seek(2.08);assert.equal(fx.activeFrames.filter(f=>f.key==='impact').length,1);
  fx.setPlan(makePlan({mode:'attack'}));fx.seek(1.12);assert.equal(fx.activeFrames.filter(f=>f.key==='impact').length,1);
  fx.setAura(false);assert.equal(fx.aura.visible,false);fx.setAura(true);assert.equal(fx.aura.visible,true);
  fx.setPlan(makePlan({mode:'ultimate',targetLostAt:1.4}));fx.seek(2.08);assert.equal(fx.used,0);assert.equal(target.view.x,0);
  const scale=merc.fullBodySprite.scale.x;assert.equal(merc.neutralAvatarPose.mainSprite.scaleX,scale);
 }finally{fx.destroy();fx.destroy();assert.equal(effectLayer.children.length,0);assert.equal(merc.view.children.length,1);assert.equal(engine.simpleTimelines.size,0);assert.ok(sources.every(s=>!s.destroyed));gsap.ticker.sleep();world.destroy({children:true});sd.destroy(false);sources.forEach(s=>s.destroy());}
});
test('SSS candidate adds only Berkan; old CMS rows/settings and manual assignments remain intact',()=>{
 const before=structuredClone(seed),candidate=prepareBerkanCandidate(seed,manifest);assert.deepEqual(seed,before);
 for(const key of ['mercenaries','skills','assignments'])assert.deepEqual(candidate.document[key].slice(0,-1),seed.document[key]);
 assert.deepEqual(candidate.document.settings,seed.document.settings);assert.equal(candidate.document.mercenaries.at(-1).rank,'SSS');assert.deepEqual(candidate.document.assignments.at(-1).skillIds,['MS-055']);
 assert.deepEqual(prepareBerkanCandidate(candidate,manifest).document,candidate.document);
 const collision=structuredClone(seed);collision.catalog.cards.push({code:'V-055',sourceArtSha256:'bad'});assert.throws(()=>prepareBerkanCandidate(collision,manifest),/COLLISION/);
});
test('Berkan matches saved Cryvern weight without increasing overall SSS odds or rewriting other weights',()=>{
 const candidate=prepareBerkanCandidate(seed,manifest),policy=suggestedMercenaryDraw();policy.cardRules.cardWeights={'V-021':8991,'V-046':999,'V-049':10,'V-050':33};
 const copy=structuredClone(policy),plan=planBerkanDraw(policy,candidate);assert.deepEqual(policy,copy);assert.deepEqual(plan.policy.outcomes,policy.outcomes);
 assert.equal(plan.policy.cardRules.cardWeights['V-055'],10);assert.equal(plan.berkan.percent,plan.cryvern.percent);assert.equal(plan.berkan.withinRankPercent,plan.cryvern.withinRankPercent);
 for(const [code,weight]of Object.entries(policy.cardRules.cardWeights))assert.equal(plan.policy.cardRules.cardWeights[code],weight);
 const explicit={'V-049':10,'V-055':7};assert.equal(berkanSelectionWeights(['V-049','V-055'],explicit),explicit);
 const legacy=berkanSelectionWeights(['V-021','V-046','V-049','V-055'],{});assert.equal(legacy['V-055'],legacy['V-049']);
 assert.throws(()=>berkanSelectionWeights(['V-055'],{}),/CRYVERN/);
});
