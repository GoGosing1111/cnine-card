import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {Container,Sprite,Texture,TextureSource} from 'pixi.js';
import {gsap} from 'gsap';
import {BattleAnimation} from '../preview/project-v-v3/source/battle/BattleAnimation.js';
import {BattleCharacter} from '../preview/project-v-v3/source/battle/BattleCharacter.js';
import {IceDualSwordFX} from '../preview/mercenary-ice-crystal-dual-sword-v1/source/IceDualSwordFX.js';
import {makePlan} from '../preview/mercenary-ice-crystal-dual-sword-v1/skill.mjs';

const manifest=JSON.parse(fs.readFileSync(new URL('../preview/mercenary-ice-crystal-dual-sword-v1/manifest.json',import.meta.url),'utf8'));

function fixture(){
 const world=new Container(),combatLayer=new Container(),effectLayer=new Container();
 world.addChild(combatLayer,effectLayer);
 const sources=[new TextureSource({width:1254,height:1254}),new TextureSource({width:768,height:768}),new TextureSource({width:512,height:512})];
 const idle=new Texture({source:sources[0]}),root=new Container(),view=new Container(),sprite=new Sprite(idle);
 combatLayer.addChild(root);root.addChild(view);view.addChild(sprite);
 root.position.set(400,500);root.scale.set(.6);sprite.anchor.set(.5,.9);sprite.width=380;sprite.height=380;
 const actor={root,view,baseX:400,baseY:500,fullBodyHeight:380,fullBodySprite:sprite,mainSprite:sprite,fullSpriteMode:true,team:'ALLY',
  neutralAvatarPose:{x:0,y:0,rotation:0,alpha:1,scaleX:1,scaleY:1,mainSprite:{x:0,y:0,rotation:0,alpha:1,scaleX:sprite.scale.x,scaleY:sprite.scale.y}},
  restoreNeutralAvatarPose:BattleCharacter.prototype.restoreNeutralAvatarPose};
 actor.animationController=new BattleAnimation(actor);
 const engine={effectLayer,combatLayer,simpleTimelines:new Set(),allies:[],scene:{width:1600,height:900},sortCombatDepth(){}};
 const assets={motion:{},effects:{},flash:Texture.EMPTY,smoke:Texture.EMPTY};
 for(const [key,spec] of Object.entries(manifest.motion))assets.motion[key]=Array.from({length:spec.frameCount},()=>new Texture({source:sources[1]}));
 for(const [key,spec] of Object.entries(manifest.effects))assets.effects[key]=Array.from({length:spec.frameCount},()=>new Texture({source:sources[2]}));
 const fx=new IceDualSwordFX(engine,actor,[actor],assets,manifest,makePlan({mode:'guard'}),()=>{},{authoritative:true});
 return {actor,sprite,fx,idle,dispose(){fx.destroy();actor.animationController.destroy();world.destroy({children:true});idle.destroy(false);sources.forEach(s=>s.destroy());gsap.ticker.sleep();}};
}

for(const state of ['IDLE','HIT'])test(`Cryvern guard-to-idle does not inherit the atlas scale from a competing ${state} animation`,()=>{
 const f=fixture();
 try{
  const idleHeight=f.sprite.height,idleWidth=f.sprite.width;
  f.fx.render(.74);
  assert.notEqual(f.sprite.texture,f.idle);
  // Another attack's hit/cleanup may start the shared animation while the
  // reactive shield animation is still using the 768px authored atlas.
  f.actor.animationController.setState(state);
  f.actor.animationController.timeline.pause().time(.02);
  f.fx.render(1.96); // Guard pose ends and the 1254px original SD returns.
  f.actor.animationController.timeline?.time(.7);
  assert.ok(Math.abs(f.sprite.height-idleHeight)<.001,`body grew from ${idleHeight} to ${f.sprite.height}`);
  assert.ok(Math.abs(f.sprite.width-idleWidth)<.001,`body widened from ${idleWidth} to ${f.sprite.width}`);
  assert.ok(!f.actor.animationController.timeline,'obsolete shared pose tween must be stopped');
  assert.equal(f.fx.outer.texture,f.idle);
  assert.equal(f.fx.outer.scale.y,f.sprite.scale.y,'aura must follow the restored body');
 }finally{f.dispose();}
});

test('authored Cryvern motion owns body transforms until completion, then normal idle can resume',()=>{
 const f=fixture();
 try{
  for(const [mode,at] of [['guard',.74],['attack',.53],['cross',.68],['cyclone',1.26],['ultimate',2.62]]){
   f.fx.plan=makePlan({mode});f.fx.render(at);
   const expectedHeight=f.sprite.height,expectedWidth=f.sprite.width;
   f.actor.animationController.setState('HIT');
   f.fx.render(at+.01);
   f.actor.animationController.timeline?.time(.2);
   assert.ok(!f.actor.animationController.timeline,mode+' must retain authored body ownership');
   assert.ok(Math.abs(f.sprite.height-expectedHeight)<.001,mode+' height');
   assert.ok(Math.abs(f.sprite.width-expectedWidth)<.001,mode+' width');
   f.fx.cancel();
   assert.equal(f.sprite.texture,f.idle);assert.equal(f.sprite.height,380);assert.equal(f.sprite.width,380);
  }
  f.actor.animationController.setState('IDLE');
  const idleTimeline=f.actor.animationController.timeline;
  f.fx.render(0);
  assert.equal(f.actor.animationController.timeline,idleTimeline,'normal idle must remain available outside authored motion');
  idleTimeline.pause().time(.7);
  assert.ok(f.sprite.height<=380&&f.sprite.width<=380*1.021);
 }finally{f.dispose();}
});
