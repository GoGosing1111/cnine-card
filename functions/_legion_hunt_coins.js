import {jointGuard,jointGuardEnd} from './_joint_atomic.js';
import {jointError} from './_joint_request.js';
import {LEGION_HUNT_SETTINGS_KEY} from './_legion_hunt_settings.js';
import {LEGION_REGIONS_KEY} from '../shared/legion-regions-v1.mjs';
import {advanceLegionCoins,legionCoinSummary} from '../shared/legion-hunt-coins-v1.mjs';
import {readRegionPolicy} from './_legion_regions.js';

// Call only after restoreHuntSession validates the requested server sequence
// and wall-clock reachability. The client never supplies a count or amount.
export async function saveLegionCoinProgress(env,user,{key,before,run,policyRaw,access,saveRun}){
  const award=advanceLegionCoins(run.coins,run.state);
  if(award.coins)run.coins=award.coins;
  const summary=legionCoinSummary(run.coins,award.delta);
  if(run.state.receipt)Object.assign(run.state.receipt,summary);
  if(!award.delta)return {saved:await saveRun(env,key,before,run),summary};
  if(!run.liveRewards||!access.liveRewards)throw jointError('HUNT_REWARD_PAUSED','코인 지급이 일시 중지됐습니다. 지급된 코인은 유지됩니다.',423);
  let regionRaw=null;
  if(run.state.policy.regionId){
    const current=await readRegionPolicy(env);
    if(current.policy.mode!=='ON'||!current.policy.regions.find(r=>r.id===run.state.policy.regionId)?.enabled)throw jointError('HUNT_REWARD_PAUSED','해당 지역의 보상 지급이 일시 중지됐습니다.',423);
    regionRaw=current.raw;
  }
  const DB=env.DB,token='hunt-coin:'+crypto.randomUUID(),raw=JSON.stringify({...run,writeToken:token});
  const p=(sql,...values)=>DB.prepare(sql).bind(...values);
  const reason=`군단토벌 몬스터 처치 [${run.state.id}:${run.coins.throughSeq}]`;
  const predicates=['EXISTS(SELECT 1 FROM app_meta WHERE key=? AND value=?)','EXISTS(SELECT 1 FROM app_meta WHERE key=? AND value=?)','EXISTS(SELECT 1 FROM users WHERE id=?)'];
  const values=[key,raw,LEGION_HUNT_SETTINGS_KEY,policyRaw,user.id];
  if(regionRaw!==null){predicates.push('EXISTS(SELECT 1 FROM app_meta WHERE key=? AND value=?)');values.push(LEGION_REGIONS_KEY,regionRaw);}
  const statements=[
    ...(DB.dialect==='postgres'?[p('SELECT id FROM users WHERE id=? FOR UPDATE',user.id)]:[]),
    p('UPDATE app_meta SET value=?,updated_at=CURRENT_TIMESTAMP WHERE key=? AND value=?',raw,key,before),
    jointGuard(DB,token,predicates.join(' AND '),values),
    p('UPDATE users SET coin=coin+? WHERE id=?',award.delta,user.id),
    p('INSERT INTO coin_logs(user_id,change_amount,balance_after,reason) SELECT id,?,coin,? FROM users WHERE id=?',award.delta,reason,user.id),
    jointGuardEnd(DB,token)
  ];
  try{await DB.batch(statements);}
  catch{throw jointError('HUNT_COIN_RETRY','코인 저장을 완료하지 못했습니다. 같은 처치 확인을 다시 시도해 주세요.',503);}
  return {saved:{raw,run:JSON.parse(raw)},summary};
}
