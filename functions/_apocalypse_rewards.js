import {supplyBoxSettings} from './_equipment.js';
import {blackMiracleSettings} from './_black_miracle_pack.js';
import {resolveAvatarDropRate} from './_avatar_drop.js';
import {planUnifiedDropRoll,prepareUnifiedDropGrant,applyDailyLimits} from './_drop_pool.js';
import {accountRankAward} from './_account_rank.js';
import {jointGuard,jointGuardEnd} from './_joint_atomic.js';

const p=(env,sql,...values)=>env.DB.prepare(sql).bind(...values);
const clamp=(n,max)=>Math.max(0,Math.min(max,Math.floor(Number(n)||0)));
const unit=text=>{let hash=2166136261;for(const ch of String(text)){hash^=ch.charCodeAt(0);hash=Math.imul(hash,16777619)>>>0}return hash/4294967296};
const parse=value=>{try{return JSON.parse(value||'{}')}catch{return {}}};

// Freeze all rolls without crediting the account. Only a completed, successful
// mechanic can submit these server-owned plans to the terminal transaction.
export async function planApocalypseRewards(env,{user,requestId,monster,reward,won,card,duplicateShards,pveMagic,bonus}){
  const plan={reward:won?reward:0,card:won?card:null,duplicateShards,items:[],magic:null,unified:null,
    bonuses:won?{coin:clamp(reward*Number(bonus?.coinPercent||0)/100,1000000000000),masterStars:Number(bonus?.masterStars||0),mysticEnergy:Number(bonus?.mysticEnergy||0)}:{coin:0,masterStars:0,mysticEnergy:0}};
  if(!won)return plan;
  const [supply,black,rerollRow]=await Promise.all([supplyBoxSettings(env),blackMiracleSettings(env),p(env,"SELECT value FROM app_meta WHERE key='high_grade_reroll_settings_v1'").first()]);
  const source=supply.sources.PVE;
  if(supply.enabled&&source?.enabled&&source.rate>0){
    const rate=(await resolveAvatarDropRate(env,user.id,source.rate)).total;
    if(unit(`SUPPLY_DROP:${user.id}:PVE:${monster.id}:${requestId}`)*100<rate){
      const quantity=Math.max(1,clamp(source.quantity??1,100));
      plan.items.push({code:'EQUIPMENT_SUPPLY_BOX',quantity});
      plan.equipmentReward={kind:'SUPPLY_BOX',itemCode:'EQUIPMENT_SUPPLY_BOX',name:'장비 보급상자',image:'assets/ui/packs/supply-high.jpeg',quantity,sourceType:'PVE',sourceId:String(monster.id)};
    }
  }
  const blackRule=black.sources.PVE;
  if(blackRule?.enabled&&Math.random()*100<(await resolveAvatarDropRate(env,user.id,blackRule.rate)).total){
    plan.items.push({code:'BLACK_MIRACLE_PACK',quantity:blackRule.quantity});
    plan.blackMiracleReward={itemCode:'BLACK_MIRACLE_PACK',name:black.name,image:black.image,quantity:blackRule.quantity};
  }
  const rerollRate=Math.max(0,Math.min(100,Number(parse(rerollRow?.value).dropRates?.PVE||0)));
  if(rerollRate>0&&Math.random()*100<(await resolveAvatarDropRate(env,user.id,rerollRate)).total)plan.items.push({code:'HIGH_GRADE_REROLL_TICKET',quantity:1});
  if(pveMagic.enabled===true&&Number(pveMagic.amount)>0){
    const chance=(await resolveAvatarDropRate(env,user.id,pveMagic.chance)).total,roll=Math.random()*100;
    plan.magic={chance,roll,amount:roll<chance?clamp(pveMagic.amount,100000000):0,dailyLimit:clamp(pveMagic.dailyLimit,100000000)};
  }
  const dropInput={userId:user.id,requestId:`UNIFIED:${requestId}`,sourceId:String(monster.id),triggerType:'WIN',context:{boss:Boolean(monster.is_boss),difficulty:'APOCALYPSE'},role:user.role};
  plan.unified=await planUnifiedDropRoll(env,{...dropInput,sourceType:'PVE_APOCALYPSE'});
  if(!plan.unified.pools.length)plan.unified=await planUnifiedDropRoll(env,{...dropInput,sourceType:'PVE'});
  return plan;
}

function inventoryWrites(env,userId,code,quantity,requestId){
  const token=crypto.randomUUID();
  return [jointGuard(env.DB,token,'EXISTS(SELECT 1 FROM inventory_items WHERE code=? AND is_active=1)',[code]),
    p(env,'INSERT INTO cnine_user_inventory(user_id,item_code,quantity,unseen_quantity,created_at,updated_at) VALUES(?,?,?,?,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP) ON CONFLICT(user_id,item_code) DO UPDATE SET quantity=cnine_user_inventory.quantity+excluded.quantity,unseen_quantity=cnine_user_inventory.unseen_quantity+excluded.unseen_quantity,updated_at=CURRENT_TIMESTAMP',userId,code,quantity,quantity),
    p(env,"INSERT INTO inventory_logs(user_id,item_code,change_amount,balance_after,reason,reference_type,reference_id) SELECT user_id,item_code,?,quantity,'아포칼립스 전투 완료 보상','APOCALYPSE_CLEAR',? FROM cnine_user_inventory WHERE user_id=? AND item_code=?",quantity,requestId,userId,code),jointGuardEnd(env.DB,token)];
}

// The caller places every statement behind the same receipt CAS guard. A fault
// anywhere rolls back the clear, every grant, rank XP and all battle logs.
export async function prepareApocalypseRewards(env,user,state,now=Date.now()){
  const plan=state.plan,requestId=state.requestId,statements=[],patch={result:state.won?'WIN':'LOSE',reward:state.won?plan.reward:0,cardReward:null,magicReward:null,equipmentReward:null,blackMiracleReward:null,unifiedDrop:null,apocalypseBonus:{rewards:plan.bonuses}};
  if(!state.won)return {statements,patch};
  if(plan.unified?.rewards?.length){
    const drop={...plan.unified,rewards:await applyDailyLimits(env,user.id,plan.unified.rewards)};
    const grant=await prepareUnifiedDropGrant(env,drop);
    statements.push(...grant.statements);
    for(const proof of grant.proofs){const t=crypto.randomUUID();statements.push(jointGuard(env.DB,t,proof.sql,proof.values),jointGuardEnd(env.DB,t));}
    patch.unifiedDrop={ok:true,...drop,rewards:grant.rewards,balances:grant.balances};
  }
  statements.push(...await accountRankAward(env,user.id,'APOCALYPSE',requestId));
  const coin=Number(plan.reward)+Number(plan.bonuses.coin);
  if(coin)statements.push(p(env,'UPDATE users SET coin=coin+? WHERE id=?',coin,user.id),p(env,"INSERT INTO coin_logs(user_id,change_amount,balance_after,reason) SELECT id,?,coin,'아포칼립스 전투 완료 보상' FROM users WHERE id=?",coin,user.id));
  const items=[...plan.items];
  if(plan.bonuses.masterStars)items.push({code:'MASTER_STAR',quantity:plan.bonuses.masterStars});
  if(plan.bonuses.mysticEnergy)items.push({code:'STARLIGHT_ARMOR_CORE',quantity:plan.bonuses.mysticEnergy});
  if(plan.card){
    const card=plan.card,owned=await p(env,'SELECT quantity FROM user_cards WHERE user_id=? AND card_id=?',user.id,card.id).first();
    const duplicate=Number(owned?.quantity||0)>0,shardGained=duplicate?Number(plan.duplicateShards||0):0,masterStarGained=duplicate&&card.grade==='MA'?1:0;
    statements.push(p(env,'INSERT INTO user_cards(user_id,card_id,quantity) VALUES(?,?,1) ON CONFLICT(user_id,card_id) DO UPDATE SET quantity=user_cards.quantity+1,last_obtained_at=CURRENT_TIMESTAMP',user.id,card.id));
    if(shardGained)statements.push(p(env,'UPDATE users SET card_shards=card_shards+? WHERE id=?',shardGained,user.id),p(env,"INSERT INTO shard_logs(user_id,change_amount,balance_after,reason,card_id) SELECT id,?,card_shards,'PVE_DUPLICATE',? FROM users WHERE id=?",shardGained,card.id,user.id));
    if(masterStarGained)items.push({code:'MASTER_STAR',quantity:1});
    patch.cardReward={card,duplicate,shardGained,masterStarGained};
  }
  for(const item of items)statements.push(...inventoryWrites(env,user.id,item.code,item.quantity,requestId));
  patch.equipmentReward=plan.equipmentReward||null;patch.blackMiracleReward=plan.blackMiracleReward||null;
  if(plan.magic){
    const magic=plan.magic,today=new Date(now+9*3600000).toISOString().slice(0,10);
    const earned=Number((await p(env,"SELECT COALESCE(SUM(change_amount),0) total FROM magic_crystal_logs WHERE user_id=? AND reference_type='PVE_DROP' AND change_amount>0 AND date(created_at,'+9 hours')=?",user.id,today).first())?.total||0);
    const amount=magic.dailyLimit>0?Math.min(magic.amount,Math.max(0,magic.dailyLimit-earned)):magic.amount;
    if(amount){
      const token=crypto.randomUUID();
      if(magic.dailyLimit>0)statements.push(jointGuard(env.DB,token,"(SELECT COALESCE(SUM(change_amount),0) FROM magic_crystal_logs WHERE user_id=? AND reference_type='PVE_DROP' AND change_amount>0 AND date(created_at,'+9 hours')=?)<=?",[user.id,today,magic.dailyLimit-amount]));
      statements.push(p(env,'UPDATE users SET magic_crystals=magic_crystals+? WHERE id=?',amount,user.id),p(env,"INSERT INTO magic_crystal_logs(user_id,change_amount,balance_after,reason,reference_type,reference_id) SELECT id,?,magic_crystals,'아포칼립스 승리 확률 드랍','PVE_DROP',? FROM users WHERE id=?",amount,requestId,user.id));
      if(magic.dailyLimit>0)statements.push(jointGuardEnd(env.DB,token));
    }
    patch.magicReward={source:'PVE_DROP',referenceId:requestId,awarded:amount>0,amount,chance:magic.chance,roll:magic.roll,dailyLimit:magic.dailyLimit,dailyEarned:earned+amount,limited:amount<magic.amount};
  }
  for(const key of [String(state.monsterId),'*'])statements.push(p(env,"INSERT INTO user_title_progress_events(user_id,event_type,event_key,clear_count) VALUES(?,'PVE',?,1) ON CONFLICT(user_id,event_type,event_key) DO UPDATE SET clear_count=user_title_progress_events.clear_count+1,updated_at=CURRENT_TIMESTAMP",user.id,key));
  return {statements,patch};
}
