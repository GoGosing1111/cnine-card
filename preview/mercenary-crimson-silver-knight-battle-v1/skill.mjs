import {COUNTS} from './motion-counts-v10.mjs';
export const KNIGHT=Object.freeze({name:'은백·금색 대검 기사',rank:null,code:'V-996',runtimeEnabled:false,damageAuthority:'SERVER_ONLY'});
export const MODES=Object.freeze({
 aura:{label:'광원·대기',duration:6,contacts:[],events:[[0,'승인된 한손 파지'],[1.5,'진홍빛 전신 아우라']]},
 dash:{label:'홍련 질주',duration:1.8,contacts:[],events:[[0,'지면을 밀어 가속'],[.28,'대시·붉은 잔상'],[.6,'제동·착지'],[1.1,'복귀 대시']]},
 overhead:{label:'두손 대검 내려찍기',duration:4.05,contacts:[1.98],events:[[0,'승인 한손 대기'],[.12,'접근 대시'],[.50,'두 손으로 손잡이 잡기'],[1.04,'어깨와 팔로 대검 들어 올리기'],[1.44,'머리 위에서 무게 싣기'],[1.84,'두손 내려찍기'],[1.98,'강격·결정 충돌'],[2.20,'충격을 받아내고 한손 파지로 복귀'],[3.15,'승인 대기 자세'],[3.4,'복귀 대시']]},
 attack:{label:'대검 올려베기',duration:2.95,contacts:[.78],events:[[0,'접근 대시'],[.30,'뒷발에 무게 싣기'],[.53,'발·골반·어깨로 대검 가속'],[.78,'대각 올려베기'],[.99,'검의 무게를 받아 천천히 복귀'],[2.3,'복귀 대시']]},
 skill:{label:'홍련 연속 베기',duration:3.7,contacts:[.75,1.48],events:[[0,'접근 대시'],[.30,'낮은 한손 파지'],[.75,'첫 대각 베기'],[.97,'검을 받아내며 몸통 회전'],[1.48,'회전 베기·결정 파열'],[1.65,'관성 제동'],[3,'복귀 대시']]},
 execution:{label:'전장 심판',duration:4.1,contacts:[1.48],events:[[0,'마력 집중'],[.5,'접근 대시'],[.8,'뒷발과 골반에 힘 모으기'],[1.25,'몸통 회전·넓은 베기'],[1.48,'전장 절단·결정 파열'],[1.65,'대검 제동']]},
 guard:{label:'루비 반격벽',duration:2.7,contacts:[.9],events:[[0,'낮은 대검 자세로 버티기'],[.9,'결정 방벽으로 충격 받아내기'],[1.7,'방어 해제']]},
 hit:{label:'피격·회복',duration:1.1,contacts:[],events:[[0,'한손 파지 유지'],[.16,'상체로 충격 받아내기'],[.5,'자세 회복']]},
 defeat:{label:'쓰러짐',duration:2.6,contacts:[],events:[[0,'체력 소진'],[.65,'한쪽 무릎으로 버티기'],[1.45,'왼손을 짚고 정착']]},
 ultimate:{label:'종결 집행',duration:5.55,contacts:[1.23,1.96],events:[[0,'전신 마력 집중'],[.45,'홍련 대시'],[.78,'낮은 파지에서 체중 싣기'],[1.23,'첫 대각 베기'],[1.45,'발을 축으로 몸통 회전'],[1.96,'회전 베기·전장 결정 폭쇄'],[2.13,'대검 제동·망토의 잔여 움직임'],[4.85,'복귀 대시']]}
});
export const clamp=(n,a=0,b=1)=>Math.min(b,Math.max(a,n));
export function track(keys,t,{smooth=false}={}){if(t<=keys[0][0])return keys[0][1];for(let i=1;i<keys.length;i++)if(t<=keys[i][0]){const[a,x]=keys[i-1],[b,y]=keys[i];let p=clamp((t-a)/(b-a));if(smooth)p=p*p*(3-2*p);return x+(y-x)*p;}return keys.at(-1)[1];}
export function makePlan({mode='ultimate',cancelAt=null,targetLostAt=null}={}){
 if(!MODES[mode])throw Error('Unknown knight sequence');for(const v of [cancelAt,targetLostAt])if(v!==null&&(!Number.isFinite(v)||v<0))throw Error('Invalid cancellation time');
 const def=MODES[mode],stop=Math.min(cancelAt??Infinity,targetLostAt??Infinity),contacts=def.contacts.filter(at=>at<stop);
 const audioCues=contacts.map((at,i)=>{const big=mode==='execution'||mode==='overhead'||(mode==='ultimate'||mode==='skill')&&i===1;return[big?'ultimate':'slash',at,big?.333:.25];});
 if(['dash','attack','skill','execution','ultimate','overhead'].includes(mode))audioCues.unshift(['dash',mode==='ultimate'?.6:mode==='execution'?.65:mode==='dash'?.22:.15,.178]);
 return {mode,duration:def.duration,stop:Number.isFinite(stop)?stop:null,contacts,audioCues:audioCues.filter(([,at])=>at<stop),events:def.events.filter(([at])=>at<stop).map(([at,label])=>({at,label})).concat(Number.isFinite(stop)?[{at:stop,label:targetLostAt!==null&&targetLostAt<=stop?'대상 소멸 · 연출 정리':'시전 중단 · 연출 정리'}]:[]),damageAuthority:'NONE_VISUAL_PREVIEW'};
}
export function sample(plan,time){
 const t=clamp(Number(time)||0,0,plan.duration),cancelled=plan.stop!==null&&t>=plan.stop,done=t>=plan.duration;
 const s={time:t,cancelled,done,pose:{key:'idle',frame:0},travel:0,contactTrack:{key:plan.mode==='overhead'?'twohandStrike':plan.mode==='execution'?'ultimate':'attack',blend:0},trail:false,effects:[],charge:0,dim:0,flash:0,recoil:0,auraBoost:0,lift:0,events:plan.events.filter(e=>e.at<=t)};s.label=s.events.at(-1)?.label||'재생 대기';
 if(t<.06)return s;
 if(cancelled||done){if(done&&plan.mode==='defeat'&&!cancelled)s.pose={key:'defeat',frame:COUNTS.defeat-1};return s;}
 const pose=(key,start,end,reverse=false)=>{if(t>=start&&t<end){let f=Math.min(COUNTS[key]-1,Math.floor((t-start)/(end-start)*COUNTS[key]));s.pose={key,frame:reverse?COUNTS[key]-1-f:f};}};
 const strike=(key,start,at,end)=>{const hit=key==='twohandStrike'?1:key==='attack'?2:3;if(t>=start&&t<end)s.pose={key,frame:Math.min(COUNTS[key]-1,Math.floor(track([[start,0],[at-.02,hit],[at+.035,hit],[end,COUNTS[key]]],t)))};};
 const effect=(key,at,pre,post,peak,last,anchor='target')=>{if(t>=at-pre&&t<at+post)s.effects.push({key,anchor,frame:track([[at-pre,0],[at,peak],[at+post*.65,peak+(last-peak)*.82],[at+post,last]],t),alpha:track([[at-pre,0],[at-pre*.7,1],[at+post*.85,1],[at+post,0]],t)});};
 const dash=(start,end)=>{pose('dash',start,end);if(t>=start&&t<end){s.trail=true;s.lift=track([[start,0],[start+(end-start)*.35,8],[end,0]],t);}effect('dash',start+(end-start)*.45,(end-start)*.4,.35,5,11,'dash');};
 const cast=(start,end)=>{const mid=(start+end)/2;pose('cast',start,mid);pose('cast',mid,end,true);};
 const rising=(readyAt,start,at,end)=>{pose('ready',readyAt,start);strike('attack',start,at,end);effect('slash',at,.14,.6,9,15);};
 const chain=(offset=0)=>{rising(.30+offset,.50+offset,.75+offset,.97+offset);pose('turn',.97+offset,1.25+offset);strike('ultimate',1.25+offset,1.48+offset,1.65+offset);pose('finish',1.65+offset,2.40+offset);effect('execution',1.48+offset,.35,1.45,9,15,'targetGround');};
 if(plan.mode==='aura'){s.auraBoost=.35;s.charge=.22;}
 else if(plan.mode==='dash'){dash(0,.65);dash(1.1,1.65);s.travel=track([[0,0],[.1,0],[.55,1],[1.1,1],[1.65,0]],t,{smooth:true});s.auraBoost=.6;}
 else if(plan.mode==='overhead'){
  dash(.12,.42);pose('twohandGrip',.50,1.04);pose('twohandLift',1.04,1.84);strike('twohandStrike',1.84,1.98,2.20);pose('twohandReturn',2.20,3.15);dash(3.4,3.8);
  s.travel=track([[0,0],[.12,0],[.40,1],[3.4,1],[3.8,0]],t,{smooth:true});s.auraBoost=.95;s.charge=track([[.5,0],[1.45,.7],[1.84,1],[1.98,0]],t);s.dim=track([[1.2,0],[1.84,.32],[1.98,.4],[2.7,0]],t);
  effect('slash',1.98,.12,.60,9,15);effect('execution',1.98,.18,1.05,9,15,'targetGround');
 }else if(plan.mode==='attack'){
  dash(0,.30);rising(.30,.53,.78,.99);pose('recover',.99,2.10);dash(2.3,2.7);s.travel=track([[0,0],[.04,0],[.28,1],[2.3,1],[2.7,0]],t,{smooth:true});s.auraBoost=.6;
 }else if(plan.mode==='skill'){
  dash(0,.30);chain();dash(3,3.4);s.travel=track([[0,0],[.04,0],[.28,1],[3,1],[3.4,0]],t,{smooth:true});s.auraBoost=.8;s.dim=track([[.97,0],[1.48,.4],[2.7,0]],t);
 }else if(plan.mode==='execution'){
  cast(0,.5);dash(.5,.8);pose('ready',.8,1.25);strike('ultimate',1.25,1.48,1.65);pose('finish',1.65,2.40);dash(3.4,3.8);s.travel=track([[0,0],[.5,0],[.78,1],[3.4,1],[3.8,0]],t,{smooth:true});effect('charge',.28,.26,.4,7,11,'selfGround');effect('execution',1.48,.55,1.8,9,15,'targetGround');s.auraBoost=.9;s.dim=track([[0,0],[.8,.2],[1.45,.6],[2.8,0]],t);
 }else if(plan.mode==='guard'){
  pose('guard',0,.7);if(t>=.7&&t<1.7)s.pose={key:'guard',frame:COUNTS.guard-1};pose('guard',1.7,2.5,true);effect('guard',.9,.7,1.3,6,11,'guard');s.auraBoost=.65;
 }else if(plan.mode==='hit'){if(t<.7)s.pose={key:'hit',frame:t>=.16&&t<.55?1:0};s.auraBoost=.2;}
 else if(plan.mode==='defeat'){s.pose={key:'defeat',frame:t<.65?0:t<1.45?1:2};s.auraBoost=-.4;}
 else{
  cast(0,.45);dash(.45,.78);chain(.48);dash(4.85,5.25);
  s.travel=track([[0,0],[.45,0],[.76,1],[4.85,1],[5.25,0]],t,{smooth:true});s.charge=track([[0,0],[.25,1],[.45,0],[1.45,0],[1.85,1],[1.96,0]],t);
  s.auraBoost=track([[0,.35],[.45,1],[1.23,.65],[1.85,1.4],[1.96,1.5],[3.7,.8],[4.85,.25]],t);s.dim=track([[0,0],[.3,.3],[1.23,.25],[1.9,.65],[1.96,.7],[2.5,.3],[4,0]],t);
  effect('charge',.28,.26,.4,7,11,'selfGround');effect('ultimate',1.96,.55,2.15,10,15,'targetGround');
 }
 for(const at of plan.contacts){const age=t-at;if(age>=0&&age<.16){const big=plan.mode==='execution'||plan.mode==='overhead'||plan.mode==='ultimate'&&at===plan.contacts.at(-1);s.flash=Math.max(s.flash,(1-age/.16)*(big?.17:.075));s.recoil=Math.max(s.recoil,Math.sin(age/.16*Math.PI)*(big?15:7));}}
 return s;
}
