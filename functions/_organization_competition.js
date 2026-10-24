import {ORGANIZATIONS} from '../shared/organization-system-v1.mjs';
import {ORGANIZATION_COMPETITION_RELEASE,ORGANIZATION_WEEK_MS as WEEK,organizationWeekStart,organizationPointRanking} from '../shared/organization-competition-v1.mjs';

const zeroPoints=()=>Object.fromEntries(ORGANIZATIONS.map(o=>[o.id,0]));
export function organizationHoldings(state) {
  const counts=zeroPoints();
  for(const district of state.districts)if(Object.hasOwn(counts,district.owner))counts[district.owner]++;
  return counts;
}
const season=(number,startsAt,weeks)=>({number,startsAt,endsAt:startsAt+weeks*WEEK,weeks,weeksSettled:0,points:zeroPoints()});

// Called while the faction row is locked, before any new capture can occur.
// With no intervening actions the persisted map also represents missed cutoffs.
export function advanceOrganizationCompetition(state,{now,enabled,policy}) {
  const records=[];
  if(now<ORGANIZATION_COMPETITION_RELEASE)return records;
  if(!state.competition){
    if(!enabled)return records;
    const startsAt=organizationWeekStart(now);
    state.competition={version:1,initializedAt:now,nextWeeklyAt:startsAt+WEEK,
      season:season(1,startsAt,policy.competition?.seasonWeeks||4),weeklyHistory:[],seasonHistory:[]};
  }
  const c=state.competition,holdings=organizationHoldings(state);
  while(c.nextWeeklyAt<=now){
    const s=c.season,at=c.nextWeeklyAt,points=enabled?holdings:zeroPoints();
    for(const o of ORGANIZATIONS)s.points[o.id]+=points[o.id];
    s.weeksSettled++;
    const weekly={kind:'WEEKLY',key:'competition:v1:week:'+at,status:enabled?'SETTLED':'SKIPPED',
      seasonNo:s.number,week:s.weeksSettled,startsAt:at-WEEK,endsAt:at,settledAt:now,
      pointsPerTerritory:1,rows:organizationPointRanking(ORGANIZATIONS,points,holdings)};
    records.push(weekly);c.weeklyHistory=[weekly,...c.weeklyHistory].slice(0,12);
    c.nextWeeklyAt+=WEEK;
    if(at===s.endsAt){
      const final={kind:'SEASON',key:'competition:v1:season:'+s.number,status:'SETTLED',
        seasonNo:s.number,startsAt:s.startsAt,endsAt:s.endsAt,settledAt:now,weeks:s.weeks,
        pointsPerTerritory:1,rows:organizationPointRanking(ORGANIZATIONS,s.points,holdings)};
      records.push(final);c.seasonHistory=[final,...c.seasonHistory].slice(0,12);
      c.season=season(s.number+1,at,policy.competition?.seasonWeeks||4);
    }
  }
  return records;
}

export function organizationCompetitionView(state,policy,enabled) {
  const c=state.competition,holdings=organizationHoldings(state),pending=enabled?holdings:zeroPoints();
  return {enabled,initializedAt:c?.initializedAt||null,pointsPerTerritory:1,timeZone:'Asia/Seoul',
    weeklySchedule:'매주 월요일 00:00 (한국시간)',nextWeeklyAt:c?.nextWeeklyAt||null,
    nextSeasonWeeks:policy.competition?.seasonWeeks||4,
    season:c?{...c.season,points:undefined}:null,
    standings:organizationPointRanking(ORGANIZATIONS,c?.season.points||zeroPoints(),holdings)
      .map(row=>({...row,pendingPoints:pending[row.organizationId]})),
    weeklyStandings:organizationPointRanking(ORGANIZATIONS,pending,holdings),
    weeklyHistory:c?.weeklyHistory||[],seasonHistory:c?.seasonHistory||[]};
}

export async function recordOrganizationCompetition(q,round,records,now) {
  for(const snapshot of records)await q(
    'INSERT INTO organization_faction_settlements_v1(round_id,session_key,snapshot_json,created_at) VALUES($1,$2,$3,$4) ON CONFLICT DO NOTHING',
    [round.id,snapshot.key,JSON.stringify(snapshot),now]);
}
