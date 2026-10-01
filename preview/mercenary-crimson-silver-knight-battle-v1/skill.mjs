import {COUNTS} from './motion-counts-v10.mjs';
export const KNIGHT=Object.freeze({name:'은백·금색 대검 기사',rank:null,code:'V-996',runtimeEnabled:false,damageAuthority:'SERVER_ONLY'});
export const OVERHEAD_MODES=Object.freeze(['attack','skill','overhead','execution','guard','ultimate']);
export const ACTIVE_MOTION_KEYS=Object.freeze(['idle','dash','twohandGrip','twohandLift','twohandStrike','twohandReturn','hit','defeat']);
const AUTHORED_STRIKE=Object.freeze({descent:1.64,strike:1.84,contact:1.98,recovery:2.20});
const strikeRate=2.4,descentAt=t=>AUTHORED_STRIKE.descent+(t-AUTHORED_STRIKE.descent)/strikeRate;
// The last lift frame already lowers the blade: accelerate it too, with no compensating holds.
export const OVERHEAD=Object.freeze({motion:'TWO_HAND_OVERHEAD_V10',grip:.50,lift:1.04,descent:AUTHORED_STRIKE.descent,strike:descentAt(AUTHORED_STRIKE.strike),contact:descentAt(AUTHORED_STRIKE.contact),recovery:descentAt(AUTHORED_STRIKE.recovery),idle:descentAt(AUTHORED_STRIKE.recovery)+.95});
export const STRIKE_PLAYBACK=Object.freeze({rate:strikeRate,start:OVERHEAD.strike,end:OVERHEAD.recovery,descentStart:OVERHEAD.descent,compensatingHold:false});
const adopted=(label,{impact='강격·결정 충돌',heavy=true,approach=true,returnAt=3.4,duration=4.05}={})=>({
 label,motion:OVERHEAD.motion,heavy,approach,returnAt,duration,contacts:[OVERHEAD.contact],
 events:[[0,'승인 한손 대기'],[.12,approach?'접근 대시':'제자리 시전'],[OVERHEAD.grip,'두 손으로 손잡이 잡기'],[OVERHEAD.lift,'어깨와 팔로 대검 들어 올리기'],[1.44,'머리 위에서 무게 싣기'],[OVERHEAD.descent,'두손 내려찍기'],[OVERHEAD.contact,impact],[OVERHEAD.recovery,'충격을 받아내고 한손 파지로 복귀'],[OVERHEAD.idle,'승인 대기 자세'],...(approach?[[returnAt,'복귀 대시']]:[])]
});
export const MODES=Object.freeze({
 aura:{label:'광원·대기',duration:6,contacts:[],events:[[0,'승인된 한손 파지'],[1.5,'진홍빛 전신 아우라']]},
 dash:{label:'홍련 질주',duration:1.8,contacts:[],events:[[0,'지면을 밀어 가속'],[.28,'대시·붉은 잔상'],[.6,'제동·착지'],[1.1,'복귀 대시']]},
 overhead:adopted('두손 대검 내려찍기'),
 attack:adopted('대검 내려찍기',{impact:'대검 강격',heavy:false}),
 skill:adopted('홍련 강격',{impact:'홍련 강격·결정 파열'}),
 execution:adopted('전장 심판',{impact:'심판 강격·결정 파열'}),
 guard:adopted('루비 반격벽',{impact:'내려찍기·상체 방벽 전개',heavy:false}),
 hit:{label:'피격·회복',duration:1.1,contacts:[],events:[[0,'한손 파지 유지'],[.16,'상체로 충격 받아내기'],[.5,'자세 회복']]},
 defeat:{label:'쓰러짐',duration:2.6,contacts:[],events:[[0,'체력 소진'],[.65,'한쪽 무릎으로 버티기'],[1.45,'왼손을 짚고 정착']]},
 ultimate:adopted('종결 집행',{impact:'종결 강격·전장 결정 폭쇄',returnAt:4.85,duration:5.55})
});
export const clamp=(n,a=0,b=1)=>Math.min(b,Math.max(a,n));
export function track(keys,t,{smooth=false}={}){if(t<=keys[0][0])return keys[0][1];for(let i=1;i<keys.length;i++)if(t<=keys[i][0]){const[a,x]=keys[i-1],[b,y]=keys[i];let p=clamp((t-a)/(b-a));if(smooth)p=p*p*(3-2*p);return x+(y-x)*p;}return keys.at(-1)[1];}
export function makePlan({mode='ultimate',cancelAt=null,targetLostAt=null}={}){
 if(!MODES[mode])throw Error('Unknown knight sequence');for(const v of [cancelAt,targetLostAt])if(v!==null&&(!Number.isFinite(v)||v<0))throw Error('Invalid cancellation time');
 const def=MODES[mode],stop=Math.min(cancelAt??Infinity,targetLostAt??Infinity),contacts=def.contacts.filter(at=>at<stop);
 const audioCues=contacts.map(at=>[def.heavy?'ultimate':'slash',at,def.heavy?.333:.25]);
 if(mode==='dash'||def.approach)audioCues.unshift(['dash',mode==='dash'?.22:.25,.178]);
 return {mode,motion:def.motion??null,heavyImpact:!!def.heavy,duration:def.duration,stop:Number.isFinite(stop)?stop:null,contacts,audioCues:audioCues.filter(([,at])=>at<stop),events:def.events.filter(([at])=>at<stop).map(([at,label])=>({at,label})).concat(Number.isFinite(stop)?[{at:stop,label:targetLostAt!==null&&targetLostAt<=stop?'대상 소멸 · 연출 정리':'시전 중단 · 연출 정리'}]:[]),damageAuthority:'NONE_VISUAL_PREVIEW'};
}
export function sample(plan,time){
 const t=clamp(Number(time)||0,0,plan.duration),cancelled=plan.stop!==null&&t>=plan.stop,done=t>=plan.duration,def=MODES[plan.mode];
 const s={time:t,cancelled,done,pose:{key:'idle',frame:0},travel:0,contactTrack:{key:'twohandStrike',blend:0},trail:false,effects:[],charge:0,weaponPower:0,sweep:0,impacts:[],dim:0,flash:0,recoil:0,auraBoost:0,lift:0,events:plan.events.filter(e=>e.at<=t)};s.label=s.events.at(-1)?.label||'재생 대기';
 if(t<.06)return s;
 if(cancelled||done){if(done&&plan.mode==='defeat'&&!cancelled)s.pose={key:'defeat',frame:COUNTS.defeat-1};return s;}
 const pose=(key,start,end)=>{if(t>=start&&t<end)s.pose={key,frame:Math.min(COUNTS[key]-1,Math.floor((t-start)/(end-start)*COUNTS[key]))};};
 const effect=(key,at,pre,post,peak,last,anchor='target',strength=1)=>{if(t>=at-pre&&t<at+post)s.effects.push({key,anchor,frame:track([[at-pre,0],[at,peak],[at+post*.65,peak+(last-peak)*.82],[at+post,last]],t),alpha:strength*track([[at-pre,0],[at-pre*.7,1],[at+post*.85,1],[at+post,0]],t)});};
 const dash=(start,end)=>{pose('dash',start,end);if(t>=start&&t<end){s.trail=true;s.lift=track([[start,0],[start+(end-start)*.35,8],[end,0]],t);}effect('dash',start+(end-start)*.45,(end-start)*.4,.35,5,11,'dash');};
 if(def.motion===OVERHEAD.motion){
  // Shared by every attack/skill: fast descent, immediate normal-speed recovery, unchanged artwork.
  if(def.approach){dash(.12,.42);dash(def.returnAt,def.returnAt+.4);s.travel=track([[0,0],[.12,0],[.40,1],[def.returnAt,1],[def.returnAt+.4,0]],t,{smooth:true});}
  pose('twohandGrip',OVERHEAD.grip,OVERHEAD.lift);pose('twohandLift',OVERHEAD.lift,AUTHORED_STRIKE.strike);
  if(t>=STRIKE_PLAYBACK.start&&t<OVERHEAD.recovery){
   const swingTime=AUTHORED_STRIKE.descent+(t-OVERHEAD.descent)*STRIKE_PLAYBACK.rate;
   s.pose={key:'twohandStrike',frame:Math.min(COUNTS.twohandStrike-1,Math.floor(track([[AUTHORED_STRIKE.strike,0],[AUTHORED_STRIKE.contact-.02,1],[AUTHORED_STRIKE.contact+.035,1],[AUTHORED_STRIKE.recovery,COUNTS.twohandStrike]],swingTime)))};
  }
  pose('twohandReturn',OVERHEAD.recovery,OVERHEAD.idle);
  s.auraBoost=plan.mode==='ultimate'?1.5:plan.mode==='attack'?.6:.95;
  const hit=OVERHEAD.contact,fxTime=t-(hit-AUTHORED_STRIKE.contact);
  s.charge=track([[.5,0],[1.45,.7],[1.84,1],[1.98,0]],fxTime);
  s.dim=track([[1.2,0],[1.84,plan.mode==='ultimate'?.6:.32],[1.98,plan.mode==='ultimate'?.7:.4],[plan.mode==='ultimate'?4:2.7,0]],fxTime);
  effect('charge',hit-.36,1.06,.55,6,11,'selfGround',plan.mode==='attack'?.40:plan.mode==='guard'?.32:1);
  if(plan.mode==='guard')effect('guard',hit,.7,1.3,6,11,'guard');
  else{
   effect('slash',hit,.28,.65,9,15);
   if(plan.mode!=='attack')effect('execution',hit,.18,plan.mode==='execution'?1.65:1.30,9,15,'targetGround');
   if(plan.mode==='ultimate')effect('ultimate',hit,.55,2.15,10,15,'targetGround');
  }
 }else if(plan.mode==='aura'){s.auraBoost=.35;s.charge=.22;}
 else if(plan.mode==='dash'){dash(0,.65);dash(1.1,1.65);s.travel=track([[0,0],[.1,0],[.55,1],[1.1,1],[1.65,0]],t,{smooth:true});s.auraBoost=.6;}
 else if(plan.mode==='hit'){if(t<.7)s.pose={key:'hit',frame:t>=.16&&t<.55?1:0};s.auraBoost=.2;}
 else if(plan.mode==='defeat'){s.pose={key:'defeat',frame:t<.65?0:t<1.45?1:2};s.auraBoost=-.4;}
 for(const at of plan.contacts){
  const age=t-at,big=plan.heavyImpact;
  s.weaponPower=Math.max(s.weaponPower,track([[at-1.45,0],[at-.16,big?1:.72],[at+.10,1],[at+.54,0]],t));
  s.sweep=Math.max(s.sweep,track([[at-.24,0],[at-.08,1],[at+.12,1],[at+.43,0]],t));
  if(plan.mode!=='guard'&&age>=0&&age<1.6)s.impacts.push({at,age,big});
  if(age>=0&&age<.16){s.flash=Math.max(s.flash,(1-age/.16)*(big?.17:.075));s.recoil=Math.max(s.recoil,Math.sin(age/.16*Math.PI)*(big?15:7));}
 }
 return s;
}
