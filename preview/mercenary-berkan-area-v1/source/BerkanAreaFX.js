import {BerkanFX} from '../../mercenary-berkan-sss-v1/source/BerkanFX.js';
import {sample} from '../skill.mjs';
// Reuses the live V3 layer, sprite pool, silhouette and registered GSAP controls.
// Only this independent preview imports the new area sequence.
export class BerkanAreaFX extends BerkanFX{
 render(time){
  if(this.plan.mode!=='area'||this.destroyed)return super.render(time);
  const update=this.onUpdate;this.onUpdate=()=>{};super.render(time);this.onUpdate=update;
  if(this.resting){this.onUpdate(this);return;}
  const state=sample(this.plan,time);this.sample=state;this.applyPose(state.pose);this.updateAura(state);
  const targets=this.targets.filter(t=>!t.root.destroyed),own=this.bodyHeight*Math.abs(this.merc.root.scale.y);
  targets.forEach(target=>{const i=this.targets.indexOf(target),hit=!this.plan.dodge&&!this.plan.targetDodges?.[target.id];target.view.x=this.targetDefaults[i].x+(hit?state.recoil:0);target.fullBodySprite.tint=hit&&state.recoil>.1?0xffda8b:this.targetDefaults[i].tint;});
  if(!state.cancelled&&!state.done&&targets.length){
   const feet=targets.map(t=>this.point(t)),center={x:feet.reduce((n,p)=>n+p.x,0)/feet.length,y:feet.reduce((n,p)=>n+p.y,0)/feet.length};
   const spread=Math.max(...feet.map(p=>p.x))-Math.min(...feet.map(p=>p.x));
   let fieldSize=Math.max(own*2.4,spread+own*1.35);
   const screen=this.engine.app?.screen;
   if(screen){
    const left=this.engine.effectLayer.toLocal({x:0,y:0}).x,right=this.engine.effectLayer.toLocal({x:screen.width,y:0}).x;
    fieldSize=Math.min(fieldSize,(right-left)*.9);
    center.x=Math.max(left+fieldSize*.46,Math.min(right-fieldSize*.46,center.x));
   }
   for(const e of state.effects){
    if(e.anchor==='bow')this.sequence(e.key,e,this.bowPoint(state.pose),own*1.1);
    else if(e.anchor==='formation')this.sequence(e.key,e,center,fieldSize);
    else for(const target of targets)if(!this.plan.targetDodges?.[target.id])this.sequence(e.key,e,this.point(target,.1),own*.8);
   }
  }
  this.engine.sortCombatDepth();this.onUpdate(this);
 }
}
