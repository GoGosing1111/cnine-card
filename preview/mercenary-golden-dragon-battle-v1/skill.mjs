export const clamp=(n,a=0,b=1)=>Math.min(b,Math.max(a,n));
export function track(keys,t){if(t<=keys[0][0])return keys[0][1];for(let i=1;i<keys.length;i++){if(t<=keys[i][0]){const[a,x]=keys[i-1],[b,y]=keys[i];return x+(y-x)*clamp((t-a)/(b-a));}}return keys.at(-1)[1];}
export const MODES=Object.freeze({
 aura:{label:'용혼 · 상시 아우라',duration:5.4,contacts:[],description:'몸을 감싸는 금린의 흐름과 황금 용의 수호',events:[[0,'금린 아우라 순환'],[1.2,'용혼의 호흡'],[3.4,'황금 잔광']]},
 dash:{label:'용린보 · 대시',duration:1.8,contacts:[],description:'용의 비늘이 흩날리는 고속 이동과 착지',events:[[0,'지면을 딛고 압축'],[.22,'용린 잔광 · 가속'],[.62,'착지 · 제동'],[1.05,'복귀 대시']]},
 attack:{label:'금룡일섬 · 검격',duration:2.25,contacts:[.79],description:'검끝을 따라 터지는 용형 검기와 정밀한 한 번의 참격',events:[[0,'검격 준비'],[.16,'접근'],[.45,'검을 들어 힘 싣기'],[.79,'금룡일섬 · 접촉'],[1.12,'검기 소멸'],[1.53,'자세 복귀']]},
 skill:{label:'용령파 · 스킬',duration:3.4,contacts:[1.5,1.65,1.8],description:'손짓으로 소환한 황금 용이 적진을 관통하며 비늘을 남긴다',events:[[0,'용인 문양 충전'],[.55,'손을 들어 용혼 소환'],[.96,'용령파 방출'],[1.5,'선두 충돌'],[1.8,'후열 관통'],[2.4,'금린 잔향']]},
 ultimate:{label:'천룡강림 · 광역기',duration:4.7,contacts:[2.08,2.30,2.52],description:'검의 봉인을 풀어 천룡을 낙하시킨 뒤 전장 전체에 세 겹의 충격파',events:[[0,'용의 봉인 개방'],[.6,'검을 들어 용혼 집중'],[1.2,'천룡 낙하 예고'],[1.82,'검을 내려친다'],[2.08,'천룡강림 · 첫 충돌'],[2.30,'금린 폭쇄'],[2.52,'전장 충격파'],[3.6,'용혼 승천 · 잔향']]},
 hit:{label:'피격 · 회복',duration:1.4,contacts:[],description:'충격을 받아내고 다시 검을 쥐는 동작',events:[[0,'피격'],[.25,'충격 흡수'],[.75,'자세 회복']]},
 defeat:{label:'쓰러짐',duration:2.6,contacts:[],description:'검에 몸을 의지하며 무릎을 꿇는다',events:[[0,'힘이 소진된다'],[.6,'무릎을 꿇는다'],[1.5,'검으로 버틴다'],[2.2,'정착']]}
});
export const SHOWCASE=['aura','dash','attack','skill','ultimate','hit','defeat'];
export function makePlan({mode='ultimate',cancelAt=null,targetLostAt=null}={}){
 if(!MODES[mode])throw Error('Unknown sequence');
 for(const x of [cancelAt,targetLostAt])if(x!==null&&(!Number.isFinite(x)||x<0))throw Error('Invalid stop time');
 const def=MODES[mode],stop=Math.min(cancelAt??Infinity,targetLostAt??Infinity),contacts=def.contacts.filter(t=>t<stop),audioCues=[];
 if(mode==='dash')audioCues.push(['dash',.22,.178],['dash',1.15,.178]);
 if(mode==='attack')audioCues.push(['dash',.20,.178],['slash',.79,.25]);
 if(mode==='skill')audioCues.push(['dash',.96,.178],['ultimate',1.5,.333]);
 if(mode==='ultimate')audioCues.push(['dash',1.2,.178],['ultimate',2.08,.333],['slash',2.52,.25]);
 return {mode,duration:def.duration,stop:Number.isFinite(stop)?stop:null,contacts,audioCues:audioCues.filter(x=>x[1]<stop),events:def.events.filter(x=>x[0]<stop),damageAuthority:'NONE_VISUAL_PREVIEW'};
}
export function sample(plan,t){
 t=clamp(Number(t)||0,0,plan.duration);
 const s={time:t,pose:{key:'idle',frame:Math.floor(t*4)%6},travel:0,effects:[],impacts:[],flash:0,charge:0,cutin:0,trail:0,auraBoost:0,done:t>=plan.duration,cancelled:plan.stop!==null&&t>=plan.stop,label:plan.events.filter(e=>e[0]<=t).at(-1)?.[1]||'대기'};
 if(s.cancelled||s.done){s.pose={key:plan.mode==='defeat'&&!s.cancelled?'defeat':'idle',frame:plan.mode==='defeat'&&!s.cancelled?5:0};return s;}
 const pose=(key,keys)=>{s.pose={key,frame:Math.floor(track(keys,t)+.00001)};};
 const fx=(key,start,peak,end,anchor,strength=1,peakFrame=5,offset=0)=>{
  if(t<start||t>=end)return;
  const f=track([[start,0],[peak,peakFrame],[end,11]],t),alpha=strength*track([[start,0],[start+.07,1],[end-.16,1],[end,0]],t);
  s.effects.push({key,frame:f,alpha,anchor,offset});
 };
 if(plan.mode==='dash'){
  s.travel=track([[0,0],[.12,0],[.42,1],[.95,1],[1.32,0],[1.8,0]],t);
  pose('dash',[[0,0],[.13,1],[.28,2],[.56,3],[.76,4],[1.02,0],[1.16,1],[1.25,2],[1.42,3],[1.6,4]]);
  s.trail=(t<.72||t>1.05&&t<1.58)?1:0;
  fx('dashfx',.08,.30,.92,'dash',.94);fx('dashfx',1.03,1.24,1.78,'dash',.8);
 }else if(plan.mode==='attack'){
  s.travel=track([[0,0],[.12,0],[.39,1],[1.3,1],[1.67,0]],t);
  if(t<.40)pose('dash',[[0,0],[.16,1],[.25,2],[.37,4]]);
  else if(t<1.35)pose('slash',[[.4,0],[.48,1],[.71,2],[.79,3],[.91,4],[1.2,5]]);
  else if(t<1.72)pose('dash',[[1.35,2],[1.56,3],[1.69,4]]);
  s.trail=t>.14&&t<.39||t>1.35&&t<1.69?1:0;
  fx('dashfx',.10,.22,.5,'dash',.65);
  fx('blade',.62,.79,1.40,'blade',1,4);fx('impact',.72,.79,1.52,'target',.85,4);
  s.auraBoost=.3;
 }else if(plan.mode==='skill'){
  pose('cast',[[0,0],[.28,1],[.7,2],[.96,3],[1.95,3],[2.35,4],[2.78,5]]);
  fx('charge',.08,.78,1.55,'selfGround',.85,6);
  fx('dragon',.58,1.5,2.7,'projectile',1,5);
  [1.5,1.65,1.8].forEach((at,i)=>fx('impact',at-.08,at,at+.86,'enemy',.80,4,i));
  s.charge=track([[0,0],[.72,1],[.98,.3],[1.5,0]],t);
  s.auraBoost=.5;
 }else if(plan.mode==='ultimate'){
  pose('ultimate',[[0,0],[.28,1],[.78,2],[1.76,2],[1.84,3],[2.18,4],[3.16,4],[3.62,5]]);
  fx('charge',.02,1.14,1.99,'selfGround',.78,6);
  fx('dragon',.48,1.18,1.83,'ascend',.70,5);
  fx('eruption',1.43,2.08,4.46,'armyGround',1,4);
  for(let i=0;i<5;i++)fx('impact',2.07+i*.07,2.14+i*.07,3.4+i*.08,'enemy',.63,4,i);
  fx('blade',1.79,2.08,2.65,'blade',.88,4);
  s.cutin=track([[0,0],[.15,.8],[.60,.8],[.98,0]],t);
  s.charge=track([[0,0],[1.3,1],[1.85,1],[2.12,0]],t);
  s.auraBoost=1;
 }else if(plan.mode==='hit'){
  pose('hit',[[0,0],[.12,1],[.25,2],[.48,3],[.77,4]]);
  if(t>1.06)s.pose={key:'idle',frame:0};
 }else if(plan.mode==='defeat'){
  pose('defeat',[[0,0],[.28,1],[.67,2],[1.13,3],[1.65,4],[2.10,5]]);
  s.auraBoost=-Math.min(1,t/1.4);
 }else s.auraBoost=.15;
 for(const at of plan.contacts){const age=t-at;if(age>=0&&age<1.3)s.impacts.push({at,age});if(age>=0&&age<.1)s.flash=Math.max(s.flash,(1-age/.1)*(plan.mode==='ultimate'?.055:.035));}
 return s;
}
