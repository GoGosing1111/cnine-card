import {duoLifecycle as core} from './_ranked_duo.js';
import {prepareDuoSchema,DUO_CURRENT_KEY} from './_ranked_duo_schema.js';
import {duoAutomaticConfig,duoSourceKey,duoUtcMs,DUO_CHALLENGER} from '../shared/ranked-duo-season-v2.mjs';
import {validateDuoConfig} from '../shared/ranked-duo-v1.mjs';

export const DUO_AUTO_SCHEMA_KEY='ranked_duo_auto_schema_v2';
export const DUO_AUTO_SCHEMA=[
 "CREATE TABLE IF NOT EXISTS ranked_duo_pair_chunks_v2(season_id TEXT NOT NULL,offset_no BIGINT NOT NULL,payload_json TEXT NOT NULL,PRIMARY KEY(season_id,offset_no))",
 "CREATE TABLE IF NOT EXISTS ranked_duo_auto_v2(source_key TEXT PRIMARY KEY,season_id TEXT NOT NULL UNIQUE,created_at TEXT NOT NULL)",
 "CREATE TABLE IF NOT EXISTS ranked_duo_scheduler_v2(id BIGINT PRIMARY KEY,token TEXT NOT NULL,lease_until TEXT NOT NULL)",
 "CREATE TABLE IF NOT EXISTS ranked_duo_final_v2(season_id TEXT NOT NULL,id TEXT NOT NULL,user_a BIGINT NOT NULL,user_b BIGINT NOT NULL,name_a TEXT NOT NULL,name_b TEXT NOT NULL,final_rank BIGINT NOT NULL,score BIGINT NOT NULL,wins BIGINT NOT NULL,losses BIGINT NOT NULL,completed_at TEXT NOT NULL,PRIMARY KEY(season_id,id),UNIQUE(season_id,final_rank))",
 "CREATE TABLE IF NOT EXISTS ranked_duo_trophies_v2(season_id TEXT NOT NULL,user_id BIGINT NOT NULL,team_id TEXT NOT NULL,final_rank BIGINT NOT NULL,acquired_at TEXT NOT NULL,PRIMARY KEY(season_id,user_id))",
 "CREATE INDEX IF NOT EXISTS ranked_duo_trophy_owner_v2 ON ranked_duo_trophies_v2(user_id,acquired_at)",
 "CREATE INDEX IF NOT EXISTS ranked_duo_pending_season_v2 ON ranked_duo_matches_v1(season_id,lease_until,id) WHERE status='PENDING'"
];
const iso=now=>new Date(now).toISOString(),actor={id:0,role:'SYSTEM'},p=core.statement;
export async function prepareDuoAutomation(env){
 if(await p(env)('SELECT value FROM app_meta WHERE key=?',DUO_AUTO_SCHEMA_KEY).first())return;
 await prepareDuoSchema(env);
 if(env.DB.execSchema)await env.DB.execSchema(DUO_AUTO_SCHEMA);else for(const sql of DUO_AUTO_SCHEMA)await env.DB.prepare(sql).run();
 await p(env)('INSERT INTO app_meta(key,value,updated_at) VALUES(?,?,CURRENT_TIMESTAMP) ON CONFLICT(key) DO NOTHING',DUO_AUTO_SCHEMA_KEY,'20260925-24h').run();
}
export async function readDuoHonors(env,userId){
 if(!await p(env)('SELECT value FROM app_meta WHERE key=?',DUO_AUTO_SCHEMA_KEY).first())return {count:0,acquiredAt:null};
 const row=await p(env)('SELECT COUNT(*) AS n,MIN(acquired_at) AS first_at FROM ranked_duo_trophies_v2 WHERE user_id=?',userId).first();
 return {count:Number(row.n),acquiredAt:row.first_at||null};
}
async function change(env,s,status,config=s.config,extra=[]){
 await env.DB.batch(core.seasonWrite(env,s,[
  p(env)('UPDATE ranked_duo_seasons_v1 SET status=?,config_json=?,revision=revision+1 WHERE id=?',status,JSON.stringify(config),s.id),...extra
 ]));
}
async function finish(env,s,deps,now){
 const pending=(await p(env)("SELECT * FROM ranked_duo_matches_v1 WHERE season_id=? AND status='PENDING' ORDER BY lease_until,id LIMIT 4",s.id).all()).results;
 for(const match of pending)if(Date.parse(match.lease_until)<=now){
  try{await core.recover(env,match,deps,now);}catch(error){if(error.code!=='DUO_CANCELLED')throw error;}
 }
 if(pending.length)return {phase:'SETTLING',nextCheckAt:iso(now+5000)};
 // Admission is already closed. The guard also protects an in-flight reservation.
 // One indexed season snapshot, bounded by the 10,000 participant / 5,000 team cap.
 const writes=s.config.competitionStartedAt?[
  p(env)(`INSERT INTO ranked_duo_final_v2(season_id,id,user_a,user_b,name_a,name_b,final_rank,score,wins,losses,completed_at)
    SELECT t.season_id,t.id,t.user_a,t.user_b,a.nickname,b.nickname,ROW_NUMBER() OVER (ORDER BY t.score DESC,t.id DESC),t.score,t.wins,t.losses,?
    FROM ranked_duo_teams_v1 t JOIN users a ON a.id=t.user_a JOIN users b ON b.id=t.user_b WHERE t.season_id=?
      AND a.status='ACTIVE' AND b.status='ACTIVE' AND a.role NOT IN('OWNER','ADMIN') AND b.role NOT IN('OWNER','ADMIN')
      AND (a.banned_until IS NULL OR SUBSTR(REPLACE(a.banned_until,'T',' '),1,19)<=?) AND (b.banned_until IS NULL OR SUBSTR(REPLACE(b.banned_until,'T',' '),1,19)<=?)
    ORDER BY t.score DESC,t.id DESC LIMIT 5000`,iso(now),s.id,iso(now).replace('T',' ').slice(0,19),iso(now).replace('T',' ').slice(0,19)),
  ...['user_a','user_b'].map(column=>p(env)(`INSERT INTO ranked_duo_trophies_v2(season_id,user_id,team_id,final_rank,acquired_at)
    SELECT season_id,${column},id,final_rank,completed_at FROM ranked_duo_final_v2 WHERE season_id=? AND final_rank BETWEEN 1 AND ?
    ON CONFLICT(season_id,user_id) DO NOTHING`,s.id,DUO_CHALLENGER.rankLimit))
 ]:[];
 await env.DB.batch(core.seasonWrite(env,s,core.guard(env,"NOT EXISTS(SELECT 1 FROM ranked_duo_matches_v1 WHERE season_id=? AND status='PENDING')",[s.id],[
  ...writes,p(env)("UPDATE ranked_duo_seasons_v1 SET status='CLOSED',revision=revision+1 WHERE id=?",s.id)
 ])));
 return {phase:'CLOSED',seasonId:s.id,changed:true,nextCheckAt:iso(now+1000)};
}

// One lease is for lifecycle maintenance only. Player requests never touch it.
// Each tick does at most one 12-player evaluation or one 40-team publication.
export async function reconcileDuoSeason(env,{settings,deps={},now=Date.now()}){
 await prepareDuoAutomation(env);
 const token=crypto.randomUUID(),claimed=await p(env)("INSERT INTO ranked_duo_scheduler_v2(id,token,lease_until) VALUES(1,?,?) ON CONFLICT(id) DO UPDATE SET token=excluded.token,lease_until=excluded.lease_until WHERE ranked_duo_scheduler_v2.lease_until<=?",token,iso(now+60000),iso(now)).run();
 if(!Number(claimed.meta?.changes))return {phase:'BUSY',nextCheckAt:iso(now+5000)};
 try{
  let s=await core.currentSeason(env);
  if(s?.config.automatic&&s.status!=='CLOSED'){
   const sameSource=s.config.rankedSeason.name===settings.seasonName&&duoUtcMs(settings.startsAt)===duoUtcMs(s.config.rankedSeason.startsAt);
   if(sameSource&&Number.isFinite(duoUtcMs(settings.endsAt))&&s.config.endsAt!==iso(duoUtcMs(settings.endsAt))&&s.status!=='SETTLING'){
    const endsAt=iso(duoUtcMs(settings.endsAt)),noCompetitionWindow=endsAt<=s.config.startsAt;
    const config={...s.config,startsAt:noCompetitionWindow?null:s.config.startsAt,endsAt,rankedSeason:{...s.config.rankedSeason,key:duoSourceKey(settings),endsAt}};
    await change(env,s,noCompetitionWindow?'SETTLING':s.status,config,[p(env)('UPDATE ranked_duo_auto_v2 SET source_key=? WHERE season_id=?',duoSourceKey(settings),s.id)]);
    s=await core.currentSeason(env);
   }
   if(s.status!=='SETTLING'&&(now>=Date.parse(s.config.endsAt)||!sameSource)){
    await change(env,s,'SETTLING');s=await core.currentSeason(env);
   }
   if(s.status==='SETTLING')return await finish(env,s,deps,now);
   if(s.status==='RECRUITING'&&now>=Date.parse(s.recruit_until)){
    await core.adminChange(env,actor,s,{},'pair',now);return {phase:'PAIRING',nextCheckAt:iso(now+1000)};
   }
   if(['PAIRING','PUBLISHING'].includes(s.status)){
    const result=await core.pairStep(env,actor,s,deps,now);
    return {phase:result.phase,nextCheckAt:iso(now+1000)};
   }
   if(s.status==='READY'&&now>=Date.parse(s.config.startsAt)&&settings.enabled!==false){
    const teams=(await p(env)('SELECT id FROM ranked_duo_teams_v1 WHERE season_id=? LIMIT 2',s.id).all()).results;
    if(teams.length<2)return {phase:'INSUFFICIENT_TEAMS',nextCheckAt:iso(now+60000)};
    await change(env,s,'ACTIVE',{...s.config,competitionStartedAt:iso(now)});
    return {phase:'ACTIVE',seasonId:s.id,changed:true,nextCheckAt:iso(Math.min(now+60000,Date.parse(s.config.endsAt)))};
   }
   return {phase:s.status,nextCheckAt:iso(Math.min(now+60000,s.status==='RECRUITING'?Date.parse(s.recruit_until):Date.parse(s.config.endsAt)))};
  }
  // Never replace a manually started competition while its participants play.
  if(s&&s.status!=='CLOSED')return {phase:'MANUAL',nextCheckAt:iso(now+60000)};
  const config=duoAutomaticConfig(settings,now,s?.config);
  if(!config)return {phase:'WAITING_RANKED_SEASON',nextCheckAt:iso(now+60000)};
  if(await p(env)('SELECT season_id FROM ranked_duo_auto_v2 WHERE source_key=?',config.rankedSeason.key).first())return {phase:'CLOSED',nextCheckAt:iso(now+60000)};
  const id=crypto.randomUUID(),valid=validateDuoConfig(config);
  await env.DB.batch(core.guard(env,s?'EXISTS(SELECT 1 FROM app_meta WHERE key=? AND value=?)':'NOT EXISTS(SELECT 1 FROM app_meta WHERE key=?)',s?[DUO_CURRENT_KEY,s.id]:[DUO_CURRENT_KEY],[
   p(env)("INSERT INTO ranked_duo_seasons_v1(id,status,config_json,recruit_until,created_at) VALUES(?,'RECRUITING',?,?,?)",id,JSON.stringify(valid),valid.startsAt,iso(now)),
   p(env)('INSERT INTO ranked_duo_auto_v2(source_key,season_id,created_at) VALUES(?,?,?)',valid.rankedSeason.key,id,iso(now)),
   p(env)('INSERT INTO app_meta(key,value,updated_at) VALUES(?,?,CURRENT_TIMESTAMP) ON CONFLICT(key) DO UPDATE SET value=excluded.value,updated_at=CURRENT_TIMESTAMP',DUO_CURRENT_KEY,id)
  ]));
  return {phase:'RECRUITING',seasonId:id,changed:true,recruitUntil:valid.startsAt,endsAt:valid.endsAt,nextCheckAt:iso(Math.min(now+60000,Date.parse(valid.startsAt)))};
 }finally{await p(env)('DELETE FROM ranked_duo_scheduler_v2 WHERE id=1 AND token=?',token).run();}
}
