const CLAN_FOUNDATION_VERSION='safe_runtime_upgrade_v1820_clan_v1';
const CLAN_MAX_MEMBERS=20;
const CLAN_MARKS=Object.freeze(['WOLF','RAVEN','LION','DRAGON','CROWN','SPEAR','SHIELD','PHOENIX']);
const CLAN_ROLES=Object.freeze(['ATTACK','DEFENSE','SPEED','HP','BALANCED']);

let foundationReady=false;

function iso(ms=Date.now()){return new Date(ms).toISOString()}
function safeJson(value,fallback={}){try{return JSON.parse(value||'')}catch{return fallback}}
function clamp(value,min,max,fallback=min){const n=Number(value);return Number.isFinite(n)?Math.max(min,Math.min(max,n)):fallback}
function clampInt(value,min,max,fallback=min){return Math.round(clamp(value,min,max,fallback))}
function cleanText(value,max=30){return String(value??'').replace(/[<>&"'`]/g,'').replace(/\s+/g,' ').trim().slice(0,max)}
function validRequestId(value){const text=String(value||'').trim();return text.length>=8&&text.length<=120&&/^[A-Za-z0-9:_-]+$/.test(text)?text:''}
function seedOf(text){let h=2166136261;for(const c of String(text)){h^=c.charCodeAt(0);h=Math.imul(h,16777619)}return h>>>0}
function sqlMs(value){if(!value)return NaN;const text=String(value);return Date.parse(text.includes('T')?text:`${text.replace(' ','T')}Z`)}
function rows(result){return result?.results||[]}
async function batchChunks(env,statements,size=40){
  for(let i=0;i<statements.length;i+=size){
    const chunk=statements.slice(i,i+size).map(statement=>typeof statement==='string'?env.DB.prepare(statement):statement);
    await env.DB.batch(chunk);
  }
}

const FOUNDATION_SQL=Object.freeze([
  `CREATE TABLE IF NOT EXISTS clan_seasons(
    id INTEGER PRIMARY KEY AUTOINCREMENT,season_no INTEGER NOT NULL UNIQUE,phase TEXT NOT NULL DEFAULT 'REGISTRATION',max_members INTEGER NOT NULL DEFAULT 20,
    registration_ends_at TEXT NOT NULL,draft_ends_at TEXT NOT NULL,starts_at TEXT NOT NULL,ends_at TEXT NOT NULL,
    draft_pick_count INTEGER NOT NULL DEFAULT 0,next_pick_deadline TEXT,created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)`,
  `CREATE TABLE IF NOT EXISTS clan_organizations(
    id INTEGER PRIMARY KEY AUTOINCREMENT,name TEXT NOT NULL UNIQUE,mark_key TEXT NOT NULL DEFAULT 'SHIELD',primary_color TEXT NOT NULL DEFAULT '#31d7e8',accent_color TEXT NOT NULL DEFAULT '#e4f8ff',
    slogan TEXT NOT NULL DEFAULT '',trophies INTEGER NOT NULL DEFAULT 0,is_active INTEGER NOT NULL DEFAULT 1,created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)`,
  `CREATE TABLE IF NOT EXISTS clan_season_teams(
    season_id INTEGER NOT NULL,clan_id INTEGER NOT NULL,master_user_id INTEGER NOT NULL,draft_position INTEGER NOT NULL,score INTEGER NOT NULL DEFAULT 0,wins INTEGER NOT NULL DEFAULT 0,losses INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,PRIMARY KEY(season_id,clan_id),UNIQUE(season_id,master_user_id),UNIQUE(season_id,draft_position))`,
  `CREATE TABLE IF NOT EXISTS clan_draft_pool(
    season_id INTEGER NOT NULL,user_id INTEGER NOT NULL,candidate_key TEXT NOT NULL,preferred_role TEXT NOT NULL DEFAULT 'BALANCED',activity_window TEXT NOT NULL DEFAULT 'EVENING',
    activity_score INTEGER NOT NULL DEFAULT 0,rank_score INTEGER NOT NULL DEFAULT 0,contribution_score INTEGER NOT NULL DEFAULT 0,reliability_score INTEGER NOT NULL DEFAULT 0,master_score INTEGER NOT NULL DEFAULT 0,total_score INTEGER NOT NULL DEFAULT 0,
    rank_band TEXT NOT NULL DEFAULT 'UNRANKED',activity_band TEXT NOT NULL DEFAULT 'NEW',deck_snapshot TEXT NOT NULL DEFAULT '[]',status TEXT NOT NULL DEFAULT 'AVAILABLE',drafted_clan_id INTEGER,pick_no INTEGER,
    registered_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,PRIMARY KEY(season_id,user_id),UNIQUE(season_id,candidate_key))`,
  `CREATE TABLE IF NOT EXISTS clan_members(
    season_id INTEGER NOT NULL,clan_id INTEGER NOT NULL,user_id INTEGER NOT NULL,member_role TEXT NOT NULL DEFAULT 'MEMBER',preferred_role TEXT NOT NULL DEFAULT 'BALANCED',draft_pick_no INTEGER NOT NULL DEFAULT 0,
    contribution_score INTEGER NOT NULL DEFAULT 0,battle_wins INTEGER NOT NULL DEFAULT 0,battle_losses INTEGER NOT NULL DEFAULT 0,joined_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY(season_id,user_id),UNIQUE(season_id,clan_id,user_id))`,
  `CREATE TABLE IF NOT EXISTS clan_wars(
    id INTEGER PRIMARY KEY AUTOINCREMENT,season_id INTEGER NOT NULL,round_no INTEGER NOT NULL DEFAULT 1,clan_a_id INTEGER NOT NULL,clan_b_id INTEGER NOT NULL,status TEXT NOT NULL DEFAULT 'ACTIVE',
    score_a INTEGER NOT NULL DEFAULT 0,score_b INTEGER NOT NULL DEFAULT 0,battle_count INTEGER NOT NULL DEFAULT 0,starts_at TEXT NOT NULL,ends_at TEXT NOT NULL,winner_clan_id INTEGER,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,UNIQUE(season_id,round_no,clan_a_id,clan_b_id))`,
  `CREATE TABLE IF NOT EXISTS clan_war_battles(
    id INTEGER PRIMARY KEY AUTOINCREMENT,request_id TEXT NOT NULL UNIQUE,season_id INTEGER NOT NULL,war_id INTEGER NOT NULL,attacker_clan_id INTEGER NOT NULL,defender_clan_id INTEGER NOT NULL,
    attacker_user_id INTEGER NOT NULL,defender_user_id INTEGER NOT NULL,battle_seed INTEGER NOT NULL,status TEXT NOT NULL DEFAULT 'PENDING',winner_clan_id INTEGER,result_json TEXT,error_message TEXT,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)`,
  `CREATE TABLE IF NOT EXISTS clan_draft_locks(season_id INTEGER PRIMARY KEY,token TEXT NOT NULL,expires_at TEXT NOT NULL,updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)`,
  `CREATE INDEX IF NOT EXISTS idx_clan_pool_status ON clan_draft_pool(season_id,status,total_score DESC,user_id)`,
  `CREATE INDEX IF NOT EXISTS idx_clan_members_team ON clan_members(season_id,clan_id,draft_pick_no,user_id)`,
  `CREATE INDEX IF NOT EXISTS idx_clan_teams_rank ON clan_season_teams(season_id,score DESC,wins DESC,clan_id)`,
  `CREATE INDEX IF NOT EXISTS idx_clan_wars_team_a ON clan_wars(season_id,clan_a_id,status)`,
  `CREATE INDEX IF NOT EXISTS idx_clan_wars_team_b ON clan_wars(season_id,clan_b_id,status)`,
  `CREATE INDEX IF NOT EXISTS idx_clan_battles_cleanup ON clan_war_battles(status,updated_at,id)`
]);

async function ensureFoundation(env){
  if(foundationReady)return;
  await env.DB.prepare('CREATE TABLE IF NOT EXISTS app_meta(key TEXT PRIMARY KEY,value TEXT,updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)').run();
  const marker=await env.DB.prepare('SELECT value FROM app_meta WHERE key=?').bind(CLAN_FOUNDATION_VERSION).first();
  if(!marker){
    await batchChunks(env,FOUNDATION_SQL,25);
    await env.DB.prepare("INSERT OR IGNORE INTO app_meta(key,value,updated_at) VALUES('clan_settings_v1',?,CURRENT_TIMESTAMP)").bind(JSON.stringify({mode:'TEST'})).run();
    await env.DB.prepare('INSERT INTO app_meta(key,value,updated_at) VALUES(?,?,CURRENT_TIMESTAMP) ON CONFLICT(key) DO UPDATE SET value=excluded.value,updated_at=CURRENT_TIMESTAMP').bind(CLAN_FOUNDATION_VERSION,iso()).run();
  }
  foundationReady=true;
}

async function clanSettings(env){const row=await env.DB.prepare("SELECT value FROM app_meta WHERE key='clan_settings_v1'").first(),raw=safeJson(row?.value,{mode:'TEST'}),mode=['OFF','TEST','ON'].includes(String(raw.mode||'').toUpperCase())?String(raw.mode).toUpperCase():'TEST';return{mode}}

async function latestSeason(env){return env.DB.prepare("SELECT * FROM clan_seasons WHERE phase<>'COMPLETE' ORDER BY season_no DESC LIMIT 1").first()}
async function createSeason(env){
  const current=await latestSeason(env);if(current)return current;
  const last=await env.DB.prepare('SELECT COALESCE(MAX(season_no),0) last_no FROM clan_seasons').first(),now=Date.now(),seasonNo=Number(last?.last_no||0)+1;
  await env.DB.prepare("INSERT INTO clan_seasons(season_no,phase,max_members,registration_ends_at,draft_ends_at,starts_at,ends_at) VALUES(?,'REGISTRATION',20,?,?,?,?)").bind(seasonNo,iso(now+7*86400000),iso(now+10*86400000),iso(now+10*86400000),iso(now+38*86400000)).run();
  return latestSeason(env);
}

function rankBand(score){if(score>=2200)return'DIAMOND';if(score>=1800)return'PLATINUM';if(score>=1450)return'GOLD';if(score>=1150)return'SILVER';if(score>0)return'BRONZE';return'UNRANKED'}
function activityBand(days,lastLoginMs){if(days>=20&&Date.now()-lastLoginMs<3*86400000)return'CORE';if(days>=10&&Date.now()-lastLoginMs<7*86400000)return'ACTIVE';if(days>=3&&Date.now()-lastLoginMs<14*86400000)return'CASUAL';return'NEW'}
function normalizeScores(candidates){
  const maxRank=Math.max(1,...candidates.map(x=>Number(x.season_score||0))),maxContribution=Math.max(1,...candidates.map(x=>Number(x.territory_points||0)));
  return candidates.map(row=>{
    const days=clampInt(row.attendance_days,0,30,0),lastLogin=sqlMs(row.last_login_at),recency=Number.isFinite(lastLogin)?Math.max(0,300-Math.floor((Date.now()-lastLogin)/86400000)*20):0;
    const activity=Math.min(1000,days*34+recency),rank=Math.round(clamp(Number(row.season_score||0)/maxRank,0,1,0)*1000),contribution=Math.round(clamp(Number(row.territory_points||0)/maxContribution,0,1,0)*1000),reliability=Math.min(1000,Math.round(clamp(Number(row.wins||0)/(Math.max(1,Number(row.wins||0)+Number(row.losses||0))),0,1,.5)*700+Math.min(300,(Number(row.wins||0)+Number(row.losses||0))*6)));
    const master=Math.round(activity*.4+rank*.3+contribution*.2+reliability*.1),total=Math.round(activity*.32+rank*.34+contribution*.22+reliability*.12);
    return{...row,activity_score:activity,rank_score:rank,contribution_score:contribution,reliability_score:reliability,master_score:master,total_score:total,rank_band:rankBand(Number(row.season_score||0)),activity_band:activityBand(days,lastLogin)};
  });
}

async function calculateSeasonScores(env,season){
  const result=await env.DB.prepare(`WITH attendance AS (
      SELECT user_id,COUNT(*) attendance_days FROM attendance_logs WHERE attendance_date>=date('now','-30 days') GROUP BY user_id
    ), territory AS (
      SELECT user_id,SUM(COALESCE(attacks,0)*120+COALESCE(defense_wins,0)*250+COALESCE(front_finishes,0)*400+COALESCE(damage,0)/1000) territory_points
      FROM territory_war_v3_users WHERE round_id IN (SELECT id FROM territory_war_v3_rounds ORDER BY id DESC LIMIT 5) GROUP BY user_id
    )
    SELECT p.user_id,p.preferred_role,p.activity_window,u.nickname,u.last_login_at,COALESCE(a.attendance_days,0) attendance_days,COALESCE(v.season_score,0) season_score,COALESCE(v.wins,0) wins,COALESCE(v.losses,0) losses,COALESCE(t.territory_points,0) territory_points
    FROM clan_draft_pool p JOIN users u ON u.id=p.user_id LEFT JOIN attendance a ON a.user_id=p.user_id LEFT JOIN pvp_profiles v ON v.user_id=p.user_id LEFT JOIN territory t ON t.user_id=p.user_id WHERE p.season_id=?`).bind(season.id).all();
  const scored=normalizeScores(rows(result)),statements=[];
  for(const item of scored)statements.push(env.DB.prepare('UPDATE clan_draft_pool SET activity_score=?,rank_score=?,contribution_score=?,reliability_score=?,master_score=?,total_score=?,rank_band=?,activity_band=?,updated_at=CURRENT_TIMESTAMP WHERE season_id=? AND user_id=?').bind(item.activity_score,item.rank_score,item.contribution_score,item.reliability_score,item.master_score,item.total_score,item.rank_band,item.activity_band,season.id,item.user_id));
  await batchChunks(env,statements);return scored;
}

async function acquireDraftLock(env,seasonId){
  const token=crypto.randomUUID(),expiresAt=iso(Date.now()+30000);
  await env.DB.prepare('DELETE FROM clan_draft_locks WHERE season_id=? AND expires_at<?').bind(seasonId,iso()).run();
  await env.DB.prepare('INSERT OR IGNORE INTO clan_draft_locks(season_id,token,expires_at) VALUES(?,?,?)').bind(seasonId,token,expiresAt).run();
  const row=await env.DB.prepare('SELECT token FROM clan_draft_locks WHERE season_id=?').bind(seasonId).first();return row?.token===token?{ok:true,seasonId,token}:{ok:false};
}
async function releaseDraftLock(env,lock){if(lock?.ok)await env.DB.prepare('DELETE FROM clan_draft_locks WHERE season_id=? AND token=?').bind(lock.seasonId,lock.token).run()}

async function beginDraft(env,season,{forceMasterUserId=0}={}){
  const scored=await calculateSeasonScores(env,season);if(scored.length<2)return season;
  const teamCount=Math.max(2,Math.ceil(scored.length/CLAN_MAX_MEMBERS)),ranked=[...scored].sort((a,b)=>b.master_score-a.master_score||Number(a.user_id)-Number(b.user_id)),forced=ranked.find(row=>Number(row.user_id)===Number(forceMasterUserId)),masters=(forced?[forced,...ranked.filter(row=>Number(row.user_id)!==Number(forceMasterUserId))]:ranked).slice(0,teamCount);
  const existingOrgs=rows(await env.DB.prepare('SELECT * FROM clan_organizations WHERE is_active=1 ORDER BY trophies DESC,id LIMIT ?').bind(teamCount).all()),statements=[];
  for(let i=existingOrgs.length;i<teamCount;i++)statements.push(env.DB.prepare('INSERT INTO clan_organizations(name,mark_key,primary_color,accent_color,slogan) VALUES(?,?,?,?,?)').bind(`신규 클랜 ${String(i+1).padStart(2,'0')}`,CLAN_MARKS[i%CLAN_MARKS.length],['#31d7e8','#ff556f','#c8ff42','#a87cff'][i%4],'#edfaff','클랜 마스터가 이름과 표식을 설정합니다.'));
  if(statements.length)await env.DB.batch(statements);
  const orgs=rows(await env.DB.prepare('SELECT * FROM clan_organizations WHERE is_active=1 ORDER BY trophies DESC,id LIMIT ?').bind(teamCount).all()),writes=[];
  masters.forEach((master,index)=>{
    const org=orgs[index];writes.push(env.DB.prepare('INSERT OR IGNORE INTO clan_season_teams(season_id,clan_id,master_user_id,draft_position) VALUES(?,?,?,?)').bind(season.id,org.id,master.user_id,index));
    writes.push(env.DB.prepare("UPDATE clan_draft_pool SET status='MASTER',drafted_clan_id=?,pick_no=0,updated_at=CURRENT_TIMESTAMP WHERE season_id=? AND user_id=?").bind(org.id,season.id,master.user_id));
    writes.push(env.DB.prepare("INSERT OR IGNORE INTO clan_members(season_id,clan_id,user_id,member_role,preferred_role,draft_pick_no) VALUES(?,?,?,'MASTER',?,0)").bind(season.id,org.id,master.user_id,cleanRole(master.preferred_role)));
  });
  writes.push(env.DB.prepare("UPDATE clan_seasons SET phase='DRAFT',draft_pick_count=0,next_pick_deadline=?,updated_at=CURRENT_TIMESTAMP WHERE id=? AND phase='REGISTRATION'").bind(iso(Date.now()+300000),season.id));
  await batchChunks(env,writes);return env.DB.prepare('SELECT * FROM clan_seasons WHERE id=?').bind(season.id).first();
}

function cleanRole(value){const role=String(value||'').toUpperCase();return CLAN_ROLES.includes(role)?role:'BALANCED'}
function currentDraftPosition(pickCount,teamCount){const round=Math.floor(pickCount/teamCount),offset=pickCount%teamCount;return round%2===0?offset:teamCount-1-offset}
async function draftContext(env,season){
  const teams=rows(await env.DB.prepare('SELECT t.*,o.name,o.mark_key,o.primary_color,o.accent_color FROM clan_season_teams t JOIN clan_organizations o ON o.id=t.clan_id WHERE t.season_id=? ORDER BY t.draft_position').bind(season.id).all());
  const pickCount=Number(season.draft_pick_count||0),position=currentDraftPosition(pickCount,Math.max(1,teams.length));return{teams,current:teams.find(t=>Number(t.draft_position)===position)||null,pickNo:pickCount+1};
}
async function makeDraftPick(env,season,team,candidate,{auto=false}={}){
  const lock=await acquireDraftLock(env,season.id);if(!lock.ok)throw new Error('다른 클랜의 드래프트 지명이 처리 중입니다. 잠시 후 다시 시도하세요.');
  try{
    const fresh=await env.DB.prepare('SELECT * FROM clan_seasons WHERE id=?').bind(season.id).first();if(fresh?.phase!=='DRAFT')throw new Error('현재 드래프트 단계가 아닙니다.');
    const ctx=await draftContext(env,fresh);if(Number(ctx.current?.clan_id)!==Number(team.clan_id))throw new Error('현재 지명 순서가 아닙니다.');
    const available=await env.DB.prepare("SELECT * FROM clan_draft_pool WHERE season_id=? AND candidate_key=? AND status='AVAILABLE'").bind(season.id,candidate.candidate_key).first();if(!available)throw new Error('이미 지명됐거나 존재하지 않는 후보입니다.');
    const count=await env.DB.prepare('SELECT COUNT(*) count FROM clan_members WHERE season_id=? AND clan_id=?').bind(season.id,team.clan_id).first();if(Number(count?.count||0)>=CLAN_MAX_MEMBERS)throw new Error('클랜 정원이 가득 찼습니다.');
    await env.DB.batch([
      env.DB.prepare("UPDATE clan_draft_pool SET status='DRAFTED',drafted_clan_id=?,pick_no=?,updated_at=CURRENT_TIMESTAMP WHERE season_id=? AND user_id=? AND status='AVAILABLE'").bind(team.clan_id,ctx.pickNo,season.id,available.user_id),
      env.DB.prepare("INSERT OR IGNORE INTO clan_members(season_id,clan_id,user_id,member_role,preferred_role,draft_pick_no) VALUES(?,?,?,'MEMBER',?,?)").bind(season.id,team.clan_id,available.user_id,cleanRole(available.preferred_role),ctx.pickNo),
      env.DB.prepare('UPDATE clan_seasons SET draft_pick_count=draft_pick_count+1,next_pick_deadline=?,updated_at=CURRENT_TIMESTAMP WHERE id=?').bind(iso(Date.now()+300000),season.id)
    ]);
    return{pickNo:ctx.pickNo,auto,userId:Number(available.user_id),clanId:Number(team.clan_id)};
  }finally{await releaseDraftLock(env,lock)}
}

async function createWars(env,season,teams){
  const ordered=[...teams].sort((a,b)=>Number(a.draft_position)-Number(b.draft_position)),writes=[];
  for(let i=0;i+1<ordered.length;i+=2){const a=ordered[i],b=ordered[i+1];writes.push(env.DB.prepare("INSERT OR IGNORE INTO clan_wars(season_id,round_no,clan_a_id,clan_b_id,status,starts_at,ends_at) VALUES(?,1,?,?,'ACTIVE',?,?)").bind(season.id,a.clan_id,b.clan_id,iso(),season.ends_at))}
  if(writes.length)await env.DB.batch(writes);
}
async function activateSeason(env,season){
  const teams=rows(await env.DB.prepare('SELECT * FROM clan_season_teams WHERE season_id=? ORDER BY draft_position').bind(season.id).all());
  await createWars(env,season,teams);await env.DB.prepare("UPDATE clan_seasons SET phase='ACTIVE',starts_at=?,updated_at=CURRENT_TIMESTAMP WHERE id=? AND phase='DRAFT'").bind(iso(),season.id).run();
  return env.DB.prepare('SELECT * FROM clan_seasons WHERE id=?').bind(season.id).first();
}
async function autoDraftDue(env,season,maxPicks=40){
  let fresh=season,picks=0;
  while(fresh.phase==='DRAFT'&&picks<maxPicks){
    const available=await env.DB.prepare("SELECT * FROM clan_draft_pool WHERE season_id=? AND status='AVAILABLE' ORDER BY total_score DESC,user_id LIMIT 1").bind(fresh.id).first();
    if(!available)return activateSeason(env,fresh);
    if(Date.now()<sqlMs(fresh.next_pick_deadline)&&Date.now()<sqlMs(fresh.draft_ends_at))break;
    const ctx=await draftContext(env,fresh);if(!ctx.current)break;await makeDraftPick(env,fresh,ctx.current,available,{auto:true});picks++;fresh=await env.DB.prepare('SELECT * FROM clan_seasons WHERE id=?').bind(fresh.id).first();
  }
  if(fresh.phase==='DRAFT'&&Date.now()>=sqlMs(fresh.draft_ends_at)){
    let available=await env.DB.prepare("SELECT * FROM clan_draft_pool WHERE season_id=? AND status='AVAILABLE' ORDER BY total_score DESC,user_id LIMIT 1").bind(fresh.id).first();
    while(available){const ctx=await draftContext(env,fresh);if(!ctx.current)break;await makeDraftPick(env,fresh,ctx.current,available,{auto:true});fresh=await env.DB.prepare('SELECT * FROM clan_seasons WHERE id=?').bind(fresh.id).first();available=await env.DB.prepare("SELECT * FROM clan_draft_pool WHERE season_id=? AND status='AVAILABLE' ORDER BY total_score DESC,user_id LIMIT 1").bind(fresh.id).first()}
    return activateSeason(env,fresh);
  }
  return fresh;
}
async function advanceLifecycle(env,season){
  let fresh=season;
  if(fresh.phase==='REGISTRATION'&&Date.now()>=sqlMs(fresh.registration_ends_at))fresh=await beginDraft(env,fresh);
  if(fresh.phase==='DRAFT')fresh=await autoDraftDue(env,fresh);
  if(fresh.phase==='ACTIVE'&&Date.now()>=sqlMs(fresh.ends_at)){await env.DB.prepare("UPDATE clan_seasons SET phase='SETTLEMENT',updated_at=CURRENT_TIMESTAMP WHERE id=? AND phase='ACTIVE'").bind(fresh.id).run();fresh=await env.DB.prepare('SELECT * FROM clan_seasons WHERE id=?').bind(fresh.id).first()}
  return fresh;
}

function publicSeason(season){return season?{id:Number(season.id),seasonNo:Number(season.season_no),phase:season.phase,maxMembers:Number(season.max_members||CLAN_MAX_MEMBERS),registrationEndsAt:season.registration_ends_at,draftEndsAt:season.draft_ends_at,startsAt:season.starts_at,endsAt:season.ends_at,nextPickDeadline:season.next_pick_deadline,draftPickCount:Number(season.draft_pick_count||0)}:null}
function publicTeam(row){return row?{clanId:Number(row.clan_id),name:row.name,markKey:row.mark_key,primaryColor:row.primary_color,accentColor:row.accent_color,slogan:row.slogan||'',masterUserId:Number(row.master_user_id),masterNickname:row.master_nickname||'',memberCount:Number(row.member_count||0),score:Number(row.score||0),wins:Number(row.wins||0),losses:Number(row.losses||0),draftPosition:Number(row.draft_position||0)}:null}
async function overview(env,user,season){
  const [verifiedResult,membershipResult,teamsResult]=await env.DB.batch([
    env.DB.prepare("SELECT provider_name,verified_at FROM user_second_verifications WHERE user_id=? AND provider='PLAYDK'").bind(user.id),
    env.DB.prepare(`SELECT m.*,t.master_user_id,t.draft_position,t.score,t.wins,t.losses,o.name,o.mark_key,o.primary_color,o.accent_color,o.slogan
      FROM clan_members m JOIN clan_season_teams t ON t.season_id=m.season_id AND t.clan_id=m.clan_id JOIN clan_organizations o ON o.id=m.clan_id WHERE m.season_id=? AND m.user_id=?`).bind(season.id,user.id),
    env.DB.prepare(`SELECT t.*,o.name,o.mark_key,o.primary_color,o.accent_color,o.slogan,u.nickname master_nickname,(SELECT COUNT(*) FROM clan_members m WHERE m.season_id=t.season_id AND m.clan_id=t.clan_id) member_count
      FROM clan_season_teams t JOIN clan_organizations o ON o.id=t.clan_id JOIN users u ON u.id=t.master_user_id WHERE t.season_id=? ORDER BY t.score DESC,t.wins DESC,t.draft_position`).bind(season.id)
  ]);
  const verified=verifiedResult?.results?.[0]||null,membership=membershipResult?.results?.[0]||null,teams=rows(teamsResult).map(publicTeam),mine=membership?publicTeam({...membership,master_nickname:teams.find(t=>t.clanId===Number(membership.clan_id))?.masterNickname,member_count:teams.find(t=>t.clanId===Number(membership.clan_id))?.memberCount}):null;
  let roster=[],candidates=[],war=null,opponents=[],registration=null,draft=null;
  if(membership){
    roster=rows(await env.DB.prepare(`SELECT m.user_id,u.nickname,m.member_role,m.preferred_role,m.draft_pick_no,m.contribution_score,m.battle_wins,m.battle_losses FROM clan_members m JOIN users u ON u.id=m.user_id WHERE m.season_id=? AND m.clan_id=? ORDER BY CASE WHEN m.member_role='MASTER' THEN 0 ELSE 1 END,m.draft_pick_no,u.nickname`).bind(season.id,membership.clan_id).all()).map(r=>({userId:Number(r.user_id),nickname:r.nickname,memberRole:r.member_role,preferredRole:r.preferred_role,draftPickNo:Number(r.draft_pick_no),contributionScore:Number(r.contribution_score),battleWins:Number(r.battle_wins),battleLosses:Number(r.battle_losses)}));
    if(season.phase==='DRAFT'&&Number(membership.master_user_id)===Number(user.id)){
      const ctx=await draftContext(env,season);draft={isMyTurn:Number(ctx.current?.clan_id)===Number(membership.clan_id),pickNo:ctx.pickNo,currentClan:ctx.current?publicTeam({...ctx.current,member_count:teams.find(t=>t.clanId===Number(ctx.current.clan_id))?.memberCount}):null};
      if(draft.isMyTurn)candidates=rows(await env.DB.prepare("SELECT candidate_key,preferred_role,activity_window,activity_band,rank_band,activity_score,rank_score,contribution_score,reliability_score,total_score FROM clan_draft_pool WHERE season_id=? AND status='AVAILABLE' ORDER BY total_score DESC,user_id LIMIT 80").bind(season.id).all()).map(r=>({candidateKey:r.candidate_key,preferredRole:r.preferred_role,activityWindow:r.activity_window,activityBand:r.activity_band,rankBand:r.rank_band,activityScore:Number(r.activity_score),rankScore:Number(r.rank_score),contributionScore:Number(r.contribution_score),reliabilityScore:Number(r.reliability_score),totalScore:Number(r.total_score)}));
    }
    if(season.phase==='ACTIVE'){
      war=await env.DB.prepare("SELECT * FROM clan_wars WHERE season_id=? AND status='ACTIVE' AND (clan_a_id=? OR clan_b_id=?) ORDER BY round_no,id LIMIT 1").bind(season.id,membership.clan_id,membership.clan_id).first();
      if(war){const enemyClan=Number(war.clan_a_id)===Number(membership.clan_id)?Number(war.clan_b_id):Number(war.clan_a_id);opponents=rows(await env.DB.prepare(`SELECT m.user_id,u.nickname,m.preferred_role,m.battle_wins,m.battle_losses FROM clan_members m JOIN users u ON u.id=m.user_id WHERE m.season_id=? AND m.clan_id=? ORDER BY m.battle_wins DESC,m.draft_pick_no LIMIT 20`).bind(season.id,enemyClan).all()).map(r=>({userId:Number(r.user_id),nickname:r.nickname,preferredRole:r.preferred_role,battleWins:Number(r.battle_wins),battleLosses:Number(r.battle_losses)}));war={id:Number(war.id),roundNo:Number(war.round_no),clanAId:Number(war.clan_a_id),clanBId:Number(war.clan_b_id),scoreA:Number(war.score_a),scoreB:Number(war.score_b),battleCount:Number(war.battle_count),startsAt:war.starts_at,endsAt:war.ends_at};}
    }
  }else registration=await env.DB.prepare('SELECT preferred_role,activity_window,status,registered_at FROM clan_draft_pool WHERE season_id=? AND user_id=?').bind(season.id,user.id).first();
  return{ok:true,season:publicSeason(season),verified:Boolean(verified),verificationName:verified?.provider_name||'',registration:registration?{registered:true,preferredRole:registration.preferred_role,activityWindow:registration.activity_window,status:registration.status,registeredAt:registration.registered_at}:{registered:false},membership:membership?{...mine,memberRole:membership.member_role,isMaster:Number(membership.master_user_id)===Number(user.id)}:null,teams,roster,draft,candidates,war,opponents,battleEngine:{active:true,version:'PROJECT_V_V3',playbackSpeed:1.3},rules:{maxMembers:CLAN_MAX_MEMBERS,noFixedRoster:true,blindDraft:true,snakeDraft:true,identityPersists:true,queryPolicy:'SNAPSHOT_NO_VIEW_LOGS'},serverNow:iso()};
}

async function register(env,deps,user,season,body){
  if(season.phase!=='REGISTRATION')return deps.json({error:'현재는 클랜 시즌 참가 신청 기간이 아닙니다.'},409);
  const verified=await env.DB.prepare("SELECT 1 ok FROM user_second_verifications WHERE user_id=? AND provider='PLAYDK'").bind(user.id).first();if(!verified)return deps.json({error:'PLAY DK 2차 인증을 완료한 계정만 클랜 시즌에 참가할 수 있습니다.'},403);
  const deck=await deps.pvpDeckSnapshot(env,user.id);if(deck.length!==5)return deps.json({error:'클랜전은 V3 전투를 사용합니다. 랭크전 덱 5장을 먼저 편성하세요.'},400);
  const preferredRole=cleanRole(body.preferredRole),activityWindow=['MORNING','DAY','EVENING','NIGHT','FLEX'].includes(String(body.activityWindow||'').toUpperCase())?String(body.activityWindow).toUpperCase():'FLEX',existing=await env.DB.prepare('SELECT * FROM clan_draft_pool WHERE season_id=? AND user_id=?').bind(season.id,user.id).first(),deckJson=JSON.stringify(deck.map(card=>String(card.id)));
  if(existing&&existing.preferred_role===preferredRole&&existing.activity_window===activityWindow&&existing.deck_snapshot===deckJson)return deps.json({ok:true,unchanged:true,state:await overview(env,user,season)});
  await env.DB.prepare(`INSERT INTO clan_draft_pool(season_id,user_id,candidate_key,preferred_role,activity_window,deck_snapshot,status,updated_at) VALUES(?,?,?,?,?,?,'AVAILABLE',CURRENT_TIMESTAMP)
    ON CONFLICT(season_id,user_id) DO UPDATE SET preferred_role=excluded.preferred_role,activity_window=excluded.activity_window,deck_snapshot=excluded.deck_snapshot,updated_at=CURRENT_TIMESTAMP`).bind(season.id,user.id,existing?.candidate_key||crypto.randomUUID(),preferredRole,activityWindow,deckJson).run();
  return deps.json({ok:true,state:await overview(env,user,season)});
}

async function updateIdentity(env,deps,user,season,body){
  const team=await env.DB.prepare('SELECT * FROM clan_season_teams WHERE season_id=? AND master_user_id=?').bind(season.id,user.id).first();if(!team)return deps.json({error:'이번 시즌 클랜 마스터만 클랜 정보를 변경할 수 있습니다.'},403);
  const name=cleanText(body.name,16),slogan=cleanText(body.slogan,60),mark=CLAN_MARKS.includes(String(body.markKey||'').toUpperCase())?String(body.markKey).toUpperCase():'SHIELD',color=value=>/^#[0-9a-f]{6}$/i.test(String(value||''))?String(value).toLowerCase():null,primary=color(body.primaryColor)||'#31d7e8',accent=color(body.accentColor)||'#e4f8ff';
  if(name.length<2)return deps.json({error:'클랜 이름은 2자 이상 입력하세요.'},400);
  try{await env.DB.prepare('UPDATE clan_organizations SET name=?,mark_key=?,primary_color=?,accent_color=?,slogan=?,updated_at=CURRENT_TIMESTAMP WHERE id=?').bind(name,mark,primary,accent,slogan,team.clan_id).run()}catch(error){if(/unique|duplicate/i.test(String(error?.message||'')))return deps.json({error:'이미 사용 중인 클랜 이름입니다.'},409);throw error}
  return deps.json({ok:true,state:await overview(env,user,season)});
}

async function buildClanBattle(env,deps,attackerUser,defenderUser,attackerPool,defenderPool,seed){
  const battle=await deps.battleSettings(env),[aCardsRaw,dCardsRaw]=await Promise.all([deps.pvpDeckSnapshotByIds(env,attackerUser.id,safeJson(attackerPool.deck_snapshot,[])),deps.pvpDeckSnapshotByIds(env,defenderUser.id,safeJson(defenderPool.deck_snapshot,[]))]);
  if(aCardsRaw.length!==5)throw new Error('내 클랜전 덱 5장을 불러오지 못했습니다. 다음 시즌 신청에서 덱을 갱신하세요.');if(dCardsRaw.length!==5)throw new Error('상대 클랜원의 전투 덱이 완성되지 않았습니다.');
  const aCards=aCardsRaw.map(card=>({...card,id:String(card.id),power:deps.cardBattlePower(card,card.breakthrough_level,battle)})),dCards=dCardsRaw.map(card=>({...card,id:String(card.id),power:deps.cardBattlePower(card,card.breakthrough_level,battle)})),aIds=aCards.map(c=>String(c.id)),dIds=dCards.map(c=>String(c.id));
  const [unique,aBonus,dBonus,aSynergy,dSynergy,aMagic,dMagic]=await Promise.all([
    deps.cardUniqueDeckStates(env,[{user:attackerUser,cards:aCards},{user:defenderUser,cards:dCards}],'PVP'),deps.userEquipmentBonuses(env,attackerUser.id),deps.userEquipmentBonuses(env,defenderUser.id),deps.evaluateDeckSynergies(env,attackerUser,aIds,'PVP',{forceOwnerTest:String(attackerUser.role||'').toUpperCase()==='OWNER'}),deps.evaluateDeckSynergies(env,defenderUser,dIds,'PVP',{forceOwnerTest:String(defenderUser.role||'').toUpperCase()==='OWNER'}),deps.magicBattleLoadout(env,attackerUser,'PVP'),deps.magicBattleLoadout(env,defenderUser,'PVP')
  ]);
  const [aUnique,dUnique]=unique,aMap=new Map((aUnique?.cards||[]).map(c=>[String(c.id),c.uniqueAbility||null])),dMap=new Map((dUnique?.cards||[]).map(c=>[String(c.id),c.uniqueAbility||null])),aMult=1+Number(aSynergy?.totals?.attackPercent||0)/100,dMult=1+Number(dSynergy?.totals?.attackPercent||0)/100;
  const attackerDeck=aCards.map(c=>({...c,power:Math.max(1,Math.floor(Number(c.power||0)*aMult)),uniqueAbility:aMap.get(String(c.id))||c.uniqueAbility||null})),defenderDeck=dCards.map(c=>({...c,power:Math.max(1,Math.floor(Number(c.power||0)*dMult)),uniqueAbility:dMap.get(String(c.id))||c.uniqueAbility||null}));
  const battleV2=deps.createPvpBattleV2({attackerCards:attackerDeck,defenderCards:defenderDeck,attackerMagicCards:aMagic?.cards||[],defenderMagicCards:dMagic?.cards||[],attackerEquipmentBonus:Number(aBonus?.pvp||0),defenderEquipmentBonus:Number(dBonus?.pvp||0),seed,singleHealerBonus:battle?.engine?.singleHealerBonus});
  return{battleV2,attackerDeck,defenderDeck,attackerPower:Number(battleV2.teams?.A?.summary?.power||0),defenderPower:Number(battleV2.teams?.B?.summary?.power||0)};
}

async function fight(env,deps,user,season,body){
  if(season.phase!=='ACTIVE')return deps.json({error:'클랜전 진행 기간이 아닙니다.'},409);const requestId=validRequestId(body.requestId);if(!requestId)return deps.json({error:'전투 요청 키가 올바르지 않습니다.'},400);
  const mine=await env.DB.prepare('SELECT * FROM clan_members WHERE season_id=? AND user_id=?').bind(season.id,user.id).first();if(!mine)return deps.json({error:'이번 시즌 클랜 소속이 아닙니다.'},403);
  const war=await env.DB.prepare("SELECT * FROM clan_wars WHERE season_id=? AND status='ACTIVE' AND (clan_a_id=? OR clan_b_id=?) ORDER BY round_no,id LIMIT 1").bind(season.id,mine.clan_id,mine.clan_id).first();if(!war)return deps.json({error:'현재 배정된 클랜전 상대가 없습니다.'},409);
  const enemyClan=Number(war.clan_a_id)===Number(mine.clan_id)?Number(war.clan_b_id):Number(war.clan_a_id),targetId=Number(body.targetUserId||0),defender=targetId?await env.DB.prepare(`SELECT m.*,u.nickname,u.role FROM clan_members m JOIN users u ON u.id=m.user_id WHERE m.season_id=? AND m.clan_id=? AND m.user_id=?`).bind(season.id,enemyClan,targetId).first():await env.DB.prepare(`SELECT m.*,u.nickname,u.role FROM clan_members m JOIN users u ON u.id=m.user_id WHERE m.season_id=? AND m.clan_id=? ORDER BY m.battle_wins-m.battle_losses,m.draft_pick_no LIMIT 1`).bind(season.id,enemyClan).first();if(!defender)return deps.json({error:'공격할 상대 클랜원을 찾지 못했습니다.'},404);
  let receipt=await env.DB.prepare('SELECT * FROM clan_war_battles WHERE request_id=?').bind(requestId).first();
  if(receipt&&Number(receipt.attacker_user_id)!==Number(user.id))return deps.json({error:'다른 전투에 사용된 요청 키입니다.'},409);
  const seed=receipt?Number(receipt.battle_seed):seedOf(`${season.id}:${war.id}:${requestId}:CLAN_V3`),attackerPool=await env.DB.prepare('SELECT deck_snapshot FROM clan_draft_pool WHERE season_id=? AND user_id=?').bind(season.id,user.id).first(),defenderPool=await env.DB.prepare('SELECT deck_snapshot FROM clan_draft_pool WHERE season_id=? AND user_id=?').bind(season.id,defender.user_id).first();
  if(!receipt){await env.DB.prepare("INSERT OR IGNORE INTO clan_war_battles(request_id,season_id,war_id,attacker_clan_id,defender_clan_id,attacker_user_id,defender_user_id,battle_seed,status) VALUES(?,?,?,?,?,?,?,?,'PENDING')").bind(requestId,season.id,war.id,mine.clan_id,enemyClan,user.id,defender.user_id,seed).run();receipt=await env.DB.prepare('SELECT * FROM clan_war_battles WHERE request_id=?').bind(requestId).first()}
  if(receipt?.status==='FAILED'){
    await env.DB.prepare("UPDATE clan_war_battles SET status='PENDING',error_message=NULL,updated_at=CURRENT_TIMESTAMP WHERE id=? AND status='FAILED'").bind(receipt.id).run();
    receipt={...receipt,status:'PENDING',error_message:null};
  }
  try{
    const defenderUser={id:Number(defender.user_id),nickname:defender.nickname,role:defender.role},simulation=await buildClanBattle(env,deps,user,defenderUser,attackerPool,defenderPool,seed),won=simulation.battleV2?.result?.winner==='A',winnerClan=won?Number(mine.clan_id):enemyClan;
    if(receipt.status!=='COMPLETED'){
      const scoreColumn=Number(war.clan_a_id)===winnerClan?'score_a':'score_b';await env.DB.batch([
        env.DB.prepare(`UPDATE clan_wars SET ${scoreColumn}=${scoreColumn}+1,battle_count=battle_count+1,updated_at=CURRENT_TIMESTAMP WHERE id=?`).bind(war.id),
        env.DB.prepare(`UPDATE clan_members SET ${won?'battle_wins':'battle_losses'}=${won?'battle_wins':'battle_losses'}+1,contribution_score=contribution_score+1,updated_at=CURRENT_TIMESTAMP WHERE season_id=? AND user_id=?`).bind(season.id,user.id),
        env.DB.prepare('UPDATE clan_season_teams SET score=score+?,wins=wins+?,losses=losses+?,updated_at=CURRENT_TIMESTAMP WHERE season_id=? AND clan_id=?').bind(won?3:0,won?1:0,won?0:1,season.id,mine.clan_id),
        env.DB.prepare("UPDATE clan_war_battles SET status='COMPLETED',winner_clan_id=?,result_json=?,error_message=NULL,updated_at=CURRENT_TIMESTAMP WHERE id=? AND status='PENDING'").bind(winnerClan,JSON.stringify({winner:won?'ATTACKER':'DEFENDER',reason:simulation.battleV2?.result?.reason||'',actions:Number(simulation.battleV2?.result?.actions||0)}),receipt.id)
      ]);
    }
    // 영구 전투 로그를 쌓지 않는다. 시즌 운영에 불필요한 30일 초과 영수증은 전투 요청 때 최대 200건만 정리한다.
    await env.DB.prepare("DELETE FROM clan_war_battles WHERE id IN (SELECT id FROM clan_war_battles WHERE updated_at<datetime('now','-30 days') ORDER BY id LIMIT 200)").run();
    return deps.json({ok:true,result:won?'WIN':'LOSE',battleEngine:{active:true,version:'PROJECT_V_V3',playbackSpeed:1.3},battleV2:simulation.battleV2,attackerDeck:simulation.attackerDeck,defenderDeck:simulation.defenderDeck,attackerPower:simulation.attackerPower,defenderPower:simulation.defenderPower,opponent:{id:Number(defender.user_id),nickname:defender.nickname},clanWar:{id:Number(war.id),winnerClanId:winnerClan}});
  }catch(error){await env.DB.prepare("UPDATE clan_war_battles SET status='FAILED',error_message=?,updated_at=CURRENT_TIMESTAMP WHERE id=? AND status='PENDING'").bind(String(error?.message||error).slice(0,240),receipt.id).run();return deps.json({error:error.message||'클랜전 V3 전투를 구성하지 못했습니다.'},409)}
}

export async function handleClan({path,request,env,deps}){
  if(!String(path).startsWith('clan'))return null;await ensureFoundation(env);const user=await deps.authenticate(request,env);if(!user)return deps.json({error:'로그인이 필요합니다.'},401);const settings=await clanSettings(env),owner=String(user.role||'').toUpperCase()==='OWNER';
  if(path==='clan/admin/mode'&&request.method==='POST'){
    if(!owner)return deps.json({error:'OWNER 권한이 필요합니다.'},403);const body=await deps.readBody(request),mode=String(body.mode||'').toUpperCase();if(!['OFF','TEST','ON'].includes(mode))return deps.json({error:'클랜 공개 상태는 OFF, TEST, ON 중 하나여야 합니다.'},400);await env.DB.prepare("INSERT INTO app_meta(key,value,updated_at) VALUES('clan_settings_v1',?,CURRENT_TIMESTAMP) ON CONFLICT(key) DO UPDATE SET value=excluded.value,updated_at=CURRENT_TIMESTAMP").bind(JSON.stringify({mode})).run();return deps.json({ok:true,mode});
  }
  if(settings.mode==='OFF'||(settings.mode==='TEST'&&!owner))return deps.json({error:'클랜 시스템은 OWNER 사전 테스트 중입니다.',code:'CLAN_TEST_ONLY',mode:settings.mode},404);
  let season=await createSeason(env);season=await advanceLifecycle(env,season);
  if(path==='clan/admin/test-bootstrap'&&request.method==='POST'){
    if(!owner||settings.mode!=='TEST')return deps.json({error:'TEST 상태의 OWNER만 테스트 편성을 구성할 수 있습니다.'},403);if(season.phase!=='REGISTRATION')return deps.json({error:'참가 신청 단계에서만 테스트 풀을 구성할 수 있습니다.'},409);
    const body=await deps.readBody(request),limit=clampInt(body.limit,4,40,20),eligible=rows(await env.DB.prepare("SELECT u.id,u.nickname,d.card_ids FROM user_second_verifications s JOIN users u ON u.id=s.user_id JOIN pvp_decks d ON d.user_id=u.id WHERE s.provider='PLAYDK' ORDER BY CASE WHEN u.id=? THEN 0 ELSE 1 END,u.last_login_at DESC,u.id LIMIT 100").bind(user.id).all()).filter(row=>{const ids=safeJson(row.card_ids,[]);return Array.isArray(ids)&&ids.length===5}).slice(0,limit);
    if(eligible.length<4)return deps.json({error:'V3 테스트에 사용할 PLAY DK 인증·랭크전 덱 계정이 최소 4명 필요합니다.'},409);
    const statements=eligible.map(row=>env.DB.prepare("INSERT OR IGNORE INTO clan_draft_pool(season_id,user_id,candidate_key,preferred_role,activity_window,deck_snapshot,status) VALUES(?,?,?,?,?,?,'AVAILABLE')").bind(season.id,row.id,crypto.randomUUID(),CLAN_ROLES[Number(row.id)%CLAN_ROLES.length],['MORNING','DAY','EVENING','NIGHT','FLEX'][Number(row.id)%5],row.card_ids));await batchChunks(env,statements);season=await beginDraft(env,season,{forceMasterUserId:user.id});return deps.json({ok:true,seeded:eligible.length,state:await overview(env,user,season)});
  }
  if(path==='clan/admin/test-activate'&&request.method==='POST'){
    if(!owner||settings.mode!=='TEST')return deps.json({error:'TEST 상태의 OWNER만 테스트 시즌을 개막할 수 있습니다.'},403);if(season.phase!=='DRAFT')return deps.json({error:'드래프트 단계에서만 자동 편성을 완료할 수 있습니다.'},409);
    let fresh=season,candidate=await env.DB.prepare("SELECT * FROM clan_draft_pool WHERE season_id=? AND status='AVAILABLE' ORDER BY total_score DESC,user_id LIMIT 1").bind(fresh.id).first();while(candidate){const ctx=await draftContext(env,fresh);if(!ctx.current)break;await makeDraftPick(env,fresh,ctx.current,candidate,{auto:true});fresh=await env.DB.prepare('SELECT * FROM clan_seasons WHERE id=?').bind(fresh.id).first();candidate=await env.DB.prepare("SELECT * FROM clan_draft_pool WHERE season_id=? AND status='AVAILABLE' ORDER BY total_score DESC,user_id LIMIT 1").bind(fresh.id).first()}season=await activateSeason(env,fresh);return deps.json({ok:true,state:await overview(env,user,season)});
  }
  if(path==='clan/overview'&&request.method==='GET')return deps.json({...await overview(env,user,season),mode:settings.mode});
  if(path==='clan/register'&&request.method==='POST')return register(env,deps,user,season,await deps.readBody(request));
  if(path==='clan/identity'&&request.method==='POST')return updateIdentity(env,deps,user,season,await deps.readBody(request));
  if(path==='clan/draft/pick'&&request.method==='POST'){
    if(season.phase!=='DRAFT')return deps.json({error:'현재 드래프트 기간이 아닙니다.'},409);const body=await deps.readBody(request),team=await env.DB.prepare('SELECT * FROM clan_season_teams WHERE season_id=? AND master_user_id=?').bind(season.id,user.id).first();if(!team)return deps.json({error:'이번 시즌 클랜 마스터만 지명할 수 있습니다.'},403);const candidate=await env.DB.prepare("SELECT * FROM clan_draft_pool WHERE season_id=? AND candidate_key=? AND status='AVAILABLE'").bind(season.id,String(body.candidateKey||'')).first();if(!candidate)return deps.json({error:'선택한 후보를 지명할 수 없습니다.'},409);try{await makeDraftPick(env,season,team,candidate);season=await env.DB.prepare('SELECT * FROM clan_seasons WHERE id=?').bind(season.id).first();const left=await env.DB.prepare("SELECT COUNT(*) count FROM clan_draft_pool WHERE season_id=? AND status='AVAILABLE'").bind(season.id).first();if(!Number(left?.count||0))season=await activateSeason(env,season);return deps.json({ok:true,state:await overview(env,user,season)})}catch(error){return deps.json({error:error.message},409)}
  }
  if(path==='clan/war/fight'&&request.method==='POST')return fight(env,deps,user,season,await deps.readBody(request));
  return deps.json({error:'요청한 클랜 기능을 찾을 수 없습니다.'},404);
}

export const __clanTest={normalizeScores,currentDraftPosition,cleanRole,publicSeason,CLAN_MAX_MEMBERS,FOUNDATION_SQL};
