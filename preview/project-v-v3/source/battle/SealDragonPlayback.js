import {Assets,Texture,Rectangle,Sprite} from 'pixi.js';
import {gsap} from 'gsap';
import {configureDamageText} from './ObjectPool.js';

const ROOT='/assets/ui/seal-battle/dragon-20261022';
let cached=null;
export function prepareSealDragon(){
  if(!cached)cached=Promise.all([Assets.load(`${ROOT}/motion.webp`),fetch(`${ROOT}/motion.json`).then(r=>{if(!r.ok)throw Error('용 보스 동작 파일을 불러오지 못했습니다.');return r.json();})])
    .then(([sheet,atlas])=>{
      const frames={};
      for(const [name,{frame}] of Object.entries(atlas.frames))frames[name]=new Texture({source:sheet.source,frame:new Rectangle(frame.x,frame.y,frame.w,frame.h)});
      return {frames,atlas};
    }).catch(error=>{cached=null;throw error;});
  return cached;
}

// Fixed canvas preserves the painted anatomy; the shared GSAP clock controls
// texture frames, pause/seek/rate and impacts. No body squash/stretch is used.
class SealDragonAnimation{
  constructor(actor,assets,reducedMotion){this.actor=actor;this.assets=assets;this.reducedMotion=reducedMotion;this.timeline=null;this.casting=false;}
  frame(sequence,progress){
    const names=this.assets.atlas.sequences[sequence];
    const index=Math.min(names.length-1,Math.max(0,Math.floor(progress*names.length)));
    this.actor.fullBodySprite.texture=this.assets.frames[names[index]];
    this.currentFrame=names[index];
  }
  kill(){this.timeline?.kill();this.timeline=null;}
  setState(state){
    if(this.casting&&state!=='DEAD')return;
    this.kill();
    const sequence=state==='DEAD'?'death':state==='HIT'?'hit':'idle';
    const cursor={p:0};this.frame(sequence,0);
    if(this.reducedMotion){this.frame(sequence,sequence==='death'?1:0);return;}
    this.timeline=gsap.timeline({repeat:sequence==='idle'?-1:0}).to(cursor,{p:1,duration:sequence==='idle'?1.8:sequence==='death'?.6:.32,ease:'none',onUpdate:()=>this.frame(sequence,cursor.p)});
  }
  cast(timeline){
    this.kill();this.casting=true;
    const cursor={p:0};this.frame('breath',0);
    timeline.to(cursor,{p:1,duration:1.08,ease:'none',onUpdate:()=>this.frame('breath',cursor.p)},0);
  }
  finish(){this.casting=false;this.setState(this.actor.hp<=0?'DEAD':'IDLE');}
  destroy(){this.kill();this.casting=false;}
}

export async function attachSealDragon(actor,{reducedMotion=false}={}){
  const assets=await prepareSealDragon();
  actor.useFullBodySprite(assets.frames['idle-0'],340);
  actor.artFacing=-1;actor.applyFacing();
  actor.sealDragon=new SealDragonAnimation(actor,assets,reducedMotion);
  actor.setAnimationAdapter(actor.sealDragon);
  return actor.sealDragon;
}

export function playSealDragonBreath(engine,actor,victim,{damage=0,targetHp=null,targetShield=null,critical=false,onImpact=()=>{}}={}){
  engine.settlePendingTails([actor,victim]);
  const animation=actor.sealDragon;
  const effect=new Sprite(animation.assets.frames['breath-fx-0']);
  effect.anchor.set(.94,.5);effect.visible=false;engine.effectLayer.addChild(effect);
  const label=engine.pools.damage.acquire();
  configureDamageText(label,{kind:'ATTACK',damage,critical,healing:0,hitCount:1,compact:engine.mobile});
  label.visible=true;label.alpha=0;engine.uiLayer.addChild(label);
  const updatePosition=()=>{
    const body=actor.fullBodySprite,texture=body.texture;
    const mouth=engine.effectLayer.toLocal(body.toGlobal({x:(.12-body.anchor.x)*texture.width,y:(.39-body.anchor.y)*texture.height}));
    const target=engine.effectLayer.toLocal(victim.root.toGlobal({x:0,y:-145}));
    const dx=target.x-mouth.x,dy=target.y-mouth.y,distance=Math.max(1,Math.hypot(dx,dy));
    effect.position.copyFrom(mouth);effect.rotation=Math.atan2(dy,dx)-Math.PI;
    effect.scale.set(distance/(512*.84),Math.min(.65,distance/900));
    label.position.set(victim.root.x,Math.max(165,victim.root.y-290));
  };
  const cleanup=()=>{effect.destroy();engine.pools.damage.release(label);animation.finish();victim.setState(victim.hp<=0?'DEAD':'IDLE');};
  const speed=engine.actionPlaybackSpeed({paced:false}),cursor={p:0};
  engine.updateStatus(`${actor.name} · 봉인룡의 청염`);
  return engine.timeline(timeline=>{
    animation.cast(timeline);
    timeline.call(()=>{effect.visible=true;updatePosition();},[],.34);
    timeline.to(cursor,{p:1,duration:.58,ease:'none',onUpdate:()=>{const names=animation.assets.atlas.sequences.fx;effect.texture=animation.assets.frames[names[Math.min(3,Math.floor(cursor.p*4))]];updatePosition();}},.34);
    timeline.call(()=>{
      victim.setState('HIT');
      if(targetHp!==null)engine.syncTargetHp(victim,targetHp);
      if(targetShield!==null)engine.syncTargetShield(victim,targetShield);
      onImpact(victim);
      engine.audio?.scheduleImpact('ATTACK',{impactAt:0,playbackSpeed:speed,boss:true});
    },[],.64);
    timeline.to(label,{alpha:1,duration:.08},.64).to(label,{alpha:0,duration:.22},.96);
    if(!engine.reducedMotion)engine.camera.addShake(timeline,{intensity:.65,duration:.2,rotation:.002,at:.64});
  },cleanup,speed);
}
