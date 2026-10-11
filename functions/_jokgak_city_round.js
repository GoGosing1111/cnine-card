import {cityShift} from '../shared/jokgak-city-v1.mjs';
import {prepareCityTopSettlement,CITY_TOP_CURSOR} from './_jokgak_city_top.js';
import {cityConflictCleanup} from './_jokgak_city_conflict.js';
import {cityGuard,cityGuardEnd} from './_jokgak_city_rewards.js';
const KEY='jokgak_city_rotation_cleanup_v1';
const LEASE_KEY='jokgak_city_rotation_lease_v1';
const SETTLEMENT_LEASE_MS=90000;
// Current-round receipts retain idempotency. Old requests carry their old epoch
// and are rejected after expiry, so expired receipts need not accumulate.
export async function settleCityRound(env,now=Date.now(),{force=false}={}){
 const shift=cityShift(now),p=(sql,...v)=>env.DB.prepare(sql).bind(...v);
 const completed=async()=>{
  const rows=(await p('SELECT key,value FROM app_meta WHERE key IN (?,?)',KEY,CITY_TOP_CURSOR).all()).results||[];
  const values=new Map(rows.map(row=>[row.key,Number(row.value)]));
  return values.get(KEY)>shift.id||values.get(KEY)>=shift.id&&values.get(CITY_TOP_CURSOR)>=shift.id;
 };
 if(!force&&await completed())return {changed:false,shift};
 // Acquire before planning, not only in the final transaction: status and
 // notification polls must never each scan the same unclosed round.
 const stamp=Date.now(),lease=JSON.stringify({token:crypto.randomUUID(),until:stamp+SETTLEMENT_LEASE_MS});
 const until=env.DB.dialect==='postgres'?"CAST(app_meta.value::jsonb->>'until' AS BIGINT)":"json_extract(app_meta.value,'$.until')";
 const claim=await p(`INSERT INTO app_meta(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value WHERE ${until}<=?`,LEASE_KEY,lease,stamp).run();
 if(!Number(claim?.meta?.changes)){
  if(await completed())return {changed:false,shift};
  throw Object.assign(Error('족각도시 회차를 정산하고 있습니다. 잠시 후 다시 시도하세요.'),{status:503,code:'CITY_ROUND_SETTLING'});
 }
 try{
 for(let attempt=0;attempt<3;attempt++){
 const stored=(await p('SELECT value FROM app_meta WHERE key=?',KEY).first())?.value;
 if(Number(stored)>shift.id)return {changed:false,shift};
 const top=await prepareCityTopSettlement(env,shift);
 if(!force&&Number(stored)===shift.id&&!top.statements.length)return {changed:false,shift};
 const leaseTag='city-round-lease:'+crypto.randomUUID();
 const leaseGuard=[cityGuard(env,leaseTag,'EXISTS(SELECT 1 FROM app_meta WHERE key=? AND value=?)',[LEASE_KEY,lease]),cityGuardEnd(env,leaseTag)];
 try{const results=await env.DB.batch([
  ...leaseGuard,
  ...top.statements,
  p('UPDATE jokgak_city_players_v1 SET active=0,next_action_at=0,next_move_at=0,protected_until=0,revision=revision+1,last_token=?,updated_at=? WHERE active=1 AND epoch<?','city-rotation:'+shift.id,now,shift.id),
  p('DELETE FROM jokgak_city_notifications_v1 WHERE created_at<?',shift.startsAt),
  p('DELETE FROM jokgak_city_actions_v1 WHERE created_at<?',shift.startsAt),
  ...cityConflictCleanup(env,shift.id),
  p('INSERT INTO app_meta(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value WHERE CAST(app_meta.value AS BIGINT)<CAST(excluded.value AS BIGINT)',KEY,String(shift.id))
 ]);
 return {changed:true,shift,exited:Number(results[leaseGuard.length+top.statements.length]?.meta?.changes||0),topAwards:top.awards};
 }catch(error){
  const [cleanup,cursor]=await Promise.all([p('SELECT value FROM app_meta WHERE key=?',KEY).first(),p('SELECT value FROM app_meta WHERE key=?',CITY_TOP_CURSOR).first()]);
  if(top.statements.length&&Number(cleanup?.value)>=shift.id&&Number(cursor?.value)>=shift.id)return {changed:false,shift};
  if(attempt===2||!/guard|constraint|deadlock|serializ/i.test(error.message))throw error;
 }
 }
 }finally{await p('DELETE FROM app_meta WHERE key=? AND value=?',LEASE_KEY,lease).run();}
}
