import {ASCENDANT_POWER_BASELINE, ASCENDANT_EQUIPMENT_MODES, ASCENDANT_EQUIPMENT_SLOTS} from './mercenary-ascendant-equipment-v1.mjs';
import {equipmentEffectText} from './equipment-growth-text-v1.mjs';

// Published item codes are permanent inventory identifiers. Unique ranks have their own progression.
const tiers = [
  {tier:1, imageStem:'unique-regalia-20261109/1-', codePrefix:'MERC_UQ_11_', family:'새벽별', scale:12, attack:36, hp:42,
    pieces:[
      ['별가름','성광관통',{attackPercent:32,penetrationPoints:12}],
      ['오팔갑주','별빛수호',{hpPercent:35,damageReductionPercent:30}],
      ['성운각반','성운장막',{shieldPercent:60}],
      ['혜성부츠','유성질주',{speedPercent:32}],
      ['성좌반지','별빛공명',{criticalChancePoints:24,criticalDamagePoints:96}]]},
  {tier:2, imageStem:'unique-regalia-20261109/2-', codePrefix:'MERC_UQ_12_', family:'그믐달', scale:16, attack:44, hp:52,
    pieces:[
      ['월식도','월식참',{attackPercent:42,penetrationPoints:16}],
      ['흑요갑주','흑요결계',{hpPercent:46,damageReductionPercent:36}],
      ['반월각반','월영장벽',{shieldPercent:80}],
      ['잠행부츠','달그림자',{speedPercent:44}],
      ['월식심장','월광공명',{criticalChancePoints:28,criticalDamagePoints:130}]]},
  {tier:3, imageStem:'unique-regalia-20261109/3-', codePrefix:'MERC_UQ_13_', family:'태양왕좌', scale:22, attack:54, hp:64,
    pieces:[
      ['태양서약','여명선고',{attackPercent:54,penetrationPoints:20}],
      ['백금갑주','백금수호',{hpPercent:60,damageReductionPercent:42}],
      ['근위각반','왕실방벽',{shieldPercent:105}],
      ['황실군화','여명진군',{speedPercent:58}],
      ['일륜왕관','태양권능',{criticalChancePoints:32,criticalDamagePoints:170}]]}
];

export const UNIQUE_MERCENARY_EQUIPMENT = Object.freeze(tiers.flatMap(tier =>
  tier.pieces.map(([name,passiveName,special],i) => {
    const slot=ASCENDANT_EQUIPMENT_SLOTS[i], totalPower=ASCENDANT_POWER_BASELINE[slot]*tier.scale;
    const pvePower=Math.floor(totalPower*.9);
    const individualEffects=Object.freeze({...special,attackPercent:tier.attack+(special.attackPercent||0),hpPercent:tier.hp+(special.hpPercent||0)});
    return Object.freeze({code:tier.codePrefix+slot,kind:'UNIQUE',setId:null,regionId:null,
      tier:tier.tier,tierLabel:'유니크 '+tier.tier+'단계',family:tier.family,name,slot,subtype:slot,rarity:'MYTHIC',totalPower,pvePower,pvpPower:totalPower-pvePower,
      modes:ASCENDANT_EQUIPMENT_MODES,passiveName,individualEffects,
      description:equipmentEffectText(individualEffects),
      image:'/assets/ui/mercenary-equipment/'+tier.imageStem+slot.toLowerCase()+'.webp'});
  })
));
const byCode=new Map(UNIQUE_MERCENARY_EQUIPMENT.map(item=>[item.code,item]));

// A combat snapshot can contribute at most one catalog item per real slot.
export function individualMercenaryBonuses(items=[]) {
  if(!Array.isArray(items))return null;
  const slots=new Map();
  for(const item of items) {
    const gear=byCode.get(item?.code);
    if(!gear || gear.slot!==item.slot)continue;
    const existing=slots.get(gear.slot);
    slots.set(gear.slot,existing===undefined || existing===gear ? gear : null);
  }
  if(!slots.size)return null;
  const effects={},codes=[];
  for(const gear of slots.values()) {
    if(!gear)continue;
    codes.push(gear.code);
    for(const [stat,value] of Object.entries(gear.individualEffects))effects[stat]=(effects[stat]||0)+value;
  }
  return codes.length?{effects,codes}:null;
}
