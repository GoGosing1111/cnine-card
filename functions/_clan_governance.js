import {readRuntimeData,cacheRuntimeData} from './_runtime_data_cache.js';
import {CLAN_REFORM_KEY} from '../shared/clan-war-reform-v1.mjs';

export async function clanReformEnabled(env){
  const cached=readRuntimeData(env,CLAN_REFORM_KEY);if(cached!==null&&cached!==undefined)return cached;
  const row=await env.DB.prepare('SELECT value FROM app_meta WHERE key=?').bind(CLAN_REFORM_KEY).first();
  let enabled=false;try{enabled=JSON.parse(row?.value||'{}').enabled===true;}catch{}
  cacheRuntimeData(env,CLAN_REFORM_KEY,enabled,5000);return enabled;
}
export function clanReformSchema(postgres=false){
  const int=postgres?'BIGINT':'INTEGER';
  return [
    `CREATE TABLE IF NOT EXISTS clan_executives(season_id ${int} NOT NULL,clan_id ${int} NOT NULL,user_id ${int} NOT NULL,power DOUBLE PRECISION NOT NULL,position INTEGER NOT NULL,checked_ms ${int} NOT NULL,PRIMARY KEY(season_id,clan_id,user_id))`,
    `CREATE TABLE IF NOT EXISTS clan_weekly_availability(season_id ${int} NOT NULL,clan_id ${int} NOT NULL,user_id ${int} NOT NULL,week_start TEXT NOT NULL,days_json TEXT NOT NULL,updated_ms ${int} NOT NULL,PRIMARY KEY(season_id,user_id,week_start))`,
    `CREATE TABLE IF NOT EXISTS clan_war_readiness(war_id ${int} NOT NULL,user_id ${int} NOT NULL,clan_id ${int} NOT NULL,status TEXT NOT NULL,updated_ms ${int} NOT NULL,PRIMARY KEY(war_id,user_id))`,
    `CREATE TABLE IF NOT EXISTS clan_war_field_state(war_id ${int} PRIMARY KEY,state_json TEXT NOT NULL,updated_ms ${int} NOT NULL)`,
    `CREATE TABLE IF NOT EXISTS clan_war_field_receipts(request_key TEXT PRIMARY KEY,user_id ${int} NOT NULL,war_id ${int} NOT NULL,input_json TEXT NOT NULL,result_json TEXT NOT NULL,created_ms ${int} NOT NULL)`,
    'CREATE INDEX IF NOT EXISTS idx_clan_field_receipts_war ON clan_war_field_receipts(war_id,user_id)'
  ];
}
export async function ensureClanReform(env){
  const key='clan_reform_schema_v1';if(readRuntimeData(env,key))return;
  const found=await env.DB.prepare('SELECT value FROM app_meta WHERE key=?').bind(key).first();
  if(!found){const sql=clanReformSchema(env.DB.dialect==='postgres');if(env.DB.dialect==='postgres')await env.DB.execSchema(sql);else await env.DB.batch(sql.map(s=>env.DB.prepare(s)));
    await env.DB.prepare('INSERT INTO app_meta(key,value) VALUES(?,?) ON CONFLICT(key) DO NOTHING').bind(key,'1').run();}
  cacheRuntimeData(env,key,true,1800000);
}
// This is the same five-card combat-power calculation used by clan matchmaking.
// A mutation refreshes it rather than trusting a role supplied by the client.
export async function refreshClanExecutives(env,deps,seasonId,clanId,{force=false}={}){
  await ensureClanReform(env);
  const now=Date.now(),key=`clan_exec:${seasonId}:${clanId}`;
  if(!force&&readRuntimeData(env,key))return executiveRows(env,seasonId,clanId);
  const members=(await env.DB.prepare(`SELECT m.user_id,COALESCE((SELECT p.card_ids FROM pvp_active_presets a JOIN pvp_deck_presets p ON p.user_id=a.user_id AND p.preset_no=a.preset_no WHERE a.user_id=m.user_id),d.card_ids) card_ids FROM clan_members m LEFT JOIN pvp_decks d ON d.user_id=m.user_id WHERE m.season_id=? AND m.clan_id=? ORDER BY m.user_id`).bind(seasonId,clanId).all()).results||[];
  const settings=await deps.battleSettings(env),ranked=[];
  // Bound concurrency to avoid exhausting Hyperdrive connections for large clans.
  for(let i=0;i<members.length;i+=4)ranked.push(...await Promise.all(members.slice(i,i+4).map(async m=>{
    let ids=[];try{ids=JSON.parse(m.card_ids||'[]');}catch{}
    const cards=Array.isArray(ids)&&ids.length===5?await deps.pvpDeckSnapshotByIds(env,Number(m.user_id),ids.map(String)):[];
    const power=cards.length===5?cards.reduce((sum,c)=>sum+Math.max(0,Number(deps.cardBattlePower(c,c.breakthrough_level,settings))||0),0):0;
    return {userId:Number(m.user_id),power};
  })));
  ranked.sort((a,b)=>b.power-a.power||a.userId-b.userId);
  const selected=ranked.slice(0,3);
  const statements=[env.DB.prepare('DELETE FROM clan_executives WHERE season_id=? AND clan_id=?').bind(seasonId,clanId),...selected.map((m,i)=>env.DB.prepare(`INSERT INTO clan_executives(season_id,clan_id,user_id,power,position,checked_ms) SELECT ?,?,?,?,?,? WHERE EXISTS(SELECT 1 FROM clan_members WHERE season_id=? AND clan_id=? AND user_id=?)`).bind(seasonId,clanId,m.userId,m.power,i+1,now,seasonId,clanId,m.userId))];
  if(env.DB.dialect==='postgres')statements.unshift(env.DB.prepare('SELECT clan_id FROM clan_season_teams WHERE season_id=? AND clan_id=? FOR UPDATE').bind(seasonId,clanId));
  await env.DB.batch(statements);cacheRuntimeData(env,key,true,60000);
  return executiveRows(env,seasonId,clanId);
}
export async function executiveRows(env,seasonId,clanId){
  return ((await env.DB.prepare(`SELECT e.*,u.nickname FROM clan_executives e JOIN clan_members m ON m.season_id=e.season_id AND m.clan_id=e.clan_id AND m.user_id=e.user_id JOIN users u ON u.id=e.user_id WHERE e.season_id=? AND e.clan_id=? ORDER BY e.position`).bind(seasonId,clanId).all()).results||[]).map(r=>({userId:Number(r.user_id),nickname:r.nickname,power:Number(r.power),position:Number(r.position),checkedAt:Number(r.checked_ms)}));
}
export async function clanExecutive(env,seasonId,userId){
  return Boolean(await env.DB.prepare('SELECT 1 ok FROM clan_executives e JOIN clan_members m ON m.season_id=e.season_id AND m.clan_id=e.clan_id AND m.user_id=e.user_id WHERE e.season_id=? AND e.user_id=?').bind(seasonId,userId).first());
}
