// One-time live operation: void the 2026-09-20 21:00 KST clan-war window and
// replay it on 2026-09-21 21:00 KST. Later regular-season windows move by one day.
// Credited currencies are retained as compensation; competitive records are reset.
export const CLAN_REMATCH_20260920_KEY='ops_clan_rematch_20260920_v1';
export const CLAN_REMATCH_TARGET_START='2026-09-20T12:00:00.000Z';
export const CLAN_REMATCH_REPLAY_START='2026-09-21T12:00:00.000Z';
export const CLAN_REMATCH_SHIFT_MS=24*60*60*1000;

const parse=(value,fallback={})=>{try{return JSON.parse(value||'')}catch{return fallback}};
const iso=value=>new Date(value).toISOString();
const ms=value=>Date.parse(String(value||'').includes('T')?value:`${String(value||'').replace(' ','T')}Z`);
const resultRows=result=>result?.results||[];
const num=value=>Number(value||0);
const validWinner=(war,id)=>num(id)===num(war.clan_a_id)||num(id)===num(war.clan_b_id);
const derivedWinner=war=>{
  if(validWinner(war,war.winner_clan_id))return num(war.winner_clan_id);
  const a=num(war.score_a),b=num(war.score_b),aId=num(war.clan_a_id),bId=num(war.clan_b_id);
  return a===b?Math.min(aId,bId):(a>b?aId:bId);
};
const otherClan=(war,winner)=>num(war.clan_a_id)===num(winner)?num(war.clan_b_id):num(war.clan_a_id);
const add=(map,key,field,amount)=>{
  const id=num(key);if(!id||!amount)return;
  const row=map.get(id)||{id,wins:0,losses:0,score:0,contribution:0};row[field]+=num(amount);map.set(id,row);
};
const publicState=state=>({
  status:String(state?.status||'PENDING'),operation:CLAN_REMATCH_20260920_KEY,
  targetAtKst:'2026-09-20 21:00',replayAtKst:'2026-09-21 21:00',
  seasonId:num(state?.seasonId),roundNo:num(state?.roundNo),warIds:Array.isArray(state?.warIds)?state.warIds.map(num):[],
  voidedBattles:num(state?.voidedBattles),shiftedRounds:num(state?.shiftedRounds),
  retainedParticipationCoin:num(state?.retainedParticipationCoin),retainedPigCoin:num(state?.retainedPigCoin),
  completedAt:state?.completedAt||null,reason:state?.reason||null
});

export async function clanRematch20260920State(env){
  const row=await env.DB.prepare('SELECT value FROM app_meta WHERE key=?').bind(CLAN_REMATCH_20260920_KEY).first();
  return publicState(parse(row?.value,{status:'PENDING'}));
}

async function storeState(env,state,expectedValue=null){
  const packed=JSON.stringify(state);
  if(expectedValue===null)await env.DB.prepare('INSERT INTO app_meta(key,value,updated_at) VALUES(?,?,CURRENT_TIMESTAMP) ON CONFLICT(key) DO UPDATE SET value=excluded.value,updated_at=CURRENT_TIMESTAMP').bind(CLAN_REMATCH_20260920_KEY,packed).run();
  else await env.DB.prepare('UPDATE app_meta SET value=?,updated_at=CURRENT_TIMESTAMP WHERE key=? AND value=?').bind(packed,CLAN_REMATCH_20260920_KEY,expectedValue).run();
  return publicState(state);
}

export async function ensureClanRematch20260920(env){
  const priorRow=await env.DB.prepare('SELECT value,updated_at FROM app_meta WHERE key=?').bind(CLAN_REMATCH_20260920_KEY).first(),prior=parse(priorRow?.value,{});
  if(['COMPLETED','BLOCKED'].includes(prior.status))return publicState(prior);
  if(prior.status==='PROCESSING'&&Date.now()-ms(priorRow.updated_at)<120000)return publicState(prior);
  if(priorRow)await env.DB.prepare('DELETE FROM app_meta WHERE key=?').bind(CLAN_REMATCH_20260920_KEY).run();
  const token=crypto.randomUUID(),pending={status:'PROCESSING',token,startedAt:iso(Date.now())},pendingValue=JSON.stringify(pending);
  await env.DB.prepare('INSERT OR IGNORE INTO app_meta(key,value,updated_at) VALUES(?,?,CURRENT_TIMESTAMP)').bind(CLAN_REMATCH_20260920_KEY,pendingValue).run();
  const claim=await env.DB.prepare('SELECT value FROM app_meta WHERE key=?').bind(CLAN_REMATCH_20260920_KEY).first();
  if(parse(claim?.value,{}).token!==token)return publicState(parse(claim?.value,{status:'PROCESSING'}));
  try{
    const targetEnd=iso(ms(CLAN_REMATCH_TARGET_START)+60000),targetWars=resultRows(await env.DB.prepare(`SELECT w.*,s.phase season_phase FROM clan_wars w JOIN clan_seasons s ON s.id=w.season_id
      WHERE w.round_no<1000 AND w.starts_at>=? AND w.starts_at<? ORDER BY w.season_id,w.round_no,w.id`).bind(CLAN_REMATCH_TARGET_START,targetEnd).all());
    if(!targetWars.length){const state={...pending,status:'BLOCKED',reason:'TARGET_WINDOW_NOT_FOUND',blockedAt:iso(Date.now())};return storeState(env,state,pendingValue)}
    const seasonIds=[...new Set(targetWars.map(w=>num(w.season_id)))],roundNos=[...new Set(targetWars.map(w=>num(w.round_no)))];
    if(seasonIds.length!==1||roundNos.length!==1){const state={...pending,status:'BLOCKED',reason:'TARGET_WINDOW_AMBIGUOUS',seasonIds,roundNos,blockedAt:iso(Date.now())};return storeState(env,state,pendingValue)}
    const seasonId=seasonIds[0],roundNo=roundNos[0],phase=String(targetWars[0].season_phase||'').toUpperCase();
    const roundCount=await env.DB.prepare('SELECT COUNT(*) count FROM clan_wars WHERE season_id=? AND round_no=?').bind(seasonId,roundNo).first();
    if(num(roundCount?.count)!==targetWars.length||phase!=='ACTIVE'){
      const state={...pending,status:'BLOCKED',reason:phase!=='ACTIVE'?`UNSAFE_SEASON_PHASE_${phase||'UNKNOWN'}`:'PARTIAL_ROUND_MATCH',seasonId,roundNo,blockedAt:iso(Date.now())};return storeState(env,state,pendingValue);
    }
    const warIds=targetWars.map(w=>num(w.id)),marks=warIds.map(()=>'?').join(','),laterWars=resultRows(await env.DB.prepare(`SELECT * FROM clan_wars WHERE season_id=? AND round_no<1000 AND id NOT IN (${marks}) AND starts_at>=? ORDER BY starts_at,id`).bind(seasonId,...warIds,CLAN_REMATCH_REPLAY_START).all());
    const unsafeLater=laterWars.find(w=>String(w.status)!=='SCHEDULED');
    if(unsafeLater){const state={...pending,status:'BLOCKED',reason:`LATER_WAR_${unsafeLater.id}_${unsafeLater.status}`,seasonId,roundNo,warIds,blockedAt:iso(Date.now())};return storeState(env,state,pendingValue)}
    const settingsRow=await env.DB.prepare("SELECT value FROM app_meta WHERE key='clan_settings_v1'").first(),settings=parse(settingsRow?.value,{}),seasonWinScore=num(settings.seasonWinScore??3),seasonLossScore=num(settings.seasonLossScore??0);
    const battleRows=resultRows(await env.DB.prepare(`SELECT b.*,pr.points participation_points,pr.base_coin,pr.win_bonus_coin,pr.milestone_coin
      FROM clan_war_battles b LEFT JOIN clan_participation_receipts pr ON pr.battle_id=b.id AND pr.status='COMPLETED'
      WHERE b.war_id IN (${marks}) ORDER BY b.id`).bind(...warIds).all());
    const completed=battleRows.filter(b=>String(b.status)==='COMPLETED'),teamDelta=new Map(),memberDelta=new Map();
    for(const war of targetWars.filter(w=>String(w.status)==='COMPLETED')){
      const winner=derivedWinner(war),loser=otherClan(war,winner);add(teamDelta,winner,'wins',1);add(teamDelta,winner,'score',seasonWinScore);add(teamDelta,loser,'losses',1);add(teamDelta,loser,'score',seasonLossScore);
    }
    for(const battle of completed){
      const attackerWon=num(battle.winner_clan_id)===num(battle.attacker_clan_id),participation=battle.participation_points!==null&&battle.participation_points!==undefined;
      add(memberDelta,battle.attacker_user_id,attackerWon?'wins':'losses',1);add(memberDelta,battle.attacker_user_id,'contribution',participation?num(battle.participation_points):1);
      add(memberDelta,battle.defender_user_id,attackerWon?'losses':'wins',1);if(!participation)add(memberDelta,battle.defender_user_id,'contribution',1);
    }
    const teams=resultRows(await env.DB.prepare('SELECT * FROM clan_season_teams WHERE season_id=? ORDER BY clan_id').bind(seasonId).all()),members=resultRows(await env.DB.prepare('SELECT * FROM clan_members WHERE season_id=? ORDER BY user_id').bind(seasonId).all()),teamById=new Map(teams.map(r=>[num(r.clan_id),r])),memberById=new Map(members.map(r=>[num(r.user_id),r]));
    for(const delta of teamDelta.values()){
      const row=teamById.get(delta.id);if(!row||num(row.wins)<delta.wins||num(row.losses)<delta.losses||num(row.score)<delta.score){const state={...pending,status:'BLOCKED',reason:`TEAM_ROLLBACK_MISMATCH_${delta.id}`,seasonId,roundNo,warIds,blockedAt:iso(Date.now())};return storeState(env,state,pendingValue)}
    }
    for(const delta of memberDelta.values()){
      const row=memberById.get(delta.id);if(!row||num(row.battle_wins)<delta.wins||num(row.battle_losses)<delta.losses||num(row.contribution_score)<delta.contribution){const state={...pending,status:'BLOCKED',reason:`MEMBER_ROLLBACK_MISMATCH_${delta.id}`,seasonId,roundNo,warIds,blockedAt:iso(Date.now())};return storeState(env,state,pendingValue)}
    }
    const pigKeys=warIds.map(id=>`clan_war_pig_coin_v1:${id}`),pigMarks=pigKeys.map(()=>'?').join(','),pigRows=pigKeys.length?resultRows(await env.DB.prepare(`SELECT key,value FROM app_meta WHERE key IN (${pigMarks})`).bind(...pigKeys).all()):[];
    const retainedPigCoin=pigRows.reduce((sum,row)=>sum+num(parse(row.value,{}).totalAmount),0),retainedParticipationCoin=completed.reduce((sum,row)=>sum+num(row.base_coin)+num(row.win_bonus_coin)+num(row.milestone_coin),0);
    const writes=[],p=(sql,...values)=>env.DB.prepare(sql).bind(...values);
    if(env.DB.dialect==='postgres'){
      writes.push(p('SELECT key FROM app_meta WHERE key=? FOR UPDATE',CLAN_REMATCH_20260920_KEY),p('SELECT id FROM clan_seasons WHERE id=? FOR UPDATE',seasonId),p(`SELECT id FROM clan_wars WHERE id IN (${marks}) ORDER BY id FOR UPDATE`,...warIds));
      if(laterWars.length)writes.push(p(`SELECT id FROM clan_wars WHERE id IN (${laterWars.map(()=>'?').join(',')}) ORDER BY id FOR UPDATE`,...laterWars.map(w=>num(w.id))));
      writes.push(p(`SELECT id FROM clan_war_battles WHERE war_id IN (${marks}) ORDER BY id FOR UPDATE`,...warIds),p('SELECT clan_id FROM clan_season_teams WHERE season_id=? ORDER BY clan_id FOR UPDATE',seasonId),p('SELECT user_id FROM clan_members WHERE season_id=? ORDER BY user_id FOR UPDATE',seasonId));
    }
    const targetClanIds=[...new Set(targetWars.flatMap(w=>[num(w.clan_a_id),num(w.clan_b_id)]))];
    for(const clanId of targetClanIds)writes.push(p(`UPDATE clan_season_teams SET
      score=score-COALESCE((SELECT SUM(CASE WHEN winner_clan_id=CAST(? AS BIGINT) THEN CAST(? AS BIGINT) ELSE CAST(? AS BIGINT) END) FROM clan_wars WHERE id IN (${marks}) AND status='COMPLETED' AND (clan_a_id=? OR clan_b_id=?)),0),
      wins=wins-(SELECT COUNT(*) FROM clan_wars WHERE id IN (${marks}) AND status='COMPLETED' AND winner_clan_id=?),
      losses=losses-(SELECT COUNT(*) FROM clan_wars WHERE id IN (${marks}) AND status='COMPLETED' AND winner_clan_id<>? AND (clan_a_id=? OR clan_b_id=?)),updated_at=CURRENT_TIMESTAMP
      WHERE season_id=? AND clan_id=?`,clanId,seasonWinScore,seasonLossScore,...warIds,clanId,clanId,...warIds,clanId,...warIds,clanId,clanId,clanId,seasonId,clanId));
    const involvedUserIds=[...new Set(battleRows.flatMap(b=>[num(b.attacker_user_id),num(b.defender_user_id)]).filter(Boolean))];
    for(const userId of involvedUserIds)writes.push(p(`UPDATE clan_members SET
      battle_wins=battle_wins-(SELECT COUNT(*) FROM clan_war_battles b WHERE b.war_id IN (${marks}) AND b.status='COMPLETED' AND ((b.attacker_user_id=? AND b.winner_clan_id=b.attacker_clan_id) OR (b.defender_user_id=? AND b.winner_clan_id=b.defender_clan_id))),
      battle_losses=battle_losses-(SELECT COUNT(*) FROM clan_war_battles b WHERE b.war_id IN (${marks}) AND b.status='COMPLETED' AND ((b.attacker_user_id=? AND b.winner_clan_id=b.defender_clan_id) OR (b.defender_user_id=? AND b.winner_clan_id=b.attacker_clan_id))),
      contribution_score=contribution_score-COALESCE((SELECT SUM(CASE WHEN b.attacker_user_id=? THEN COALESCE(pr.points,1) WHEN b.defender_user_id=? AND pr.battle_id IS NULL THEN 1 ELSE 0 END)
        FROM clan_war_battles b LEFT JOIN clan_participation_receipts pr ON pr.battle_id=b.id AND pr.status='COMPLETED' WHERE b.war_id IN (${marks}) AND b.status='COMPLETED'),0),updated_at=CURRENT_TIMESTAMP
      WHERE season_id=? AND user_id=?`,...warIds,userId,userId,...warIds,userId,userId,userId,userId,...warIds,seasonId,userId));
    writes.push(p(`UPDATE clan_war_battles SET status='VOIDED',error_message='VOID_20260920_REPLAY_20260921_2100',updated_at=CURRENT_TIMESTAMP WHERE war_id IN (${marks})`,...warIds));
    writes.push(p(`DELETE FROM clan_participation_progress WHERE war_id IN (${marks})`,...warIds));
    writes.push(p(`DELETE FROM clan_war_reservation_locks WHERE war_id IN (${marks})`,...warIds));
    for(const war of laterWars)writes.push(p("UPDATE clan_wars SET starts_at=?,ends_at=?,updated_at=CURRENT_TIMESTAMP WHERE id=? AND status='SCHEDULED'",iso(ms(war.starts_at)+CLAN_REMATCH_SHIFT_MS),iso(ms(war.ends_at)+CLAN_REMATCH_SHIFT_MS),war.id));
    for(const war of targetWars){const duration=Math.max(60000,ms(war.ends_at)-ms(war.starts_at));writes.push(p("UPDATE clan_wars SET status='SCHEDULED',score_a=0,score_b=0,battle_count=0,winner_clan_id=NULL,starts_at=?,ends_at=?,updated_at=CURRENT_TIMESTAMP WHERE id=?",CLAN_REMATCH_REPLAY_START,iso(ms(CLAN_REMATCH_REPLAY_START)+duration),war.id))}
    const projectedEnds=[...laterWars.map(w=>ms(w.ends_at)+CLAN_REMATCH_SHIFT_MS),...targetWars.map(w=>ms(CLAN_REMATCH_REPLAY_START)+Math.max(60000,ms(w.ends_at)-ms(w.starts_at)))],seasonEndsAt=iso(Math.max(...projectedEnds));
    writes.push(p("UPDATE clan_seasons SET phase='ACTIVE',ends_at=?,updated_at=CURRENT_TIMESTAMP WHERE id=?",seasonEndsAt,seasonId));
    const shiftedRounds=new Set(laterWars.map(w=>num(w.round_no))).size,state={status:'COMPLETED',token,seasonId,roundNo,warIds,voidedBattles:battleRows.length,voidedCompletedBattles:completed.length,shiftedRounds,retainedParticipationCoin,retainedPigCoin,rewardPolicy:'RETAINED_COMPENSATION_NO_PIG_REPAY_FOR_SAME_WAR_IDS',targetAtKst:'2026-09-20 21:00',replayAtKst:'2026-09-21 21:00',seasonEndsAt,completedAt:iso(Date.now())},packed=JSON.stringify(state);
    writes.push(p('UPDATE app_meta SET value=?,updated_at=CURRENT_TIMESTAMP WHERE key=? AND value=?',packed,CLAN_REMATCH_20260920_KEY,pendingValue));
    await env.DB.batch(writes);
    const saved=await env.DB.prepare('SELECT value FROM app_meta WHERE key=?').bind(CLAN_REMATCH_20260920_KEY).first(),savedState=parse(saved?.value,{});
    if(savedState.status!=='COMPLETED'||savedState.token!==token)throw new Error('클랜전 재경기 운영 기록을 확정하지 못했습니다.');
    return publicState(savedState);
  }catch(error){
    await env.DB.prepare('DELETE FROM app_meta WHERE key=? AND value=?').bind(CLAN_REMATCH_20260920_KEY,pendingValue).run().catch(()=>{});
    throw error;
  }
}

export const __clanRematch20260920Test={derivedWinner,publicState};
