import {AnimatedSprite, Container, Graphics, Sprite, Text} from 'pixi.js';
import {gsap} from 'gsap';
import {CHARACTER_STATE, TEAM} from './BattleCharacter.js';
import {configureDamageText} from './ObjectPool.js';
import {applyWebGLBlendTree, normalizeSkillEffectKind, roleEffectProfile, SkillEffectFX, SKILL_EFFECT_KIND, triggerWhiteFlash} from './SkillEffectFX.js';

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

function makeSignatureFx(profile,accent){
  const root=new Container();
  root.alpha=0;
  root.scale.set(.28);
  const key=String(profile||'TACTICAL').toUpperCase();
  if(key==='CRIMSON_RIFT'){
    for(let index=0;index<4;index+=1){
      const blade=new Graphics().poly([-150,-5,120,-12,174,0,120,12,-150,5]).fill({color:index%2?0xffffff:accent,alpha:index%2?.72:.95});
      blade.rotation=-.72+index*.47;
      blade.blendMode='add';
      root.addChild(blade);
    }
  }else if(key==='STORM_COMMAND'){
    for(let index=0;index<3;index+=1){
      const arc=new Graphics().arc(0,0,64+index*38,-2.55,.72).stroke({width:12-index*2,color:index===1?0xffffff:accent,alpha:.9});
      arc.rotation=index*.72;
      root.addChild(arc);
    }
  }else if(key==='MOON_BLOOM'){
    for(let index=0;index<8;index+=1){
      const petal=new Graphics().poly([0,-22,15,-72,0,-112,-15,-72]).fill({color:index%3===0?0xffffff:accent,alpha:.82});
      petal.rotation=Math.PI*2*index/8;
      petal.blendMode='add';
      root.addChild(petal);
    }
    root.addChild(new Graphics().circle(0,0,52).stroke({width:9,color:accent,alpha:.95}));
  }else if(key==='WIND_CHAIN'){
    for(let index=0;index<5;index+=1){
      const streak=new Graphics().roundRect(-150,-4-index*3,300-index*26,8,4).fill({color:index%2?0xffffff:accent,alpha:.82});
      streak.rotation=-.28+index*.13;
      streak.position.set(-24+index*13,-62+index*31);
      streak.blendMode='add';
      root.addChild(streak);
    }
  }else if(key==='GUARD_PULSE'){
    root.addChild(new Graphics().poly([0,-116,94,-58,86,66,0,122,-86,66,-94,-58]).stroke({width:12,color:accent,alpha:.92}));
    root.addChild(new Graphics().poly([0,-84,62,-42,56,48,0,82,-56,48,-62,-42]).stroke({width:5,color:0xffffff,alpha:.76}));
  }else{
    root.addChild(new Graphics().circle(0,0,96).stroke({width:10,color:accent,alpha:.9}));
  }
  root.signatureProfile=key;
  applyWebGLBlendTree(root,'add');
  return root;
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
    const useSlash=roleKind===SKILL_EFFECT_KIND.ATTACK;
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

    const slash=this.pools.slash.acquire();
    slash.position.set(targetPoint.x,targetPoint.y);
    slash.alpha=0;
    slash.visible=useSlash;
    slash.scale.set(.3);
    applyWebGLBlendTree(slash,'add');
    this.effectLayer.addChild(slash);

    const damageLabel=this.pools.damage.acquire();
    configureDamageText(damageLabel,{kind:roleKind,damage,critical,healing,hitCount,compact:this.height>this.width});
    damageLabel.position.set(targetPoint.x,targetView.y-350);
    if(roleKind===SKILL_EFFECT_KIND.HP&&damageLabel.healLabel){
      damageLabel.healLabel.position.set(origin.x-targetPoint.x,origin.y-165-(targetView.y-350));
    }
    damageLabel.alpha=0;
    damageLabel.visible=true;
    this.uiLayer.addChild(damageLabel);

    const flash=new Graphics().rect(0,0,this.width,this.height).fill({color:accent,alpha:.28});
    flash.alpha=0;
    flash.blendMode='screen';
    this.effectLayer.addChild(flash);

    const signatureFx=makeSignatureFx(effectProfile,accent);
    signatureFx.position.set(targetPoint.x,targetPoint.y);
    this.effectLayer.addChild(signatureFx);
    const targetFx=new Container();
    targetFx.position.set(targetPoint.x,targetPoint.y+82);
    targetFx.alpha=0;
    targetFx.scale.set(.3);
    const bossTarget=String(targetClass).toUpperCase()==='BOSS';
    if(bossTarget){
      targetFx.addChild(new Graphics().circle(0,0,92).stroke({width:14,color:0xffffff,alpha:.88}));
      targetFx.addChild(new Graphics().circle(0,0,142).stroke({width:8,color:accent,alpha:.8}));
      for(let index=0;index<12;index+=1){
        const shard=new Graphics().poly([-8,-4,34,0,-8,4]).fill({color:index%3===0?0xffffff:accent,alpha:.9});
        shard.rotation=Math.PI*2*index/12;
        targetFx.addChild(shard);
      }
    }else{
      targetFx.addChild(new Graphics().circle(0,0,74).stroke({width:8,color:accent,alpha:.84}));
    }
    applyWebGLBlendTree(targetFx,'screen');
    this.effectLayer.addChild(targetFx);

    const effectPoint=targetPoint;
    const skillEffect=SkillEffectFX.create({kind:roleKind,x:effectPoint.x,y:effectPoint.y,originX:origin.x,originY:origin.y-150,accent}).attach(this.effectLayer);

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
      flash.destroy();
      signatureFx.destroy({children:true});
      targetFx.destroy({children:true});
      whiteFlashHandle?.release();
      skillEffect.release();
      this.pools.slash.release(slash);
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
        this.audio?.playCast(roleKind);
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

      // 350ms peak: whole-sprite attack recoil, slash, impact and hit stop.
      timeline.call(()=>{
        setState(attacker,CHARACTER_STATE.ATTACK);
        setState(target,CHARACTER_STATE.HIT);
        setTint(target,accent);
        whiteFlashHandle?.release();
        whiteFlashHandle=triggerWhiteFlash(target,{durationMs:Math.round(50/this.playbackSpeed)});
        this.audio?.playImpact(roleKind,{critical,boss:bossTarget});
        onImpact();
        if(useSlash&&slash instanceof AnimatedSprite)slash.gotoAndPlay(0);
      },[],.35);
      if(useSlash){
        timeline.set(slash,{alpha:1,rotation:-.08},.35);
        timeline.to(slash.scale,{x:1.5,y:1.5,duration:.1,ease:'expo.out'},.35);
      }
      if(useSlash&&slash instanceof AnimatedSprite){
        timeline.to(slash,{alpha:0,duration:.08,ease:'power2.in'},.53);
      }else if(useSlash){
        slash.blades.forEach(blade=>{
          timeline.to(blade.scale,{x:1,duration:.065,ease:'power4.out'},.35);
          timeline.to(blade,{alpha:0,duration:.14,ease:'power2.in'},.44);
        });
        timeline.to(slash.burst.scale,{x:2.8,y:2.8,duration:.18,ease:'power3.out'},.355);
        timeline.to(slash.burst,{alpha:0,duration:.15,ease:'power2.in'},.43);
        slash.shards.forEach((shard,index)=>{
          const angle=shard.rotation;
          const distance=110+(index%5)*22;
          timeline.to(shard,{
            x:Math.cos(angle)*distance,
            y:Math.sin(angle)*distance,
            alpha:0,
            duration:.18+(index%3)*.02,
            ease:'power3.out'
          },.36);
        });
      }
      timeline.to(flash,{alpha:.5,duration:.025,ease:'none'},.35);
      timeline.to(flash,{alpha:0,duration:.13,ease:'power3.out'},.375);
      timeline.to(signatureFx,{alpha:1,rotation:.22,duration:.035,ease:'none'},.345);
      timeline.to(signatureFx.scale,{x:1.5,y:1.5,duration:.1,ease:'expo.out'},.345);
      timeline.to(signatureFx,{alpha:0,rotation:.5,duration:.18,ease:'power2.in'},.46);
      timeline.to(targetFx,{alpha:1,duration:.025,ease:'none'},.35);
      timeline.to(targetFx.scale,{x:1.5,y:1.5,duration:.1,ease:'expo.out'},.35);
      timeline.to(targetFx,{alpha:0,duration:.14,ease:'power2.in'},.48);
      // Shared placeholder/atlas factory is synchronized to the 350ms collision.
      skillEffect.play(timeline,{at:.35,duration:.2});
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
