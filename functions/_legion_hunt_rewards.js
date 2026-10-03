import {prepareUnifiedDropGrant} from './_drop_pool.js';
import {jointGuard,jointGuardEnd} from './_joint_atomic.js';
import {jointError} from './_joint_request.js';
import {LEGION_HUNT_SETTINGS_KEY} from './_legion_hunt_settings.js';

function available(item){
  const definitions={
    INVENTORY_ITEM:['inventory_items','code=? AND is_active=1'],
    EQUIPMENT:['character_equipment_items','id=? AND is_active=1 AND is_public=1'],
    VEHICLE:['character_garage_items','id=? AND is_active=1 AND is_public=1'],
    CARD:['cards_effective_v1210 c JOIN members m ON m.id=c.member_id',"CAST(c.id AS TEXT)=? AND c.is_active=1 AND m.is_active=1 AND UPPER(c.rarity) IN ('SUPERSTAR','ZENITH','FUR') AND COALESCE(c.card_status,'PUBLIC')='PUBLIC'"]
  };
  const target=definitions[item.type];
  if(!target)throw jointError('HUNT_REWARD_TYPE','지급할 보상 종류를 확인하세요.',409);
  return `EXISTS(SELECT 1 FROM ${target[0]} WHERE ${target[1]})`;
}

// The session claim is the durable receipt. Its CAS, grant and grant proofs
// commit together; no receipt or inventory change survives a failed batch.
export async function claimLegionHuntReward(env,user,{key,before,run,policyRaw,result}){
  return commitHuntRewards(env,user,{key,before,run,policyRaw,result,items:[result.item],requestId:`LEGION_HUNT:${run.state.id}:${result.dropId}`});
}

export async function settleLegionHuntRewards(env,user,{key,before,run,policyRaw}){
  const result=run.state.receipt;
  run.rewardStatus='SETTLED';
  return commitHuntRewards(env,user,{key,before,run,policyRaw,result,items:result.inventory,requestId:`LEGION_HUNT:${run.state.id}:FINISH`});
}

async function commitHuntRewards(env,user,{key,before,run,policyRaw,result,items,requestId}){
  const grants=await prepareUnifiedDropGrant(env,{userId:Number(user.id),requestId,sourceType:'LEGION_HUNT',sourceId:run.state.id,
    rewards:items.map(item=>({rewardType:item.type,rewardRef:item.ref,rewardName:item.name,quantity:item.quantity}))},{writePoolLedger:false});
  Object.assign(result,{liveRewards:true,refreshAccount:true,rewards:grants.rewards});
  // A unique write token proves THIS CAS won even for two identical retries.
  const token=crypto.randomUUID(),raw=JSON.stringify({...run,writeToken:token});
  const DB=env.DB,guard=`hunt:${token}`,proof=`hunt-proof:${token}`;
  const statements=[
    DB.prepare('UPDATE app_meta SET value=?,updated_at=CURRENT_TIMESTAMP WHERE key=? AND value=?').bind(raw,key,before),
    jointGuard(DB,guard,`EXISTS(SELECT 1 FROM app_meta WHERE key=? AND value=?) AND EXISTS(SELECT 1 FROM app_meta WHERE key=? AND value=?) AND (${items.map(available).join(' AND ')||'1=1'})`,[key,raw,LEGION_HUNT_SETTINGS_KEY,policyRaw,...items.map(item=>item.ref)]),
    ...grants.statements,
    jointGuard(DB,proof,grants.proofs.map(p=>`(${p.sql})`).join(' AND ')||(items.length?'1=0':'1=1'),grants.proofs.flatMap(p=>p.values)),
    jointGuardEnd(DB,guard),jointGuardEnd(DB,proof)
  ];
  if(DB.dialect==='postgres')statements.unshift(DB.prepare('SELECT id FROM users WHERE id=? FOR UPDATE').bind(user.id));
  try{await DB.batch(statements);}
  catch{throw jointError('HUNT_REWARD_RETRY','보상 저장을 완료하지 못했습니다. 정산을 다시 시도해 주세요. 획득 기록은 보관됩니다.',503);}
  return result;
}
