import {ORGANIZATION_DISTRICTS} from '../shared/organization-faction-v1.mjs';
import {FACTION_SESSION_RULES as RULES,factionDayKey,factionTime} from '../shared/clan-faction-sessions-v1.mjs';
import {newFactionState,advanceFactionState,factionEvent} from './_clan_faction_model.js';
import {reconcilePauses,closeSession,sessionView} from './_clan_faction_sessions.js';
export const ORGANIZATION_SESSION_POLICY=Object.freeze({recipients:'PARTICIPANTS',interruption:'PAUSE',overlap:'DEFER',mapPolicy:'KEEP'});
export function newOrganizationFactionState(now){
 const state=newFactionState(now);
 state.districts=ORGANIZATION_DISTRICTS.map(d=>({id:d.id,owner:0,protectedUntil:0,defense:'',taxAt:now,taxRemainder:0}));
 state.taxDisabledAt=now;state.commanders={};state.sessionQueue=[];state.organizationVersion=1;
 return state;
}
export function advanceOrganizationFaction(state,{schedule,wars=[],roster=[],now,assignedAt,policy}){
 const settlements=[];
 const activeWars=wars.some(w=>w.status==='ACTIVE'||(w.status==='PREPARING'&&factionTime(w.starts_at)<=now));
 if(['ACTIVE','PAUSED'].includes(state.session?.status))reconcilePauses(state,wars,now,Infinity);
 else advanceFactionState(state,now,Infinity);
 if(state.session?.status==='ACTIVE'&&state.session.endsAt<=now)
  settlements.push(closeSession(state,state.session,state.session.endsAt,'SESSION_END',roster,ORGANIZATION_SESSION_POLICY));
 const busy=()=>['ACTIVE','PAUSED'].includes(state.session?.status);
 const overlaps=slot=>busy()||state.sessionQueue.length||(state.session?.key!==slot.key&&state.session?.closedAt>slot.startsAt);
 const queue=slot=>{slot.status='QUEUED';slot.reason='PREVIOUS_SESSION';if(!state.sessionQueue.some(s=>s.key===slot.key))state.sessionQueue.push({...slot,plannedStartsAt:slot.startsAt,plannedEndsAt:slot.endsAt});state.sessionQueue.sort((a,b)=>a.plannedStartsAt-b.plannedStartsAt);};
 const open=slot=>{
  state.session={...slot,status:'ACTIVE',participants:[],participantClans:{},fundsPerRegion:policy.fundsPerRegion};
  const displayed=state.sessionPlan.find(s=>s.key===slot.key);if(displayed)Object.assign(displayed,slot,{status:'ACTIVE'});
  factionEvent(state,{id:'start:'+slot.key,kind:'SESSION_START',at:slot.startsAt});
 };
 if(state.sessionDay!==factionDayKey(now)){
  for(const slot of state.sessionPlan||[])if(slot.status==='SCHEDULED'&&slot.startsAt<=now&&slot.startsAt>=assignedAt&&overlaps(slot))queue(slot);
  state.sessionDay=factionDayKey(now);state.sessionPlan=schedule.map(slot=>({...slot,status:'SCHEDULED'}));
 }
 for(const slot of state.sessionPlan){
  if(slot.status!=='SCHEDULED')continue;
  if(slot.startsAt<assignedAt){slot.status='SKIPPED';slot.reason='BEFORE_ASSIGNMENT';continue;}
  if(slot.startsAt>now)continue;
  if(overlaps(slot)){queue(slot);continue;}
  if(slot.endsAt<=now){slot.status='SKIPPED';slot.reason='UNAVAILABLE_WINDOW';continue;}
  if(activeWars||wars.some(w=>factionTime(w.starts_at)<=now&&factionTime(w.starts_at)<slot.endsAt&&(!['FINISHED'].includes(w.status)||factionTime(w.settled_at||w.ends_at)>slot.startsAt))){slot.status='SKIPPED';slot.reason='TERRITORY_WAR';continue;}
  open(slot);
 }
 if(!busy()&&!activeWars&&state.sessionQueue.length){const slot=state.sessionQueue.shift();open({...slot,startsAt:now,endsAt:now+RULES.durationMs,deferred:true});}
 const view=sessionView(state,schedule,now,{phase:'ACTIVE'},activeWars||state.session?.status==='PAUSED');
 return {state,settlements,view:{...view,recipientPolicy:'PARTICIPANTS',mapPolicy:'KEEP'}};
}
