import {CORE_REWARD_DEFAULT,CORE_REWARD_TYPES,validateCoreRewardPolicy,drawCoreRewards,minimumCoreReward} from '../shared/core-raid-reward-policy-v1.mjs';
import {MERCENARY_CMS_SEED} from './_mercenary_cms_seed.js';
import {readMercenaryDocument} from './_mercenary_account.js';
import {mercenaryRandomInt,mercenaryCardAcquisitionStatements} from './_mercenary_draw_accounting.js';
import {jointGuard,jointGuardEnd} from './_joint_atomic.js';
import {EQUIPMENT_FORGE_RELEASE_PROTECTION_CODE} from '../shared/equipment-forge-release-v1.mjs';
export const CORE_REWARD_KEY='raid_core_choice_rewards_v1';
const TABLE='raid_core_receipts_v2024', OFFER='REWARD_OFFER_V1', CONFIG='REWARD_CONFIG_V1';
const fail=(message,status=400,code='CORE_REWARD_INVALID')=>Object.assign(Error(message),{status,code});
const parse=value=>JSON.parse(value);
const hash=async value=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(value))),n=>n.toString(16).padStart(2,'0')).join('');
const offerId=async(roomId,userId)=>'CORE-CHOICE-'+await hash(JSON.stringify([roomId,Number(userId)]));
export async function readCoreRewardPolicy(env){
  const row=await env.DB.prepare('SELECT value FROM app_meta WHERE key=?').bind(CORE_REWARD_KEY).first();
  return row?validateCoreRewardPolicy(parse(row.value)):structuredClone(CORE_REWARD_DEFAULT);
}
export async function coreRewardCatalog(env){
  const [inventory,equipment,mercenary]=await Promise.all([
    env.DB.prepare('SELECT code,name,rarity,image_url image,category FROM inventory_items WHERE is_active=1 AND code<>? ORDER BY category,sort_order,name').bind(EQUIPMENT_FORGE_RELEASE_PROTECTION_CODE).all(),
    env.DB.prepare('SELECT id,name,rarity,image_url image,slot FROM character_equipment_items WHERE is_active=1 AND is_public=1 ORDER BY slot,sort_order,name').all(),
    readMercenaryDocument(env)
  ]);
  return {
    INVENTORY_ITEM:(inventory.results||[]).map(row=>({...row,ref:row.code})),
    EQUIPMENT:(equipment.results||[]).map(row=>({...row,ref:String(row.id)})),
    MERCENARY:mercenary.document.mercenaries.filter(row=>['C','B','A','S','SS','SSS'].includes(row.rank)).map(row=>({ref:row.code,name:row.name,rarity:row.rank,image:MERCENARY_CMS_SEED.catalog.cards.find(card=>card.code===row.code)?.sourceArt||''}))
  };
}
export async function saveCoreRewardPolicy(env,user,body){
  if(typeof body.requestId!=='string'||!/^[A-Za-z0-9-]{16,100}$/.test(body.requestId))throw fail('저장 요청 ID를 확인하세요.');
  let policy;try{policy=validateCoreRewardPolicy(body.policy);}catch(error){throw fail(error.message);}
  const requestId='CORE-CONFIG-'+body.requestId,payload=JSON.stringify(policy),payloadHash=await hash(payload);
  const prior=await env.DB.prepare(`SELECT user_id,action_type,response_json FROM ${TABLE} WHERE request_id=?`).bind(requestId).first();
  if(prior){const audit=parse(prior.response_json);if(Number(prior.user_id)!==Number(user.id)||prior.action_type!==CONFIG||audit.payloadHash!==payloadHash)throw fail('같은 요청 ID에 다른 내용이 포함되었습니다.',409);return {ok:true,policy:await readCoreRewardPolicy(env),replayed:true};}
  const catalog=await coreRewardCatalog(env);
  for(const row of policy.entries){if(policy.enabled&&row.enabled&&catalog[row.rewardType]&&!catalog[row.rewardType].some(item=>item.ref===row.rewardRef))throw fail('지급할 수 없는 후보입니다. 목록을 새로고침하세요: '+row.rewardRef);}
  if(policy.enabled&&policy.minimum.rewardType==='MASTER_STAR'&&!catalog.INVENTORY_ITEM.some(row=>row.ref==='MASTER_STAR'))throw fail('활성화된 마스터의 별 아이템이 필요합니다.');
  const before=await env.DB.prepare('SELECT value FROM app_meta WHERE key=?').bind(CORE_REWARD_KEY).first();
  if((before?parse(before.value).revision:0)!==policy.revision)throw fail('다른 창에서 보상을 변경했습니다. 새로고침 후 저장하세요.',409,'CORE_REWARD_CONFIG_CONFLICT');
  const next={...policy,revision:policy.revision+1},guard=crypto.randomUUID(),audit={payloadHash,before:before?parse(before.value):CORE_REWARD_DEFAULT,after:next};
  const predicate=before?'EXISTS(SELECT 1 FROM app_meta WHERE key=? AND value=?)':'NOT EXISTS(SELECT 1 FROM app_meta WHERE key=?)';
  try{await env.DB.batch([
    jointGuard(env.DB,guard,predicate,before?[CORE_REWARD_KEY,before.value]:[CORE_REWARD_KEY]),
    env.DB.prepare('INSERT INTO app_meta(key,value,updated_at) VALUES(?,?,CURRENT_TIMESTAMP) ON CONFLICT(key) DO UPDATE SET value=excluded.value,updated_at=CURRENT_TIMESTAMP').bind(CORE_REWARD_KEY,JSON.stringify(next)),
    env.DB.prepare(`INSERT INTO ${TABLE}(request_id,room_id,user_id,action_type,status,response_json) VALUES(?,'ADMIN-REWARDS',?,?,'COMPLETED',?)`).bind(requestId,user.id,CONFIG,JSON.stringify(audit)),
    jointGuardEnd(env.DB,guard)
  ]);}catch(error){
    const saved=await env.DB.prepare(`SELECT user_id,response_json FROM ${TABLE} WHERE request_id=? AND action_type=?`).bind(requestId,CONFIG).first();
    if(saved&&Number(saved.user_id)===Number(user.id)&&parse(saved.response_json).payloadHash===payloadHash)return {ok:true,policy:await readCoreRewardPolicy(env),replayed:true};
    if((await readCoreRewardPolicy(env)).revision!==policy.revision)throw fail('다른 창에서 보상을 변경했습니다. 새로고침 후 저장하세요.',409,'CORE_REWARD_CONFIG_CONFLICT');
    throw error;
  }
  return {ok:true,policy:next};
}
async function readOffer(env,roomId,userId){
  const id=await offerId(roomId,userId);
  const row=await env.DB.prepare(`SELECT response_json FROM ${TABLE} WHERE request_id=? AND room_id=? AND user_id=? AND action_type=?`).bind(id,roomId,userId,OFFER).first();
  return row?{json:row.response_json,value:parse(row.response_json)}:null;
}
function publicOffer(offer){return {enabled:true,offerId:offer.offerId,slots:[0,1,2],selectedIndex:offer.selectedIndex,revision:offer.revision};}
export async function openCoreRewardOffer(env,user,roomId){
  let stored=await readOffer(env,roomId,user.id);
  if(!stored){
    const policy=await readCoreRewardPolicy(env);if(!policy.enabled)return {enabled:false};
    const id=await offerId(roomId,user.id),offer={version:1,offerId:id,revision:policy.revision,minimum:minimumCoreReward(policy),choices:drawCoreRewards(policy,mercenaryRandomInt),selectedIndex:null};
    await env.DB.prepare(`INSERT INTO ${TABLE}(request_id,room_id,user_id,action_type,status,response_json) VALUES(?,?,?,?,'COMPLETED',?) ON CONFLICT(request_id) DO NOTHING`).bind(id,roomId,user.id,OFFER,JSON.stringify(offer)).run();
    stored=await readOffer(env,roomId,user.id);
  }
  if(!stored)throw fail('보상 봉인을 준비하지 못했습니다. 다시 시도하세요.',503);
  return publicOffer(stored.value);
}
export async function selectCoreReward(env,user,roomId,body){
  let stored=await readOffer(env,roomId,user.id);
  if(!stored){if(!(await readCoreRewardPolicy(env)).enabled)return null;throw fail('봉인된 보상 3개 중 하나를 먼저 선택하세요.',409,'CORE_REWARD_SELECTION_REQUIRED');}
  if(body.offerId!==stored.value.offerId||!Number.isInteger(body.selectedIndex)||body.selectedIndex<0||body.selectedIndex>2)throw fail('봉인된 보상 3개 중 하나를 선택하세요.',409,'CORE_REWARD_SELECTION_REQUIRED');
  if(stored.value.selectedIndex===null){
    const next={...stored.value,selectedIndex:body.selectedIndex};
    await env.DB.prepare(`UPDATE ${TABLE} SET response_json=?,updated_at=CURRENT_TIMESTAMP WHERE request_id=? AND response_json=? AND action_type=?`).bind(JSON.stringify(next),next.offerId,stored.json,OFFER).run();
    stored=await readOffer(env,roomId,user.id);
  }
  if(stored.value.selectedIndex!==body.selectedIndex)throw fail('이미 선택한 봉인은 바꿀 수 없습니다. 같은 보상을 다시 확인하세요.',409,'CORE_REWARD_SELECTION_CONFLICT');
  return stored.value;
}
// The caller includes every statement and proof in its weekly/base-reward transaction.
// No grant runs before that transaction has verified its exclusive receipt reservation.
export async function prepareCoreChoiceGrant(env,user,offer){
  let reward={...offer.choices[offer.selectedIndex]},converted=false,meta=null;
  const eligible=async row=>{
    if(row.rewardType==='MERCENARY'){
      const art=MERCENARY_CMS_SEED.catalog.cards.find(card=>card.code===row.rewardRef);if(!art)return null;
      const {document}=await readMercenaryDocument(env),card=document.mercenaries.find(card=>card.code===row.rewardRef);
      return {...art,name:card?.name||art.name,rarity:card?.rank||''};
    }
    if(row.rewardType==='EQUIPMENT')return env.DB.prepare('SELECT name,rarity,image_url image FROM character_equipment_items WHERE id=? AND is_active=1 AND is_public=1').bind(Number(row.rewardRef)).first();
    if(['MASTER_STAR','INVENTORY_ITEM'].includes(row.rewardType))return row.rewardRef===EQUIPMENT_FORGE_RELEASE_PROTECTION_CODE?null:env.DB.prepare('SELECT name,rarity,image_url image FROM inventory_items WHERE code=? AND is_active=1').bind(row.rewardType==='MASTER_STAR'?'MASTER_STAR':row.rewardRef).first();
    return Object.hasOwn(CORE_REWARD_TYPES,row.rewardType)?{}:null;
  };
  meta=await eligible(reward);
  if(!meta){reward={...offer.minimum};delete reward.weight;converted=true;meta=await eligible(reward);}
  if(!meta)throw fail('최소 보상의 지급 설정을 확인 중입니다. 선택은 보존되며 다시 수령할 수 있습니다.',503,'CORE_REWARD_DESTINATION_UNAVAILABLE');
  const DB=env.DB,uid=Number(user.id),qty=reward.quantity,ref=reward.rewardRef,source=offer.offerId,statements=[],guard=crypto.randomUUID();
  const stmt=(sql,...args)=>DB.prepare(sql).bind(...args);
  if(['COIN','CARD_SHARDS','MAGIC_CRYSTAL'].includes(reward.rewardType)){
    const column={COIN:'coin',CARD_SHARDS:'card_shards',MAGIC_CRYSTAL:'magic_crystals'}[reward.rewardType],table={COIN:'coin_logs',CARD_SHARDS:'shard_logs',MAGIC_CRYSTAL:'magic_crystal_logs'}[reward.rewardType];
    statements.push(stmt(`UPDATE users SET ${column}=${column}+? WHERE id=?`,qty,uid));
    statements.push(reward.rewardType==='MAGIC_CRYSTAL'?stmt(`INSERT INTO ${table}(user_id,change_amount,balance_after,reason,reference_type,reference_id) SELECT id,?,${column},'CORE_RAID_CHOICE','CORE_RAID',? FROM users WHERE id=?`,qty,source,uid):stmt(`INSERT INTO ${table}(user_id,change_amount,balance_after,reason) SELECT id,?,${column},'CORE_RAID_CHOICE' FROM users WHERE id=?`,qty,uid));
  }else if(['MASTER_STAR','INVENTORY_ITEM'].includes(reward.rewardType)){
    statements.push(jointGuard(DB,guard,'EXISTS(SELECT 1 FROM inventory_items WHERE code=? AND is_active=1)',[ref]),stmt('INSERT INTO cnine_user_inventory(user_id,item_code,quantity,unseen_quantity,created_at,updated_at) VALUES(?,?,?,?,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP) ON CONFLICT(user_id,item_code) DO UPDATE SET quantity=cnine_user_inventory.quantity+excluded.quantity,unseen_quantity=cnine_user_inventory.unseen_quantity+excluded.unseen_quantity,updated_at=CURRENT_TIMESTAMP',uid,ref,qty,qty),stmt("INSERT INTO inventory_logs(user_id,item_code,change_amount,balance_after,reason,reference_type,reference_id) SELECT user_id,item_code,?,quantity,'CORE_RAID_CHOICE','CORE_RAID',? FROM cnine_user_inventory WHERE user_id=? AND item_code=?",qty,source,uid,ref),jointGuardEnd(DB,guard));
  }else if(reward.rewardType==='MERCENARY'){
    for(let i=0;i<qty;i++)statements.push(...mercenaryCardAcquisitionStatements(DB,{userId:uid,mercenaryCode:ref,acquisitionId:source+':'+i}));
  }else if(reward.rewardType==='EQUIPMENT'){
    for(let i=0;i<qty;i++)statements.push(stmt("INSERT INTO user_equipment_instances(user_id,equipment_id,source_type,source_id,request_id) SELECT ?,id,'CORE_RAID_CHOICE',?,? FROM character_equipment_items WHERE id=? AND is_active=1 AND is_public=1",uid,source,source+':'+i,Number(ref)));
    statements.push(jointGuard(DB,guard,"(SELECT COUNT(*) FROM user_equipment_instances WHERE user_id=? AND equipment_id=? AND source_type='CORE_RAID_CHOICE' AND source_id=?)=?",[uid,Number(ref),source,qty]),jointGuardEnd(DB,guard));
  }
  return {statements,reward:{...reward,name:meta.name||CORE_REWARD_TYPES[reward.rewardType],image:meta.image||meta.sourceArt||'',rarity:meta.rarity||meta.rank||'',converted},offerId:offer.offerId,selectedIndex:offer.selectedIndex};
}
