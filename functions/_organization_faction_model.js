import {ORGANIZATION_DISTRICTS,ORGANIZATION_SESSION_RULES as RULES,FACTION_RULES,SQUADS,isSelfJoinSquad,organizationSquadChangeBlocked} from '../shared/organization-faction-v1.mjs';
import {factionDayKey,factionTime} from '../shared/clan-faction-sessions-v1.mjs';
import {newFactionState,advanceFactionState,factionEvent} from './_clan_faction_model.js';
import {reconcilePauses,closeSession,sessionView} from './_clan_faction_sessions.js';
import {advanceFixedOrganizationFaction} from './_organization_fixed_sessions.js';
import {ORGANIZATION_FIXED_SCHEDULE} from '../shared/organization-schedule-v1.mjs';
import {clanRestorationActive,CLAN_RESTORATION,lockedFactionSessions} from '../shared/clan-restoration-v1.mjs';
import {organizationSessionRewardRules,addOrganizationPigCoinRecipients} from '../shared/organization-competition-v1.mjs';
export const ORGANIZATION_SESSION_POLICY=Object.freeze({recipients:'PARTICIPANTS',interruption:'PAUSE',overlap:'DEFER',mapPolicy:'KEEP',rewardRules:RULES});
export function validateOrganizationFormation(formation,memberIds){
 const allowed=new Set(memberIds),used=new Set(),clean={};
 if(!formation||Object.keys(formation).some(key=>!SQUADS.some(s=>s.id===key)))throw Object.assign(Error('현재 공격대·방어대 구성을 확인하세요. 새로고침 후 다시 저장하세요.'),{status:400});
 for(const squad of SQUADS){
  const ids=formation?.[squad.id];
  if(!Array.isArray(ids)||ids.length>FACTION_RULES.squadSize)throw Object.assign(Error(`공격대·방어대 각각 5개를 확인하세요. 각 부대는 최대 ${FACTION_RULES.squadSize}명입니다. 새로고침 후 다시 저장하세요.`),{status:400});
  for(const id of ids){
   if(!Number.isSafeInteger(id)||!allowed.has(id))throw Object.assign(Error('현재 클랜원만 편성할 수 있습니다.'),{status:403});
   if(used.has(id))throw Object.assign(Error('한 클랜원은 하나의 부대에만 편성할 수 있습니다.'),{status:400});
   used.add(id);
  }
  clean[squad.id]=[...ids];
 }
 return clean;
}
export function changeOrganizationSelfMembership(state,formation,organizationId,userId,{squad,baseSquad,join}){
 const fail=(code,message,status=409)=>{throw Object.assign(Error(message),{code,status});};
 if(!isSelfJoinSquad(squad))fail('SELF_SQUAD','제4·제5 자율참여 공격대만 직접 가입·탈퇴할 수 있습니다.',400);
 const current=SQUADS.find(s=>formation[s.id]?.includes(userId))?.id||'';
 if(typeof baseSquad!=='string'||baseSquad!==current)fail('STALE','내 부대가 변경되었습니다. 새로고침 후 다시 선택하세요.');
 if(!join&&current!==squad)fail('SELF_MEMBERSHIP','본인이 가입한 자율참여 공격대만 탈퇴할 수 있습니다.',403);
 if(organizationSquadChangeBlocked(state.battles,organizationId,userId,current,squad))fail('BATTLE','현재 부대 또는 선택한 공격대의 교전이 끝난 뒤 가입·이동·탈퇴하세요.');
 if(join&&current===squad)return {changed:false,squad,previousSquad:current};
 if(join&&formation[squad].length>=FACTION_RULES.squadSize)fail('SQUAD_FULL','이 공격대는 3명 정원이 찼습니다. 다른 자율참여 공격대를 선택하세요.');
 const next=Object.fromEntries(SQUADS.map(s=>[s.id,formation[s.id].filter(id=>id!==userId)]));
 if(join)next[squad].push(userId);
 state.formations[organizationId]=next;
 for(const district of state.districts)if(district.owner===organizationId&&district.defense&&!next[district.defense]?.length)district.defense='';
 return {changed:true,squad:join?squad:'',previousSquad:current};
}
export function organizationCaptains(captains,memberIds){return Object.fromEntries(SQUADS.filter(s=>s.role==='ATTACK').map(s=>[s.id,Number.isSafeInteger(captains?.[s.id])&&memberIds.includes(captains[s.id])?captains[s.id]:0]));}
export function validateOrganizationCaptains(captains,memberIds){
 const ids=SQUADS.filter(s=>s.role==='ATTACK').map(s=>s.id),used=new Set();
 const fail=(message,status=400)=>{throw Object.assign(Error(message),{status});};
 if(!captains||Array.isArray(captains)||Object.keys(captains).some(key=>!ids.includes(key))||ids.some(key=>!Object.hasOwn(captains,key)))fail('제1~제5 공격대의 행동대장을 각각 선택하세요. 새로고침 후 다시 저장하세요.');
 for(const key of ids){const id=captains[key]??0;if(!Number.isSafeInteger(id)||id<0)fail('행동대장 계정을 확인하세요.');if(id&&!memberIds.includes(id))fail('현재 클랜원만 행동대장으로 지정할 수 있습니다.',403);if(id&&used.has(id))fail('한 사람은 하나의 공격대 행동대장만 맡을 수 있습니다.');if(id)used.add(id);}
 return organizationCaptains(captains,memberIds);
}
export function assignOrganizationGarrison(state,organizationId,districtId,squad,formation){
 const fail=message=>{throw Object.assign(Error(message),{status:409,code:'ORG_GARRISON'});};
 const district=state.districts.find(d=>d.id===String(districtId));
 if(!district||district.owner!==organizationId)fail('우리 점령지를 선택하세요.');
 if(state.battles.some(b=>b.status==='ACTIVE'&&b.districtId===district.id))fail('교전 중인 지역의 방어대는 변경할 수 없습니다.');
 if(squad===''){district.defense='';return;}
 if(!SQUADS.some(s=>s.id===squad&&s.role==='DEFENSE')||!formation[squad]?.length)fail('방어대를 먼저 편성하세요.');
 const previous=state.districts.filter(d=>d.owner===organizationId&&d.defense===squad&&d.id!==district.id);
 if(previous.some(d=>state.battles.some(b=>b.status==='ACTIVE'&&b.districtId===d.id)))fail('교전 중인 방어대는 다른 지역으로 이동할 수 없습니다.');
 for(const d of previous)d.defense='';
 district.defense=squad;
}
export function newOrganizationFactionState(now){
 const state=newFactionState(now);
 state.districts=ORGANIZATION_DISTRICTS.map(d=>({id:d.id,owner:0,protectedUntil:0,defense:'',taxAt:now,taxRemainder:0}));
 state.taxDisabledAt=now;state.commanders={};state.elders={};state.sessionQueue=[];state.organizationVersion=1;state.districtScope='SEOUL_25_20261021';
 return state;
}
// Scope migration only: never reset legitimate Seoul captures on a subsequent read.
export function restrictOrganizationDistricts(state,now){
 const allowed=new Set(ORGANIZATION_DISTRICTS.map(d=>d.id));
 const removed=state.districts.filter(d=>!allowed.has(d.id));
 const cancelled=state.battles.filter(b=>b.status==='ACTIVE'&&!allowed.has(b.districtId));
 if(!removed.length&&!cancelled.length&&state.districts.length===allowed.size&&state.districtScope==='SEOUL_25_20261021')return false;
 if(removed.length)state.retiredDistricts=[...(state.retiredDistricts||[]).filter(d=>!removed.some(r=>r.id===d.id)),...removed];
 state.districts=ORGANIZATION_DISTRICTS.map(meta=>state.districts.find(d=>d.id===meta.id)||{id:meta.id,owner:0,protectedUntil:0,defense:'',taxAt:now,taxRemainder:0});
 for(const b of cancelled)Object.assign(b,{status:'CANCELLED',reason:'DISTRICT_REMOVED',endedAt:now,winner:0});
 state.districtScope='SEOUL_25_20261021';
 return true;
}
export function advanceOrganizationFaction(state,{schedule,wars=[],roster=[],now,assignedAt,policy}){
 const restored=clanRestorationActive(now);
 if(restored&&CLAN_RESTORATION.factionScheduleLocked)return {state,settlements:[],view:lockedFactionSessions(organizationSessionRewardRules(RULES,policy,now))};
 if(!restored&&now>=ORGANIZATION_FIXED_SCHEDULE.effectiveAt)return advanceFixedOrganizationFaction(state,{wars,roster,now,assignedAt,policy});
 const settlements=[];
 // Apply the explicit 8-district correction to an unfinished legacy session,
 // including a paused one. Settled history and all payout amounts stay intact.
 if(['ACTIVE','PAUSED'].includes(state.session?.status)&&state.session.rewardRules?.version==='20261019-six-organizations'&&state.session.rewardRules.requiredTerritories===9){
  state.session.rewardRules={...state.session.rewardRules,version:RULES.version,requiredTerritories:RULES.requiredTerritories};
 }
 const activeWars=wars.some(w=>w.status==='ACTIVE'||(w.status==='PREPARING'&&factionTime(w.starts_at)<=now));
 if(['ACTIVE','PAUSED'].includes(state.session?.status))reconcilePauses(state,wars,now,Infinity);
 else advanceFactionState(state,now,Infinity);
 if(state.session?.status==='ACTIVE'&&state.session.endsAt<=now)
  settlements.push(addOrganizationPigCoinRecipients(closeSession(state,state.session,state.session.endsAt,'SESSION_END',roster,{...ORGANIZATION_SESSION_POLICY,rewardRules:state.session.rewardRules||RULES}),roster));
 const busy=()=>['ACTIVE','PAUSED'].includes(state.session?.status);
 const overlaps=slot=>busy()||state.sessionQueue.length||(state.session?.key!==slot.key&&state.session?.closedAt>slot.startsAt);
 const queue=slot=>{slot.status='QUEUED';slot.reason='PREVIOUS_SESSION';if(!state.sessionQueue.some(s=>s.key===slot.key))state.sessionQueue.push({...slot,plannedStartsAt:slot.startsAt,plannedEndsAt:slot.endsAt});state.sessionQueue.sort((a,b)=>a.plannedStartsAt-b.plannedStartsAt);};
 const open=slot=>{
  state.session={...slot,status:'ACTIVE',participants:[],participantClans:{},fundsPerRegion:policy.fundsPerRegion,rewardRules:organizationSessionRewardRules(RULES,policy,slot.startsAt)};
  const displayed=state.sessionPlan.find(s=>s.key===slot.key);if(displayed)Object.assign(displayed,slot,{status:'ACTIVE'});
  factionEvent(state,{id:'start:'+slot.key,kind:'SESSION_START',at:slot.startsAt});
 };
 if(state.sessionDay!==factionDayKey(now)||(restored&&state.scheduleVersion!==CLAN_RESTORATION.version)){
  if(restored&&state.scheduleVersion!==CLAN_RESTORATION.version){state.sessionQueue=[];state.sessionPlan=[];state.scheduleVersion=CLAN_RESTORATION.version;}
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
 return {state,settlements,view:{...view,rules:busy()?state.session.rewardRules||RULES:RULES,recipientPolicy:'PARTICIPANTS',mapPolicy:'KEEP'}};
}
