import {DUO_DEFAULTS,DUO_LIMITS,DUO_VERSION,duoError,duoEnergy,validateDuoConfig,pairDuoParticipants} from '../shared/ranked-duo-v1.mjs';
import {DUO_CURRENT_KEY,prepareDuoSchema} from './_ranked_duo_schema.js';
import {loadDuoProfiles} from './_ranked_duo_profiles.js';
import {createDuoBattleV2} from './_battle_v2_preview.js';
import {jointGuard,jointGuardEnd} from './_joint_atomic.js';
import {jointRequestId} from './_joint_transactions.js';
import {DUO_RECRUIT_HOURS,DUO_CHALLENGER,duoTiers,resolveDuoTier,duoUtcMs} from '../shared/ranked-duo-season-v2.mjs';
import {DUO_WEEKLY_POLICY_KEY,DUO_BATTLE_DAYS,validateDuoPolicy} from '../shared/ranked-duo-weekly-v3.mjs';
import {readDuoPolicy,duoVictoryWrites,DUO_WEEKLY_SCHEMA_KEY} from './_ranked_duo_economy.js';

const iso=now=>new Date(now).toISOString();
const statement=env=>(sql,...args)=>env.DB.prepare(sql).bind(...args);
const guard=(env,predicate,args,body)=>{const token=crypto.randomUUID();return [jointGuard(env.DB,token,predicate,args),...body,jointGuardEnd(env.DB,token)];};
const lock=(env,sql,...args)=>env.DB.dialect==='postgres'?[statement(env)(sql,...args)]:[];
const seasonGuard=(env,s,body)=>guard(env,'EXISTS(SELECT 1 FROM ranked_duo_seasons_v1 WHERE id=? AND revision=? AND status=?)',[s.id,s.revision,s.status],body);
const seasonWrite=(env,s,body)=>[...lock(env,'SELECT id FROM ranked_duo_seasons_v1 WHERE id=? FOR UPDATE',s.id),...seasonGuard(env,s,body)];
const fields='id,status,revision,participant_count,config_json,recruit_until,pair_cursor,pair_policy_revision,created_at';
async function currentSeason(env){const row=await statement(env)('SELECT value FROM app_meta WHERE key=?',DUO_CURRENT_KEY).first();if(!row)return null;const s=await statement(env)(`SELECT ${fields} FROM ranked_duo_seasons_v1 WHERE id=?`,row.value).first();return s?{...s,revision:Number(s.revision),config:validateDuoConfig(JSON.parse(s.config_json))}:null;}
const publicSeason=s=>s?{id:s.id,status:s.status,name:s.config.name,visible:s.config.visible,revision:s.revision,recruitUntil:s.recruit_until,startsAt:s.config.startsAt,endsAt:s.config.endsAt,energy:s.config.energy,score:s.config.score,automatic:s.config.automatic===true,rankedSeason:s.config.rankedSeason||null,weekly:s.config.weekly||null,rewards:s.config.rewards||null,...duoTiers(s.config),version:DUO_VERSION}:null;
const requireSeason=s=>{if(!s)throw duoError('NOT_CONFIGURED','듀오 시즌을 준비 중입니다.',404);return s;};
function active(s,now){requireSeason(s);if(s.status!=='ACTIVE'||!s.config.visible||!s.config.startsAt||now<Date.parse(s.config.startsAt)||!s.config.endsAt||now>=Date.parse(s.config.endsAt))throw duoError('NOT_ACTIVE','현재 듀오 대전 기간이 아닙니다.');}
function recruiting(s,now){requireSeason(s);if(s.status!=='RECRUITING'||!s.config.visible||now>=Date.parse(s.recruit_until))throw duoError('RECRUIT_CLOSED','현재 참가 모집 기간이 아닙니다.');}
const entry=(env,s,userId)=>statement(env)('SELECT * FROM ranked_duo_entries_v1 WHERE season_id=? AND user_id=?',s.id,userId).first();
const team=(env,id)=>statement(env)('SELECT t.*,a.nickname AS name_a,b.nickname AS name_b FROM ranked_duo_teams_v1 t JOIN users a ON a.id=t.user_a JOIN users b ON b.id=t.user_b WHERE t.id=?',id).first();
const publicTeam=(t,config={},rank=0)=>t?{id:t.id,members:[{userId:Number(t.user_a),nickname:t.name_a},{userId:Number(t.user_b),nickname:t.name_b}],score:Number(t.score),wins:Number(t.wins),losses:Number(t.losses),seedPower:Number(t.seed_power),rank:rank||null,tier:resolveDuoTier(Number(t.score),config,rank)}:null;
const audit=(env,user,action,s,data)=>user.role==='SYSTEM'?statement(env)('INSERT INTO app_meta(key,value,updated_at) VALUES(?,?,CURRENT_TIMESTAMP) ON CONFLICT(key) DO UPDATE SET value=excluded.value,updated_at=CURRENT_TIMESTAMP','ranked_duo_lifecycle_event_v2',JSON.stringify({action,seasonId:s?.id,...data})):statement(env)('INSERT INTO admin_logs(admin_id,action_type,target_type,target_id,before_data,after_data) VALUES(?,?,?,?,?,?)',user.id,action,'RANKED_DUO',s?.id||'',s?JSON.stringify(publicSeason(s)):null,JSON.stringify(data));

async function standings(env,s,limit=DUO_CHALLENGER.rankLimit,now=Date.now()){
 const p=statement(env);
 if(s.status==='CLOSED'&&s.config.automatic)return (await p('SELECT r.*,t.seed_power FROM ranked_duo_final_v2 r JOIN ranked_duo_teams_v1 t ON t.id=r.id WHERE r.season_id=? ORDER BY r.final_rank LIMIT ?',s.id,limit).all()).results;
 if(!['ACTIVE','SETTLING','CLOSED'].includes(s.status))return [];
 return (await p("SELECT t.*,a.nickname AS name_a,b.nickname AS name_b FROM ranked_duo_teams_v1 t JOIN users a ON a.id=t.user_a JOIN users b ON b.id=t.user_b WHERE t.season_id=? AND a.status='ACTIVE' AND b.status='ACTIVE' AND a.role NOT IN('OWNER','ADMIN') AND b.role NOT IN('OWNER','ADMIN') AND (a.banned_until IS NULL OR SUBSTR(REPLACE(a.banned_until,'T',' '),1,19)<=?) AND (b.banned_until IS NULL OR SUBSTR(REPLACE(b.banned_until,'T',' '),1,19)<=?) ORDER BY t.score DESC,t.id DESC LIMIT ?",s.id,iso(now).replace('T',' ').slice(0,19),iso(now).replace('T',' ').slice(0,19),limit).all()).results;
}
async function rankedTeam(env,s,t,now){const leaders=await standings(env,s,DUO_CHALLENGER.rankLimit,now);return publicTeam(t,s.config,leaders.findIndex(row=>row.id===t.id)+1);}

export async function duoStatus(env,user,s,now){
 if(!s||!s.config.visible&&user.role!=='OWNER')return {season:null,notice:'듀오 시즌을 준비 중입니다.'};
 const [mine,pending,leaders]=await Promise.all([entry(env,s,user.id),statement(env)("SELECT id FROM ranked_duo_matches_v1 WHERE user_id=? AND status='PENDING'",user.id).first(),standings(env,s,DUO_CHALLENGER.rankLimit,now)]);
 const ownTeam=mine?.team_id&&!['PAIRING','PUBLISHING'].includes(s.status)?await team(env,mine.team_id):null;
 return {season:publicSeason(s),participants:Number(s.participant_count),pendingMatchId:pending?.id||null,joined:Boolean(mine),waiting:Boolean(mine&&!ownTeam),team:publicTeam(ownTeam,s.config,leaders.findIndex(t=>t.id===ownTeam?.id)+1),energy:mine?duoEnergy(mine,s.config,now):null,seed:mine?.seed_json?JSON.parse(mine.seed_json):null,wallet:{userId:Number(user.id),coin:Number(user.coin),cardShards:Number(user.card_shards)},serverNow:iso(now)};
}
async function join(env,user,s,deps,now){
 recruiting(s,now);if(['OWNER','ADMIN'].includes(user.role))throw duoError('ROLE','운영 계정은 시즌 참가 대상이 아닙니다.',403);
 if(await entry(env,s,user.id))return duoStatus(env,user,s,now);
 const p=statement(env);await p('INSERT INTO ranked_duo_accounts_v1(user_id) VALUES(?) ON CONFLICT(user_id) DO NOTHING',user.id).run();
 const [profile]=await loadDuoProfiles(env,[user.id],s.config,deps,{now});
 if(!profile.attackReady||!profile.defenseReady)throw duoError('DECK','랭크전 공격 덱과 방어 프리셋 1을 각각 유효하게 저장하세요.');
 if(Number(s.participant_count)>=DUO_LIMITS.participants)throw duoError('FULL','이번 모집 정원이 찼습니다.');
 recruiting(s,deps.now?.()??Date.now());
 // Enrollment alone takes a short season lock to enforce capacity. Battles
 // use shared admission locks and never update this season row.
 await env.DB.batch(seasonWrite(env,s,guard(env,'EXISTS(SELECT 1 FROM ranked_duo_seasons_v1 WHERE id=? AND participant_count<?) OR EXISTS(SELECT 1 FROM ranked_duo_entries_v1 WHERE season_id=? AND user_id=?)',[s.id,DUO_LIMITS.participants,s.id,user.id],[
  p('UPDATE ranked_duo_seasons_v1 SET participant_count=participant_count+1 WHERE id=? AND NOT EXISTS(SELECT 1 FROM ranked_duo_entries_v1 WHERE season_id=? AND user_id=?)',s.id,s.id,user.id),
  p('INSERT INTO ranked_duo_entries_v1(season_id,user_id,seed_power,seed_json,joined_at) VALUES(?,?,?,?,?) ON CONFLICT(season_id,user_id) DO NOTHING',s.id,user.id,profile.power,JSON.stringify(profile.breakdown),iso(now))
 ])));
 return duoStatus(env,user,await currentSeason(env),now);
}
async function cancel(env,user,s,now){
 recruiting(s,now);const p=statement(env);
 await env.DB.batch(seasonWrite(env,s,guard(env,'NOT EXISTS(SELECT 1 FROM ranked_duo_entries_v1 WHERE season_id=? AND user_id=? AND team_id IS NOT NULL)',[s.id,user.id],[
  p('UPDATE ranked_duo_seasons_v1 SET participant_count=participant_count-1 WHERE id=? AND EXISTS(SELECT 1 FROM ranked_duo_entries_v1 WHERE season_id=? AND user_id=? AND team_id IS NULL)',s.id,s.id,user.id),
  p('DELETE FROM ranked_duo_entries_v1 WHERE season_id=? AND user_id=? AND team_id IS NULL',s.id,user.id)
 ])));
 return {ok:true};
}

async function adminCreate(env,user,body,s,now){
 if(s&&s.status!=='CLOSED')throw duoError('SEASON_EXISTS','진행 중인 시즌을 먼저 종료하세요.');
 const config=validateDuoConfig({...body.config||structuredClone(DUO_DEFAULTS),visible:false,revision:0});await prepareDuoSchema(env);
 const id=crypto.randomUUID(),p=statement(env),condition=s?'EXISTS(SELECT 1 FROM app_meta WHERE key=? AND value=?)':'NOT EXISTS(SELECT 1 FROM app_meta WHERE key=?)';
 await env.DB.batch(guard(env,condition,s?[DUO_CURRENT_KEY,s.id]:[DUO_CURRENT_KEY],[p("INSERT INTO ranked_duo_seasons_v1(id,status,config_json,created_at) VALUES(?,'DRAFT',?,?)",id,JSON.stringify(config),iso(now)),p('INSERT INTO app_meta(key,value,updated_at) VALUES(?,?,CURRENT_TIMESTAMP) ON CONFLICT(key) DO UPDATE SET value=excluded.value,updated_at=CURRENT_TIMESTAMP',DUO_CURRENT_KEY,id),audit(env,user,'DUO_CREATE',null,{id,config})]));
 return {ok:true,season:publicSeason(await currentSeason(env))};
}
async function adminChange(env,user,s,body,action,now){
 requireSeason(s);const p=statement(env);let status=s.status,config=s.config,until=s.recruit_until,cursor=Number(s.pair_cursor),plan=null;
 if(action==='config'){
  if(s.config.automatic)throw duoError('AUTOMATIC_CONFIG','자동 시즌의 일정·행동력·점수·티어는 랭크전 설정을 따릅니다.');
  if(!['DRAFT','RECRUITING','READY'].includes(status))throw duoError('CONFIG_LOCKED','경기 시작 후 운영 수치를 바꿀 수 없습니다.');
  config=validateDuoConfig(body.config);if(config.revision!==s.config.revision)throw duoError('CONFIG_CONFLICT','설정이 변경됐습니다. 새로 불러오세요.');config.revision++;
  const published=await p('SELECT id FROM ranked_duo_teams_v1 WHERE season_id=? LIMIT 1',s.id).first();
  if(published&&(JSON.stringify(config.mercenaryWeights)!==JSON.stringify(s.config.mercenaryWeights)||config.score.initial!==s.config.score.initial))throw duoError('SEED_LOCKED','팀 공개 후 평가 가중치와 초기 점수는 바꿀 수 없습니다.');
 }else if(action==='recruit'){
  if(!['DRAFT','RECRUITING','READY','PAIRING'].includes(status))throw duoError('RECRUIT_STATE','경기 시작 전 추가모집만 가능합니다.');
  const hours=body.hours??DUO_RECRUIT_HOURS;if(!Number.isSafeInteger(hours)||hours<1||hours>720)throw duoError('HOURS','모집 시간을 확인하세요.',400);
  if(status==='DRAFT'&&hours!==DUO_RECRUIT_HOURS)throw duoError('HOURS','첫 참가 모집은 24시간입니다.',400);
  if(config.automatic&&!config.weekly&&now+hours*3600000>=Date.parse(config.endsAt))throw duoError('HOURS','추가모집은 랭크전 시즌 종료 전에 마쳐야 합니다.',400);
  status='RECRUITING';until=iso(now+hours*3600000);config={...config,visible:true};cursor=0;
  if(config.automatic)config={...config,startsAt:until};
  if(config.weekly)config={...config,startsAt:until,endsAt:iso(Date.parse(until)+DUO_BATTLE_DAYS*86400000)};
 }else if(action==='pair'){
  if(status!=='RECRUITING'||now<Date.parse(until))throw duoError('RECRUIT_OPEN','모집 종료 후 팀을 편성할 수 있습니다.');
  status='PAIRING';cursor=0;
 }else if(action==='start'){
  if(status!=='READY'||!config.startsAt||!config.endsAt||Date.parse(config.endsAt)<=now||Object.values(config.energy).some(v=>v===null))throw duoError('START_CONFIG','팀 편성, 경기 기간과 행동력 설정을 완료하세요.');
  const n=Number((await p('SELECT COUNT(*) AS n FROM ranked_duo_teams_v1 WHERE season_id=?',s.id).first()).n);if(n<2)throw duoError('TEAM_COUNT','최소 두 팀이 필요합니다. 추가모집을 진행하세요.');status='ACTIVE';
  if(config.automatic)config={...config,competitionStartedAt:iso(Math.max(now,Date.parse(config.startsAt)))};
 }else if(action==='close')status=config.automatic?'SETTLING':'CLOSED';
 else throw duoError('ACTION','운영 작업을 확인하세요.',400);
 await env.DB.batch([...lock(env,'SELECT id FROM ranked_duo_seasons_v1 WHERE id=? FOR UPDATE',s.id),...seasonGuard(env,s,[p('UPDATE ranked_duo_seasons_v1 SET status=?,config_json=?,recruit_until=?,pair_cursor=?,pairing_json=?,pair_policy_revision=(SELECT revision FROM ranked_duo_policy_version_v1 WHERE id=1),revision=revision+1 WHERE id=?',status,JSON.stringify(config),until,cursor,plan,s.id),audit(env,user,`DUO_${action.toUpperCase()}`,s,{status,config,recruitUntil:until})])]);
 return {ok:true,season:publicSeason(await currentSeason(env))};
}
async function saveDuoPolicy(env,user,s,body){
 const p=statement(env),row=await p('SELECT value FROM app_meta WHERE key=?',DUO_WEEKLY_POLICY_KEY).first();
 if(!row)throw duoError('NOT_CONFIGURED','독립 자동 시즌 설정을 먼저 준비하세요.');
 const previous=validateDuoPolicy(JSON.parse(row.value)),raw=body.policy;
 if(!raw||raw.revision!==previous.revision)throw duoError('CONFIG_CONFLICT','운영 설정이 변경됐습니다. 새로 불러오세요.');
 if(typeof raw.enabled!=='boolean'||typeof raw.rewards?.tierEnabled!=='boolean'||!Array.isArray(raw.tiers)||raw.tiers.length!==7||previous.tiers.some(t=>!raw.tiers.some(r=>r.id===t.id&&r.rewardCoin!==undefined&&r.rewardShards!==undefined))||raw.challenger?.rewardCoin===undefined||raw.challenger?.rewardShards===undefined)throw duoError('CONFIG','행동력·보상 설정을 모두 입력하세요.',400);
 const next=validateDuoPolicy({...previous,revision:previous.revision+1,enabled:raw.enabled,energy:raw.energy,rewards:raw.rewards,
  tiers:previous.tiers.map(t=>({...t,rewardCoin:raw.tiers?.find(r=>r.id===t.id)?.rewardCoin,rewardShards:raw.tiers?.find(r=>r.id===t.id)?.rewardShards})),challenger:raw.challenger});
 const current=body.applyToCurrent===true;
 if(current&&(!s?.config.weekly||!['RECRUITING','READY'].includes(s.status)||s.config.competitionStartedAt))throw duoError('CONFIG_LOCKED','대전 시작 후에는 다음 시즌 설정만 저장할 수 있습니다.');
 const writes=[p('UPDATE app_meta SET value=?,updated_at=CURRENT_TIMESTAMP WHERE key=?',JSON.stringify(next),DUO_WEEKLY_POLICY_KEY),
  audit(env,user,'DUO_WEEKLY_POLICY',s,{before:previous,after:next,applyToCurrent:current})];
 if(current){
  const config=validateDuoConfig({...s.config,revision:s.config.revision+1,energy:next.energy,rewards:next.rewards,tiers:next.tiers,challenger:next.challenger,weekly:{...s.config.weekly,policyRevision:next.revision}});
  writes.push(p('UPDATE ranked_duo_seasons_v1 SET config_json=?,revision=revision+1 WHERE id=?',JSON.stringify(config),s.id));
 }
 const guarded=guard(env,'EXISTS(SELECT 1 FROM app_meta WHERE key=? AND value=?)',[DUO_WEEKLY_POLICY_KEY,row.value],writes);
 await env.DB.batch([...lock(env,'SELECT key FROM app_meta WHERE key=? FOR UPDATE',DUO_WEEKLY_POLICY_KEY),...(current?seasonWrite(env,s,guarded):guarded)]);
 return {ok:true,policy:next,appliedToCurrent:current};
}
async function pairStep(env,user,s,deps,now){
 const p=statement(env);if(!['PAIRING','PUBLISHING'].includes(s.status))throw duoError('PAIR_STATE','팀 편성 작업이 진행 중이 아닙니다.');
 if(s.status==='PAIRING'){
  const policy=Number((await p('SELECT revision FROM ranked_duo_policy_version_v1 WHERE id=1').first()).revision);
  if(policy!==Number(s.pair_policy_revision)){await env.DB.batch(seasonWrite(env,s,[p('UPDATE ranked_duo_seasons_v1 SET pair_cursor=0,pair_policy_revision=?,revision=revision+1 WHERE id=?',policy,s.id)]));return {ok:true,phase:'EVALUATING',processed:0,restarted:true,done:false};}
  const entries=(await p('SELECT e.user_id,u.status,u.role,u.banned_until FROM ranked_duo_entries_v1 e LEFT JOIN users u ON u.id=e.user_id WHERE e.season_id=? AND e.team_id IS NULL AND e.user_id>? ORDER BY e.user_id LIMIT ?',s.id,Number(s.pair_cursor),DUO_LIMITS.refreshBatch).all()).results;
  if(entries.length){
   const eligible=entries.filter(e=>!s.config.automatic||e.status==='ACTIVE'&&!['OWNER','ADMIN'].includes(e.role)&&(!e.banned_until||duoUtcMs(e.banned_until)<=now));
   const profiles=await loadDuoProfiles(env,eligible.map(e=>e.user_id),s.config,deps,{now});
   if(!s.config.automatic&&profiles.some(p=>!p.attackReady||!p.defenseReady))throw duoError('PAIR_DECK',`편성 확인 필요: ${profiles.filter(p=>!p.attackReady||!p.defenseReady).map(p=>p.nickname).join(', ')}`);
   if(profiles.some(profile=>profile.policyRevision!==policy))throw duoError('PROFILE_CHANGED','전력 기준이 변경됐습니다. 편성 작업을 다시 진행하세요.');
   await env.DB.batch(seasonWrite(env,s,guard(env,'EXISTS(SELECT 1 FROM ranked_duo_policy_version_v1 WHERE id=1 AND revision=?)',[policy],[...entries.map(e=>{const profile=profiles.find(p=>p.userId===Number(e.user_id)),ready=profile?.attackReady&&profile?.defenseReady;return p('UPDATE ranked_duo_entries_v1 SET seed_power=?,seed_json=? WHERE season_id=? AND user_id=? AND team_id IS NULL',ready?profile.power:0,JSON.stringify(ready?{...profile.breakdown,sourceVersion:profile.sourceVersion,policyRevision:profile.policyRevision}:{ineligible:true,reason:'참가 계정 또는 공격·방어 덱을 확인하세요.'}),s.id,e.user_id);}),p('UPDATE ranked_duo_seasons_v1 SET pair_cursor=?,revision=revision+1 WHERE id=?',Number(entries.at(-1).user_id),s.id)])));
   return {ok:true,phase:'EVALUATING',processed:entries.length,done:false};
  }
  const rows=(await p('SELECT user_id,seed_power,joined_at FROM ranked_duo_entries_v1 WHERE season_id=? AND team_id IS NULL ORDER BY user_id LIMIT ?',s.id,DUO_LIMITS.participants+1).all()).results;
  const result=pairDuoParticipants(rows.filter(r=>Number(r.seed_power)>0).map(r=>({userId:Number(r.user_id),power:Number(r.seed_power),joinedAt:r.joined_at}))),plan={...result,teams:result.teams.map(t=>({...t,id:crypto.randomUUID()}))};
  const chunks=[];
  if(s.config.automatic)for(let offset=0;offset<plan.teams.length;offset+=40)chunks.push(p('INSERT INTO ranked_duo_pair_chunks_v2(season_id,offset_no,payload_json) VALUES(?,?,?) ON CONFLICT(season_id,offset_no) DO UPDATE SET payload_json=excluded.payload_json',s.id,offset,JSON.stringify(plan.teams.slice(offset,offset+40))));
  const stored=s.config.automatic?{chunked:true,teamCount:plan.teams.length,waiting:plan.waiting.length,spreadPercent:plan.spreadPercent}:plan;
  await env.DB.batch(seasonWrite(env,s,guard(env,'EXISTS(SELECT 1 FROM ranked_duo_policy_version_v1 WHERE id=1 AND revision=?)',[policy],[...chunks,p("UPDATE ranked_duo_seasons_v1 SET status='PUBLISHING',pair_cursor=0,pairing_json=?,revision=revision+1 WHERE id=?",JSON.stringify(stored),s.id)])));
  return {ok:true,phase:'PUBLISHING',teams:plan.teams.length,spreadPercent:plan.spreadPercent,done:false};
 }
 const row=await p('SELECT pairing_json FROM ranked_duo_seasons_v1 WHERE id=?',s.id).first(),plan=JSON.parse(row.pairing_json),offset=Number(s.pair_cursor);
 const total=plan.chunked?plan.teamCount:plan.teams.length,part=plan.chunked?await p('SELECT payload_json FROM ranked_duo_pair_chunks_v2 WHERE season_id=? AND offset_no=?',s.id,offset).first():null;
 const chunk=plan.chunked?JSON.parse(part?.payload_json||'[]'):plan.teams.slice(offset,offset+40),done=offset+chunk.length>=total;
 if(plan.chunked&&!part&&offset<total)throw duoError('PAIR_CHUNK','팀 편성 자료를 확인하세요.');
 const writes=chunk.flatMap(t=>[p('INSERT INTO ranked_duo_teams_v1(id,season_id,user_a,user_b,seed_power,score,created_at) VALUES(?,?,?,?,?,?,?)',t.id,s.id,t.members[0].userId,t.members[1].userId,t.power,s.config.score.initial,iso(now)),p('UPDATE ranked_duo_entries_v1 SET team_id=? WHERE season_id=? AND user_id IN(?,?) AND team_id IS NULL',t.id,s.id,...t.members.map(m=>m.userId))]);
 await env.DB.batch(seasonWrite(env,s,[...writes,p('UPDATE ranked_duo_seasons_v1 SET pair_cursor=?,status=?,revision=revision+1 WHERE id=?',offset+chunk.length,done?'READY':'PUBLISHING',s.id),...(plan.chunked?[p('DELETE FROM ranked_duo_pair_chunks_v2 WHERE season_id=? AND offset_no=?',s.id,offset)]:[]),...(done?[audit(env,user,'DUO_PAIR_COMPLETE',s,{teams:total,waiting:plan.chunked?plan.waiting:plan.waiting.length,spreadPercent:plan.spreadPercent})]:[])]));
 return {ok:true,phase:done?'READY':'PUBLISHING',published:offset+chunk.length,teams:total,spreadPercent:plan.spreadPercent,done};
}

async function match(env,user,s,deps,now){
 active(s,now);const p=statement(env),mine=await entry(env,s,user.id);if(!mine?.team_id)throw duoError('NO_TEAM','팀 편성 후 참가할 수 있습니다.');
 const pending=await p("SELECT id FROM ranked_duo_matches_v1 WHERE user_id=? AND status='PENDING'",user.id).first();if(pending)return {pendingMatchId:pending.id};
 if(duoEnergy(mine,s.config,now).current<s.config.energy.cost)throw duoError('ENERGY','듀오 행동력이 부족합니다.');
 const own=await team(env,mine.team_id),old=await p('SELECT * FROM ranked_duo_tickets_v1 WHERE season_id=? AND user_id=? AND used_at IS NULL AND expires_at>? ORDER BY expires_at DESC LIMIT 1',s.id,user.id,iso(now)).first();
 if(old)return {token:old.token,expiresAt:old.expires_at,opponent:await rankedTeam(env,s,await team(env,old.opponent_id),now)};
 const [above,below,recent]=await Promise.all([
  p('SELECT * FROM ranked_duo_teams_v1 WHERE season_id=? AND score>=? AND id<>? ORDER BY score,id LIMIT ?',s.id,own.score,own.id,DUO_LIMITS.candidates/2).all(),
  p('SELECT * FROM ranked_duo_teams_v1 WHERE season_id=? AND score<? AND id<>? ORDER BY score DESC,id DESC LIMIT ?',s.id,own.score,own.id,DUO_LIMITS.candidates/2).all(),
  p("SELECT defender_id FROM ranked_duo_matches_v1 WHERE season_id=? AND attacker_id=? AND status='COMPLETED' ORDER BY created_at DESC,id DESC LIMIT 3",s.id,own.id).all()
 ]);
 const recents=new Set(recent.results.map(r=>r.defender_id)),candidates=[...above.results,...below.results].sort((a,b)=>(recents.has(a.id)-recents.has(b.id))||Math.abs(Number(a.score)-Number(own.score))-Math.abs(Number(b.score)-Number(own.score))||Math.abs(Number(a.seed_power)-Number(own.seed_power))-Math.abs(Number(b.seed_power)-Number(own.seed_power))||String(a.id).localeCompare(String(b.id)));
 let chosen=null,bestDistance=Infinity;
 for(const candidate of candidates.slice(0,3)){
  try{const profiles=await loadDuoProfiles(env,[own.user_a,own.user_b,candidate.user_a,candidate.user_b],s.config,deps,{now});if(profiles.slice(0,2).some(p=>!p.attackReady))throw duoError('DECK','우리 팀 공격 덱을 확인하세요.');if(profiles.slice(2).every(p=>p.defenseReady)){const a=profiles[0].power+profiles[1].power,b=profiles[2].power+profiles[3].power,distance=Math.abs(Number(candidate.score)-Number(own.score))/100+Math.abs(a-b)/Math.max(a,b)+(recents.has(candidate.id)?.25:0);if(distance<bestDistance){chosen=candidate;bestDistance=distance;}}}
  catch(error){if(error.code==='DUO_PROFILE_CHANGED'||error.code==='DUO_PROFILE_BUILDING')throw error;if(!['DUO_ACCOUNT','DUO_DECK'].includes(error.code))throw error;}
 }
 if(!chosen)throw duoError('NO_OPPONENT','유효한 상대 팀을 찾지 못했습니다. 잠시 후 다시 시도하세요.');
 const token=crypto.randomUUID(),expiresAt=iso(now+90000);
 await p('INSERT INTO ranked_duo_tickets_v1(token,season_id,user_id,team_id,opponent_id,expires_at) VALUES(?,?,?,?,?,?) ON CONFLICT(season_id,user_id) DO UPDATE SET token=excluded.token,team_id=excluded.team_id,opponent_id=excluded.opponent_id,expires_at=excluded.expires_at,used_at=NULL WHERE ranked_duo_tickets_v1.used_at IS NOT NULL OR ranked_duo_tickets_v1.expires_at<=?',token,s.id,user.id,own.id,chosen.id,expiresAt,iso(now)).run();
 const accepted=await p('SELECT token,expires_at,opponent_id FROM ranked_duo_tickets_v1 WHERE season_id=? AND user_id=?',s.id,user.id).first();
 return {token:accepted.token,expiresAt:accepted.expires_at,opponent:await rankedTeam(env,s,await team(env,accepted.opponent_id),now)};
}

async function refundFailedMatch(env,row,lease,now){
 const p=statement(env);
 await env.DB.batch([...lock(env,'SELECT id FROM ranked_duo_matches_v1 WHERE id=? FOR UPDATE',row.id),...guard(env,"EXISTS(SELECT 1 FROM ranked_duo_matches_v1 WHERE id=? AND status='PENDING' AND lease_token=?)",[row.id,lease],[
  p('UPDATE ranked_duo_entries_v1 SET energy=energy+(SELECT energy_cost FROM ranked_duo_matches_v1 WHERE id=?) WHERE season_id=(SELECT season_id FROM ranked_duo_matches_v1 WHERE id=?) AND user_id=(SELECT user_id FROM ranked_duo_matches_v1 WHERE id=?)',row.id,row.id,row.id),
  p("UPDATE ranked_duo_matches_v1 SET status='CANCELLED',completed_at=? WHERE id=?",iso(now),row.id)
 ])]);
}
async function settle(env,row,lease,deps,now){
 const p=statement(env);let input,battleV2;
 try{input=JSON.parse(row.input_json);if(input.version!==DUO_VERSION)throw duoError('VERSION','전투 기준이 변경됐습니다.');battleV2=createDuoBattleV2(input.battle);if(new TextEncoder().encode(JSON.stringify(battleV2)).length>DUO_LIMITS.logBytes-10000)throw duoError('LOG_SIZE','전투 기록의 크기 제한을 초과했습니다.');}
 catch(error){await refundFailedMatch(env,row,lease,now);console.error('[ranked-duo simulation cancelled]',row.id,error.message);throw duoError('CANCELLED','전투를 완료하지 못해 행동력을 돌려드렸습니다. 다시 매칭하세요.',503);}
 const win=battleV2.result.winner==='A';
 const aDelta=win?input.score.win:-input.score.loss,dDelta=win?-input.score.loss:input.score.win;
 const rewardCoin=win?Number(input.rewards?.winCoin||0):0;
 const result={matchId:row.id,battleV2,result:win?'WIN':'LOSE',scoreChange:aDelta,rewardCoin,rewardUserId:Number(row.user_id),attackerNames:input.battle.attackerSquads.map(s=>s.ownerName),defenderNames:input.battle.defenderSquads.map(s=>s.ownerName),createdAt:row.created_at};
 const encoded=JSON.stringify(result);if(new TextEncoder().encode(encoded).length>DUO_LIMITS.logBytes)throw duoError('LOG_SIZE','전투 기록의 크기 제한을 초과했습니다.',503);
 const teams=[row.attacker_id,row.defender_id].sort();
 const writes=[...lock(env,'SELECT id FROM ranked_duo_matches_v1 WHERE id=? FOR UPDATE',row.id),...lock(env,'SELECT id FROM ranked_duo_teams_v1 WHERE id IN(?,?) ORDER BY id FOR UPDATE',...teams),...guard(env,"EXISTS(SELECT 1 FROM ranked_duo_matches_v1 WHERE id=? AND status='PENDING' AND lease_token=?)",[row.id,lease],[
  p('UPDATE ranked_duo_teams_v1 SET score=MAX(0,score+?),wins=wins+?,losses=losses+? WHERE id=?',aDelta,win?1:0,win?0:1,row.attacker_id),
  p('UPDATE ranked_duo_teams_v1 SET score=MAX(0,score+?),wins=wins+?,losses=losses+? WHERE id=?',dDelta,win?0:1,win?1:0,row.defender_id),
  ...duoVictoryWrites(env,Number(row.user_id),rewardCoin,row.id),
  p("UPDATE ranked_duo_matches_v1 SET status='COMPLETED',response_json=?,winner=?,attacker_score_after=(SELECT score FROM ranked_duo_teams_v1 WHERE id=?),defender_score_after=(SELECT score FROM ranked_duo_teams_v1 WHERE id=?),completed_at=? WHERE id=?",encoded,battleV2.result.winner,row.attacker_id,row.defender_id,iso(now),row.id)
 ])];
 try{await env.DB.batch(writes);}catch(error){const latest=await p('SELECT status FROM ranked_duo_matches_v1 WHERE id=?',row.id).first();if(latest?.status!=='COMPLETED')throw error;}
 return readResult(env,row.id);
}
async function readResult(env,id){const row=await statement(env)('SELECT id,status,response_json,attacker_score_after,defender_score_after FROM ranked_duo_matches_v1 WHERE id=?',id).first();if(!row)throw duoError('MATCH_NOT_FOUND','전투 기록을 찾을 수 없습니다.',404);return row.status==='COMPLETED'?{...JSON.parse(row.response_json),scoreAfter:Number(row.attacker_score_after),opponentScoreAfter:Number(row.defender_score_after),status:'COMPLETED'}:{matchId:row.id,status:row.status};}
async function history(env,s,user){
 const mine=await entry(env,s,user.id);if(!mine?.team_id)return {history:[]};
 const columns='id,user_id,attacker_id,defender_id,status,winner,created_at,attacker_score_after,defender_score_after';
 const groups=await Promise.all(['attacker_id','defender_id'].map(side=>statement(env)(`SELECT ${columns} FROM ranked_duo_matches_v1 WHERE season_id=? AND ${side}=? ORDER BY created_at DESC,id DESC LIMIT ?`,s.id,mine.team_id,DUO_LIMITS.history).all()));
 const rows=groups.flatMap(g=>g.results).sort((a,b)=>String(b.created_at).localeCompare(a.created_at)||String(b.id).localeCompare(a.id)).slice(0,DUO_LIMITS.history);
 return {history:rows.map(r=>({...r,side:r.attacker_id===mine.team_id?'A':'B'}))};
}
async function recover(env,row,deps,now){
 if(row.status==='COMPLETED')return readResult(env,row.id);if(row.status==='CANCELLED')throw duoError('CANCELLED','취소된 전투입니다. 다시 매칭하세요.');
 if(Date.parse(row.lease_until)>now)return {matchId:row.id,status:'PENDING',retryAfterMs:1500};
 const lease=crypto.randomUUID(),p=statement(env),claimed=await p("UPDATE ranked_duo_matches_v1 SET lease_token=?,lease_until=? WHERE id=? AND status='PENDING' AND lease_until<=?",lease,iso(now+30000),row.id,iso(now)).run();
 if(!Number(claimed.meta?.changes))return {matchId:row.id,status:'PENDING',retryAfterMs:1500};
 return settle(env,row,lease,deps,now);
}
async function fight(env,user,s,body,deps,now){
 const p=statement(env),requestId=jointRequestId(body.requestId),prior=await p('SELECT * FROM ranked_duo_matches_v1 WHERE user_id=? AND request_id=?',user.id,requestId).first();if(prior)return recover(env,prior,deps,now);
 active(s,now);const mine=await entry(env,s,user.id);if(!mine?.team_id)throw duoError('NO_TEAM','참가 팀을 확인하세요.');
 const ticket=await p('SELECT * FROM ranked_duo_tickets_v1 WHERE token=? AND user_id=? AND season_id=? AND used_at IS NULL AND expires_at>?',String(body.matchToken||''),user.id,s.id,iso(now)).first();if(!ticket||ticket.team_id!==mine.team_id)throw duoError('TICKET','다시 매칭해주세요.');
 const [a,b]=await Promise.all([team(env,ticket.team_id),team(env,ticket.opponent_id)]);if(!a||!b||a.id===b.id)throw duoError('TEAM','참가 팀을 확인하세요.');
 const profiles=await loadDuoProfiles(env,[a.user_a,a.user_b,b.user_a,b.user_b],s.config,deps,{now});
 if(profiles.some((profile,i)=>!(i<2?profile.attackReady:profile.defenseReady)))throw duoError('DECK','출전 덱이 변경됐습니다. 편성을 확인하세요.');
 const seed=crypto.getRandomValues(new Uint32Array(1))[0],input={version:DUO_VERSION,score:s.config.score,rewards:s.config.rewards||null,battle:{seed,singleHealerBonus:profiles[0].singleHealerBonus,attackerSquads:profiles.slice(0,2).map(p=>p.attack),defenderSquads:profiles.slice(2).map(p=>p.defense)}},id=crypto.randomUUID(),lease=crypto.randomUUID(),energy=duoEnergy(mine,s.config,now);
 if(energy.current<energy.cost)throw duoError('ENERGY','듀오 행동력이 부족합니다.');
 const ids=profiles.map(p=>p.userId).sort((a,b)=>a-b),inputJson=JSON.stringify(input),conds=profiles.map(()=>'(user_id=? AND source_version=?)').join(' OR '),args=profiles.flatMap(p=>[p.userId,p.sourceVersion]);
 const newEnergy=Math.max(0,energy.current-energy.cost);
 active(s,deps.now?.()??Date.now());
 try{await env.DB.batch([
  ...lock(env,'SELECT id FROM ranked_duo_seasons_v1 WHERE id=? FOR SHARE',s.id),
  ...lock(env,'SELECT id FROM ranked_duo_policy_version_v1 WHERE id=1 FOR SHARE'),
  ...lock(env,`SELECT user_id FROM ranked_duo_accounts_v1 WHERE user_id IN(${ids.map(()=>'?').join(',')}) ORDER BY user_id FOR SHARE`,...ids),
  ...lock(env,'SELECT user_id FROM ranked_duo_entries_v1 WHERE season_id=? AND user_id=? FOR UPDATE',s.id,user.id),
  ...seasonGuard(env,s,guard(env,`(SELECT COUNT(*) FROM ranked_duo_accounts_v1 WHERE ${conds})=4 AND EXISTS(SELECT 1 FROM ranked_duo_policy_version_v1 WHERE id=1 AND revision=?) AND EXISTS(SELECT 1 FROM ranked_duo_tickets_v1 WHERE token=? AND used_at IS NULL AND expires_at>?) AND EXISTS(SELECT 1 FROM ranked_duo_entries_v1 WHERE season_id=? AND user_id=? AND team_id=? AND energy=? AND COALESCE(energy_day,'')=?)`,[...args,profiles[0].policyRevision,ticket.token,iso(now),s.id,user.id,a.id,Number(mine.energy),mine.energy_day||''],[
   p('UPDATE ranked_duo_entries_v1 SET energy=?,energy_day=? WHERE season_id=? AND user_id=?',newEnergy,energy.day,s.id,user.id),
   p('UPDATE ranked_duo_tickets_v1 SET used_at=? WHERE token=?',iso(now),ticket.token),
   p("INSERT INTO ranked_duo_matches_v1(id,request_id,user_id,season_id,attacker_id,defender_id,status,input_json,energy_cost,lease_until,lease_token,created_at) VALUES(?,?,?,?,?,?,'PENDING',?,?,?,?,?)",id,requestId,user.id,s.id,a.id,b.id,inputJson,energy.cost,iso(now+30000),lease,iso(now))
  ]))
 ]);}catch(error){const existing=await p('SELECT * FROM ranked_duo_matches_v1 WHERE user_id=? AND request_id=?',user.id,requestId).first();if(existing)return recover(env,existing,deps,now);throw duoError('CONFLICT','다른 요청 또는 덱 변경이 감지됐습니다. 최신 상태로 다시 시도하세요.');}
 return settle(env,{id,user_id:user.id,input_json:inputJson,attacker_id:a.id,defender_id:b.id,created_at:iso(now)},lease,deps,now);
}

export async function handleRankedDuo({path,request,env,deps}){
 if(!path.startsWith('ranked-duo/')&&!path.startsWith('admin/ranked-duo'))return null;
 try{
  const user=await deps.authenticate(request,env);if(!user)return deps.json({error:'로그인이 필요합니다.'},401);
  const admin=path.startsWith('admin/');if(admin&&user.role!=='OWNER')throw duoError('PERMISSION','OWNER만 설정할 수 있습니다.',403);
  const now=deps.now?.()??Date.now(),s=await currentSeason(env),p=statement(env),body=['POST','PATCH','DELETE'].includes(request.method)?await deps.readBody(request):{};
  let data;
  if(admin){
   const action=path.slice('admin/ranked-duo'.length).replace(/^\//,'');
   if(request.method==='GET'&&!action){const counts=s?await p('SELECT COUNT(*) AS n,SUM(CASE WHEN team_id IS NULL THEN 1 ELSE 0 END) AS waiting FROM ranked_duo_entries_v1 WHERE season_id=?',s.id).first():null;data={season:publicSeason(s),config:s?.config||structuredClone(DUO_DEFAULTS),policy:await readDuoPolicy(env),participants:Number(counts?.n||0),waiting:Number(counts?.waiting||0)};}
   else if(request.method==='PATCH'&&action==='policy')data=await saveDuoPolicy(env,user,s,body);
   else if(request.method==='POST'&&action==='create')data=await adminCreate(env,user,body,s,now);
   else if(request.method==='POST'&&action==='pair-step')data=await pairStep(env,user,requireSeason(s),deps,now);
   else if(request.method==='POST'&&['recruit','pair','start','close'].includes(action)||request.method==='PATCH'&&!action)data=await adminChange(env,user,requireSeason(s),body,action||'config',now);
   else throw duoError('ROUTE','지원하지 않는 요청입니다.',405);
  }else if(path==='ranked-duo/status'&&request.method==='GET')data=await duoStatus(env,user,s,now);
  else if(path==='ranked-duo/rewards'&&request.method==='GET'){
   const ready=await p('SELECT value FROM app_meta WHERE key=?',DUO_WEEKLY_SCHEMA_KEY).first();
   data={rewards:ready?(await p('SELECT r.*,s.config_json FROM ranked_duo_rewards_v3 r JOIN ranked_duo_seasons_v1 s ON s.id=r.season_id WHERE r.user_id=? ORDER BY r.credited_at DESC LIMIT 6',user.id).all()).results.map(r=>({seasonName:JSON.parse(r.config_json).name,tierName:r.tier_name,rank:Number(r.final_rank),coin:Number(r.reward_coin),shards:Number(r.reward_shards),creditedAt:r.credited_at})):[]};
  }
  else if(path==='ranked-duo/join'&&request.method==='POST')data=await join(env,user,s,deps,now);
  else if(path==='ranked-duo/join'&&request.method==='DELETE')data=await cancel(env,user,s,now);
  else if(path==='ranked-duo/match'&&request.method==='POST')data=await match(env,user,s,deps,now);
  else if(path==='ranked-duo/fight'&&request.method==='POST')data=await fight(env,user,s,body,deps,now);
  else if(path==='ranked-duo/ranking'&&request.method==='GET'){
   requireSeason(s);const rows=s.config.visible?await standings(env,s,100,now):[];data={ranking:rows.map((r,i)=>publicTeam(r,s.config,Number(r.final_rank)||i+1)),...duoTiers(s.config),settled:s.status==='CLOSED'};
  }else if(path==='ranked-duo/history'&&request.method==='GET'){
   data=await history(env,requireSeason(s),user);
  }else if(path==='ranked-duo/replay'&&['GET','POST'].includes(request.method)){
   const id=request.method==='GET'?new URL(request.url).searchParams.get('id'):body.matchId,row=await p('SELECT * FROM ranked_duo_matches_v1 WHERE id=?',String(id||'')).first();if(!row)throw duoError('MATCH_NOT_FOUND','전투 기록이 없습니다.',404);
   const member=await p('SELECT team_id FROM ranked_duo_entries_v1 WHERE season_id=? AND user_id=?',row.season_id,user.id).first();if(!member||![row.attacker_id,row.defender_id].includes(member.team_id))throw duoError('PERMISSION','참가한 전투만 볼 수 있습니다.',403);
   data=request.method==='POST'&&Number(row.user_id)===Number(user.id)?await recover(env,row,deps,now):await readResult(env,row.id);
  }else throw duoError('ROUTE','지원하지 않는 요청입니다.',405);
  return deps.json(data);
 }catch(error){const known=error.code?.startsWith('DUO_')||error.code?.startsWith('JOINT_');if(!known)console.error('[ranked-duo]',error);return deps.json({error:known?error.message:'듀오 요청을 처리하지 못했습니다. 잠시 후 다시 시도하세요.',code:known?error.code:'DUO_INTERNAL'},known?Number(error.status||409):500);}
}

// The scheduler reuses the same bounded operations and revision guards as CMS.
export const duoLifecycle={currentSeason,publicSeason,seasonWrite,statement,guard,pairStep,adminChange,recover,standings};
