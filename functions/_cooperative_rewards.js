import {COOP_SETTINGS_KEY,COOP_REWARD_DAILY_LIMIT,coopRewardDay,hasCoopReward,validateCoopRewards} from '../shared/cooperative-rewards-v1.mjs';
import {EQUIPMENT_FORGE_RELEASE_PROTECTION_CODE} from '../shared/equipment-forge-release-v1.mjs';
import {jointGuard,jointGuardEnd,ensureJointAtomicSchema} from './_joint_atomic.js';
import {prepareRewardRevealContext,prepareRewardRevealOffer} from './_reward_reveal.js';

const p=(env,sql,...args)=>env.DB.prepare(sql).bind(...args);
const read=async(env,key)=>(await p(env,'SELECT value FROM app_meta WHERE key=?',key).first())?.value??null;
export async function coopRewardCatalog(env){
 const rows=(await p(env,'SELECT code,name,rarity,image_url FROM inventory_items WHERE is_active=1 AND code<>? AND code<>? ORDER BY name,code LIMIT 1001',EQUIPMENT_FORGE_RELEASE_PROTECTION_CODE,'MASTER_STAR').all()).results;
 if(rows.length>1000)throw Error('Cooperative reward catalog limit');
 return rows.map(row=>({code:row.code,name:row.name,rarity:row.rarity,image:row.image_url||''}));
}
async function counter(env,userId,at){
 const period=coopRewardDay(at),key=`coop_reward_day_v1:${period.day}:${Number(userId)}`,raw=await read(env,key),used=raw===null?0:JSON.parse(raw).count;
 if(!Number.isSafeInteger(used)||used<0||used>COOP_REWARD_DAILY_LIMIT)throw Error('Invalid cooperative reward counter');
 return {key,raw,daily:{...period,used,remaining:Math.max(0,period.limit-used)}};
}
export async function coopDailyReward(env,userId,at=Date.now()){return (await counter(env,userId,at)).daily;}
const empty=(status)=>({status,granted:false,coin:0,masterStars:0,items:[]});
export function coopUnpaidRewards(room){
 const policy=room.rewardPolicy;
 if(room.status==='VICTORY'&&policy?.mode==='ON'&&(policy.enabled&&hasCoopReward(policy)||policy.revealPolicy?.enabled))return null;
 return Object.fromEntries(room.members.map(m=>[m.id,empty(m.result==='VICTORY'?'DISABLED':'DEFEAT')]));
}

// Called only with the private Durable Object's terminal room, never client data.
// PostgreSQL/D1 batch commits the receipt, all player quotas, balances and logs
// together. The DO may lose its acknowledgement and safely retry after restart.
export async function settleCoopRewards(env,room){
 if(!['VICTORY','DEFEAT','CANCELLED'].includes(room.status))throw Error('Cooperative room is not terminal');
 const unpaid=coopUnpaidRewards(room);if(unpaid)return unpaid;
 const key='coop_reward_receipt_v1:'+room.id,frozen=room.rewardPolicy;
 if(!Number.isSafeInteger(room.finishedAt)||room.finishedAt<room.createdAt||!room.creationRequest)throw Error('Invalid cooperative finish proof');
 const replay=async()=>{
  const raw=await read(env,key);if(raw===null)return null;const receipt=JSON.parse(raw);
  if(receipt.creationRequest!==room.creationRequest)throw Error('Cooperative receipt collision');
  return receipt.rewards;
 };
 await ensureJointAtomicSchema(env);
 for(let attempt=0;attempt<4;attempt++){
  const prior=await replay();if(prior)return prior;
  const settingsRaw=await read(env,COOP_SETTINGS_KEY),settings=settingsRaw===null?null:JSON.parse(settingsRaw);
  const enabled=settings?.mode==='ON'&&settings?.rewards?.enabled===true;
  if(enabled)validateCoopRewards(settings.rewards);
  const reveal=await prepareRewardRevealContext(env,'COOP_'+room.difficulty,frozen.revealPolicy,settings?.mode==='ON'&&frozen.mode==='ON');
  const baseEnabled=enabled&&frozen.enabled,active=baseEnabled||reveal.enabled;
  const policy=baseEnabled?frozen:{...frozen,coin:0,masterStars:0,items:[]};
  const grantedItems=[...(policy.masterStars?[{code:'MASTER_STAR',quantity:policy.masterStars}]:[]),...policy.items];
  const itemRows=enabled&&grantedItems.length?(await p(env,`SELECT code,name FROM inventory_items WHERE is_active=1 AND code IN (${grantedItems.map(()=>'?').join(',')})`,...grantedItems.map(i=>i.code)).all()).results:[];
  const names=new Map(itemRows.map(i=>[i.code,i.name]));
  if(enabled&&grantedItems.some(i=>!names.has(i.code)||i.code===EQUIPMENT_FORGE_RELEASE_PROTECTION_CODE))throw Error('Cooperative reward item unavailable');
  const rewards={},statements=[...reveal.statements],counters=[],token=crypto.randomUUID();
  for(const member of [...room.members].sort((a,b)=>Number(a.id)-Number(b.id))){
   const uid=Number(member.id);
   if(member.result!=='VICTORY'){rewards[uid]=empty('DEFEAT');continue;}
   const before=await counter(env,uid,room.finishedAt);counters.push(before);
   const awarded=active&&before.daily.remaining>0;
   rewards[uid]={...empty(awarded?'GRANTED':active?'DAILY_LIMIT':'DISABLED'),dailyReward:before.daily};
   if(!awarded)continue;
   const nextRaw=JSON.stringify({count:before.daily.used+1,roomId:room.id,token});
   statements.push(before.raw===null?p(env,'INSERT INTO app_meta(key,value,updated_at) VALUES(?,?,CURRENT_TIMESTAMP) ON CONFLICT(key) DO NOTHING',before.key,nextRaw):p(env,'UPDATE app_meta SET value=?,updated_at=CURRENT_TIMESTAMP WHERE key=? AND value=?',nextRaw,before.key,before.raw),jointGuard(env.DB,token+':quota:'+uid,'EXISTS(SELECT 1 FROM app_meta WHERE key=? AND value=?)',[before.key,nextRaw]),jointGuardEnd(env.DB,token+':quota:'+uid));
   statements.push(jointGuard(env.DB,token+':user:'+uid,'EXISTS(SELECT 1 FROM users WHERE id=? AND coin>=0 AND coin<=?)',[uid,Number.MAX_SAFE_INTEGER-policy.coin]),jointGuardEnd(env.DB,token+':user:'+uid));
   if(policy.coin)statements.push(p(env,'UPDATE users SET coin=coin+? WHERE id=?',policy.coin,uid),p(env,'INSERT INTO coin_logs(user_id,change_amount,balance_after,reason) SELECT id,?,coin,? FROM users WHERE id=?',policy.coin,`격전지 클리어 [${room.id}]`,uid),jointGuard(env.DB,token+':coin-cap:'+uid,'EXISTS(SELECT 1 FROM users WHERE id=? AND coin<=?)',[uid,Number.MAX_SAFE_INTEGER]),jointGuardEnd(env.DB,token+':coin-cap:'+uid));
   for(const item of grantedItems){
    const guard=token+':item:'+uid+':'+item.code;
    statements.push(jointGuard(env.DB,guard,'EXISTS(SELECT 1 FROM inventory_items WHERE code=? AND is_active=1) AND NOT EXISTS(SELECT 1 FROM cnine_user_inventory WHERE user_id=? AND item_code=? AND (quantity<0 OR unseen_quantity<0 OR quantity>? OR unseen_quantity>?))',[item.code,uid,item.code,Number.MAX_SAFE_INTEGER-item.quantity,Number.MAX_SAFE_INTEGER-item.quantity]),
     p(env,'INSERT INTO cnine_user_inventory(user_id,item_code,quantity,unseen_quantity,updated_at) VALUES(?,?,?,?,CURRENT_TIMESTAMP) ON CONFLICT(user_id,item_code) DO UPDATE SET quantity=cnine_user_inventory.quantity+excluded.quantity,unseen_quantity=cnine_user_inventory.unseen_quantity+excluded.unseen_quantity,updated_at=CURRENT_TIMESTAMP',uid,item.code,item.quantity,item.quantity),
     p(env,"INSERT INTO inventory_logs(user_id,item_code,change_amount,balance_after,reason,reference_type,reference_id) SELECT user_id,item_code,?,quantity,'격전지 클리어','COOP_CLEAR',? FROM cnine_user_inventory WHERE user_id=? AND item_code=?",item.quantity,room.id,uid,item.code),jointGuard(env.DB,guard+':cap','EXISTS(SELECT 1 FROM cnine_user_inventory WHERE user_id=? AND item_code=? AND quantity<=? AND unseen_quantity<=?)',[uid,item.code,Number.MAX_SAFE_INTEGER,Number.MAX_SAFE_INTEGER]),jointGuardEnd(env.DB,guard+':cap'),jointGuardEnd(env.DB,guard));
   }
   rewards[uid]={status:'GRANTED',granted:true,coin:policy.coin,masterStars:policy.masterStars,items:policy.items.map(i=>({...i,name:names.get(i.code)})),dailyReward:{...before.daily,used:before.daily.used+1,remaining:before.daily.remaining-1}};
   const choice=prepareRewardRevealOffer(env,reveal,{userId:uid,roomId:room.id,baseReward:{coin:policy.coin,masterStars:policy.masterStars,items:rewards[uid].items},quota:{...rewards[uid].dailyReward,period:'day'},finishedAt:room.finishedAt});
   if(choice.offer){statements.push(...choice.statements);rewards[uid].choiceOffer=choice.offer;}
  }
  const receipt=JSON.stringify({version:1,roomId:room.id,creationRequest:room.creationRequest,difficulty:room.difficulty,finishedAt:room.finishedAt,settingsRevision:policy.settingsRevision,rewards});
  try{
   await env.DB.batch([
    p(env,'INSERT INTO app_meta(key,value,updated_at) VALUES(?,?,CURRENT_TIMESTAMP)',key,receipt),
    jointGuard(env.DB,token,settingsRaw===null?'NOT EXISTS(SELECT 1 FROM app_meta WHERE key=?)':'EXISTS(SELECT 1 FROM app_meta WHERE key=? AND value=?)',settingsRaw===null?[COOP_SETTINGS_KEY]:[COOP_SETTINGS_KEY,settingsRaw]),
    ...statements,jointGuardEnd(env.DB,token)
   ]);
   return rewards;
  }catch(error){
   const saved=await replay();if(saved)return saved;
   let changed=await read(env,COOP_SETTINGS_KEY)!==settingsRaw;
   for(const before of counters)if(await read(env,before.key)!==before.raw)changed=true;
   if(!changed)throw error;
  }
 }
 throw Error('Cooperative reward contention; retry terminal room');
}
