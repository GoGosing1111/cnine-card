import {ORGANIZATION_PREPARATION} from './organization-preparation-v1.mjs';

// Live release approved 2026-10-15. A round still requires an explicit 24-hour opening.
export const ORGANIZATION_RELEASE_ENABLED = true;
export const ORGANIZATION_RECRUITMENT_MS = 24*60*60*1000;
export const ORGANIZATION_LIMITS = Object.freeze({organizations:15,members:10,participants:150,ratingBatch:12});
export const ORGANIZATIONS = Object.freeze(ORGANIZATION_PREPARATION.names.map((name,index)=>Object.freeze({id:index+1,name,color:['#d5795f','#79a9e9','#83bc8c','#c78e62','#72bdd6','#ae96cf','#d28b85','#c3cbd3','#d5bb6c','#73b5bf','#b6a2de','#e0bd6e','#b0c9e1','#afb7c1','#db706a'][index]})));
export const organizationError=(code,message,status=409)=>Object.assign(new Error(message),{code:'ORG_'+code,status});
export function orgAssert(condition,code,message,status=409){if(!condition)throw organizationError(code,message,status);}
export function orgInteger(value,min,max,label){orgAssert(Number.isSafeInteger(value)&&value>=min&&value<=max,'INPUT',label+' 값을 확인하세요.',400);return value;}
export function defaultOrganizationPolicy(){return {revision:0,testUserIds:[],pointsPerRegion:null,settlementMinutes:null,growthMode:null,hideoutThresholds:[0,null,null,null,null],unlocks:{internal:null,hunting:null,boss:null}};}
export function validateOrganizationPolicy(value){
  orgAssert(value&&typeof value==='object'&&!Array.isArray(value),'POLICY','조직 설정을 확인하세요.',400);
  const nullable=(n,min,max,label)=>n===null?null:orgInteger(n,min,max,label);
  orgAssert(Array.isArray(value.testUserIds)&&value.testUserIds.length<=1000,'POLICY','테스트 계정 목록을 확인하세요.',400);
  const ids=value.testUserIds.map(id=>orgInteger(id,1,Number.MAX_SAFE_INTEGER,'계정 번호'));
  orgAssert(new Set(ids).size===ids.length,'POLICY','테스트 계정이 중복되었습니다.',400);
  orgAssert([null,'CUMULATIVE','SPEND'].includes(value.growthMode),'POLICY','아지트 성장 방식을 확인하세요.',400);
  orgAssert(Array.isArray(value.hideoutThresholds)&&value.hideoutThresholds.length===5&&value.hideoutThresholds[0]===0,'POLICY','아지트 5단계 기준을 확인하세요.',400);
  const thresholds=value.hideoutThresholds.map((n,i)=>nullable(n,0,1e12,'아지트 '+(i+1)+'단계'));let previous=-1;
  for(const threshold of thresholds){if(threshold===null)continue;orgAssert(threshold>previous,'POLICY','설정된 아지트 기준은 단계별로 증가해야 합니다.',400);previous=threshold;}
  return {revision:orgInteger(value.revision,0,2147483646,'설정 버전'),testUserIds:ids.sort((a,b)=>a-b),pointsPerRegion:nullable(value.pointsPerRegion,1,1e9,'지역당 점수'),settlementMinutes:nullable(value.settlementMinutes,1,10080,'정산 간격'),growthMode:value.growthMode,hideoutThresholds:thresholds,unlocks:Object.fromEntries(['internal','hunting','boss'].map(key=>[key,nullable(value.unlocks?.[key],1,5,'콘텐츠 해금 단계')]))};
}
export function organizationHideout(points,policy){
  orgInteger(points,0,Number.MAX_SAFE_INTEGER,'조직 점수');
  // A spend-based upgrade requires a separate receipt; never infer it from balance.
  let stage=1;
  if(policy.growthMode==='CUMULATIVE')for(let i=1;i<5;i++){const required=policy.hideoutThresholds[i];if(required===null||points<required)break;stage=i+1;}
  return {stage,name:ORGANIZATION_PREPARATION.hideouts[stage-1],points,nextThreshold:policy.growthMode==='CUMULATIVE'?(policy.hideoutThresholds[stage]??null):null,configured:policy.growthMode==='CUMULATIVE'&&policy.hideoutThresholds[1]!==null,contentEnabled:false};
}
function seeded(value,seed){let hash=2166136261;for(const c of seed+':'+value){hash^=c.charCodeAt(0);hash=Math.imul(hash,16777619);}return hash>>>0;}

// Balanced count is mandatory. Power is the primary optimization; wishes choose
// equal-power placements and the final organization labels. No preference weight
// silently weakens balance, and no client-supplied rating enters this function.
export function allocateOrganizations(input,{seed='organization-v1'}={}){
  orgAssert(Array.isArray(input)&&input.length>0,'EMPTY','설문 참가자가 없습니다.');
  orgAssert(input.length<=150,'OVERFLOW','150석을 초과했습니다. 초과 신청자 처리 정책을 정한 뒤 배정하세요.');
  const ids=new Set();const players=input.map(value=>{
    const userId=orgInteger(value.userId,1,Number.MAX_SAFE_INTEGER,'계정 번호');orgAssert(!ids.has(userId),'DUPLICATE','중복된 참가자가 있습니다.',400);ids.add(userId);
    const fit=value.organizationFit??Array(15).fill(0);orgAssert(Array.isArray(fit)&&fit.length===15&&fit.every(n=>Number.isSafeInteger(n)&&n>=0&&n<=100),'INTERVIEW','조직 성향 점수를 확인하세요.',400);
    return {...value,organizationFit:fit,userId,power:orgInteger(value.power,1,1e12,'평가 전력'),preferredOrganizationId:orgInteger(value.preferredOrganizationId,1,15,'희망 조직')};
  }).sort((a,b)=>b.power-a.power||seeded(a.userId,seed)-seeded(b.userId,seed)||a.userId-b.userId);
  const total=players.reduce((sum,p)=>sum+p.power,0),mean=total/15;
  const teams=Array.from({length:15},(_,i)=>({bucket:i,members:[],power:0}));
  for(const player of players){
    const smallest=Math.min(...teams.map(t=>t.members.length));
    const target=teams.filter(t=>t.members.length===smallest).sort((a,b)=>a.power-b.power||seeded(a.bucket,seed)-seeded(b.bucket,seed))[0];
    target.members.push(player);target.power+=player.power;
  }
  let swaps=0;
  // Bounded deterministic local improvement, not an optimality claim.
  for(;swaps<80;swaps++){
    let best=null,improvement=1e-12;
    for(let i=0;i<15;i++)for(let j=i+1;j<15;j++)for(let ai=0;ai<teams[i].members.length;ai++)for(let bi=0;bi<teams[j].members.length;bi++){
      const a=teams[i],b=teams[j],d=(b.members[bi].power-a.members[ai].power)/mean;
      const gain=-2*d*((a.power-b.power)/mean+d);
      if(gain>improvement){best={a,b,ai,bi};improvement=gain;}
    }
    if(!best)break;const {a,b,ai,bi}=best,delta=b.members[bi].power-a.members[ai].power;
    [a.members[ai],b.members[bi]]=[b.members[bi],a.members[ai]];a.power+=delta;b.power-=delta;
  }
  // Exact 15x15 assignment of the already balanced buckets to organization names.
  // 2^15 states and 15 choices per state; no unbounded search.
  const order=ORGANIZATIONS.map(o=>o.id).sort((a,b)=>seeded(a,seed)-seeded(b,seed));
  const score=teams.map(t=>order.map(id=>t.members.reduce((n,p)=>n+(p.preferredOrganizationId===id?15001:0)+p.organizationFit[id-1],0)));
  const dp=new Int32Array(1<<15).fill(-1),chosen=new Int8Array(1<<15).fill(-1),counts=new Uint8Array(1<<15);dp[0]=0;
  for(let mask=1;mask<dp.length;mask++)counts[mask]=counts[mask>>1]+(mask&1);
  for(let mask=0;mask<dp.length-1;mask++){if(dp[mask]<0)continue;const team=counts[mask];for(let j=0;j<15;j++){if(mask&(1<<j))continue;const next=mask|(1<<j),value=dp[mask]+score[team][j];if(value>dp[next]){dp[next]=value;chosen[next]=j;}}}
  let mask=dp.length-1;for(let i=14;i>=0;i--){const j=chosen[mask];teams[i].id=order[j];mask^=1<<j;}
  // Equal ratings may swap to satisfy more wishes without any power/count change.
  let changed=true;for(let pass=0;changed&&pass<150;pass++){changed=false;for(let i=0;i<15;i++)for(let j=i+1;j<15;j++)for(let ai=0;ai<teams[i].members.length;ai++)for(let bi=0;bi<teams[j].members.length;bi++){
    const a=teams[i],b=teams[j],x=a.members[ai],y=b.members[bi];if(x.power!==y.power)continue;
    const before=Number(x.preferredOrganizationId===a.id)+Number(y.preferredOrganizationId===b.id),after=Number(x.preferredOrganizationId===b.id)+Number(y.preferredOrganizationId===a.id);
    const affinityBefore=x.organizationFit[a.id-1]+y.organizationFit[b.id-1],affinityAfter=x.organizationFit[b.id-1]+y.organizationFit[a.id-1];
    if(after>before||(after===before&&affinityAfter>affinityBefore)){[a.members[ai],b.members[bi]]=[y,x];changed=true;}
  }}
  const organizations=teams.sort((a,b)=>a.id-b.id).map(t=>({id:t.id,name:ORGANIZATIONS[t.id-1].name,power:t.power,memberCount:t.members.length,members:t.members.sort((a,b)=>b.power-a.power||a.userId-b.userId).map((p,i)=>({...p,slot:i+1,preferenceMatched:p.preferredOrganizationId===t.id}))}));
  const powers=organizations.map(o=>o.power),matched=organizations.reduce((n,o)=>n+o.members.filter(m=>m.preferenceMatched).length,0);
  return {algorithm:'BALANCED_COUNT_POWER_WISH_V1',seed,organizations,stats:{participants:players.length,totalPower:total,minMembers:Math.min(...organizations.map(o=>o.memberCount)),maxMembers:Math.max(...organizations.map(o=>o.memberCount)),minPower:Math.min(...powers),maxPower:Math.max(...powers),powerSpreadPercent:Math.round((Math.max(...powers)-Math.min(...powers))/mean*10000)/100,preferenceMatched:matched,preferencePercent:Math.round(matched/players.length*1000)/10,affinityMean:Math.round(organizations.reduce((n,o)=>n+o.members.reduce((s,m)=>s+m.organizationFit[o.id-1],0),0)/players.length*10)/10,swaps}};
}
