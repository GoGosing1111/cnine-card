// One-time evidence-backed repair of the legacy pause orphaned by round 58's restart.
// Only its territory-round reference changes; normal session reconciliation owns all settlement.
import {factionTime} from '../../shared/clan-faction-sessions-v1.mjs';
export const OPERATION_KEY='ops:faction-pause-repair:20260925:v1';
export const ARCHIVE_KEY='ops:territory-58-rank-restart-20260923:before';
export const SESSION_KEY='2026-09-23:2',SEASON_ID=5,ROUND_ID=58,PAUSED_AT=1790172975267;
const check=(ok,message)=>{if(!ok)throw Error(message)};
const q=async(client,sql,args=[])=>(await client.query(sql,args)).rows;
export async function repairFactionPause(client,{dryRun=false,expectedRevision}={}){
 await client.query('BEGIN');
 try{
  await client.query("SET LOCAL lock_timeout='3s'");
  await client.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))',[OPERATION_KEY]);
  const [prior]=await q(client,'SELECT value FROM app_meta WHERE key=$1',[OPERATION_KEY]);
  if(prior){await client.query('ROLLBACK');return {replayed:true,receipt:JSON.parse(prior.value)}}
  const [actor]=await q(client,'SELECT role,status FROM users WHERE id=1');
  check(actor?.role==='OWNER'&&actor.status==='ACTIVE','Active OWNER required');
  const [row]=await q(client,'SELECT * FROM clan_faction_state WHERE season_id=$1 FOR UPDATE',[SEASON_ID]);
  check(Number.isSafeInteger(expectedRevision)&&Number(row?.revision)===expectedRevision,'Faction revision changed');
  const state=JSON.parse(row.state_json),session=state.session,pause=session?.pauses?.at(-1);
  check(session?.key===SESSION_KEY&&session.status==='PAUSED'&&session.pausedAt===PAUSED_AT&&pause?.startsAt===PAUSED_AT&&pause.endsAt===null,'Target legacy pause changed');
  check(!pause.territoryRoundIds?.length,'Pause already has territory evidence');
  const [audit]=await q(client,"SELECT before_data FROM admin_logs WHERE id=35272 AND action_type='TERRITORY_CLAN_RANK_RESTART' AND target_id='58'");
  check(audit&&JSON.parse(audit.before_data).archiveKey===ARCHIVE_KEY,'Restart audit missing');
  const [archive]=await q(client,'SELECT value FROM app_meta WHERE key=$1 FOR SHARE',[ARCHIVE_KEY]);
  const original=archive&&JSON.parse(archive.value).round;
  check(Number(original?.id)===ROUND_ID&&original.status==='ACTIVE'&&factionTime(original.starts_at)===PAUSED_AT&&!original.settled_at,'Original round does not prove the pause');
  const [round]=await q(client,'SELECT id,status,starts_at,settled_at FROM territory_war_v3_rounds WHERE id=$1 FOR SHARE',[ROUND_ID]);
  check(round?.status==='FINISHED'&&factionTime(round.starts_at)>PAUSED_AT&&factionTime(round.settled_at)>PAUSED_AT,'Restarted round is not settled');
  await client.query('INSERT INTO app_meta(key,value) VALUES($1,$2)',[OPERATION_KEY+':before',JSON.stringify(row)]);
  pause.territoryRoundIds=[ROUND_ID];
  const changed=await client.query('UPDATE clan_faction_state SET state_json=$1,revision=revision+1,last_action=$2 WHERE season_id=$3 AND revision=$4',[JSON.stringify(state),OPERATION_KEY,SEASON_ID,expectedRevision]);
  check(changed.rowCount===1,'Faction state update lost');
  const receipt={operationKey:OPERATION_KEY,seasonId:SEASON_ID,sessionKey:SESSION_KEY,territoryRoundId:ROUND_ID,pausedAt:PAUSED_AT,settledAt:round.settled_at,revisionBefore:expectedRevision,revisionAfter:expectedRevision+1,archiveKey:ARCHIVE_KEY,completedAt:new Date().toISOString()};
  const [logged]=await q(client,`INSERT INTO admin_logs(admin_id,action_type,target_type,target_id,before_data,after_data) VALUES(1,'OPS_FACTION_PAUSE_REPAIR','CLAN_FACTION_SESSION',$1,$2,$3) RETURNING id`,[SESSION_KEY,JSON.stringify({backupKey:OPERATION_KEY+':before',revision:expectedRevision}),JSON.stringify(receipt)]);
  receipt.auditId=Number(logged.id);
  await client.query('INSERT INTO app_meta(key,value) VALUES($1,$2)',[OPERATION_KEY,JSON.stringify(receipt)]);
  await client.query(dryRun?'ROLLBACK':'COMMIT');
  return {dryRun,receipt};
 }catch(error){await client.query('ROLLBACK');throw error}
}
