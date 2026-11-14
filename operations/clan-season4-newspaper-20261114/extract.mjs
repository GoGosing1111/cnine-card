import fs from 'node:fs';
import assert from 'node:assert/strict';
import {connect,safe} from '../rap-contest-rewards-20261027/preflight.mjs';
import {CLAN_RANKED_TEAMS_SQL} from '../../functions/_clan_ranking.js';
const db=connect(), timings=[];
try {
  await db.connect();
  await db.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
  await db.query("SET LOCAL statement_timeout='20s'");
  const q=async(label,sql,args=[])=>{const t=performance.now();const r=(await db.query(sql,args)).rows;timings.push({label,ms:Math.round(performance.now()-t),rows:r.length});return r};
  const [clock]=await q('snapshot','SELECT clock_timestamp() AS at');
  const [season]=await q('season','SELECT * FROM clan_seasons WHERE id=$1',[9]);
  assert.equal(Number(season.season_no),4); assert.equal(season.phase,'COMPLETE');
  const ranks=await q('rankings',CLAN_RANKED_TEAMS_SQL.replace('?','$1'),[9]);
  const wars=await q('wars',`SELECT w.*,a.name AS team_a,b.name AS team_b FROM clan_wars w JOIN clan_organizations a ON a.id=w.clan_a_id JOIN clan_organizations b ON b.id=w.clan_b_id WHERE w.season_id=$1 ORDER BY w.round_no,w.id`,[9]);
  const attackStats=await q('attack_stats',`SELECT b.war_id,b.attacker_clan_id AS clan_id,o.name,COUNT(*)::int AS attacks,COUNT(*) FILTER(WHERE b.winner_clan_id=b.attacker_clan_id)::int AS wins,COALESCE(SUM(r.points),0)::int AS receipt_points,COUNT(r.battle_id)::int AS receipts FROM clan_war_battles b JOIN clan_organizations o ON o.id=b.attacker_clan_id LEFT JOIN clan_participation_receipts r ON r.battle_id=b.id AND r.status='COMPLETED' WHERE b.season_id=$1 AND b.status='COMPLETED' GROUP BY b.war_id,b.attacker_clan_id,o.name ORDER BY b.war_id,b.attacker_clan_id`,[9]);
  const players=await q('player_stats',`WITH appearances AS (
    SELECT b.attacker_user_id AS user_id,b.attacker_clan_id AS clan_id,w.round_no,1 AS attack,CASE WHEN b.winner_clan_id=b.attacker_clan_id THEN 1 ELSE 0 END AS win FROM clan_war_battles b JOIN clan_wars w ON w.id=b.war_id WHERE b.season_id=$1 AND b.status='COMPLETED'
    UNION ALL SELECT b.defender_user_id,b.defender_clan_id,w.round_no,0,CASE WHEN b.winner_clan_id=b.defender_clan_id THEN 1 ELSE 0 END FROM clan_war_battles b JOIN clan_wars w ON w.id=b.war_id WHERE b.season_id=$1 AND b.status='COMPLETED'
  ) SELECT CASE WHEN p.round_no<1000 THEN 'regular' WHEN p.round_no=1001 THEN 'semifinal' ELSE 'final' END AS stage,p.user_id,u.nickname,o.name AS clan,COUNT(*)::int AS engagements,SUM(p.win)::int AS wins,SUM(p.attack)::int AS attacks,SUM(CASE WHEN p.attack=1 THEN p.win ELSE 0 END)::int AS attack_wins,SUM(CASE WHEN p.attack=0 THEN p.win ELSE 0 END)::int AS defense_wins FROM appearances p JOIN users u ON u.id=p.user_id JOIN clan_organizations o ON o.id=p.clan_id GROUP BY stage,p.user_id,u.nickname,o.name ORDER BY stage,wins DESC,engagements ASC,u.nickname`,[9]);
  const fields=await q('field_state','SELECT s.* FROM clan_war_field_state s JOIN clan_wars w ON w.id=s.war_id WHERE w.season_id=$1 ORDER BY s.war_id',[9]);
  const finalFieldReceipts=await q('final_field_receipts','SELECT input_json,result_json,created_ms FROM clan_war_field_receipts WHERE war_id=$1 ORDER BY created_ms',[405]);
  const finalAttacks=await q('final_attack_events',`SELECT o.name AS clan,r.points::int,r.completed_at FROM clan_participation_receipts r JOIN clan_organizations o ON o.id=r.clan_id WHERE r.war_id=$1 AND r.status='COMPLETED' ORDER BY r.completed_at,r.battle_id`,[405]);
  const history=await q('champion_history',`SELECT s.season_no::int,s.starts_at,s.ends_at,s.phase,a.name AS regular_champion,b.name AS champions_winner,t.status AS regular_status,c.status AS champions_status FROM clan_seasons s LEFT JOIN clan_season_settlements t ON t.season_id=s.id LEFT JOIN clan_organizations a ON a.id=t.champion_clan_id LEFT JOIN clan_championships c ON c.season_id=s.id LEFT JOIN clan_organizations b ON b.id=c.winner_clan_id WHERE s.season_no<=4 AND t.status='COMPLETED' ORDER BY s.season_no,s.id`);
  const roster=await q('frozen_roster','SELECT o.name AS clan,u.nickname FROM clan_championship_members m JOIN clan_organizations o ON o.id=m.clan_id JOIN users u ON u.id=m.user_id WHERE m.season_id=$1 ORDER BY o.name,u.nickname',[9]);
  const status=await q('battle_status','SELECT status,COUNT(*)::int AS count FROM clan_war_battles WHERE season_id=$1 GROUP BY status',[9]);
  await db.query('ROLLBACK');
  for(const w of wars){assert.equal(w.status,'COMPLETED');const a=attackStats.filter(x=>x.war_id===w.id);assert.equal(a.reduce((n,x)=>n+x.attacks,0),Number(w.battle_count));for(const s of a){assert.equal(s.receipts,s.attacks);assert.equal(s.receipt_points,s.wins*3+s.attacks-s.wins)}}
  const total=wars.reduce((n,w)=>n+Number(w.battle_count),0);assert.equal(total,status.find(s=>s.status==='COMPLETED').count);assert.equal(players.reduce((n,p)=>n+p.engagements,0),total*2);assert.equal(players.reduce((n,p)=>n+p.wins,0),total);
  const snapshot={at:clock.at,transaction:'REPEATABLE READ READ ONLY',season,ranks,wars,attackStats,players,fields,finalFieldReceipts,finalAttacks,history,roster,status,timings,checks:{battleCount:total,playerEngagements:total*2,playerWins:total,receiptsVerified:true,allWarsCompleted:true}};
  fs.writeFileSync(new URL('snapshot.json',import.meta.url),JSON.stringify(snapshot,null,2)+'\n');
  console.log(JSON.stringify({at:clock.at,timings,checks:snapshot.checks,regularTop:players.filter(p=>p.stage==='regular').slice(0,12),finalPlayers:players.filter(p=>p.stage==='final').slice(0,7),finalAttackStats:attackStats.filter(x=>x.war_id==='405'),history,fieldSample:fields.slice(-1),receiptSample:finalFieldReceipts.slice(-3)},null,2));
}catch(e){await db.query('ROLLBACK').catch(()=>{});console.error(safe(e));process.exitCode=1}finally{await db.end().catch(()=>{})}
