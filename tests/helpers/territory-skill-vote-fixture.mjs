import {territorySkillVoteKey} from '../../functions/_territory_skill_votes.js';

export const voteSchema=`CREATE TABLE territory_war_v3_operation_votes(round_id INTEGER NOT NULL,user_id INTEGER NOT NULL,side TEXT NOT NULL,operation TEXT NOT NULL,created_at TEXT DEFAULT CURRENT_TIMESTAMP,updated_at TEXT DEFAULT CURRENT_TIMESTAMP,PRIMARY KEY(round_id,user_id));`;
export async function seedTerritorySkillVotes(f,operation,side='A',count=25,{frontId=1,roundId=1}={}){
  const cooldown=await f.p('SELECT ready_at_ms FROM territory_war_skill_cooldowns WHERE round_id=? AND side=? AND operation=?',roundId,side,operation).first();
  const voteKey=territorySkillVoteKey(roundId,frontId,side,operation,Number(cooldown?.ready_at_ms||0));
  for(let i=0;i<count;i++){
    const user=5000+(side==='A'?0:100)+i;
    await f.p("INSERT INTO territory_war_v3_users(round_id,user_id,side,status) VALUES(?,?,?,'ACTIVE') ON CONFLICT(round_id,user_id) DO NOTHING",roundId,user,side).run();
    await f.p('INSERT INTO territory_war_v3_operation_votes(round_id,user_id,side,operation) VALUES(?,?,?,?) ON CONFLICT(round_id,user_id) DO UPDATE SET side=excluded.side,operation=excluded.operation',roundId,user,side,voteKey).run();
  }
  return voteKey;
}
