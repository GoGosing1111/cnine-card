import manifest from '../../../../assets/ui/project-v/account-battle-suits/z-sword-v1/manifest.json' with {type:'json'};
import {DASH_V2_SEQUENCE} from './ZBodyDashProfile.mjs';

export const Z_SWORD=manifest;
export const isZBody=code=>String(code||'').trim().toUpperCase()===manifest.suitCode;
const clamp=n=>Math.max(0,Math.min(1,n));
export function swordPose(sequence,ms){
  let index=sequence.steps.length-1;
  while(index>0&&ms<sequence.steps[index].atMs)index--;
  let travel=0,hop=0;const move=sequence.movement;
  if(move){
    if(ms>=move.startMs&&ms<move.arriveMs){
      const p=(ms-move.startMs)/(move.arriveMs-move.startMs);
      travel=p<.7?.86*(p/.7)**1.6:.86+.14*(1-(1-(p-.7)/.3)**2);hop=-9*Math.sin(Math.PI*p);
    }else if(ms>=move.arriveMs&&ms<move.returnMs)travel=1;
    else if(ms>=move.returnMs&&ms<move.homeMs){const p=(ms-move.returnMs)/(move.homeMs-move.returnMs);travel=1-p*p*(3-2*p);hop=-6*Math.sin(Math.PI*p);}
  }
  return{...sequence.steps[index],index,travel,hop};
}
export function swordEffectFrame(effect,age){
  if(age<0||age>=effect.durationMs)return null;
  let at=0,index=0;
  while(index<effect.frames.length-1&&age>=at+effect.frames[index].durationMs){at+=effect.frames[index].durationMs;index++;}
  const p=(age-at)/effect.frames[index].durationMs,s=clamp(p);
  return{index,next:Math.min(index+1,effect.frames.length-1),blend:clamp((p-.55)/.45),alpha:index===effect.frames.length-1?1-s*s*(3-2*s):1};
}
// A presentation batch contains only existing server receipts. No damage,
// target, cadence, equipment bonus or skill-chip entitlement is synthesized.
export function takeSwordBatch(queue,actionIndex){
  if(!queue.length)return null;
  const mode=actionIndex%3===1?'area':'dash',entries=[queue.shift()];
  while(queue.length&&entries.length<48&&(mode==='area'||queue[0].target===entries[0].target))entries.push(queue.shift());
  const impacts=mode==='area'?manifest.impactsMs:[DASH_V2_SEQUENCE.contactAtMs];
  return{mode,entries,impacts:entries.map((entry,i)=>({entry,atMs:impacts[Math.min(impacts.length-1,Math.floor(i*impacts.length/entries.length))]}))};
}
export function swordContactStop(target,scale){
  const frame=manifest.attack.frames.find(row=>row.id===manifest.attack.sequences.dash.steps[manifest.attack.sequences.dash.contactStep].frame);
  return{x:target.x-(frame.bladeTip.x-frame.pivot.x)*scale,y:target.y-(frame.bladeTip.y-frame.pivot.y)*scale};
}
