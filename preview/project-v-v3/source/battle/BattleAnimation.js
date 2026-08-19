import {gsap} from 'gsap';

const CHARACTER_STATE={IDLE:'IDLE',MOVE:'MOVE',ATTACK:'ATTACK',HIT:'HIT',DEAD:'DEAD'};
const TEAM={ENEMY:'ENEMY'};

/**
 * Full-body SD animation adapter with a legacy rig fallback.
 * Production actors use one intact sprite; all weight and impact comes from
 * whole-sprite squash/stretch plus view-level translation and rotation.
 */
export class BattleAnimation{
  constructor(character){
    this.character=character;
    this.timeline=null;
  }

  kill(){
    this.timeline?.kill();
    this.timeline=null;
    const {view,rig}=this.character;
    const main=this.character.mainSprite||this.character.fullBodySprite;
    const targets=[view,view.scale,main,main?.scale,...(rig?.tweenTargets?.()||[])].filter(Boolean);
    gsap.killTweensOf(targets);
    this.character.restoreNeutralAvatarPose?.();
    rig?.restoreBindPose?.();
  }

  setState(state){
    this.kill();
    if(this.character.fullSpriteMode&&this.character.mainSprite){
      if(state===CHARACTER_STATE.IDLE)this.playFullSpriteIdleAnimation();
      else if(state===CHARACTER_STATE.MOVE)this.playFullSpriteMoveAnimation();
      else if(state===CHARACTER_STATE.ATTACK)this.playFullSpriteAttackAnimation();
      else if(state===CHARACTER_STATE.HIT)this.playFullSpriteHitAnimation();
      else if(state===CHARACTER_STATE.DEAD)this.playFullSpriteDeadAnimation();
      return;
    }
    if(!this.character.rigged||!this.character.rig)return;
    if(state===CHARACTER_STATE.IDLE)this.playIdleAnimation();
    else if(state===CHARACTER_STATE.MOVE)this.playMoveAnimation();
    else if(state===CHARACTER_STATE.ATTACK)this.playAttackAnimation();
    else if(state===CHARACTER_STATE.HIT)this.playHitAnimation();
    else if(state===CHARACTER_STATE.DEAD)this.playDeadAnimation();
  }

  playFullSpriteIdleAnimation(){
    const {mainSprite:main,neutralAvatarPose:neutral}=this.character;
    const base=neutral.mainSprite;
    this.timeline=gsap.timeline({repeat:-1,yoyo:true,defaults:{ease:'power1.inOut'}})
      .to(main.scale,{x:base.scaleX*1.02,y:base.scaleY*.96,duration:.7},0)
      .to(main,{y:base.y-2.2,duration:.7},0);
  }

  playFullSpriteMoveAnimation(){
    const {mainSprite:main,neutralAvatarPose:neutral}=this.character;
    const base=neutral.mainSprite;
    this.timeline=gsap.timeline({repeat:-1,yoyo:true,defaults:{ease:'sine.inOut'}})
      .to(main.scale,{x:base.scaleX*1.045,y:base.scaleY*.93,duration:.11},0)
      .to(main,{y:base.y-4,duration:.11},0);
  }

  playFullSpriteAttackAnimation(){
    const {view,mainSprite:main,neutralAvatarPose:neutral}=this.character;
    const base=neutral.mainSprite;
    const side=this.character.team===TEAM.ENEMY?-1:1;
    this.timeline=gsap.timeline()
      .to(main.scale,{x:base.scaleX*1.07,y:base.scaleY*.9,duration:.055,ease:'power3.in'},0)
      .to(main,{y:base.y+3,duration:.055,ease:'power3.in'},0)
      .to(view,{rotation:neutral.rotation+Math.PI/12*side,duration:.055,ease:'power4.out'},.055)
      .to(main.scale,{x:base.scaleX*.96,y:base.scaleY*1.055,duration:.065,ease:'power4.out'},.055)
      .to(main,{y:base.y-5,duration:.065,ease:'power4.out'},.055)
      .to(view,{rotation:neutral.rotation,duration:.18,ease:'back.out(1.8)'},.12)
      .to(main.scale,{x:base.scaleX,y:base.scaleY,duration:.18,ease:'back.out(1.8)'},.12)
      .to(main,{y:base.y,duration:.18,ease:'back.out(1.8)'},.12);
  }

  playFullSpriteHitAnimation(){
    const {view,mainSprite:main,neutralAvatarPose:neutral}=this.character;
    const base=neutral.mainSprite;
    const direction=this.character.team===TEAM.ENEMY?1:-1;
    this.timeline=gsap.timeline()
      .to(view,{x:neutral.x+25*direction,y:neutral.y-25,rotation:neutral.rotation+.075*direction,duration:.055,ease:'power4.out'},0)
      .to(main.scale,{x:base.scaleX*1.075,y:base.scaleY*.9,duration:.055,ease:'power4.out'},0)
      .to(view,{x:neutral.x-8*direction,y:neutral.y+4,rotation:neutral.rotation-.028*direction,duration:.075,ease:'power2.out'},.055)
      .to(view,{x:neutral.x+4*direction,y:neutral.y-2,rotation:neutral.rotation+.014*direction,duration:.08,ease:'sine.inOut'},.13)
      .to(view,{x:neutral.x,y:neutral.y,rotation:neutral.rotation,duration:.13,ease:'back.out(1.65)'},.21)
      .to(main.scale,{x:base.scaleX,y:base.scaleY,duration:.21,ease:'back.out(1.7)'},.055);
  }

  playFullSpriteDeadAnimation(){
    const {view,mainSprite:main,neutralAvatarPose:neutral}=this.character;
    const direction=this.character.team===TEAM.ENEMY?1:-1;
    this.timeline=gsap.timeline()
      .to(main.scale,{x:neutral.mainSprite.scaleX*1.08,y:neutral.mainSprite.scaleY*.82,duration:.12,ease:'power2.in'},0)
      .to(view,{rotation:neutral.rotation+Math.PI*.36*direction,y:neutral.y+22,alpha:.3,duration:.34,ease:'power3.in'},.05);
  }

  playIdleAnimation(){
    const {view,neutralAvatarPose:neutral,rig}=this.character;
    const {bones,bindPose}=rig;
    const bind=bindPose.bones;
    this.timeline=gsap.timeline({repeat:-1,yoyo:true,defaults:{ease:'sine.inOut'}})
      .to(view,{y:neutral.y-1.5,duration:.9},0)
      .to(bones.torso,{y:bind.torso.y-1.8,rotation:bind.torso.rotation+.012,duration:.9},0)
      .to(bones.head,{y:bind.head.y-2.8,rotation:bind.head.rotation-.012,duration:.9},0)
      .to(bones.armFarUpper,{rotation:bind.armFarUpper.rotation-.018,duration:.9},0)
      .to(bones.armNearUpper,{rotation:bind.armNearUpper.rotation+.018,duration:.9},0);
  }

  playMoveAnimation(){
    const {view,neutralAvatarPose:neutral,rig}=this.character;
    const {bones,bindPose}=rig;
    const b=bindPose.bones;
    this.timeline=gsap.timeline({repeat:-1,defaults:{ease:'sine.inOut'}})
      .to(view,{y:neutral.y-5,duration:.14},0)
      .to(bones.legFarUpper,{rotation:b.legFarUpper.rotation+.25,duration:.14},0)
      .to(bones.legNearUpper,{rotation:b.legNearUpper.rotation-.25,duration:.14},0)
      .to(bones.legFarLower,{rotation:b.legFarLower.rotation-.17,duration:.14},0)
      .to(bones.legNearLower,{rotation:b.legNearLower.rotation+.17,duration:.14},0)
      .to(bones.armFarUpper,{rotation:b.armFarUpper.rotation-.24,duration:.14},0)
      .to(bones.armNearUpper,{rotation:b.armNearUpper.rotation+.24,duration:.14},0)
      .to(view,{y:neutral.y,duration:.14},.14)
      .to(bones.legFarUpper,{rotation:b.legFarUpper.rotation-.22,duration:.14},.14)
      .to(bones.legNearUpper,{rotation:b.legNearUpper.rotation+.22,duration:.14},.14)
      .to(bones.legFarLower,{rotation:b.legFarLower.rotation+.15,duration:.14},.14)
      .to(bones.legNearLower,{rotation:b.legNearLower.rotation-.15,duration:.14},.14)
      .to(bones.armFarUpper,{rotation:b.armFarUpper.rotation+.21,duration:.14},.14)
      .to(bones.armNearUpper,{rotation:b.armNearUpper.rotation-.21,duration:.14},.14);
  }

  playAttackAnimation(){
    const {view,neutralAvatarPose:neutral,rig}=this.character;
    const {bones,bindPose}=rig;
    const b=bindPose.bones;
    const side=this.character.team===TEAM.ENEMY?-1:1;
    this.timeline=gsap.timeline()
      .to(bones.torso,{rotation:b.torso.rotation-.055,duration:.07,ease:'power2.in'},0)
      .to(bones.head,{rotation:b.head.rotation+.035,duration:.07,ease:'power2.in'},0)
      .to(bones.armNearUpper,{rotation:b.armNearUpper.rotation+.48,duration:.07,ease:'power3.in'},0)
      .to(bones.armNearLower,{rotation:b.armNearLower.rotation-.34,duration:.07,ease:'power3.in'},0)
      .to(view,{y:neutral.y-3,rotation:neutral.rotation-.035*side,duration:.07,ease:'power2.in'},0)
      .to(bones.torso,{rotation:b.torso.rotation+.095,duration:.095,ease:'power4.out'},.07)
      .to(bones.head,{rotation:b.head.rotation-.045,duration:.095,ease:'power4.out'},.07)
      .to(bones.armNearUpper,{rotation:b.armNearUpper.rotation-1.04,duration:.095,ease:'power4.out'},.07)
      .to(bones.armNearLower,{rotation:b.armNearLower.rotation+.3,duration:.095,ease:'power4.out'},.07)
      .to(bones.armFarUpper,{rotation:b.armFarUpper.rotation+.11,duration:.095,ease:'power3.out'},.07)
      .to(view,{x:neutral.x+7*side,y:neutral.y-2,rotation:neutral.rotation+.055*side,duration:.095,ease:'power4.out'},.07)
      .to(bones.torso,{rotation:b.torso.rotation,duration:.18,ease:'back.out(1.6)'},.165)
      .to(bones.head,{rotation:b.head.rotation,duration:.18,ease:'back.out(1.6)'},.165)
      .to(bones.armNearUpper,{rotation:b.armNearUpper.rotation,duration:.18,ease:'back.out(1.8)'},.165)
      .to(bones.armNearLower,{rotation:b.armNearLower.rotation,duration:.18,ease:'back.out(1.8)'},.165)
      .to(bones.armFarUpper,{rotation:b.armFarUpper.rotation,duration:.18,ease:'back.out(1.6)'},.165)
      .to(view,{x:neutral.x,y:neutral.y,rotation:neutral.rotation,duration:.18,ease:'back.out(1.6)'},.165);
  }

  playHitAnimation(){
    const {view,neutralAvatarPose:neutral,rig}=this.character;
    const {bones,bindPose}=rig;
    const b=bindPose.bones;
    const direction=this.character.team===TEAM.ENEMY?1:-1;
    this.timeline=gsap.timeline()
      .to(view,{x:neutral.x+14*direction,y:neutral.y-18,rotation:neutral.rotation+.04*direction,duration:.07,ease:'power4.out'},0)
      .to(bones.torso,{rotation:b.torso.rotation+.13,duration:.07,ease:'power4.out'},0)
      .to(bones.head,{rotation:b.head.rotation+.16,duration:.07,ease:'power4.out'},0)
      .to(bones.armFarUpper,{rotation:b.armFarUpper.rotation-.18,duration:.07,ease:'power4.out'},0)
      .to(bones.armNearUpper,{rotation:b.armNearUpper.rotation+.18,duration:.07,ease:'power4.out'},0)
      .to(view,{x:neutral.x,y:neutral.y,rotation:neutral.rotation,duration:.17,ease:'back.out(1.7)'},.07)
      .to(bones.torso,{rotation:b.torso.rotation,duration:.17,ease:'back.out(1.7)'},.07)
      .to(bones.head,{rotation:b.head.rotation,duration:.17,ease:'back.out(1.7)'},.07)
      .to(bones.armFarUpper,{rotation:b.armFarUpper.rotation,duration:.17,ease:'back.out(1.7)'},.07)
      .to(bones.armNearUpper,{rotation:b.armNearUpper.rotation,duration:.17,ease:'back.out(1.7)'},.07);
  }

  playDeadAnimation(){
    const {view,neutralAvatarPose:neutral,rig}=this.character;
    const direction=this.character.team===TEAM.ENEMY?1:-1;
    this.timeline=gsap.timeline()
      .to(rig.bones.legNearUpper,{rotation:rig.bindPose.bones.legNearUpper.rotation+.35,duration:.16,ease:'power2.in'},0)
      .to(rig.bones.legFarUpper,{rotation:rig.bindPose.bones.legFarUpper.rotation-.28,duration:.16,ease:'power2.in'},0)
      .to(view,{rotation:neutral.rotation+Math.PI*.46*direction,y:neutral.y+18,alpha:.35,duration:.34,ease:'power3.in'},.06);
  }

  setFacing(){}
  changeTexture(){}
  destroy(){this.kill()}
}
