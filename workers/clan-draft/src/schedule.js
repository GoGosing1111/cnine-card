import {createPostgresD1Compat} from '../../../functions/_postgres_d1_compat.js';
import {reconcileClanDraft} from '../../../functions/_clan.js';

const CHECK_INTERVAL_MS=60000;

// One DB visit per alarm. The connection is closed before the object sleeps.
export async function runDraftSchedule(env,{openDatabase=createPostgresD1Compat,now=Date.now,reconcile=reconcileClanDraft}={}){
  let connection;
  try{
    connection=await openDatabase(env.HYPERDRIVE?.connectionString);
    const result=await reconcile({...env,DB:connection.db});
    await connection.db.prepare("INSERT INTO app_meta(key,value,updated_at) VALUES('clan_draft_scheduler_v1',?,CURRENT_TIMESTAMP) ON CONFLICT(key) DO UPDATE SET value=excluded.value,updated_at=CURRENT_TIMESTAMP").bind(JSON.stringify({version:'20260915-alarm-30s',source:'DURABLE_ALARM',checkedAt:new Date(now()).toISOString(),...result})).run();
    return result;
  }finally{await connection?.close()}
}

export function nextAlarmAt(result,now){
  const deadline=Date.parse(result?.nextCheckAt||'');
  if(!Number.isFinite(deadline))return now+CHECK_INTERVAL_MS;
  return Math.min(now+CHECK_INTERVAL_MS,deadline>now?deadline:now+5000);
}

// Cron and the deployment bootstrap only arm the alarm; they never move a game deadline.
export async function ensureDraftAlarm(storage,now=Date.now()){
  const current=await storage.getAlarm();
  if(current!==null&&current<=now+CHECK_INTERVAL_MS)return{nextAlarmAt:current};
  const next=now+1000;
  await storage.setAlarm(next);
  return{nextAlarmAt:next};
}

export async function handleDraftAlarm(storage,env,{now=Date.now,run=runDraftSchedule}={}){
  // Persist another attempt first, so DB errors cannot exhaust the automatic retries
  // and leave the competition without a timer. DB locks make redelivery safe.
  await storage.setAlarm(now()+CHECK_INTERVAL_MS);
  const result=await run(env);
  const next=nextAlarmAt(result,now());
  await storage.setAlarm(next);
  return{...result,nextAlarmAt:next};
}
