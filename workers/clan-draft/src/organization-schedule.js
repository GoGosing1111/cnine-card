import {createPostgresD1Compat} from '../../../functions/_postgres_d1_compat.js';
import {runOrganizationMaintenance} from '../../../functions/api/[[path]].js';

export async function runOrganizationSchedule(env,{openDatabase=createPostgresD1Compat,reconcile=runOrganizationMaintenance,now=Date.now}={}){
 let connection;
 try{
  connection=await openDatabase(env.HYPERDRIVE?.connectionString);
  const result=await reconcile({...env,DB:connection.db},{now:now()});
  await connection.db.prepare("INSERT INTO app_meta(key,value,updated_at) VALUES('organization_scheduler_v1',?,CURRENT_TIMESTAMP) ON CONFLICT(key) DO UPDATE SET value=excluded.value,updated_at=CURRENT_TIMESTAMP").bind(JSON.stringify({version:'20261015-live-24h',checkedAt:new Date(now()).toISOString(),...result})).run();
  return result;
 }finally{await connection?.close();}
}
