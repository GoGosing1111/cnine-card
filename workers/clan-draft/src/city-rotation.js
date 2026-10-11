import {createPostgresD1Compat} from '../../../functions/_postgres_d1_compat.js';
import {settleCityRound} from '../../../functions/_jokgak_city_round.js';
import {dischargeCityHospital} from '../../../functions/_jokgak_city.js';
export async function runCityRotationSchedule(env,{openDatabase=createPostgresD1Compat,settle=settleCityRound,discharge=dischargeCityHospital,now=Date.now()}={}){
 let connection;
 try{connection=await openDatabase(env.HYPERDRIVE?.connectionString);const runtime={...env,DB:connection.db},result=await settle(runtime,now,{force:true});await discharge(runtime,{now});return result;}
 finally{await connection?.close();}
}
