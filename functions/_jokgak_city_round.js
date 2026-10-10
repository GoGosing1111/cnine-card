import {cityShift} from '../shared/jokgak-city-v1.mjs';
import {prepareCityTopSettlement,CITY_TOP_CURSOR} from './_jokgak_city_top.js';
const KEY='jokgak_city_rotation_cleanup_v1';
// Current-round receipts retain idempotency. Old requests carry their old epoch
// and are rejected after expiry, so expired receipts need not accumulate.
export async function settleCityRound(env,now=Date.now(),{force=false}={}){
 const shift=cityShift(now),p=(sql,...v)=>env.DB.prepare(sql).bind(...v);
 for(let attempt=0;attempt<3;attempt++){
 const stored=(await p('SELECT value FROM app_meta WHERE key=?',KEY).first())?.value;
 if(Number(stored)>shift.id)return {changed:false,shift};
 const top=await prepareCityTopSettlement(env,shift);
 if(!force&&Number(stored)===shift.id&&!top.statements.length)return {changed:false,shift};
 try{const results=await env.DB.batch([
  ...top.statements,
  p('UPDATE jokgak_city_players_v1 SET active=0,next_action_at=0,next_move_at=0,protected_until=0,revision=revision+1,last_token=?,updated_at=? WHERE active=1 AND epoch<?','city-rotation:'+shift.id,now,shift.id),
  p('DELETE FROM jokgak_city_notifications_v1 WHERE created_at<?',shift.startsAt),
  p('DELETE FROM jokgak_city_actions_v1 WHERE created_at<?',shift.startsAt),
  p('INSERT INTO app_meta(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value WHERE CAST(app_meta.value AS BIGINT)<CAST(excluded.value AS BIGINT)',KEY,String(shift.id))
 ]);
 return {changed:true,shift,exited:Number(results[top.statements.length]?.meta?.changes||0),topAwards:top.awards};
 }catch(error){
  const [cleanup,cursor]=await Promise.all([p('SELECT value FROM app_meta WHERE key=?',KEY).first(),p('SELECT value FROM app_meta WHERE key=?',CITY_TOP_CURSOR).first()]);
  if(top.statements.length&&Number(cleanup?.value)>=shift.id&&Number(cursor?.value)>=shift.id)return {changed:false,shift};
  if(attempt===2||!/guard|constraint|deadlock|serializ/i.test(error.message))throw error;
 }
 }
}
