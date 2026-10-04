// A short, server-issued dodge drill. Existing hunt rewards remain authoritative;
// the separately configured victory bonus is settled once after playback.
import {jointGuard,jointGuardEnd,ensureJointAtomicSchema} from './_joint_atomic.js';

const PREFIX='apocalypse_dodge_v1:';
const WINDOW_MS=6000,GRACE_MS=2000,RETENTION_MS=24*60*60*1000;
const fail=(message,status=409)=>{throw Object.assign(new Error(message),{status,code:'APOCALYPSE_CHALLENGE'});};
const integer=(value,max)=>value==null||value===''?null:Math.max(0,Math.min(max,Math.floor(Number(value)||0)));
export function normalizeApocalypseBonus(raw={}){
  raw=raw&&typeof raw==='object'?raw:{};
  return {coinPercent:integer(raw.coinPercent,1000),masterStars:integer(raw.masterStars,1000000),mysticEnergy:integer(raw.mysticEnergy,10000)};
}
export function validateApocalypseRequestId(requestId){
  if(!/^[A-Za-z0-9:_.-]{8,120}$/.test(String(requestId||'')))fail('전투 요청 번호를 확인하세요.',400);
  return String(requestId);
}
const keyFor=(userId,requestId)=>PREFIX+userId+':'+validateApocalypseRequestId(requestId);
const snapshot=state=>({requestId:state.requestId,monsterId:state.monsterId,windowMs:WINDOW_MS,
  status:state.status,safeZone:state.safeZone,openedAt:state.openedAt||null,expiresAt:state.expiresAt,
  success:state.success===true,bonuses:state.bonuses,rewards:state.rewards||null});
async function read(env,userId,requestId){
  const key=keyFor(userId,requestId),row=await env.DB.prepare('SELECT value FROM app_meta WHERE key=?').bind(key).first();
  if(!row)fail('저장된 아포칼립스 전투를 찾지 못했습니다.',404);
  const state=JSON.parse(row.value);if(state.userId!==Number(userId))fail('본인의 전투만 확인할 수 있습니다.',403);
  return {key,raw:row.value,state};
}
export async function registerApocalypseChallenge(env,{userId,requestId,monsterId,won,rewardCoin,bonus},now=Date.now()){
  const key=keyFor(userId,requestId),bonuses=normalizeApocalypseBonus(bonus),state={userId:Number(userId),requestId,monsterId:Number(monsterId),won:won===true,
    status:'READY',safeZone:crypto.getRandomValues(new Uint32Array(1))[0]%3,createdAt:now,expiresAt:now+RETENTION_MS,bonuses,
    rewardCoin:Math.max(0,Math.min(1000000000000,Math.floor(Number(rewardCoin||0)*Number(bonuses.coinPercent||0)/100)))};
  await env.DB.prepare('INSERT INTO app_meta(key,value,updated_at) VALUES(?,?,CURRENT_TIMESTAMP) ON CONFLICT(key) DO NOTHING').bind(key,JSON.stringify(state)).run();
  const saved=(await read(env,userId,requestId)).state;
  if(saved.monsterId!==state.monsterId)fail('다른 보스 전투에 사용한 요청 번호입니다.');
  return snapshot(saved);
}
export async function apocalypseChallengeAction(env,user,action,body,now=Date.now()){
  if(!['open','answer','claim','status'].includes(action))fail('지원하지 않는 공략 요청입니다.',404);
  for(let attempt=0;attempt<4;attempt++){
    const {key,raw,state}=await read(env,user.id,body.requestId);
    if(action==='status'||state.status==='CLAIMED')return {...snapshot(state),replayed:state.status==='CLAIMED'};
    if(now>state.expiresAt)fail('추가 보상 공략의 확인 기한이 지났습니다. 기존 전투 보상은 유지됩니다.');
    const next={...state};
    if(action==='open'){
      if(state.status!=='READY')return snapshot(state);
      next.status='OPEN';next.openedAt=now;
    }else if(action==='answer'){
      if(state.status==='ANSWERED')return snapshot(state);
      if(state.status!=='OPEN')fail('공략을 먼저 시작하세요.');
      const zone=body.zone;
      if(!Number.isInteger(zone)||zone< -1||zone>2)fail('이동할 구역을 확인하세요.',400);
      next.status='ANSWERED';next.zone=zone;next.success=zone===state.safeZone&&now<=state.openedAt+WINDOW_MS+GRACE_MS;
    }else{
      if(state.status!=='ANSWERED')fail('회피 입력 결과를 먼저 확인하세요.');
      if(now<state.openedAt+WINDOW_MS)fail('보스의 충격파가 끝난 뒤 보상을 확인하세요.');
      const eligible=state.won,token=crypto.randomUUID();
      next.status='CLAIMED';next.token=token;next.claimedAt=now;
      next.rewards={coin:eligible?state.rewardCoin:0,masterStars:eligible?Number(state.bonuses.masterStars||0):0,mysticEnergy:eligible?Number(state.bonuses.mysticEnergy||0):0};
      await ensureJointAtomicSchema(env);
      const serialized=JSON.stringify(next),guard='EXISTS(SELECT 1 FROM app_meta WHERE key=? AND value=?)',bind=[key,serialized];
      const writes=[env.DB.prepare('UPDATE app_meta SET value=?,updated_at=CURRENT_TIMESTAMP WHERE key=? AND value=?').bind(serialized,key,raw)];
      // All rewards and the terminal receipt commit together, including catalog
      // availability checks. Losing a CAS never grants or partially logs rewards.
      for(const [code,amount] of [['MASTER_STAR',next.rewards.masterStars],['STARLIGHT_ARMOR_CORE',next.rewards.mysticEnergy]]){
        if(!amount)continue;
        const check=crypto.randomUUID();
        writes.push(jointGuard(env.DB,check,`NOT (${guard}) OR EXISTS(SELECT 1 FROM inventory_items WHERE code=? AND is_active=1)`,[...bind,code]),jointGuardEnd(env.DB,check),
          env.DB.prepare(`INSERT INTO cnine_user_inventory(user_id,item_code,quantity,unseen_quantity,created_at,updated_at) SELECT ?,?,?,?,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP WHERE ${guard} ON CONFLICT(user_id,item_code) DO UPDATE SET quantity=cnine_user_inventory.quantity+excluded.quantity,unseen_quantity=cnine_user_inventory.unseen_quantity+excluded.unseen_quantity,updated_at=CURRENT_TIMESTAMP`).bind(user.id,code,amount,amount,...bind),
          env.DB.prepare(`INSERT INTO inventory_logs(user_id,item_code,change_amount,balance_after,reason,reference_type,reference_id) SELECT ?,?,?,quantity,'아포칼립스 처치 추가 보상','APOCALYPSE_DODGE',? FROM cnine_user_inventory WHERE user_id=? AND item_code=? AND ${guard}`).bind(user.id,code,amount,state.requestId,user.id,code,...bind));
      }
      if(next.rewards.coin)writes.push(env.DB.prepare(`UPDATE users SET coin=coin+? WHERE id=? AND ${guard}`).bind(next.rewards.coin,user.id,...bind),
        env.DB.prepare(`INSERT INTO coin_logs(user_id,change_amount,balance_after,reason) SELECT id,?,coin,'아포칼립스 처치 추가 보상' FROM users WHERE id=? AND ${guard}`).bind(next.rewards.coin,user.id,...bind));
      await env.DB.batch(writes);
      const saved=(await read(env,user.id,body.requestId)).state;
      if(saved.status==='CLAIMED')return {...snapshot(saved),replayed:saved.token!==token};
      continue;
    }
    const changed=await env.DB.prepare('UPDATE app_meta SET value=?,updated_at=CURRENT_TIMESTAMP WHERE key=? AND value=?').bind(JSON.stringify(next),key,raw).run();
    if(Number(changed.meta?.changes||0))return snapshot(next);
  }
  fail('공략 결과를 저장 중입니다. 같은 전투로 다시 확인하세요.');
}
