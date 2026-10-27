import {createPostgresD1Compat} from '../../../functions/_postgres_d1_compat.js';
import {runRankedDuoMaintenance} from '../../../functions/api/[[path]].js';
import {nextAlarmAt} from './schedule.js';

export async function ensureDuoAlarm(storage,now=Date.now()){
 const current=await storage.getAlarm();
 // Allow normal delivery lag, but do not leave an overdue persisted alarm
 // armed forever after the platform has exhausted its delivery retries.
 if(current!==null&&current>=now-60000&&current<=now+60000)return {nextAlarmAt:current};
 const next=now+1000;
 await storage.setAlarm(next);
 if(current!==null&&current<now-60000)console.info(JSON.stringify({event:'ranked_duo_alarm_recovered_v1',previousAlarmAt:current,nextAlarmAt:next}));
 return {nextAlarmAt:next};
}
export async function runDuoSchedule(env,{openDatabase=createPostgresD1Compat,reconcile=runRankedDuoMaintenance,now=Date.now}={}){
 let connection;
 try{
  connection=await openDatabase(env.HYPERDRIVE?.connectionString);
  const result=await reconcile({...env,DB:connection.db},{now:now()});
  if(result.changed)console.info(JSON.stringify({event:'ranked_duo_lifecycle_v2',at:new Date(now()).toISOString(),...result}));
  await connection.db.prepare("INSERT INTO app_meta(key,value,updated_at) VALUES('ranked_duo_scheduler_status_v2',?,CURRENT_TIMESTAMP) ON CONFLICT(key) DO UPDATE SET value=excluded.value,updated_at=CURRENT_TIMESTAMP")
   .bind(JSON.stringify({version:'20260925-weekly-rewards',checkedAt:new Date(now()).toISOString(),...result})).run();
  return result;
 }finally{await connection?.close();}
}
export async function handleDuoAlarm(storage,env,{now=Date.now,run=runDuoSchedule}={}){
 await storage.setAlarm(now()+60000);
 const result=await run(env),next=nextAlarmAt(result,now());
 await storage.setAlarm(next);return {...result,nextAlarmAt:next};
}
