import {clamp} from '../skill.mjs';

// Fleet and field artillery share the same authored explosion and screen scale.
export const BOMBARDMENT_VISUALS=Object.freeze({
 effect:'cataclysm',impactWidths:[680,790],impactDuration:2.05,
 finale:[{x:950,w:670,delay:0},{x:1190,w:780,delay:.10},{x:1400,w:490,delay:.23}],
 finaleDuration:2.65,smokeWidth:1100,smokeDuration:1.3
});
export function bombardmentWidth(sceneWidth,x,openingVolley){
 return Math.min(BOMBARDMENT_VISUALS.impactWidths[openingVolley?0:1],(sceneWidth-12-x)/.44);
}
export function drawBombardmentBlast(owner,p,age,width,duration=2.25){
 if(age<0||age>=duration)return null;
 const u=age/duration,stops=[0,.08,.20,.39,.65,.86,1];
 let phase=0;while(phase<5&&u>=stops[phase+1])phase++;
 const mix=clamp((u-stops[phase])/(stops[phase+1]-stops[phase]));
 const alpha=Math.min(1,(duration-age)/.35)*(owner.reducedMotion?.63:1);
 const effect=BOMBARDMENT_VISUALS.effect,anchor=owner.manifest.effects[effect][0].anchor;
 owner.draw(owner.assets.effects[effect][phase],p,width,{anchor,alpha:alpha*(1-mix)});
 if(phase<5)owner.draw(owner.assets.effects[effect][phase+1],p,width,{anchor,alpha:alpha*mix});
 owner.impactCount++;
 return {x:p.x,y:p.y,width,phase,age,effect};
}
export function drawBombardmentSmoke(owner,groundY,age){
 const {smokeDuration:duration,smokeWidth:width}=BOMBARDMENT_VISUALS;
 if(age<0||age>=duration)return;
 const index=Math.min(5,Math.floor(age/duration*6));
 owner.draw(owner.assets.effects.groundSmoke[index],{x:owner.stagePoint(1100,640).x,y:groundY+8*owner.effectScale},width,{
  anchor:owner.manifest.effects.groundSmoke[0].anchor,
  alpha:(owner.reducedMotion?.25:.68)*Math.min(1,(duration-age)*3)
 });
}
