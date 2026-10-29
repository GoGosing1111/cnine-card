import {raidPigCoinRewardStatements} from './_raid_pig_rewards.js';
import {collectionRewardCoin} from './_collection_bonuses.js';
import {accountRankAward} from './_account_rank.js';
import {pigCoinRewardWeek} from '../shared/loot-shop-policy-v1.mjs';
import {jointGuard,jointGuardEnd} from './_joint_atomic.js';
import {prepareRewardRevealContext,prepareRewardRevealOffer} from './_reward_reveal.js';

async function counter(env,userId,at,limit){
  const week=pigCoinRewardWeek(at),key=`raid_blackwing_weekly_v1:${week.weekKey}:${Number(userId)}`;
  const row=await env.DB.prepare('SELECT value FROM app_meta WHERE key=?').bind(key).first(),raw=row?.value??null;
  const used=raw===null?0:JSON.parse(raw).count;
  if(!Number.isSafeInteger(used)||used<0)throw Error('Invalid Blackwing reward counter');
  return {key,raw,weekly:{...week,limit,used,remaining:Math.max(0,limit-used)}};
}
export async function blackwingWeeklyReward(env,userId,limit,at=Date.now()){return (await counter(env,userId,at,limit)).weekly;}
export function blackwingRewardFor(room,userId){
  return room.clearRewards?.[String(userId)]||null;
}
export async function prepareBlackwingRewards(env,row,room){
  const plan={statements:[],counters:[]};
  if(row.status!=='ACTIVE'||room.status!=='CLEAR'||room.clearRewards)return plan;
  const frozen=room.rewardPolicy||{},reveal=await prepareRewardRevealContext(env,'BLACKWING',room.revealPolicy,room.releaseMode==='ON');
  const p=frozen.enabled?frozen:{...frozen,coin:0,masterStars:0,petEssence:0,pigCoins:0};
  const enabled=p.enabled===true&&room.releaseMode==='ON'&&(p.coin>0||p.masterStars>0||p.petEssence>0||p.pigCoins>0)||reveal.enabled;
  plan.statements.push(...reveal.statements);
  // A lower current quota also applies to rooms started under an older limit.
  const stored=await env.DB.prepare('SELECT value FROM app_meta WHERE key=?').bind('raid_blackwing_settings_v1').first();
  const currentLimit=stored?(JSON.parse(stored.value).weeklyRewardLimit??3):3;
  if(!Number.isSafeInteger(currentLimit)||currentLimit<1||currentLimit>30)throw Error('Invalid current Blackwing weekly limit');
  const weeklyLimit=Math.min(p.weeklyLimit||3,currentLimit);
  room.clearRewards={};
  for(const member of [...room.members].filter(m=>!m.left).sort((a,b)=>Number(a.id)-Number(b.id))){
    const uid=Number(member.id),before=await counter(env,uid,room.finishedAt,weeklyLimit);
    const granted=enabled&&before.weekly.remaining>0;
    const coin=granted?await collectionRewardCoin(env,uid,p.coin,'BLACKWING_RAID'):0;
    room.clearRewards[member.id]={granted,status:granted?'GRANTED':enabled?'WEEKLY_LIMIT':'DISABLED',coin,masterStars:granted?p.masterStars:0,petEssence:granted?p.petEssence:0,...(p.pigCoins?{pigCoins:granted?p.pigCoins:0}:{}),weeklyReward:before.weekly};
    if(!granted)continue;
    if(stored&&!plan.settingsGuard){const token=crypto.randomUUID();plan.statements.push(jointGuard(env.DB,token,'EXISTS(SELECT 1 FROM app_meta WHERE key=? AND value=?)',['raid_blackwing_settings_v1',stored.value]),jointGuardEnd(env.DB,token));plan.settingsGuard=true;}
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
        env.DB.prepare("INSERT INTO inventory_logs(user_id,item_code,change_amount,balance_after,reason,reference_type,reference_id) SELECT user_id,item_code,?,quantity,'흑익의 맹약 레이드 클리어','BLACKWING_RAID_CLEAR',? FROM cnine_user_inventory WHERE user_id=? AND item_code=?").bind(amount,room.id,uid,code),jointGuardEnd(env.DB,guard));
    }
    if(p.coin)plan.statements.push(env.DB.prepare('UPDATE users SET coin=coin+? WHERE id=?').bind(coin,uid),
      env.DB.prepare('INSERT INTO coin_logs(user_id,change_amount,balance_after,reason) SELECT id,?,coin,? FROM users WHERE id=?').bind(coin,`흑익의 맹약 레이드 클리어 [${room.id}]`,uid));
    plan.statements.push(...raidPigCoinRewardStatements(env,{userId:uid,source:'BLACKWING_RAID',roomId:room.id,amount:p.pigCoins||0,guardSql:'EXISTS(SELECT 1 FROM app_meta WHERE key=? AND value=?)',guardBindings:[before.key,raw],at:room.finishedAt}));
    plan.statements.push(...await accountRankAward(env,uid,'BLACKWING_RAID_WEEKLY',room.id,{
      guard:'EXISTS(SELECT 1 FROM app_meta WHERE key=? AND value=?)',values:[before.key,raw]
    }),jointGuardEnd(env.DB,token+':user'),jointGuardEnd(env.DB,token));
    room.clearRewards[member.id].weeklyReward={...before.weekly,used:before.weekly.used+1,remaining:before.weekly.remaining-1};
    const choice=prepareRewardRevealOffer(env,reveal,{userId:uid,roomId:room.id,baseReward:{coin,masterStars:p.masterStars,petEssence:p.petEssence,...(p.pigCoins?{pigCoins:p.pigCoins}:{})},quota:{...room.clearRewards[member.id].weeklyReward,period:'week'},finishedAt:room.finishedAt});
    if(choice.offer){plan.statements.push(...choice.statements);room.clearRewards[member.id].choiceOffer=choice.offer;}
  }
  return plan;
}
export async function blackwingCounterChanged(env,plan){
  for(const before of plan.counters){const row=await env.DB.prepare('SELECT value FROM app_meta WHERE key=?').bind(before.key).first();if((row?.value??null)!==before.raw)return true;}
  return false;
}
