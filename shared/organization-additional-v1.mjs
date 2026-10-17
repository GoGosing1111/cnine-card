import {ORGANIZATIONS,orgAssert,orgInteger} from './organization-system-v1.mjs';

// Existing memberships and their slots are immutable. Only the new applicants
// participate in balancing; explicit OWNER placements remain fixed too.
export function allocateAdditionalOrganizations(applicants,existing,{seed='additional-v1',fixedAssignments=[]}={}){
 orgAssert(Array.isArray(applicants)&&applicants.length>0,'EMPTY','추가 입단 신청자가 없습니다.');
 orgAssert(Array.isArray(existing)&&existing.length>0,'MEMBERSHIP','기존 조직 명부를 확인하세요.');
 const totalCount=applicants.length+existing.length,maximum=Math.ceil(totalCount/15);
 orgAssert(totalCount<=150,'OVERFLOW','150석을 초과했습니다. 초과 신청자 처리 정책을 정한 뒤 배정하세요.');
 const ids=new Set(),teams=ORGANIZATIONS.map(o=>({...o,members:[],power:0}));
 const validate=p=>{orgInteger(p.userId,1,Number.MAX_SAFE_INTEGER,'계정 번호');orgInteger(p.power,1,1e12,'평가 전력');orgInteger(p.preferredOrganizationId,1,15,'희망 조직');orgAssert(!ids.has(p.userId),'DUPLICATE','중복된 참가자가 있습니다.',400);ids.add(p.userId);return {...p};};
 for(const value of existing){const p=validate(value),id=orgInteger(p.organizationId,1,15,'기존 조직'),team=teams[id-1];orgInteger(p.slot,1,10,'기존 슬롯');orgAssert(!team.members.some(m=>m.slot===p.slot),'MEMBERSHIP','기존 조직 슬롯이 중복됐습니다.');team.members.push({...p,preserved:true});team.power+=p.power;}
 const players=applicants.map(validate).sort((a,b)=>b.power-a.power||a.userId-b.userId);
 orgAssert(Array.isArray(fixedAssignments)&&fixedAssignments.length<=players.length,'PLACEMENT','고정 배정 목록을 확인하세요.',400);
 const fixed=new Map();
 for(const p of fixedAssignments){orgInteger(p.userId,1,Number.MAX_SAFE_INTEGER,'계정 번호');orgInteger(p.organizationId,1,15,'고정 조직');orgAssert(players.some(m=>m.userId===p.userId)&&!fixed.has(p.userId),'PLACEMENT','고정 배정은 중복 없는 추가 신청자만 지정할 수 있습니다.',400);fixed.set(p.userId,p.organizationId);}
 const add=(team,p)=>{team.members.push({...p,fixed:fixed.has(p.userId)});team.power+=p.power;};
 for(const p of players.filter(p=>fixed.has(p.userId)))add(teams[fixed.get(p.userId)-1],p);
 orgAssert(teams.every(t=>t.members.length<=maximum),'FIXED_BALANCE','기존 소속과 고정 배정을 유지하면서 인원 차이를 1명 이내로 맞출 수 없습니다.');
 const fit=(p,id)=>Number(p.organizationFit?.[id-1]||0),wish=(p,id)=>Number(p.preferredOrganizationId===id);
 for(const p of players.filter(p=>!fixed.has(p.userId))){
  const smallest=Math.min(...teams.map(t=>t.members.length));
  const team=teams.filter(t=>t.members.length===smallest).sort((a,b)=>a.power-b.power||wish(p,b.id)-wish(p,a.id)||fit(p,b.id)-fit(p,a.id)||a.id-b.id)[0];add(team,p);
 }
 const total=teams.reduce((n,t)=>n+t.power,0),mean=total/15;let swaps=0;
 for(;swaps<80;swaps++){
  let best=null,gain=1e-12;
  for(let i=0;i<15;i++)for(let j=i+1;j<15;j++)for(let ai=0;ai<teams[i].members.length;ai++)for(let bi=0;bi<teams[j].members.length;bi++){
   const a=teams[i],b=teams[j],x=a.members[ai],y=b.members[bi];if(x.preserved||y.preserved||x.fixed||y.fixed)continue;
   const d=(y.power-x.power)/mean,improvement=-2*d*((a.power-b.power)/mean+d);
   if(improvement>gain){best={a,b,ai,bi};gain=improvement;}
  }
  if(!best)break;const {a,b,ai,bi}=best,delta=b.members[bi].power-a.members[ai].power;[a.members[ai],b.members[bi]]=[b.members[bi],a.members[ai]];a.power+=delta;b.power-=delta;
 }
 const organizations=teams.map(t=>{
  const used=new Set(t.members.filter(m=>m.preserved).map(m=>m.slot));
  for(const p of t.members.filter(m=>!m.preserved).sort((a,b)=>b.power-a.power||a.userId-b.userId)){p.slot=Array.from({length:10},(_,i)=>i+1).find(i=>!used.has(i));orgAssert(p.slot,'CAPACITY','조직 정원이 가득 찼습니다.');used.add(p.slot);}
  return {id:t.id,name:t.name,power:t.power,memberCount:t.members.length,members:t.members.sort((a,b)=>a.slot-b.slot).map(m=>({...m,preferenceMatched:m.preferredOrganizationId===t.id}))};
 });
 const powers=organizations.map(o=>o.power),counts=organizations.map(o=>o.memberCount),matched=organizations.reduce((n,o)=>n+o.members.filter(m=>m.preferenceMatched).length,0);
 orgAssert(Math.max(...counts)-Math.min(...counts)<=1,'BALANCE','조직별 인원 균형을 확인하세요.');
 return {algorithm:'PRESERVE_MEMBERS_BALANCED_ADDITIONS_V1',seed,fixedAssignments:[...fixed].sort((a,b)=>a[0]-b[0]).map(([userId,organizationId])=>({userId,organizationId})),organizations,stats:{participants:totalCount,existingMembers:existing.length,additionalApplicants:players.length,totalPower:total,minMembers:Math.min(...counts),maxMembers:Math.max(...counts),minPower:Math.min(...powers),maxPower:Math.max(...powers),powerSpreadPercent:Math.round((Math.max(...powers)-Math.min(...powers))/mean*10000)/100,preferenceMatched:matched,preferencePercent:Math.round(matched/totalCount*1000)/10,swaps}};
}
