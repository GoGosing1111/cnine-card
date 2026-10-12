import assert from 'node:assert/strict';
import {settleCityRound} from '../../functions/_jokgak_city_round.js';
import {readCitySettings} from '../../functions/_jokgak_city_settings.js';
import {CITY_TOP_CURSOR} from '../../functions/_jokgak_city_top.js';
import {cityRoundRewardReceiptKey} from '../../functions/_jokgak_city_round_rewards.js';
import {cityGuard,cityGuardEnd} from '../../functions/_jokgak_city_rewards.js';
import {CITY_MESSAGE_REWARD_TYPE,cityMessageRewardKey} from '../../functions/_jokgak_city_message_reward.js';
import {CITY_SETTINGS_KEY} from '../../shared/jokgak-city-settings-v1.mjs';
import {cityShift} from '../../shared/jokgak-city-v1.mjs';

export const CLOSE_AT=Date.parse('2026-10-13T03:00:00Z');
export const OPERATION_KEY='ops:jokgak-city-off:20261013:1200:v1';
const CLEANUP='jokgak_city_rotation_cleanup_v1';

// The approved operator runner supplies freshly read database time. No ON path.
export async function closeCityAtNoon(env,serverNow){
 const p=(sql,...values)=>env.DB.prepare(sql).bind(...values),saved=async()=>{
  const row=await p('SELECT value FROM app_meta WHERE key=?',OPERATION_KEY).first();return row?JSON.parse(row.value):null;
 };
 assert.ok(Number.isSafeInteger(serverNow));
 const prior=await saved();if(prior){assert.equal(prior.status,'COMPLETED');return {...prior,replayed:true};}
 if(serverNow<CLOSE_AT)return {status:'NOT_DUE',scheduledAt:new Date(CLOSE_AT).toISOString()};
 assert.ok(serverNow<CLOSE_AT+6*3600000,'The noon closing window passed; inspect the later round before changing mode');
 const owner=await p('SELECT id,nickname,role,status FROM users WHERE id=1').first();
 assert.equal(owner?.nickname,'핑크빛유두');assert.equal(owner.role,'OWNER');assert.equal(owner.status,'ACTIVE');
 let current=await readCitySettings(env);
 if(current.policy.mode==='OFF')return {status:'ALREADY_OFF',changed:false,mode:'OFF'};
 assert.equal(current.policy.mode,'ON','Unexpected city mode; no forced settlement');
 const shift=cityShift(CLOSE_AT),epoch=shift.id-1;
 const settlement=await settleCityRound(env,CLOSE_AT);
 const cursor=await p('SELECT value FROM app_meta WHERE key=?',CITY_TOP_CURSOR).first(),cleanup=await p('SELECT value FROM app_meta WHERE key=?',CLEANUP).first();
 assert.equal(Number(cursor?.value),shift.id,'Noon TOP settlement is incomplete');assert.equal(Number(cleanup?.value),shift.id,'Noon round cleanup is incomplete');
 const rawRound=(await p('SELECT value FROM app_meta WHERE key=?',cityRoundRewardReceiptKey(epoch)).first())?.value;
 const round=rawRound?JSON.parse(rawRound):null;
 if(round){
  assert.equal(round.delivery,'MESSAGE','Expected this round to use message rewards');
  for(const recipient of round.recipients){
   assert.equal(recipient.delivery,'MESSAGE');
   const message=await p('SELECT r.id FROM user_messages m JOIN user_message_rewards r ON r.message_id=m.id AND r.user_id=m.user_id WHERE m.user_id=? AND m.campaign_key=? AND r.reward_type=? AND r.reward_amount=1',recipient.userId,recipient.campaign,CITY_MESSAGE_REWARD_TYPE).first();
   assert.ok(message,'A round reward message is missing');
   assert.ok(await p('SELECT key FROM app_meta WHERE key=?',cityMessageRewardKey(recipient.campaign)).first(),'A round reward attachment is missing');
  }
 }
 current=await readCitySettings(env);
 if(current.policy.mode==='OFF')return {status:'ALREADY_OFF',changed:false,mode:'OFF',settlement};
 assert.equal(current.policy.mode,'ON','City mode changed during settlement');assert.ok(current.raw);
 const before=JSON.parse(current.raw),after={...before,mode:'OFF',enabled:false,revision:current.policy.revision+1,updatedBy:1,updatedAt:new Date(serverNow).toISOString(),writeToken:crypto.randomUUID()},raw=JSON.stringify(after);
 const result={operationKey:OPERATION_KEY,status:'COMPLETED',scheduledAt:new Date(CLOSE_AT).toISOString(),completedAt:after.updatedAt,epoch,revisionBefore:current.policy.revision,revisionAfter:after.revision,mode:'OFF',enabled:false,settled:true,recipients:round?.recipients.length||0,delivery:'MESSAGE'};
 const tag='city-noon-off:'+crypto.randomUUID(),statements=env.DB.dialect==='postgres'?[p('SELECT key FROM app_meta WHERE key=? FOR UPDATE',CITY_SETTINGS_KEY)]:[];
 statements.push(
  cityGuard(env,tag,'EXISTS(SELECT 1 FROM app_meta WHERE key=? AND value=?) AND EXISTS(SELECT 1 FROM app_meta WHERE key=? AND value=?) AND EXISTS(SELECT 1 FROM app_meta WHERE key=? AND value=?) AND NOT EXISTS(SELECT 1 FROM app_meta WHERE key=?)',[CITY_SETTINGS_KEY,current.raw,CITY_TOP_CURSOR,String(shift.id),CLEANUP,String(shift.id),OPERATION_KEY]),
  p('UPDATE app_meta SET value=?,updated_at=CURRENT_TIMESTAMP WHERE key=? AND value=?',raw,CITY_SETTINGS_KEY,current.raw),
  p("INSERT INTO admin_logs(admin_id,action_type,target_type,target_id,before_data,after_data) VALUES(1,'JOKGAK_CITY_SCHEDULED_CLOSE','JOKGAK_CITY',?,?,?)",OPERATION_KEY,current.raw,raw),
  p('INSERT INTO app_meta(key,value,updated_at) VALUES(?,?,CURRENT_TIMESTAMP)',OPERATION_KEY,JSON.stringify(result)),cityGuardEnd(env,tag)
 );
 try{await env.DB.batch(statements);}catch(error){const replay=await saved();if(replay?.status==='COMPLETED')return {...replay,replayed:true};throw error;}
 const verified=await readCitySettings(env);assert.equal(verified.policy.mode,'OFF');assert.equal(JSON.parse(verified.raw).enabled,false);
 return {...result,replayed:false};
}
