const CLAN_FOUNDATION_VERSION='safe_runtime_upgrade_v1820_clan_v1';
const CLAN_OFFICIAL_CATALOG_VERSION='safe_runtime_upgrade_v1882_clan_official_catalog_v1';
const CLAN_COMPETITION_UPGRADE_VERSION='safe_runtime_upgrade_v1883_clan_competition_safety_v1';
const CLAN_MAX_MEMBERS=20;
const OFFICIAL_CLAN_CATALOG=Object.freeze([
  Object.freeze({name:'DK',markKey:'DK',primaryColor:'#2f7cff',accentColor:'#d8e8ff'}),
  Object.freeze({name:'삼성',markKey:'SAMSUNG',primaryColor:'#3c74c9',accentColor:'#e7f2ff'}),
  Object.freeze({name:'T1',markKey:'T1',primaryColor:'#d32f4a',accentColor:'#f6d37a'}),
  Object.freeze({name:'한화',markKey:'HANWHA',primaryColor:'#f1781f',accentColor:'#ffe3a1'}),
  Object.freeze({name:'LG',markKey:'LG',primaryColor:'#d64192',accentColor:'#f4dbea'}),
  Object.freeze({name:'롯데',markKey:'LOTTE',primaryColor:'#7b2445',accentColor:'#f0d28e'}),
  Object.freeze({name:'FM',markKey:'FM',primaryColor:'#1dad72',accentColor:'#e9d07a'}),
  Object.freeze({name:'DC',markKey:'DC',primaryColor:'#7b4ae2',accentColor:'#62d9ff'})
]);
const CLAN_MARKS=Object.freeze(OFFICIAL_CLAN_CATALOG.map(clan=>clan.markKey));
const OFFICIAL_CLAN_ORDER_SQL=`CASE mark_key ${CLAN_MARKS.map((mark,index)=>`WHEN '${mark}' THEN ${index+1}`).join(' ')} ELSE 99 END`;
const CLAN_ROLES=Object.freeze(['ATTACK','DEFENSE','SPEED','HP','BALANCED']);
const CLAN_MAX_PARTICIPANTS=OFFICIAL_CLAN_CATALOG.length*CLAN_MAX_MEMBERS;
const CLAN_ATTACKS_PER_WAR=3;
const CLAN_DEFENSES_PER_TARGET=3;
const CLAN_REPEAT_TARGET_LIMIT=1;
const CLAN_ADMIN_SETTINGS_KEY='clan_settings_v1';
const CLAN_ADMIN_SETTINGS_DEFAULTS=Object.freeze({
  mode:'TEST',scheduleEnabled:true,timezone:'Asia/Seoul',warOpenTime:'21:00',warDurationMinutes:60,openDays:Object.freeze([0,1,2,3,4,5,6]),fixedOpponentPerWindow:true,
  initialEnergy:5,energyCap:10,energyRecoverySeconds:180,attackEnergyCost:1,totalUseLimit:10,defensesPerTarget:10,repeatTargetLimit:1,
  powerMatchEnabled:true,powerMatchTolerancePct:10,powerMatchFallback:'NEAREST_LOWEST_DEFENSE',powerSnapshot:'RANKED_DECK_5',
  maxClans:8,maxMembers:20,maxParticipants:160,registrationDays:7,draftDays:3,draftPickSeconds:300,seasonDays:28,
  blindDraft:true,snakeDraft:true,noFixedRoster:true,identityPersists:true,
  warWinScore:1,seasonWinScore:3,seasonLossScore:0,playbackSpeed:1.3,battleReceiptRetentionDays:30,
  rewardsEnabled:false,winnerCoin:0,runnerUpCoin:0,participationCoin:0,participationShards:0
});
const CLAN_ADMIN_FALLBACKS=Object.freeze(['NEAREST_LOWEST_DEFENSE','NEAREST_POWER','LOWEST_DEFENSE']);

let foundationReady=false,officialCatalogReady=false,competitionUpgradeReady=false;

function iso(ms=Date.now()){return new Date(ms).toISOString()}
function safeJson(value,fallback={}){try{return JSON.parse(value||'')}catch{return fallback}}
function clamp(value,min,max,fallback=min){const n=Number(value);return Number.isFinite(n)?Math.max(min,Math.min(max,n)):fallback}
function clampInt(value,min,max,fallback=min){return Math.round(clamp(value,min,max,fallback))}
function cleanBoolean(value,fallback=true){if(value===undefined||value===null)return fallback;if(typeof value==='string'){const clean=value.trim().toLowerCase();if(['false','0','off','no'].includes(clean))return false;if(['true','1','on','yes'].includes(clean))return true}return Boolean(value)}
function cleanText(value,max=30){return String(value??'').replace(/[<>&"'`]/g,'').replace(/\s+/g,' ').trim().slice(0,max)}
function isOwner(user){return String(user?.role||'').trim().toUpperCase()==='OWNER'}
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

async function ensureOfficialClanCatalog(env){
  if(officialCatalogReady)return;
  const marker=await env.DB.prepare('SELECT value FROM app_meta WHERE key=?').bind(CLAN_OFFICIAL_CATALOG_VERSION).first();
  if(marker){officialCatalogReady=true;return}
  const currentSeason=await env.DB.prepare("SELECT id FROM clan_seasons WHERE phase<>'COMPLETE' ORDER BY season_no DESC LIMIT 1").first();
  const seasonOrgs=currentSeason?rows(await env.DB.prepare(`SELECT o.* FROM clan_season_teams t JOIN clan_organizations o ON o.id=t.clan_id
    WHERE t.season_id=? ORDER BY t.draft_position LIMIT ?`).bind(currentSeason.id,OFFICIAL_CLAN_CATALOG.length).all()):[];
  const allOrgs=rows(await env.DB.prepare('SELECT * FROM clan_organizations ORDER BY is_active DESC,id').all()),seen=new Set(),slots=[];
  for(const org of [...seasonOrgs,...allOrgs]){const id=Number(org.id);if(!id||seen.has(id))continue;seen.add(id);slots.push(org);if(slots.length===OFFICIAL_CLAN_CATALOG.length)break}
  for(let index=slots.length;index<OFFICIAL_CLAN_CATALOG.length;index++){
    const placeholder=`__official_clan_slot_${index+1}_${Date.now()}`;
    await env.DB.prepare('INSERT INTO clan_organizations(name,mark_key,primary_color,accent_color,slogan,is_active) VALUES(?,?,?,?,?,1)').bind(placeholder,`SLOT_${index+1}`,'#34495e','#ecf0f1','').run();
    slots.push(await env.DB.prepare('SELECT * FROM clan_organizations WHERE name=?').bind(placeholder).first());
  }
  const officialNames=OFFICIAL_CLAN_CATALOG.map(clan=>clan.name),namePlaceholders=officialNames.map(()=>'?').join(','),conflicts=rows(await env.DB.prepare(`SELECT id FROM clan_organizations WHERE name IN (${namePlaceholders})`).bind(...officialNames).all());
  await batchChunks(env,conflicts.map(org=>env.DB.prepare('UPDATE clan_organizations SET name=?,updated_at=CURRENT_TIMESTAMP WHERE id=?').bind(`__legacy_clan_${org.id}_${Date.now()}`,org.id)));
  await batchChunks(env,slots.map((org,index)=>{const clan=OFFICIAL_CLAN_CATALOG[index];return env.DB.prepare('UPDATE clan_organizations SET name=?,mark_key=?,primary_color=?,accent_color=?,is_active=1,updated_at=CURRENT_TIMESTAMP WHERE id=?').bind(clan.name,clan.markKey,clan.primaryColor,clan.accentColor,org.id)}));
  const slotIds=slots.map(org=>Number(org.id)),slotPlaceholders=slotIds.map(()=>'?').join(',');
  await env.DB.prepare(`UPDATE clan_organizations SET is_active=0,updated_at=CURRENT_TIMESTAMP WHERE id NOT IN (${slotPlaceholders})`).bind(...slotIds).run();
  await env.DB.prepare('INSERT INTO app_meta(key,value,updated_at) VALUES(?,?,CURRENT_TIMESTAMP) ON CONFLICT(key) DO UPDATE SET value=excluded.value,updated_at=CURRENT_TIMESTAMP').bind(CLAN_OFFICIAL_CATALOG_VERSION,iso()).run();
  officialCatalogReady=true;
}

async function ensureCompetitionUpgrade(env){
  if(competitionUpgradeReady)return;
  const marker=await env.DB.prepare('SELECT value FROM app_meta WHERE key=?').bind(CLAN_COMPETITION_UPGRADE_VERSION).first();
  if(!marker){
    const postgres=env.DB?.dialect==='postgres',idType=postgres?'BIGINT':'INTEGER',nowDefault=postgres?'sqlite_now()':'CURRENT_TIMESTAMP',statements=[`CREATE TABLE IF NOT EXISTS clan_season_settlements(
      season_id ${idType} PRIMARY KEY,champion_clan_id ${idType},status TEXT NOT NULL DEFAULT 'PENDING',processing_token TEXT,reward_status TEXT NOT NULL DEFAULT 'DISABLED_TEST',
      created_at TEXT NOT NULL DEFAULT ${nowDefault},updated_at TEXT NOT NULL DEFAULT ${nowDefault},completed_at TEXT)`,
      'CREATE INDEX IF NOT EXISTS idx_clan_settlements_status ON clan_season_settlements(status,updated_at,season_id)'];
    if(postgres&&typeof env.DB.execSchema==='function')await env.DB.execSchema(statements);else await env.DB.batch(statements.map(sql=>env.DB.prepare(sql)));
    await env.DB.prepare('INSERT INTO app_meta(key,value,updated_at) VALUES(?,?,CURRENT_TIMESTAMP) ON CONFLICT(key) DO UPDATE SET value=excluded.value,updated_at=CURRENT_TIMESTAMP').bind(CLAN_COMPETITION_UPGRADE_VERSION,iso()).run();
  }
  competitionUpgradeReady=true;
}

async function ensureFoundation(env){
  if(!foundationReady){
    await env.DB.prepare('CREATE TABLE IF NOT EXISTS app_meta(key TEXT PRIMARY KEY,value TEXT,updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)').run();
    const marker=await env.DB.prepare('SELECT value FROM app_meta WHERE key=?').bind(CLAN_FOUNDATION_VERSION).first();
    if(!marker){
      await batchChunks(env,FOUNDATION_SQL,25);
      await env.DB.prepare("INSERT OR IGNORE INTO app_meta(key,value,updated_at) VALUES('clan_settings_v1',?,CURRENT_TIMESTAMP)").bind(JSON.stringify({mode:'TEST'})).run();
      await env.DB.prepare('INSERT INTO app_meta(key,value,updated_at) VALUES(?,?,CURRENT_TIMESTAMP) ON CONFLICT(key) DO UPDATE SET value=excluded.value,updated_at=CURRENT_TIMESTAMP').bind(CLAN_FOUNDATION_VERSION,iso()).run();
    }
    foundationReady=true;
  }
  await ensureOfficialClanCatalog(env);
  await ensureCompetitionUpgrade(env);
}

function cleanClock(value,fallback='21:00'){const match=String(value||'').trim().match(/^(\d{1,2}):(\d{2})$/);if(!match)return fallback;const hour=Number(match[1]),minute=Number(match[2]);return hour>=0&&hour<=23&&minute>=0&&minute<=59?`${String(hour).padStart(2,'0')}:${String(minute).padStart(2,'0')}`:fallback}
function cleanClanAdminSettings(raw={},current=CLAN_ADMIN_SETTINGS_DEFAULTS){
  const base={...CLAN_ADMIN_SETTINGS_DEFAULTS,...current},mode=String(raw.mode??base.mode).toUpperCase(),fallback=String(raw.powerMatchFallback??base.powerMatchFallback).toUpperCase(),days=Array.isArray(raw.openDays)?[...new Set(raw.openDays.map(Number).filter(day=>Number.isInteger(day)&&day>=0&&day<=6))].sort((a,b)=>a-b):[...base.openDays];
  const energyCap=clampInt(raw.energyCap,1,30,base.energyCap),initialEnergy=clampInt(raw.initialEnergy,1,energyCap,Math.min(base.initialEnergy,energyCap)),totalUseLimit=clampInt(raw.totalUseLimit,initialEnergy,50,Math.max(base.totalUseLimit,initialEnergy));
  return{
    mode:['OFF','TEST','ON'].includes(mode)?mode:base.mode,scheduleEnabled:cleanBoolean(raw.scheduleEnabled,base.scheduleEnabled),timezone:'Asia/Seoul',warOpenTime:cleanClock(raw.warOpenTime,base.warOpenTime),warDurationMinutes:clampInt(raw.warDurationMinutes,15,180,base.warDurationMinutes),openDays:days.length?days:[...base.openDays],fixedOpponentPerWindow:cleanBoolean(raw.fixedOpponentPerWindow,base.fixedOpponentPerWindow),
    initialEnergy,energyCap,energyRecoverySeconds:clampInt(raw.energyRecoverySeconds,30,3600,base.energyRecoverySeconds),attackEnergyCost:clampInt(raw.attackEnergyCost,1,10,base.attackEnergyCost),totalUseLimit,defensesPerTarget:clampInt(raw.defensesPerTarget,1,50,base.defensesPerTarget),repeatTargetLimit:clampInt(raw.repeatTargetLimit,1,10,base.repeatTargetLimit),
    powerMatchEnabled:cleanBoolean(raw.powerMatchEnabled,base.powerMatchEnabled),powerMatchTolerancePct:clampInt(raw.powerMatchTolerancePct,1,100,base.powerMatchTolerancePct),powerMatchFallback:CLAN_ADMIN_FALLBACKS.includes(fallback)?fallback:base.powerMatchFallback,powerSnapshot:'RANKED_DECK_5',
    maxClans:OFFICIAL_CLAN_CATALOG.length,maxMembers:CLAN_MAX_MEMBERS,maxParticipants:CLAN_MAX_PARTICIPANTS,registrationDays:clampInt(raw.registrationDays,1,30,base.registrationDays),draftDays:clampInt(raw.draftDays,1,14,base.draftDays),draftPickSeconds:clampInt(raw.draftPickSeconds,30,1800,base.draftPickSeconds),seasonDays:clampInt(raw.seasonDays,7,90,base.seasonDays),
    blindDraft:true,snakeDraft:true,noFixedRoster:true,identityPersists:true,
    warWinScore:clampInt(raw.warWinScore,1,20,base.warWinScore),seasonWinScore:clampInt(raw.seasonWinScore,0,100,base.seasonWinScore),seasonLossScore:clampInt(raw.seasonLossScore,0,100,base.seasonLossScore),playbackSpeed:clamp(raw.playbackSpeed,.5,3,base.playbackSpeed),battleReceiptRetentionDays:clampInt(raw.battleReceiptRetentionDays,1,180,base.battleReceiptRetentionDays),
    rewardsEnabled:false,winnerCoin:clampInt(raw.winnerCoin,0,100000000,base.winnerCoin),runnerUpCoin:clampInt(raw.runnerUpCoin,0,100000000,base.runnerUpCoin),participationCoin:clampInt(raw.participationCoin,0,100000000,base.participationCoin),participationShards:clampInt(raw.participationShards,0,1000000,base.participationShards)
  };
}
async function clanSettings(env){const row=await env.DB.prepare('SELECT value FROM app_meta WHERE key=?').bind(CLAN_ADMIN_SETTINGS_KEY).first(),raw=safeJson(row?.value,{});return cleanClanAdminSettings(raw)}

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
  const teamCount=Math.min(OFFICIAL_CLAN_CATALOG.length,Math.max(2,Math.ceil(scored.length/CLAN_MAX_MEMBERS))),ranked=[...scored].sort((a,b)=>b.master_score-a.master_score||Number(a.user_id)-Number(b.user_id)),forced=ranked.find(row=>Number(row.user_id)===Number(forceMasterUserId)),masters=(forced?[forced,...ranked.filter(row=>Number(row.user_id)!==Number(forceMasterUserId))]:ranked).slice(0,teamCount);
  const orgs=rows(await env.DB.prepare(`SELECT * FROM clan_organizations WHERE is_active=1 ORDER BY ${OFFICIAL_CLAN_ORDER_SQL},id LIMIT ?`).bind(teamCount).all()),writes=[];
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
function warWinnerClanId(war){const a=Number(war?.score_a||0),b=Number(war?.score_b||0),aId=Number(war?.clan_a_id||0),bId=Number(war?.clan_b_id||0);return a===b?Math.min(aId,bId):(a>b?aId:bId)}
async function settleSeason(env,season){
  const settleLock=await acquireDraftLock(env,season.id);if(!settleLock.ok)return env.DB.prepare('SELECT * FROM clan_seasons WHERE id=?').bind(season.id).first();
  try{
    await env.DB.prepare("UPDATE clan_war_battles SET status='FAILED',error_message='STALE_RESOLUTION_RECOVERED',updated_at=CURRENT_TIMESTAMP WHERE season_id=? AND status='RESOLVING' AND updated_at<datetime('now','-60 seconds')").bind(season.id).run();
    const resolving=await env.DB.prepare("SELECT COUNT(*) count FROM clan_war_battles WHERE season_id=? AND status='RESOLVING'").bind(season.id).first();
    if(Number(resolving?.count||0)>0)return env.DB.prepare('SELECT * FROM clan_seasons WHERE id=?').bind(season.id).first();
    await env.DB.prepare("UPDATE clan_war_battles SET status='FAILED',error_message='SEASON_SETTLED_BEFORE_RESOLUTION',updated_at=CURRENT_TIMESTAMP WHERE season_id=? AND status='PENDING'").bind(season.id).run();
    const activeWars=rows(await env.DB.prepare("SELECT * FROM clan_wars WHERE season_id=? AND status='ACTIVE' ORDER BY round_no,id").bind(season.id).all());
    await batchChunks(env,activeWars.map(war=>env.DB.prepare("UPDATE clan_wars SET status='COMPLETED',winner_clan_id=?,updated_at=CURRENT_TIMESTAMP WHERE id=? AND status='ACTIVE'").bind(warWinnerClanId(war),war.id)));
    const champion=await env.DB.prepare('SELECT clan_id FROM clan_season_teams WHERE season_id=? ORDER BY score DESC,wins DESC,losses ASC,draft_position ASC LIMIT 1').bind(season.id).first(),championId=Number(champion?.clan_id||0);
    await env.DB.prepare("INSERT OR IGNORE INTO clan_season_settlements(season_id,champion_clan_id,status,reward_status) VALUES(?,?,'PENDING','DISABLED_TEST')").bind(season.id,championId||null).run();
    let settlement=await env.DB.prepare('SELECT * FROM clan_season_settlements WHERE season_id=?').bind(season.id).first();
    if(settlement?.status==='COMPLETED'){await env.DB.prepare("UPDATE clan_seasons SET phase='COMPLETE',updated_at=CURRENT_TIMESTAMP WHERE id=? AND phase<>'COMPLETE'").bind(season.id).run();return env.DB.prepare('SELECT * FROM clan_seasons WHERE id=?').bind(season.id).first()}
    if(settlement?.status==='PROCESSING'&&Date.now()-sqlMs(settlement.updated_at)>60000){await env.DB.prepare("UPDATE clan_season_settlements SET status='PENDING',processing_token=NULL,updated_at=CURRENT_TIMESTAMP WHERE season_id=? AND status='PROCESSING'").bind(season.id).run();settlement={...settlement,status:'PENDING'}}
    const processingToken=crypto.randomUUID(),claim=await env.DB.prepare("UPDATE clan_season_settlements SET status='PROCESSING',processing_token=?,champion_clan_id=?,updated_at=CURRENT_TIMESTAMP WHERE season_id=? AND status='PENDING'").bind(processingToken,championId||null,season.id).run();
    if(Number(claim?.meta?.changes||0)!==1)return env.DB.prepare('SELECT * FROM clan_seasons WHERE id=?').bind(season.id).first();
    const writes=[];if(championId)writes.push(env.DB.prepare("UPDATE clan_organizations SET trophies=trophies+1,updated_at=CURRENT_TIMESTAMP WHERE id=? AND EXISTS(SELECT 1 FROM clan_season_settlements WHERE season_id=? AND status='PROCESSING' AND processing_token=?)").bind(championId,season.id,processingToken));
    writes.push(env.DB.prepare("UPDATE clan_seasons SET phase='COMPLETE',updated_at=CURRENT_TIMESTAMP WHERE id=? AND phase='SETTLEMENT' AND EXISTS(SELECT 1 FROM clan_season_settlements WHERE season_id=? AND status='PROCESSING' AND processing_token=?)").bind(season.id,season.id,processingToken));
    writes.push(env.DB.prepare("UPDATE clan_season_settlements SET status='COMPLETED',processing_token=NULL,reward_status='DISABLED_TEST',completed_at=CURRENT_TIMESTAMP,updated_at=CURRENT_TIMESTAMP WHERE season_id=? AND status='PROCESSING' AND processing_token=?").bind(season.id,processingToken));
    await env.DB.batch(writes);return env.DB.prepare('SELECT * FROM clan_seasons WHERE id=?').bind(season.id).first();
  }finally{await releaseDraftLock(env,settleLock)}
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
  if(fresh.phase==='SETTLEMENT')fresh=await settleSeason(env,fresh);
  return fresh;
}

function publicSeason(season){return season?{id:Number(season.id),seasonNo:Number(season.season_no),phase:season.phase,maxMembers:Number(season.max_members||CLAN_MAX_MEMBERS),registrationEndsAt:season.registration_ends_at,draftEndsAt:season.draft_ends_at,startsAt:season.starts_at,endsAt:season.ends_at,nextPickDeadline:season.next_pick_deadline,draftPickCount:Number(season.draft_pick_count||0)}:null}
function publicTeam(row){return row?{clanId:Number(row.clan_id),name:row.name,markKey:row.mark_key,primaryColor:row.primary_color,accentColor:row.accent_color,slogan:row.slogan||'',masterUserId:Number(row.master_user_id),masterNickname:row.master_nickname||'',memberCount:Number(row.member_count||0),score:Number(row.score||0),wins:Number(row.wins||0),losses:Number(row.losses||0),draftPosition:Number(row.draft_position||0)}:null}
async function clanAdminState(env,settings){
  let season=await latestSeason(env);if(!season)season=await env.DB.prepare('SELECT * FROM clan_seasons ORDER BY season_no DESC LIMIT 1').first();const seasonId=Number(season?.id||0);
  const [organizationsResult,warsResult,poolResult,battleStatusResult,recentResult,settlement]=await Promise.all([
    env.DB.prepare(`SELECT o.*,t.master_user_id,t.draft_position,t.score,t.wins,t.losses,u.nickname master_nickname,
      (SELECT COUNT(*) FROM clan_members m WHERE m.season_id=? AND m.clan_id=o.id) member_count
      FROM clan_organizations o LEFT JOIN clan_season_teams t ON t.clan_id=o.id AND t.season_id=? LEFT JOIN users u ON u.id=t.master_user_id
      WHERE o.is_active=1 ORDER BY ${OFFICIAL_CLAN_ORDER_SQL},o.id LIMIT ?`).bind(seasonId,seasonId,OFFICIAL_CLAN_CATALOG.length).all(),
    seasonId?env.DB.prepare(`SELECT w.*,a.name clan_a_name,b.name clan_b_name,win.name winner_name FROM clan_wars w
      JOIN clan_organizations a ON a.id=w.clan_a_id JOIN clan_organizations b ON b.id=w.clan_b_id LEFT JOIN clan_organizations win ON win.id=w.winner_clan_id
      WHERE w.season_id=? ORDER BY w.round_no,w.id`).bind(seasonId).all():Promise.resolve({results:[]}),
    seasonId?env.DB.prepare(`SELECT COUNT(*) registered,
      SUM(CASE WHEN status='AVAILABLE' THEN 1 ELSE 0 END) available,
      SUM(CASE WHEN status IN ('MASTER','DRAFTED') THEN 1 ELSE 0 END) drafted
      FROM clan_draft_pool WHERE season_id=?`).bind(seasonId).first():Promise.resolve({registered:0,available:0,drafted:0}),
    seasonId?env.DB.prepare('SELECT status,COUNT(*) count FROM clan_war_battles WHERE season_id=? GROUP BY status ORDER BY status').bind(seasonId).all():Promise.resolve({results:[]}),
    seasonId?env.DB.prepare(`SELECT b.id,b.request_id,b.war_id,b.status,b.created_at,b.updated_at,b.error_message,
      au.nickname attacker_nickname,du.nickname defender_nickname,ac.name attacker_clan,dc.name defender_clan,winner.name winner_clan
      FROM clan_war_battles b JOIN users au ON au.id=b.attacker_user_id JOIN users du ON du.id=b.defender_user_id
      JOIN clan_organizations ac ON ac.id=b.attacker_clan_id JOIN clan_organizations dc ON dc.id=b.defender_clan_id
      LEFT JOIN clan_organizations winner ON winner.id=b.winner_clan_id WHERE b.season_id=? ORDER BY b.id DESC LIMIT 40`).bind(seasonId).all():Promise.resolve({results:[]}),
    seasonId?env.DB.prepare('SELECT * FROM clan_season_settlements WHERE season_id=?').bind(seasonId).first():Promise.resolve(null)
  ]);
  const clans=rows(organizationsResult).map(row=>({id:Number(row.id),name:row.name,markKey:row.mark_key,primaryColor:row.primary_color,accentColor:row.accent_color,slogan:row.slogan||'',trophies:Number(row.trophies||0),active:Number(row.is_active||0)===1,masterUserId:Number(row.master_user_id||0),masterNickname:row.master_nickname||'',memberCount:Number(row.member_count||0),draftPosition:Number(row.draft_position??-1),score:Number(row.score||0),wins:Number(row.wins||0),losses:Number(row.losses||0)}));
  const wars=rows(warsResult).map(row=>({id:Number(row.id),roundNo:Number(row.round_no),status:row.status,clanAId:Number(row.clan_a_id),clanAName:row.clan_a_name,clanBId:Number(row.clan_b_id),clanBName:row.clan_b_name,scoreA:Number(row.score_a||0),scoreB:Number(row.score_b||0),battleCount:Number(row.battle_count||0),startsAt:row.starts_at,endsAt:row.ends_at,winnerClanId:Number(row.winner_clan_id||0),winnerName:row.winner_name||''}));
  const battleStatus=Object.fromEntries(rows(battleStatusResult).map(row=>[String(row.status||'UNKNOWN'),Number(row.count||0)])),recentBattles=rows(recentResult).map(row=>({id:Number(row.id),requestId:row.request_id,warId:Number(row.war_id),status:row.status,attackerNickname:row.attacker_nickname,defenderNickname:row.defender_nickname,attackerClan:row.attacker_clan,defenderClan:row.defender_clan,winnerClan:row.winner_clan||'',errorMessage:row.error_message||'',createdAt:row.created_at,updatedAt:row.updated_at}));
  return{
    ok:true,settings,season:publicSeason(season),settlement:settlement?{status:settlement.status,championClanId:Number(settlement.champion_clan_id||0),rewardStatus:settlement.reward_status,completedAt:settlement.completed_at}:null,clans,wars,recentBattles,
    metrics:{registered:Number(poolResult?.registered||0),available:Number(poolResult?.available||0),drafted:Number(poolResult?.drafted||0),clansActive:clans.filter(clan=>clan.active).length,warsActive:wars.filter(war=>war.status==='ACTIVE').length,battlesTotal:Object.values(battleStatus).reduce((sum,count)=>sum+Number(count||0),0),battleStatus},
    runtimeContract:{attacksPerWar:CLAN_ATTACKS_PER_WAR,defensesPerTarget:CLAN_DEFENSES_PER_TARGET,repeatTargetLimit:CLAN_REPEAT_TARGET_LIMIT,battleEngine:'PROJECT_V_V3',playbackSpeed:1.3,roundGeneration:'ROUND_1_ONLY',rewards:'DISABLED_TEST'},
    targetContract:{warDurationMinutes:settings.warDurationMinutes,initialEnergy:settings.initialEnergy,energyCap:settings.energyCap,energyRecoverySeconds:settings.energyRecoverySeconds,totalUseLimit:settings.totalUseLimit,defensesPerTarget:settings.defensesPerTarget,powerMatchTolerancePct:settings.powerMatchTolerancePct,powerMatchFallback:settings.powerMatchFallback,powerSnapshot:settings.powerSnapshot,playbackSpeed:settings.playbackSpeed},
    releaseGates:[
      {key:'FOUNDATION',status:'READY',label:'클랜·드래프트·전투 DB 계약'},
      {key:'PROJECT_V_V3',status:'READY',label:'PROJECT V V3 전투 판정·연출'},
      {key:'WAR_WINDOW',status:'PENDING',label:'60분 정시 개방·후속 라운드'},
      {key:'ENERGY',status:'PENDING',label:'5/10 행동력·180초 회복'},
      {key:'POWER_MATCH',status:'PENDING',label:'±10% 전투력 자동 매칭'},
      {key:'REWARDS',status:'LOCKED',label:'클랜전 경제 보상 지급'}
    ],serverNow:iso()
  };
}
async function overview(env,user,season){
  const ownerBypass=isOwner(user),overviewStatements=[
    env.DB.prepare(`SELECT m.*,t.master_user_id,t.draft_position,t.score,t.wins,t.losses,o.name,o.mark_key,o.primary_color,o.accent_color,o.slogan
      FROM clan_members m JOIN clan_season_teams t ON t.season_id=m.season_id AND t.clan_id=m.clan_id JOIN clan_organizations o ON o.id=m.clan_id WHERE m.season_id=? AND m.user_id=?`).bind(season.id,user.id),
    env.DB.prepare(`SELECT t.*,o.name,o.mark_key,o.primary_color,o.accent_color,o.slogan,u.nickname master_nickname,(SELECT COUNT(*) FROM clan_members m WHERE m.season_id=t.season_id AND m.clan_id=t.clan_id) member_count
      FROM clan_season_teams t JOIN clan_organizations o ON o.id=t.clan_id JOIN users u ON u.id=t.master_user_id WHERE t.season_id=? ORDER BY t.score DESC,t.wins DESC,t.draft_position`).bind(season.id)
  ];
  if(!ownerBypass)overviewStatements.unshift(env.DB.prepare("SELECT provider_name,verified_at FROM user_second_verifications WHERE user_id=? AND provider='PLAYDK'").bind(user.id));
  const overviewResults=await env.DB.batch(overviewStatements),[verifiedResult,membershipResult,teamsResult]=ownerBypass?[null,...overviewResults]:overviewResults;
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
      if(war){
        const enemyClan=Number(war.clan_a_id)===Number(membership.clan_id)?Number(war.clan_b_id):Number(war.clan_a_id),attackRow=await env.DB.prepare("SELECT COUNT(*) count FROM clan_war_battles WHERE war_id=? AND attacker_user_id=? AND status='COMPLETED'").bind(war.id,user.id).first(),attacksUsed=Number(attackRow?.count||0);
        opponents=rows(await env.DB.prepare(`SELECT m.user_id,u.nickname,m.preferred_role,m.battle_wins,m.battle_losses,
          (SELECT COUNT(*) FROM clan_war_battles b WHERE b.war_id=? AND b.defender_user_id=m.user_id AND b.status='COMPLETED') defense_count,
          (SELECT COUNT(*) FROM clan_war_battles b WHERE b.war_id=? AND b.attacker_user_id=? AND b.defender_user_id=m.user_id AND b.status='COMPLETED') faced_count
          FROM clan_members m JOIN users u ON u.id=m.user_id WHERE m.season_id=? AND m.clan_id=? ORDER BY m.battle_wins DESC,m.draft_pick_no LIMIT 20`).bind(war.id,war.id,user.id,season.id,enemyClan).all()).map(r=>({userId:Number(r.user_id),nickname:r.nickname,preferredRole:r.preferred_role,battleWins:Number(r.battle_wins),battleLosses:Number(r.battle_losses),defenseCount:Number(r.defense_count||0),alreadyFaced:Number(r.faced_count||0)>=CLAN_REPEAT_TARGET_LIMIT,available:Number(r.defense_count||0)<CLAN_DEFENSES_PER_TARGET&&Number(r.faced_count||0)<CLAN_REPEAT_TARGET_LIMIT}));
        war={id:Number(war.id),roundNo:Number(war.round_no),clanAId:Number(war.clan_a_id),clanBId:Number(war.clan_b_id),scoreA:Number(war.score_a),scoreB:Number(war.score_b),battleCount:Number(war.battle_count),attacksUsed,attackLimit:CLAN_ATTACKS_PER_WAR,attacksRemaining:Math.max(0,CLAN_ATTACKS_PER_WAR-attacksUsed),startsAt:war.starts_at,endsAt:war.ends_at};
      }
    }
  }else registration=await env.DB.prepare('SELECT preferred_role,activity_window,status,registered_at FROM clan_draft_pool WHERE season_id=? AND user_id=?').bind(season.id,user.id).first();
  const settlementRow=await env.DB.prepare('SELECT * FROM clan_season_settlements WHERE season_id=?').bind(season.id).first(),settlement=settlementRow?{status:settlementRow.status,championClanId:Number(settlementRow.champion_clan_id||0),rewardStatus:settlementRow.reward_status,completedAt:settlementRow.completed_at}:null;
  return{ok:true,season:publicSeason(season),verified:ownerBypass||Boolean(verified),verificationExempt:ownerBypass,verificationName:ownerBypass?'OWNER':verified?.provider_name||'',registration:registration?{registered:true,preferredRole:registration.preferred_role,activityWindow:registration.activity_window,status:registration.status,registeredAt:registration.registered_at}:{registered:false},membership:membership?{...mine,memberRole:membership.member_role,isMaster:Number(membership.master_user_id)===Number(user.id)}:null,teams,officialClans:OFFICIAL_CLAN_CATALOG.map((clan,index)=>({...clan,order:index+1})),roster,draft,candidates,war,opponents,settlement,battleEngine:{active:true,version:'PROJECT_V_V3',playbackSpeed:1.3},rules:{maxMembers:CLAN_MAX_MEMBERS,maxClans:OFFICIAL_CLAN_CATALOG.length,maxParticipants:CLAN_MAX_PARTICIPANTS,attacksPerWar:CLAN_ATTACKS_PER_WAR,defensesPerTarget:CLAN_DEFENSES_PER_TARGET,repeatTargetLimit:CLAN_REPEAT_TARGET_LIMIT,noFixedRoster:true,blindDraft:true,snakeDraft:true,identityPersists:true,identityFixed:true,queryPolicy:'SNAPSHOT_NO_VIEW_LOGS'},serverNow:iso()};
}

async function register(env,deps,user,season,body){
  if(season.phase!=='REGISTRATION')return deps.json({error:'현재는 클랜 시즌 참가 신청 기간이 아닙니다.'},409);
  if(!isOwner(user)){const verified=await env.DB.prepare("SELECT 1 ok FROM user_second_verifications WHERE user_id=? AND provider='PLAYDK'").bind(user.id).first();if(!verified)return deps.json({error:'PLAY DK 2차 인증을 완료한 계정만 클랜 시즌에 참가할 수 있습니다.'},403)}
  const deck=await deps.pvpDeckSnapshot(env,user.id);if(deck.length!==5)return deps.json({error:'클랜전은 V3 전투를 사용합니다. 랭크전 덱 5장을 먼저 편성하세요.'},400);
  const preferredRole=cleanRole(body.preferredRole),activityWindow=['MORNING','DAY','EVENING','NIGHT','FLEX'].includes(String(body.activityWindow||'').toUpperCase())?String(body.activityWindow).toUpperCase():'FLEX',deckJson=JSON.stringify(deck.map(card=>String(card.id)));let existing=await env.DB.prepare('SELECT * FROM clan_draft_pool WHERE season_id=? AND user_id=?').bind(season.id,user.id).first();
  if(existing&&existing.preferred_role===preferredRole&&existing.activity_window===activityWindow&&existing.deck_snapshot===deckJson)return deps.json({ok:true,unchanged:true,state:await overview(env,user,season)});
  if(existing)await env.DB.prepare('UPDATE clan_draft_pool SET preferred_role=?,activity_window=?,deck_snapshot=?,updated_at=CURRENT_TIMESTAMP WHERE season_id=? AND user_id=?').bind(preferredRole,activityWindow,deckJson,season.id,user.id).run();
  else{
    const lock=await acquireDraftLock(env,season.id);if(!lock.ok)return deps.json({error:'다른 참가 신청을 반영 중입니다. 잠시 후 다시 시도하세요.'},409);
    try{
      existing=await env.DB.prepare('SELECT * FROM clan_draft_pool WHERE season_id=? AND user_id=?').bind(season.id,user.id).first();
      if(existing)await env.DB.prepare('UPDATE clan_draft_pool SET preferred_role=?,activity_window=?,deck_snapshot=?,updated_at=CURRENT_TIMESTAMP WHERE season_id=? AND user_id=?').bind(preferredRole,activityWindow,deckJson,season.id,user.id).run();
      else{const registered=await env.DB.prepare('SELECT COUNT(*) count FROM clan_draft_pool WHERE season_id=?').bind(season.id).first();if(Number(registered?.count||0)>=CLAN_MAX_PARTICIPANTS)return deps.json({error:`이번 시즌 클랜 참가 정원 ${CLAN_MAX_PARTICIPANTS}명이 마감됐습니다.`},409);await env.DB.prepare("INSERT INTO clan_draft_pool(season_id,user_id,candidate_key,preferred_role,activity_window,deck_snapshot,status,updated_at) VALUES(?,?,?,?,?,?,'AVAILABLE',CURRENT_TIMESTAMP)").bind(season.id,user.id,crypto.randomUUID(),preferredRole,activityWindow,deckJson).run()}
    }finally{await releaseDraftLock(env,lock)}
  }
  return deps.json({ok:true,state:await overview(env,user,season)});
}

async function updateIdentity(env,deps,user,season,body){
  const team=await env.DB.prepare(`SELECT t.*,o.mark_key FROM clan_season_teams t JOIN clan_organizations o ON o.id=t.clan_id WHERE t.season_id=? AND t.master_user_id=?`).bind(season.id,user.id).first();if(!team)return deps.json({error:'이번 시즌 클랜 마스터만 클랜 정보를 변경할 수 있습니다.'},403);
  const official=OFFICIAL_CLAN_CATALOG.find(clan=>clan.markKey===team.mark_key);if(!official)return deps.json({error:'공식 클랜 정보를 확인하지 못했습니다. 새로고침 후 다시 시도하세요.'},409);
  const slogan=cleanText(body.slogan,60);
  await env.DB.prepare('UPDATE clan_organizations SET name=?,mark_key=?,primary_color=?,accent_color=?,slogan=?,updated_at=CURRENT_TIMESTAMP WHERE id=?').bind(official.name,official.markKey,official.primaryColor,official.accentColor,slogan,team.clan_id).run();
  return deps.json({ok:true,state:await overview(env,user,season)});
}

async function buildClanBattle(env,deps,attackerUser,defenderUser,attackerPool,defenderPool,seed){
  const battle=await deps.battleSettings(env),[aCardsRaw,dCardsRaw]=await Promise.all([deps.pvpDeckSnapshotByIds(env,attackerUser.id,safeJson(attackerPool.deck_snapshot,[])),deps.pvpDeckSnapshotByIds(env,defenderUser.id,safeJson(defenderPool.deck_snapshot,[]))]);
  if(aCardsRaw.length!==5)throw new Error('내 클랜전 덱 5장을 불러오지 못했습니다. 다음 시즌 신청에서 덱을 갱신하세요.');if(dCardsRaw.length!==5)throw new Error('상대 클랜원의 전투 덱이 완성되지 않았습니다.');
  const aCards=aCardsRaw.map(card=>({...card,id:String(card.id),power:deps.cardBattlePower(card,card.breakthrough_level,battle)})),dCards=dCardsRaw.map(card=>({...card,id:String(card.id),power:deps.cardBattlePower(card,card.breakthrough_level,battle)})),aIds=aCards.map(c=>String(c.id)),dIds=dCards.map(c=>String(c.id));
  const [unique,aBonus,dBonus,aSynergy,dSynergy,aMagic,dMagic]=await Promise.all([
    deps.cardUniqueDeckStates(env,[{user:attackerUser,cards:aCards},{user:defenderUser,cards:dCards}],'PVP'),deps.userEquipmentBonuses(env,attackerUser.id),deps.userEquipmentBonuses(env,defenderUser.id),deps.evaluateDeckSynergies(env,attackerUser,aIds,'PVP',{forceOwnerTest:String(attackerUser.role||'').toUpperCase()==='OWNER'}),deps.evaluateDeckSynergies(env,defenderUser,dIds,'PVP',{forceOwnerTest:String(defenderUser.role||'').toUpperCase()==='OWNER'}),deps.magicBattleLoadout(env,attackerUser,'PVP'),deps.magicBattleLoadout(env,defenderUser,'PVP')
  ]);
  const [aUnique,dUnique]=unique,aMap=new Map((aUnique?.cards||[]).map(c=>[String(c.id),c])),dMap=new Map((dUnique?.cards||[]).map(c=>[String(c.id),c])),aMult=1+Number(aSynergy?.totals?.attackPercent||0)/100,dMult=1+Number(dSynergy?.totals?.attackPercent||0)/100;
  const attackerDeck=aCards.map(c=>{const uniqueCard=aMap.get(String(c.id));return {...c,power:Math.max(1,Math.floor(Number(c.power||0)*aMult)),uniqueAbility:uniqueCard?.uniqueAbility||c.uniqueAbility||null,uniqueAdvancement:uniqueCard?.uniqueAdvancement||null}}),defenderDeck=dCards.map(c=>{const uniqueCard=dMap.get(String(c.id));return {...c,power:Math.max(1,Math.floor(Number(c.power||0)*dMult)),uniqueAbility:uniqueCard?.uniqueAbility||c.uniqueAbility||null,uniqueAdvancement:uniqueCard?.uniqueAdvancement||null}});
  const battleV2=deps.createPvpBattleV2({attackerCards:attackerDeck,defenderCards:defenderDeck,attackerMagicCards:aMagic?.cards||[],defenderMagicCards:dMagic?.cards||[],attackerEquipmentBonus:Number(aBonus?.pvp||0),defenderEquipmentBonus:Number(dBonus?.pvp||0),seed,singleHealerBonus:battle?.engine?.singleHealerBonus});
  return{battleV2,attackerDeck,defenderDeck,attackerPower:Number(battleV2.teams?.A?.summary?.power||0),defenderPower:Number(battleV2.teams?.B?.summary?.power||0)};
}

async function fight(env,deps,user,season,body){
  if(season.phase!=='ACTIVE')return deps.json({error:'클랜전 진행 기간이 아닙니다.'},409);const requestId=validRequestId(body.requestId);if(!requestId)return deps.json({error:'전투 요청 키가 올바르지 않습니다.'},400);
  const mine=await env.DB.prepare('SELECT * FROM clan_members WHERE season_id=? AND user_id=?').bind(season.id,user.id).first();if(!mine)return deps.json({error:'이번 시즌 클랜 소속이 아닙니다.'},403);
  const war=await env.DB.prepare("SELECT * FROM clan_wars WHERE season_id=? AND status='ACTIVE' AND (clan_a_id=? OR clan_b_id=?) ORDER BY round_no,id LIMIT 1").bind(season.id,mine.clan_id,mine.clan_id).first();if(!war)return deps.json({error:'현재 배정된 클랜전 상대가 없습니다.'},409);
  const enemyClan=Number(war.clan_a_id)===Number(mine.clan_id)?Number(war.clan_b_id):Number(war.clan_a_id);let receipt=await env.DB.prepare('SELECT * FROM clan_war_battles WHERE request_id=?').bind(requestId).first();
  if(receipt&&(Number(receipt.attacker_user_id)!==Number(user.id)||Number(receipt.season_id)!==Number(season.id)||Number(receipt.war_id)!==Number(war.id)))return deps.json({error:'다른 전투에 사용된 요청 키입니다.'},409);
  const requestedTargetId=Number(body.targetUserId||0);if(receipt&&requestedTargetId&&Number(receipt.defender_user_id)!==requestedTargetId)return deps.json({error:'같은 요청 키로 공격 대상을 변경할 수 없습니다.'},409);
  const targetId=Number(receipt?.defender_user_id||requestedTargetId||0),defender=targetId?await env.DB.prepare(`SELECT m.*,u.nickname,u.role FROM clan_members m JOIN users u ON u.id=m.user_id WHERE m.season_id=? AND m.clan_id=? AND m.user_id=?`).bind(season.id,enemyClan,targetId).first():await env.DB.prepare(`SELECT m.*,u.nickname,u.role FROM clan_members m JOIN users u ON u.id=m.user_id WHERE m.season_id=? AND m.clan_id=? ORDER BY m.battle_wins-m.battle_losses,m.draft_pick_no LIMIT 1`).bind(season.id,enemyClan).first();if(!defender)return deps.json({error:'공격할 상대 클랜원을 찾지 못했습니다.'},404);
  const seed=receipt?Number(receipt.battle_seed):seedOf(`${season.id}:${war.id}:${requestId}:CLAN_V3`),attackerPool=await env.DB.prepare('SELECT deck_snapshot FROM clan_draft_pool WHERE season_id=? AND user_id=?').bind(season.id,user.id).first(),defenderPool=await env.DB.prepare('SELECT deck_snapshot FROM clan_draft_pool WHERE season_id=? AND user_id=?').bind(season.id,defender.user_id).first();
  if(!receipt){
    // 시즌 단위의 짧은 예약 잠금으로 서로 다른 공격자가 같은 방어 슬롯을 동시에 초과 예약하지 못하게 한다.
    const quotaLock=await acquireDraftLock(env,season.id);if(!quotaLock.ok)return deps.json({error:'다른 클랜전 작전권을 배정 중입니다. 잠시 후 다시 시도하세요.'},409);
    try{
      receipt=await env.DB.prepare('SELECT * FROM clan_war_battles WHERE request_id=?').bind(requestId).first();
      if(receipt&&(Number(receipt.attacker_user_id)!==Number(user.id)||Number(receipt.defender_user_id)!==Number(defender.user_id)))return deps.json({error:'다른 전투에 사용된 요청 키입니다.'},409);
      if(!receipt){
        await env.DB.prepare(`INSERT OR IGNORE INTO clan_war_battles(request_id,season_id,war_id,attacker_clan_id,defender_clan_id,attacker_user_id,defender_user_id,battle_seed,status)
          SELECT ?,?,?,?,?,?,?,?,'PENDING'
          WHERE (SELECT COUNT(*) FROM clan_war_battles WHERE war_id=? AND attacker_user_id=? AND status IN ('PENDING','RESOLVING','COMPLETED'))<?
            AND (SELECT COUNT(*) FROM clan_war_battles WHERE war_id=? AND attacker_user_id=? AND defender_user_id=? AND status IN ('PENDING','RESOLVING','COMPLETED'))<?
            AND (SELECT COUNT(*) FROM clan_war_battles WHERE war_id=? AND defender_user_id=? AND status IN ('PENDING','RESOLVING','COMPLETED'))<?
            AND EXISTS(SELECT 1 FROM clan_wars WHERE id=? AND status='ACTIVE')`).bind(requestId,season.id,war.id,mine.clan_id,enemyClan,user.id,defender.user_id,seed,war.id,user.id,CLAN_ATTACKS_PER_WAR,war.id,user.id,defender.user_id,CLAN_REPEAT_TARGET_LIMIT,war.id,defender.user_id,CLAN_DEFENSES_PER_TARGET,war.id).run();
        receipt=await env.DB.prepare('SELECT * FROM clan_war_battles WHERE request_id=?').bind(requestId).first();
      }
      if(!receipt){
        const [attacks,repeat,defenses]=await Promise.all([
          env.DB.prepare("SELECT COUNT(*) count FROM clan_war_battles WHERE war_id=? AND attacker_user_id=? AND status IN ('PENDING','RESOLVING','COMPLETED')").bind(war.id,user.id).first(),
          env.DB.prepare("SELECT COUNT(*) count FROM clan_war_battles WHERE war_id=? AND attacker_user_id=? AND defender_user_id=? AND status IN ('PENDING','RESOLVING','COMPLETED')").bind(war.id,user.id,defender.user_id).first(),
          env.DB.prepare("SELECT COUNT(*) count FROM clan_war_battles WHERE war_id=? AND defender_user_id=? AND status IN ('PENDING','RESOLVING','COMPLETED')").bind(war.id,defender.user_id).first()
        ]);
        if(Number(attacks?.count||0)>=CLAN_ATTACKS_PER_WAR)return deps.json({error:`이번 클랜전 작전권 ${CLAN_ATTACKS_PER_WAR}회를 모두 사용했습니다.`},409);
        if(Number(repeat?.count||0)>=CLAN_REPEAT_TARGET_LIMIT)return deps.json({error:'같은 상대는 이번 클랜전에서 한 번만 공격할 수 있습니다.'},409);
        if(Number(defenses?.count||0)>=CLAN_DEFENSES_PER_TARGET)return deps.json({error:'선택한 상대의 방어 슬롯이 마감됐습니다.'},409);
        return deps.json({error:'전투 공격권을 예약하지 못했습니다. 잠시 후 다시 시도하세요.'},409);
      }
    }finally{await releaseDraftLock(env,quotaLock)}
  }
  if(receipt?.status==='RESOLVING'&&Date.now()-sqlMs(receipt.updated_at)>60000){await env.DB.prepare("UPDATE clan_war_battles SET status='FAILED',error_message='STALE_RESOLUTION_RECOVERED',updated_at=CURRENT_TIMESTAMP WHERE id=? AND status='RESOLVING'").bind(receipt.id).run();receipt={...receipt,status:'FAILED'}}
  if(receipt?.status==='FAILED'){
    const quotaLock=await acquireDraftLock(env,season.id);if(!quotaLock.ok)return deps.json({error:'다른 클랜전 작전권을 배정 중입니다. 잠시 후 다시 시도하세요.'},409);
    try{
      const retry=await env.DB.prepare(`UPDATE clan_war_battles SET status='PENDING',error_message=NULL,updated_at=CURRENT_TIMESTAMP WHERE id=? AND status='FAILED'
        AND (SELECT COUNT(*) FROM clan_war_battles WHERE war_id=? AND attacker_user_id=? AND id<>? AND status IN ('PENDING','RESOLVING','COMPLETED'))<?
        AND (SELECT COUNT(*) FROM clan_war_battles WHERE war_id=? AND attacker_user_id=? AND defender_user_id=? AND id<>? AND status IN ('PENDING','RESOLVING','COMPLETED'))<?
        AND (SELECT COUNT(*) FROM clan_war_battles WHERE war_id=? AND defender_user_id=? AND id<>? AND status IN ('PENDING','RESOLVING','COMPLETED'))<?
        AND EXISTS(SELECT 1 FROM clan_wars WHERE id=? AND status='ACTIVE')`).bind(receipt.id,war.id,user.id,receipt.id,CLAN_ATTACKS_PER_WAR,war.id,user.id,defender.user_id,receipt.id,CLAN_REPEAT_TARGET_LIMIT,war.id,defender.user_id,receipt.id,CLAN_DEFENSES_PER_TARGET,war.id).run();
      if(Number(retry?.meta?.changes||0)!==1)return deps.json({error:'재시도할 공격권이 남아 있지 않습니다.'},409);receipt={...receipt,status:'PENDING',error_message:null};
    }finally{await releaseDraftLock(env,quotaLock)}
  }
  let claimed=false;if(receipt.status==='PENDING'){const claim=await env.DB.prepare("UPDATE clan_war_battles SET status='RESOLVING',updated_at=CURRENT_TIMESTAMP WHERE id=? AND status='PENDING'").bind(receipt.id).run();claimed=Number(claim?.meta?.changes||0)===1;if(!claimed)return deps.json({error:'같은 전투가 이미 처리 중입니다. 잠시 후 다시 확인하세요.'},409);receipt={...receipt,status:'RESOLVING'}}
  if(receipt.status!=='COMPLETED'&&!claimed)return deps.json({error:'같은 전투가 이미 처리 중입니다. 잠시 후 다시 확인하세요.'},409);
  try{
    const defenderUser={id:Number(defender.user_id),nickname:defender.nickname,role:defender.role},simulation=await buildClanBattle(env,deps,user,defenderUser,attackerPool,defenderPool,seed),simulatedWin=simulation.battleV2?.result?.winner==='A',won=receipt.status==='COMPLETED'?Number(receipt.winner_clan_id)===Number(mine.clan_id):simulatedWin,winnerClan=won?Number(mine.clan_id):enemyClan;
    if(claimed){
      const scoreColumn=Number(war.clan_a_id)===winnerClan?'score_a':'score_b';await env.DB.batch([
        env.DB.prepare(`UPDATE clan_wars SET ${scoreColumn}=${scoreColumn}+1,battle_count=battle_count+1,updated_at=CURRENT_TIMESTAMP WHERE id=? AND EXISTS(SELECT 1 FROM clan_war_battles WHERE id=? AND status='RESOLVING')`).bind(war.id,receipt.id),
        env.DB.prepare(`UPDATE clan_members SET ${won?'battle_wins':'battle_losses'}=${won?'battle_wins':'battle_losses'}+1,contribution_score=contribution_score+1,updated_at=CURRENT_TIMESTAMP WHERE season_id=? AND user_id=? AND EXISTS(SELECT 1 FROM clan_war_battles WHERE id=? AND status='RESOLVING')`).bind(season.id,user.id,receipt.id),
        env.DB.prepare(`UPDATE clan_members SET ${won?'battle_losses':'battle_wins'}=${won?'battle_losses':'battle_wins'}+1,contribution_score=contribution_score+?,updated_at=CURRENT_TIMESTAMP WHERE season_id=? AND user_id=? AND EXISTS(SELECT 1 FROM clan_war_battles WHERE id=? AND status='RESOLVING')`).bind(won?0:1,season.id,defender.user_id,receipt.id),
        env.DB.prepare("UPDATE clan_season_teams SET score=score+?,wins=wins+?,losses=losses+?,updated_at=CURRENT_TIMESTAMP WHERE season_id=? AND clan_id=? AND EXISTS(SELECT 1 FROM clan_war_battles WHERE id=? AND status='RESOLVING')").bind(won?3:0,won?1:0,won?0:1,season.id,mine.clan_id,receipt.id),
        env.DB.prepare("UPDATE clan_season_teams SET score=score+?,wins=wins+?,losses=losses+?,updated_at=CURRENT_TIMESTAMP WHERE season_id=? AND clan_id=? AND EXISTS(SELECT 1 FROM clan_war_battles WHERE id=? AND status='RESOLVING')").bind(won?0:3,won?0:1,won?1:0,season.id,enemyClan,receipt.id),
        env.DB.prepare("UPDATE clan_war_battles SET status='COMPLETED',winner_clan_id=?,result_json=?,error_message=NULL,updated_at=CURRENT_TIMESTAMP WHERE id=? AND status='RESOLVING'").bind(winnerClan,JSON.stringify({winner:won?'ATTACKER':'DEFENDER',reason:simulation.battleV2?.result?.reason||'',actions:Number(simulation.battleV2?.result?.actions||0)}),receipt.id)
      ]);
    }
    // 영구 전투 로그를 쌓지 않는다. 시즌 운영에 불필요한 30일 초과 영수증은 전투 요청 때 최대 200건만 정리한다.
    await env.DB.prepare("DELETE FROM clan_war_battles WHERE id IN (SELECT id FROM clan_war_battles WHERE updated_at<datetime('now','-30 days') ORDER BY id LIMIT 200)").run();
    const attacks=await env.DB.prepare("SELECT COUNT(*) count FROM clan_war_battles WHERE war_id=? AND attacker_user_id=? AND status='COMPLETED'").bind(war.id,user.id).first(),attacksUsed=Number(attacks?.count||0);
    return deps.json({ok:true,result:won?'WIN':'LOSE',battleEngine:{active:true,version:'PROJECT_V_V3',playbackSpeed:1.3},battleV2:simulation.battleV2,attackerDeck:simulation.attackerDeck,defenderDeck:simulation.defenderDeck,attackerPower:simulation.attackerPower,defenderPower:simulation.defenderPower,opponent:{id:Number(defender.user_id),nickname:defender.nickname},clanWar:{id:Number(war.id),winnerClanId:winnerClan,attackLimit:CLAN_ATTACKS_PER_WAR,attacksUsed,attacksRemaining:Math.max(0,CLAN_ATTACKS_PER_WAR-attacksUsed)}});
  }catch(error){if(claimed)await env.DB.prepare("UPDATE clan_war_battles SET status='FAILED',error_message=?,updated_at=CURRENT_TIMESTAMP WHERE id=? AND status='RESOLVING'").bind(String(error?.message||error).slice(0,240),receipt.id).run();return deps.json({error:error.message||'클랜전 V3 전투를 구성하지 못했습니다.'},409)}
}

export async function handleClan({path,request,env,deps}){
  if(!String(path).startsWith('clan')&&!String(path).startsWith('admin/clan-war'))return null;await ensureFoundation(env);const user=await deps.authenticate(request,env);if(!user)return deps.json({error:'로그인이 필요합니다.'},401);const settings=await clanSettings(env),owner=String(user.role||'').toUpperCase()==='OWNER',admin=typeof deps.isAdminRole==='function'?deps.isAdminRole(user):owner;
  if(path==='admin/clan-war/settings'){
    if(!admin)return deps.json({error:'관리자 권한이 필요합니다.'},403);
    if(request.method==='GET')return deps.json(await clanAdminState(env,settings));
    if(request.method==='PATCH'||request.method==='POST'){
      if(!owner)return deps.json({error:'클랜전 운영 설정은 OWNER만 변경할 수 있습니다.'},403);const body=await deps.readBody(request),candidate=body.settings||body;
      if(cleanBoolean(candidate.scheduleEnabled,settings.scheduleEnabled)&&Array.isArray(candidate.openDays)&&!candidate.openDays.length)return deps.json({error:'클랜전 개방 요일을 하나 이상 선택하세요.'},400);
      if(Number(candidate.initialEnergy)>Number(candidate.energyCap))return deps.json({error:'시작 행동력은 행동력 상한보다 클 수 없습니다.'},400);
      if(Number(candidate.totalUseLimit)<Number(candidate.initialEnergy))return deps.json({error:'개인 총 사용 상한은 시작 행동력 이상이어야 합니다.'},400);
      const next=cleanClanAdminSettings(candidate,settings);
      await env.DB.prepare('INSERT INTO app_meta(key,value,updated_at) VALUES(?,?,CURRENT_TIMESTAMP) ON CONFLICT(key) DO UPDATE SET value=excluded.value,updated_at=CURRENT_TIMESTAMP').bind(CLAN_ADMIN_SETTINGS_KEY,JSON.stringify(next)).run();
      const saved=await clanSettings(env);if(JSON.stringify(saved)!==JSON.stringify(next))return deps.json({error:'클랜전 설정 저장 후 검증값이 일치하지 않습니다. 운영 로그를 확인해주세요.',code:'CLAN_SETTINGS_VERIFY_FAILED'},500);
      if(deps.writeAdminLog)await deps.writeAdminLog(env,user,'CLAN_WAR_SETTINGS_UPDATE','APP_META',CLAN_ADMIN_SETTINGS_KEY,settings,saved);
      return deps.json(await clanAdminState(env,saved));
    }
    return deps.json({error:'지원하지 않는 클랜전 CMS 요청 방식입니다.'},405);
  }
  if(path==='clan/admin/mode'&&request.method==='POST'){
    if(!owner)return deps.json({error:'OWNER 권한이 필요합니다.'},403);const body=await deps.readBody(request),mode=String(body.mode||'').toUpperCase();if(!['OFF','TEST','ON'].includes(mode))return deps.json({error:'클랜 공개 상태는 OFF, TEST, ON 중 하나여야 합니다.'},400);const next={...settings,mode};await env.DB.prepare('INSERT INTO app_meta(key,value,updated_at) VALUES(?,?,CURRENT_TIMESTAMP) ON CONFLICT(key) DO UPDATE SET value=excluded.value,updated_at=CURRENT_TIMESTAMP').bind(CLAN_ADMIN_SETTINGS_KEY,JSON.stringify(next)).run();if(deps.writeAdminLog)await deps.writeAdminLog(env,user,'CLAN_WAR_MODE_UPDATE','APP_META',CLAN_ADMIN_SETTINGS_KEY,{mode:settings.mode},{mode});return deps.json({ok:true,mode});
  }
  if(settings.mode==='OFF'||(settings.mode==='TEST'&&!owner))return deps.json({error:'클랜 시스템은 OWNER 사전 테스트 중입니다.',code:'CLAN_TEST_ONLY',mode:settings.mode},404);
  let season=await createSeason(env);season=await advanceLifecycle(env,season);
  if(path==='clan/admin/test-bootstrap'&&request.method==='POST'){
    if(!owner||settings.mode!=='TEST')return deps.json({error:'TEST 상태의 OWNER만 테스트 편성을 구성할 수 있습니다.'},403);if(season.phase!=='REGISTRATION')return deps.json({error:'참가 신청 단계에서만 테스트 풀을 구성할 수 있습니다.'},409);
    const body=await deps.readBody(request),limit=clampInt(body.limit,4,CLAN_MAX_PARTICIPANTS,CLAN_MAX_PARTICIPANTS),eligible=rows(await env.DB.prepare(`SELECT u.id,u.nickname,d.card_ids FROM users u JOIN pvp_decks d ON d.user_id=u.id
      LEFT JOIN user_second_verifications s ON s.user_id=u.id AND s.provider='PLAYDK'
      WHERE UPPER(TRIM(COALESCE(u.status,'ACTIVE')))='ACTIVE' AND (s.user_id IS NOT NULL OR UPPER(TRIM(COALESCE(u.role,'USER')))='OWNER')
      ORDER BY CASE WHEN u.id=? THEN 0 ELSE 1 END,u.last_login_at DESC,u.id LIMIT 250`).bind(user.id).all()).filter(row=>{const ids=safeJson(row.card_ids,[]);return Array.isArray(ids)&&ids.length===5}).slice(0,limit);
    if(eligible.length<4)return deps.json({error:'V3 테스트에 사용할 PLAY DK 인증 또는 OWNER 면제·랭크전 덱 계정이 최소 4명 필요합니다.'},409);
    const statements=eligible.map(row=>env.DB.prepare("INSERT OR IGNORE INTO clan_draft_pool(season_id,user_id,candidate_key,preferred_role,activity_window,deck_snapshot,status) VALUES(?,?,?,?,?,?,'AVAILABLE')").bind(season.id,row.id,crypto.randomUUID(),CLAN_ROLES[Number(row.id)%CLAN_ROLES.length],['MORNING','DAY','EVENING','NIGHT','FLEX'][Number(row.id)%5],row.card_ids));await batchChunks(env,statements);season=await beginDraft(env,season,{forceMasterUserId:user.id});return deps.json({ok:true,seeded:eligible.length,state:await overview(env,user,season)});
  }
  if(path==='clan/admin/test-activate'&&request.method==='POST'){
    if(!owner||settings.mode!=='TEST')return deps.json({error:'TEST 상태의 OWNER만 테스트 시즌을 개막할 수 있습니다.'},403);if(season.phase!=='DRAFT')return deps.json({error:'드래프트 단계에서만 자동 편성을 완료할 수 있습니다.'},409);
    let fresh=season,candidate=await env.DB.prepare("SELECT * FROM clan_draft_pool WHERE season_id=? AND status='AVAILABLE' ORDER BY total_score DESC,user_id LIMIT 1").bind(fresh.id).first();while(candidate){const ctx=await draftContext(env,fresh);if(!ctx.current)break;await makeDraftPick(env,fresh,ctx.current,candidate,{auto:true});fresh=await env.DB.prepare('SELECT * FROM clan_seasons WHERE id=?').bind(fresh.id).first();candidate=await env.DB.prepare("SELECT * FROM clan_draft_pool WHERE season_id=? AND status='AVAILABLE' ORDER BY total_score DESC,user_id LIMIT 1").bind(fresh.id).first()}season=await activateSeason(env,fresh);return deps.json({ok:true,state:await overview(env,user,season)});
  }
  if(path==='clan/admin/test-settle'&&request.method==='POST'){
    if(!owner||settings.mode!=='TEST')return deps.json({error:'TEST 상태의 OWNER만 테스트 시즌을 정산할 수 있습니다.'},403);if(season.phase!=='ACTIVE'&&season.phase!=='SETTLEMENT')return deps.json({error:'진행 중인 테스트 클랜전만 정산할 수 있습니다.'},409);if(season.phase==='ACTIVE'){await env.DB.prepare("UPDATE clan_seasons SET phase='SETTLEMENT',updated_at=CURRENT_TIMESTAMP WHERE id=? AND phase='ACTIVE'").bind(season.id).run();season=await env.DB.prepare('SELECT * FROM clan_seasons WHERE id=?').bind(season.id).first()}season=await settleSeason(env,season);return deps.json({ok:true,state:await overview(env,user,season)});
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

export const __clanTest={normalizeScores,currentDraftPosition,cleanRole,isOwner,publicSeason,warWinnerClanId,cleanClanAdminSettings,clanAdminState,CLAN_ADMIN_SETTINGS_DEFAULTS,CLAN_MAX_MEMBERS,CLAN_MAX_PARTICIPANTS,CLAN_ATTACKS_PER_WAR,CLAN_DEFENSES_PER_TARGET,CLAN_REPEAT_TARGET_LIMIT,CLAN_MARKS,OFFICIAL_CLAN_CATALOG,FOUNDATION_SQL};
