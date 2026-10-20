import {DEFENSE_KEY,validateDefenseSettings,validDefenseRoom} from '../shared/monster-defense-v1.mjs';
import {hasDefenseReward,validateDefenseReward} from '../shared/monster-defense-rewards-v1.mjs';
import {jointGuard,jointGuardEnd,ensureJointAtomicSchema} from './_joint_atomic.js';

const p=(env,sql,...args)=>env.DB.prepare(sql).bind(...args);
const read=async(env,key)=>(await p(env,'SELECT value FROM app_meta WHERE key=?',key).first())?.value??null;
const empty=status=>({status,granted:false,coin:0,masterStars:0,items:[]});
const humans=room=>room.players.filter(p=>!p.bot);
export function defenseUnpaidRewards(room){
 const policy=room.rewardPolicy;
 const status=room.phase!=='VICTORY'?'DEFEAT':room.practice?'PRACTICE':policy?.mode!=='ON'?'TEST':!policy.enabled||!hasDefenseReward(policy)?'DISABLED':null;
 return status?Object.fromEntries(humans(room).map(p=>[p.id,empty(status)])):null;
}

// Only the private server-owned terminal room enters this function. A single
// database transaction records every participant's receipt, balances and logs.
export async function settleDefenseRewards(env,room){
 if(!['VICTORY','DEFEAT'].includes(room.phase))throw Error('Defense room is not terminal');
 const unpaid=defenseUnpaidRewards(room);if(unpaid)return unpaid;
 const policy=room.rewardPolicy,reward=validateDefenseReward(policy),players=humans(room),ids=players.map(p=>Number(p.id));
 if(!validDefenseRoom(room.id)||!room.creationRequest||room.accountRoster!==true||policy.difficulty!==room.difficulty||
  !Number.isSafeInteger(room.startedAt)||room.startedAt<room.createdAt||!Number.isSafeInteger(room.finishedAt)||room.finishedAt<room.startedAt||
  room.wave<room.encounter.waves||room.coreHp<=0||ids.length!==room.capacity||new Set(ids).size!==ids.length||ids.some(id=>!Number.isSafeInteger(id)||id<1)||
  JSON.stringify([...(room.rewardParticipants||[])].sort())!==JSON.stringify(players.map(p=>p.id).sort()))throw Error('Invalid defense clear proof');
 const key='monster_defense_reward_receipt_v1:'+room.id;
 const replay=async()=>{const raw=await read(env,key);if(raw===null)return null;const receipt=JSON.parse(raw);
  if(receipt.creationRequest!==room.creationRequest||receipt.createdAt!==room.createdAt||receipt.difficulty!==room.difficulty)throw Error('Defense receipt collision');
  return receipt.rewards;
 };
 await ensureJointAtomicSchema(env);
 for(let attempt=0;attempt<4;attempt++){
  const previous=await replay();if(previous)return previous;
  const settingsRaw=await read(env,DEFENSE_KEY),settings=settingsRaw===null?null:validateDefenseSettings(JSON.parse(settingsRaw));
  const enabled=settings?.mode==='ON'&&settings.rewardsEnabled===true;
  const items=[...(reward.masterStars?[{code:'MASTER_STAR',quantity:reward.masterStars}]:[]),...reward.items];
  const rows=enabled&&items.length?(await p(env,`SELECT code,name,image_url FROM inventory_items WHERE is_active=1 AND code IN (${items.map(()=>'?').join(',')})`,...items.map(i=>i.code)).all()).results:[];
  const catalog=new Map(rows.map(i=>[i.code,i]));
  if(enabled&&items.some(i=>!catalog.has(i.code)))throw Error('Defense reward item unavailable');
  const rewards={},statements=[],token=crypto.randomUUID();
  for(const uid of ids.sort((a,b)=>a-b)){
   if(!enabled){rewards[uid]=empty('DISABLED');continue;}
   statements.push(jointGuard(env.DB,token+':user:'+uid,'EXISTS(SELECT 1 FROM users WHERE id=? AND coin>=0 AND coin<=?)',[uid,Number.MAX_SAFE_INTEGER-reward.coin]),jointGuardEnd(env.DB,token+':user:'+uid));
   if(reward.coin)statements.push(
    p(env,'UPDATE users SET coin=coin+? WHERE id=?',reward.coin,uid),
    p(env,'INSERT INTO coin_logs(user_id,change_amount,balance_after,reason) SELECT id,?,coin,? FROM users WHERE id=?',reward.coin,`몬스터 디펜스 ${room.encounter.name} 클리어 [${room.id}]`,uid),
    jointGuard(env.DB,token+':coin:'+uid,'EXISTS(SELECT 1 FROM users WHERE id=? AND coin<=?)',[uid,Number.MAX_SAFE_INTEGER]),jointGuardEnd(env.DB,token+':coin:'+uid));
   for(const item of items){
    const guard=token+':item:'+uid+':'+item.code;
    statements.push(jointGuard(env.DB,guard,'EXISTS(SELECT 1 FROM inventory_items WHERE code=? AND is_active=1) AND NOT EXISTS(SELECT 1 FROM cnine_user_inventory WHERE user_id=? AND item_code=? AND (quantity<0 OR unseen_quantity<0 OR quantity>? OR unseen_quantity>?))',[item.code,uid,item.code,Number.MAX_SAFE_INTEGER-item.quantity,Number.MAX_SAFE_INTEGER-item.quantity]),
     p(env,'INSERT INTO cnine_user_inventory(user_id,item_code,quantity,unseen_quantity,updated_at) VALUES(?,?,?,?,CURRENT_TIMESTAMP) ON CONFLICT(user_id,item_code) DO UPDATE SET quantity=cnine_user_inventory.quantity+excluded.quantity,unseen_quantity=cnine_user_inventory.unseen_quantity+excluded.unseen_quantity,updated_at=CURRENT_TIMESTAMP',uid,item.code,item.quantity,item.quantity),
     p(env,"INSERT INTO inventory_logs(user_id,item_code,change_amount,balance_after,reason,reference_type,reference_id) SELECT user_id,item_code,?,quantity,'몬스터 디펜스 클리어','MONSTER_DEFENSE_CLEAR',? FROM cnine_user_inventory WHERE user_id=? AND item_code=?",item.quantity,room.id,uid,item.code),
     jointGuard(env.DB,guard+':cap','EXISTS(SELECT 1 FROM cnine_user_inventory WHERE user_id=? AND item_code=? AND quantity<=? AND unseen_quantity<=?)',[uid,item.code,Number.MAX_SAFE_INTEGER,Number.MAX_SAFE_INTEGER]),jointGuardEnd(env.DB,guard+':cap'),jointGuardEnd(env.DB,guard));
   }
   rewards[uid]={status:'GRANTED',granted:true,coin:reward.coin,masterStars:reward.masterStars,items:reward.items.map(i=>({...i,name:catalog.get(i.code).name,image:catalog.get(i.code).image_url||''}))};
  }
  const receipt=JSON.stringify({version:1,roomId:room.id,creationRequest:room.creationRequest,createdAt:room.createdAt,startedAt:room.startedAt,finishedAt:room.finishedAt,difficulty:room.difficulty,settingsRevision:policy.settingsRevision,rewards});
  try{
   await env.DB.batch([
    p(env,'INSERT INTO app_meta(key,value,updated_at) VALUES(?,?,CURRENT_TIMESTAMP)',key,receipt),
    jointGuard(env.DB,token,settingsRaw===null?'NOT EXISTS(SELECT 1 FROM app_meta WHERE key=?)':'EXISTS(SELECT 1 FROM app_meta WHERE key=? AND value=?)',settingsRaw===null?[DEFENSE_KEY]:[DEFENSE_KEY,settingsRaw]),
    ...statements,jointGuardEnd(env.DB,token)
   ]);
   return rewards;
  }catch(error){const saved=await replay();if(saved)return saved;if(await read(env,DEFENSE_KEY)===settingsRaw)throw error;}
 }
 throw Error('Defense reward settings changed; retry terminal room');
}
