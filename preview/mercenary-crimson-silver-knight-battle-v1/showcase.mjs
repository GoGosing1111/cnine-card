import {MODES,makePlan,clamp} from './skill.mjs';

export const SHOWCASE_MODES=Object.freeze(['dash','attack','skill','overhead','execution','guard','ultimate']);
export const SHOWCASE_DURATION=SHOWCASE_MODES.reduce((sum,key)=>sum+MODES[key].duration,0);
export function showcaseAt(time){
 let local=clamp(time,0,SHOWCASE_DURATION);
 for(let index=0;index<SHOWCASE_MODES.length;index++){
  const mode=SHOWCASE_MODES[index],duration=MODES[mode].duration;
  if(local<duration||index===SHOWCASE_MODES.length-1)return {mode,index,time:Math.min(local,duration)};
  local-=duration;
 }
}

// A queue of existing V3 timelines, never a second animation clock or interval.
export class SkillShowcase{
 constructor(fx,onChange=()=>{}){this.fx=fx;this.onChange=onChange;this.active=false;this.index=-1;}
 start(){this.stop();this.active=true;this.index=0;this.fx.onComplete=()=>this.advance();this.fx.onCancel=()=>this.stop();this.playCurrent();}
 playCurrent(){this.fx.setPlan(makePlan({mode:SHOWCASE_MODES[this.index]}));this.onChange(this);this.fx.play();}
 advance(){
  if(!this.active)return;
  if(this.fx.sample.cancelled){this.stop();return;}
  if(this.index===SHOWCASE_MODES.length-1){this.stop(true);return;}
  this.index++;this.playCurrent();
 }
 stop(completed=false){this.active=false;this.completed=completed;this.fx.onComplete=null;this.fx.onCancel=null;this.onChange(this);}
 diagnostics(){return {active:this.active,completed:!!this.completed,index:this.index,total:SHOWCASE_MODES.length,mode:this.index<0?null:SHOWCASE_MODES[this.index],clockOwner:'CURRENT_V3_GSAP_TIMELINE'};}
}
