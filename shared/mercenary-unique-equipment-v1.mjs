import {ASCENDANT_POWER_BASELINE, ASCENDANT_EQUIPMENT_MODES, ASCENDANT_EQUIPMENT_SLOTS} from './mercenary-ascendant-equipment-v1.mjs';
import {equipmentEffectText} from './equipment-growth-text-v1.mjs';

// Published item codes are permanent inventory identifiers. Unique ranks have their own progression.
const tiers = [
  {tier:1, imageStem:'unique-regalia-20261109/1-', codePrefix:'MERC_UQ_11_', family:'흑기사', scale:12, attack:36, hp:42,
    pieces:[
      ['흑기사의 처형대검','처형 선고',{attackPercent:32,penetrationPoints:12}],
      ['흑기사의 혈석 흉갑','불굴의 맹세',{hpPercent:35,damageReductionPercent:30}],
      ['철벽의 전투각반','붉은 방벽',{shieldPercent:60}],
      ['성문파쇄 전투화','중갑 돌진',{speedPercent:32}],
      ['흑기사의 인장','집행자의 각인',{criticalChancePoints:24,criticalDamagePoints:96}]]},
  {tier:2, imageStem:'unique-regalia-20261109/2-', codePrefix:'MERC_UQ_12_', family:'흑금 월식', scale:16, attack:44, hp:52,
    pieces:[
      ['흑금의 월식도','월식 절단',{attackPercent:42,penetrationPoints:16}],
      ['흑금의 월식 흉갑','흑금 장갑',{hpPercent:46,damageReductionPercent:36}],
      ['월영의 흑금각반','월영 장벽',{shieldPercent:80}],
      ['흑금의 잠행화','그림자 보법',{speedPercent:44}],
      ['암월의 흑금 펜던트','월식 공명',{criticalChancePoints:28,criticalDamagePoints:130}]]},
  {tier:3, imageStem:'unique-regalia-20261109/3-', codePrefix:'MERC_UQ_13_', family:'제국의 옥좌', scale:22, attack:54, hp:64,
    pieces:[
      ['황제의 단죄대검','황제의 선고',{attackPercent:54,penetrationPoints:20}],
      ['황제의 대례 흉갑','옥좌의 맹세',{hpPercent:60,damageReductionPercent:42}],
      ['옥좌의 근위각반','근위 방벽',{shieldPercent:105}],
      ['황실 근위대 판금화','황실의 진군',{speedPercent:58}],
      ['황제의 보관','황제의 권위',{criticalChancePoints:32,criticalDamagePoints:170}]]}
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
