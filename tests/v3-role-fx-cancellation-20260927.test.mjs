import test,{after} from 'node:test';
import assert from 'node:assert/strict';
import {AnimatedSprite,Container,Texture,TextureSource} from 'pixi.js';
import {gsap} from 'gsap';
import {SkillEffectFX,SKILL_EFFECT_ASSETS} from '../preview/project-v-v3/source/battle/SkillEffectFX.js';

after(()=>gsap.ticker.sleep());
for(const kind of Object.keys(SKILL_EFFECT_ASSETS))test(`${kind}: cancelled atlas tolerates remaining GSAP callbacks and preserves shared textures`,()=>{
  const spec=SKILL_EFFECT_ASSETS[kind],source=new TextureSource({width:32,height:32});
  const textures=Array.from({length:spec.frameCount},()=>new Texture({source}));
  const display=new AnimatedSprite({textures,autoUpdate:false}),layer=new Container();
  const fx=new SkillEffectFX({kind,display,spec}).attach(layer),timeline=gsap.timeline({paused:true});
  try{
    fx.play(timeline,{at:.5});
    timeline.time(.5,false);
    assert.equal(display.currentFrame,spec.collisionFrame);
    assert.equal(display.visible,true);
    fx.release();fx.release();
    assert.equal(layer.children.length,0);
    assert.equal(display.destroyed,true);
    assert.doesNotThrow(()=>{timeline.time(.53,false);timeline.time(.1,false);timeline.time(timeline.duration(),false);});
    assert.equal(fx.display,null);
    assert.ok(textures.every(texture=>!texture.destroyed));
    assert.equal(source.destroyed,false);
    const next=new AnimatedSprite({textures,autoUpdate:false});
    next.gotoAndStop(spec.collisionFrame);
    assert.equal(next.currentFrame,spec.collisionFrame);
    next.destroy();
  }finally{
    timeline.kill();fx.release();layer.destroy();
    textures.forEach(texture=>texture.destroy(false));source.destroy();
  }
});
