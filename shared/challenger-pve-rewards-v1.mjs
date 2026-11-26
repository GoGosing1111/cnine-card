export const CHALLENGER_REWARD_MULTIPLIER=2.5;
export const inheritedCitadelDrops=(policy,tier)=>(tier==='crucible'?policy.tierDrops?.throne:undefined)??policy.drops;

// Quantities are committed to the drop or offer receipt before collection.
// An odd source stack has two equally likely integer outcomes.
export function scaledStackQuantity(quantity,multiplier,random){
  const scaled=quantity*multiplier;
  return Number.isInteger(scaled)?scaled:Math.floor(scaled)+(random()<0.5?1:0);
}

// Some inventory rows, such as permanent skill chips, are equipment. Only
// the currencies, materials and consumables in these reward pools qualify.
const currencies=new Set(['COIN','MASTER_STAR','CARD_SHARDS','MAGIC_CRYSTAL']);
const resources=new Set(['MASTER_STAR','EMPEROR_ENERGY','PET_SEAL_ORB','PET_POTENTIAL_POTION','EQUIPMENT_POLISH_STONE',
  'BLACK_MIRACLE_PACK','EASTERN_ARMS_WEAPON_BLUEPRINT','STARLIGHT_ARMOR_CORE',
  'VEHICLE_PART_ENGINE','VEHICLE_PART_FRAME','VEHICLE_PART_TIRE',
  'SUIT_CORE_3','SUIT_CORE_4','SUIT_CORE_5','SUIT_CORE_6',
  'SECRET_WEAPON_BLUEPRINT_CHAPTER_1','SECRET_WEAPON_BLUEPRINT_CHAPTER_2','SECRET_WEAPON_BLUEPRINT_CHAPTER_3']);
const resourceCategories=new Set(['ADVANCEMENT','CUBE','ENTRY_TICKET','EVENT','GIFT_BOX','JACKPOT','MATERIAL','PACK','POTION','REROLL','SUPPLY_BOX','TICKET','VEHICLE_DRAW']);
export const challengerResourceCategory=category=>resourceCategories.has(category);
export const knownChallengerInventoryItem=ref=>resources.has(ref)||ref.startsWith('SKILL_CHIP_');
export const isChallengerResource=(type,ref,additional)=>currencies.has(type)||(type==='INVENTORY_ITEM'&&(resources.has(ref)||additional?.includes(ref)===true));
export function challengerChoiceReward(reward,random,additional){
  return isChallengerResource(reward.rewardType,reward.rewardRef,additional)?{...reward,quantity:scaledStackQuantity(reward.quantity,CHALLENGER_REWARD_MULTIPLIER,random)}:reward;
}
