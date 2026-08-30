import {ColorMatrixFilter, Container, Graphics, Text} from 'pixi.js';
import {gsap} from 'gsap';
import {CameraController} from '../../project-v-v3/source/battle/CameraController.js';
import {EventEffectFX, EVENT_EFFECTS} from './EventEffectFX.js';

function flashTarget(actor,durationMs=50){
  const sprite=actor?.sprite;
  if(!sprite)return {release(){}};
  const filter=new ColorMatrixFilter();
  filter.matrix=new Float32Array([0,0,0,0,1,0,0,0,0,1,0,0,0,0,1,0,0,0,1,0]);
  const previous=Array.isArray(sprite.filters)?sprite.filters.filter(Boolean):[];
  sprite.filters=[...previous,filter];
  let timer=0;
  let active=true;
  const release=()=>{
    if(!active)return;
    active=false;
    clearTimeout(timer);
    sprite.filters=(Array.isArray(sprite.filters)?sprite.filters:[]).filter(item=>item!==filter);
    filter.destroy?.();
  };
  timer=setTimeout(release,Math.max(0,durationMs));
  return {release};
}

function uiText(text,{size=28,color=0xffffff,weight='900',tracking=1}={}){
  return new Text({text,style:{fontFamily:'Pretendard, SUIT, Arial, sans-serif',fontSize:size,fill:color,fontWeight:weight,letterSpacing:tracking,align:'center'}});
}

function makeEventTitle(profile,width){
  const root=new Container({label:'EventTitle'});
  const rail=new Graphics().rect(0,0,5,74).fill({color:profile.accent,alpha:.95});
  const eyebrow=uiText(`EVENT ${profile.index} · ${profile.label}`,{size:13,color:profile.accent,tracking:2.4});
  const title=uiText(profile.title,{size:30,color:0xffffff,tracking:1.4});
  const korean=uiText(profile.labelKo,{size:14,color:0xa9c0ce,tracking:.4});
  eyebrow.anchor.set(0,.5);title.anchor.set(0,.5);korean.anchor.set(0,.5);
  eyebrow.position.set(22,13);title.position.set(22,40);korean.position.set(24,66);
  root.addChild(rail,eyebrow,title,korean);
  root.position.set(width*.075,122);
  root.alpha=0;
  return root;
}

function makeDamageReadout(profile,text){
  const root=new Container({label:'EventDamageReadout'});
  const value=uiText(text,{size:profile.id==='boss-ultimate'?58:48,color:profile.id==='revive'?0xc7ffe2:0xffffff,tracking:1.2});
  const tag=uiText(profile.id==='dodge'?'NO DAMAGE':profile.id==='revive'?'COMBAT RESTORED':'DIRECT IMPACT',{size:11,color:profile.accent,tracking:2.1});
  value.anchor.set(.5);tag.anchor.set(.5);
  tag.position.y=42;
  root.addChild(value,tag);
  root.alpha=0;
  return root;
}

export class EventTimeline{
  constructor({width,height,stage,backgroundLayer,combatLayer,effectLayer,uiLayer,ally,enemy,app,audio,onReadout=()=>{},onFrame=()=>{}}){
    this.width=width;
    this.height=height;
    this.stage=stage;
    this.backgroundLayer=backgroundLayer;
    this.combatLayer=combatLayer;
    this.effectLayer=effectLayer;
    this.uiLayer=uiLayer;
    this.ally=ally;
    this.enemy=enemy;
    this.app=app;
    this.audio=audio;
    this.onReadout=onReadout;
    this.onFrame=onFrame;
    this.camera=new CameraController(stage,{width,height});
    this.active=null;
    this.playbackSpeed=1.3;
    this.reducedMotion=matchMedia('(prefers-reduced-motion: reduce)').matches;
  }

  resetActor(actor){
    const base=actor.base;
    actor.root.position.set(base.x,base.y);
    actor.root.scale.set(base.scale);
    actor.root.rotation=0;
    actor.root.alpha=1;
    actor.root.visible=true;
    actor.sprite.tint=0xffffff;
    actor.sprite.filters=[];
    actor.hpFill.scale.x=1;
  }

  reset(){
    this.resetActor(this.ally);
    this.resetActor(this.enemy);
    this.backgroundLayer.alpha=1;
    this.combatLayer.alpha=1;
    this.app.ticker.speed=1;
    this.camera.reset(true);
    this.onFrame(0);
  }

  cancel(){
    if(!this.active)return;
    const active=this.active;
    this.active=null;
    active.whiteFlash?.release();
    active.effect?.release();
    active.timeline.kill();
    clearTimeout(active.hitStopTimer);
    active.title?.destroy({children:true});
    active.readout?.destroy({children:true});
    this.audio?.stopAll();
    this.reset();
    active.resolve(false);
  }

  async play(id){
    this.cancel();
    this.reset();
    const profile=EVENT_EFFECTS[id];
    if(!profile)throw new Error(`UNKNOWN_EVENT_EFFECT:${id}`);
    const isBoss=id==='boss-ultimate';
    const isDodge=id==='dodge';
    const isRevive=id==='revive';
    const attacker=isBoss||isDodge?this.enemy:this.ally;
    const target=isBoss||isDodge?this.ally:this.enemy;
    const attackerBase=attacker.base;
    const targetBase=target.base;
    const effectPoint=isRevive
      ?{x:this.ally.base.x,y:this.ally.base.y-180}
      :{x:target.base.x+(isBoss?-18:0),y:target.base.y-188};
    const effect=EventEffectFX.create({id,x:effectPoint.x,y:effectPoint.y,scale:isBoss?1.04:1}).attach(this.effectLayer);
    const title=makeEventTitle(profile,this.width);
    const readout=makeDamageReadout(profile,isDodge?'EVADE':isRevive?'+ 1':isBoss?'1,284,900':'428,650');
    readout.position.set(effectPoint.x,effectPoint.y-166);
    this.uiLayer.addChild(title,readout);

    if(isRevive){
      this.ally.root.y+=24;
      this.ally.root.rotation=-.08;
      this.ally.root.alpha=.36;
      this.ally.hpFill.scale.x=.03;
    }

    const durationScale=this.reducedMotion?5.5:this.playbackSpeed;
    return new Promise(resolve=>{
      const timeline=gsap.timeline({paused:true,defaults:{overwrite:'auto'}});
      const active={timeline,effect,title,readout,resolve,whiteFlash:null,hitStopTimer:0};
      this.active=active;
      const finish=value=>{
        if(this.active!==active)return;
        this.active=null;
        active.whiteFlash?.release();
        effect.release();
        title.destroy({children:true});
        readout.destroy({children:true});
        this.reset();
        this.onReadout('READY');
        resolve(value);
      };
      timeline.eventCallback('onComplete',()=>finish(true));
      timeline.eventCallback('onInterrupt',()=>finish(false));
      timeline.timeScale(durationScale);

      const startHitStop=()=>{
        if(this.reducedMotion)return;
        this.app.ticker.speed=.18;
        timeline.pause();
        active.hitStopTimer=setTimeout(()=>{
          active.hitStopTimer=0;
          this.app.ticker.speed=1;
          if(this.active===active)timeline.resume();
        },Math.round(profile.hitStop/durationScale));
      };
      const impact=()=>{
        this.onReadout(isDodge?'EVADE CONFIRMED':isRevive?'LIFE SIGNAL RESTORED':'IMPACT CONFIRMED');
        if(!isDodge){
          active.whiteFlash?.release();
          active.whiteFlash=flashTarget(target,Math.round(50/durationScale));
        }
        if(!isDodge&&!isRevive)target.hpFill.scale.x=isBoss?.42:.68;
      };

      timeline.call(()=>{
        this.onReadout(`${profile.label} · PLAYING`);
        this.audio?.schedule(id,{impactAt:profile.impactAt,playbackSpeed:durationScale,pan:isBoss?-.12:.12});
      },[],0);
      timeline.to(title,{alpha:1,duration:.12,ease:'power2.out'},0);
      timeline.to(title,{x:title.x+10,duration:.28,ease:'none'},.12);
      timeline.to(title,{alpha:0,x:title.x+45,duration:.12,ease:'power3.in'},.4);

      if(id==='critical'){
        timeline.to(attacker.root,{x:attackerBase.x-22,y:attackerBase.y-9,duration:.13,ease:'power2.inOut'},.02);
        timeline.to(attacker.root.scale,{x:attackerBase.scale*1.04,y:attackerBase.scale*.92,duration:.13,ease:'power2.inOut'},.02);
        timeline.to(attacker.root,{x:targetBase.x-92,y:targetBase.y+5,duration:.25,ease:'power4.in'},.17);
        timeline.to(attacker.root.scale,{x:attackerBase.scale*1.12,y:attackerBase.scale*1.12,duration:.25,ease:'power4.in'},.17);
      }else if(id==='counter'){
        timeline.to(attacker.root,{x:targetBase.x-84,y:targetBase.y+5,duration:.25,ease:'power4.in'},.08);
        timeline.to(target.root,{x:targetBase.x-25,y:targetBase.y-8,duration:.13,ease:'power3.out'},.31);
        timeline.to(attacker.root,{x:attackerBase.x+65,y:attackerBase.y-18,rotation:-.035,duration:.11,ease:'power4.out'},profile.impactAt);
      }else if(id==='ultimate'){
        timeline.to(this.backgroundLayer,{alpha:.42,duration:.2,ease:'power2.out'},0);
        timeline.to(attacker.root,{y:attackerBase.y-22,duration:.24,ease:'power2.out'},.02);
        timeline.to(attacker.root.scale,{x:attackerBase.scale*1.08,y:attackerBase.scale*1.08,duration:.24,ease:'power2.out'},.02);
        timeline.to(attacker.root,{x:targetBase.x-86,y:targetBase.y,duration:.19,ease:'power4.in'},.3);
      }else if(id==='boss-ultimate'){
        timeline.to(this.backgroundLayer,{alpha:.25,duration:.24,ease:'power2.out'},0);
        timeline.to(attacker.root,{y:attackerBase.y-52,duration:.32,ease:'power2.out'},.02);
        timeline.to(attacker.root.scale,{x:attackerBase.scale*1.14,y:attackerBase.scale*1.14,duration:.32,ease:'power2.out'},.02);
        timeline.to(attacker.root,{x:attackerBase.x-38,duration:.16,ease:'power3.in'},.38);
      }else if(id==='dodge'){
        timeline.to(attacker.root,{x:targetBase.x+82,y:targetBase.y,duration:.3,ease:'power4.in'},.02);
        timeline.to(target.root,{x:targetBase.x-145,y:targetBase.y-62,alpha:.42,duration:.085,ease:'power4.out'},profile.impactAt-.035);
        timeline.to(target.root,{x:targetBase.x-182,y:targetBase.y-34,alpha:1,duration:.15,ease:'power2.out'},profile.impactAt+.05);
      }else if(id==='revive'){
        timeline.to(this.backgroundLayer,{alpha:.54,duration:.2,ease:'power2.out'},0);
        timeline.to(this.ally.root,{alpha:.72,y:this.ally.base.y-10,rotation:0,duration:.34,ease:'power2.out'},.15);
        timeline.to(this.ally.root.scale,{x:this.ally.base.scale*1.08,y:this.ally.base.scale*1.08,duration:.34,ease:'power2.out'},.15);
      }

      this.camera.addZoom(timeline,{focus:effectPoint,scale:isBoss?1.09:isRevive?1.055:1.07,inDuration:.15,hold:.16,outDuration:.27,at:Math.max(.08,profile.impactAt-.23)});
      effect.play(timeline,{impactAt:profile.impactAt,onFrame:frame=>this.onFrame(frame)});
      timeline.call(impact,[],profile.impactAt);
      this.camera.addShake(timeline,{intensity:profile.shake,duration:isBoss?.38:isDodge?.16:.27,rotation:isBoss?.012:.008,at:profile.impactAt});
      timeline.call(startHitStop,[],profile.impactAt+.005);
      timeline.fromTo(readout,{alpha:0,y:readout.y+12},{alpha:1,y:readout.y-24,duration:.14,ease:'back.out(2.2)'},profile.impactAt);
      timeline.fromTo(readout.scale,{x:.48,y:.48},{x:1.14,y:1.14,duration:.14,ease:'back.out(2.1)'},profile.impactAt);
      timeline.to(readout,{alpha:0,y:readout.y-60,duration:.28,ease:'power2.in'},profile.impactAt+.22);
      timeline.to(readout.scale,{x:1,y:1,duration:.28,ease:'power2.in'},profile.impactAt+.22);

      if(!isRevive){
        if(!isDodge){
          timeline.to(target.root,{x:targetBase.x+(isBoss?-42:34),y:targetBase.y-20,duration:.06,ease:'power4.out'},profile.impactAt);
          timeline.to(target.root,{x:targetBase.x,y:targetBase.y,duration:.24,ease:'back.out(1.55)'},profile.impactAt+.06);
        }
        timeline.to(attacker.root,{x:attackerBase.x,y:attackerBase.y,rotation:0,duration:.3,ease:'back.out(1.3)'},profile.impactAt+.24);
        timeline.to(attacker.root.scale,{x:attackerBase.scale,y:attackerBase.scale,duration:.3,ease:'back.out(1.3)'},profile.impactAt+.24);
      }else{
        timeline.to(this.ally.hpFill.scale,{x:1,duration:.34,ease:'power2.out'},profile.impactAt);
        timeline.to(this.ally.root,{alpha:1,y:this.ally.base.y,rotation:0,duration:.26,ease:'back.out(1.6)'},profile.impactAt);
        timeline.to(this.ally.root.scale,{x:this.ally.base.scale,y:this.ally.base.scale,duration:.3,ease:'back.out(1.5)'},profile.impactAt+.12);
      }
      timeline.to(this.backgroundLayer,{alpha:1,duration:.3,ease:'power2.inOut'},profile.impactAt+.32);
      timeline.call(()=>finish(true),[],Math.max(profile.impactAt+.88,1.16));
      timeline.play(0);
    });
  }

  destroy(){
    this.cancel();
    this.camera.destroy();
  }
}
