import {readMercenaryDocument} from './_mercenary_account.js';
import {MERCENARY_CMS_SEED} from './_mercenary_cms_seed.js';
import {limitedDeploymentSnapshot} from '../shared/mercenary-limited-deployment-v1.mjs';
import {readPetCms} from './_pet_companion_cms.js';
import {PET_ART_CATALOG} from '../shared/pet-art-catalog-v1.mjs';
import {readJinmuPackOwners} from './_mercenary_jinmu_access.js';
import {readJokroPackOwners} from './_mercenary_jokro_access.js';
import {JINMU_CODE,jinmuAccountAllowed} from '../shared/mercenary-jinmu-v1.mjs';
import {JOKRO_CODE,jokroAccountAllowed} from '../shared/mercenary-jokro-v1.mjs';
import {RANKED_SERIES_RULES} from '../shared/ranked-series-v1.mjs';
import {auctionMetaSelectionContains,auctionMercenarySelected} from './_auction_user_assets.js';
import {readAuctionPolicy,auctionAssetBlocked} from './_auction_user_policy.js';
import {AUCTION_TICKET} from '../shared/auction-user-policy-v1.mjs';
import {readRuntimeData,cacheRuntimeData} from './_runtime_data_cache.js';
import {jointGuard,jointGuardEnd} from './_joint_atomic.js';

export const AUCTION_BOUND_ITEMS=Object.freeze({[AUCTION_TICKET]:'개최 전용 티켓',NEW_USER_GIFT_BOX:'신규 계정 전용 지급 영수증',SOOPKETLAND_TICKET:'당일 계정별 이용권',SOOPKETLAND_HYPER_BURNING_TICKET:'등록 스트리머 전용 이용권'});
const loanRules=[{userId:5426,code:'V-974',prefix:'ops:bongsoon:general-jok',date:'20261026'},{userId:5950,code:'V-979',prefix:'ops:namsudaeng-o:jokro',date:'20261019'}];
const parse=raw=>raw==null?null:JSON.parse(raw);
const result=p=>p.then(r=>r.results||[]);
const selected=(value,ref)=>Array.isArray(value)&&value.some(x=>String(x)===String(ref));
const safeQuantity=n=>Number.isSafeInteger(Number(n))&&Number(n)>0?Number(n):0;
const item=(kind,ref,name,image,extra={})=>({kind,ref:String(ref),policyRef:String(ref),name,image:image||'',tradeable:true,...extra});
async function companionCatalog(env){
 const cached=readRuntimeData(env,'auction-companion-catalog-v1');if(cached)return cached;
 const [{document},{state}]=await Promise.all([readMercenaryDocument(env),readPetCms(env)]),mercenaries=new Map(),pets=new Map(PET_ART_CATALOG.map(p=>[p.code,p]));
 for(const row of document.mercenaries){const art=MERCENARY_CMS_SEED.catalog.cards.find(x=>x.code===row.code);if(row.rank)mercenaries.set(row.code,item('MERCENARY',row.code,`${row.name} · ${row.rank}`,row.sourceArt||art?.sourceArt));}
 // The authoritative deployment resolver contains released special variants as
 // well as the pack catalogs. No rank-only catalog may omit PVE-only holders.
 for(let i=0;i<1000;i++){const code='V-'+String(i).padStart(3,'0'),row=limitedDeploymentSnapshot(code);if(row)mercenaries.set(code,item('MERCENARY',code,`${row.name} · ${row.rank||'리미티드'}`,row.sourceArt||row.image));}
 for(const p of state.document.pets)pets.set(p.code,{...pets.get(p.code),...p});
 const value={mercenaries:[...mercenaries.values()],pets:[...pets.values()].filter(p=>p.liveEnabled!==false).map(p=>item('PET',p.code,p.name,p.sourceArt))};cacheRuntimeData(env,'auction-companion-catalog-v1',value,15000);return value;
}
export async function auctionAdminCatalog(env){
 const DB=env.DB,[cards,gear,vehicles,items,companions]=await Promise.all([
 result(DB.prepare("SELECT id,title,rarity,image_url FROM cards_effective_v1210 WHERE is_active=1 AND COALESCE(card_status,'PUBLIC')='PUBLIC' ORDER BY id").all()),
 result(DB.prepare('SELECT id,code,name,rarity,image_url FROM character_equipment_items WHERE is_active=1 AND is_public=1 ORDER BY id').all()),
 result(DB.prepare('SELECT id,code,name,rarity,image_url FROM character_garage_items WHERE is_active=1 AND is_public=1 ORDER BY id').all()),
 result(DB.prepare('SELECT code,name,image_url FROM inventory_items WHERE is_active=1 ORDER BY sort_order,code').all()),companionCatalog(env)]);
 return [...cards.map(c=>item('CARD',c.id,`${c.title} · ${c.rarity}`,c.image_url)),...companions.mercenaries,...companions.pets,
 ...gear.map(c=>item('EQUIPMENT',c.id,c.name,c.image_url,{systemEligible:c.rarity==='MYTHIC',code:c.code})),
 ...vehicles.map(c=>item('VEHICLE',c.id,c.name,c.image_url,{systemEligible:c.rarity==='MYTHIC',code:c.code})),
 ...items.map(c=>item(c.code==='MASTER_STAR'?'MASTER_STAR':'ITEM',c.code,c.name,c.image_url,{systemEligible:!AUCTION_BOUND_ITEMS[c.code],tradeable:!AUCTION_BOUND_ITEMS[c.code],blockedReason:AUCTION_BOUND_ITEMS[c.code]||''}))];
}
export async function auctionOwnedCatalog(env,user,{includeBlocked=false}={}){
 const DB=env.DB,p=(s,...a)=>DB.prepare(s).bind(...a),uid=Number(user.id),keys=[`pet_collection_v1:${uid}`,`pet_loadout_v1:${uid}`,`mercenary_pvp_loadout_v1:${uid}`,`mercenary_dual_loadout_v2:${uid}`,`ranked_series_roster_v${RANKED_SERIES_RULES.mercenariesPerRound}:${uid}`,`mercenary_equipment_v1:${uid}:PVE`,`mercenary_equipment_v1:${uid}:PVP`];
 const loans=loanRules.filter(r=>r.userId===uid);for(const r of loans)keys.push(`${r.prefix}:loan:${r.date}:v1`,`${r.prefix}:revoke:${r.date}:v1`);
 const [catalog,{policy},cards,mercs,inventory,vehicles,metas,decks,legacy]=await Promise.all([
 auctionAdminCatalog(env),readAuctionPolicy(env),result(p('SELECT card_id,quantity FROM user_cards WHERE user_id=? AND quantity>0',uid).all()),
 result(p('SELECT mercenary_code,total_copies FROM user_mercenary_cards_v1 WHERE user_id=?',uid).all()),result(p('SELECT item_code,quantity FROM cnine_user_inventory WHERE user_id=? AND quantity>0',uid).all()),
 result(p('SELECT v.*,l.garage_id equipped FROM user_garage_vehicles v LEFT JOIN user_garage_loadout l ON l.user_id=v.user_id AND l.garage_id=v.garage_id WHERE v.user_id=?',uid).all()),
 result(p(`SELECT key,value FROM app_meta WHERE key IN (${keys.map(()=>'?').join(',')})`,...keys).all()),
 result(p('SELECT card_ids FROM pve_decks WHERE user_id=? UNION ALL SELECT card_ids FROM pvp_decks WHERE user_id=? UNION ALL SELECT card_ids FROM pvp_deck_presets WHERE user_id=?',uid,uid,uid).all()),p('SELECT mercenary_code FROM user_mercenary_loadout_v1 WHERE user_id=?',uid).first()]);
 const defs=new Map(catalog.map(d=>[d.kind+':'+d.ref,d])),meta=new Map(metas.map(m=>[m.key,parse(m.value)])),out=[];
 const excluded=[...new Set(['PVE','PVP'].flatMap(mode=>Object.values(meta.get(`mercenary_equipment_v1:${uid}:${mode}`)?.slots||{})).filter(Boolean).map(String))];
 const gear=await result(p(`SELECT e.* FROM character_equipment_items c JOIN user_equipment_instances e ON e.id=(SELECT b.id FROM user_equipment_instances b WHERE b.user_id=? AND b.equipment_id=c.id AND NOT EXISTS(SELECT 1 FROM equipment_forge_states_v1 f WHERE f.instance_id=b.id) AND NOT EXISTS(SELECT 1 FROM user_equipment_loadout l WHERE l.instance_id=b.id) AND NOT EXISTS(SELECT 1 FROM app_meta m WHERE m.key=('equipment_polish_instance_v1:' || CAST(b.user_id AS TEXT) || ':' || CAST(b.id AS TEXT))) ${excluded.length?'AND CAST(b.id AS TEXT) NOT IN ('+excluded.map(()=>'?').join(',')+')':''} ORDER BY b.id DESC LIMIT 1) WHERE c.is_active=1 AND c.is_public=1`,uid,...excluded).all());
 const inMeta=(kind,ref)=>keys.some(key=>key.includes('loadout')||key.includes('roster')||key.startsWith('mercenary_equipment')?auctionMetaSelectionContains(kind,key,meta.get(key),ref):false);
 const add=(kind,ref,quantity,extra={})=>{const d=defs.get(kind+':'+ref);if(!d)return;const a={...d,quantity:safeQuantity(quantity),...extra};if(auctionAssetBlocked(policy,a)){a.tradeable=false;a.blockedReason='운영자 지정 경매 금지 품목';}if(a.quantity>0&&(includeBlocked||a.tradeable))out.push(a);};
 for(const c of cards)add('CARD',c.card_id,Number(c.quantity)-(decks.some(d=>selected(parse(d.card_ids),c.card_id))?1:0));
 const [jinmu,jokro]=await Promise.all([readJinmuPackOwners(env,mercs.some(c=>c.mercenary_code===JINMU_CODE)?[uid]:[]),readJokroPackOwners(env,mercs.some(c=>c.mercenary_code===JOKRO_CODE)?[uid]:[])]);
 for(const c of mercs){const code=c.mercenary_code;if(!jinmuAccountAllowed(uid,code,jinmu.has(uid))||!jokroAccountAllowed(uid,code,Date.now(),jokro.has(uid)))continue;
  const loan=loans.find(r=>r.code===code),loanPending=loan&&meta.get(`${loan.prefix}:loan:${loan.date}:v1`)?.status==='COMPLETED'&&meta.get(`${loan.prefix}:revoke:${loan.date}:v1`)?.status!=='COMPLETED';
  add('MERCENARY',code,Number(c.total_copies)-(auctionMercenarySelected(legacy,meta.get(`mercenary_pvp_loadout_v1:${uid}`),meta.get(`mercenary_dual_loadout_v2:${uid}`),meta.get(`ranked_series_roster_v${RANKED_SERIES_RULES.mercenariesPerRound}:${uid}`),code)?1:0)-(loanPending?1:0),{provenance:{version:1,verifiedSellerId:uid,code,accessVerified:true,ownershipModel:'FUNGIBLE_QUANTITY',serialAssignment:null}});
 }
 for(const [code,q] of Object.entries(meta.get(`pet_collection_v1:${uid}`)?.pets||{}))add('PET',code,Number(q)-(inMeta('PET',code)?1:0));
 for(const c of inventory)add(c.item_code==='MASTER_STAR'?'MASTER_STAR':'ITEM',c.item_code,c.quantity);
 for(const c of gear){const d=defs.get('EQUIPMENT:'+c.equipment_id);if(!d||c.forged||c.equipped||c.polish||inMeta('EQUIPMENT',String(c.id)))continue;const a={...d,ref:String(c.id),policyRef:String(c.equipment_id),quantity:1,tradeable:!auctionAssetBlocked(policy,d)};if(includeBlocked||a.tradeable)out.push(a);}
 for(const c of vehicles)if(!c.equipped)add('VEHICLE',c.garage_id,1);
 return out;
}
export async function auctionLiveHostGuards(env,user,definition,quantity){
 const DB=env.DB,p=(s,...a)=>DB.prepare(s).bind(...a),token=crypto.randomUUID(),{kind,ref,policyRef}=definition;
 if(quantity>definition.quantity)throw Object.assign(Error('편성·대여를 제외한 판매 가능 수량이 부족합니다.'),{status:409});
 if(kind==='MERCENARY'){
  const [acquisitions,issues,previousTransfers]=await Promise.all([
   result(p('SELECT acquisition_id,created_at FROM mercenary_card_acquisitions_v1 WHERE user_id=? AND mercenary_code=? ORDER BY created_at DESC LIMIT 100',user.id,ref).all()),
   result(p('SELECT i.acquisition_id,i.request_id,i.code,i.serial FROM mercenary_limited_issues_v1 i JOIN mercenary_card_acquisitions_v1 a ON a.acquisition_id=i.acquisition_id AND a.user_id=i.user_id WHERE i.user_id=? AND a.mercenary_code=? ORDER BY i.created_at DESC LIMIT 100',user.id,ref).all()),
   result(p("SELECT t.lot_id,t.seller_id,t.quantity FROM auction_user_transfers_v1 t JOIN auction_user_settlements_v1 s ON s.lot_id=t.lot_id AND s.kind='SOLD' AND s.recipient_id=t.buyer_id WHERE t.buyer_id=? AND t.kind='MERCENARY' AND t.ref=? ORDER BY t.created_ms DESC LIMIT 20",user.id,ref).all())]);
  Object.assign(definition.provenance,{acquisitionHistory:acquisitions,issuanceHistory:issues,previousTransfers,historyNote:'Historical evidence; no individual serial assigned to fungible remaining copies.'});
 }
 const predicates={CARD:["EXISTS(SELECT 1 FROM cards_effective_v1210 WHERE id=? AND is_active=1 AND COALESCE(card_status,'PUBLIC')='PUBLIC')",ref],ITEM:['EXISTS(SELECT 1 FROM inventory_items WHERE code=? AND is_active=1)',ref],MASTER_STAR:['EXISTS(SELECT 1 FROM inventory_items WHERE code=? AND is_active=1)','MASTER_STAR'],EQUIPMENT:['EXISTS(SELECT 1 FROM character_equipment_items WHERE id=? AND is_active=1 AND is_public=1)',policyRef],VEHICLE:['EXISTS(SELECT 1 FROM character_garage_items WHERE id=? AND is_active=1 AND is_public=1)',policyRef]};
 return predicates[kind]?[jointGuard(DB,token,predicates[kind][0],[predicates[kind][1]]),jointGuardEnd(DB,token)]:[];
}
