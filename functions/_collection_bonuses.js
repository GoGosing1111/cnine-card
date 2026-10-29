import {PET_CMS_KEY,validatePetCmsDocument} from '../shared/pet-cms-v1.mjs';
import {petCollectionKey,petLoadoutKey} from '../shared/pet-potential-v1.mjs';
import {COMPANION_RELEASE} from '../shared/companion-loadout-v2.mjs';
import {TROPHY_BONUSES_KEY,emptyTrophyBonuses,validateTrophyBonuses,trophyBonusProjection} from '../shared/trophy-bonuses-v1.mjs';
import {ZERO_REWARD_BONUSES,hasRewardBonuses,sumRewardBonuses,rewardAmountWithBonus} from '../shared/collection-bonuses-v1.mjs';
import {readTrophyHonors} from './_trophy_honors.js';

const SCOPE=Symbol('collectionBonusRequest');
export const COLLECTION_REWARD_SOURCES=new Set(['HUNT','PVE_DROP','PVP_DROP','PVE','PVE_AUTO','PVE_NIGHTMARE','PVE_NIGHTMARE_AUTO','PVE_APOCALYPSE','APOCALYPSE','PVP','RANKED_DUO','RAID','RAID_CLEAR','CORE_RAID','LICH_RAID','MADARA_RAID','BLACKWING_RAID','ESCORT','SIEGE','SEAL','TOWER','TOWER_FIRST_CLEAR','SCRAPYARD','COW_ROOM','RIFT','LEGION_HUNT']);
export const collectionRewardSource=source=>COLLECTION_REWARD_SOURCES.has(String(source||'').toUpperCase());
export function withCollectionBonusScope(env){return {...env,[SCOPE]:{users:new Map()}};}
export async function readTrophyBonusSettings(env){
  const row=await env.DB.prepare('SELECT value FROM app_meta WHERE key=?').bind(TROPHY_BONUSES_KEY).first();
  if(!row)return {raw:null,revision:0,document:emptyTrophyBonuses(),audit:[]};
  const state=JSON.parse(row.value);
  if(!Number.isSafeInteger(state.revision)||state.revision<1||!Array.isArray(state.audit)||state.audit.length>50)throw Error('Invalid trophy bonus record');
  return {...state,raw:row.value,document:validateTrophyBonuses(state.document,{allowLegacy:true})};
}
export async function readCollectionBonuses(env,userId){
  const uid=Number(userId);
  if(!Number.isSafeInteger(uid)||uid<1)throw Error('Invalid collection bonus owner');
  const read=async()=>{
    const rows=await env.DB.prepare('SELECT key,value FROM app_meta WHERE key IN (?,?,?,?)').bind(PET_CMS_KEY,petCollectionKey(uid),petLoadoutKey(uid),TROPHY_BONUSES_KEY).all();
    const map=new Map((rows.results||[]).map(row=>[row.key,JSON.parse(row.value)]));
    const pets=map.has(PET_CMS_KEY)?validatePetCmsDocument(map.get(PET_CMS_KEY).document,{allowLegacy:true}).pets:[];
    const code=map.get(petLoadoutKey(uid))?.petCode,quantity=map.get(petCollectionKey(uid))?.pets?.[code];
    const pet=COMPANION_RELEASE.pets&&Number.isSafeInteger(quantity)&&quantity>0?pets.find(p=>p.code===code&&p.liveEnabled!==false):null;
    const petBonuses=pet?.rewardBonuses||ZERO_REWARD_BONUSES;
    const trophyDocument=map.has(TROPHY_BONUSES_KEY)?validateTrophyBonuses(map.get(TROPHY_BONUSES_KEY).document,{allowLegacy:true}):emptyTrophyBonuses();
    // Only configured new trophy effects need their additional milestone sources.
    const activeCodes=trophyDocument.trophies.filter(t=>hasRewardBonuses(t.rewardBonuses)).map(t=>t.code);
    const newMilestoneCodes=activeCodes.filter(code=>['BLUE_EMPIRE_20','LIMITED_EDITION_80','LOYAL_SERVICE_POST_20'].includes(code));
    const honors=activeCodes.length?await readTrophyHonors(env,uid,{newMilestoneCodes}):{};
    const projection=trophyBonusProjection(trophyDocument,honors);
    return {pet:pet?{code:pet.code,name:pet.name,rewardBonuses:petBonuses}:null,trophies:projection.trophies.filter(t=>t.owned&&hasRewardBonuses(t.rewardBonuses)),petBonuses,trophyBonuses:projection.totals,totals:sumRewardBonuses([petBonuses,projection.totals])};
  };
  const scope=env[SCOPE];if(!scope)return read();
  if(!scope.users.has(uid))scope.users.set(uid,read());
  return scope.users.get(uid);
}
export async function collectionRewardCoin(env,userId,base,source,cap=Number.MAX_SAFE_INTEGER){
  if(!collectionRewardSource(source)||!base)return base;
  return rewardAmountWithBonus(base,(await readCollectionBonuses(env,userId)).totals.coinPercent,cap);
}
export async function collectionDropPercent(env,userId,source){
  return collectionRewardSource(source)?(await readCollectionBonuses(env,userId)).totals.dropPercent:0;
}
