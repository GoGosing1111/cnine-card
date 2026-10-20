import {createPostgresD1Compat} from '../../../functions/_postgres_d1_compat.js';
import {issueDailyLandTickets} from '../../../functions/_soopket_land.js';

// The same account/date receipt is shared with state/spin catch-up. A delayed
// scheduler issues today's allowance only; it never backfills missed dates.
export async function runLandDailySchedule(env,{openDatabase=createPostgresD1Compat,issue=issueDailyLandTickets,timestamp=Date.now()}={}){
  let connection;
  try{
    connection=await openDatabase(env.HYPERDRIVE?.connectionString);
    return await issue(connection.db,{timestamp});
  }finally{await connection?.close();}
}
