import {ASCENDANT_POWER_BASELINE, ASCENDANT_EQUIPMENT_MODES, ASCENDANT_EQUIPMENT_SLOTS} from './mercenary-ascendant-equipment-v1.mjs';
import {equipmentEffectText} from './equipment-growth-text-v1.mjs';

const tiers = [
  {tier:11, family:'홍련일식', scale:12, attack:36, hp:42,
    pieces:[
      ['홍련일식 봉황도','낙일의 참격',{attackPercent:32,penetrationPoints:12}],
      ['홍련심장 흉갑','불멸의 심장',{hpPercent:35,damageReductionPercent:30}],
      ['적양비늘 각반','일식 결계',{shieldPercent:60}],
      ['잔양 비상화','홍련 비상',{speedPercent:32}],
      ['흑일의 인장','검은 태양',{criticalChancePoints:24,criticalDamagePoints:96}]]},
  {tier:12, family:'설령백호', scale:16, attack:44, hp:52,
    pieces:[
      ['백호의 송곳니 대도','산군의 포효',{attackPercent:42,penetrationPoints:16}],
      ['설령백호 흉갑','백호의 기백',{hpPercent:46,damageReductionPercent:36}],
      ['흑호문 각반','설산의 호위',{shieldPercent:80}],
      ['백호 발톱 전투화','설원을 가르는 발톱',{speedPercent:44}],
      ['벽안백호 패옥','사냥꾼의 눈',{criticalChancePoints:28,criticalDamagePoints:130}]]},
  {tier:13, family:'천제황룡', scale:22, attack:54, hp:64,
    pieces:[
      ['황룡여의 언월도','황룡의 역린',{attackPercent:54,penetrationPoints:20}],
      ['황룡제왕 금갑','용제의 가호',{hpPercent:60,damageReductionPercent:42}],
      ['황금용린 각반','만 겹의 금린',{shieldPercent:105}],
      ['등천황룡화','금룡 등천',{speedPercent:58}],
      ['황룡 여의보관','여의주의 광휘',{criticalChancePoints:32,criticalDamagePoints:170}]]}
];

export const UNIQUE_MERCENARY_EQUIPMENT = Object.freeze(tiers.flatMap(tier =>
  tier.pieces.map(([name,passiveName,special],i) => {
    const slot=ASCENDANT_EQUIPMENT_SLOTS[i], totalPower=ASCENDANT_POWER_BASELINE[slot]*tier.scale;
    const pvePower=Math.floor(totalPower*.9);
    const individualEffects=Object.freeze({...special,attackPercent:tier.attack+(special.attackPercent||0),hpPercent:tier.hp+(special.hpPercent||0)});
    return Object.freeze({code:'MERC_UQ_'+tier.tier+'_'+slot,kind:'UNIQUE',setId:null,regionId:null,
      tier:tier.tier,family:tier.family,name,slot,subtype:slot,rarity:'MYTHIC',totalPower,pvePower,pvpPower:totalPower-pvePower,
      modes:ASCENDANT_EQUIPMENT_MODES,passiveName,individualEffects,
      description:equipmentEffectText(individualEffects),
      image:'/assets/ui/mercenary-equipment/unique-20261109/'+tier.tier+'-'+slot.toLowerCase()+'.webp'});
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
