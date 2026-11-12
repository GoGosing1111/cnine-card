import {createPostgresD1Compat} from '../../../functions/_postgres_d1_compat.js';
import {runOrganizationMaintenance} from '../../../functions/api/[[path]].js';
import {reconcileClanDraft} from '../../../functions/_clan.js';

export async function runOrganizationSchedule(env,{openDatabase=createPostgresD1Compat,reconcile=runOrganizationMaintenance,competition=reconcileClanDraft,now=Date.now}={}){
 let connection;
 try{
  connection=await openDatabase(env.HYPERDRIVE?.connectionString);
  const game={...env,DB:connection.db};
  const result=await reconcile(game,{now:now()});
  // Keep this calendar running even if other alarm jobs are delayed. Healthy
  // draft alarms have already advanced the same idempotent season state.
  const recruitment=result.recruitment;
  if(recruitment?.calendarWindowId){
   const row=await connection.db.prepare("SELECT value FROM app_meta WHERE key='clan_draft_scheduler_v1'").first();
   const alarm=row?.value?JSON.parse(row.value):null;
   const age=now()-Date.parse(alarm?.checkedAt);
   const fresh=alarm?.version==='20261012-clan-retirement'&&Number(alarm.seasonId)===recruitment.seasonId&&age>=0&&age<45000;
   const expected={OPEN:'ELDER_RECRUITMENT',MEMBERS:'MEMBER_RECRUITMENT'}[recruitment.status];
   const livePhase=expected?alarm?.phase===expected&&alarm.nextCheckAt===recruitment.nextCheckAt:['ACTIVE','SETTLEMENT','CHAMPIONS','COMPLETE'].includes(alarm?.phase);
   const clock=fresh&&livePhase?alarm:await competition(game);
   result.seasonClock={windowId:recruitment.calendarWindowId,phase:clock.phase,seasonId:clock.seasonId,nextCheckAt:clock.nextCheckAt,source:fresh&&livePhase?'DURABLE_ALARM':'ORGANIZATION_CRON'};
  }
  await connection.db.prepare("INSERT INTO app_meta(key,value,updated_at) VALUES('organization_scheduler_v1',?,CURRENT_TIMESTAMP) ON CONFLICT(key) DO UPDATE SET value=excluded.value,updated_at=CURRENT_TIMESTAMP").bind(JSON.stringify({version:'20261015-live-24h',checkedAt:new Date(now()).toISOString(),...result})).run();
  return result;
 }finally{await connection?.close();}
}
