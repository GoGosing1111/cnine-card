import {ORGANIZATIONS,orgAssert,orgInteger} from '../shared/organization-system-v1.mjs';
import {activeClanResumption,CLAN_RESUMPTION_STATE_KEY,resumedClanSettings} from '../shared/clan-resumption-v1.mjs';
import {newOrganizationFactionState} from './_organization_faction_model.js';

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
export async function elderSeasonView(q,r,user,now,admin=false){
 const window=await readWindow(q,r);
 if(!window)return {phase:'CLOSED',windowId:null,revision:0,seasonDays,elderCount:3};
 const phase=window.startedSeasonId?'STARTED':now<window.closesAt?'OPEN':'SELECTION';
 const view={phase,windowId:window.id,revision:window.revision,openedAt:window.openedAt,closesAt:window.closesAt,seasonDays,elderCount:3,
  organizationId:window.applications[user.id]?.organizationId||null,selected:Object.values(window.selections).some(s=>s.some(p=>p.id===Number(user.id)))};
 if(admin){
  view.applicants=Object.entries(window.applications).map(([id,a])=>({id:Number(id),...a}));
  view.selections=Object.fromEntries(Object.entries(window.selections).map(([id,people])=>[id,people.map(p=>p.id)]));
  view.ready=clubs.every(id=>window.selections[id]?.length===3);
 }
 return view;
}
function checkCandidates(window,body,now){
 orgAssert(window&&window.id===body.windowId&&window.closesAt<=now&&!window.startedSeasonId,'ELDER_PHASE','원로 모집 마감 후 선정할 수 있습니다.');
 orgAssert(body.revision===window.revision,'STALE','다른 운영 작업이 반영되었습니다. 명단을 다시 불러오세요.');
 const id=orgInteger(body.organizationId,1,clubs.length,'희망 클랜'),ids=body.userIds;
 orgAssert(Array.isArray(ids)&&ids.length===3&&new Set(ids).size===3&&ids.every(uid=>Number.isSafeInteger(uid)&&window.applications[uid]?.organizationId===id),'ELDER_SELECTION','이 클랜에 지원한 서로 다른 원로 3명을 선택하세요.');
}
export async function elderSeasonCommand(env,user,path,body,deps,now,{mutation,lockedContext,qFor}){
 const action=path.split('/').at(-1),operator=path.startsWith('admin/');
 let ratings;
 if(action==='select'){
  const load=await env.DB.enqueue(async()=>{
   const q=qFor(env.DB),[receipt]=await q('SELECT request_id FROM organization_receipts_v1 WHERE actor_id=$1 AND request_id=$2',[user.id,body.requestId]);
   if(receipt)return false;
   const [r]=await q('SELECT * FROM organization_rounds_v1 WHERE id=$1',[body.roundId]);
   orgAssert(seasonAdmissionEnabled(r,now)&&user.role==='OWNER','PERMISSION','운영자만 원로를 선정할 수 있습니다.',403);
   checkCandidates(await readWindow(q,r),body,now);return true;
  });
  if(load)ratings=await (deps.loadOrganizationRatings||(await import('./_organization_ratings.js')).loadOrganizationRatings)(env,body.userIds,deps,{now});
 }
 return mutation(env,user,path,body,async q=>{
  const {r}=await lockedContext(q,user,body),at=(deps.now||Date.now)();
  orgAssert(seasonAdmissionEnabled(r,at)&&r.phase==='ASSIGNED','ELDER_ROUND','운영 중인 클랜 시즌에서 이용하세요.');
  const [actor]=await q('SELECT nickname,role,status,banned_until FROM users WHERE id=$1 FOR SHARE',[user.id]);
  orgAssert(activeAccount(actor,at)&&(!operator||actor.role==='OWNER'),'PERMISSION','이 요청을 처리할 권한이 없습니다.',403);
  let window=await readWindow(q,r);
  orgAssert((window?.id||null)===body.windowId&&!window?.startedSeasonId,'STALE','모집 일정이 바뀌었습니다. 다시 불러오세요.');
  if(action==='open'){
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
     const id=orgInteger(body.organizationId,1,clubs.length,'희망 클랜');
     orgAssert(!previous,'PENDING','기존 지원을 취소한 후 원하는 클랜에 지원하세요.');
     window.applications[user.id]={organizationId:id,nickname:actor.nickname,appliedAt:at};
    }else{orgAssert(previous,'ELDER_APPLICATION','접수된 지원서가 없습니다.');delete window.applications[user.id];}
   }else if(action==='select'){
    checkCandidates(window,body,at);
    const accounts=await q('SELECT id,status,banned_until FROM users WHERE id=ANY($1::bigint[]) FOR SHARE',[body.userIds]);
    orgAssert(accounts.length===3&&accounts.every(a=>activeAccount(a,at)),'ACCOUNT','활성 계정 3명을 선택하세요.');
    const validate=deps.validateOrganizationRatingsLocked||(await import('./_organization_ratings.js')).validateOrganizationRatingsLocked;
    orgAssert(ratings?.length===3&&await validate(q,ratings,{now:at,requireCurrentSource:false}),'RATING_INVALID','원로의 전력 평가를 다시 불러오세요.');
    window.selections[body.organizationId]=body.userIds.map(id=>{
     const power=ratings.find(p=>p.userId===id)?.power;
     orgAssert(Number.isSafeInteger(power)&&power>0,'RATING_INVALID','원로의 전력을 확인할 수 없습니다.');
     return {id,power};
    });
   }else if(action==='start'){
    orgAssert(at>=window.closesAt&&window.revision===body.revision&&clubs.every(id=>window.selections[id]?.length===3),'ELDER_SELECTION','모집 마감 후 모든 클랜에 원로 3명을 선정하세요.');
    const result=await startVoluntarySeason(q,r,window,at);window.startedSeasonId=result.seasonId;window.nextRoundId=result.roundId;
   }
   window.revision++;
  }
  await writeValue(q,key(r),window,at);
  return {ok:true,windowId:window.id,revision:window.revision,closesAt:window.closesAt,seasonId:window.startedSeasonId,roundId:window.nextRoundId||r.id};
 },now);
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
 const rows=clubs.flatMap(id=>window.selections[id].map((p,i)=>({uid:p.id,club:id,slot:i+1,power:p.power})));
 const accounts=await q('SELECT id,status,banned_until FROM users WHERE id=ANY($1::bigint[]) FOR SHARE',[rows.map(p=>p.uid)]);
 orgAssert(accounts.length===rows.length&&accounts.every(a=>activeAccount(a,now)),'ACCOUNT','비활성 원로가 있습니다. 지원 명단에서 다시 선정하세요.');
 const ends=now+seasonDays*day,number=Number(last.season_no)+1,roundId=crypto.randomUUID();
 const [season]=await q("INSERT INTO clan_seasons(season_no,phase,max_members,registration_ends_at,draft_ends_at,starts_at,ends_at) VALUES($1,'ACTIVE',25,$2,$2,$2,$3) RETURNING id",[number,iso(now),iso(ends)]);
 const seasonId=Number(season.id),release={...previous,roundId,seasonId,seasonDays};
 await q("UPDATE organization_rounds_v1 SET scope='ARCHIVED:'||id,auto_assign=0,revision=revision+1 WHERE id=$1",[round.id]);
 await q("INSERT INTO organization_rounds_v1(id,scope,name,phase,created_at,assigned_at,auto_assign,assignment_status) VALUES($1,'LIVE',$2,'ASSIGNED',$3,$3,0,'APPLIED')",[roundId,'클랜 정규시즌 '+number,now]);
 const people=JSON.stringify(rows),recordset=' FROM jsonb_to_recordset($2::jsonb) AS p(uid bigint,club integer,slot integer,power bigint)';
 await q('INSERT INTO organization_members_v1(round_id,user_id,organization_id,slot,seed_power,joined_at) SELECT $1,uid,club,slot,power,$3'+recordset,[roundId,people,now]);
 await q('INSERT INTO clan_season_teams(season_id,clan_id,master_user_id,draft_position) SELECT $1,club,uid,club-1'+recordset+' WHERE slot=1',[seasonId,people]);
 await q("INSERT INTO clan_members(season_id,clan_id,user_id,member_role,draft_pick_no) SELECT $1,club,uid,CASE WHEN slot=1 THEN 'MASTER' ELSE 'MEMBER' END,slot"+recordset,[seasonId,people]);
 await q('INSERT INTO clan_executives(season_id,clan_id,user_id,power,position,checked_ms) SELECT $1,club,uid,power,slot,$3'+recordset,[seasonId,people,now]);
 await q('INSERT INTO organization_progress_v1(round_id,organization_id,points,stage) SELECT $1,organization_id,points,stage FROM organization_progress_v1 WHERE round_id=$2',[roundId,round.id]);
 await q('INSERT INTO organization_faction_treasury_v1(round_id,organization_id,balance,total_earned) SELECT $1,organization_id,balance,total_earned FROM organization_faction_treasury_v1 WHERE round_id=$2',[roundId,round.id]);
 const next=newOrganizationFactionState(now);
 next.resumption=release;next.elders=Object.fromEntries(clubs.map(id=>[id,window.selections[id].map(p=>p.id)]));
 next.commanders=Object.fromEntries(clubs.map(id=>[id,next.elders[id][0]]));
 next.districts=state.districts.map(d=>({...d,defense:''}));
 for(const field of ['session','sessionDay','sessionPlan','scheduleVersion'])if(state[field]!=null)next[field]=state[field];
 const dayKey=new Date(now+9*3600000).toISOString().slice(0,10);
 await q('INSERT INTO organization_faction_days_v1(round_id,day_key,schedule_json) SELECT $1,day_key,schedule_json FROM organization_faction_days_v1 WHERE round_id=$2 AND day_key>=$3',[roundId,round.id,dayKey]);
 await q('INSERT INTO organization_faction_state_v1(round_id,state_json) VALUES($1,$2)',[roundId,JSON.stringify(next)]);
 const {roundRobinRounds,scheduledWindowStarts}=await import('./_clan.js');
 const cycle=roundRobinRounds(clubs),settings=resumedClanSettings({},release),starts=scheduledWindowStarts(settings,now,seasonDays);
 const wars=starts.filter(start=>start+3600000<=ends).flatMap((start,i)=>cycle[i%cycle.length].map(pair=>({a:pair.clanAId,b:pair.clanBId,n:i+1,start:iso(start),finish:iso(start+3600000)})));
 await q("INSERT INTO clan_wars(season_id,round_no,clan_a_id,clan_b_id,status,starts_at,ends_at) SELECT $1,n,a,b,'SCHEDULED',w.start,w.finish FROM jsonb_to_recordset($2::jsonb) AS w(n integer,a integer,b integer,start text,finish text)",[seasonId,JSON.stringify(wars)]);
 await writeValue(q,CLAN_RESUMPTION_STATE_KEY,release,now);
 return {seasonId,roundId};
}
