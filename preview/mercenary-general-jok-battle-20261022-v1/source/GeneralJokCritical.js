import {clamp,CRITICAL_HIT} from '../skill.mjs';

// One target, one contact. The concentrated glint and seal add no extra hits.
export class GeneralJokCritical {
 constructor(owner){this.owner=owner;this.reset();}
 reset(){this.phase='NONE';this.activeHits=[];this.shotVisible=false;this.focus=null;this.knockback=0;}
 focusPoint(target){return this.owner.engine.effectLayer.toLocal(target.view.toGlobal({x:0,y:-target.fullBodyHeight*.72}));}
 drawFrame(index,p,width,alpha=1,blendMode='normal'){
  const o=this.owner,spec=o.manifest.effects.criticalImpact[index];
  o.draw(o.assets.effects.criticalImpact[index],p,width,{anchor:spec.anchor,alpha,blendMode});
 }
 render(t,state){
  this.reset();const o=this.owner;
  if(o.plan.mode!=='critical'||state.cancelled||state.done||o.motionOnly)return;
  const target=o.targets[CRITICAL_HIT.target];if(!o.alive(target))return;
  const shot=o.plan.shots[0],age=t-shot.impact,start=o.shotOrigin(shot);
  this.phase=t<shot.fire?'PRECISION_CHARGE':age<0?'CRITICAL_SHOT':age<.24?'VITAL_PIERCE':age<1.34?'GOLDEN_SEAL':'RECOVERY';
  if(t>=.3&&t<shot.fire){
   const alpha=clamp((t-.3)/.3)*clamp((shot.fire-t)/.1);
   this.drawFrame(0,start,170,alpha);
   this.drawFrame(1,start,125,alpha*.3,'add');
  }
  const release=t-shot.fire;
  if(release>=0&&release<.13)o.draw(o.assets.effects.muzzle[Math.min(3,Math.floor(release/.13*4))],o.muzzleNow(),180,{anchor:{x:.35,y:.52},rotation:o.muzzleAngle(),alpha:clamp((.13-release)*15)});
  // Fast, localized contact rather than a large explosive round.
  if(release>=0&&age<0){
   const end=this.focusPoint(target),u=clamp(release/(shot.impact-shot.fire));
   const p={x:start.x+(end.x-start.x)*u,y:start.y+(end.y-start.y)*u};
   o.draw(o.assets.effects.bullet[2],p,110,{anchor:{x:.94,y:.5},rotation:Math.atan2(end.y-start.y,end.x-start.x)});
   this.shotVisible=true;
  }
  if(age>=0&&age<CRITICAL_HIT.knockbackDuration){
   const k=age<.10?1-Math.pow(1-age/.10,3):age<.25?1:1-clamp((age-.25)/.9)**2*(3-2*clamp((age-.25)/.9));
   this.knockback=CRITICAL_HIT.knockback*k*(o.reducedMotion?.16:1);
   o.knockTarget(target,this.knockback);
  }
  this.focus=this.focusPoint(target);
  if(age>=0&&age<CRITICAL_HIT.hitDuration){
   const stops=[0,.045,.105,.23,.43,.66,CRITICAL_HIT.hitDuration];
   let index=0;while(index<5&&age>=stops[index+1])index++;
   const mix=clamp((age-stops[index])/(stops[index+1]-stops[index]));
   const alpha=clamp((CRITICAL_HIT.hitDuration-age)/.18)*(o.reducedMotion?.65:1);
   this.drawFrame(index,this.focus,CRITICAL_HIT.hitWidth,alpha*(1-mix));
   if(index<5)this.drawFrame(index+1,this.focus,CRITICAL_HIT.hitWidth,alpha*mix);
   if(age<.24)target.fullBodySprite.tint=age<.09?0xffffff:0xffd687;
   this.activeHits.push({target:0,position:{...this.focus},width:CRITICAL_HIT.hitWidth,age,frame:index});
   o.impactCount++;
  }
 }
 diagnostics(){return {criticalPhase:this.phase,criticalHits:this.activeHits,criticalProjectileVisible:this.shotVisible,criticalFocus:this.focus,criticalTargetKnockback:this.knockback,criticalExplosionCount:0};}
 destroy(){this.reset();}
}
