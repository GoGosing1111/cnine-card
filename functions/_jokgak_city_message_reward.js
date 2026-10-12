import {prepareUnifiedDropGrant} from './_drop_pool.js';
import {cityGuard,cityGuardEnd} from './_jokgak_city_rewards.js';
import {EQUIPMENT_FORGE_RELEASE_PROTECTION_CODE} from '../shared/equipment-forge-release-v1.mjs';

export const CITY_MESSAGE_REWARD_TYPE='JOKGAK_CITY_REWARD';
export const cityMessageRewardKey=campaign=>'jokgak_city_message_reward_v1:'+campaign;
const p=(env,sql,...values)=>env.DB.prepare(sql).bind(...values);
const fail=()=>{throw Error('족각도시 메시지 보상 정보를 확인하세요.');};
function validBundle(bundle,userId,campaign){
 if(bundle?.version!==1||bundle.userId!==userId||bundle.campaign!==campaign||!/^jokgak-city:(action|round):[A-Za-z0-9:_-]+$/.test(campaign)||campaign.length>180)fail();
 if(!Number.isSafeInteger(bundle.coin)||bundle.coin<0||bundle.coin>10000000000000||!Array.isArray(bundle.items)||bundle.items.length>10)fail();
 const seen=new Set();
 for(const item of bundle.items){
  if(!item||typeof item.code!=='string'||!item.code||item.code===EQUIPMENT_FORGE_RELEASE_PROTECTION_CODE||seen.has(item.code)||!Number.isSafeInteger(item.quantity)||item.quantity<1||item.quantity>2000000)fail();
  seen.add(item.code);
 }
 if(!bundle.coin&&!bundle.items.length)fail();
 return bundle;
}

// Delivery creates an immutable attachment, never a wallet/inventory grant.
// The caller includes these statements in its action/round receipt transaction.
export async function prepareCityRewardMessage(env,{userId,campaign,title,body,coin,items=[]}){
 const bundle=validBundle({version:1,userId,campaign,coin,items},userId,campaign),statements=[];
 if(items.length){
  const rows=(await p(env,`SELECT code,name FROM inventory_items WHERE is_active=1 AND code IN (${items.map(()=>'?').join(',')})`,...items.map(item=>item.code)).all()).results||[];
  const catalog=new Map(rows.map(row=>[row.code,row.name]));
  if(items.some(item=>!catalog.has(item.code)))throw Error('족각도시 보상 아이템이 비활성화되었습니다.');
  bundle.items=items.map(item=>({...item,name:catalog.get(item.code)}));
 }
 const key=cityMessageRewardKey(campaign),raw=JSON.stringify(bundle),tag='city-message:'+crypto.randomUUID();
 const summary=[coin?'코인 '+coin.toLocaleString('ko-KR'):'',...bundle.items.map(item=>item.name+' × '+item.quantity.toLocaleString('ko-KR'))].filter(Boolean).join('\n');
 for(const item of items)statements.push(cityGuard(env,tag+':'+item.code,'EXISTS(SELECT 1 FROM inventory_items WHERE code=? AND is_active=1)',[item.code]),cityGuardEnd(env,tag+':'+item.code));
 statements.push(
  p(env,'INSERT INTO app_meta(key,value) VALUES(?,?)',key,raw),
  p(env,"INSERT INTO user_messages(user_id,sender_type,title,body,message_type,campaign_key) VALUES(?,'SYSTEM',?,?,'ITEM_REWARD',?)",userId,title,body+'\n\n'+summary+'\n\n아래 보상 받기를 누르면 코인·아이템을 함께 수령합니다. 도시 운영 종료 후에도 수령할 수 있습니다.',campaign),
  p(env,'INSERT INTO user_message_rewards(message_id,user_id,reward_type,reward_amount) SELECT id,user_id,?,1 FROM user_messages WHERE user_id=? AND campaign_key=?',CITY_MESSAGE_REWARD_TYPE,userId,campaign),
  cityGuard(env,tag,`EXISTS(SELECT 1 FROM app_meta WHERE key=? AND value=?) AND (SELECT COUNT(*) FROM user_messages m JOIN user_message_rewards r ON r.message_id=m.id AND r.user_id=m.user_id WHERE m.user_id=? AND m.campaign_key=? AND r.reward_type=? AND r.reward_amount=1 AND r.claimed_at IS NULL)=1`,[key,raw,userId,campaign,CITY_MESSAGE_REWARD_TYPE]),
  cityGuardEnd(env,tag)
 );
 return {statements,campaign,bundle};
}

export async function claimCityMessageReward(env,user,reward,messageId){
 const userId=Number(user.id),rewardId=Number(reward.id);messageId=Number(messageId);
 if([userId,rewardId,messageId].some(id=>!Number.isSafeInteger(id)||id<1))fail();
 const stored=await p(env,`SELECT r.*,m.campaign_key FROM user_message_rewards r JOIN user_messages m ON m.id=r.message_id AND m.user_id=r.user_id WHERE r.id=? AND r.message_id=? AND r.user_id=? AND r.reward_type=? AND r.reward_amount=1`,rewardId,messageId,userId,CITY_MESSAGE_REWARD_TYPE).first();
 if(!stored)fail();
 const key=cityMessageRewardKey(stored.campaign_key),raw=(await p(env,'SELECT value FROM app_meta WHERE key=?',key).first())?.value;
 let bundle;try{bundle=validBundle(JSON.parse(raw),userId,stored.campaign_key);}catch{fail();}
 const receiptFor=()=>p(env,'SELECT * FROM user_message_reward_claim_receipts_v1222 WHERE reward_id=? AND user_id=?',rewardId,userId).first();
 const resultFor=async(receipt,duplicate)=>{
  if(receipt.reward_type!==CITY_MESSAGE_REWARD_TYPE||Number(receipt.message_id)!==messageId||Number(receipt.reward_amount)!==1||!receipt.credited_at)fail();
  const updated=await p(env,'SELECT * FROM users WHERE id=?',userId).first();
  return {credited:!duplicate,duplicate,receipt,updated,balanceBefore:Number(receipt.balance_before),balanceAfter:Number(updated.coin),rewardLabel:'족각도시 보상',rewards:{coin:bundle.coin,items:bundle.items}};
 };
 const existing=await receiptFor();if(existing)return resultFor(existing,true);
 if(stored.claimed_at)fail();
 const rewards=[...(bundle.coin?[{rewardType:'COIN',quantity:bundle.coin}]:[]),...bundle.items.map(item=>({rewardType:'INVENTORY_ITEM',rewardRef:item.code,quantity:item.quantity}))];
 const grant=await prepareUnifiedDropGrant(env,{userId,requestId:'CITY_MESSAGE:'+rewardId,sourceType:'JOKGAK_CITY_MESSAGE',sourceId:String(messageId),rewards},{writePoolLedger:false});
 if(!Number.isSafeInteger(grant.balances.coin)||Object.values(grant.balances.inventory).some(n=>!Number.isSafeInteger(n)))fail();
 const token=crypto.randomUUID(),tag='city-message-claim:'+token,beforeCoin=grant.balances.coin-bundle.coin;
 const statements=env.DB.dialect==='postgres'?[p(env,'SELECT id FROM users WHERE id=? FOR UPDATE',userId),p(env,'SELECT id FROM user_message_rewards WHERE id=? FOR UPDATE',rewardId)]:[];
 statements.push(
  p(env,`INSERT INTO user_message_reward_claim_receipts_v1222(reward_id,message_id,user_id,reward_type,reward_amount,claim_token,balance_before,balance_after,source) SELECT id,message_id,user_id,reward_type,1,?,?,?,'MESSAGE_CLAIM' FROM user_message_rewards WHERE id=? AND message_id=? AND user_id=? AND reward_type=? AND reward_amount=1 AND (claimed_at IS NULL OR TRIM(claimed_at)='') ON CONFLICT(reward_id) DO NOTHING`,token,beforeCoin,beforeCoin,rewardId,messageId,userId,CITY_MESSAGE_REWARD_TYPE),
  cityGuard(env,tag,'EXISTS(SELECT 1 FROM user_message_reward_claim_receipts_v1222 WHERE reward_id=? AND user_id=? AND claim_token=?) AND EXISTS(SELECT 1 FROM app_meta WHERE key=? AND value=?) AND EXISTS(SELECT 1 FROM users WHERE id=? AND coin=?)',[rewardId,userId,token,key,raw,userId,beforeCoin])
 );
 for(const item of bundle.items){
  if(env.DB.dialect==='postgres')statements.push(p(env,'SELECT item_code FROM cnine_user_inventory WHERE user_id=? AND item_code=? FOR UPDATE',userId,item.code));
  statements.push(cityGuard(env,tag+':'+item.code,'EXISTS(SELECT 1 FROM inventory_items WHERE code=? AND is_active=1) AND COALESCE((SELECT quantity FROM cnine_user_inventory WHERE user_id=? AND item_code=?),0)=?',[item.code,userId,item.code,grant.balances.inventory[item.code]-item.quantity]),cityGuardEnd(env,tag+':'+item.code));
 }
 statements.push(...grant.statements,
  cityGuard(env,tag+':credited',grant.proofs.map(proof=>'('+proof.sql+')').join(' AND '),grant.proofs.flatMap(proof=>proof.values)),
  p(env,'UPDATE user_message_reward_claim_receipts_v1222 SET balance_after=?,credited_at=CURRENT_TIMESTAMP WHERE reward_id=? AND user_id=? AND claim_token=?',grant.balances.coin,rewardId,userId,token),
  p(env,'UPDATE user_message_rewards SET claimed_at=CURRENT_TIMESTAMP WHERE id=? AND user_id=?',rewardId,userId),
  p(env,'UPDATE user_messages SET is_read=1,read_at=COALESCE(read_at,CURRENT_TIMESTAMP),hidden_at=CURRENT_TIMESTAMP WHERE id=? AND user_id=?',messageId,userId),
  cityGuardEnd(env,tag+':credited'),cityGuardEnd(env,tag)
 );
 try{await env.DB.batch(statements);}catch(error){const saved=await receiptFor();if(saved)return resultFor(saved,true);throw error;}
 const receipt=await receiptFor();if(!receipt)fail();return resultFor(receipt,false);
}
