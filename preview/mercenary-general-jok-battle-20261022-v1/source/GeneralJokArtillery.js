import {Container,Sprite} from 'pixi.js';
import {clamp,impulse} from '../skill.mjs';
import {BOMBARDMENT_VISUALS,bombardmentWidth,drawBombardmentBlast,drawBombardmentSmoke} from './BombardmentVisuals.js';

// Pure rendering on GeneralJokFX's registered V3 clock. This module never
// schedules damage, an extra ticker, an independent timer or another renderer.
export class GeneralJokArtillery {
 constructor(owner){
  this.owner=owner;
  this.layer=new Container({label:'GeneralJokM777Battery',zIndex:-50});
  owner.engine.combatLayer.addChild(this.layer);
  this.guns=Array.from({length:3},(_,i)=>{
   const s=new Sprite(owner.assets.effects.m777[0]);s.label='M777-155mm-'+i;
   s.anchor.set(.5,.8);this.layer.addChild(s);return s;
  });
  this.reset();
 }
 reset(){
  this.layer.visible=false;this.visibleGuns=0;this.shells=[];this.blasts=[];this.fires=[];
  this.phase='NONE';this.activeBreakerPhase=null;this.peakBlastWidth=0;
 }
 gunPoint(i){return {...this.owner.stagePoint([230,465,700][i],505),width:[560,600,640][i]*this.owner.effectScale};}
 muzzle(i){
  const p=this.gunPoint(i),spec=this.owner.manifest.effects.m777[0];
  return {x:p.x+this.owner.facing*(spec.muzzle.x/spec.width-.5)*p.width,y:p.y+(spec.muzzle.y/spec.height-.8)*p.width*spec.height/spec.width};
 }
 draw(key,index,p,width,options={}){
  return this.owner.draw(this.owner.assets.effects[key][index],p,width,options);
 }
 blast(p,age,width,duration=2.25){
  const blast=drawBombardmentBlast(this.owner,p,age,width,duration);if(!blast)return;
  this.blasts.push(blast);
  this.peakBlastWidth=Math.max(this.peakBlastWidth,width);
 }
 curve(start,end,u){
  const a=1-u,c1={x:start.x+220,y:start.y-85},c2={x:end.x-180,y:40};
  return {x:a*a*a*start.x+3*a*a*u*c1.x+3*a*u*u*c2.x+u*u*u*end.x,
   y:a*a*a*start.y+3*a*a*u*c1.y+3*a*u*u*c2.y+u*u*u*end.y};
 }
 shell(start,end,u,width,detail){
  const p=this.curve(start,end,u),ahead=this.curve(start,end,Math.min(1,u+.008)),behind=this.curve(start,end,Math.max(0,u-.008));
  const rotation=Math.atan2(ahead.y-behind.y,ahead.x-behind.x);
  if(!this.owner.reducedMotion)for(const [delay,alpha]of [[.035,.28],[.07,.14]]){
   if(u>delay)this.draw('breaker',2,this.curve(start,end,u-delay),width,{anchor:{x:.86,y:.54},rotation,alpha});
  }
  this.draw('breaker',2,p,width,{anchor:{x:.86,y:.54},rotation});
  this.shells.push({...detail,position:p,rotation});
 }
 knock(actor,t,at,force){
  this.owner.knockTarget(actor,impulse(t,at,.94)*force*(this.owner.reducedMotion?.16:1));
 }
 render(t,state){
  this.reset();
  const o=this.owner;
  if(state.cancelled||state.done||o.motionOnly)return;
  if(o.plan.mode==='artillery')this.renderUltimate(t);
  if(o.plan.mode==='breaker')this.renderBreaker(t);
 }
 renderUltimate(t){
  const o=this.owner,plan=o.plan;
  const deployment=clamp((t-.3)/.5),retirement=clamp((7.7-t)/.7);
  this.layer.visible=deployment>0&&retirement>0;
  this.phase=t<1.55?'M777_DEPLOYMENT':t<2.82?'FIRST_VOLLEY':t<4.7?'CONCENTRATED_BARRAGE':t<5.18?'FINAL_COMMAND':'CATACLYSM';
  this.visibleGuns=this.layer.visible?3:0;
  this.guns.forEach((s,i)=>{
   const p=this.gunPoint(i),kick=plan.battery.filter(x=>x.gun===i).reduce((n,x)=>n+impulse(t,x.fire,.55),0);
   s.position.set(p.x-o.facing*kick*(o.reducedMotion?2:14)*o.effectScale,p.y+(1-deployment)*24*o.effectScale);s.scale.set(o.facing*p.width/s.texture.width,p.width/s.texture.width);
   s.alpha=deployment*retirement;s.visible=this.layer.visible;
  });
  if(t>.3&&t<1.35)for(let i=0;i<3;i++){
   const p=this.gunPoint(i),age=t-.3-i*.08;if(age<0)continue;
   this.draw('groundSmoke',Math.min(5,Math.floor(age*6)),{x:p.x,y:p.y},530,{anchor:o.manifest.effects.groundSmoke[0].anchor,alpha:Math.min(1,(1.35-t)*2)});
  }
  for(const shot of plan.battery){
   const age=t-shot.fire,start=this.muzzle(shot.gun),actor=o.targets[shot.target];
   if(!o.alive(actor))continue;
   const end=o.actorGround(actor);
   if(age>=0&&age<.42){o.drawBatteryMuzzle(start,age,290,-.37);this.fires.push(shot.index);}
   if(age>=0&&age<.9){
    const p=this.gunPoint(shot.gun),index=Math.min(5,Math.floor(age/.9*6));
    this.draw('groundSmoke',index,{x:p.x,y:p.y},650,{anchor:o.manifest.effects.groundSmoke[0].anchor,alpha:(o.reducedMotion?.35:.8)*Math.min(1,(.9-age)*4)});
   }
   // Artillery is conveyed through muzzle blasts and timed ground impacts.
   // No travelling shell or trail is rendered between the two locations.
   const hitAge=t-shot.impact;
   const width=o.blastWidth(end.x,shot.index<3);
   this.blast(end,hitAge,width,BOMBARDMENT_VISUALS.impactDuration);
   this.knock(actor,t,shot.impact,86);
  }
  if(t>=plan.finale){
   const ground=o.actorGround(o.targets[0]);
   for(const b of BOMBARDMENT_VISUALS.finale){
    this.blast({x:o.stagePoint(b.x,640).x,y:ground.y},t-plan.finale-b.delay,b.w,BOMBARDMENT_VISUALS.finaleDuration);
   }
   o.targets.forEach((actor,i)=>this.knock(actor,t,plan.finale+i*.035,108));
   drawBombardmentSmoke(o,ground.y,t-plan.finale);
  }
 }
 renderBreaker(t){
  const o=this.owner,shot=o.plan.shots[0],start=o.shotOrigin(shot);
  if(t>=.18&&t<shot.fire)this.activeBreakerPhase='AIM';
  const age=t-shot.fire;
  if(age>=0&&age<.28){
   o.drawRifleMuzzle(age,290,.18);
   this.activeBreakerPhase='RELEASE';
  }
  const last=o.targets.at(-1);if(!last)return;
  const first=o.targetPoint(o.targets[0]),end=o.targetPoint(last),endAt=shot.impact+.52;
  if(age>=0&&t<endAt){
   // A two-leg time map makes the first contact coincide with the first actor.
   const x=t<=shot.impact?start.x+(first.x-start.x)*age/(shot.impact-shot.fire):first.x+(end.x-first.x)*(t-shot.impact)/(endAt-shot.impact);
   this.draw('breaker',2,{x,y:start.y},370,{anchor:{x:.86,y:.54}});
   this.shells.push({type:'BREAKER',position:{x,y:start.y},horizontalError:0});
   if(!this.activeBreakerPhase)this.activeBreakerPhase='FLIGHT';
  }
  const hitAge=t-shot.impact;
  if(hitAge>=0&&hitAge<2.45){
   const index=hitAge<.32?3:hitAge<1.25?4:5;
   const p={x:o.stagePoint(1180,640).x,y:start.y+65*o.effectScale};
   const width=index===3?680:index===4?910:880;
   const alpha=Math.min(1,hitAge/.06,(2.45-hitAge)/.45)*(o.reducedMotion?.62:1);
   const wave=this.draw('breaker',index,p,width,{alpha});
   // This is a wide airborne pressure front. Its vertical spread is projected
   // to the horizontal combat lane; character and weapon scaling stay uniform.
   if(wave)wave.scale.y*=.8;
   this.activeBreakerPhase=['PIERCE','SHOCK_FRONT','DISSIPATION'][index-3];
   this.blasts.push({...p,width,phase:index,age:hitAge});this.peakBlastWidth=width;o.impactCount++;
   o.targets.forEach((actor,i)=>{
    const at=shot.impact+i*.13;this.knock(actor,t,at,83);
    const a=t-at;
    if(a>=0&&a<1.12){
     const spec=o.manifest.effects.goldBreach[Math.min(5,Math.floor(a/1.12*6))],p=o.actorGround(actor);
     this.draw('goldBreach',Math.min(5,Math.floor(a/1.12*6)),p,290,{anchor:spec.anchor,alpha:.75*Math.min(1,(1.12-a)*4)});
    }
   });
  }
 }
 diagnostics(){return {artilleryModel:'M777 155mm',artilleryVisible:this.visibleGuns,artilleryPhase:this.phase,artilleryFires:this.fires,artilleryShells:this.shells,largeBlasts:this.blasts,largestBlastWidth:this.peakBlastWidth,breakerPhase:this.activeBreakerPhase};}
 destroy(){this.layer.destroy({children:true});}
}

