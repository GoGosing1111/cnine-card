// An immutable deployment cutoff separates old awards from the new collection.
// All readers are SELECT-only; viewing a card never awards or migrates anything.
export const TROPHY_RENEWAL_KEY='trophy_renewal_20261101_v1';
export const RENEWED_TROPHY_CODES=Object.freeze(['BLACKWING_CLEAR_15','CHALLENGER_STREAK_3_V2','CLAN_CHAMPIONS_TROPHY_V2','CLAN_CHAMPION_V2']);
export const emptyRenewedHonors=()=>Object.fromEntries(RENEWED_TROPHY_CODES.map(code=>[code,{count:0,progress:0,goal:code==='BLACKWING_CLEAR_15'?15:code==='CHALLENGER_STREAK_3_V2'?3:1,acquiredAt:null}]));
export function parseTrophyRenewal(raw){
 if(raw==null)return null;
 const value=JSON.parse(raw),at=Date.parse(value?.launchedAt);
 if(value?.version!==1||!Number.isSafeInteger(at)||at<=0||at%1000!==0||new Date(at).toISOString()!==value.launchedAt)throw Error('INVALID_TROPHY_RENEWAL');
 return value;
}
// clearRewards is the frozen participant proof. A later departure only changes
// members[].left, so it must not remove a successfully completed raid.
export const BLACKWING_TROPHY_SQL=`WITH clears AS (
 SELECT r.room_id,CAST(json_extract(r.state_json,'$.finishedAt') AS BIGINT) finished_at,
 ROW_NUMBER() OVER (ORDER BY CAST(json_extract(r.state_json,'$.finishedAt') AS BIGINT),r.room_id) ordinal
 FROM raid_blackwing_rooms_v1 r WHERE r.status='CLEAR'
 AND json_extract(r.state_json,'$.releaseMode')='ON'
 AND CAST(json_extract(r.state_json,'$.finishedAt') AS BIGINT)>=?
 AND json_extract(json_extract(r.state_json,'$.clearRewards'),?) IS NOT NULL
 ) SELECT COUNT(*) progress,MIN(CASE WHEN ordinal=15 THEN finished_at END) first_at FROM clears`;
export async function readBlackwingTrophy(env,userId,launchedAt){
 const row=await env.DB.prepare(BLACKWING_TROPHY_SQL).bind(Date.parse(launchedAt),'$.'+Number(userId)).first();
 const progress=Number(row?.progress||0);
 return {count:progress>=15?1:0,progress,goal:15,acquiredAt:row?.first_at?new Date(Number(row.first_at)).toISOString():null};
}
const n=v=>Math.max(0,Number(v)||0);
const wins=r=>({count:n(r?.wins),progress:n(r?.wins),goal:1,acquiredAt:r?.first_at||null});
const streak=r=>({count:n(r?.longest_streak)>=3?1:0,progress:n(r?.current_streak),goal:3,acquiredAt:r?.streak_at||null});
export async function readTrophyRenewalHonors(env,userId,{rankedSql,clanSql,championsSql,newCodes}={}){
 const result=emptyRenewedHonors(),row=await env.DB.prepare('SELECT value FROM app_meta WHERE key=?').bind(TROPHY_RENEWAL_KEY).first();
 const release=parseTrophyRenewal(row?.value);if(!release)return result;
 const at=release.launchedAt,selected=new Set(newCodes??RENEWED_TROPHY_CODES);
 // Filtering happens BEFORE the window functions. A missing/unfinished or
 // non-challenger official season still breaks each era's streak as before.
 const ranked=op=>rankedSql.replace("AND s.completed_at IS NOT NULL",`AND s.completed_at IS NOT NULL AND datetime(s.completed_at)${op}datetime(?)`);
 const clan=op=>`SELECT COUNT(*) wins,MIN(x.completed_at) first_at ${clanSql} AND datetime(x.completed_at)${op}datetime(?)`;
 const champions=op=>`${championsSql} AND datetime(c.completed_at)${op}datetime(?)`;
 const query=sql=>env.DB.prepare(sql).bind(userId,at).first();
 const [oldRanked,oldClan,oldChampions,newRanked,newClan,newChampions,blackwing]=await Promise.all([
  query(ranked('<')),query(clan('<')),query(champions('<')),
  selected.has('CHALLENGER_STREAK_3_V2')?query(ranked('>=')):null,
  selected.has('CLAN_CHAMPION_V2')?query(clan('>=')):null,
  selected.has('CLAN_CHAMPIONS_TROPHY_V2')?query(champions('>=')):null,
  selected.has('BLACKWING_CLEAR_15')?readBlackwingTrophy(env,userId,at):null
 ]);
 return {
  ...result,
  CHALLENGER_STREAK_3:{...streak(oldRanked),availableUntil:at},
  CLAN_CHAMPION:{...wins(oldClan),availableUntil:at},
  CLAN_CHAMPIONS_TROPHY:{...wins(oldChampions),availableUntil:at},
  CHALLENGER_STREAK_3_V2:{...streak(newRanked),availableFrom:at},
  CLAN_CHAMPION_V2:{...wins(newClan),availableFrom:at},
  CLAN_CHAMPIONS_TROPHY_V2:{...wins(newChampions),availableFrom:at},
  BLACKWING_CLEAR_15:{...(blackwing||result.BLACKWING_CLEAR_15),availableFrom:at}
 };
}
