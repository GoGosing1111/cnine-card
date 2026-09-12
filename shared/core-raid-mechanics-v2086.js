// Versioned rules shared by the server verifier and approved screen QTEs.
export const CORE_MECHANIC_VERSION = 2086;
export const CORE_MECHANIC_POOL = Object.freeze(['SEQUENCE','MASH','CENTER','CIRCUIT','SHELTER']);
export const MECHANICS = Object.freeze({
 CENTER:{name:'코어 동조',english:'RESONANCE LOCK',instruction:'빛이 중앙에 들어오면 정지하세요.',detail:'3회 중 2회 성공 · 중앙의 흰 영역은 PERFECT',windowMs:11000},
 CIRCUIT:{name:'회로 복원',english:'CIRCUIT RECONNECT',instruction:'같은 기호의 단자를 연결하세요.',detail:'3개 회로 연결 · 드래그 또는 단자 두 번 터치',windowMs:14000},
 SHELTER:{name:'차폐 구역 이동',english:'SHELTER SHIFT',instruction:'폭발 전에 파란 차폐 구역을 선택하세요.',detail:'3번의 폭발 회피 · 느낌표 구역은 위험',windowMs:10800}
});
export const MECHANIC_NAMES=Object.freeze({SEQUENCE:'방향 신호 추적',MASH:'구속 파쇄',CENTER:'코어 동조',CIRCUIT:'회로 복원',SHELTER:'차폐 구역 이동'});
export const CENTER_PERIODS=Object.freeze([1800,1560,1320]);
export const CENTER_COOLDOWN_MS=520;
export const SHELTER_WAVE_MS=3500;
export const SHELTER_BLAST_MS=3000;
export function cursorPosition(elapsed,round=0){const period=CENTER_PERIODS[round%3];const phase=Math.max(0,elapsed)%period/period;return 1-Math.abs(phase*2-1);}
export function gradeTiming(position){if(!Number.isFinite(position)||position<0||position>1)return 'MISS';const distance=Math.abs(position-.5);return distance<=.045+1e-9?'PERFECT':distance<=.12+1e-9?'GOOD':'MISS';}
export function circuitOrder(seed=0){return [[1,2,0],[2,0,1],[2,1,0]][Math.abs(Math.trunc(seed))%3].slice();}
export function circuitTarget(source,order){return order.indexOf(Number(source));}
export function safeCells(wave,seed=0){const patterns=[[0,4,8],[1,3,7],[2,5,6],[0,5,7],[2,3,8]];return patterns[(Math.abs(Math.trunc(seed))+wave)%patterns.length].slice();}
export function insidePort(point,center,radius){return Math.hypot(point.x-center.x,point.y-center.y)<=radius;}
export function summarize(kind,rounds){
 if(kind==='CENTER'){const hits=rounds.filter(r=>['GOOD','PERFECT'].includes(r.grade)).length;return {success:hits>=2,score:hits,total:3,perfect:rounds.length===3&&rounds.every(r=>r.grade==='PERFECT')};}
 if(kind==='CIRCUIT'){const count=new Set(rounds.filter(r=>r.correct).map(r=>r.source)).size;return {success:count===3,score:count,total:3,perfect:false};}
 return {success:rounds.length===3&&rounds.every(r=>r.safe),score:rounds.filter(r=>r.safe).length,total:3,perfect:false};
}

// The seed comes from the server's random attempt ID. Shuffling is deterministic
// so persisted attempts keep their selection, ordering and layouts on resume.
export function selectCoreMechanics(seed){
 let state=Number(seed)>>>0;
 const random=()=>{state=(state+0x6D2B79F5)>>>0;let t=state;t=Math.imul(t^(t>>>15),t|1);t^=t+Math.imul(t^(t>>>7),t|61);return ((t^(t>>>14))>>>0)/4294967296;};
 const pool=[...CORE_MECHANIC_POOL];
 for(let i=pool.length-1;i>0;i--){const j=Math.floor(random()*(i+1));[pool[i],pool[j]]=[pool[j],pool[i]];}
 return pool.slice(0,2);
}
export function createCoreMechanicPlans(seed,challenge){
 return selectCoreMechanics(seed).map((kind,index)=>({kind,seed:((Number(seed)>>>0)^Math.imul(index+1,2654435761))>>>0,
  windowMs:kind==='SEQUENCE'?challenge.sequenceWindowMs:kind==='MASH'?challenge.mashWindowMs:MECHANICS[kind].windowMs}));
}
export function coreMechanicPlans(challenge={}){
 if(challenge.mechanicVersion===undefined)return [{kind:'SEQUENCE',windowMs:challenge.sequenceWindowMs},{kind:'MASH',windowMs:challenge.mashWindowMs}];
 const plans=challenge.mechanics;
 if(challenge.mechanicVersion!==CORE_MECHANIC_VERSION||!Array.isArray(plans)||plans.length!==2||new Set(plans.map(p=>p?.kind)).size!==2)return [];
 if(plans.some(p=>!CORE_MECHANIC_POOL.includes(p?.kind)||!Number.isSafeInteger(p.seed)||p.seed<0||p.seed>0xffffffff||!Number.isSafeInteger(p.windowMs)||p.windowMs<2000||p.windowMs>20000||MECHANICS[p.kind]&&p.windowMs!==MECHANICS[p.kind].windowMs))return [];
 return plans;
}
export function coreMechanicEvents(challenge={},finalBoss=false){
 const plans=coreMechanicPlans(challenge);
 return plans.map((plan,index)=>({type:'RAID_QTE_'+plan.kind,qteId:plan.kind,mechanic:plan,mechanicVersion:challenge.mechanicVersion||2024,mechanicSlot:index+1,mechanicCount:plans.length,
  title:plan.kind==='SEQUENCE'?(finalBoss?'멸절 좌표 해독':'코어 좌표 추적'):plan.kind==='MASH'?(finalBoss?'멸절 구속 파쇄':'코어 구속 파쇄'):MECHANIC_NAMES[plan.kind],
  windowMs:plan.windowMs,
  ...(plan.kind==='SEQUENCE'?{sequence:challenge.sequence,label:'방향 버튼을 누르거나 짧게 스와이프해 순서대로 입력하세요.'}:plan.kind==='MASH'?{target:challenge.mashTarget,label:'연타하여 구속을 파괴하세요.'}:{label:MECHANICS[plan.kind].instruction})}));
}

const failed=(reason='INVALID_TRACE')=>({success:false,perfect:false,score:0,total:3,valid:reason!=='INVALID_TRACE',reason});
export function verifyScreenMechanic(plan,result){
 const spec=MECHANICS[plan?.kind];
 if(!spec||!result||result.cancelled===true||!Number.isSafeInteger(result.durationMs)||result.durationMs<0||result.durationMs>spec.windowMs)return failed();
 const trace=result.trace;
 if(!Array.isArray(trace)||trace.length<1||trace.length>192||trace[0]?.action!=='START'||trace[0]?.at!==0)return failed();
 let previous=-1;
 for(const row of trace){if(!row||!Number.isSafeInteger(row.at)||row.at<previous||row.at<0||row.at>result.durationMs)return failed();previous=row.at;}
 const rows=trace.slice(1),rounds=[];
 if(plan.kind==='CENTER'){
  if(rows.length>3)return failed();let roundStart=0;
  for(const row of rows){if(row.action!=='STOP'||row.at<roundStart||row.at>=spec.windowMs)return failed();const round=rounds.length,grade=gradeTiming(cursorPosition(row.at-roundStart,round));rounds.push({round,grade});roundStart=row.at+CENTER_COOLDOWN_MS;}
  if(rows.length<3&&result.durationMs<spec.windowMs)return failed();
 }else if(plan.kind==='CIRCUIT'){
  let picked=null;const connected=new Set(),order=circuitOrder(plan.seed);
  for(const row of rows){
   if(!Number.isInteger(row.source)||row.source<0||row.source>2||connected.has(row.source)||row.at>=spec.windowMs)return failed();
   if(row.action==='PICK'){picked=row.source;continue;}
   if(row.action!=='CONNECT'||row.source!==picked||!Number.isInteger(row.target)||row.target<0||row.target>2)return failed();
   const correct=circuitTarget(row.source,order)===row.target;
   if(correct){connected.add(row.source);rounds.push({source:row.source,correct:true});}picked=null;
  }
  if(connected.size<3&&result.durationMs<spec.windowMs)return failed();
 }else{
  for(const row of rows){if(row.action!=='MOVE'||!Number.isInteger(row.cell)||row.cell<0||row.cell>8||row.at>=SHELTER_WAVE_MS*3||row.at%SHELTER_WAVE_MS>=SHELTER_BLAST_MS)return failed();}
  if(result.durationMs<SHELTER_WAVE_MS*3)return failed();
  for(let wave=0;wave<3;wave++){const blast=wave*SHELTER_WAVE_MS+SHELTER_BLAST_MS;let cell=4;for(const row of rows){if(row.at>=blast)break;cell=row.cell;}rounds.push({round:wave,safe:safeCells(wave,plan.seed).includes(cell)});}
 }
 const outcome=summarize(plan.kind,rounds);
 return {...outcome,valid:true,reason:outcome.success?'':result.durationMs>=spec.windowMs?'TIMEOUT':plan.kind==='SHELTER'?'UNSAFE_SECTOR':'TIMING_MISS'};
}
