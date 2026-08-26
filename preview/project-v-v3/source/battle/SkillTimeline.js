import {Container, Graphics, Sprite, Text} from 'pixi.js';
import {gsap} from 'gsap';
import {CHARACTER_STATE, TEAM} from './BattleCharacter.js';
import {configureDamageText} from './ObjectPool.js';
import {normalizeSkillEffectKind, roleEffectProfile, SkillEffectFX, SKILL_EFFECT_KIND, triggerWhiteFlash} from './SkillEffectFX.js';

const clamp=(value,min,max)=>Math.max(min,Math.min(max,value));

function setCardCutInArt(sprite,width,height){
  // Tactical cut-ins show the original card art, not the battle SD sprite.
  // Contain the complete card inside the panel so special frames are not cut.
  const scale=Math.min((width*.96)/sprite.texture.width,(height*.96)/sprite.texture.height);
  sprite.anchor.set(.5);
  sprite.scale.set(scale);
  sprite.position.set(width/2,height/2);
}

function label(text,size,color=0xffffff,weight='800'){
  return new Text({text,style:{fontFamily:'Pretendard, SUIT, Arial, sans-serif',fontSize:size,fill:color,fontWeight:weight,letterSpacing:.5}});
}

function makeCutIn({texture,width,height,title,subtitle,accent}){
  const root=new Container();
  const portrait=height>width*1.1;
  const panelHeight=Math.min(680,height*(portrait?.72:.78));
  const panelWidth=Math.min(width*(portrait?.72:.3),panelHeight*.68);
  const panelX=0;
  const panelY=(height-panelHeight)/2;
  root.panelWidth=panelWidth;
  root.panelHeight=panelHeight;
  root.panelY=panelY;

  const back=new Graphics()
    .poly([panelX,panelY+24,panelX+20,panelY,panelWidth,panelY,panelWidth-14,panelY+panelHeight,panelX,panelY+panelHeight])
    .fill({color:0x05080d,alpha:.97})
    .stroke({width:2,color:accent,alpha:.86});
  root.addChild(back);

  const artHost=new Container();
  artHost.position.set(7,panelY+7);
  const art=new Sprite(texture);
  setCardCutInArt(art,panelWidth-14,panelHeight-14);
  const mask=new Graphics()
    .poly([0,20,16,0,panelWidth-14,0,panelWidth-28,panelHeight-14,0,panelHeight-14])
    .fill(0xffffff);
  artHost.addChild(art,mask);
  artHost.mask=mask;
  root.addChild(artHost);

  const footerHeight=Math.max(112,panelHeight*.2);
  const footer=new Graphics()
    .rect(0,panelY+panelHeight-footerHeight,panelWidth,footerHeight)
    .fill({color:0x03070c,alpha:.9});
  const sideRail=new Graphics()
    .rect(0,panelY+panelHeight-footerHeight,4,footerHeight)
    .fill({color:accent,alpha:.95});
  const topNotch=new Graphics()
    .poly([20,panelY,88,panelY,72,panelY+4,20,panelY+4])
    .fill({color:accent,alpha:.9});
  root.addChild(footer,sideRail,topNotch);

  const copyHost=new Container();
  copyHost.position.set(24,panelY+panelHeight-footerHeight+17);
  const eyebrow=label('전술 스킬 발동',portrait?14:12,accent,'900');
  const name=label(title,portrait?34:30,0xffffff,'900');
  name.position.y=20;
  const skill=label(subtitle,14,0xd9e9f4,'800');
  skill.position.y=61;
  copyHost.addChild(eyebrow,name,skill);
  root.addChild(copyHost);

  const footerLine=new Graphics()
    .rect(24,panelY+panelHeight-14,Math.max(72,panelWidth-52),2)
    .fill({color:accent,alpha:.7});
  root.addChild(footerLine);
  root.alpha=0;
  return root;
}

export class SkillTimeline{
  constructor({width,height,backgroundLayer,combatLayer,effectLayer,uiLayer,camera,pools,audio=null,ticker=null,playbackSpeed=1.3,reducedMotion=false}){
    this.width=width;
    this.height=height;
    this.backgroundLayer=backgroundLayer;
    this.combatLayer=combatLayer;
    this.effectLayer=effectLayer;
    this.uiLayer=uiLayer;
    this.camera=camera;
    this.pools=pools;
    this.audio=audio;
    this.ticker=ticker;
    this.playbackSpeed=Math.max(1,Number(playbackSpeed)||1.3);
    this.reducedMotion=reducedMotion;
    this.active=new Set();
  }

  play({attacker,target,enemies=[],damage,title,subtitle='전술 스킬 발동',accent=0xffd31a,critical=true,effectProfile='TACTICAL',effectKind=SKILL_EFFECT_KIND.ATTACK,targetClass='MONSTER',healing=0,hitCount=1,onImpact=()=>{}}){
    this.cancelAll();
    const roleKind=normalizeSkillEffectKind(effectKind);
    const roleProfile=roleEffectProfile(roleKind);
    const attackerView=attacker.root||attacker;
    const targetView=target.root||target;
    const origin={
      x:attacker.baseX??attackerView.baseX??attackerView.x,
      y:attacker.baseY??attackerView.baseY??attackerView.y,
      scale:attacker.restScale??attackerView.restScale??attackerView.scale.x,
      zIndex:attackerView.zIndex||0
    };
    const targetOrigin={x:targetView.x,y:targetView.y,tint:target._tint??target.view?.tint??targetView.tint??0xffffff};
    const targetPoint={x:targetView.x,y:targetView.y-178};
    const dashVector={x:targetView.x-origin.x,y:targetView.y-origin.y};
    const dashDistance=Math.max(1,Math.hypot(dashVector.x,dashVector.y));
    const dashStop=70;
    const dashPoint={
      x:targetView.x-dashVector.x/dashDistance*dashStop,
      y:targetView.y-dashVector.y/dashDistance*dashStop
    };
    const gatherPoint={
      x:origin.x-dashVector.x/dashDistance*15,
      y:origin.y-15
    };
    const dashScale=attacker.getPerspectiveScale?.(dashPoint.y)??origin.scale*1.12;
    const cutInTexture=attacker.cutInTexture||attacker.artTexture||attacker.view?.texture;
    const attackerName=title||attacker.name||attacker.data?.name||'전투원';
    const cutIn=makeCutIn({texture:cutInTexture,width:this.width,height:this.height,title:attackerName,subtitle,accent});
    cutIn.position.set(-cutIn.panelWidth-140,0);
    const cutInX=(this.width-cutIn.panelWidth)/2;
    this.effectLayer.addChild(cutIn);

    const damageLabel=this.pools.damage.acquire();
    configureDamageText(damageLabel,{kind:roleKind,damage,critical,healing,hitCount,compact:this.height>this.width});
    damageLabel.position.set(targetPoint.x,targetView.y-350);
    if(roleKind===SKILL_EFFECT_KIND.HP&&damageLabel.healLabel){
      damageLabel.healLabel.position.set(origin.x-targetPoint.x,origin.y-165-(targetView.y-350));
    }
    damageLabel.alpha=0;
    damageLabel.visible=true;
    this.uiLayer.addChild(damageLabel);

    const bossTarget=String(targetClass).toUpperCase()==='BOSS';
    const effectPoint=roleKind===SKILL_EFFECT_KIND.HP?{x:origin.x,y:origin.y-178}:targetPoint;
    const skillEffect=SkillEffectFX.create({
      kind:roleKind,
      x:effectPoint.x,
      y:effectPoint.y,
      scale:(this.height>this.width?.78:1)*(bossTarget?1.12:1)
    }).attach(this.effectLayer);

    const enemyRoots=enemies.map(enemy=>enemy.root||enemy).filter(Boolean);
    const enemyAlpha=enemyRoots.map(view=>view.alpha);
    const setState=(actor,state)=>actor.setState?.(state);
    const setTint=(actor,value)=>{
      if(actor.setTint)actor.setTint(value);
      else if(actor.view)actor.view.tint=value;
      else actor.tint=value;
    };

    let completed=false;
    let hitStopTimer=null;
    let whiteFlashHandle=null;
    const normalTickerSpeed=this.ticker?.speed??1;
    const cleanup=()=>{
      if(completed)return;
      completed=true;
      if(hitStopTimer){
        clearTimeout(hitStopTimer);
        hitStopTimer=null;
      }
      if(this.ticker)this.ticker.speed=normalTickerSpeed;
      attackerView.position.set(origin.x,origin.y);
      attackerView.scale.set(origin.scale);
      attackerView.rotation=0;
      attackerView.zIndex=origin.zIndex;
      targetView.position.set(targetOrigin.x,targetOrigin.y);
      setTint(target,targetOrigin.tint);
      setState(attacker,CHARACTER_STATE.IDLE);
      setState(target,target.hp<=0?CHARACTER_STATE.DEAD:CHARACTER_STATE.IDLE);
      enemyRoots.forEach((view,index)=>{view.alpha=enemyAlpha[index]});
      this.backgroundLayer.alpha=1;
      this.camera.reset(true);
      cutIn.destroy({children:true});
      whiteFlashHandle?.release();
      skillEffect.release();
      this.pools.damage.release(damageLabel);
    };

    return new Promise(resolve=>{
      const settle=value=>{
        if(!this.active.delete(entry))return;
        cleanup();
        resolve(value);
      };
      const timeline=gsap.timeline({paused:true,defaults:{overwrite:'auto'},onComplete:()=>settle(true),onInterrupt:()=>settle(false)});
      const entry={timeline,settle};
      this.active.add(entry);
      const speed=this.reducedMotion?6:this.playbackSpeed;
      timeline.timeScale(speed);
      const startHitStop=()=>{
        if(this.reducedMotion)return;
        if(this.ticker)this.ticker.speed=.2;
        timeline.pause();
        hitStopTimer=setTimeout(()=>{
          hitStopTimer=null;
          if(this.ticker)this.ticker.speed=normalTickerSpeed;
          if(this.active.has(entry))timeline.resume();
        },Math.round(roleProfile.hitStop/this.playbackSpeed));
      };

      // Keep the original-card cut-in readable through the dash. At 1.3x this
      // remains on screen for about 400ms instead of flashing by in one frame.
      timeline.call(()=>{
        attackerView.zIndex=1000;
        this.combatLayer.sortChildren();
        this.audio?.scheduleImpact(roleKind,{impactAt:.35,playbackSpeed:speed,critical,boss:bossTarget});
      },[],0);
      timeline.to(this.backgroundLayer,{alpha:.4,duration:.12,ease:'power2.out'},0);
      enemyRoots.forEach(view=>timeline.to(view,{alpha:.4,duration:.12,ease:'power2.out'},0));
      timeline.to(cutIn,{x:cutInX,alpha:1,duration:.16,ease:'back.out(1.45)'},0);
      timeline.to(cutIn,{x:cutInX+8,duration:.24,ease:'none'},.16);
      timeline.to(cutIn,{x:this.width+80,alpha:0,duration:.12,ease:'power4.in'},.4);
      timeline.to(attackerView,{x:gatherPoint.x,y:gatherPoint.y,duration:.2,ease:'power2.inOut'},0);
      timeline.to(attackerView.scale,{x:origin.scale*1.04,y:origin.scale*.9,duration:.2,ease:'power2.inOut'},0);

      // 200–350ms: high-speed isometric dash to 70px in front of the target.
      timeline.call(()=>setState(attacker,CHARACTER_STATE.MOVE),[],.2);
      timeline.to(attackerView,{
        x:dashPoint.x,
        y:dashPoint.y,
        rotation:0,
        duration:.15,
        ease:'power4.in'
      },.2);
      timeline.to(attackerView.scale,{x:dashScale*1.06,y:dashScale*1.06,duration:.15,ease:'power4.in'},.2);
      this.camera.addZoom(timeline,{focus:targetPoint,scale:1.065,inDuration:.12,hold:.14,outDuration:.24,at:.18});

      // 350ms peak: server-authoritative collision plus the new role atlas.
      timeline.call(()=>{
        setState(attacker,CHARACTER_STATE.ATTACK);
        setState(target,CHARACTER_STATE.HIT);
        setTint(target,accent);
        whiteFlashHandle?.release();
        whiteFlashHandle=triggerWhiteFlash(target,{durationMs:Math.round(50/this.playbackSpeed)});
        onImpact();
      },[],.35);
      skillEffect.play(timeline,{at:.35,playbackSpeed:speed});
      this.camera.addShake(timeline,{intensity:bossTarget?roleProfile.shake*1.28:roleProfile.shake,duration:bossTarget?.32:.24,rotation:roleKind===SKILL_EFFECT_KIND.DEFENSE?.006:.01,at:.35});
      timeline.call(startHitStop,[],.355);

      // The intact sprite controller handles the 25px diagonal knockback.
      const knockback=attacker.team===TEAM.ALLY?30:-30;
      if(!target.avatarMode){
        timeline.to(targetView,{x:targetOrigin.x+knockback,y:targetOrigin.y-25,duration:.055,ease:'power4.out'},.35);
        timeline.to(targetView,{x:targetOrigin.x,y:targetOrigin.y,duration:.23,ease:'back.out(1.5)'},.405);
      }
      timeline.fromTo(damageLabel,{alpha:0,y:targetView.y-342},{alpha:1,y:targetView.y-372,duration:.16,ease:'back.out(2.4)'},.35);
      timeline.fromTo(damageLabel.scale,{x:.45,y:.45},{x:1.18,y:1.18,duration:.16,ease:'back.out(2.4)'},.35);
      timeline.to(damageLabel,{y:targetView.y-402,alpha:0,scale:1,duration:.25,ease:'power2.in'},.51);
      timeline.call(()=>{
        setTint(target,targetOrigin.tint);
        setState(target,target.hp<=0?CHARACTER_STATE.DEAD:CHARACTER_STATE.IDLE);
      },[],.63);

      // 440–700ms: spring return to the exact formation tile.
      timeline.call(()=>setState(attacker,CHARACTER_STATE.MOVE),[],.44);
      timeline.to(attackerView,{x:origin.x,y:origin.y,rotation:0,duration:.26,ease:'back.out(1.35)'},.44);
      timeline.to(attackerView.scale,{x:origin.scale,y:origin.scale,duration:.26,ease:'back.out(1.35)'},.44);
      timeline.to(this.backgroundLayer,{alpha:1,duration:.24,ease:'power2.inOut'},.46);
      enemyRoots.forEach((view,index)=>timeline.to(view,{alpha:enemyAlpha[index],duration:.24,ease:'power2.inOut'},.46));
      timeline.call(()=>{
        setState(attacker,CHARACTER_STATE.IDLE);
        attackerView.zIndex=origin.zIndex;
        this.combatLayer.sortChildren();
      },[],.72);
      timeline.call(()=>settle(true),[],.76);
      timeline.play(0);
    });
  }

  cancelAll(){
    [...this.active].forEach(entry=>{
      entry.timeline.kill();
      entry.settle(false);
    });
  }

  destroy(){
    this.cancelAll();
  }
}
