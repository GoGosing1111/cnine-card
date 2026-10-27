import {createPostgresD1Compat} from '../../../functions/_postgres_d1_compat.js';
import {processMercenaryStockSchedules} from '../../../functions/_mercenary_stock_schedule.js';
import {processMercenaryStockSchedules as processBlackcrownStockSchedules} from '../../../functions/_mercenary_blackcrown_stock_schedule.js';
export async function processMercenaryPackStockSchedules(env,options={}){
 const bloodmoon=await processMercenaryStockSchedules(env,options),blackcrown=await processBlackcrownStockSchedules(env,options);
 const nextAt=[bloodmoon.nextAt,blackcrown.nextAt].filter(Boolean).sort()[0]??null;
 return {applied:bloodmoon.applied+blackcrown.applied,nextAt,serverNow:blackcrown.serverNow};
}
export async function runMercenaryStockSchedule(env,{openDatabase=createPostgresD1Compat,process=processMercenaryPackStockSchedules,arm}={}){
 let connection;
 try{
  connection=await openDatabase(env.HYPERDRIVE?.connectionString);const state=await process({...env,DB:connection.db}),result={applied:state.applied,nextAt:state.nextAt};
  if(arm){
   const alarm=await arm(state.nextAt);
   await connection.db.prepare('INSERT INTO app_meta(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value').bind('mercenary_stock_alarm_v1',JSON.stringify({version:'20261026-v1',checkedAt:state.serverNow,...result,...alarm})).run();
   return {...result,...alarm};
  }
  return result;
 }
 finally{await connection?.close();}
}
// A separately named instance of the existing alarm class isolates this job
// from clan/duo deadlines without changing their storage or service bindings.
export async function armMercenaryStockAlarm(storage,executeAt,{now=Date.now()}={}){
 await storage.put('mercenaryStockSchedule',true);
 if(!executeAt){await storage.deleteAlarm();return {nextAlarmAt:null};}
 const next=Math.max(now+100,Date.parse(executeAt));
 await storage.setAlarm(next);return {nextAlarmAt:next};
}
export async function handleMercenaryStockAlarm(storage,env,{run=runMercenaryStockSchedule,now=Date.now}={}){
 await storage.setAlarm(now()+60000);
 const result=await run(env);
 return {...result,...await armMercenaryStockAlarm(storage,result.nextAt,{now:now()})};
}
