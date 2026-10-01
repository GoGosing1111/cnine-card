import {COOP_PATTERNS as RULES} from '../shared/cooperative-battleground-v1.mjs';
const fail=(code,message)=>{throw Object.assign(Error(message),{code:'COOP_'+code,status:409});};
const frameAt=(room,atMs)=>room.states?.findLast(s=>s.atMs<=atMs);
function livingOwners(room,atMs){
 const frame=frameAt(room,atMs);
 return room.members.filter(m=>!room.withdrawals.some(w=>w.ownerId===m.id&&w.atMs<=atMs)&&frame?.A.some(f=>f.ownerId===m.id&&f.hp>0)).map(m=>m.id);
}
export function nextCoopPatternAt(room){
 if(room.encounterVersion!==2||room.status!=='ACTIVE'||!Number.isFinite(room.bossAtMs))return Infinity;
 const index=room.patternIndex||0;
 return room.pattern?.status==='OPEN'?room.pattern.endsAt:index<RULES.count?room.startsAt+room.bossAtMs+RULES.firstAtMs+index*RULES.intervalMs:Infinity;
}
export function advanceCoopPatterns(room,now,rebuild){
 if(room.encounterVersion!==2||room.status!=='ACTIVE')return;
 while(nextCoopPatternAt(room)<=now&&nextCoopPatternAt(room)<room.startsAt+room.durationMs){
  const at=nextCoopPatternAt(room),atMs=at-room.startsAt;
  if(room.pattern?.status==='OPEN'){
   const pattern=room.pattern,living=livingOwners(room,atMs),required=pattern.participants.filter(id=>living.includes(id));
   const complete=required.length>0&&required.every(id=>pattern.inputs[id]);
   let effect;
   if(pattern.kind==='VENT'){
    effect={kind:complete?'RUPTURE':'OVERLOAD',percent:complete?RULES.rupturePercent:RULES.overloadPercent[room.difficulty],label:complete?'삼핵 차단 성공':'노심 과부하'};
   }else{
    const guard=pattern.inputs[pattern.targetId]==='GUARD',jammers=required.filter(id=>id!==pattern.targetId&&pattern.inputs[id]==='JAM').length;
    effect={kind:'FOCUS',ownerId:pattern.targetId,percent:RULES.focusPercent[room.difficulty]*(guard?.25:1)*(1-.25*jammers),label:guard?'집중 포화 방어':'집중 포화 피격'};
   }
   Object.assign(pattern,{status:complete?'SUCCESS':'FAILED',resolvedAt:at,required,effect});
   room.patternHistory.push(structuredClone(pattern));
   room.effects.push({...effect,id:pattern.id,atMs});room.patternIndex++;
   rebuild(room);room.version++;
  }else{
   const index=room.patternIndex||0,participants=livingOwners(room,atMs),kind=index%2?'FOCUS':'VENT';
   if(!participants.length)return;
   room.pattern={id:'ARKE-'+index,kind,status:'OPEN',startsAt:at,endsAt:at+RULES.windowMs[room.difficulty],participants,inputs:{},
    targetId:kind==='FOCUS'?participants[(Math.floor(index/2)+room.seed%participants.length)%participants.length]:null};
   room.version++;
  }
 }
}
export function coopPatternInput(room,member,input,now){
 const p=room.pattern;
 if(room.status!=='ACTIVE'||!p||p.status!=='OPEN'||p.id!==input.patternId||now<p.startsAt||now>=p.endsAt)fail('PATTERN_EXPIRED','입력 시간이 끝났습니다. 다음 공격을 준비하세요.');
 if(!p.participants.includes(member.id)||!livingOwners(room,now-room.startsAt).includes(member.id))fail('PATTERN_MEMBER','생존한 자신의 분대만 조작할 수 있습니다.');
 const expected=p.kind==='VENT'?'VENT':member.id===p.targetId?'GUARD':'JAM';
 if(input.action!==expected)fail('PATTERN_ACTION','화면에 표시된 내 분대 행동을 선택하세요.');
 if(p.inputs[member.id])return;
 p.inputs[member.id]=expected;member.lastSeen=now;
}
