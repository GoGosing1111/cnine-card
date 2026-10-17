import {ensureJointAtomicSchema,jointGuard,jointGuardEnd} from './_joint_atomic.js';

// Caller holds the existing user mutation lock. Policy, daily receipt and wallet
// must commit together so a reward increase cannot miss an in-flight old payout.
export async function payDailyQuestReward(DB,{userId,date,reward,postCount,snapshot}){
 const p=(sql,...args)=>DB.prepare(sql).bind(...args),token=crypto.randomUUID();
 const keys=['playdk_daily_quest_settings_v1','wago_daily_quest_settings_v1'];
 if(!Number.isSafeInteger(reward)||reward<0||reward>100_000_000_000||!Number.isSafeInteger(postCount)||postCount<15||!snapshot||snapshot.key!==null&&!keys.includes(snapshot.key))throw Error('Invalid daily quest reward');
 await ensureJointAtomicSchema({DB});
 const same=snapshot.key===null?'NOT EXISTS(SELECT 1 FROM app_meta WHERE key IN (?,?))':"EXISTS(SELECT 1 FROM app_meta WHERE key=? AND value=?)"+(snapshot.key===keys[1]?' AND NOT EXISTS(SELECT 1 FROM app_meta WHERE key=?)':'');
 const args=snapshot.key===null?keys:[snapshot.key,snapshot.value,...(snapshot.key===keys[1]?[keys[0]]:[])];
 try{
  await DB.batch([
   ...(DB.dialect==='postgres'?[p('SELECT id FROM users WHERE id=? FOR UPDATE',userId),p('SELECT key FROM app_meta WHERE key IN (?,?) ORDER BY key FOR SHARE',...keys)]:[]),
   jointGuard(DB,token,`(${same}) AND NOT EXISTS(SELECT 1 FROM wago_daily_quest_claims WHERE user_id=? AND quest_date=?)`,[...args,userId,date]),
   p('INSERT INTO wago_daily_quest_claims(user_id,quest_date,reward_coin,post_count) VALUES(?,?,?,?)',userId,date,reward,postCount),
   p('UPDATE users SET coin=coin+? WHERE id=?',reward,userId),
   p("INSERT INTO coin_logs(user_id,change_amount,balance_after,reason) SELECT id,?,coin,'PLAYDK_DAILY_QUEST' FROM users WHERE id=?",reward,userId),
   jointGuardEnd(DB,token)
  ]);
  return {paid:true};
 }catch(error){
  const existing=await p('SELECT id FROM wago_daily_quest_claims WHERE user_id=? AND quest_date=?',userId,date).first();if(existing)return {paid:false,reason:'ALREADY_CLAIMED'};
  const current=await p("SELECT key,value FROM app_meta WHERE key IN (?,?) ORDER BY CASE key WHEN 'playdk_daily_quest_settings_v1' THEN 0 ELSE 1 END LIMIT 1",...keys).first();
  if((current?.key??null)!==snapshot.key||(current?.value??null)!==snapshot.value)return {paid:false,reason:'SETTINGS_CHANGED'};
  throw error;
 }
}
