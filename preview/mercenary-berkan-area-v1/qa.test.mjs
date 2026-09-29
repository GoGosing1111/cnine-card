import test,{after} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {createHash} from 'node:crypto';
import sharp from 'sharp';
import {Container,Sprite,Texture,TextureSource} from 'pixi.js';
import {gsap} from 'gsap';
import {makePlan,sample,AREA} from './skill.mjs';
import {BerkanAreaFX} from './source/BerkanAreaFX.js';
import {MERCENARY_CMS_SEED as seed} from '../../functions/_mercenary_cms_seed.js';
after(()=>gsap.ticker.sleep());
const root=new URL('./',import.meta.url),area=JSON.parse(await fs.readFile(new URL('manifest.json',root))),base=JSON.parse(await fs.readFile(new URL('../mercenary-berkan-sss-v1/manifest.json',root)));
const sha=b=>createHash('sha256').update(b).digest('hex');
test('new area sequence has sixteen unique RGBA frames with clear gutters and preserved source hash',async()=>{
 assert.equal(sha(await fs.readFile(new URL(area.source.file,root))),area.source.sha256);
 assert.equal(area.arrowRainArea.frameCount,16);assert.equal(new Set(area.arrowRainArea.frames.map(f=>f.sha256)).size,16);
 for(const f of area.arrowRainArea.frames){
  const bytes=await fs.readFile(new URL(f.file,root));assert.equal(sha(bytes),f.sha256);
  const {data,info}=await sharp(bytes).ensureAlpha().raw().toBuffer({resolveWithObject:true});let occupied=0,border=0;
  for(let y=0;y<info.height;y++)for(let x=0;x<info.width;x++){const a=data[(y*info.width+x)*4+3];if(a>0)occupied++;if((x===0||y===0||x===info.width-1||y===info.height-1)&&a>0)border++;}
  assert.equal(border,0);assert.ok(occupied>0&&occupied<info.width*info.height*.8);
 }
 assert.equal(sha(await fs.readFile(new URL('assets/arrow-rain-atlas-v1.png',root))),area.arrowRainArea.sha256);
 assert.equal(area.runtimeEnabled,true);assert.equal(AREA.runtimeEnabled,true);
 assert.deepEqual(seed.document.assignments.find(a=>a.code==='V-055').skillIds,['MS-055','MS-056'],'PVE connection approved on 2026-09-30');
});
test('new sequence changes authored shape from descent through impact and clears on stop or expiry',()=>{
 const p=makePlan();assert.deepEqual(p.contacts,[1.62]);
 const frames=[1.2,1.49,1.62,1.92,2.25,2.75,3.1].map(t=>sample(p,t).effects.find(e=>e.key==='arrowRainArea').frame);
 assert.equal(new Set(frames).size,7);assert.equal(sample(p,1.62).effects.find(e=>e.key==='impact').frame,4);
 for(const q of [makePlan({cancelAt:.85}),makePlan({targetLostAt:.85})])assert.equal(sample(q,1.62).effects.length,0);
 assert.equal(sample(p,3.4).effects.length,0);assert.equal(sample(makePlan({dodge:true}),1.62).effects.filter(e=>e.key==='impact').length,0);
});
test('real Pixi/GSAP five-target playback supports seek, pause, speed, cancellation and complete disposal',()=>{
 const manifest=structuredClone(base);manifest.effects.arrowRainArea=area.arrowRainArea;
 const source=new TextureSource({width:512,height:512}),sd=new Texture({source});
 const world=new Container(),combatLayer=new Container(),effectLayer=new Container();world.addChild(combatLayer,effectLayer);
 const actor=(id,x,y)=>{const root=new Container(),view=new Container(),sprite=new Sprite(sd);root.position.set(x,y);root.scale.set(.6);root.addChild(view);view.addChild(sprite);sprite.width=sprite.height=380;combatLayer.addChild(root);return {id,root,view,fullBodySprite:sprite,fullBodyHeight:380,neutralAvatarPose:{mainSprite:{}},animationController:{kill(){}}};};
 const merc=actor('merc',420,270),targets=Array.from({length:5},(_,i)=>actor('target'+i,1100+i%2*130,250+i*50));
 const engine={combatLayer,effectLayer,simpleTimelines:new Set(),sortCombatDepth(){}},assets={motion:{},effects:{}};
 for(const group of ['motion','effects'])for(const [key,spec]of Object.entries(manifest[group]))assets[group][key]=Array.from({length:spec.frameCount},()=>new Texture({source}));
 const fx=new BerkanAreaFX(engine,merc,targets,assets,manifest,makePlan());
 try{
  const visibleBody=()=>{const pose=fx.sample.pose,frame=manifest.motion[pose.key].frames[pose.frame],bounds=frame.sourceBounds;return merc.fullBodySprite.height/manifest.motion[pose.key].cellSize*(bounds.y1-bounds.y0+1);};
  const motionHeights=[0,.5,1.05,1.62,1.92,2.25,3.3,3.4].map(t=>{fx.seek(t);return visibleBody();});
  assert.ok(motionHeights.every(h=>Math.abs(h-motionHeights[0])<2),'the visible archer must not shrink or grow during the area cast');
  fx.play();assert.equal(engine.simpleTimelines.size,1);fx.pause();assert.equal(fx.playing,false);fx.setSpeed(1.25);assert.equal(fx.timeline.timeScale(),1.25);
  for(let i=0;i<100;i++){fx.seek(3.4*i/100);assert.ok(fx.used<=40);assert.equal(merc.root.x,420);}
  fx.seek(1.62);assert.equal(fx.activeFrames.filter(f=>f.key==='impact').length,5);assert.equal(fx.activeFrames.filter(f=>f.key==='arrowRainArea').length,1);
  fx.seek(3.4);assert.equal(fx.used,0);assert.ok(targets.every(t=>t.view.x===0));
  fx.setPlan(makePlan({targetLostAt:.85}));fx.seek(1.8);assert.equal(fx.used,0);
  fx.cancel();assert.equal(engine.simpleTimelines.size,0);assert.equal(fx.used,0);
 }finally{fx.destroy();fx.destroy();assert.equal(effectLayer.children.length,0);assert.equal(merc.view.children.length,1);assert.equal(source.destroyed,false);world.destroy({children:true});sd.destroy(false);source.destroy();}
});
