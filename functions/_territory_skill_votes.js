// Existing vote rows hold one current choice per participant. Poll identities
// include the front and cooldown generation so old votes cannot fire again.
export const TERRITORY_SKILL_REQUIRED_VOTES=25;
export const territorySkillVoteKey=(roundId,frontId,side,operation,readyAt=0)=>`V25:${Number(roundId)}:${Number(frontId)}:${side}:${operation}:${Number(readyAt)}`;
const fail=message=>{throw Object.assign(new Error(message),{status:409})};
export function parseTerritorySkillVoteKey(key){
  const m=/^V25:([1-9]\d*):([1-9]\d*):([AB]):([A-Z_]+):(0|[1-9]\d*)$/.exec(String(key||''));
  if(!m||![m[1],m[2],m[5]].every(n=>Number.isSafeInteger(Number(n))))return null;
  return {roundId:Number(m[1]),frontId:Number(m[2]),side:m[3],operation:m[4],readyAt:Number(m[5])};
}
export const territoryVoteCountSql=`SELECT COUNT(*) FROM territory_war_v3_operation_votes v
  JOIN territory_war_v3_users w ON w.round_id=v.round_id AND w.user_id=v.user_id AND w.side=v.side AND w.status='ACTIVE'
  WHERE v.round_id=? AND v.side=? AND v.operation=?`;
export const territoryVoteActivationId=key=>'TW_AUTO:'+key;
export async function territoryVoteActivation(env,key){
  const row=await env.DB.prepare('SELECT result_json FROM territory_war_skill_receipts WHERE request_id=?').bind(territoryVoteActivationId(key)).first();
  return row?{...JSON.parse(row.result_json),replayed:true}:null;
}
export function territoryVoteActivationGuard(env,{round,front,mine,operation,voteKey,requestId}){
  const poll=parseTerritorySkillVoteKey(voteKey);
  if(!poll||poll.roundId!==Number(round.id)||poll.frontId!==Number(front.id)||poll.side!==mine.side||poll.operation!==operation)fail('전선 또는 투표가 변경되었습니다. 전황을 새로고침해 주세요.');
  return env.DB.prepare(`INSERT INTO territory_war_mutation_guards(token,ok) SELECT ?,CASE WHEN
    (${territoryVoteCountSql})>=? AND COALESCE((SELECT ready_at_ms FROM territory_war_skill_cooldowns WHERE round_id=? AND side=? AND operation=?),0)=?
    THEN 1 ELSE 0 END`).bind(requestId+':votes',round.id,mine.side,voteKey,TERRITORY_SKILL_REQUIRED_VOTES,round.id,mine.side,operation,poll.readyAt);
}
export function territoryVoteCleanup(env,{round,mine,voteKey,requestId}){
  return [env.DB.prepare('DELETE FROM territory_war_v3_operation_votes WHERE round_id=? AND side=? AND operation=?').bind(round.id,mine.side,voteKey),
    env.DB.prepare('DELETE FROM territory_war_mutation_guards WHERE token=?').bind(requestId+':votes')];
}
export async function territoryVoteRows(env,roundId){
  return (await env.DB.prepare(`SELECT v.side,v.operation,COUNT(*) votes FROM territory_war_v3_operation_votes v
    JOIN territory_war_v3_users w ON w.round_id=v.round_id AND w.user_id=v.user_id AND w.side=v.side AND w.status='ACTIVE'
    WHERE v.round_id=? GROUP BY v.side,v.operation`).bind(roundId).all()).results||[];
}
export async function recordTerritorySkillVote(env,{round,front,mine,operation,voteKey,requestId,now=Date.now()}){
  const poll=parseTerritorySkillVoteKey(voteKey);
  if(!poll||poll.roundId!==Number(round.id)||poll.frontId!==Number(front.id)||poll.side!==mine.side||poll.operation!==operation)fail('전선 또는 투표가 변경되었습니다. 전황을 새로고침해 주세요.');
  const old=await env.DB.prepare('SELECT * FROM territory_war_skill_receipts WHERE request_id=?').bind(requestId).first();
  if(old){
    if(Number(old.user_id)!==Number(mine.user_id)||old.operation!==operation)fail('다른 투표에 사용한 요청번호입니다.');
    return {...JSON.parse(old.result_json),replayed:true};
  }
  const token=requestId+':vote',result={voted:true,activated:false,operation,voteKey,requestId,roundId:Number(round.id),frontId:Number(front.id),side:mine.side,requiredVotes:TERRITORY_SKILL_REQUIRED_VOTES};
  await env.DB.batch([
    // All vote changes and skill activations lock the round first. The count
    // and consumption below therefore cannot race a vote switch or another cast.
    env.DB.prepare('UPDATE territory_war_v3_rounds SET version=version WHERE id=?').bind(round.id),
    env.DB.prepare(`INSERT INTO territory_war_mutation_guards(token,ok) SELECT ?,CASE WHEN EXISTS(
      SELECT 1 FROM territory_war_v3_rounds r JOIN territory_war_v3_fronts f ON f.id=r.current_front_id
      JOIN territory_war_v3_users w ON w.round_id=r.id AND w.user_id=? AND w.side=? AND w.status='ACTIVE'
      WHERE r.id=? AND r.warfare_version=4 AND r.status='ACTIVE' AND f.id=? AND f.status='ACTIVE' AND f.a_hp>0 AND f.b_hp>0
      AND datetime(r.ends_at)>datetime(?) AND (r.truce_ends_at IS NULL OR datetime(r.truce_ends_at)<=datetime(?))
      AND COALESCE((SELECT ready_at_ms FROM territory_war_skill_cooldowns WHERE round_id=r.id AND side=? AND operation=?),0)=?
      AND ?<=?) THEN 1 ELSE 0 END`).bind(token,mine.user_id,mine.side,round.id,front.id,new Date(now).toISOString(),new Date(now).toISOString(),mine.side,operation,poll.readyAt,poll.readyAt,now),
    env.DB.prepare(`INSERT INTO territory_war_v3_operation_votes(round_id,user_id,side,operation) VALUES(?,?,?,?)
      ON CONFLICT(round_id,user_id) DO UPDATE SET side=excluded.side,operation=excluded.operation,updated_at=CURRENT_TIMESTAMP`).bind(round.id,mine.user_id,mine.side,voteKey),
    env.DB.prepare('INSERT INTO territory_war_skill_receipts(request_id,round_id,user_id,side,operation,result_json,used_at_ms) VALUES(?,?,?,?,?,?,?)').bind(requestId,round.id,mine.user_id,mine.side,operation,JSON.stringify(result),now),
    env.DB.prepare('DELETE FROM territory_war_mutation_guards WHERE token=?').bind(token)
  ]);
  return result;
}
