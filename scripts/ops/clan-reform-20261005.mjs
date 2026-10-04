import assert from 'node:assert/strict';
import {clanReformSchema} from '../../functions/_clan_governance.js';
export const CLAN_REFORM_OPERATION='ops:clan-reform:20261005:v1';
// Explicit release operation, never invoked by a page view or an unauthenticated route.
// Schema and settings become visible atomically after the reviewed runtime deploy.
export async function activateClanReform(client,{dryRun=false,now=Date.now()}={}){
  const q=async(text,values=[])=>(await client.query(text,values)).rows;
  await q('BEGIN');
  try{
    await q("SET LOCAL TIME ZONE 'UTC'");await q("SET LOCAL lock_timeout='3s'");await q("SET LOCAL statement_timeout='20s'");
    await q('SELECT pg_advisory_xact_lock(hashtextextended($1,0))',[CLAN_REFORM_OPERATION]);
    const [prior]=await q('SELECT value FROM app_meta WHERE key=$1',[CLAN_REFORM_OPERATION]);if(prior){await q('ROLLBACK');return {replayed:true,...JSON.parse(prior.value)};}
    await q('LOCK TABLE clan_wars,clan_seasons,clan_members IN SHARE ROW EXCLUSIVE MODE NOWAIT');
    const [settingsRow]=await q("SELECT value FROM app_meta WHERE key='clan_settings_v1' FOR UPDATE");assert.ok(settingsRow,'Settings required');
    const previous=JSON.parse(settingsRow.value);assert.equal(previous.mode,'ON');assert.equal(previous.participationEnabled,true,'Attacker-only positive scoring must already be active');
    assert.deepEqual([...previous.openDays].sort(),[0,2,4,6]);
    const [season]=await q('SELECT * FROM clan_seasons ORDER BY season_no DESC,id DESC LIMIT 1');assert.equal(season.phase,'ACTIVE');
    const at=new Date(now).toISOString();
    assert.equal((await q("SELECT id FROM clan_wars WHERE season_id=$1 AND status IN ('ACTIVE','CLOSING')",[season.id])).length,0,'Apply between rounds only');
    const wars=await q("SELECT * FROM clan_wars WHERE season_id=$1 AND status='SCHEDULED' ORDER BY id FOR UPDATE",[season.id]);assert.ok(wars.length);
    assert.ok(wars.every(w=>Date.parse(w.starts_at)>now&&Number(w.round_no)<1000),'Future regular rounds only');
    const next={...previous,warDurationMinutes:120};
    for(const sql of clanReformSchema(true))await q(sql);
    const before={settings:previous,season,wars};
    await q('INSERT INTO app_meta(key,value) VALUES($1,$2)',[CLAN_REFORM_OPERATION+':before',JSON.stringify(before)]);
    await q("UPDATE app_meta SET value=$1,updated_at=sqlite_now() WHERE key='clan_settings_v1'",[JSON.stringify(next)]);
    let lastEnd=Date.parse(season.ends_at);
    for(const war of wars){const end=new Date(Date.parse(war.starts_at)+7200000).toISOString();lastEnd=Math.max(lastEnd,Date.parse(end));await q("UPDATE clan_wars SET ends_at=$1,updated_at=sqlite_now() WHERE id=$2 AND status='SCHEDULED'",[end,war.id]);}
    await q('UPDATE clan_seasons SET ends_at=$1,updated_at=sqlite_now() WHERE id=$2',[new Date(lastEnd).toISOString(),season.id]);
    await q("INSERT INTO app_meta(key,value) VALUES('clan_reform_schema_v1','1') ON CONFLICT(key) DO NOTHING");
    await q("INSERT INTO app_meta(key,value) VALUES('clan_reform_v1',$1) ON CONFLICT(key) DO UPDATE SET value=excluded.value",[JSON.stringify({enabled:true,activatedAt:at,operation:CLAN_REFORM_OPERATION})]);
    const result={seasonId:Number(season.id),seasonNo:Number(season.season_no),updatedWars:wars.length,warDurationMinutes:120,openDays:next.openDays,firstStartsAt:wars.map(w=>w.starts_at).sort()[0],seasonEndsAt:new Date(lastEnd).toISOString(),activatedAt:at};
    await q('INSERT INTO app_meta(key,value) VALUES($1,$2)',[CLAN_REFORM_OPERATION,JSON.stringify(result)]);
    await q(dryRun?'ROLLBACK':'COMMIT');return {dryRun,...result};
  }catch(error){await q('ROLLBACK').catch(()=>{});throw error;}
}
