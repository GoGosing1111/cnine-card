// One explicitly requested restart, not a migration, API route or startup hook.
import {CLAN_RANKED_TEAMS_SQL} from '../../functions/_clan_ranking.js';
import {rankedClanSides} from '../../functions/_territory_clan_warfare.js';
import {balancedSideAssignments} from '../../functions/_territory_war.js';
export const ROUND_ID=58,SEASON_ID=5,OLD_FRONT_ID=466;
export const RECEIPT_KEY='ops:territory-58-rank-restart-20260923';
const check=(value,message)=>{if(!value)throw Error(message)};
const q=async(client,sql,values=[])=>(await client.query(sql,values)).rows;
const resetTables=['territory_war_v3_operation_votes','territory_war_v3_commander_overrides','territory_war_v3_operation_uses','territory_war_v3_last_defense_uses','territory_war_v3_mass_assault_uses','territory_war_v3_mass_assaults','territory_war_skill_cooldowns'];
export function rebalancePlan(rankings,participants){
  const clans=rankedClanSides(rankings),sides=new Map(clans.map(c=>[Number(c.clan_id),c.side]));
  check(participants.length===174&&new Set(participants.map(p=>Number(p.user_id))).size===174,'Expected the verified 174-person roster');
  const fixed=participants.filter(p=>Number(p.mandatory_clan)===1).map(item=>({item,side:sides.get(Number(item.clan_id))}));
  check(fixed.length===156&&fixed.every(e=>e.side),'Frozen clan roster differs');
  const balance=balancedSideAssignments(participants.filter(p=>Number(p.mandatory_clan)!==1),fixed);
  check(balance.aCount===87&&balance.bCount===87,'Roster must balance 87 vs 87');
  return {clans,assignments:balance.assignments.map(e=>({userId:Number(e.item.user_id),side:e.side})),metrics:Object.fromEntries(Object.entries(balance).filter(([key])=>key!=='assignments'))};
}
export async function restartTerritoryRound(client,{dryRun=false,expectedVersion,now=Date.now()}={}){
  await client.query('BEGIN');
  try{
    await client.query("SET LOCAL lock_timeout='3s'");
    await client.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))',[RECEIPT_KEY]);
    const [prior]=await q(client,'SELECT value FROM app_meta WHERE key=$1',[RECEIPT_KEY]);
    if(prior){await client.query('ROLLBACK');return {replayed:true,receipt:JSON.parse(prior.value)};}
    const [actor]=await q(client,'SELECT role,status FROM users WHERE id=1');
    check(actor?.role==='OWNER'&&actor.status==='ACTIVE','Active OWNER required');
    const [round]=await q(client,'SELECT * FROM territory_war_v3_rounds WHERE id=$1 FOR UPDATE',[ROUND_ID]);
    check(Number(round?.version)===Number(expectedVersion),'Round changed after inspection');
    check(round.status==='ACTIVE'&&Number(round.warfare_version)===4&&Number(round.clan_season_id)===SEASON_ID&&!round.settled_at&&Number(round.current_front_id)===OLD_FRONT_ID,'Target is not the approved active round');
    check(Date.parse(round.truce_ends_at)>now+60000,'Active truce with at least one minute remaining is required');
    const [latest]=await q(client,'SELECT MAX(id) id FROM territory_war_v3_rounds');
    check(Number(latest.id)===ROUND_ID,'A newer round exists');
    const [season]=await q(client,"SELECT id FROM clan_seasons WHERE phase<>'COMPLETE' ORDER BY season_no DESC LIMIT 1");
    check(Number(season?.id)===SEASON_ID,'Clan season changed');
    const [front]=await q(client,'SELECT * FROM territory_war_v3_fronts WHERE id=$1 FOR UPDATE',[OLD_FRONT_ID]);
    check(front.status==='ACTIVE'&&Number(front.node_index)===4&&Number(front.sequence)===1&&Number(front.a_hp)>0&&Number(front.b_hp)>0,'Only the verified first center front can restart');
    // Unbound reservations from previous days are not current combat. Match
    // production's three-minute attack lease without deleting those old rows.
    const [pending]=await q(client,"SELECT COUNT(*) n FROM territory_war_v3_actions WHERE (round_id=$1 OR (round_id IS NULL AND updated_at::timestamptz >= $2::timestamptz)) AND status IN ('PENDING','APPLIED')",[ROUND_ID,new Date(now-180000).toISOString()]);
    check(Number(pending.n)===0,'An attack is still in flight');
    const [rewards]=await q(client,'SELECT COUNT(*) n FROM territory_war_v3_rewards WHERE round_id=$1',[ROUND_ID]);
    check(Number(rewards.n)===0,'Settled rewards must not be restarted');
    const [results]=await q(client,'SELECT COUNT(*) n FROM territory_war_v3_front_results WHERE round_id=$1',[ROUND_ID]);
    check(Number(results.n)===0,'Already captured front requires separate review');
    const [setting]=await q(client,"SELECT value FROM app_meta WHERE key='territory_war_settings_v3' FOR SHARE");
    const cfg=JSON.parse(setting.value);
    check(cfg.mode==='ON'&&Number(cfg.roundMinutes)===1200&&Number(cfg.preparationMinutes)===3&&Number(cfg.baseSiegeHp)===5000000&&Number(cfg.energyMax)===15,'Verified CMS policy changed');
    const rankings=await q(client,CLAN_RANKED_TEAMS_SQL.replace('?','$1'),[SEASON_ID]);
    check(Number(rankings[0]?.clan_id)===1&&Number(rankings[1]?.clan_id)===7,'DK / FM standings changed');
    const participants=await q(client,'SELECT * FROM territory_war_v3_users WHERE round_id=$1 ORDER BY user_id FOR UPDATE',[ROUND_ID]);
    const clans=await q(client,'SELECT * FROM territory_war_clans WHERE round_id=$1 ORDER BY clan_id FOR UPDATE',[ROUND_ID]);
    check(clans.length===8&&clans.every(c=>rankings.some(r=>Number(r.clan_id)===Number(c.clan_id))),'Frozen clan identities changed');
    const plan=rebalancePlan(rankings,participants),resetBefore={};
    for(const table of resetTables)resetBefore[table]=await q(client,`SELECT * FROM ${table} WHERE round_id=$1 FOR UPDATE`,[ROUND_ID]);
    const [actionCounts]=await q(client,'SELECT COUNT(*) n,COALESCE(SUM(damage),0) damage FROM territory_war_v3_actions WHERE round_id=$1',[ROUND_ID]);
    const startedAt=new Date(now+Number(cfg.preparationMinutes)*60000).toISOString(),endsAt=new Date(now+(Number(cfg.preparationMinutes)+Number(cfg.roundMinutes))*60000).toISOString(),changedAt=new Date(now).toISOString();
    // Unique side/position constraints prevent in-place swaps; the same atomic
    // transaction archives and replaces only these eight display assignments.
    await client.query('DELETE FROM territory_war_clans WHERE round_id=$1',[ROUND_ID]);
    for(const clan of plan.clans){
      const frozen=clans.find(c=>Number(c.clan_id)===Number(clan.clan_id));
      await client.query('INSERT INTO territory_war_clans(round_id,clan_id,side,position,name,mark_key,primary_color) VALUES($1,$2,$3,$4,$5,$6,$7)',[ROUND_ID,clan.clan_id,clan.side,clan.position,frozen.name,frozen.mark_key,frozen.primary_color]);
    }
    const changed=await client.query(`UPDATE territory_war_v3_users w SET side=p.side,energy=$4,last_recharged_at=$5,updated_at=$5
      FROM unnest($2::bigint[],$3::text[]) p(user_id,side) WHERE w.round_id=$1 AND w.user_id=p.user_id`,[ROUND_ID,plan.assignments.map(p=>p.userId),plan.assignments.map(p=>p.side),Number(cfg.energyMax),changedAt]);
    check(changed.rowCount===174,'Partial participant update');
    // Previous battles, individual contribution/eligibility and wallet payouts
    // remain untouched. The prior battlefield is retained as cancelled history.
    await client.query("UPDATE territory_war_v3_fronts SET status='CANCELLED',resolved_at=$2,version=version+1,updated_at=$2 WHERE id=$1",[OLD_FRONT_ID,changedAt]);
    const [newFront]=await q(client,`INSERT INTO territory_war_v3_fronts(round_id,sequence,node_index,node_code,node_name,node_type,status,a_hp,b_hp,a_max_hp,b_max_hp,revisit_count)
      VALUES($1,2,4,'CENTER','중앙 교전지','CENTER','PREPARING',$2,$2,$2,$2,0) RETURNING id`,[ROUND_ID,Number(cfg.baseSiegeHp)]);
    for(const table of resetTables)await client.query(`DELETE FROM ${table} WHERE round_id=$1`,[ROUND_ID]);
    await client.query(`UPDATE territory_war_v3_rounds SET status='PREPARING',starts_at=$2,ends_at=$3,current_front_index=4,current_front_id=$4,
      a_total_damage=0,b_total_damage=0,a_front_wins=0,b_front_wins=0,a_counter_gauge=0,b_counter_gauge=0,
      a_operation='',b_operation='',a_operation_ends_at=NULL,b_operation_ends_at=NULL,a_capture_streak=0,b_capture_streak=0,
      truce_ends_at=NULL,truce_started_by=NULL,truce_duration_minutes=NULL,skill_action_token=NULL,clan_opened_at=$5,
      version=version+1,updated_at=$5 WHERE id=$1`,[ROUND_ID,startedAt,endsAt,newFront.id,changedAt]);
    const receipt={status:'COMPLETED',operation:RECEIPT_KEY,roundId:ROUND_ID,oldFrontId:OLD_FRONT_ID,newFrontId:Number(newFront.id),startsAt:startedAt,endsAt,completedAt:changedAt,clans:plan.clans.map(c=>({id:Number(c.clan_id),name:c.name,side:c.side,score:Number(c.score)})),metrics:plan.metrics,preservedActions:Number(actionCounts.n),personalContributionPreserved:true,walletsUnchanged:true};
    const archive={round,front,clans,participants,resetBefore};
    await client.query('INSERT INTO app_meta(key,value) VALUES($1,$2)',[RECEIPT_KEY+':before',JSON.stringify(archive)]);
    await client.query('INSERT INTO app_meta(key,value) VALUES($1,$2)',[RECEIPT_KEY,JSON.stringify(receipt)]);
    await client.query("INSERT INTO admin_logs(admin_id,action_type,target_type,target_id,before_data,after_data) VALUES(1,'TERRITORY_CLAN_RANK_RESTART','TERRITORY_WAR_ROUND',$1,$2,$3)",[String(ROUND_ID),JSON.stringify({archiveKey:RECEIPT_KEY+':before',version:round.version,clans}),JSON.stringify(receipt)]);
    await client.query("INSERT INTO territory_war_v3_notices(round_id,type,title,message,payload_json) VALUES($1,'REBALANCE_RESTART',$2,$3,$4)",[ROUND_ID,'클랜 균형 재편성','클랜 순위를 기준으로 양 진영을 재편성했습니다. 기존 개인 기여도와 지급 보상은 유지되며, 3분 준비 후 중앙 전선에서 다시 시작합니다.',JSON.stringify(receipt)]);
    const after=await q(client,'SELECT * FROM territory_war_v3_users WHERE round_id=$1 ORDER BY user_id',[ROUND_ID]);
    const stable=p=>JSON.stringify(Object.fromEntries(Object.entries(p).filter(([key])=>!['side','energy','last_recharged_at','updated_at'].includes(key))));
    check(after.every((p,i)=>stable(p)===stable(participants[i])),'Unexpected participant changes');
    const [afterActions]=await q(client,'SELECT COUNT(*) n,COALESCE(SUM(damage),0) damage FROM territory_war_v3_actions WHERE round_id=$1',[ROUND_ID]);
    check(JSON.stringify(actionCounts)===JSON.stringify(afterActions),'Battle history changed');
    await client.query(dryRun?'ROLLBACK':'COMMIT');
    return {dryRun,receipt};
  }catch(error){await client.query('ROLLBACK');throw error;}
}
