import {Container,Sprite} from 'pixi.js';
import {clamp,impulse,HIT_MARK_WIDTH} from '../skill.mjs';
import {BOMBARDMENT_VISUALS,bombardmentWidth,drawBombardmentBlast,drawBombardmentSmoke} from './BombardmentVisuals.js';

// All poses, shells, smoke and signature marks sample the owner's one clock.
// Seeking backwards, interruption and replay never create timers or damage.
export class GeneralJokNaval{
 constructor(owner){
  this.owner=owner;
  this.layer=new Container({label:'GeneralJokNavalSummon',zIndex:-60});
  owner.engine.combatLayer.addChild(this.layer);
  this.ship=new Sprite(owner.assets.effects.battleship[0]);
  this.ship.label='GeneralJokYamato';this.ship.anchor.set(.5,.74);this.layer.addChild(this.ship);
  this.markLayer=new Container({label:'GeneralJokLastImpact'});owner.layer.addChild(this.markLayer);
  this.marks=Array.from({length:5},()=>{const halo=new Sprite(owner.assets.effects.monkey[0]),sprite=new Sprite(owner.assets.effects.monkey[0]);for(const s of [halo,sprite]){s.anchor.set(.5);this.markLayer.addChild(s);}halo.blendMode='add';return {halo,sprite};});
  this.mark=this.marks[0].sprite;this.reset();
 }
 reset(){
  this.layer.visible=false;this.markLayer.visible=false;
  this.shells=[];this.blasts=[];this.fires=[];this.fragmentIds=[];this.phase='NONE';this.markAge=null;this.shake=0;this.activeMarks=[];
  this.peakBlastWidth=0;
  for(const {halo,sprite}of this.marks.filter(Boolean)){halo.visible=false;sprite.visible=false;}
  const camera=this.owner.engine.camera;
  if(camera&&this.owner.cameraEffectsEnabled!==false){camera.container.position.set(camera.base.x,camera.base.y);camera.container.rotation=0;}
 }
 draw(key,index,p,width,options={}){return this.owner.draw(this.owner.assets.effects[key][index],p,width,options);}
 bombardmentBlast(p,age,width,duration){
  const blast=drawBombardmentBlast(this.owner,p,age,width,duration);if(!blast)return;
  this.blasts.push(blast);this.peakBlastWidth=Math.max(this.peakBlastWidth,width);
 }
 blast(p,age,width,duration=1.55){
  if(age<0||age>=duration)return;
  const u=age/duration,stops=[0,.09,.24,.43,.66,.85,1];
  let index=0;while(index<5&&u>=stops[index+1])index++;
  const mix=clamp((u-stops[index])/(stops[index+1]-stops[index]));
  const alpha=clamp(age/.035)*clamp((duration-age)/.3)*(this.owner.reducedMotion?.64:1);
  const anchor=this.owner.manifest.effects.navalBlast[0].anchor;
  this.draw('navalBlast',index,p,width,{anchor,alpha:alpha*(1-mix)});
  if(index<5)this.draw('navalBlast',index+1,p,width,{anchor,alpha:alpha*mix});
  this.blasts.push({...p,width,age,phase:index});this.peakBlastWidth=Math.max(this.peakBlastWidth,width);
  this.owner.impactCount++;
 }
 curve(a,b,u,lift=200,fan=null){
  const v=1-u,c={x:fan==null?a.x+Math.max(110,(b.x-a.x)*.45):a.x+fan,y:Math.min(a.y,b.y)-lift};
  return {x:v*v*a.x+2*v*u*c.x+u*u*b.x,y:v*v*a.y+2*v*u*c.y+u*u*b.y};
 }
 shell(a,b,u,width,detail,lift=200,fan=null){
  const p=this.curve(a,b,u,lift,fan),prev=this.curve(a,b,Math.max(0,u-.006),lift,fan),next=this.curve(a,b,Math.min(1,u+.006),lift,fan);
  const rotation=Math.atan2(next.y-prev.y,next.x-prev.x);
  if(!this.owner.reducedMotion)for(const [delay,alpha]of [[.04,.32],[.08,.14]]){
   if(u>delay)this.draw('breaker',2,this.curve(a,b,u-delay,lift,fan),width,{anchor:{x:.86,y:.54},rotation,alpha,blendMode:'add'});
  }
  this.draw('breaker',2,p,width,{anchor:{x:.86,y:.54},rotation});
  this.shells.push({...detail,position:p,rotation});
 }
 muzzle(barrel){
  const spec=this.owner.manifest.effects.battleship[0],p=spec.muzzles[barrel];
  return this.owner.engine.effectLayer.toLocal(this.ship.toGlobal({x:p.x-spec.width*.5,y:p.y-spec.height*.74}));
 }
 ground(index){return this.owner.actorGround(this.owner.targets[index]);}
 impactPoint(index){const p=this.ground(index);return {x:p.x,y:p.y-6};}
 knock(t,at,index,force=75){
  const o=this.owner,a=o.targets[index];
  o.knockTarget(a,impulse(t,at,.8)*force*(o.reducedMotion?.16:1));
 }
 render(t,state){
  this.reset();const o=this.owner;
  if(state.cancelled||state.done||o.motionOnly)return;
  if(o.plan.mode==='ultimate')this.naval(t);
  if(o.plan.mode==='sabotage')this.sabot(t);
  if(o.plan.mode==='airburst')this.airburst(t);
  this.hitMarks(t);
 }
 naval(t){
  const o=this.owner,plan=o.plan,arrival=clamp((t-.45)/1.05),departure=clamp((10.7-t)/.9);
  const ease=1-Math.pow(1-arrival,3),kick=plan.naval.reduce((n,s)=>n+impulse(t,s.fire,.32),0);
  this.layer.visible=arrival>0&&departure>0;
  this.ship.scale.set(o.facing*760*o.effectScale/this.ship.texture.width,760*o.effectScale/this.ship.texture.width);
  const shipAt=o.stagePoint(590-(1-ease)*(o.reducedMotion?0:100)-kick*(o.reducedMotion?1:3),550+(1-ease)*40);this.ship.position.set(shipAt.x,shipAt.y);
  this.ship.alpha=arrival*departure;
  this.phase=t<.45?'GOLDEN_CORE_CHARGE':t<1.9?'SHIP_SUMMON':t<8.35?'ARSENAL_BROADSIDE':'NAVAL_CATACLYSM';
  if(t>.05&&t<2.2){
   const age=t-.05,frame=Math.min(5,Math.floor(age/2.15*6));
   for(let i=0;i<2;i++)this.draw('groundSmoke',frame,o.stagePoint(390+i*320,550),430,{anchor:o.manifest.effects.groundSmoke[frame].anchor,alpha:clamp(age*3)*clamp((2.2-t)*1.5)*.55});
  }
  for(const s of plan.naval){
   const age=t-s.fire,start=this.muzzle(s.barrel),end=this.ground(s.target);
   if(age>=0&&age<.42){o.drawBatteryMuzzle(start,age,190,-.08);this.fires.push(s.index);}
   // The user rejected visible artillery projectiles. Dense, muzzle-anchored
   // combustion and immediate timed impact clusters convey the broadside.
   const width=o.blastWidth(end.x,s.volley===0);
   this.bombardmentBlast(end,t-s.impact,width,BOMBARDMENT_VISUALS.impactDuration);
   this.knock(t,s.impact,s.target,76);
   this.shake+=impulse(t,s.impact,.34)*4;
  }
  const groundY=this.ground(0).y;
  for(const b of BOMBARDMENT_VISUALS.finale){
   this.bombardmentBlast({x:o.stagePoint(b.x,640).x,y:groundY},t-plan.finale-b.delay,b.w,BOMBARDMENT_VISUALS.finaleDuration);
  }
  drawBombardmentSmoke(o,groundY,t-plan.finale);
  this.shake+=impulse(t,plan.finale,.75)*9;
  if(t>=plan.finale)o.targets.forEach((_,i)=>this.knock(t,plan.finale+i*.04,i,110));
  if(o.cameraEffectsEnabled!==false&&!o.reducedMotion&&this.shake){
   const c=o.engine.camera;c.container.x=c.base.x+Math.sin(t*71)*this.shake;
   c.container.y=c.base.y+Math.cos(t*57)*this.shake*.48;
  }
 }
 sabot(t){
  const o=this.owner,s=o.plan.shots[0],start=o.shotOrigin(s),first=o.targetPoint(o.targets[0]),last=o.targetPoint(o.targets.at(-1));
  this.phase=t<s.fire?'SABOT_AIM':t<1.78?'HYPER_PIERCE':t<3.35?'DELAYED_RUPTURE':'RECOVERY';
  const age=t-s.fire,endAt=1.78;
  o.drawRifleMuzzle(age,230,.14);
  if(age>=0&&t<endAt){
   const x=t<s.impact?start.x+(first.x-start.x)*age/(s.impact-s.fire):first.x+(last.x-first.x)*(t-s.impact)/(endAt-s.impact);
   for(let i=3;i>=0;i--)this.draw('bullet',2,{x:x-i*42,y:start.y},280-i*20,{anchor:{x:.94,y:.5},alpha:i?(.38-i*.06):1,blendMode:i?'add':'normal'});
   this.shells.push({type:'SABOT',position:{x,y:start.y},horizontalError:0});
  }
  for(let i=0;i<o.targets.length;i++){
   const at=1.55+i*.10,p=this.impactPoint(i);
   this.blast(p,t-at,390+i*36,1.35);this.knock(t,at,i,100);
  }
 }
 airburst(t){
  const o=this.owner,s=o.plan.shots[0],start=o.shotOrigin(s),split=o.stagePoint(1120,190),age=t-s.fire;
  this.phase=t<s.fire?'AIRBURST_LOAD':t<1.85?'HEAVY_SHELL_ASCENT':t<2.6?'FIVE_WAY_SPLIT':t<4.9?'STAGGERED_IMPACTS':'RECOVERY';
  o.drawRifleMuzzle(age,260,.16);
  if(age>=0&&t<1.85)this.shell(start,split,age/.65,330,{type:'AIRBURST_MAIN'},50);
  const splitAge=t-1.85;
  if(splitAge>=0&&splitAge<.58){
   const index=Math.min(3,Math.floor(splitAge/.58*4));
   this.draw('impact',index,split,330+splitAge*250,{alpha:clamp((.58-splitAge)*4),blendMode:'add'});
  }
  for(const f of o.plan.fragments){
   const end=this.impactPoint(f.target),a=t-f.fire;
   if(a>=0&&t<f.impact){this.shell(split,end,a/(f.impact-f.fire),175,{type:'AIRBURST_FRAGMENT',fragment:f.index},70,(f.index-2)*210);this.fragmentIds.push(f.index);}
   this.blast(end,t-f.impact,520+f.index*25,1.55);this.knock(t,f.impact,f.target,86);
  }
 }
 hitMarks(t){
  const o=this.owner;
  for(const [index,target]of o.targets.entries()){
   if(!o.alive(target))continue;
   const mark=o.plan.hitMarks.findLast(m=>m.target===index&&t>=m.at&&t<m.at+(m.duration??.52));if(!mark)continue;
   const duration=mark.duration??.52;
   const age=t-mark.at,u=clamp(age/.08),enter=o.reducedMotion?1:1-Math.pow(1-u,3);
   const width=HIT_MARK_WIDTH*o.effectScale*(.88+.12*enter),alpha=clamp(age/.035)*clamp((duration-age)/.19);
   const head=o.engine.effectLayer.toLocal(target.view.toGlobal(target.hitEffectHeadPoint||{x:0,y:-target.fullBodyHeight*.9}));
   const p={x:head.x,y:head.y-width*.38-8-(o.reducedMotion?0:age/duration*10)};
   let pair=this.marks[index];if(!pair){const halo=new Sprite(o.assets.effects.monkey[0]),sprite=new Sprite(o.assets.effects.monkey[0]);for(const s of [halo,sprite]){s.anchor.set(.5);this.markLayer.addChild(s);}halo.blendMode='add';pair=this.marks[index]={halo,sprite};}
   const glow=mark.critical?.32+(o.reducedMotion?0:.1*Math.sin(age*7)):.16;
   for(const [s,k,a]of [[pair.sprite,1,alpha],[pair.halo,1.1,alpha*glow]]){s.visible=alpha>0;s.position.set(p.x,p.y);s.scale.set(width*k/s.texture.width);s.alpha=a;}
   this.activeMarks.push({target:index,at:mark.at,age,duration,width,critical:!!mark.critical,position:p,head});this.markAge=age;
  }
  this.markLayer.visible=this.activeMarks.length>0;
 }
 diagnostics(){return {shipVisible:this.layer.visible,shipWidth:this.layer.visible?this.ship.width:0,shipBehindCharacter:this.layer.parent===this.owner.engine.combatLayer&&this.layer.zIndex<this.owner.merc.root.zIndex,navalPhase:this.phase,navalFires:this.fires,navalShells:this.shells,navalBlasts:this.blasts,navalLargestBlast:this.peakBlastWidth,airburstFragments:this.fragmentIds,monkeyVisible:this.markLayer.visible,monkeyWidth:this.activeMarks[0]?.width||0,monkeyPosition:this.activeMarks[0]?.position||null,monkeyAnchor:'HIT_TARGET_HEAD',monkeyAge:this.markAge,monkeyMarks:this.activeMarks,cameraShake:this.owner.reducedMotion?0:this.shake};}
 destroy(){this.reset();this.layer.destroy({children:true});this.markLayer.destroy({children:true});}
}
