export const CHARACTER=Object.freeze({name:'흑월 검객',rank:'SS',code:'V-998',nameStatus:'WORKING_LABEL',runtimeEnabled:false});
export const MODES=Object.freeze({
 idle:{label:'대기 자세',duration:4,contacts:[],events:[[0,'흑철 갑주 · 준비 자세']]},
 attack:{label:'기본 베기',duration:2.1,contacts:[.72],events:[[0,'검격 거리 진입'],[.4,'검 들어 올리기'],[.72,'내려베기 접촉'],[1.25,'자세 회복']]},
 skill:{label:'흑월 삼연참',duration:3.8,contacts:[.72,1.24,1.92],events:[[0,'전진 · 발검 준비'],[.72,'일섬 · 내려베기'],[1.24,'이섬 · 올려베기'],[1.92,'삼섬 · 횡베기'],[2.2,'교차 흔적 파열'],[3.1,'잔광 소멸 · 복귀']]}
});
const clamp=(v,a=0,b=1)=>Math.min(b,Math.max(a,v));
export function track(keys,t,smooth=false){if(t<=keys[0][0])return keys[0][1];for(let i=1;i<keys.length;i++)if(t<=keys[i][0]){const[a,x]=keys[i-1],[b,y]=keys[i];let p=clamp((t-a)/(b-a));if(smooth)p=p*p*(3-2*p);return x+(y-x)*p;}return keys.at(-1)[1];}
const step=(keys,t)=>{let out=keys[0][1];for(const[a,v]of keys){if(t<a)break;out=v;}return out;};
export function makePlan({mode='skill',cancelAt=null,targetLostAt=null}={}){
 if(!MODES[mode])throw Error('알 수 없는 연출');
 for(const v of[cancelAt,targetLostAt])if(v!==null&&(!Number.isFinite(v)||v<0))throw Error('Invalid cancellation time');
 const spec=MODES[mode],stop=Math.min(cancelAt??Infinity,targetLostAt??Infinity);
 return{mode,duration:spec.duration,stop:Number.isFinite(stop)?stop:null,contacts:spec.contacts.filter(t=>t<stop),events:spec.events.filter(([t])=>t<stop).map(([at,label])=>({at,label})).concat(Number.isFinite(stop)?[{at:stop,label:targetLostAt!==null&&targetLostAt<=stop?'대상 소멸 · 연출 종료':'시전 중단 · 원위치 복귀'}]:[]),damageAuthority:'NONE_VISUAL_PREVIEW'};
}
export function sample(plan,time){
 const t=clamp(Number(time)||0,0,plan.duration),cancelled=plan.stop!==null&&t>=plan.stop,done=t>=plan.duration;
 const s={time:t,cancelled,done,pose:null,travel:0,destination:0,effect:null,flash:0,recoil:0,trail:false,events:plan.events.filter(e=>e.at<=t)};
 s.label=s.events.at(-1)?.label||'준비';if(t<=0||done||cancelled||plan.mode==='idle')return s;
 const skill=plan.mode==='skill',leave=skill?3.08:1.3,end=skill?3.65:1.95;
 s.travel=track([[0,0],[.2,0],[.68,1],[leave,1],[end,0]],t,true);
 s.trail=t>.25&&t<.69;
 if(t<1.02)s.pose={key:'descending',frame:step([[0,0],[.4,1],[.72,2],[.89,3]],t)};
 else if(skill&&t<1.58)s.pose={key:'rising',frame:step([[1.02,0],[1.1,1],[1.24,2],[1.43,3]],t)};
 else if(skill&&t<2.6)s.pose={key:'finisher',frame:step([[1.58,0],[1.75,1],[1.92,2],[2.16,3]],t)};
 s.destination=skill?track([[0,0],[.93,0],[1.24,1],[1.48,1],[1.92,2]],t,true):0;
 const last=skill?3.25:1.48;
 if(t>.42&&t<last){
  const keys=skill?[[.42,0],[.56,2],[.72,4],[1,5],[1.24,7],[1.56,8],[1.92,10],[2.16,11],[2.6,13],[3.25,15]]:[[.42,0],[.56,2],[.72,4],[.96,5],[1.17,13],[1.48,15]];
  s.effect={frame:track(keys,t),alpha:track([[.42,0],[.55,1],[last-.27,1],[last,0]],t)};
 }
 for(const at of plan.contacts){const age=t-at;if(age>=0&&age<.14){s.flash=Math.max(s.flash,(1-age/.14)*.07);s.recoil=Math.max(s.recoil,Math.sin(age/.14*Math.PI)*4);}}
 return s;
}
