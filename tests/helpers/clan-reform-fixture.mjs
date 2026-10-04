import {factionFixture} from './clan-faction-fixture.mjs';
import {ensureClanReform,refreshClanExecutives} from '../../functions/_clan_governance.js';
export async function clanReformFixture(){
  const f=await factionFixture({postgres:true});
  await f.DB.execSchema([
    "CREATE FUNCTION sqlite_now() RETURNS TEXT LANGUAGE SQL AS 'SELECT CURRENT_TIMESTAMP::text'",
    'ALTER TABLE app_meta ADD COLUMN updated_at TEXT',
    'ALTER TABLE clan_members ADD COLUMN contribution_score INTEGER DEFAULT 0',
    'ALTER TABLE clan_members ADD COLUMN updated_at TEXT',
    "ALTER TABLE clan_members ADD COLUMN member_role TEXT DEFAULT 'MEMBER'",
    "CREATE TABLE clan_wars(id BIGINT PRIMARY KEY,season_id BIGINT,round_no INTEGER,clan_a_id BIGINT,clan_b_id BIGINT,status TEXT,score_a INTEGER DEFAULT 0,score_b INTEGER DEFAULT 0,starts_at TEXT,ends_at TEXT,updated_at TEXT)",
    'CREATE TABLE pvp_decks(user_id BIGINT PRIMARY KEY,card_ids TEXT)',
    'CREATE TABLE pvp_active_presets(user_id BIGINT PRIMARY KEY,preset_no INTEGER)',
    'CREATE TABLE pvp_deck_presets(user_id BIGINT,preset_no INTEGER,card_ids TEXT)',
    'CREATE TABLE clan_championship_members(season_id BIGINT,user_id BIGINT,clan_id BIGINT)'
  ]);
  f.clock.now=Date.parse('2026-10-06T12:00:00Z');f.start=f.clock.now;
  await f.p("INSERT INTO app_meta(key,value) VALUES('clan_reform_v1',?)",JSON.stringify({enabled:true})).run();
  await f.p("INSERT INTO clan_wars(id,season_id,round_no,clan_a_id,clan_b_id,status,starts_at,ends_at) VALUES(17,7,1,1,2,'ACTIVE',?,?)",new Date(f.start).toISOString(),new Date(f.start+7200000).toISOString()).run();
  for(let id=1;id<=12;id++)await f.p('INSERT INTO pvp_decks VALUES(?,?)',id,JSON.stringify(['1','2','3','4','5'])).run();
  const powers={1:10,2:20,3:30,4:100,5:100,6:200};
  f.deps.battleSettings=async()=>({});f.deps.pvpDeckSnapshotByIds=async(env,id,ids)=>ids.map(id2=>({id:id2,power:powers[id]||0}));f.deps.cardBattlePower=card=>card.power;
  await ensureClanReform(f.env);await refreshClanExecutives(f.env,f.deps,7,1);
  return f;
}
