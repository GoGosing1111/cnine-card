import {contentProgressionStatements as seasonAwardStatements} from './_content_progression.js';
import {raidPigCoinRewardStatements} from './_raid_pig_rewards.js';
import {collectionRewardCoin,withCollectionBonusScope} from './_collection_bonuses.js';
import {accountRankAward} from './_account_rank.js';
import {pigCoinRewardWeek} from '../shared/loot-shop-policy-v1.mjs';
import {PET_ESSENCE} from '../shared/pet-opening-v1.mjs';
import {jointGuard,jointGuardEnd} from './_joint_atomic.js';
import {prepareLichClearMilestone} from './_milestone_trophies.js';
import {prepareRewardRevealContext,prepareRewardRevealOffer} from './_reward_reveal.js';

export const LICH_WEEKLY_REWARD_LIMIT=3;
export const lichRewardWeek=pigCoinRewardWeek;
const counterKey=(userId,week)=>'raid_lich_weekly_v1:'+week.weekKey+':'+Number(userId);
const quota=(week,used)=>({...week,limit:LICH_WEEKLY_REWARD_LIMIT,used,remaining:Math.max(0,LICH_WEEKLY_REWARD_LIMIT-used)});
async function weeklyRow(env,userId,at){
  const week=lichRewardWeek(at),key=counterKey(userId,week);
  const field=name=>env.DB.dialect==='postgres'?`(CAST(r.state_json AS JSONB)->>'${name}')`:`json_extract(r.state_json,'$.${name}')`;
  // Old paid clears count too. New settlements use the atomic weekly counter;
  // excluding them here prevents counting a multi-item reward more than once.
  const row=await env.DB.prepare(`SELECT (SELECT value FROM app_meta WHERE key=?) raw,
    (SELECT COUNT(DISTINCT l.reference_id) FROM inventory_logs l
     JOIN raid_lich_rooms_v1 r ON r.room_id=l.reference_id
     WHERE l.user_id=? AND l.item_code=? AND l.reference_type='LICH_RAID_CLEAR' AND l.change_amount>0
       AND ${field('clearRewardSettlement')} IS NULL
       AND CAST(${field('finishedAt')} AS BIGINT)>=?
       AND CAST(${field('finishedAt')} AS BIGINT)<?) legacy`)
    .bind(key,Number(userId),PET_ESSENCE,Date.parse(week.startsAt),Date.parse(week.resetsAt)).first();
  const raw=row?.raw??null,count=raw===null?0:JSON.parse(raw).count;
  if(!Number.isSafeInteger(count)||count<0)throw Error('Invalid Lich weekly counter');
  return {key,raw,count,weekly:quota(week,count+Number(row?.legacy||0))};
}
export async function lichWeeklyReward(env,userId,at=Date.now()){
  return (await weeklyRow(env,userId,at)).weekly;
}
export function lichClearRewardPolicy(cfg,releaseMode=cfg.mode){
  return {enabled:cfg.mode==='ON'&&releaseMode==='ON',petEssence:cfg.petEssenceEnabled?cfg.petEssenceReward:0,
    masterStars:cfg.masterStarReward,coin:cfg.coinReward,pigCoins:cfg.pigCoinReward||0,settingsRevision:cfg.revision};
}
export function lichClearRewardFor(room,userId){
  const reward=room.clearRewardSettlement;if(!reward)return null;
  const granted=reward.grantedIds.includes(String(userId));
  return {status:granted?'GRANTED':reward.limitedIds.includes(String(userId))?'WEEKLY_LIMIT':'DISABLED',granted,
    petEssence:granted?reward.petEssence:0,masterStars:granted?reward.masterStars:0,coin:granted?(reward.coinByUser?.[String(userId)]??reward.coin):0,
    ...(reward.pigCoins?{pigCoins:granted?reward.pigCoins:0}:{}),weeklyReward:reward.weeklyByUser[String(userId)],settingsRevision:reward.settingsRevision,...(reward.choiceOffers?.[String(userId)]?{choiceOffer:reward.choiceOffers[String(userId)]}:{})};
}
export async function prepareLichClearRewards(env,row,room){
  const plan={statements:[],counters:[]};
  await prepareLichClearMilestone(env,row,room,plan);
  if(row.status!=='ACTIVE'||room.status!=='CLEAR'||room.clearRewardSettlement||room.petEssenceSettlement)return plan;
  // Coin and rank EXP use the same current collection snapshot per participant.
  // Do not re-scan every trophy history for both rewards during the final hit.
  env=withCollectionBonusScope(env);
  // In-flight rooms retain the reward amounts snapshotted by the previous build.
  const policy=room.clearRewardPolicy||{enabled:room.petEssencePolicy?.enabled===true,
    petEssence:room.petEssencePolicy?.quantity||0,masterStars:0,coin:0,settingsRevision:room.petEssencePolicy?.settingsRevision??null};
  const reveal=await prepareRewardRevealContext(env,'LICH',room.revealPolicy,room.releaseMode==='ON');
  plan.statements.push(...reveal.statements);
  const enabled=policy.enabled&&room.releaseMode==='ON'&&(policy.petEssence>0||policy.masterStars>0||policy.coin>0||policy.pigCoins>0)||reveal.enabled;
  const reward={petEssence:policy.petEssence,masterStars:policy.masterStars,coin:policy.coin,...(policy.pigCoins?{pigCoins:policy.pigCoins}:{}),
    settingsRevision:policy.settingsRevision,grantedIds:[],limitedIds:[],weeklyByUser:{}};
  const participants=[...room.members].sort((a,b)=>Number(a.id)-Number(b.id));
  const rows=await Promise.all(participants.map(member=>weeklyRow(env,member.id,room.finishedAt)));
  // Group independent reads so the existing PostgreSQL read pipeline can send
  // them together. Keep all writes in the original ordered atomic room commit.
  const prepared=await Promise.all(participants.map(async(member,i)=>{
    const before=rows[i],uid=Number(member.id);
    if(!enabled||!before.weekly.remaining)return null;
    const token=crypto.randomUUID(),raw=JSON.stringify({count:before.count+1,roomId:room.id,token});
    const guard={guard:'EXISTS(SELECT 1 FROM app_meta WHERE key=? AND value=?)',values:[before.key,raw]};
    const [coin,season,rank]=await Promise.all([
      policy.coin?collectionRewardCoin(env,uid,policy.coin,'LICH_RAID'):0,
      seasonAwardStatements(env,{userId:uid,eventId:'LICH:'+room.id,source:'RAID',won:true,startedAt:room.startedAt||room.finishedAt},guard),
      accountRankAward(env,uid,'LICH_RAID_WEEKLY',room.id,guard)
    ]);
    return {token,raw,coin,season,rank};
  }));
  for(let i=0;i<participants.length;i++){
    const userId=String(participants[i].id),uid=Number(userId),before=rows[i];
    reward.weeklyByUser[userId]=before.weekly;
    if(!enabled)continue;
    if(!before.weekly.remaining){reward.limitedIds.push(userId);continue;}
    const {token,raw,coin,season,rank}=prepared[i];
    plan.counters.push(before);
    plan.statements.push(before.raw===null
      ?env.DB.prepare('INSERT INTO app_meta(key,value,updated_at) VALUES(?,?,CURRENT_TIMESTAMP) ON CONFLICT(key) DO NOTHING').bind(before.key,raw)
      :env.DB.prepare('UPDATE app_meta SET value=?,updated_at=CURRENT_TIMESTAMP WHERE key=? AND value=?').bind(raw,before.key,before.raw),
      jointGuard(env.DB,token,'EXISTS(SELECT 1 FROM app_meta WHERE key=? AND value=?)',[before.key,raw]));
    for(const [code,amount]of [[PET_ESSENCE,policy.petEssence],['MASTER_STAR',policy.masterStars]]){
      if(!amount)continue;
      const guard=crypto.randomUUID();
      plan.statements.push(jointGuard(env.DB,guard,'EXISTS(SELECT 1 FROM inventory_items WHERE code=? AND is_active=1)',[code]),
        env.DB.prepare('INSERT INTO cnine_user_inventory(user_id,item_code,quantity,unseen_quantity,updated_at) VALUES(?,?,?,?,CURRENT_TIMESTAMP) ON CONFLICT(user_id,item_code) DO UPDATE SET quantity=cnine_user_inventory.quantity+excluded.quantity,unseen_quantity=cnine_user_inventory.unseen_quantity+excluded.unseen_quantity,updated_at=CURRENT_TIMESTAMP').bind(uid,code,amount,amount),
        env.DB.prepare("INSERT INTO inventory_logs(user_id,item_code,change_amount,balance_after,reason,reference_type,reference_id) SELECT user_id,item_code,?,quantity,'리치왕 정벌 클리어','LICH_RAID_CLEAR',? FROM cnine_user_inventory WHERE user_id=? AND item_code=?").bind(amount,room.id,uid,code),jointGuardEnd(env.DB,guard));
    }
    if(policy.coin){
      (reward.coinByUser||={})[userId]=coin;
      plan.statements.push(env.DB.prepare('UPDATE users SET coin=coin+CAST(? AS BIGINT) WHERE id=?').bind(coin,uid),
        env.DB.prepare('INSERT INTO coin_logs(user_id,change_amount,balance_after,reason) SELECT id,?,coin,? FROM users WHERE id=?').bind(coin,'리치왕 정벌 클리어 ['+room.id+']',uid));
    }
    plan.statements.push(...raidPigCoinRewardStatements(env,{userId:uid,source:'LICH_RAID',roomId:room.id,amount:policy.pigCoins||0,guardSql:'EXISTS(SELECT 1 FROM app_meta WHERE key=? AND value=?)',guardBindings:[before.key,raw],at:room.finishedAt}));
    plan.statements.push(...season,...rank,jointGuardEnd(env.DB,token));
    reward.grantedIds.push(userId);reward.weeklyByUser[userId]=quota(before.weekly,before.weekly.used+1);
    const choice=prepareRewardRevealOffer(env,reveal,{userId:uid,roomId:room.id,baseReward:{coin:reward.coinByUser?.[userId]??reward.coin,masterStars:reward.masterStars,petEssence:reward.petEssence,...(reward.pigCoins?{pigCoins:reward.pigCoins}:{})},quota:{...reward.weeklyByUser[userId],period:'week'},finishedAt:room.finishedAt});
    if(choice.offer){plan.statements.push(...choice.statements);(reward.choiceOffers||={})[userId]=choice.offer;}
  }
  room.clearRewardSettlement=reward;
  // Retain the old response contract for players who still have an open tab.
  room.petEssenceSettlement={status:policy.petEssence>0&&reward.grantedIds.length?'GRANTED':reward.limitedIds.length?'WEEKLY_LIMIT':'DISABLED',
    quantity:policy.petEssence,participantIds:policy.petEssence>0?reward.grantedIds:[],settingsRevision:policy.settingsRevision};
  return plan;
}
export async function lichRewardCounterChanged(env,plan){
  for(const before of plan.counters){
    const row=await env.DB.prepare('SELECT value FROM app_meta WHERE key=?').bind(before.key).first();
    if((row?.value??null)!==before.raw)return true;
  }
  return false;
}
