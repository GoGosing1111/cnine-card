import {seasonAdmissionFixture} from './clan-season-admission-fixture.mjs';
export async function seasonKickFixture(t){
 const f=await seasonAdmissionFixture(t);
 // The admission fixture omits the classic faction table because joining does
 // not touch it. Removal shares both faction stores in the real schema.
 await f.pg.exec('CREATE TABLE clan_faction_state(season_id bigint PRIMARY KEY,revision integer,state_json text)');
 await f.q('INSERT INTO clan_faction_state SELECT $1,0,state_json FROM organization_faction_state_v1 WHERE round_id=$2',[f.season.seasonId,f.season.roundId]);
 return f;
}
