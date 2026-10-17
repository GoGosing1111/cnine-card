export const clamp=(n,a=0,b=1)=>Math.min(b,Math.max(a,n));
export function track(keys,t){if(t<=keys[0][0])return keys[0][1];for(let i=1;i<keys.length;i++){if(t<=keys[i][0]){const[a,x]=keys[i-1],[b,y]=keys[i];return x+(y-x)*clamp((t-a)/(b-a));}}return keys.at(-1)[1];}
// Discrete authored poses. No mesh deformation or interpolation of the weapon.
const step=(keys,t)=>keys.filter(k=>k[0]<=t).at(-1)?.[1]??keys[0][1];
export const MODES=Object.freeze({
 aura:{label:'용혼 · 대기',duration:5.4,contacts:[],description:'발도 자세를 유지한 채 에메랄드 용혼이 감돈다',events:[[0,'발도 준비'],[1.2,'용혼 순환'],[3.4,'비늘 잔광']]},
 dash:{label:'비취보 · 대시',duration:1.8,contacts:[],description:'칼집을 고정하고 낮게 딛어 전진한다',events:[[0,'발도 자세'],[.22,'가속'],[.62,'착지'],[1.05,'원위치 복귀']]},
 attack:{label:'녹린일섬 · 발도',duration:2.25,contacts:[.79],description:'시선과 검끝이 같은 목표를 향하는 한 번의 발도',events:[[0,'발도 준비'],[.16,'접근'],[.48,'칼날 인출'],[.79,'녹린일섬 · 접촉'],[1.12,'검기 소멸'],[1.53,'복귀']]},
 skill:{label:'용령발도 · 스킬',duration:3.4,contacts:[1.5,1.65,1.8],description:'뽑아낸 칼날을 따라 에메랄드 용이 적진을 관통한다',events:[[0,'용혼 집중'],[.55,'칼날 인출'],[.96,'용령 방출'],[1.5,'선두 충돌'],[1.8,'후열 관통'],[2.4,'검기 잔향']]},
 ultimate:{label:'청룡참 · 광역기',duration:4.7,contacts:[2.08,2.30,2.52],description:'용혼을 모은 발도 일격과 적진에서 솟아오르는 청룡',events:[[0,'용혼 집중'],[.6,'발도 압축'],[1.2,'청룡 공명'],[1.84,'칼날 방출'],[2.08,'청룡참 · 첫 충돌'],[2.30,'용린 폭쇄'],[2.52,'잔류 충격'],[3.6,'용혼 소멸']]},
 awakening:{label:'청룡단천 · 진각성',duration:5.6,contacts:[2.12,2.72],description:'숨을 멈춘 전장을 가르는 발도, 한 박자 뒤 폭발하는 용린',events:[[0,'고요 · 발도 준비'],[1.5,'검혼 압축'],[2.12,'화면을 가르는 일섬'],[2.30,'검흔 · 정적'],[2.72,'용린 파열 · 지연 타격'],[3.7,'균열 소멸'],[4.6,'발도 자세 복귀']]},
 hit:{label:'피격 · 회복',duration:1.4,contacts:[],description:'검과 칼집을 놓치지 않고 충격을 받아낸다',events:[[0,'피격'],[.25,'충격 흡수'],[.75,'자세 회복']]},
 defeat:{label:'쓰러짐',duration:2.6,contacts:[],description:'칼집을 쥔 채 힘이 빠져 무릎을 꿇는다',events:[[0,'힘이 소진된다'],[.6,'몸을 낮춘다'],[1.3,'무릎을 꿇는다'],[2.1,'정착']]}
});
export const SHOWCASE=['aura','dash','attack','skill','ultimate','awakening','hit','defeat'];
export function makePlan({mode='ultimate',cancelAt=null,targetLostAt=null}={}){
 if(!MODES[mode])throw Error('Unknown sequence');
 for(const x of [cancelAt,targetLostAt])if(x!==null&&(!Number.isFinite(x)||x<0))throw Error('Invalid stop time');
 const def=MODES[mode],stop=Math.min(cancelAt??Infinity,targetLostAt??Infinity),audioCues=[];
 if(mode==='dash')audioCues.push(['dash',.22,.178],['dash',1.15,.178]);
 if(mode==='attack')audioCues.push(['dash',.20,.178],['slash',.79,.25]);
 if(mode==='skill')audioCues.push(['dash',.96,.178],['ultimate',1.5,.333]);
 if(mode==='ultimate')audioCues.push(['dash',1.2,.178],['ultimate',2.08,.333],['slash',2.52,.25]);
 if(mode==='awakening')audioCues.push(['dash',2.02,.178],['slash',2.12,.25],['ultimate',2.72,.333]);
 return {mode,duration:def.duration,stop:Number.isFinite(stop)?stop:null,contacts:def.contacts.filter(t=>t<stop),audioCues:audioCues.filter(x=>x[1]<stop),events:def.events.filter(x=>x[0]<stop),damageAuthority:'NONE_VISUAL_PREVIEW'};
}
function sampleAuthored(plan,t){
 t=clamp(Number(t)||0,0,plan.duration);
 const s={time:t,pose:{key:'idle',frame:0},travel:0,effects:[],impacts:[],flash:0,charge:0,cutin:0,trail:0,auraBoost:0,done:t>=plan.duration,cancelled:plan.stop!==null&&t>=plan.stop,label:plan.events.filter(e=>e[0]<=t).at(-1)?.[1]||'대기'};
 if(s.cancelled||s.done){if(plan.mode==='defeat'&&!s.cancelled)s.pose={key:'defeat',frame:3};return s;}
 const pose=(key,keys)=>s.pose={key,frame:step(keys,t)};
 const fx=(key,start,peak,end,anchor,strength=1,peakFrame=5,offset=0)=>{
  if(t<start||t>=end)return;
  s.effects.push({key,frame:track([[start,0],[peak,peakFrame],[end,11]],t),alpha:strength*track([[start,0],[start+.07,1],[end-.16,1],[end,0]],t),anchor,offset});
 };
 if(plan.mode==='dash'){
  s.travel=track([[0,0],[.12,0],[.42,1],[.95,1],[1.32,0],[1.8,0]],t);
  if(t<.9)pose('dash',[[0,0],[.13,1],[.28,2],[.56,3]]);else if(t<1.55)pose('dash',[[.9,0],[1.08,1],[1.2,2],[1.4,3]]);
  s.trail=t<.72||t>1.05&&t<1.58?1:0;
  fx('dashfx',.08,.30,.92,'dash',.94);fx('dashfx',1.03,1.24,1.78,'dash',.8);
 }else if(plan.mode==='attack'){
  s.travel=track([[0,0],[.12,0],[.39,1],[1.3,1],[1.67,0]],t);
  if(t<.40)pose('dash',[[0,0],[.16,1],[.25,2],[.37,3]]);
  else if(t<1.25)pose('slash',[[.4,0],[.48,1],[.79,2]]);
  else if(t<1.72)pose('dash',[[1.25,0],[1.35,2],[1.56,3]]);
  s.trail=t>.14&&t<.39||t>1.35&&t<1.69?1:0;
  fx('dashfx',.10,.22,.5,'dash',.65);fx('blade',.62,.79,1.40,'blade',1,4);fx('impact',.72,.79,1.52,'target',.85,4);s.auraBoost=.3;
 }else if(plan.mode==='skill'){
  if(t<2.85)pose('cast',[[0,0],[.50,1],[.96,2],[2.35,3]]);
  fx('charge',.08,.78,1.55,'selfGround',.85,6);fx('dragon',.58,1.5,2.7,'projectile',1,5);
  [1.5,1.65,1.8].forEach((at,i)=>fx('impact',at-.08,at,at+.86,'enemy',.80,4,i));
  s.charge=track([[0,0],[.72,1],[.98,.3],[1.5,0]],t);s.auraBoost=.5;
 }else if(plan.mode==='ultimate'){
  if(t<4.1)pose('ultimate',[[0,0],[.28,1],[1.84,2],[3.62,3]]);
  fx('charge',.02,1.14,1.99,'selfGround',.78,6);fx('dragon',.48,1.18,1.83,'ascend',.70,5);fx('eruption',1.43,2.08,4.46,'armyGround',1,4);
  for(let i=0;i<5;i++)fx('impact',2.07+i*.07,2.14+i*.07,3.4+i*.08,'enemy',.63,4,i);
  fx('blade',1.79,2.08,2.65,'blade',.88,4);s.charge=track([[0,0],[1.3,1],[1.85,1],[2.12,0]],t);s.auraBoost=1;
 }else if(plan.mode==='awakening'){
  if(t>=1.5&&t<1.92)pose('ultimate',[[1.5,1]]);
  else if(t>=1.92&&t<4.45)pose('slash',[[1.92,1],[2.12,2]]);
  s.travel=track([[0,0],[1.94,0],[2.12,1],[4.5,1],[4.9,0]],t);
  s.trail=t>1.96&&t<2.14||t>4.5&&t<4.9?1:0;
  fx('charge',.12,1.65,2.08,'selfGround',.72,6);
  for(let i=0;i<5;i++)fx('impact',2.66+i*.025,2.72+i*.025,3.7+i*.04,'enemy',.8,4,i);
  s.charge=track([[0,0],[1.7,1],[2.12,0]],t);s.auraBoost=.5;
 }else if(plan.mode==='hit'){
  if(t<1.06)pose('hit',[[0,0],[.12,1],[.25,2],[.77,3]]);
 }else if(plan.mode==='defeat'){
  pose('defeat',[[0,0],[.28,1],[.90,2],[1.65,3]]);s.auraBoost=-Math.min(1,t/1.4);
 }else s.auraBoost=.15;
 for(const at of plan.contacts){const age=t-at;if(age>=0&&age<1.3)s.impacts.push({at,age});if(age>=0&&age<.1)s.flash=Math.max(s.flash,(1-age/.1)*(plan.mode==='ultimate'?.055:.035));}
 return s;
}
export function motionTime(plan,t){const anchor=MODES[plan.mode].contacts[0]||0;return clamp(anchor+(t-anchor)*2,0,plan.duration);}
export function sample(plan,t){
 const visual=sampleAuthored(plan,t),mt=motionTime(plan,visual.time),body=sampleAuthored(plan,mt);
 if(!visual.cancelled&&!visual.done){visual.pose=body.pose;visual.travel=body.travel;visual.trail=body.trail;}
 return {...visual,motionTime:mt,motionRate:2,effectRate:1,cutin:0};
}
