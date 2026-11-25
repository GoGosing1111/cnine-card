import {drawEffect} from './effects/effects.mjs';
import {drawSaintAtmosphere,drawSaintMaterials,saintActionCharge} from './aura.mjs';
import {skillList,skillPose} from './choreography.mjs';
function sprite(ctx,atlas,index,x,y,scale,facing,pivot,time,charge){
 const ref=atlas.sprites[atlas.frames[index]],p=atlas.compact?.5:1,[sx,sy,w,h]=ref.rect;
 ctx.save();ctx.translate(x,y);ctx.scale(facing*scale,scale);
 const dx=ref.offset[0]-pivot[0],dy=ref.offset[1]-pivot[1];
 ctx.drawImage(atlas.pages[ref.page],sx*p,sy*p,w*p,h*p,dx,dy,w,h);
 drawSaintMaterials(ctx,atlas,atlas.frames[index],ref,dx,dy,w,h,time,charge);ctx.restore();
}
function timeFor(t,duration,loop){
 if(!Number.isFinite(t)||t<0||!loop&&t>=duration)return null;
 return loop?t%duration:t;
}
const lookup=Object.fromEntries(skillList.map(s=>[s.id,s]));
export function drawBattlePose(ctx,actor,bank,cel,x,y,scale,facing,art=null,time=0,charge){
 const index=actor.banks[bank].start+cel;
 drawSaintAtmosphere(ctx,art,x,y,.846*scale,facing,time,1,actor.material,charge);
 sprite(ctx,actor,index,x,y,(bank==='combo'||bank==='high'?2.32:.846)*scale,facing,actor.pivots[index],time,charge);
}
export function actorPlacement(actor,id,t,options={}){
 const facing=options.facing<0?-1:1,scale=options.scale??1;
 const source=options.source??(facing<0?[890,575]:[370,575]),target=options.target??(facing<0?[512,382]:[768,382]),floor=options.floor??[target[0],source[1]];
 const pose=skillPose(id,t),bank=actor.banks[pose.bank],stepped=actor.stepped?.[id]?.[pose.returnIndex];
 const sample=stepped??(bank.start+pose.cel),pivot=actor.pivots[sample];
 let x=source[0]+(target[0]-source[0])*pose.reach,y=source[1];
 const direction=pose.reverse?-facing:facing;
 const unitScale=stepped!==undefined ? .846 : (bank.scale??(pose.bank==='combo' ? 2.32 : .846));
 const bodyScale=unitScale*scale;
 if(pose.landWeight>0){
  const landingPivot=pose.kind==='fall'?pivot:[288,668];
  x+=(floor[0]+facing*(183-landingPivot[0])*.846*scale-x)*pose.landWeight;
  y+=(floor[1]-(708-landingPivot[1])*.846*scale-y)*pose.landWeight;
 }
 return {x,y,sample,pivot,bodyScale,direction,facing,scale,target,floor};
}
export function drawSkill(ctx,assets,id,seconds,options={}){
 const s=lookup[id];if(!s||!assets.art||!assets.actor)return false;
 const t=timeFor(seconds,s.seconds,options.loop),size=options.scale??1;
 if(t===null||!Number.isFinite(size)||size<=0)return false;
 const {x,y,sample,pivot,bodyScale,direction,facing,scale,target,floor}=actorPlacement(assets.actor,id,t,options);
 const placement={source:[x+direction*22*scale,y-166*scale],target,floor,facing,scale};
 const layer=options.pass,time=options.auraTime??t;
 const charge=saintActionCharge(t,options.contactSeconds??s.contacts,s.seconds,time);
 if(!layer||layer==='rear'){
  drawSaintAtmosphere(ctx,assets.art,x,y,scale*.846,direction,time,.96,assets.actor.material,charge);
  drawEffect(ctx,assets.art,id,t,{...placement,pass:'rear'});
 }
 if(!layer||layer==='actor')sprite(ctx,assets.actor,sample,x,y,bodyScale,direction,pivot,time,charge);
 if(!layer||layer==='front')drawEffect(ctx,assets.art,id,t,{...placement,pass:'front'});
 return true;
}
