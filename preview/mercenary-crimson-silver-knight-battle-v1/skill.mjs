export const KNIGHT=Object.freeze({name:'은백·금색 대검 기사',rank:null,code:'V-996',runtimeEnabled:false,damageAuthority:'SERVER_ONLY'});
export const MODES=Object.freeze({
 aura:{label:'광원·대기',duration:6,contacts:[],events:[[0,'대검·갑옷의 붉은 광휘'],[1.5,'금빛 테두리와 망토 맥동']]},
 dash:{label:'홍련 질주',duration:1.65,contacts:[],events:[[0,'무게 중심 준비'],[.18,'폭발적 가속·잔상'],[.46,'제동과 착지'],[1.02,'원위치 복귀']]},
 attack:{label:'대검 참격',duration:2.8,contacts:[1],events:[[0,'한손 대검 들어 올리기'],[.68,'몸통·어깨의 회전'],[1,'대검 접촉·충격'],[1.45,'관성 제동'],[2.15,'자세 회복']]},
 skill:{label:'홍련 집행',duration:4.5,contacts:[1.0,2.25],events:[[0,'갑옷과 검의 광원 집중'],[.7,'첫 대검 참격'],[1,'참격 접촉'],[1.7,'대검 상단 집중'],[2.25,'루비 결정 집행'],[3.35,'금빛 잔광·회복']]},
 execution:{label:'전장 심판',duration:4.8,contacts:[2.1],events:[[0,'자유로운 왼손으로 마력 집중'],[1.3,'대검 상단 들어 올리기'],[2.1,'강렬한 내려찍기·결정 파열'],[3.4,'충격파 확산과 회복']]},
 guard:{label:'루비 반격벽',duration:2.7,contacts:[.82],events:[[0,'한손 방어 자세'],[.32,'결정 방벽 형성'],[.82,'방벽 충돌·균열'],[1.8,'방어 해제']]},
 hit:{label:'피격·회복',duration:1.25,contacts:[],events:[[0,'충격을 받아내기'],[.2,'어깨와 무릎의 완충'],[.8,'파지 유지·자세 회복']]},
 defeat:{label:'쓰러짐',duration:2.6,contacts:[],events:[[0,'힘이 풀리는 자세'],[.7,'무릎 착지'],[1.7,'몸과 대검의 무게가 내려앉음'],[2.4,'망토와 대검 정착']]},
 ultimate:{label:'종결 집행',duration:6.8,contacts:[1.42,3.25],events:[[0,'전장 압박·마력 집중'],[.88,'홍련 대시'],[1.42,'전방을 가르는 대검 참격'],[1.82,'거대한 대검의 상단 준비'],[2.65,'전장의 빛을 모으는 내려찍기'],[3.25,'종결 충돌·전장 결정 폭쇄'],[4.15,'전장 전체로 퍼지는 충격파'],[5.45,'루비 파편·금빛 잔향 소멸']]}
});
export const clamp=(n,a=0,b=1)=>Math.min(b,Math.max(a,n));
export function track(keys,t,{smooth=false}={}){if(t<=keys[0][0])return keys[0][1];for(let i=1;i<keys.length;i++)if(t<=keys[i][0]){const[a,x]=keys[i-1],[b,y]=keys[i];let p=clamp((t-a)/(b-a));if(smooth)p=p*p*(3-2*p);return x+(y-x)*p;}return keys.at(-1)[1];}
export function makePlan({mode='ultimate',cancelAt=null,targetLostAt=null}={}){
 if(!MODES[mode])throw Error('Unknown knight sequence');for(const v of [cancelAt,targetLostAt])if(v!==null&&(!Number.isFinite(v)||v<0))throw Error('Invalid cancellation time');
 const def=MODES[mode],stop=Math.min(cancelAt??Infinity,targetLostAt??Infinity),contacts=def.contacts.filter(at=>at<stop);
 const audioCues=mode==='dash'?[['dash',.18,.178]]:contacts.map((at,i)=>[(mode==='ultimate'&&i===1)||mode==='execution'?'ultimate':'slash',at,(mode==='ultimate'&&i===1)||mode==='execution'?.333:.25]);
 if(mode==='ultimate')audioCues.unshift(['dash',.88,.178]);
 return {mode,duration:def.duration,stop:Number.isFinite(stop)?stop:null,contacts,audioCues:audioCues.filter(([,at])=>at<stop),events:def.events.filter(([at])=>at<stop).map(([at,label])=>({at,label})).concat(Number.isFinite(stop)?[{at:stop,label:targetLostAt!==null&&targetLostAt<=stop?'대상 소멸 · 연출 정리':'시전 중단 · 연출 정리'}]:[]),damageAuthority:'NONE_VISUAL_PREVIEW'};
}
const COUNTS={idle:8,ready:16,attack:16,recover:12,dash:8,guard:8,hit:8,defeat:8,cast:12,ultimate:12};
export function sample(plan,time){
 const t=clamp(Number(time)||0,0,plan.duration),cancelled=plan.stop!==null&&t>=plan.stop,done=t>=plan.duration;
 const s={time:t,cancelled,done,pose:{key:'idle',frame:Math.floor(t*6)%8},travel:0,contactTrack:{key:'attack',blend:0},trail:false,effects:[],charge:0,dim:0,flash:0,recoil:0,auraBoost:0,lift:0,events:plan.events.filter(e=>e.at<=t)};s.label=s.events.at(-1)?.label||'재생 대기';
 if(cancelled||done){s.pose={key:done&&plan.mode==='defeat'&&!cancelled?'defeat':'idle',frame:done&&plan.mode==='defeat'&&!cancelled?7:0};return s;}
 const pose=(key,start,end)=>{if(t>=start&&t<end)s.pose={key,frame:Math.min(COUNTS[key]-1,Math.floor((t-start)/(end-start)*COUNTS[key]))};};
 const contactPose=(key,start,end,frame,at,first=0)=>{if(t>=start&&t<end)s.pose={key,frame:Math.min(COUNTS[key]-1,Math.floor(track([[start,first],[at-.04,frame],[at+.07,frame+1],[end,COUNTS[key]]],t)))};};
 const effect=(key,at,pre,post,peak,last,anchor='target')=>{if(t>=at-pre&&t<at+post)s.effects.push({key,anchor,frame:track([[at-pre,0],[at,peak],[at+post*.65,peak+(last-peak)*.82],[at+post,last]],t),alpha:track([[at-pre,0],[at-pre*.7,1],[at+post*.85,1],[at+post,0]],t)});};
 const attack=(start=0)=>{pose('ready',start,start+.68);contactPose('attack',start+.68,start+1.45,6,start+1);pose('recover',start+1.45,start+2.15);};
 if(plan.mode==='aura'){s.auraBoost=.35;s.charge=.22;}
 else if(plan.mode==='dash'){
  pose('dash',0,.84);s.travel=track([[0,0],[.18,0],[.4,1],[.9,1],[1.55,0]],t,{smooth:true});s.trail=t>=.18&&t<.56;s.lift=track([[0,0],[.22,0],[.34,22],[.47,0]],t);s.auraBoost=.6;effect('dash',.3,.14,.45,5,11,'dash');
 }else if(plan.mode==='attack'){
  attack();s.travel=track([[0,0],[.2,0],[.68,1],[2.15,1],[2.65,0]],t,{smooth:true});effect('slash',1,.19,.85,9,15);s.auraBoost=.4;
 }else if(plan.mode==='skill'){
  attack();pose('ready',1.7,2.04);contactPose('ultimate',2.04,3.25,7,2.25,4);pose('recover',3.25,3.95);s.travel=track([[0,0],[.68,1],[3.65,1],[4.35,0]],t,{smooth:true});s.contactTrack={key:'ultimate',blend:track([[1.4,0],[2.15,1]],t,{smooth:true})};effect('slash',1,.2,.75,9,15);effect('execution',2.25,.65,1.6,9,15,'targetGround');s.auraBoost=.7; s.dim=track([[0,0],[1.5,.25],[2.2,.5],[3.3,0]],t);
 }else if(plan.mode==='execution'){
  pose('cast',0,1.3);pose('ready',1.3,1.75);contactPose('ultimate',1.75,2.7,7,2.1,4);pose('recover',2.7,3.5);s.contactTrack={key:'ultimate',blend:1};s.travel=track([[0,0],[1.3,0],[1.72,1],[3.65,1],[4.6,0]],t,{smooth:true});effect('charge',.88,.8,.6,7,11,'selfGround');effect('execution',2.1,.78,2,9,15,'targetGround');s.auraBoost=.9;s.dim=track([[0,0],[1,.2],[2.05,.6],[3.3,0]],t);
 }else if(plan.mode==='guard'){pose('guard',0,2.15);effect('guard',.82,.68,1.25,6,11,'guard');s.auraBoost=.65;}
 else if(plan.mode==='hit'){pose('hit',0,1.15);s.auraBoost=.2;}
 else if(plan.mode==='defeat'){pose('defeat',0,2.42);if(t>=2.42)s.pose={key:'defeat',frame:7};s.auraBoost=-.4;}
 else{
  pose('cast',0,.88);pose('dash',.88,1.03);if(t>=1.03&&t<1.2)pose('ready',.975,1.2);contactPose('attack',1.2,1.82,6,1.42);pose('ready',1.82,2.65);contactPose('ultimate',2.65,3.6,7,3.25,4);pose('recover',3.6,4.28);
  s.travel=track([[0,0],[.88,0],[1.2,1],[5.5,1],[6.25,0]],t,{smooth:true});s.contactTrack={key:'ultimate',blend:track([[1.82,0],[2.65,1]],t,{smooth:true})};s.trail=t>=.88&&t<1.24;s.lift=track([[.88,0],[1.03,22],[1.2,0]],t);
  s.charge=track([[0,0],[.42,.9],[.88,1],[1.1,0],[1.82,0],[2.55,1],[3.25,0]],t);s.auraBoost=track([[0,.35],[.8,1],[1.5,.65],[2.9,1.4],[3.25,1.5],[4.4,.8],[5.7,.25]],t);s.dim=track([[0,0],[.42,.3],[1.5,.25],[2.6,.65],[3.25,.7],[3.55,.3],[4.65,0]],t);
  effect('charge',.64,.6,.6,7,11,'selfGround');effect('dash',1.03,.15,.35,5,11,'dash');effect('slash',1.42,.17,.83,9,15);effect('execution',3.25,.62,1.75,9,15,'targetGround');effect('ultimate',3.25,1.0,2.35,10,15,'targetGround');
 }
 for(const at of plan.contacts){const age=t-at;if(age>=0&&age<.16){const big=plan.mode==='ultimate'&&at===3.25||plan.mode==='execution';s.flash=Math.max(s.flash,(1-age/.16)*(big?.17:.075));s.recoil=Math.max(s.recoil,Math.sin(age/.16*Math.PI)*(big?15:7));}}
 return s;
}
