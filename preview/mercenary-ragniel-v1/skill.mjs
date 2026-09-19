export const RAGNIEL=Object.freeze({name:'라그니엘',rank:'SSS',code:'V-046',title:'종말의 대천사',ultimate:'종언의 백금성역',runtimeEnabled:false,balanceStatus:'NOT_ASSIGNED',damageAuthority:'SERVER_ONLY'});
export const MODES=Object.freeze({
 dash:{label:'백금 질주',duration:1.45,contacts:[],events:[[0,'날개 수축 · 무게중심 낮추기'],[.19,'지면을 박차고 돌진'],[.40,'착지 · 날개 제동'],[.85,'원위치 복귀']]},
 slash:{label:'성검 단죄',duration:1.85,contacts:[.66],events:[[0,'공격 거리 진입'],[.24,'대검 들어 올리기'],[.66,'검날 접촉'],[.90,'베기 후 체중 이동'],[1.28,'자세 회복']]},
 ultimate:{label:RAGNIEL.ultimate,duration:5.8,contacts:[1.58,2.42],events:[[0,'날개 개방 · 성검 집중'],[.72,'백금 질주'],[1.16,'첫 번째 대검격'],[1.58,'검날 접촉'],[1.78,'거대 성검 형성'],[2.32,'성검 낙하'],[2.42,'최종 심판 · 지면 충돌'],[2.62,'광익 파열'],[3.55,'금빛 파편 · 잔광 소멸']]}
});
const clamp=(n,a=0,b=1)=>Math.min(b,Math.max(a,n));
export function track(keys,t,{smooth=false}={}){
 if(t<=keys[0][0])return keys[0][1];
 for(let i=1;i<keys.length;i++)if(t<=keys[i][0]){const [a,x]=keys[i-1],[b,y]=keys[i];let p=clamp((t-a)/(b-a));if(smooth)p=p*p*(3-2*p);return x+(y-x)*p;}
 return keys.at(-1)[1];
}
function step(keys,t){let result=keys[0][1];for(const [at,value]of keys){if(t<at)break;result=value;}return result;}
const dashFrames=[[0,0],[.12,1],[.19,2],[.25,3],[.31,4],[.40,5],[.50,6],[.61,7]];
const slashFrames=[[0,0],[.07,1],[.14,2],[.19,3],[.24,4],[.33,5],[.42,6],[.48,7],[.56,8],[.66,9],[.80,10],[.92,11]];
const judgmentKeys=[[1.78,0],[1.90,1],[2.05,2],[2.20,3],[2.32,4],[2.42,5],[2.50,6],[2.62,7],[2.80,8],[3,9],[3.25,10],[3.55,11],[3.90,12],[4.30,13],[4.70,14],[5.10,15],[5.55,15]];
export function makePlan({mode='ultimate',cancelAt=null,targetLostAt=null}={}){
 if(!MODES[mode])throw Error('Unknown Ragniel motion');
 for(const value of [cancelAt,targetLostAt])if(value!==null&&(!Number.isFinite(value)||value<0))throw Error('Invalid cancellation time');
 const spec=MODES[mode],stop=Math.min(cancelAt??Infinity,targetLostAt??Infinity);
 return {mode,duration:spec.duration,stop:Number.isFinite(stop)?stop:null,contacts:spec.contacts.filter(t=>t<stop),events:spec.events.filter(([at])=>at<stop).map(([at,label])=>({at,label})).concat(Number.isFinite(stop)?[{at:stop,label:targetLostAt!==null&&targetLostAt<=stop?'대상 소멸 · 연출 정리':'시전 중단 · 연출 정리'}]:[]),damageAuthority:'NONE_VISUAL_PREVIEW'};
}
export function sample(plan,time){
 const t=clamp(Number(time)||0,0,plan.duration),cancelled=plan.stop!==null&&t>=plan.stop,done=t>=plan.duration;
 const result={time:t,cancelled,done,pose:null,travel:0,trail:false,slash:null,judgment:null,charge:0,dim:0,flash:0,recoil:0,events:plan.events.filter(e=>e.at<=t)};
 result.label=result.events.at(-1)?.label||'재생 대기';
 if(t<=0||done||cancelled)return result;
 const slashFx=at=>t>=at-.16&&t<at+.64?{frame:track([[at-.16,0],[at,4],[at+.09,6],[at+.26,8],[at+.48,10],[at+.64,11]],t),alpha:track([[at-.16,0],[at-.12,1],[at+.48,1],[at+.64,0]],t)}:null;
 if(plan.mode==='dash'){
  if(t<.74)result.pose={key:'dash',frame:step(dashFrames,t)};
  result.travel=track([[0,0],[.18,0],[.40,1],[.85,1],[1.3,0]],t,{smooth:true});result.trail=t>=.19&&t<.49;
 }else if(plan.mode==='slash'){
  result.travel=track([[0,0],[.24,1],[1.28,1],[1.7,0]],t,{smooth:true});
  if(t>=.24&&t<1.28)result.pose={key:'slash',frame:step(slashFrames,t-.24)};
  result.slash=slashFx(.66);
 }else{
  result.charge=track([[0,0],[.30,.75],[.65,1],[.82,0],[1.9,0],[2.25,1],[2.42,0]],t);
  result.dim=track([[0,0],[.5,.25],[1.5,.25],[1.95,.60],[2.42,.7],[2.6,.35],[3.5,0]],t);
  result.travel=track([[0,0],[.72,0],[1.16,1],[3.4,1],[4.18,0]],t,{smooth:true});
  if(t<.72)result.pose={key:'cast',frame:step([[0,0],[.22,1],[.43,2]],t)};
  else if(t<1.16){result.pose={key:'dash',frame:step(dashFrames,(t-.72)/.44*.61)};result.trail=true;}
  else if(t<1.98)result.pose={key:'slash',frame:step(slashFrames,(t-1.16))};
  else if(t<3.18)result.pose={key:'cast',frame:step([[1.98,2],[2.08,3],[2.22,4],[2.42,5]],t)};
  result.slash=slashFx(1.58);
  if(t>=1.78&&t<5.55)result.judgment={frame:track(judgmentKeys,t),alpha:track([[1.78,0],[1.90,1],[5.1,1],[5.55,0]],t)};
 }
 for(const at of plan.contacts){const age=t-at;if(age>=0&&age<.11){result.flash=Math.max(result.flash,(1-age/.11)*(at===2.42?.20:.09));result.recoil=Math.max(result.recoil,Math.sin(age/.11*Math.PI)* (at===2.42?7:4));}}
 return result;
}
