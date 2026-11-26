import {drawEffect} from './effects/effects.mjs';
import {drawSaintAtmosphere,drawSaintMaterials,saintActionCharge} from './aura.mjs';
import {skillList,skillPose} from './choreography.mjs';
import {bladeTracks} from './blade-tracks.mjs';
import {link,stamp,clamp,smooth} from './effects/paint.mjs';

// Match the visible spans of Ryujin's corresponding cuts in units of standing body height.
// The Ludo clips and their weapon lengths retain their own registered scale.
const fieldFxGain={basic:1.55,cleave:2.05,cyclone:2.05,rush:2.35,cross:3.45,orbit:2.05,
 wave:2.45,wings:2.20,rain:2.35,prison:2.15,pursuit:2.25,horizon:2.65};
export const saintFieldFxScale=(key,scale)=>scale*fieldFxGain[key];
const meleeEdges={drive:[5,358],draw:[17,202],send:[28,204],twin:[35,238]};

function bladeSegment(actor,sample,pivot,x,y,size,facing){
 const id=actor.frames[sample],track=bladeTracks[id];
 if(!track)return null;
 const offset=actor.sprites[id].offset;
 const point=(px,py)=>[x+facing*size*(offset[0]-pivot[0]+px),y+size*(offset[1]-pivot[1]+py)];
 return [point(track[0],track[1]),point(track[2],track[3])];
}
function nearestBladePoint(segment,target){
 const [a,b]=segment,dx=b[0]-a[0],dy=b[1]-a[1];
 const u=clamp(((target[0]-a[0])*dx+(target[1]-a[1])*dy)/(dx*dx+dy*dy||1));
 return [a[0]+dx*u,a[1]+dy*u];
}

export function drawBasicCut(ctx,assets,bank,cel,x,y,size,facing,target,seconds,contact){
 const effect=assets.art.gust,life=.31,peak=effect.time[effect.peak]/effect.duration;
 const u=peak+(seconds-contact)/life;
 if(u<=0||u>=1)return;
 const sample=assets.actor.banks[bank].start+cel;
 const segment=bladeSegment(assets.actor,sample,assets.actor.pivots[sample],x,y,(bank==='combo'||bank==='high'?2.32:.846)*size,facing);
 const start=segment?nearestBladePoint(segment,target):target;
 const gain=saintFieldFxScale('basic',size);
 stamp(ctx,assets.art,'gust',u,(start[0]+target[0])/2,(start[1]+target[1])/2,434*gain,158*gain,{flip:facing,angle:-.13*facing,bloom:.70});
}
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
 // Leading edge of the painted stroke, measured in its untrimmed Ludo cell.
 // Align the release without making the origin jump as cropped cells change.
 const edge=meleeEdges[pose.kind];
 if(edge&&['cross','cyclone','pursuit'].includes(id)){
  const strikePivot=actor.pivots[actor.banks.combo.start+edge[0]];
  const reachX=direction*(edge[1]-strikePivot[0])*2.32*scale;
  const lock=smooth((pose.progress-.16)/.42)*(1-smooth((pose.progress-.60)/.39));
  x+=clamp(target[0]-reachX-x,-175*scale,175*scale)*lock;
 }
 if(pose.landWeight>0){
  const landingPivot=pose.kind==='fall'?pivot:[288,668];
  // Frame 41 has the planted steel point at (195, 737) in the source cell.
  x+=(floor[0]+facing*(195-landingPivot[0])*.846*scale-x)*pose.landWeight;
  y+=(floor[1]-(737-landingPivot[1])*.846*scale-y)*pose.landWeight;
 }
 return {x,y,sample,pivot,bodyScale,direction,facing,scale,target,floor};
}
export function drawSkill(ctx,assets,id,seconds,options={}){
 const s=lookup[id];if(!s||!assets.art||!assets.actor)return false;
 const t=timeFor(seconds,s.seconds,options.loop),size=options.scale??1;
 if(t===null||!Number.isFinite(size)||size<=0)return false;
 const {x,y,sample,pivot,bodyScale,direction,facing,scale,target,floor}=actorPlacement(assets.actor,id,t,options);
 const source=[x+direction*22*scale,y-166*scale];
 const segment=bladeSegment(assets.actor,sample,pivot,x,y,bodyScale,direction);
 const placement={source,blade:segment?nearestBladePoint(segment,target):source,target,floor,facing,scale:options.effectScale??scale,actorScale:scale};
 const layer=options.pass,time=options.auraTime??t;
 const charge=saintActionCharge(t,options.contactSeconds??s.contacts,s.seconds,time);
 if(!layer||layer==='rear'){
  drawSaintAtmosphere(ctx,assets.art,x,y,scale*.846,direction,time,.96,assets.actor.material,charge);
  drawEffect(ctx,assets.art,id,t,{...placement,pass:'rear'});
 }
 if(!layer||layer==='actor')sprite(ctx,assets.actor,sample,x,y,bodyScale,direction,pivot,time,charge);
 if(!layer||layer==='front'){
  drawEffect(ctx,assets.art,id,t,{...placement,pass:'front'});
  if(segment&&options.contactSeconds&&['cyclone','rush','cross','pursuit'].includes(id)){
   const beat=options.contactSeconds.find(at=>t>=at&&t<at+.095);
   const gap=Math.hypot(target[0]-placement.blade[0],target[1]-placement.blade[1]);
   if(beat!==undefined&&gap>14*scale&&gap<250*scale)
    link(ctx,assets.art,placement.blade,target,.155+(t-beat)*7,39*scale,.90,.64);
  }
 }
 return true;
}
