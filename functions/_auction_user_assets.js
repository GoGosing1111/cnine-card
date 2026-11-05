import {jointGuard,jointGuardEnd} from './_joint_atomic.js';
import {jointInventoryChange} from './_joint_transactions.js';
import {AUCTION_TICKET,AUCTION_ASSET_TYPES} from '../shared/auction-user-policy-v1.mjs';
import {RANKED_SERIES_RULES} from '../shared/ranked-series-v1.mjs';
import {COMPANION_RELEASE} from '../shared/companion-loadout-v2.mjs';
import {mercenaryModeAllowed} from '../shared/mercenary-eunseol-v1.mjs';
import {PET_LOADOUT_MODES,petSlotForMode} from '../shared/pet-equipment-v1.mjs';

const fail=message=>{throw Object.assign(Error(message),{status:409})};
const parse=raw=>raw==null?null:JSON.parse(raw);
const contains=(value,ref)=>Array.isArray(value)?value.some(v=>contains(v,ref)):value&&typeof value==='object'?Object.values(value).some(v=>contains(v,ref)):String(value)===String(ref);
export function auctionMetaSelectionContains(kind,key,value,ref){
 if(kind==='PET')return key.startsWith('pet_loadout_v1:')&&PET_LOADOUT_MODES.some(mode=>petSlotForMode(value,mode).petCode===ref);
 if(key.startsWith('mercenary_equipment_v2:'))return kind==='EQUIPMENT'?contains(value?.loadouts||{},ref):kind==='MERCENARY'&&Object.values(value?.loadouts?.[ref]||{}).some(slots=>Object.values(slots).some(Boolean));
 const selected=kind==='EQUIPMENT'?value?.slots:key.startsWith('ranked_series_roster_')?value?.codes:key.startsWith('mercenary_dual_')?[value?.PVE?.mercenaryCodes,value?.PVP?.mercenaryCodes]:value?.mercenaryCode;
 return selected!=null&&contains(selected,ref);
}
export function auctionMercenarySelected(legacy,pvp,dual,ranked,ref){
 const old=legacy?.mercenary_code||null;
 return ['PVE','PVP'].some(mode=>{
  const codes=COMPANION_RELEASE.dualMercenaries&&dual?.[mode]?dual[mode].mercenaryCodes:[mode==='PVE'?old:pvp?pvp.mercenaryCode:old];
  if(!Array.isArray(codes))fail('용병 편성 정보를 확인하세요.');
  return codes.some(code=>code===ref&&mercenaryModeAllowed(code,mode));
 })||contains(ranked?.codes||[],ref);
}
const p=(DB,sql,...args)=>DB.prepare(sql).bind(...args);
export const auctionRowLock=(DB,sql,...args)=>DB.dialect==='postgres'?[p(DB,sql+' FOR UPDATE',...args)]:[];
function metaGuard(DB,key,raw){const token=crypto.randomUUID();return [jointGuard(DB,token,raw===null?'NOT EXISTS(SELECT 1 FROM app_meta WHERE key=?)':'EXISTS(SELECT 1 FROM app_meta WHERE key=? AND value=?)',raw===null?[key]:[key,raw]),jointGuardEnd(DB,token)];}
function guarded(DB,predicate,args,statements){const token=crypto.randomUUID();return [jointGuard(DB,token,predicate,args),...statements,jointGuardEnd(DB,token)];}
async function meta(DB,key){return (await p(DB,'SELECT value FROM app_meta WHERE key=?',key).first())?.value??null;}
async function petChange(DB,userId,ref,delta){
  const key=`pet_collection_v1:${userId}`,raw=await meta(DB,key),value=parse(raw)||{revision:0,pets:{}};
  if(!Number.isSafeInteger(value.revision)||!value.pets)fail('펫 보유 정보를 확인하지 못했습니다.');
  const old=Number(value.pets[ref]||0),quantity=old+delta;if(!Number.isSafeInteger(quantity)||quantity<0)fail('영구 보유한 펫이 부족합니다.');
  const next={...value,revision:value.revision+1,pets:{...value.pets,[ref]:quantity}};
  const token=crypto.randomUUID(),baseline=raw??JSON.stringify(value);
  return [...(raw===null?[p(DB,'INSERT OR IGNORE INTO app_meta(key,value) VALUES(?,?)',key,baseline)]:[]),...auctionRowLock(DB,'SELECT key FROM app_meta WHERE key=?',key),jointGuard(DB,token,'EXISTS(SELECT 1 FROM app_meta WHERE key=? AND value=?)',[key,baseline]),p(DB,'UPDATE app_meta SET value=?,updated_at=CURRENT_TIMESTAMP WHERE key=?',JSON.stringify(next),key),jointGuardEnd(DB,token)];
}
async function protectedLoadouts(DB,userId,kind,ref){
  const checks=[];
  if(kind==='CARD')for(const table of ['pve_decks','pvp_decks','pvp_deck_presets']){
    const rows=(await p(DB,`SELECT card_ids FROM ${table} WHERE user_id=?`,userId).all()).results;
    if(rows.some(r=>contains(parse(r.card_ids),ref)))fail('편성 중인 마지막 카드는 편성을 해제한 뒤 등록하세요.');
    const token=crypto.randomUUID(),counts=new Map();for(const row of rows)counts.set(row.card_ids,(counts.get(row.card_ids)||0)+1);
    const predicates=[`(SELECT COUNT(*) FROM ${table} WHERE user_id=?)=?`],args=[userId,rows.length];for(const [raw,count] of counts){predicates.push(`(SELECT COUNT(*) FROM ${table} WHERE user_id=? AND card_ids=?)=?`);args.push(userId,raw,count);}
    checks.push(jointGuard(DB,token,predicates.join(' AND '),args),jointGuardEnd(DB,token));
  }
  if(kind==='MERCENARY'){
    const old=await p(DB,'SELECT mercenary_code FROM user_mercenary_loadout_v1 WHERE user_id=?',userId).first();
    const keys=[`mercenary_pvp_loadout_v1:${userId}`,`mercenary_dual_loadout_v2:${userId}`,`ranked_series_roster_v${RANKED_SERIES_RULES.mercenariesPerRound}:${userId}`],raws=await Promise.all(keys.map(key=>meta(DB,key)));
    if(auctionMercenarySelected(old,...raws.map(parse),ref))fail('편성 중인 마지막 용병은 편성을 해제한 뒤 등록하세요.');
    const token=crypto.randomUUID();checks.push(jointGuard(DB,token,"COALESCE((SELECT mercenary_code FROM user_mercenary_loadout_v1 WHERE user_id=?),'')=?",[userId,old?.mercenary_code||'']),jointGuardEnd(DB,token));
    keys.forEach((key,i)=>checks.push(...metaGuard(DB,key,raws[i])));const equipmentKey=`mercenary_equipment_v2:${userId}`,equipmentRaw=await meta(DB,equipmentKey);if(auctionMetaSelectionContains(kind,equipmentKey,parse(equipmentRaw),ref))fail('장비를 착용한 마지막 용병은 장비를 해제한 뒤 등록하세요.');checks.push(...metaGuard(DB,equipmentKey,equipmentRaw));return checks;
  }
  const v2key=`mercenary_equipment_v2:${userId}`,v2raw=kind==='EQUIPMENT'?await meta(DB,v2key):null;
  if(kind==='EQUIPMENT'&&v2raw!==null){if(auctionMetaSelectionContains(kind,v2key,parse(v2raw),ref))fail('착용 중인 장비는 해제한 뒤 등록하세요.');return [...checks,...metaGuard(DB,v2key,v2raw)];}
  if(kind==='EQUIPMENT')checks.push(...metaGuard(DB,v2key,v2raw));
  const keys=kind==='MERCENARY'?[`mercenary_pvp_loadout_v1:${userId}`,`mercenary_dual_loadout_v2:${userId}`,`ranked_series_roster_v${RANKED_SERIES_RULES.mercenariesPerRound}:${userId}`]:kind==='PET'?[`pet_loadout_v1:${userId}`]:kind==='EQUIPMENT'?[`mercenary_equipment_v1:${userId}:PVE`,`mercenary_equipment_v1:${userId}:PVP`]:[];
  for(const key of keys){const raw=await meta(DB,key);if(auctionMetaSelectionContains(kind,key,parse(raw),ref))fail('편성 중인 물품은 편성을 해제한 뒤 등록하세요.');checks.push(...metaGuard(DB,key,raw));}
  return checks;
}

// Catalog entries must come from a trusted server catalog, never request JSON.
// Only base copies move. Neither side's growth/pity/potential history is edited.
export async function auctionAssetDebit(env,userId,definition,quantity,reference){
  const DB=env.DB,kind=definition?.kind,ref=String(definition?.ref||'');
  if(!AUCTION_ASSET_TYPES[kind]||!ref||definition.tradeable!==true)fail('거래 가능한 보유 물품을 선택하세요.');
  if(!Number.isSafeInteger(quantity)||quantity<1||quantity>1e10)fail('판매 수량을 확인하세요.');
  if(ref===AUCTION_TICKET||definition.bound===true||definition.rental===true)fail('이 물품은 경매에 등록할 수 없습니다.');
  const asset={kind,ref,policyRef:definition.policyRef??ref,name:definition.name,image:definition.image||'',quantity,provenance:definition.provenance||null};let statements=[];
  if(kind==='ITEM'||kind==='MASTER_STAR'){
    asset.ref=kind==='MASTER_STAR'?'MASTER_STAR':ref;
    statements=[...auctionRowLock(DB,'SELECT user_id FROM cnine_user_inventory WHERE user_id=? AND item_code=?',userId,asset.ref),...jointInventoryChange(DB,userId,asset.ref,-quantity,'AUCTION_ESCROW',reference)];
  }else if(kind==='CARD'){
    const row=await p(DB,'SELECT quantity FROM user_cards WHERE user_id=? AND card_id=?',userId,ref).first();
    if(Number(row?.quantity||0)<quantity)fail('보유 카드가 부족합니다.');
    if(Number(row.quantity)===quantity)statements.push(...await protectedLoadouts(DB,userId,kind,ref),p(DB,'INSERT OR IGNORE INTO auction_user_card_growth_v1(user_id,card_id) VALUES(?,?)',userId,ref));
    statements.push(...auctionRowLock(DB,'SELECT user_id FROM user_cards WHERE user_id=? AND card_id=?',userId,ref),...guarded(DB,'EXISTS(SELECT 1 FROM user_cards WHERE user_id=? AND card_id=? AND quantity=?)',[userId,ref,row.quantity],[p(DB,'UPDATE user_cards SET quantity=quantity-? WHERE user_id=? AND card_id=?',quantity,userId,ref)]));
  }else if(kind==='MERCENARY'){
    const row=await p(DB,'SELECT total_copies,duplicate_count FROM user_mercenary_cards_v1 WHERE user_id=? AND mercenary_code=?',userId,ref).first();
    const old=Number(row?.total_copies||0);if(old<quantity)fail('보유 용병이 부족합니다.');
    if(old===quantity)statements.push(...await protectedLoadouts(DB,userId,kind,ref));
    statements.push(...auctionRowLock(DB,'SELECT user_id FROM user_mercenary_cards_v1 WHERE user_id=? AND mercenary_code=?',userId,ref),...guarded(DB,'EXISTS(SELECT 1 FROM user_mercenary_cards_v1 WHERE user_id=? AND mercenary_code=? AND total_copies=? AND duplicate_count=?)',[userId,ref,old,row.duplicate_count],[old===quantity?p(DB,'DELETE FROM user_mercenary_cards_v1 WHERE user_id=? AND mercenary_code=?',userId,ref):p(DB,'UPDATE user_mercenary_cards_v1 SET total_copies=total_copies-?,duplicate_count=duplicate_count-? WHERE user_id=? AND mercenary_code=?',quantity,quantity,userId,ref)]));
  }else if(kind==='PET'){
    const value=parse(await meta(DB,`pet_collection_v1:${userId}`));if(Number(value?.pets?.[ref]||0)===quantity)statements.push(...await protectedLoadouts(DB,userId,kind,ref));
    statements.push(...await petChange(DB,userId,ref,-quantity));
  }else if(kind==='EQUIPMENT'){
    if(quantity!==1)fail('장비는 한 번에 1개씩 등록하세요.');
    const row=await p(DB,'SELECT * FROM user_equipment_instances WHERE user_id=? AND id=?',userId,ref).first();if(!row)fail('보유 장비를 찾을 수 없습니다.');
    const token=crypto.randomUUID();statements.push(...await protectedLoadouts(DB,userId,kind,ref));
    statements.push(jointGuard(DB,token,`EXISTS(SELECT 1 FROM user_equipment_instances WHERE user_id=? AND id=?) AND NOT EXISTS(SELECT 1 FROM user_equipment_loadout WHERE instance_id=?) AND NOT EXISTS(SELECT 1 FROM equipment_forge_states_v1 WHERE instance_id=?) AND NOT EXISTS(SELECT 1 FROM app_meta WHERE key=?)`,[userId,ref,ref,ref,`equipment_polish_instance_v1:${userId}:${ref}`]),p(DB,'DELETE FROM user_equipment_instances WHERE user_id=? AND id=?',userId,ref),jointGuardEnd(DB,token));
    asset.instance=row;
  }else if(kind==='VEHICLE'){
    if(quantity!==1)fail('이동수단은 한 번에 1개씩 등록하세요.');
    const row=await p(DB,'SELECT * FROM user_garage_vehicles WHERE user_id=? AND garage_id=?',userId,ref).first();if(!row)fail('영구 보유한 이동수단이 아닙니다.');
    statements.push(...guarded(DB,'EXISTS(SELECT 1 FROM user_garage_vehicles WHERE user_id=? AND garage_id=?) AND NOT EXISTS(SELECT 1 FROM user_garage_loadout WHERE user_id=? AND garage_id=?)',[userId,ref,userId,ref],[p(DB,'DELETE FROM user_garage_vehicles WHERE user_id=? AND garage_id=?',userId,ref)]));asset.instance=row;
  }
  return {asset,statements};
}
export async function auctionCanReceive(env,userId,asset){
  if(asset.kind!=='VEHICLE')return true;
  return !await p(env.DB,'SELECT 1 FROM user_garage_vehicles WHERE user_id=? AND garage_id=?',userId,asset.ref).first();
}
export async function auctionAssetCredit(env,userId,asset,reference){
  const DB=env.DB,{kind,ref,quantity:q}=asset;
  if(kind==='ITEM'||kind==='MASTER_STAR')return [p(DB,'INSERT INTO cnine_user_inventory(user_id,item_code,quantity,unseen_quantity) VALUES(?,?,?,?) ON CONFLICT(user_id,item_code) DO UPDATE SET quantity=cnine_user_inventory.quantity+excluded.quantity,unseen_quantity=cnine_user_inventory.unseen_quantity+excluded.unseen_quantity,updated_at=CURRENT_TIMESTAMP',userId,ref,q,q),p(DB,"INSERT INTO inventory_logs(user_id,item_code,change_amount,balance_after,reason,reference_type,reference_id) SELECT user_id,item_code,?,quantity,'AUCTION_TRANSFER','AUCTION',? FROM cnine_user_inventory WHERE user_id=? AND item_code=?",q,reference,userId,ref)];
  if(kind==='CARD')return [p(DB,`INSERT INTO user_cards(user_id,card_id,quantity,breakthrough_level,breakthrough_fail_count,first_obtained_at,last_obtained_at) VALUES(?,?,?,0,0,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP) ON CONFLICT(user_id,card_id) DO UPDATE SET quantity=user_cards.quantity+excluded.quantity,last_obtained_at=excluded.last_obtained_at`,userId,ref,q)];
  if(kind==='MERCENARY')return [p(DB,`INSERT INTO user_mercenary_cards_v1(user_id,mercenary_code,total_copies,duplicate_count,first_obtained_at,last_obtained_at) VALUES(?,?,?,?,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP) ON CONFLICT(user_id,mercenary_code) DO UPDATE SET total_copies=user_mercenary_cards_v1.total_copies+excluded.total_copies,duplicate_count=user_mercenary_cards_v1.duplicate_count+excluded.total_copies,last_obtained_at=excluded.last_obtained_at`,userId,ref,q,q-1)];
  if(kind==='PET')return petChange(DB,userId,ref,q);
  if(kind==='EQUIPMENT'){
    if(asset.sourceKind==='SYSTEM')return [p(DB,"INSERT INTO user_equipment_instances(user_id,equipment_id,source_type,source_id,request_id) VALUES(?,?,'AUCTION',?,?)",userId,ref,reference,'AUCTION_USER:'+reference)];
    const x=asset.instance;return [p(DB,'INSERT INTO user_equipment_instances(id,user_id,equipment_id,source_type,source_id,request_id,acquired_at) VALUES(?,?,?,?,?,?,?)',x.id,userId,x.equipment_id,x.source_type,x.source_id,x.request_id,x.acquired_at)];
  }
  if(kind==='VEHICLE'){
    if(asset.sourceKind==='SYSTEM')return guarded(DB,'NOT EXISTS(SELECT 1 FROM user_garage_vehicles WHERE user_id=? AND garage_id=?)',[userId,ref],[p(DB,"INSERT INTO user_garage_vehicles(user_id,garage_id,source_type,source_id) VALUES(?,?,'AUCTION',?)",userId,ref,reference)]);
    const x=asset.instance;return guarded(DB,'NOT EXISTS(SELECT 1 FROM user_garage_vehicles WHERE user_id=? AND garage_id=?)',[userId,ref],[p(DB,'INSERT INTO user_garage_vehicles(user_id,garage_id,source_type,source_id,acquired_at) VALUES(?,?,?,?,?)',userId,x.garage_id,x.source_type,x.source_id,x.acquired_at)]);
  }
  fail('지원하지 않는 경매 물품입니다.');
}
