import {CLAN_RESUMPTION_STATE_KEY,CLAN_RESUMPTION_AVAILABLE_AT,CLAN_RESUMPTION_VERSION,activeClanResumption,regularClanRules} from '../shared/clan-resumption-v1.mjs';
import {CLAN_RANKED_TEAMS_SQL} from './_clan_ranking.js';
export async function readClanResumption(env,now=Date.now()){
 if(now<CLAN_RESUMPTION_AVAILABLE_AT)return null;
 const row=await env.DB.prepare('SELECT value FROM app_meta WHERE key=?').bind(CLAN_RESUMPTION_STATE_KEY).first();
 return row?activeClanResumption(JSON.parse(row.value),now):null;
}
export async function mirrorResumedClanJoin(q,round,userId,clanId,slot,now){
 const [row]=await q('SELECT value FROM app_meta WHERE key=$1',[CLAN_RESUMPTION_STATE_KEY]);
 const release=row&&activeClanResumption(JSON.parse(row.value),now);
 if(!release||release.roundId!==round.id)return;
 await q(`INSERT INTO clan_members(season_id,clan_id,user_id,member_role,draft_pick_no)
  SELECT $1::bigint,$2::bigint,$3::bigint,'MEMBER',$4::integer WHERE EXISTS(SELECT 1 FROM clan_seasons WHERE id=$1::bigint AND phase='ACTIVE' AND ends_at::timestamptz>$5::timestamptz)
  ON CONFLICT(season_id,user_id) DO NOTHING`,[release.seasonId,clanId,userId,slot,new Date(now).toISOString()]);
}
// The caller owns the faction settlement receipt and the same database transaction.
export async function settleResumedFactionPoints(q,round,snapshot,now){
 const rule=snapshot.rewardRules;
 if(round.scope!=='LIVE'||snapshot.status!=='SETTLED'||rule?.version!==CLAN_RESUMPTION_VERSION||rule?.pointsPerSession!==1||!Number.isSafeInteger(rule.regularSeasonId))return;
 const [season]=await q('SELECT * FROM clan_seasons WHERE id=$1 FOR UPDATE',[rule.regularSeasonId]);
 const end=Date.parse(season?.ends_at||'');
 const eligible=season&&['ACTIVE','SETTLEMENT'].includes(season.phase)&&snapshot.startsAt>=rule.resumedAt&&snapshot.endsAt<=end;
 const clans=eligible?Object.entries(snapshot.holdings).filter(([id,n])=>Number(id)>=1&&Number(id)<=8&&n>=4).map(([id])=>Number(id)):[];
 snapshot.clanPoints={seasonId:rule.regularSeasonId,requiredTerritories:4,pointsPerSession:1,status:eligible?'SETTLED':'OUTSIDE_SEASON',clans,settledAt:now};
 if(clans.length){
  const updated=await q('UPDATE clan_season_teams SET score=score+1,updated_at=CURRENT_TIMESTAMP WHERE season_id=$1 AND clan_id=ANY($2::bigint[]) RETURNING clan_id',[rule.regularSeasonId,clans]);
  if(updated.length!==clans.length)throw Error('CLAN_POINT_TEAM_MISMATCH');
 }
}
export async function resumedClanCompetitionView(q,state,enabled,now){
 const release=activeClanResumption(state.resumption,now);if(!release)return null;
 const [season]=await q('SELECT * FROM clan_seasons WHERE id=$1',[release.seasonId]);
 const teams=await q(CLAN_RANKED_TEAMS_SQL.replace('?', '$1'),[release.seasonId]);
 const records=await q("SELECT snapshot_json FROM organization_faction_settlements_v1 WHERE round_id=$1 AND snapshot_json::jsonb->'clanPoints'->>'seasonId'=$2 ORDER BY created_at DESC",[release.roundId,String(release.seasonId)]);
 const snapshots=records.map(r=>JSON.parse(r.snapshot_json)),holdings=Object.fromEntries(teams.map(t=>[Number(t.clan_id),state.districts.filter(d=>d.owner===Number(t.clan_id)).length]));
 return {enabled,pointsIncluded:true,scoringMode:'REGULAR_SEASON',regularScheduleLabel:regularClanRules(release).regularLabel,requiredTerritories:4,pointsPerSession:1,pointsPerTerritory:0,nextWeeklyAt:null,weeklyStandings:[],weeklyHistory:state.competition?.weeklyHistory||[],seasonHistory:state.competition?.seasonHistory||[],
  season:season?{number:Number(season.season_no),id:Number(season.id),startsAt:Date.parse(season.starts_at),endsAt:Date.parse(season.ends_at),phase:season.phase}:null,
  standings:teams.map((t,i)=>({organizationId:Number(t.clan_id),points:Number(t.score),rank:i+1,territories:holdings[t.clan_id],factionPoints:snapshots.filter(s=>s.clanPoints.status==='SETTLED'&&s.clanPoints.clans.includes(Number(t.clan_id))).length})),
  holdings,sessionHistory:snapshots.slice(0,20).map(s=>({key:s.key,endsAt:s.endsAt,...s.clanPoints}))};
}
