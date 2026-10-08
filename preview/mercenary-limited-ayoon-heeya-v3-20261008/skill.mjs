import {limitedDuo} from '../../shared/mercenary-limited-duo-20261008.mjs';
export const clamp=(n,a=0,b=1)=>Math.min(b,Math.max(a,n));
export function makePlan(code,mode='skill',contacts=null){
 const spec=limitedDuo(code);if(!spec)throw Error('Unknown limited duo');
 const impacts=mode==='basic'?[spec.basicImpact]:mode==='idle'?[]:spec.impacts;
 const actual=contacts??impacts.map(at=>({at,dodge:false}));
 const stopped=contacts&&contacts.length<impacts.length;
 return {code,mode,spec,contacts:actual,damageAuthority:'SERVER_ONLY',duration:stopped?(actual.at(-1)?.at||0)+.3:mode==='basic'?spec.basicDuration:mode==='idle'?4:spec.duration};
}
export function sample(plan,time){
 const t=clamp(time,0,plan.duration),done=t>=plan.duration,ayoon=plan.spec.id==='ayoon',skill=plan.mode==='skill';
 if(done||t<=0||plan.mode==='idle')return{pose:0,travel:0,destination:0,phase:done?'복귀 완료':'대기',done};
 let pose=0,travel=0,destination=0;
 if(ayoon){
  const first=plan.contacts[0]?.at||.65,last=plan.contacts.at(-1)?.at||first;
  travel=t<first-.18?clamp(t/(first-.18)):t>last+.24?1-clamp((t-last-.24)/Math.max(.15,plan.duration-last-.24)):1;
  if(t<.25)pose=t<.12?8:9;
  else if(!skill)pose=t<.55?1:t<.8?2:t<1.05?3:10;
  else if(t<.68)pose=1;else if(t<1.08)pose=2;else if(t<1.40)pose=5;else if(t<1.73)pose=4;else if(t<2.12)pose=5;else if(t<2.55)pose=6;else pose=t<2.8?7:10;
  destination=skill?(t<1.2?0:t<1.9?1:2):0;
 }else{
  pose=skill?4:1;
  const last=plan.contacts.at(-1)?.at||.58;
  for(let i=0;i<plan.contacts.length;i++)if(t>=plan.contacts[i].at-.12)pose=skill?(i===plan.contacts.length-1?7:i%2?6:5):2;
  if(t>last+.26)pose=3;
 }
 return{pose,travel,destination,phase:ayoon?(travel<1?'이동·복귀':'낫 연격'):'중화기 조준·포격',done};
}
