import {createPostgresD1Compat} from '../../../functions/_postgres_d1_compat.js';
import {settleCityRound} from '../../../functions/_jokgak_city_round.js';
export async function runCityRotationSchedule(env,{openDatabase=createPostgresD1Compat,settle=settleCityRound,now=Date.now()}={}){
 let connection;
 try{connection=await openDatabase(env.HYPERDRIVE?.connectionString);return await settle({...env,DB:connection.db},now,{force:true});}
 finally{await connection?.close();}
}
