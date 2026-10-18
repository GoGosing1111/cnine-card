import {clamp,sample,RIFLE_FLIGHT} from '../../../mercenary-monochrome-artillery-battle-v1/skill.mjs';
import {trajectory} from '../../../mercenary-monochrome-artillery-battle-v1/source/BallisticArtilleryFX.js';

// Visual samples only. Server contacts, shot counts and HP stay in playback.
export function renderShiranuiSilverRifle(fx,t,muzzle,axis,unit){
 const {mode,rifleLaunches:launches}=fx.plan;
 if(mode==='aura'||!launches.length)return;
 const target=fx.targets.reduce((a,b)=>Math.abs(fx.point(a).y-muzzle.y)<Math.abs(fx.point(b).y-muzzle.y)?a:b);
 fx.rifleTarget=target;
 const end=fx.point(target),skill=mode==='skill',quiet=fx.reducedMotion;
 if(skill&&t<launches[0])fx.draw('ar-ballistics',0,muzzle,unit*.42,{angle:axis,alpha:clamp(t/launches[0])*(quiet?.3:.65),smooth:false});
 for(const [i,launch]of launches.entries()){
  const hit=launch+RIFLE_FLIGHT,age=t-launch,pose=sample(fx.plan,launch+.001).pose,start=fx.anchorPoint('muzzle',pose);
  if(age>=0&&age<.055&&(!quiet||i%3===0)){
   const phase=age<.018?0:age<.037?1:2;
   fx.draw('ar-ballistics',phase,muzzle,unit*(skill?.62:.5),{angle:axis,alpha:clamp((.055-age)/.018)*(quiet?.45:1),smooth:false});
   fx.muzzleChecks.push({kind:'RIFLE_FLASH',from:muzzle,to:muzzle,crossAxisError:0});
  }
  if(age>=0&&t<hit){
   const q=clamp(age/RIFLE_FLIGHT),p=trajectory(start,end,axis,q,unit*.32);
   fx.draw('ar-ballistics',4+q*3,p,unit*(skill?1.02:.84)*(quiet?.75:1),{angle:p.angle,smooth:false});
  }
  if(t>=hit&&t<hit+.2&&(!quiet||i%3===0)){
   const q=(t-hit)/.2;
   fx.draw('ar-ballistics',8+q*3,end,unit*(skill?.94:.72),{alpha:clamp((hit+.2-t)/.07)*(quiet?.55:.9),smooth:false});
  }
  fx.contactChecks.push({kind:'RIFLE',shot:i,at:hit,targetId:target.id,from:start,to:end,mapping:'MUZZLE_TO_TARGET_CHEST',angle:axis});
 }
 if(!skill)return;
 const first=launches[0]+RIFLE_FLIGHT,last=launches.at(-1)+RIFLE_FLIGHT;
 // The fractured halo builds under the existing skull mark during the burst.
 if(t>=first&&t<last)fx.draw('silver-rupture',Math.min(2,(t-first)/.22),end,unit*(quiet?.95:1.18),{alpha:quiet?.22:.4,smooth:false});
 // Authored fracture phases punctuate each six-round cluster.
 if(!quiet)for(let i=5;i<launches.length-1;i+=6){
  const age=t-(launches[i]+RIFLE_FLIGHT);
  if(age>=0&&age<.24)fx.draw('silver-rupture',3+age/.24*4,end,unit*1.24,{alpha:Math.min(.72,clamp(age/.025),clamp((.24-age)/.06)),smooth:false});
 }
 fx.skullBurst(t,first,last+.08,target,unit*.94);
 // Final-shot expansion, fragmentation and decay follow the actual target.
 const finish=t-last;
 if(finish>=0&&finish<.8){
  const frame=finish<.22?3+finish/.22*3:6+(finish-.22)/.58*5;
  fx.draw('silver-rupture',frame,end,unit*(quiet?1.2:1.72),{alpha:Math.min(quiet?.5:1,clamp(finish/.025),clamp((.8-finish)/.18)),smooth:false});
 }
}
