import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {PGlite} from '@electric-sql/pglite';
import {CLAN_RANKED_TEAMS_SQL,clanCombatStats} from '../functions/_clan_ranking.js';
import {__postgresCompatTest} from '../functions/_postgres_d1_compat.js';

test('ranking uses season points, completed-war points and difference without changing records',async t=>{
  const pg=new PGlite();t.after(()=>pg.close());
  await pg.exec(`
    CREATE TABLE clan_season_teams(season_id bigint,clan_id bigint,master_user_id bigint,score int,wins int,losses int,draft_position int);
    CREATE TABLE clan_organizations(id bigint,name text,mark_key text,primary_color text,accent_color text,slogan text);
    CREATE TABLE users(id bigint,nickname text);
    CREATE TABLE clan_members(season_id bigint,clan_id bigint,user_id bigint);
    CREATE TABLE clan_wars(season_id bigint,clan_a_id bigint,clan_b_id bigint,score_a bigint,score_b bigint,status text);
    INSERT INTO clan_season_teams VALUES(4,4,40,9,3,0,3),(4,7,70,9,3,0,6),(3,7,70,999,99,0,0);
    INSERT INTO clan_organizations(id,name) VALUES(4,'한화'),(7,'FM');
    INSERT INTO users VALUES(40,'리네트'),(70,'Moo블루');
    INSERT INTO clan_members VALUES(4,4,40),(4,7,70);
    INSERT INTO clan_wars VALUES
      (4,4,5,387,377,'COMPLETED'),(4,3,4,762,835,'COMPLETED'),(4,4,8,916,855,'COMPLETED'),
      (4,2,7,359,426,'COMPLETED'),(4,7,1,832,822,'COMPLETED'),(4,5,7,810,906,'COMPLETED'),
      (4,4,7,90000,0,'ACTIVE'),(4,4,7,90000,0,'CANCELLED'),(4,4,7,90000,0,'SCHEDULED'),(3,4,7,90000,0,'COMPLETED');
  `);
  const db=new __postgresCompatTest.PostgresD1Database({async query(input){
    const r=await pg.query(typeof input==='string'?input:input.text,typeof input==='string'?[]:input.values||[]);
    return {...r,rowCount:r.affectedRows??r.rows.length};
  }});
  const rank=async()=>(await db.prepare(CLAN_RANKED_TEAMS_SQL).bind(4).all()).results;
  let teams=await rank();
  assert.deepEqual(teams.map(t=>t.name),['FM','한화']);
  assert.deepEqual(clanCombatStats(teams[0]),{combatPoints:2164,combatPointsAgainst:1991,combatPointDifference:173});
  assert.deepEqual(clanCombatStats(teams[1]),{combatPoints:2138,combatPointsAgainst:1994,combatPointDifference:144});
  assert.deepEqual(teams.map(t=>[Number(t.score),Number(t.wins),Number(t.losses),Number(t.draft_position)]),[[9,3,0,6],[9,3,0,3]]);
  await pg.exec('UPDATE clan_season_teams SET score=10 WHERE season_id=4 AND clan_id=4');
  assert.equal((await rank())[0].name,'한화','season points remain the primary key');
  await pg.exec("UPDATE clan_season_teams SET score=9 WHERE season_id=4; UPDATE clan_wars SET score_a=413 WHERE season_id=4 AND clan_a_id=4 AND clan_b_id=5 AND status='COMPLETED'");
  teams=await rank();assert.equal(Number(teams[0].combat_points),2164);assert.equal(Number(teams[1].combat_points),2164);
  assert.equal(teams[0].name,'FM','equal combat points use difference before draft order');
  await pg.exec("UPDATE clan_wars SET score_b=374 WHERE season_id=4 AND clan_a_id=4 AND clan_b_id=5 AND status='COMPLETED'");
  assert.equal((await rank())[0].name,'한화','fully equal stats retain the deterministic draft fallback');
  await pg.exec('DELETE FROM clan_wars');
  teams=await rank();assert.equal(teams[0].name,'한화');assert.deepEqual(clanCombatStats(teams[0]),{combatPoints:0,combatPointsAgainst:0,combatPointDifference:0});
});

test('live, CMS and settlement share the same ordering; nickname buttons retain inline link sizing',()=>{
  const read=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');
  assert.equal((read('functions/_clan.js').match(/prepare\(CLAN_RANKED_TEAMS_SQL\)/g)||[]).length,3);
  assert.match(read('js/clan-v1.js'),/승점 → 누적 전투점수 → 득실차/);
  const css=read('css/player-card-v2052.css');
  assert.match(css,/\.clan-shell button\.player-card-name\{[^}]*height:auto;min-height:0/);
  assert.match(css,/\.clan-shell button\.player-card-name:hover\{[^}]*background:none/);
  assert.match(css,/\.player-card-name:focus-visible\{outline:2px/);
});
