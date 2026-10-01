import {createPostgresD1Compat} from '../../../functions/_postgres_d1_compat.js';
import {reopenRankedIfDue} from '../../../functions/_ranked_reopen.js';

export async function runRankedReopenSchedule(env,{openDatabase=createPostgresD1Compat,reopen=reopenRankedIfDue}={}){
 let connection;
 try{
  connection=await openDatabase(env.HYPERDRIVE?.connectionString);
  const result=await reopen({...env,DB:connection.db});
  if(result.changed)console.info(JSON.stringify({event:'ranked_reopened',startsAt:result.startsAt,endsAt:result.endsAt}));
  return result;
 }finally{await connection?.close();}
}
