import {prepareUnifiedDropGrant} from './_drop_pool.js';
import {cityRolePolicy} from '../shared/jokgak-city-settings-v1.mjs';
import {EQUIPMENT_FORGE_RELEASE_PROTECTION_CODE} from '../shared/equipment-forge-release-v1.mjs';

const p=(env,sql,...v)=>env.DB.prepare(sql).bind(...v);
export const cityGuard=(env,token,predicate,values=[])=>p(env,`INSERT INTO jokgak_city_guards_v1(token,ok) SELECT ?,CASE WHEN ${predicate} THEN 1 ELSE 0 END`,token,...values);
export const cityGuardEnd=(env,token)=>p(env,'DELETE FROM jokgak_city_guards_v1 WHERE token=?',token);
export function cityRewardEvent(action,winner,self=false){
  if(action==='attack')return winner==='A'?'ATTACK_WIN':winner==='B'?'ATTACK_LOSE':'ATTACK_DRAW';
  if(action==='arrest'&&winner==='A')return 'ARREST_WIN';
  if(action==='inspect')return 'INSPECT';
  if(action==='heal'&&!self)return 'HEAL_OTHER';
  return null;
}
// The action receipt, quota CAS and existing inventory/coin grants are committed
// by the caller in ONE batch. TEST receipts never become payable after ON.
export async function prepareCityReward(env,{user,policy,role,event,targetId,requestId,now}){
  const configured=cityRolePolicy(policy,role).rewards.find(r=>r.event===event);
  const result={event,mode:policy.mode,status:'NONE',coin:0,items:[],paid:false},statements=[];
  if(!configured)return {result,statements};
  if(!policy.rewards.enabled){result.status='DISABLED';return {result,statements};}
  if(!configured.coin&&!configured.items.length){result.status='EMPTY';return {result,statements};}
  const day=Math.floor((now+9*3600000)/86400000),key=`jokgak_city_reward_day_v1:${policy.mode}:${user.id}:${day}`;
  const raw=(await p(env,'SELECT value FROM app_meta WHERE key=?',key).first())?.value??null;
  const before=raw===null?{count:0,lastTargets:{}}:JSON.parse(raw);
  if(!Number.isSafeInteger(before.count)||before.count<0||!before.lastTargets||typeof before.lastTargets!=='object')throw Object.assign(Error('보상 횟수 정보를 확인하지 못했습니다.'),{status:503,code:'CITY_REWARD_RETRY'});
  result.remaining=Math.max(0,policy.rewards.dailyLimit-before.count);
  if(before.count>=policy.rewards.dailyLimit){result.status='DAILY_LIMIT';return {result,statements};}
  if(before.lastTargets[targetId]&&now-Number(before.lastTargets[targetId])<policy.rewards.sameTargetCooldownMs){result.status='TARGET_COOLDOWN';return {result,statements};}
  const refs=configured.items.map(item=>item.code);
  const rows=refs.length?(await p(env,`SELECT code,name FROM inventory_items WHERE is_active=1 AND code<>? AND code IN (${refs.map(()=>'?').join(',')})`,EQUIPMENT_FORGE_RELEASE_PROTECTION_CODE,...refs).all()).results||[]:[];
  const catalog=new Map(rows.map(item=>[item.code,item]));
  if(configured.items.some(item=>!catalog.has(item.code)))throw Object.assign(Error('설정된 보상 아이템이 비활성화되었습니다. 관리자에게 문의하세요.'),{status:409,code:'CITY_REWARD_ITEM'});
  const next={count:before.count+1,lastTargets:{...before.lastTargets,[targetId]:now},token:requestId},nextRaw=JSON.stringify(next);
  const tag=requestId+':reward';
  statements.push(raw===null?p(env,'INSERT INTO app_meta(key,value) VALUES(?,?) ON CONFLICT(key) DO NOTHING',key,nextRaw):p(env,'UPDATE app_meta SET value=? WHERE key=? AND value=?',nextRaw,key,raw),cityGuard(env,tag,'EXISTS(SELECT 1 FROM app_meta WHERE key=? AND value=?)',[key,nextRaw]),cityGuardEnd(env,tag));
  result.coin=configured.coin;result.items=configured.items.map(item=>({...item,name:catalog.get(item.code).name}));result.remaining--;
  result.status=policy.mode==='ON'?'PAID':'TEST_PREVIEW';result.paid=policy.mode==='ON';
  if(result.paid){
    const rewards=[...(configured.coin?[{rewardType:'COIN',rewardRef:'',rewardName:'코인',quantity:configured.coin}]:[]),...result.items.map(item=>({rewardType:'INVENTORY_ITEM',rewardRef:item.code,rewardName:item.name,quantity:item.quantity}))];
    const grant=await prepareUnifiedDropGrant(env,{userId:Number(user.id),requestId:'JOKGAK_CITY:'+requestId,sourceType:'JOKGAK_CITY',sourceId:event,rewards},{writePoolLedger:false});
    const proof=requestId+':reward-proof';
    for(const item of configured.items)statements.push(cityGuard(env,proof+':'+item.code,'EXISTS(SELECT 1 FROM inventory_items WHERE code=? AND is_active=1)',[item.code]),cityGuardEnd(env,proof+':'+item.code));
    statements.push(...grant.statements,cityGuard(env,proof,grant.proofs.map(p=>`(${p.sql})`).join(' AND ')||'1=0',grant.proofs.flatMap(p=>p.values)),cityGuardEnd(env,proof));
  }
  return {result,statements};
}
