import {Texture,Rectangle} from 'pixi.js';
import {draftBoss} from '../../../../../shared/apocalypse-trio-v1.mjs';
const clamp=v=>Math.max(0,Math.min(1,v));
const smooth=v=>{v=clamp(v);return v*v*(3-2*v);};
const gate=(t,a,b,c,d)=>smooth((t-a)/(b-a))*(1-smooth((t-c)/(d-c)));
export const CUT_END=.9;
const footAnchors={
 'infected-soldier':[.925,.925,.957,.953],
 'hell-general':[.89,.89,.89,.935],
 'archdemon':[.95,.95,.94,.97]
};

// The enemy view already mirrors source art. Counter-mirror this left-facing
// rifle source so the soldier faces the player's formation in the real engine.
export function configureTrioActors(engine){
 for(const actor of engine.enemies||[]){
  const boss=draftBoss(actor.battleCard||actor);
  if(!boss){
   if(actor.trioBossKey){actor.artFacing=1;actor.applyFacing();actor.art={...actor.art,calmIdle:actor.trioPreviousCalmIdle};actor.captureNeutralAvatarPose();actor.trioBossKey=null;}
   continue;
  }
  if(!actor.trioBossKey)actor.trioPreviousCalmIdle=actor.art?.calmIdle;
  actor.animationAdapter?.kill?.();
  // A reused actor may retain a mirrored action sprite. Facing belongs to the
  // view; normalize the body as well before freezing the next idle/rest pose.
  // Testing view.scale alone misses this second, inherited mirror.
  if(actor.fullBodySprite)actor.fullBodySprite.scale.x=Math.abs(actor.fullBodySprite.scale.x);
  actor.artFacing=boss.key==='infected-soldier'?-1:1;actor.applyFacing();
  actor.art={...actor.art,calmIdle:true};actor.captureNeutralAvatarPose();
  actor.trioBossKey=boss.key;
 }
}

/** Owns the existing BattleCharacter's sprite and world position, never a clone. */
export class TrioActorMotion{
 constructor(engine,actor,skill,sheet,points){
  this.engine=engine;this.actor=actor;this.skill=skill;this.body=actor.fullBodySprite;this.released=false;this.pose=-1;
  this.frames=Array.from({length:4},(_,i)=>new Texture({source:sheet.source,frame:new Rectangle(i%2*sheet.width/2,Math.floor(i/2)*sheet.height/2,sheet.width/2,sheet.height/2)}));
  actor.animationAdapter?.kill?.();
  const body=this.body;
  this.home={x:actor.root.x,y:actor.root.y,zIndex:actor.root.zIndex,rootScaleX:actor.root.scale.x,rootScaleY:actor.root.scale.y,state:actor.state,owned:actor.cooperativeActionActive};
  this.rest={texture:body.texture,scaleX:body.scale.x,scaleY:body.scale.y,x:body.x,y:body.y,rotation:body.rotation,alpha:body.alpha,visible:body.visible,anchorX:body.anchor.x,anchorY:body.anchor.y};
  this.height=body.height;this.width=body.width;
  // A mercenary can briefly cross behind the boss during its dash/recovery.
  // Keep the boss facing the opposing formation, never that transient point.
  this.direction=actor.team==='ENEMY'?-1:1;
  this.target=points.filter(p=>(p.x-this.home.x)*this.direction>0).sort((a,b)=>Math.hypot(a.x-this.home.x,a.y-this.home.y)-Math.hypot(b.x-this.home.x,b.y-this.home.y))[0]||{x:this.home.x+this.direction*100,y:this.home.y};
  const clearance=this.width*Math.abs(actor.root.scale.x)*.5+80;
  this.travel=this.direction*Math.min(engine.scene.width*.45,Math.max(0,Math.abs(this.target.x-this.home.x)-clearance));
  actor.cooperativeActionActive=true;actor.trioMotion=this;this.render(0);
 }
 restoreBody(){
  const b=this.body,r=this.rest;b.texture=r.texture;b.scale.set(r.scaleX,r.scaleY);b.anchor.set(r.anchorX,r.anchorY);b.position.set(r.x,r.y);b.rotation=r.rotation;b.alpha=r.alpha;b.visible=r.visible;this.pose=-1;
 }
 render(t){
  if(this.released||this.actor.root.destroyed)return;
  const a=this.actor,b=this.body,home=this.home,{impactAt:impact,duration:end,kind,boss:key}=this.skill;
  a.root.position.set(home.x,home.y);a.root.scale.set(home.rootScaleX,home.rootScaleY);
  // The cut is a stationary image. All authored body movement starts afterward.
  if(t<=CUT_END||t>=end-.05){this.restoreBody();a.state=home.state;return;}
  a.state='ATTACK';b.visible=true;b.alpha=this.rest.alpha;
  const frame=kind==='ultimate'?(t<impact-.12?0:t<impact+.18?1:t<impact+.58?2:3):(t<impact+.18?0:3);
  this.pose=frame;b.texture=this.frames[frame];b.anchor.set(.5,footAnchors[key][frame]);
  // Action drawings face left in source space; face the actual target after
  // accounting for the engine's already-mirrored enemy view.
  const scale=this.height/b.texture.height;
  b.scale.set(scale*(-this.direction)/(Math.sign(a.view.scale.x)||1),scale);b.position.set(this.rest.x,this.rest.y);b.rotation=this.rest.rotation;
  const reduced=this.engine.reducedMotion;
  if(kind!=='ultimate')return;
  if(key==='infected-soldier'){
   if(!reduced)a.root.x-=this.direction*gate(t,impact,impact+.09,impact+.16,impact+.58)*24;
  }else if(key==='hell-general'){
   const charge=gate(t,1.28,impact-.12,impact+.30,end-.12);
   a.root.x+=this.travel*charge;a.root.y+=(this.target.y-home.y)*charge;
  }else{
   const dive=gate(t,1.35,impact,impact+.28,end-.10);
   a.root.x+=this.travel*dive;a.root.y+=(this.target.y-home.y)*dive;
   if(!reduced)a.root.y-=gate(t,.95,1.7,impact-.45,impact+.08)*100;
  }
  this.engine.sortCombatDepth?.();
 }
 launchPoint(){
  const b=this.body;
  return this.engine.effectLayer.toLocal(b.toGlobal({x:-b.texture.width*.43,y:-b.texture.height*.66}));
 }
 release(){
  if(this.released)return;this.released=true;
  const a=this.actor;if(!a.root.destroyed){
   this.restoreBody();a.root.position.set(this.home.x,this.home.y);a.root.scale.set(this.home.rootScaleX,this.home.rootScaleY);a.root.zIndex=this.home.zIndex;
   a.cooperativeActionActive=this.home.owned;if(a.trioMotion===this)a.trioMotion=null;
   a.setState(a.hp<=0?'DEAD':this.home.state==='DEAD'?'IDLE':this.home.state);
   this.engine.sortCombatDepth?.();
  }
  for(const texture of this.frames)texture.destroy(false);
 }
}
