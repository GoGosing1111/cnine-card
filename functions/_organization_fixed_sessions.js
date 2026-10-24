import {factionDayKey} from '../shared/clan-faction-sessions-v1.mjs';
import {createOrganizationDay,nextOrganizationStart,ORGANIZATION_FIXED_SCHEDULE as S,ORGANIZATION_FIXED_RULES as R} from '../shared/organization-schedule-v1.mjs';
import {advanceFactionState,factionEvent} from './_clan_faction_model.js';
import {reconcilePauses,closeSession,sessionView} from './_clan_faction_sessions.js';
import {organizationSessionRewardRules,addOrganizationPigCoinRecipients} from '../shared/organization-competition-v1.mjs';
const busy=state=>['ACTIVE','PAUSED'].includes(state.session?.status);
const policyFor=session=>({recipients:'PARTICIPANTS',interruption:'PAUSE',overlap:'SKIP',mapPolicy:'KEEP',rewardRules:session.rewardRules||R});
export function advanceFixedOrganizationFaction(state,{wars=[],roster=[],now,assignedAt,policy}){
 const settlements=[],day=factionDayKey(now),schedule=createOrganizationDay(day);
 // Preserve completed receipts/maps. Never launch an old random/deferred slot.
 if(state.scheduleVersion!==S.version||state.sessionDay!==day){
  state.sessionQueue=[];
  state.sessionDay=day;state.scheduleVersion=S.version;
  state.sessionPlan=schedule.map(slot=>({...slot,status:state.session?.key===slot.key?state.session.status:'SCHEDULED'}));
 }
 const reconcile=()=>{
  if(!busy(state))return;
  const session=state.session,deadline=session.hardEndsAt??session.endsAt;
  session.hardEndsAt=deadline;
  reconcilePauses(state,wars,Math.min(now,deadline),deadline);
  // Territory wars pause play, but the published closing time never moves.
  session.endsAt=deadline;
  for(const b of state.battles)if(b.status==='ACTIVE')b.endsAt=Math.min(b.endsAt,deadline);
  const slot=state.sessionPlan.find(s=>s.key===session.key);
  if(slot)Object.assign(slot,{endsAt:deadline,status:session.status});
  if(now>=deadline){
   const snapshot=closeSession(state,session,deadline,'SESSION_END',roster,policyFor(session));
   addOrganizationPigCoinRecipients(snapshot,roster);
   state.session={...snapshot};
   settlements.push(snapshot);
  }
 };
 reconcile();
 for(const slot of state.sessionPlan){
  if(slot.status!=='SCHEDULED'||slot.startsAt>now)continue;
  if(slot.startsAt<assignedAt){Object.assign(slot,{status:'SKIPPED',reason:'BEFORE_ASSIGNMENT'});continue;}
  if(slot.endsAt<=now||busy(state)){Object.assign(slot,{status:'SKIPPED',reason:'UNAVAILABLE_WINDOW'});continue;}
  state.session={...slot,status:'ACTIVE',participants:[],participantClans:{},fundsPerRegion:policy.fundsPerRegion,rewardRules:organizationSessionRewardRules(R,policy,slot.startsAt),hardEndsAt:slot.endsAt};
  slot.status='ACTIVE';
  factionEvent(state,{id:'start:'+slot.key,kind:'SESSION_START',at:slot.startsAt});
  reconcile();
 }
 if(!busy(state))advanceFactionState(state,now,Infinity);
 const paused=state.session?.status==='PAUSED',view=sessionView(state,schedule,now,{phase:'ACTIVE'},paused);
 if(view.current&&busy(state))view.current.remainingMs=Math.max(0,state.session.endsAt-now);
 return {state,settlements,view:{...view,nextStartsAt:nextOrganizationStart(now),fixedSchedule:S,state:view.active?'ACTIVE':paused?'TERRITORY_WAR':'WAITING',rules:busy(state)?state.session.rewardRules||R:organizationSessionRewardRules(R,policy,now),recipientPolicy:'PARTICIPANTS',mapPolicy:'KEEP'}};
}
