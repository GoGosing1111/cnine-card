import {pigCoinRewardWeek} from '../shared/loot-shop-policy-v1.mjs';
import {jointGuard,jointGuardEnd} from './_joint_atomic.js';

async function counter(env,userId,at,limit){
  const week=pigCoinRewardWeek(at),key=`raid_madara_weekly_v1:${week.weekKey}:${Number(userId)}`;
  const row=await env.DB.prepare('SELECT value FROM app_meta WHERE key=?').bind(key).first(),raw=row?.value??null;
  const used=raw===null?0:JSON.parse(raw).count;
  if(!Number.isSafeInteger(used)||used<0)throw Error('Invalid Madara reward counter');
  return {key,raw,weekly:{...week,limit,used,remaining:Math.max(0,limit-used)}};
}
export async function madaraWeeklyReward(env,userId,limit,at=Date.now()){return (await counter(env,userId,at,limit)).weekly;}
export function madaraRewardFor(room,userId){
  return room.clearRewards?.[String(userId)]||null;
}
export async function prepareMadaraRewards(env,row,room){
  const plan={statements:[],counters:[]};
  if(row.status!=='ACTIVE'||room.status!=='CLEAR'||room.clearRewards)return plan;
  const p=room.rewardPolicy||{},enabled=p.enabled===true&&room.releaseMode==='ON'&&(p.coin>0||p.masterStars>0||p.petEssence>0);
  room.clearRewards={};
  for(const member of [...room.members].filter(m=>!m.left).sort((a,b)=>Number(a.id)-Number(b.id))){
    const uid=Number(member.id),before=await counter(env,uid,room.finishedAt,p.weeklyLimit||7);
    const granted=enabled&&before.weekly.remaining>0;
    room.clearRewards[member.id]={granted,status:granted?'GRANTED':enabled?'WEEKLY_LIMIT':'DISABLED',coin:granted?p.coin:0,masterStars:granted?p.masterStars:0,petEssence:granted?p.petEssence:0,weeklyReward:before.weekly};
    if(!granted)continue;
    const token=crypto.randomUUID(),raw=JSON.stringify({count:before.weekly.used+1,roomId:room.id,token});plan.counters.push(before);
    plan.statements.push(before.raw===null
      ?env.DB.prepare('INSERT INTO app_meta(key,value,updated_at) VALUES(?,?,CURRENT_TIMESTAMP) ON CONFLICT(key) DO NOTHING').bind(before.key,raw)
      :env.DB.prepare('UPDATE app_meta SET value=?,updated_at=CURRENT_TIMESTAMP WHERE key=? AND value=?').bind(raw,before.key,before.raw),
      jointGuard(env.DB,token,'EXISTS(SELECT 1 FROM app_meta WHERE key=? AND value=?)',[before.key,raw]),
      jointGuard(env.DB,token+':user','EXISTS(SELECT 1 FROM users WHERE id=?)',[uid]));
    for(const [code,amount] of [['PET_ESSENCE',p.petEssence],['MASTER_STAR',p.masterStars]]){
      if(!amount)continue;
      const guard=crypto.randomUUID();
      plan.statements.push(jointGuard(env.DB,guard,'EXISTS(SELECT 1 FROM inventory_items WHERE code=? AND is_active=1)',[code]),
        env.DB.prepare('INSERT INTO cnine_user_inventory(user_id,item_code,quantity,unseen_quantity,updated_at) VALUES(?,?,?,?,CURRENT_TIMESTAMP) ON CONFLICT(user_id,item_code) DO UPDATE SET quantity=cnine_user_inventory.quantity+excluded.quantity,unseen_quantity=cnine_user_inventory.unseen_quantity+excluded.unseen_quantity,updated_at=CURRENT_TIMESTAMP').bind(uid,code,amount,amount),
        env.DB.prepare("INSERT INTO inventory_logs(user_id,item_code,change_amount,balance_after,reason,reference_type,reference_id) SELECT user_id,item_code,?,quantity,'마다라 레이드 클리어','MADARA_RAID_CLEAR',? FROM cnine_user_inventory WHERE user_id=? AND item_code=?").bind(amount,room.id,uid,code),jointGuardEnd(env.DB,guard));
    }
    if(p.coin)plan.statements.push(env.DB.prepare('UPDATE users SET coin=coin+? WHERE id=?').bind(p.coin,uid),
      env.DB.prepare('INSERT INTO coin_logs(user_id,change_amount,balance_after,reason) SELECT id,?,coin,? FROM users WHERE id=?').bind(p.coin,`마다라 레이드 클리어 [${room.id}]`,uid));
    plan.statements.push(jointGuardEnd(env.DB,token+':user'),jointGuardEnd(env.DB,token));
    room.clearRewards[member.id].weeklyReward={...before.weekly,used:before.weekly.used+1,remaining:before.weekly.remaining-1};
  }
  return plan;
}
export async function madaraCounterChanged(env,plan){
  for(const before of plan.counters){const row=await env.DB.prepare('SELECT value FROM app_meta WHERE key=?').bind(before.key).first();if((row?.value??null)!==before.raw)return true;}
  return false;
}
