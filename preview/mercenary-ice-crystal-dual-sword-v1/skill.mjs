export const ICE = Object.freeze({name:'크라이베른',title:'',rank:'SSS',code:'V-048',nameStatus:'USER_ASSIGNED_NAME',runtimeEnabled:false,balanceStatus:'LOCAL_TESTED_CANDIDATE',damageAuthority:'SERVER_ONLY'});
export const MODES = Object.freeze({
  aura:{label:'고강화 광원',duration:6,contacts:[],events:[[0,'갑옷·쌍검 실루엣 광원'],[1.2,'청백색 광휘 맥동'],[3,'결정 입자 상승'],[4.5,'냉기 잔광']]},
  dash:{label:'빙광 질주',duration:1.6,contacts:[],events:[[0,'중심 낮추기'],[.18,'지면을 박차고 돌진'],[.38,'착지·감속'],[.88,'원위치 복귀']]},
  attack:{label:'쌍검 연격',duration:2.05,contacts:[.53,.78],events:[[0,'공격 거리 진입'],[.23,'첫 번째 검 들어 올리기'],[.53,'첫 검격 접촉'],[.78,'반대 검격 접촉'],[1.46,'자세 회복']]},
  cross:{label:'빙정 십자참',duration:2.5,contacts:[.68],events:[[0,'쌍검 벌리기'],[.24,'전진 준비'],[.68,'X자 교차 접촉'],[.94,'빙정 균열·파편'],[1.7,'복귀']]},
  cyclone:{label:'쌍룡 빙선풍',duration:3.4,contacts:[.74,1.26],events:[[0,'회전 거리 진입'],[.37,'회전 예비 동작'],[.74,'첫 회전 베기'],[1.26,'쌍검 집중 파열'],[1.8,'회전 제동'],[2.5,'복귀']]},
  guard:{label:'수정 반격벽',duration:2.6,contacts:[.74],events:[[0,'쌍검 방어 자세'],[.3,'결정벽 형성'],[.74,'교차 검·방벽 접촉'],[1.2,'반사 파편 방출'],[1.8,'방어 해제']]},
  ultimate:{label:'극빙 왕관',duration:6.2,contacts:[1.3,2.62],events:[[0,'갑옷·쌍검 광원 집중'],[.64,'빙광 질주'],[1.3,'첫 십자 검격'],[1.82,'쌍검 상단 집결'],[2.4,'지면 결정 솟구침'],[2.62,'극빙 왕관 파열'],[3.1,'파편·충격파 확산'],[4.4,'잔향 소멸·복귀']]}
});
const clamp=(n,a=0,b=1)=>Math.min(b,Math.max(a,n));
export function track(keys,t,{smooth=false}={}){
 if(t<=keys[0][0])return keys[0][1];
 for(let i=1;i<keys.length;i++)if(t<=keys[i][0]){const [a,x]=keys[i-1],[b,y]=keys[i];let p=clamp((t-a)/(b-a));if(smooth)p=p*p*(3-2*p);return x+(y-x)*p;}
 return keys.at(-1)[1];
}
function step(keys,t){let result=keys[0][1];for(const [at,value] of keys){if(t<at)break;result=value;}return result;}
const frames=(times)=>times.map((at,i)=>[at,i]);
const DASH=frames([0,.11,.18,.24,.30,.38,.48,.59]);
const ATTACK=frames([.23,.31,.39,.46,.53,.61,.70,.78,.89,.99,1.11,1.26]);
const CROSS=frames([.1,.28,.49,.68,.79,.92,1.12,1.39]);
const CYCLONE=frames([.29,.45,.74,.85,.96,1.06,1.16,1.26,1.39,1.57,1.78,2.02]);
const GUARD=frames([.08,.27,.46,.74,1.16,1.6]);
const CAST=frames([1.82,1.94,2.09,2.24,2.43,2.62,2.83,3.14]);
export function makePlan({mode='aura',cancelAt=null,targetLostAt=null}={}){
 if(!MODES[mode])throw Error('Unknown ice dual-sword motion');
 for(const value of [cancelAt,targetLostAt])if(value!==null&&(!Number.isFinite(value)||value<0))throw Error('Invalid cancellation time');
 const spec=MODES[mode],stop=Math.min(cancelAt??Infinity,targetLostAt??Infinity);
 const cues=mode==='dash'?[['dash',.18,.178]]:mode==='ultimate'?[['dash',.75,.178],['slash',1.3,.25],['ultimate',2.62,.333]]:spec.contacts.map(t=>['slash',t,.25]);
 return {mode,duration:spec.duration,stop:Number.isFinite(stop)?stop:null,contacts:spec.contacts.filter(t=>t<stop),audioCues:cues.filter(([,t])=>t<stop),events:spec.events.filter(([at])=>at<stop).map(([at,label])=>({at,label})).concat(Number.isFinite(stop)?[{at:stop,label:targetLostAt!==null&&targetLostAt<=stop?'대상 소멸 · 연출 정리':'시전 중단 · 연출 정리'}]:[]),damageAuthority:'NONE_VISUAL_PREVIEW'};
}
export function sample(plan,time){
 const t=clamp(Number(time)||0,0,plan.duration),cancelled=plan.stop!==null&&t>=plan.stop,done=t>=plan.duration;
 const s={time:t,cancelled,done,pose:null,travel:0,contactTrack:null,trail:false,effects:[],charge:0,dim:0,flash:0,recoil:0,auraBoost:0,events:plan.events.filter(e=>e.at<=t)};
 s.label=s.events.at(-1)?.label||'재생 대기';
 if(t<=0||done||cancelled)return s;
 const effect=(key,at,pre,post,peak,last,anchor='target')=>{
  if(t>=at-pre&&t<at+post)s.effects.push({key,anchor,frame:track([[at-pre,0],[at,peak],[at+post*.22,peak+(last-peak)*.32],[at+post*.6,peak+(last-peak)*.76],[at+post,last]],t),alpha:track([[at-pre,0],[at-pre*.7,1],[at+post*.8,1],[at+post,0]],t)});
 };
 if(plan.mode==='aura'){s.auraBoost=.28+.22*Math.sin(t*Math.PI);s.charge=.24;}
 else if(plan.mode==='dash'){
  if(t<.75)s.pose={key:'dash',frame:step(DASH,t)};
  s.travel=track([[0,0],[.18,0],[.38,1],[.88,1],[1.45,0]],t,{smooth:true});s.trail=t>=.18&&t<.51;s.auraBoost=.4;
 }else if(plan.mode==='attack'){
  s.contactTrack={key:'attack',blend:track([[.6,0],[.78,1]],t,{smooth:true})};
  s.travel=track([[0,0],[.23,1],[1.46,1],[1.9,0]],t,{smooth:true});
  if(t>=.23&&t<1.46)s.pose={key:'attack',frame:step(ATTACK,t)};
  for(const at of plan.contacts)effect('slash',at,.14,.64,4,11);
 }else if(plan.mode==='cross'){
  s.contactTrack={key:'cross',blend:0};s.travel=track([[0,0],[.28,.28],[.68,1],[1.7,1],[2.25,0]],t,{smooth:true});
  if(t>=.1&&t<1.7)s.pose={key:'cross',frame:step(CROSS,t)};
  effect('cross',.68,.2,1.1,4,11);s.trail=t>.42&&t<.69;s.auraBoost=.35;
 }else if(plan.mode==='cyclone'){
  s.contactTrack={key:'cyclone',blend:track([[.85,0],[1.26,1]],t,{smooth:true})};s.travel=track([[0,0],[.37,1],[2.5,1],[3.1,0]],t,{smooth:true});
  if(t>=.29&&t<2.3)s.pose={key:'cyclone',frame:step(CYCLONE,t)};
  effect('slash',.74,.13,.55,4,11);effect('cyclone',1.26,.86,1.5,8,15,'targetGround');s.auraBoost=.6;
 }else if(plan.mode==='guard'){
  if(t>=.08&&t<1.95)s.pose={key:'guard',frame:step(GUARD,t)};
  effect('guard',.74,.7,1.36,5,11,'guard');s.charge=track([[0,0],[.3,.65],[.74,1],[1.4,0]],t);s.auraBoost=.55;
 }else{
  s.contactTrack={key:'cross',blend:0};s.travel=track([[0,0],[.64,0],[1.08,1],[4.35,1],[5.05,0]],t,{smooth:true});
  s.charge=track([[0,0],[.25,.75],[.6,1],[.82,0],[1.82,0],[2.35,1],[2.62,0]],t);
  s.dim=track([[0,0],[.45,.25],[1.8,.25],[2.3,.5],[2.62,.58],[2.8,.28],[3.8,0]],t);
  s.auraBoost=track([[0,.3],[.6,.85],[1.1,.4],[2.5,1],[2.8,.9],[4,.2],[5.3,0]],t);
  if(t<.64)s.pose={key:'cast',frame:step([[0,0],[.25,1],[.45,2]],t)};
  else if(t<1.08){s.pose={key:'dash',frame:step(DASH,(t-.64)/.44*.59)};s.trail=true;}
  else if(t<1.82)s.pose={key:'cross',frame:step(frames([1.08,1.14,1.22,1.3,1.4,1.5,1.62,1.72]),t)};
  else if(t<3.5)s.pose={key:'cast',frame:step(CAST,t)};
  effect('cross',1.3,.15,.85,4,11);effect('ultimate',2.62,.96,2.96,5,15,'targetGround');
 }
 for(const at of plan.contacts){const age=t-at;if(age>=0&&age<.13){const ultimate=plan.mode==='ultimate'&&at===2.62;s.flash=Math.max(s.flash,(1-age/.13)*(ultimate?.15:.055));s.recoil=Math.max(s.recoil,Math.sin(age/.13*Math.PI)*(ultimate?8:4));}}
 return s;
}
