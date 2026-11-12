import {ORGANIZATIONS,orgAssert,orgInteger} from '../shared/organization-system-v1.mjs';
import {activeClanResumption,CLAN_RESUMPTION_STATE_KEY,resumedClanSettings,clanCalendarPhase,clanPlayoffTimes} from '../shared/clan-resumption-v1.mjs';
import {newOrganizationFactionState} from './_organization_faction_model.js';
import {shuffleDuo as shuffle} from '../shared/ranked-duo-random-v4.mjs';

const day=86400000, applicationMs=2*day, seasonDays=50;
const clubs=ORGANIZATIONS.map(o=>o.id);
const key=r=>'organization:elder-season:'+r.id;
const iso=t=>new Date(t).toISOString();
export const seasonAdmissionEnabled=(round,now)=>round?.scope==='LIVE'&&now>=Date.parse('2026-11-10T00:00:00+09:00');

async function readWindow(q,r){
 const [row]=await q('SELECT value FROM app_meta WHERE key=$1',[key(r)]);
 return row?JSON.parse(row.value):null;
}
async function writeValue(q,name,value,now){
 await q('INSERT INTO app_meta(key,value,updated_at) VALUES($1,$2,$3) ON CONFLICT(key) DO UPDATE SET value=excluded.value,updated_at=excluded.updated_at',[name,JSON.stringify(value),iso(now)]);
}
function activeAccount(user,now){
 return user?.status==='ACTIVE'&&(!user.banned_until||Date.parse(user.banned_until)<=now);
}
async function drawElders(q,round,window,now){
 if(window.drawnAt||now<window.closesAt)return false;
 const ids=Object.keys(window.applications).map(Number);
 const accounts=await q(`SELECT u.id,u.status,u.banned_until,m.seed_power FROM users u
  LEFT JOIN organization_members_v1 m ON m.round_id=$1 AND m.user_id=u.id
  WHERE u.id=ANY($2::bigint[]) ORDER BY u.id FOR SHARE OF u`,[round.id,ids]);
 const eligible=accounts.filter(a=>activeAccount(a,now));
 const order=shuffle(clubs),winners=shuffle(eligible).slice(0,clubs.length*3);
 const withoutSeed=winners.filter(a=>!window.applications[a.id].power&&!a.seed_power).map(a=>Number(a.id));
 // Pre-calendar applications may predate both enrollment ratings and clan membership.
 const cached=withoutSeed.length?await q("SELECT user_id,(payload_json::jsonb->>'power')::bigint AS power FROM ranked_duo_profiles_v1 WHERE user_id=ANY($1::bigint[])",[withoutSeed]):[];
 const priorPower=new Map(cached.map(p=>[Number(p.user_id),Number(p.power)]));
 window.selections=Object.fromEntries(clubs.map(id=>[id,[]]));
 winners.forEach((a,index)=>{
  const id=Number(a.id),application=window.applications[id];
  // Older clients recorded a preferred clan. Only their original power snapshot is used.
  const power=Number(application.power||a.seed_power||priorPower.get(id)||1);
  window.selections[order[index%order.length]].push({id,power});
 });
 window.drawnAt=now;
 window.drawEligibleCount=eligible.length;
 window.revision++;
 await writeValue(q,key(round),window,now);
 return true;
}
function signupRoster(window, club, selected=window.selections[club]||[]) {
 const members=new Map(selected.map(p=>[p.id,{...p,elder:true}]));
 for(const [uid,m] of Object.entries(window.members||{})){
  if(m.organizationId===club&&!members.has(Number(uid)))members.set(Number(uid),{id:Number(uid),power:m.power,elder:false});
 }
 return [...members.values()];
}
export async function elderSeasonView(q,r,user,now,admin=false){
 const window=await readWindow(q,r);
 if(!window)return {phase:'CLOSED',windowId:null,revision:0,seasonDays,elderCount:3};
 const phase=window.calendar?clanCalendarPhase(window.calendar,now):window.startedSeasonId?'STARTED':now<window.closesAt?'OPEN':'SELECTION';
 const assignedClub=clubs.find(club=>window.selections[club]?.some(p=>p.id===Number(user.id)))||null;
 const view={phase,windowId:window.id,revision:window.revision,openedAt:window.openedAt,closesAt:window.closesAt,seasonDays,elderCount:3,
  organizationId:window.calendar?assignedClub:window.applications[user.id]?.organizationId||null,selected:!!assignedClub};
 if(window.calendar){
  view.calendar=window.calendar;
  view.applied=!!window.applications[user.id];view.drawnAt=window.drawnAt||null;
  view.memberClubId=assignedClub||window.members?.[user.id]?.organizationId||null;
  view.memberCounts=Object.fromEntries(clubs.map(id=>[id,signupRoster(window,id).length]));
 }
 if(admin){
  view.applicants=Object.entries(window.applications).map(([id,a])=>window.calendar?{id:Number(id),nickname:a.nickname,appliedAt:a.appliedAt}:{id:Number(id),...a});
  view.selections=Object.fromEntries(Object.entries(window.selections).map(([id,people])=>[id,people.map(p=>p.id)]));
  view.ready=clubs.every(id=>window.selections[id]?.length===3);
 }
 return view;
}
function checkCandidates(window,body,now){
 orgAssert(!window?.calendar,'ELDER_DRAW','시즌 5 원로는 접수 마감 때 자동 추첨합니다.');
 orgAssert(window&&window.id===body.windowId&&window.closesAt<=now&&!window.startedSeasonId,'ELDER_PHASE','원로 모집 마감 후 선정할 수 있습니다.');
 orgAssert(body.revision===window.revision,'STALE','다른 운영 작업이 반영되었습니다. 명단을 다시 불러오세요.');
 const id=orgInteger(body.organizationId,1,clubs.length,'희망 클랜'),ids=body.userIds;
 orgAssert(Array.isArray(ids)&&ids.length===3&&new Set(ids).size===ids.length&&ids.every(uid=>Number.isSafeInteger(uid)&&window.applications[uid]?.organizationId===id),'ELDER_SELECTION','해당 클랜에 지원한 원로 3명을 선택하세요.');
}
export async function elderSeasonCommand(env,user,path,body,deps,now,{mutation,lockedContext,qFor,reconcileRecruitment}){
 const action=path.split('/').at(-1),operator=path.startsWith('admin/');
 let ratings,drawDue=false;
 if(action==='select'||action==='join'||action==='apply'){
  const load=await env.DB.enqueue(async()=>{
   const q=qFor(env.DB),[receipt]=await q('SELECT request_id FROM organization_receipts_v1 WHERE actor_id=$1 AND request_id=$2',[user.id,body.requestId]);
   if(receipt)return false;
   const [r]=await q('SELECT * FROM organization_rounds_v1 WHERE id=$1',[body.roundId]);
   const window=r&&await readWindow(q,r);
   if(action==='apply'){
    if(!window?.calendar)return false;
    orgAssert(window.id===body.windowId&&now<window.closesAt,'ELDER_CLOSED','원로 신청이 마감되었습니다.');
    orgAssert(!window.applications[user.id],'PENDING','이미 원로 추첨에 신청했습니다.');
    return true;
   }else if(action==='join'){
    orgAssert(window?.calendar&&window.id===body.windowId&&clanCalendarPhase(window.calendar,now)==='MEMBERS','MEMBER_PHASE','클랜원 자율 가입 기간에만 가입할 수 있습니다.');
    drawDue=!window.drawnAt;
   }else{
    orgAssert(seasonAdmissionEnabled(r,now)&&user.role==='OWNER','PERMISSION','운영자만 원로를 선정할 수 있습니다.',403);
    checkCandidates(window,body,now);
   }
   return action==='join'||body.userIds.length>0;
  });
  if(drawDue)await reconcileRecruitment(env,deps,{now});
  if(load)ratings=await (deps.loadOrganizationRatings||(await import('./_organization_ratings.js')).loadOrganizationRatings)(env,action==='select'?body.userIds:[Number(user.id)],deps,{now});
 }
 return mutation(env,user,path,body,async q=>{
  const {r}=await lockedContext(q,user,body),at=(deps.now||Date.now)();
  orgAssert(seasonAdmissionEnabled(r,at)&&r.phase==='ASSIGNED','ELDER_ROUND','운영 중인 클랜 시즌에서 이용하세요.');
  const [actor]=await q('SELECT nickname,role,status,banned_until FROM users WHERE id=$1 FOR SHARE',[user.id]);
  orgAssert(activeAccount(actor,at)&&(!operator||actor.role==='OWNER'),'PERMISSION','이 요청을 처리할 권한이 없습니다.',403);
  let window=await readWindow(q,r);
  if(action==='open'&&window?.calendar&&r.id!==window.calendar.sourceRoundId&&at>=window.calendar.endsAt&&window.id===body.windowId){
   window=null;body={...body,windowId:null};
  }
  orgAssert((window?.id||null)===body.windowId&&!window?.startedSeasonId,'STALE','모집 일정이 바뀌었습니다. 다시 불러오세요.');
  if(action==='open'){
   orgAssert(!window?.calendar,'ELDER_PHASE','이 시즌의 원로 모집 일정은 확정되었습니다.');
   orgAssert(!window||at>=window.closesAt,'ELDER_OPEN','이미 원로 지원을 받고 있습니다.');
   // An additional window retains candidates and confirmed slates.
   window={id:crypto.randomUUID(),openedAt:at,closesAt:at+applicationMs,revision:(window?.revision||0)+1,
    applications:window?.applications||{},selections:window?.selections||{}};
  }else{
   orgAssert(window,'ELDER_CLOSED','운영자가 원로 모집을 열면 지원할 수 있습니다.');
   if(action==='apply'||action==='cancel'){
    orgAssert(at<window.closesAt,'ELDER_CLOSED','원로 신청이 마감되었습니다.');
    const previous=window.applications[user.id],selected=previous&&window.selections[previous.organizationId]?.some(p=>p.id===Number(user.id));
    orgAssert(!selected,'ELDER_SELECTED','이미 원로로 선정되었습니다.');
    if(action==='apply'){
     orgAssert(!previous,'PENDING','이미 원로 지원을 접수했습니다.');
     const application={nickname:actor.nickname,appliedAt:at};
     if(window.calendar){
      const rating=ratings?.[0];
      orgAssert(rating?.userId===Number(user.id)&&Number.isSafeInteger(rating.power)&&rating.power>0,'RATING_INVALID','전력 정보를 다시 확인해 주세요.');
      application.power=rating.power;
     }else application.organizationId=orgInteger(body.organizationId,1,clubs.length,'희망 클랜');
     window.applications[user.id]=application;
    }else{orgAssert(previous,'ELDER_APPLICATION','접수된 지원서가 없습니다.');delete window.applications[user.id];}
   }else if(action==='join'){
    orgAssert(window.calendar&&clanCalendarPhase(window.calendar,at)==='MEMBERS','MEMBER_PHASE','클랜원 자율 가입이 마감되었습니다.');
    orgAssert(window.drawnAt,'ELDER_DRAW','원로 추첨 결과를 다시 불러오세요.');
    const club=orgInteger(body.organizationId,1,clubs.length,'가입할 클랜'),uid=Number(user.id);
    orgAssert(!window.members?.[uid]&&!Object.values(window.selections).some(s=>s.some(p=>p.id===uid)),'MEMBER','이미 이번 시즌 클랜에 가입했습니다.');
    orgAssert(signupRoster(window,club).length<25,'FULL','클랜 정원 25명이 찼습니다.');
    const validate=deps.validateOrganizationRatingsLocked||(await import('./_organization_ratings.js')).validateOrganizationRatingsLocked;
    orgAssert(ratings?.[0]?.userId===uid&&Number.isSafeInteger(ratings[0].power)&&ratings[0].power>0&&await validate(q,ratings,{now:at,requireCurrentSource:false}),'RATING_INVALID','전력 정보를 다시 확인해 주세요.');
    window.members??={};window.members[uid]={organizationId:club,power:ratings[0].power,joinedAt:at};
   }else if(action==='select'){
    checkCandidates(window,body,at);
    const accounts=await q('SELECT id,status,banned_until FROM users WHERE id=ANY($1::bigint[]) FOR SHARE',[body.userIds]);
    orgAssert(accounts.length===body.userIds.length&&accounts.every(a=>activeAccount(a,at)),'ACCOUNT','활성 계정을 선택하세요.');
    const validate=deps.validateOrganizationRatingsLocked||(await import('./_organization_ratings.js')).validateOrganizationRatingsLocked;
    orgAssert(!body.userIds.length||ratings?.length===body.userIds.length&&await validate(q,ratings,{now:at,requireCurrentSource:false}),'RATING_INVALID','원로의 전력 평가를 다시 불러오세요.');
    window.selections[body.organizationId]=body.userIds.map(id=>{
     const power=ratings.find(p=>p.userId===id)?.power;
     orgAssert(Number.isSafeInteger(power)&&power>0,'RATING_INVALID','원로의 전력을 확인할 수 없습니다.');
     return {id,power};
    });
   }else if(action==='start'){
    orgAssert(!window.calendar,'ELDER_PHASE','자율 가입 마감 시 시즌이 자동 개막합니다.');
    orgAssert(at>=window.closesAt&&window.revision===body.revision&&clubs.every(id=>window.selections[id]?.length===3),'ELDER_SELECTION','모집 마감 후 모든 클랜에 원로 3명을 선정하세요.');
    const result=await startVoluntarySeason(q,r,window,at);window.startedSeasonId=result.seasonId;window.nextRoundId=result.roundId;
   }
   window.revision++;
  }
  await writeValue(q,key(r),window,at);
  return {ok:true,windowId:window.id,revision:window.revision,closesAt:window.closesAt,seasonId:window.startedSeasonId,roundId:window.nextRoundId||r.id};
 },now);
}

export async function reconcileElderSeason(q,round,now){
 const window=await readWindow(q,round),calendar=window?.calendar;
 if(!calendar||window.startedSeasonId)return null;
 const drawn=await drawElders(q,round,window,now);
 if(now<calendar.startsAt)return {waiting:true,changed:drawn,status:clanCalendarPhase(calendar,now),nextCheckAt:iso(now<calendar.elderClosesAt?calendar.elderClosesAt:calendar.startsAt)};
 const {seasonId,roundId,registeredElders}=await startVoluntarySeason(q,round,window,now);
 window.startedSeasonId=seasonId;window.nextRoundId=roundId;window.revision++;
 await writeValue(q,key(round),window,now);
 // Keep all applications with the archived round and show the registered winners in the new round.
 await writeValue(q,key({id:roundId}),{...window,applications:{},selections:registeredElders,members:{}},now);
 return {waiting:true,changed:true,status:'STARTED',seasonId,roundId};
}

async function startVoluntarySeason(q,round,window,now){
 const [record]=await q('SELECT value FROM app_meta WHERE key=$1 FOR UPDATE',[CLAN_RESUMPTION_STATE_KEY]);
 const previous=record&&activeClanResumption(JSON.parse(record.value),now);
 orgAssert(previous?.roundId===round.id,'SEASON','진행 중인 클랜 회차가 바뀌었습니다.');
 const [last]=await q('SELECT id,phase,season_no FROM clan_seasons ORDER BY season_no DESC LIMIT 1 FOR UPDATE');
 orgAssert(Number(last?.id)===previous.seasonId&&last.phase==='COMPLETE','SEASON_ACTIVE','이전 시즌 챔피언스리그 종료 후 새 시즌을 시작하세요.');
 const [old]=await q('SELECT state_json FROM organization_faction_state_v1 WHERE round_id=$1 FOR UPDATE',[round.id]);
 const state=JSON.parse(old.state_json);
 orgAssert(!['ACTIVE','PAUSED'].includes(state.session?.status)&&!state.sessionQueue?.length&&!state.battles.some(b=>b.status==='ACTIVE'),'FACTION_ACTIVE','진행 중인 세력전 정산 후 시즌을 시작하세요.');
 const candidates=clubs.flatMap(club=>signupRoster(window,club).map(p=>({...p,club})));
 const accounts=await q('SELECT id,status,banned_until FROM users WHERE id=ANY($1::bigint[]) ORDER BY id FOR SHARE',[candidates.map(p=>p.id)]);
 const active=new Set(accounts.filter(a=>activeAccount(a,now)).map(a=>Number(a.id)));
 const calendar=window.calendar,startsAt=calendar?.startsAt??now,ends=calendar?.endsAt??now+seasonDays*day;
 if(!calendar)orgAssert(active.size===candidates.length,'ACCOUNT','비활성 원로가 있습니다. 지원 명단에서 다시 선정하세요.');
 const rows=clubs.flatMap(club=>candidates.filter(p=>p.club===club&&active.has(p.id)).map((p,i)=>({uid:p.id,club,slot:i+1,power:p.power,elder:p.elder})));
 const number=Number(last.season_no)+1,roundId=crypto.randomUUID();
 if(calendar)orgAssert(number===calendar.seasonNo&&calendar.sourceRoundId===round.id&&calendar.previousSeasonId===previous.seasonId,'SEASON','개막 대상 시즌을 확인하세요.');
 const [season]=await q("INSERT INTO clan_seasons(season_no,phase,max_members,registration_ends_at,draft_ends_at,starts_at,ends_at) VALUES($1,'ACTIVE',25,$2,$2,$2,$3) RETURNING id",[number,iso(startsAt),iso(ends)]);
 const seasonId=Number(season.id),release={...previous,roundId,seasonId,seasonDays};
 delete release.nextSeasonCalendar;delete release.competitionCalendar;
 if(calendar)release.competitionCalendar=calendar;
 await q("UPDATE organization_rounds_v1 SET scope='ARCHIVED:'||id,auto_assign=0,revision=revision+1 WHERE id=$1",[round.id]);
 await q("INSERT INTO organization_rounds_v1(id,scope,name,phase,created_at,assigned_at,auto_assign,assignment_status) VALUES($1,'LIVE',$2,'ASSIGNED',$3,$3,0,'APPLIED')",[roundId,'클랜 정규시즌 '+number,startsAt]);
 const people=JSON.stringify(rows),recordset=' FROM jsonb_to_recordset($2::jsonb) AS p(uid bigint,club integer,slot integer,power bigint,elder boolean)';
 await q('INSERT INTO organization_members_v1(round_id,user_id,organization_id,slot,seed_power,joined_at) SELECT $1,uid,club,slot,power,$3'+recordset,[roundId,people,startsAt]);
 await q('INSERT INTO clan_season_teams(season_id,clan_id,master_user_id,draft_position) SELECT $1,c.id,p.uid,c.id-1 FROM unnest($3::integer[]) c(id) LEFT JOIN (SELECT club,uid'+recordset+' WHERE elder AND slot=1) p ON p.club=c.id',[seasonId,people,clubs]);
 await q("INSERT INTO clan_members(season_id,clan_id,user_id,member_role,draft_pick_no) SELECT $1,club,uid,CASE WHEN elder AND slot=1 THEN 'MASTER' ELSE 'MEMBER' END,slot"+recordset,[seasonId,people]);
 await q('INSERT INTO clan_executives(season_id,clan_id,user_id,power,position,checked_ms) SELECT $1,club,uid,power,slot,$3'+recordset+' WHERE elder',[seasonId,people,startsAt]);
 await q('INSERT INTO organization_progress_v1(round_id,organization_id,points,stage) SELECT $1,organization_id,points,stage FROM organization_progress_v1 WHERE round_id=$2',[roundId,round.id]);
 await q('INSERT INTO organization_faction_treasury_v1(round_id,organization_id,balance,total_earned) SELECT $1,organization_id,balance,total_earned FROM organization_faction_treasury_v1 WHERE round_id=$2',[roundId,round.id]);
 const next=newOrganizationFactionState(now);
 next.resumption=release;next.elders=Object.fromEntries(clubs.map(id=>[id,rows.filter(p=>p.club===id&&p.elder).map(p=>p.uid)]));
 next.commanders=Object.fromEntries(clubs.map(id=>[id,next.elders[id][0]]));
 next.districts=state.districts.map(d=>({...d,defense:''}));
 if(!calendar)for(const field of ['session','sessionDay','sessionPlan','scheduleVersion'])if(state[field]!=null)next[field]=state[field];
 const dayKey=new Date(startsAt+9*3600000).toISOString().slice(0,10);
 await q('INSERT INTO organization_faction_days_v1(round_id,day_key,schedule_json) SELECT $1,day_key,schedule_json FROM organization_faction_days_v1 WHERE round_id=$2 AND day_key>=$3',[roundId,round.id,dayKey]);
 await q('INSERT INTO organization_faction_state_v1(round_id,state_json) VALUES($1,$2)',[roundId,JSON.stringify(next)]);
 const {roundRobinRounds,scheduledWindowStarts}=await import('./_clan.js');
 const cycle=roundRobinRounds(clubs),settings=resumedClanSettings({},release),starts=scheduledWindowStarts(settings,startsAt,seasonDays);
 const regularEnd=calendar?clanPlayoffTimes(calendar).regularEndsAt:ends;
 const wars=starts.filter(start=>start>=startsAt&&start+3600000<=regularEnd).flatMap((start,i)=>cycle[i%cycle.length].map(pair=>({a:pair.clanAId,b:pair.clanBId,n:i+1,start:iso(start),finish:iso(start+3600000)})));
 await q("INSERT INTO clan_wars(season_id,round_no,clan_a_id,clan_b_id,status,starts_at,ends_at) SELECT $1,n,a,b,'SCHEDULED',w.start,w.finish FROM jsonb_to_recordset($2::jsonb) AS w(n integer,a integer,b integer,start text,finish text)",[seasonId,JSON.stringify(wars)]);
 await writeValue(q,CLAN_RESUMPTION_STATE_KEY,release,now);
 const registeredElders=Object.fromEntries(clubs.map(club=>[club,(window.selections[club]||[]).filter(p=>active.has(p.id))]));
 return {seasonId,roundId,registeredElders};
}
