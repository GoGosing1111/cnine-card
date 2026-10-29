// Ascendant mercenary gear: shared server/client catalog and 2/4/5-piece policy.
// Catalog registration and acquisition remain explicit operations, never module side effects.
export const ASCENDANT_EQUIPMENT_VERSION='20261028-v1';
export const ASCENDANT_EQUIPMENT_SLOTS=Object.freeze(['WEAPON','TOP','BOTTOM','SHOES','ACCESSORY']);
export const ASCENDANT_EQUIPMENT_MODES=Object.freeze(['PVE','PVP']);
export const ASCENDANT_EQUIPMENT_ART='/assets/ui/mercenary-equipment/ascendant-20261028/';
const labels={WEAPON:'무기',TOP:'상의',BOTTOM:'하의',SHOES:'신발',ACCESSORY:'장신구'};
// Existing mercenary SET gear, confirmed against the live catalog on 2026-10-28.
// Character equipment (Arden/Emperor) is an art reference only.
export const ASCENDANT_POWER_BASELINE=Object.freeze({WEAPON:200000,TOP:140000,BOTTOM:130000,SHOES:100000,ACCESSORY:120000});
const definitions=[
 ['moonblade','월백검성','동양','#b8dcff',175],
 ['crimson-paladin','성홍기사','서양','#ff7976',200],
 ['azure-dragon','청룡천위','동양','#44e7cb',225],
 ['blackflame-king','흑염패왕','서양','#ff8b38',250],
 ['white-tiger','백호무신','동양','#f5daa1',275],
 ['seraph-radiance','성휘대천사','서양','#ffe3a5',300],
 ['thunder-deity','뇌정천존','동양','#c4a6ff',350],
 ['abyss-constellation','심연성좌','서양','#bd7fff',400],
 ['celestial-dragon-emperor','천룡태황','동양','#58ffc6',450],
 ['crown-of-genesis','창세의 왕관','서양','#ffd6fe',500]
];
export const ASCENDANT_EQUIPMENT_SETS=Object.freeze(definitions.map(([slug,name,style,accent,powerScalePercent],i)=>{
 const tier=i+1,ordinal=String(tier).padStart(2,'0'),id='ascendant-'+ordinal,setId='MERC_ASC_'+ordinal;
 const powerBySlot=Object.freeze(Object.fromEntries(ASCENDANT_EQUIPMENT_SLOTS.map(slot=>[slot,ASCENDANT_POWER_BASELINE[slot]*powerScalePercent/100])));
 const totalPower=Object.values(powerBySlot).reduce((sum,value)=>sum+value,0),pvePower=Math.floor(totalPower*.9);
 return Object.freeze({id,setId,tier,name,setName:name,style,accent,artId:ordinal+'-'+slug,powerScalePercent,powerBySlot,totalPower,pvePower,pvpPower:totalPower-pvePower,pieces:5,modes:ASCENDANT_EQUIPMENT_MODES,
  two:Object.freeze({attackPercent:6+tier*2,hpPercent:8+tier*2}),
  four:Object.freeze({criticalChancePoints:3+tier,criticalDamagePoints:12+tier*3}),
  five:Object.freeze({speedPercent:2+tier,damageReductionPercent:4+tier,shieldPercent:[12,13,15,16,18,19,21,22,24,25][i]})});
}));
export const ASCENDANT_EQUIPMENT=Object.freeze(ASCENDANT_EQUIPMENT_SETS.flatMap(set=>ASCENDANT_EQUIPMENT_SLOTS.map(slot=>Object.freeze({
 code:set.setId+'_'+slot,regionId:set.id,setId:set.setId,tier:set.tier,kind:'SET',name:set.name+' '+labels[slot],slot,subtype:slot,
 rarity:'MYTHIC',totalPower:set.powerBySlot[slot],pvePower:Math.floor(set.powerBySlot[slot]*.9),pvpPower:set.powerBySlot[slot]-Math.floor(set.powerBySlot[slot]*.9),
 image:ASCENDANT_EQUIPMENT_ART+set.artId+'-'+slot.toLowerCase()+'.webp',modes:ASCENDANT_EQUIPMENT_MODES,
 description:`용병 상위 ${set.tier}단계 · ${set.name} 2/4/5세트 · PVE/PVP 공통 효과`
}))));
const byCode=new Map(ASCENDANT_EQUIPMENT.map(item=>[item.code,item]));
export const ascendantEquipment=code=>byCode.get(code)||null;
export const ascendantSet=id=>ASCENDANT_EQUIPMENT_SETS.find(set=>set.id===id||set.setId===id)||null;
export function ascendantEquipmentEffects(codes=[],mode='PVE'){
 const effects={},sets=[];
 if(!ASCENDANT_EQUIPMENT_MODES.includes(mode))return {schemaVersion:1,effects,sets,uniques:[]};
 const slotsBySet=new Map();
 for(const code of new Set(codes)){const item=ascendantEquipment(code);if(!item)continue;if(!slotsBySet.has(item.setId))slotsBySet.set(item.setId,new Set());slotsBySet.get(item.setId).add(item.slot);}
 for(const set of ASCENDANT_EQUIPMENT_SETS){const count=slotsBySet.get(set.setId)?.size||0;if(count<2)continue;
  for(const [threshold,key] of [[2,'two'],[4,'four'],[5,'five']])if(count>=threshold)for(const [effect,value] of Object.entries(set[key]))effects[effect]=(effects[effect]||0)+value;
  sets.push({id:set.setId,name:set.name,tier:set.tier,count,active:count===5?5:count>=4?4:2,modes:ASCENDANT_EQUIPMENT_MODES});
 }
 return {schemaVersion:1,effects,sets,uniques:[]};
}
