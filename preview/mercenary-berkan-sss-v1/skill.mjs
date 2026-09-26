export const BERKAN=Object.freeze({name:'베르칸',rank:'SSS',code:'V-055',skillId:'MS-055',skillName:'흑금 낙성',runtimeEnabled:true});
export const MODES=Object.freeze({
 aura:{label:'흑금 광휘',duration:4,contacts:[],events:[[0,'갑옷·활 윤곽 광원'],[1,'금빛 불티 상승'],[2,'흑금 오라 맥동']]},
 idle:{label:'대기',duration:2.4,contacts:[],events:[[0,'활을 쥔 대기 자세']]},
 aim:{label:'조준',duration:2,contacts:[],events:[[0,'활 들어 올리기'],[.5,'화살 걸기'],[1.2,'활시위 당기기'],[1.65,'조준 유지']]},
 attack:{label:'일반 사격',duration:2.1,release:.82,contacts:[1.12],events:[[0,'화살 장전'],[.4,'활시위 당기기'],[.82,'발사 · 반동'],[1.12,'화살 명중'],[1.7,'자세 복귀']]},
 hit:{label:'피격',duration:1.2,contacts:[],events:[[0,'피격 · 무게중심 흔들림'],[.65,'자세 회복']]},
 defeat:{label:'쓰러짐',duration:2,contacts:[],events:[[0,'균형 상실'],[.6,'무릎 꿇기'],[1.3,'활을 내리고 쓰러짐']]},
 ultimate:{label:'흑금 낙성',duration:4.6,release:1.7,contacts:[2.08],events:[[0,'흑금 광휘 집중'],[.7,'활시위 최대 장력'],[1.4,'금빛 코어 압축'],[1.7,'흑금 화살 방출'],[2.08,'낙성 파열'],[2.7,'파편·충격파'],[3.4,'잔광 소멸 · 복귀']]}
});
const clamp=(n,a=0,b=1)=>Math.max(a,Math.min(b,n));
export function track(keys,t){if(t<=keys[0][0])return keys[0][1];for(let i=1;i<keys.length;i++)if(t<=keys[i][0]){const [a,x]=keys[i-1],[b,y]=keys[i];return x+(y-x)*clamp((t-a)/(b-a));}return keys.at(-1)[1];}
const step=(times,t)=>Math.max(0,times.findLastIndex(at=>t>=at));
const attackTimes=[0,.13,.25,.39,.52,.67,.82,.94,1.1,1.35,1.55,1.75];
const ultimateTimes=[0,.18,.35,.55,.78,1.02,1.32,1.7,1.87,2.08,2.35,2.7];
export function makePlan({mode='aura',cancelAt=null,targetLostAt=null,dodge=false}={}){
 const spec=MODES[mode];if(!spec)throw Error('Unknown Berkan motion');
 for(const t of [cancelAt,targetLostAt])if(t!==null&&(!Number.isFinite(t)||t<0))throw Error('Invalid interruption time');
 const stop=Math.min(cancelAt??Infinity,targetLostAt??Infinity);
 return {mode,duration:spec.duration,stop:Number.isFinite(stop)?stop:null,release:spec.release??null,dodge,contacts:dodge?[]:spec.contacts.filter(t=>t<stop),events:[...spec.events.filter(([t])=>t<stop).map(([at,label])=>({at,label})),...(Number.isFinite(stop)?[{at:stop,label:targetLostAt!==null&&targetLostAt<=stop?'대상 소멸 · 복귀':'시전 중단 · 복귀'}]:[])],damageAuthority:'NONE_VISUAL_PREVIEW'};
}
export function sample(plan,time){
 const t=clamp(Number(time)||0,0,plan.duration),cancelled=plan.stop!==null&&t>=plan.stop,done=t>=plan.duration;
 const events=plan.events.filter(e=>e.at<=t),s={time:t,cancelled,done,pose:{key:'idle',frame:Math.floor(t/2.4*8)%8},effects:[],projectile:null,charge:0,auraBoost:0,recoil:0,events,label:events.at(-1)?.label||'대기'};
 if(cancelled){s.pose={key:'idle',frame:0};return s;}
 if(done&&plan.mode!=='defeat'){s.pose={key:'idle',frame:0};return s;}
 if(plan.mode==='aim')s.pose={key:'aim',frame:Math.min(7,Math.floor(t/1.7*8))};
 if(plan.mode==='hit')s.pose={key:'hit',frame:Math.min(7,Math.floor(t/1.05*8))};
 if(plan.mode==='defeat')s.pose={key:'defeat',frame:Math.min(7,Math.floor(t/1.65*8))};
 if(plan.mode==='aura')s.auraBoost=.25;
 const effect=(key,start,end,frameAt,anchor)=>{if(t>=start&&t<end)s.effects.push({key,frame:frameAt(t),alpha:track([[start,0],[start+.07,1],[end-.18,1],[end,0]],t),anchor});};
 if(plan.mode==='attack'||plan.mode==='ultimate'){
  const ult=plan.mode==='ultimate',release=plan.release,impact=MODES[plan.mode].contacts[0];
  s.pose={key:ult?'ultimate':'attack',frame:step(ult?ultimateTimes:attackTimes,t)};
  if(t>(ult?3:1.95))s.pose={key:'idle',frame:0};
  if(ult){
   s.charge=track([[0,0],[.5,.2],[1.35,.75],[1.68,1],[1.8,0]],t);
   s.auraBoost=track([[0,.2],[1.7,1],[1.85,.9],[2.6,.4],[3.4,0]],t);
   effect('charge',.35,release+.13,q=>track([[.35,0],[1.4,9],[release,11]],q),'bow');
   effect('afterglow',release,4.2,q=>track([[release,0],[2.25,3],[4.2,11]],q),'feet');
  }
  if(t>=release&&t<impact)s.projectile={progress:(t-release)/(impact-release),frame:(t-release)*25%8,ultimate:ult};
  if(!plan.dodge){
   effect('impact',impact-.05,impact+(ult?1.7:.58),q=>track([[impact-.05,0],[impact,4],[impact+(ult?1.7:.58),15]],q),'target');
   const age=t-impact;if(age>=0&&age<.18)s.recoil=Math.sin(age/.18*Math.PI)*(ult?8:3);
  }
 }
 return s;
}
