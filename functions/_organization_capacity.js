import {ORGANIZATIONS,orgAssert} from '../shared/organization-system-v1.mjs';
import {clanHideoutCapacity} from '../shared/organization-capacity-v1.mjs';

export async function organizationMemberLimit(q,roundId,clanId,window){
 if(window?.calendar?.sourceRoundId===roundId)return clanHideoutCapacity(1);
 const [row]=await q('SELECT stage FROM organization_progress_v1 WHERE round_id=$1 AND organization_id=$2',[roundId,clanId]);
 return clanHideoutCapacity(row?.stage);
}

// Caller holds the round lock and saves the window/audit/receipt in one transaction.
// The assigned elders joined at the draw, before general member registration.
export function reconcileSignupCapacity(window,progress,now){
 const removed=[],clans=[];
 for(const {id} of ORGANIZATIONS){
  const stage=window.calendar&&!window.startedSeasonId?1:Number(progress.find(p=>Number(p.organization_id)===id)?.stage||1),capacity=clanHideoutCapacity(stage);
  const elders=window.selections?.[id]||[],elderIds=new Set(elders.map(p=>p.id));
  orgAssert(elders.length<=capacity,'CAPACITY','원로 인원이 아지트 정원을 초과했습니다.');
  const members=Object.entries(window.members||{}).filter(([uid,m])=>m.organizationId===id&&!elderIds.has(Number(uid)))
   .map(([uid,m])=>({userId:Number(uid),...m})).sort((a,b)=>a.joinedAt-b.joinedAt||a.userId-b.userId);
  const retained=members.slice(0,capacity-elders.length),overflow=members.slice(capacity-elders.length);
  for(const member of overflow){
   removed.push(member);delete window.members[member.userId];
   window.capacityReapplications??={};
   window.capacityReapplications[member.userId]={organizationId:id,joinedAt:member.joinedAt,adjustedAt:now};
  }
  clans.push({id,stage,capacity,before:elders.length+members.length,after:elders.length+retained.length,retainedUserIds:[...elderIds,...retained.map(m=>m.userId)]});
 }
 return {clans,removed};
}
