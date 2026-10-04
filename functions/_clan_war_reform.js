import {clanAdminTransaction} from './_clan_inactivity_cleanup.js';
import {ensureClanReform,executiveRows,refreshClanExecutives} from './_clan_governance.js';
import {WAR_DAYS,CLAN_SKILLS,READY_WINDOW_MS,weekOf,weekDates,readyOpen,utcMs,newField,fieldTeam,supportEnergy,applyFieldAction} from '../shared/clan-war-reform-v1.mjs';

const check=(ok,message,status=409)=>{if(!ok)throw Object.assign(new Error(message),{status});};
const pack=JSON.stringify;
const rows=r=>r?.results||[];
async function member(env,seasonId,userId){return env.DB.prepare('SELECT m.*,o.mark_key FROM clan_members m JOIN clan_organizations o ON o.id=m.clan_id WHERE m.season_id=? AND m.user_id=?').bind(seasonId,userId).first();}
async function nextWar(env,seasonId,clanId){return env.DB.prepare("SELECT * FROM clan_wars WHERE season_id=? AND (clan_a_id=? OR clan_b_id=?) AND status IN ('ACTIVE','SCHEDULED') ORDER BY starts_at,id LIMIT 1").bind(seasonId,clanId,clanId).first();}

export async function clanReformState(env,user,season,now=Date.now()){
  await ensureClanReform(env);const mine=await member(env,season.id,user.id);
  if(!mine)return {enabled:true,weekStart:weekOf(now),days:weekDates(now),membership:false};
  const clanId=Number(mine.clan_id),war=await nextWar(env,season.id,clanId);
  const [availability,roster,executives]=await Promise.all([
    env.DB.prepare('SELECT user_id,days_json FROM clan_weekly_availability WHERE season_id=? AND clan_id=? AND week_start=?').bind(season.id,clanId,weekOf(now)).all(),
    env.DB.prepare('SELECT m.user_id,u.nickname FROM clan_members m JOIN users u ON u.id=m.user_id WHERE m.season_id=? AND m.clan_id=? ORDER BY u.nickname').bind(season.id,clanId).all(),
    executiveRows(env,season.id,clanId)
  ]);
  const available=new Map(rows(availability).map(r=>[Number(r.user_id),JSON.parse(r.days_json)]));
  const ready=war?rows(await env.DB.prepare('SELECT user_id,status FROM clan_war_readiness WHERE war_id=? AND clan_id=?').bind(war.id,clanId).all()):[];
  const readyById=new Map(ready.map(r=>[Number(r.user_id),r.status]));
  const people=rows(roster).map(r=>({userId:Number(r.user_id),nickname:r.nickname,days:available.get(Number(r.user_id))||[],submitted:available.has(Number(r.user_id)),ready:readyById.get(Number(r.user_id))||'UNANSWERED'}));
  let field=null;
  if(war){const row=await env.DB.prepare('SELECT state_json FROM clan_war_field_state WHERE war_id=?').bind(war.id).first();field=row?JSON.parse(row.state_json):newField();
    const own=fieldTeam(field,clanId),enemyId=Number(war.clan_a_id)===clanId?Number(war.clan_b_id):Number(war.clan_a_id);fieldTeam(field,enemyId);
    if(!people.some(p=>p.userId===own.commander))own.commander=0;
    const ownPlayer=field.users[user.id]||{used:0,points:0,lastAt:0};
    // Do not expose other users' per-user action clocks or request information.
    field={teams:field.teams,events:field.events,my:ownPlayer,energy:supportEnergy(war,ownPlayer.used,now),skill:CLAN_SKILLS[mine.mark_key],canCommand:own.commander?own.commander===Number(user.id):executives.some(e=>e.userId===Number(user.id))};
  }
  return {enabled:true,membership:true,weekStart:weekOf(now),days:weekDates(now),myDays:available.get(Number(user.id))||[],submitted:available.has(Number(user.id)),executives,roster:people,field,
    war:war?{id:Number(war.id),status:war.status,clanAId:Number(war.clan_a_id),clanBId:Number(war.clan_b_id),scoreA:Number(war.score_a),scoreB:Number(war.score_b),startsAt:war.starts_at,endsAt:war.ends_at,readyAt:new Date(utcMs(war.starts_at)-READY_WINDOW_MS).toISOString(),readyOpen:readyOpen(war,now),myReady:readyById.get(Number(user.id))||'UNANSWERED'}:null,serverNow:new Date(now).toISOString()};
}
export async function clanReadyAlert(env,user,season,now=Date.now()){
  await ensureClanReform(env);const mine=await member(env,season.id,user.id);if(!mine)return {ok:true,alert:null};
  const war=await nextWar(env,season.id,mine.clan_id);if(!readyOpen(war,now))return {ok:true,alert:null};
  const ready=await env.DB.prepare('SELECT status FROM clan_war_readiness WHERE war_id=? AND user_id=? AND clan_id=?').bind(war.id,user.id,mine.clan_id).first();
  return {ok:true,alert:ready?null:{userId:Number(user.id),warId:Number(war.id),startsAt:war.starts_at,endsAt:war.ends_at,serverNow:new Date(now).toISOString()}};
}
export async function saveWeeklyAvailability(env,user,season,body,now=Date.now()){
  await ensureClanReform(env);check(body.weekStart===weekOf(now),'주간 일정이 바뀌었습니다. 새로고침 후 다시 선택하세요.');
  check(Array.isArray(body.days)&&body.days.length<=4&&body.days.every(day=>Number.isInteger(day)&&WAR_DAYS.includes(day)),'화·목·토·일 중 참여 가능한 날을 선택하세요.',400);
  const days=[...new Set(body.days)].sort();
  return clanAdminTransaction(env.DB,async q=>{
    const [m]=await q('SELECT clan_id FROM clan_members WHERE season_id=$1 AND user_id=$2 FOR UPDATE',[season.id,user.id]);check(m,'클랜 가입 후 신청할 수 있습니다.',403);
    await q(`INSERT INTO clan_weekly_availability(season_id,clan_id,user_id,week_start,days_json,updated_ms) VALUES($1,$2,$3,$4,$5,$6) ON CONFLICT(season_id,user_id,week_start) DO UPDATE SET clan_id=excluded.clan_id,days_json=excluded.days_json,updated_ms=excluded.updated_ms`,[season.id,m.clan_id,user.id,weekOf(now),pack(days),now]);
    return {ok:true,days};
  });
}
export async function saveWarReadiness(env,user,season,body,now){
  await ensureClanReform(env);check(Number.isSafeInteger(body.warId)&&body.warId>0&&['READY','ABSENT'].includes(body.status),'참여 상태를 다시 선택하세요.',400);
  return clanAdminTransaction(env.DB,async q=>{
    const [war]=await q('SELECT * FROM clan_wars WHERE id=$1 AND season_id=$2 FOR UPDATE',[body.warId,season.id]);now??=Date.now();check(readyOpen(war,now),'레디 확인은 시작 15분 전부터 시작 직전까지 가능합니다.');
    const [m]=await q('SELECT clan_id FROM clan_members WHERE season_id=$1 AND user_id=$2 FOR UPDATE',[season.id,user.id]);check(m&&[Number(war.clan_a_id),Number(war.clan_b_id)].includes(Number(m.clan_id)),'해당 경기의 클랜원만 응답할 수 있습니다.',403);
    await q(`INSERT INTO clan_war_readiness(war_id,user_id,clan_id,status,updated_ms) VALUES($1,$2,$3,$4,$5) ON CONFLICT(war_id,user_id) DO UPDATE SET clan_id=excluded.clan_id,status=excluded.status,updated_ms=excluded.updated_ms`,[war.id,user.id,m.clan_id,body.status,now]);
    return {ok:true,status:body.status};
  });
}
export async function clanFieldAction(env,user,season,body,now){
  await ensureClanReform(env);
  check(Number.isSafeInteger(body.warId)&&body.warId>0&&typeof body.requestId==='string'&&/^[A-Za-z0-9:_-]{16,100}$/.test(body.requestId),'요청 정보가 잘못되었습니다.',400);
  check(['assault','disrupt','support','skill','commander'].includes(body.kind),'클랜 임무를 다시 선택하세요.',400);
  const key=`${user.id}:${body.requestId}`,input=pack({warId:body.warId,kind:body.kind,targetUserId:Number(body.targetUserId)||0});
  return clanAdminTransaction(env.DB,async q=>{
    // War-row serialization also excludes closing/settlement and other field actions.
    const [war]=await q('SELECT * FROM clan_wars WHERE id=$1 AND season_id=$2 FOR UPDATE',[body.warId,season.id]);check(war,'해당 클랜전을 찾을 수 없습니다.');now??=Date.now();
    const [m]=await q('SELECT m.*,o.mark_key FROM clan_members m JOIN clan_organizations o ON o.id=m.clan_id WHERE m.season_id=$1 AND m.user_id=$2 FOR UPDATE OF m',[season.id,user.id]);check(m,'클랜 소속을 확인하세요.',403);
    check([Number(war.clan_a_id),Number(war.clan_b_id)].includes(Number(m.clan_id)),'이 경기에 참여하는 클랜이 아닙니다.',403);
    if(Number(war.round_no)>=1001){const eligible=await q('SELECT 1 FROM clan_championship_members WHERE season_id=$1 AND user_id=$2 AND clan_id=$3',[season.id,user.id,m.clan_id]);check(eligible.length,'확정된 대회 참가 명단에 없습니다.',403);}
    const [prior]=await q('SELECT input_json,result_json FROM clan_war_field_receipts WHERE request_key=$1',[key]);
    if(prior){check(prior.input_json===input,'같은 요청 번호로 다른 활동을 실행할 수 없습니다.');return {...JSON.parse(prior.result_json),replayed:true};}
    const [row]=await q('SELECT state_json FROM clan_war_field_state WHERE war_id=$1',[war.id]);const state=row?JSON.parse(row.state_json):newField();
    const members=await q('SELECT user_id FROM clan_members WHERE season_id=$1 AND clan_id=$2',[season.id,m.clan_id]);
    const executive=(await q('SELECT 1 FROM clan_executives WHERE season_id=$1 AND clan_id=$2 AND user_id=$3',[season.id,m.clan_id,user.id])).length>0;
    const result=applyFieldAction(state,{war,userId:Number(user.id),clanId:Number(m.clan_id),markKey:m.mark_key,kind:body.kind,now,executive,targetUserId:Number(body.targetUserId)||0,memberIds:members.map(r=>Number(r.user_id))});
    await q(`INSERT INTO clan_war_field_state(war_id,state_json,updated_ms) VALUES($1,$2,$3) ON CONFLICT(war_id) DO UPDATE SET state_json=excluded.state_json,updated_ms=excluded.updated_ms`,[war.id,pack(state),now]);
    if(result.points){
      await q('UPDATE clan_wars SET score_a=score_a+CASE WHEN clan_a_id=$1 THEN $2 ELSE 0 END,score_b=score_b+CASE WHEN clan_b_id=$1 THEN $2 ELSE 0 END,updated_at=sqlite_now() WHERE id=$3',[m.clan_id,result.points,war.id]);
      for(const credit of result.contributions)await q('UPDATE clan_members SET contribution_score=contribution_score+$1,updated_at=sqlite_now() WHERE season_id=$2 AND clan_id=$3 AND user_id=$4',[credit.points,season.id,m.clan_id,credit.userId]);
    }
    const response={ok:true,...result,warId:Number(war.id)};
    await q('INSERT INTO clan_war_field_receipts(request_key,user_id,war_id,input_json,result_json,created_ms) VALUES($1,$2,$3,$4,$5,$6)',[key,user.id,war.id,input,pack(response),now]);
    return response;
  });
}
export async function handleClanReform({path,request,env,user,season,deps}){
  try{
    if(path==='clan/war/ready-alert'&&request.method==='GET')return deps.json(await clanReadyAlert(env,user,season),200,{'cache-control':'no-store'});
    if(path==='clan/war/planning'&&request.method==='GET')return deps.json({ok:true,...await clanReformState(env,user,season)},200,{'cache-control':'no-store'});
    const actions={'clan/war/availability':saveWeeklyAvailability,'clan/war/ready':saveWarReadiness,'clan/war/field':clanFieldAction};
    if(actions[path]&&request.method==='POST'){
      const body=await deps.readBody(request);
      // Readiness and regular missions do not need a full clan power scan.
      // Recheck the ranking immediately before any commander authority is used.
      if(path==='clan/war/field'&&['commander','skill'].includes(body.kind)){
        const mine=await member(env,season.id,user.id);
        if(mine)await refreshClanExecutives(env,deps,season.id,Number(mine.clan_id),{force:true});
      }
      return deps.json(await actions[path](env,user,season,body),200,{'cache-control':'no-store'});
    }
    return deps.json({error:'지원하지 않는 클랜전 요청입니다.'},405);
  }catch(error){return deps.json({error:error.status?error.message:'클랜전 요청을 처리하지 못했습니다. 같은 요청으로 다시 시도하세요.'},error.status||503);}
}
