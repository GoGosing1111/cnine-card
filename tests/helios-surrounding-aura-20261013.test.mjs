import test from 'node:test';
import assert from 'node:assert/strict';
import {Container,Sprite,Texture} from 'pixi.js';
import {HeliosSurroundingAura} from '../preview/project-v-v3/source/battle/HeliosSurroundingAura.js';
import {resumeHeliosPlayback,cancelHeliosPlayback,clearHeliosActors,playHeliosBasic,playHeliosArea} from '../preview/project-v-v3/source/battle/HeliosCombatPlayback.js';
import {MODES} from '../preview/mercenary-limited-solar-sword-20261009-v1/motion.mjs';

function fixture(){
 const actor={id:'A:M',cardId:'V-999',hp:100,root:new Container(),view:new Container({sortableChildren:true}),fullBodySprite:new Sprite(Texture.EMPTY),animationController:{kill(){},setState(){}}};
 actor.root.addChild(actor.view);actor.fullBodySprite.zIndex=11;actor.view.addChild(actor.fullBodySprite);
 actor.fullBodySprite.anchor.set(.42,.92);actor.fullBodySprite.scale.set(.9);actor.fullBodySprite.position.set(7,-3);
 const engine={visible:true,mercenaryEpoch:1,playbackEpoch:1,simpleTimelines:new Set()};
 const aura=new HeliosSurroundingAura(engine,actor,{effects:{mantle:Array(12).fill(Texture.EMPTY),aura:Array(12).fill(Texture.EMPTY)}},312.389);
 const fx={aura,begin(){},cancel(){aura.hide();},destroy(){this.disposed=true;aura.destroy();}},state={engine,actor,fx,busy:false,stopped:false,ambient:null};
 engine.heliosStates=new Map([[actor,state]]);return {actor,engine,aura,state};
}
test('surrounding aura tracks mirrored poses without mutating body alpha, pose, HP, or current recoil',()=>{
 const f=fixture(),a=f.actor;
 try{
  a.view.scale.x=-1;a.view.position.set(12,-5);a.root.position.set(100,200);
  const before={texture:a.fullBodySprite.texture,x:a.fullBodySprite.x,y:a.fullBodySprite.y,alpha:a.fullBodySprite.alpha,tint:a.fullBodySprite.tint};
  for(const t of [0,.63,2.8,5.6]){
   f.aura.update(t);assert.equal(f.aura.root.visible,true);assert.equal(f.aura.diagnostics().behindBody,true);
   assert.deepEqual({texture:a.fullBodySprite.texture,x:a.fullBodySprite.x,y:a.fullBodySprite.y,alpha:a.fullBodySprite.alpha,tint:a.fullBodySprite.tint},before);
   assert.equal(a.fullBodySprite.alpha,1);assert.equal(a.hp,100);assert.equal(a.root.x,100);assert.equal(a.view.x,12);assert.equal(a.view.scale.x,-1);
   assert.equal(f.aura.outer.x,a.fullBodySprite.x);assert.equal(f.aura.outer.scale.x,a.fullBodySprite.scale.x);
   assert.equal(f.aura.outer.texture,a.fullBodySprite.texture);assert.equal(f.aura.mantle[0].alpha+f.aura.mantle[1].alpha,1);
  }
  a.hp=0;f.aura.update(1);assert.equal(f.aura.root.visible,false);
  a.hp=50;f.aura.update(2);assert.equal(f.aura.root.visible,true);
  f.engine.reducedMotion=true;f.aura.update(3);assert.equal(f.aura.time,0);
 }finally{clearHeliosActors(f.engine);a.root.destroy({children:true});}
});
test('one engine-owned aura clock survives resume, stops on cancel, and is released with actor textures intact',()=>{
 const f=fixture();
 try{
  f.engine.visible=false;resumeHeliosPlayback(f.engine);assert.equal(f.engine.simpleTimelines.size,1);assert.equal(f.state.ambient.instance.paused(),true);
  f.engine.visible=true;resumeHeliosPlayback(f.engine);resumeHeliosPlayback(f.engine);assert.equal(f.engine.simpleTimelines.size,1);assert.equal(f.aura.root.visible,true);
  cancelHeliosPlayback(f.engine);assert.equal(f.engine.simpleTimelines.size,0);assert.equal(f.aura.root.visible,false);
  resumeHeliosPlayback(f.engine);assert.equal(f.engine.simpleTimelines.size,1);
  clearHeliosActors(f.engine);assert.equal(f.engine.simpleTimelines.size,0);assert.equal(f.aura.destroyed,true);assert.equal(f.engine.heliosStates.size,0);assert.equal(f.actor.fullBodySprite.destroyed,false);
 }finally{clearHeliosActors(f.engine);f.actor.root.destroy({children:true});}
});
for(const mode of ['basic','area','cancel'])test('Helios '+mode+' keeps authoritative contacts and restores only a live aura',async()=>{
 const f=fixture(),e=f.engine,a=f.actor,targets=Array.from({length:3},(_,i)=>({id:'B:'+i,hp:100,root:{}}));let applications=0;
 Object.assign(e,{isAlive:t=>t.hp>0,combatantById:id=>id===a.id?a:targets.find(t=>t.id===id),eventHpPercent:(_t,hp)=>hp,syncTargetHp:(t,hp)=>t.hp=hp,syncTargetShield(){},showAccountBattleUnitDamage(){applications++;},
  async timeline(build,cleanup,_speed,options){
   const calls=[];build({to:(_clock,vars)=>{e.duration=vars.duration;},call:(fn,_args,at)=>calls.push({fn,at})});
   assert.equal(f.state.ambient,null);if(mode==='cancel')e.playbackEpoch++;
   for(const {fn,at}of calls){assert.equal(at,MODES[mode==='area'?'ultimate':'attack'].contacts[0]/2.6);fn();fn();}
   cleanup();return mode!=='cancel';
  }});
 try{
  resumeHeliosPlayback(e);
  if(mode==='area')await playHeliosArea(e,{type:'MERCENARY_HELIOS_AREA',battleMode:'PVE',actorId:a.id,hits:targets.flatMap(t=>[{targetId:t.id,damage:20,targetHpAfter:80,targetMaxHp:100},{targetId:t.id,damage:20,targetHpAfter:80,targetMaxHp:100}])});
  else await playHeliosBasic(e,{attacker:a,target:targets[0],damage:20,targetHp:80});
  assert.equal(applications,mode==='cancel'?0:mode==='area'?3:1);
  assert.equal(e.duration,MODES[mode==='area'?'ultimate':'attack'].duration/2.6);
  assert.equal(f.aura.root.visible,mode!=='cancel');assert.equal(e.simpleTimelines.size,mode==='cancel'?0:1);
 }finally{clearHeliosActors(e);a.root.destroy({children:true});}
});
