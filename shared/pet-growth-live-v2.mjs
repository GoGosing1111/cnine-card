import {PET_STATS,PET_TRAITS,validateInstance} from './pet-growth-v2.mjs';
export const PET_GROWTH_KEY=userId=>`pet_growth_v2:${Number(userId)}`;
export const PET_GROWTH_COSTS=Object.freeze({stats:{coin:'5000000000000',masterStars:10000000},trait:{coin:'30000000000000',masterStars:50000000}});
// User-directed descending order of each pet's highest existing effect.
// CMS revision 49: 55=SSS, 50=SS, 35=S, 30=A, 20/25=B, 8/10=C.
// Original combat/reward percentages remain untouched.
export const PET_GROWTH_CAPS=Object.freeze(Object.fromEntries([
 ['C',['HEADSET-SHIBA','BEANIE-CAT','MOON-FOX','FROST-WOLF','SOLAR-PHOENIX','VERDANT-STAG','ASTRAL-PANTHER','BULLDOG']],
 ['B',['BONGSOON','JOEUN','HEEYA','DIIM','GUSUDAENG','NAMUNEUL-BONGSOON','MALTESE-DIIM']],
 ['A',['GILDED-DRAGON','WHITE-SPIRIT','PUMPKIN-BONGSOON','PUMPKIN-JOEUN','DAENGSORYONG']],
 ['S',['CRIMSON-DEMON']],
 ['SS',['HEUKGU','JJANGGU-HEEYA']],
 ['SSS',['BAZZI-BONGSOON','PEPEGU']]
].flatMap(([grade,codes])=>codes.map(code=>['PET-'+code,grade]))));
const stats={C:0,B:1,A:2,S:3,SS:4,SSS:5},traits={C:1,B:2,A:3,S:5,SS:7,SSS:10};
export const PET_GROWTH_VALUES=Object.freeze({...Object.fromEntries(PET_STATS.map(k=>[k,stats])),...Object.fromEntries(Object.keys(PET_TRAITS).map(k=>[k,traits]))});
export const PET_GROWTH_POLICY=Object.freeze({enabled:true,revision:1,costs:PET_GROWTH_COSTS,weights:{C:30,B:25,A:20,S:15,SS:7,SSS:3},values:PET_GROWTH_VALUES,
 traitPools:Object.fromEntries(Object.keys(PET_GROWTH_CAPS).map(code=>[code,Object.keys(PET_TRAITS)]))});
export const emptyPetGrowth=()=>({version:2,revision:0,pets:{},loadouts:{PVE:null,PVP:null},pending:null});
export function initialPetGrowth(code,index=1){
 const cap=PET_GROWTH_CAPS[code];if(!cap)return null;
 return {id:`${code}:${index}`,petCode:code,cap,stats:Object.fromEntries(PET_STATS.map(k=>[k,'C'])),trait:{id:'ASSAULT',grade:'C',activated:false}};
}
export function savedPetGrowth(record,code,mode='PVE',ownership=null){
 const valid=pet=>pet?.petCode===code&&(!ownership||(ownership.permanent?Number(pet.id.split(':').at(-1))>=1&&Number(pet.id.split(':').at(-1))<=ownership.quantity:pet.id===`${code}:R`));
 const id=record?.loadouts?.[mode],selected=record?.pets?.[id];
 if(valid(selected))return validateInstance(selected);
 const fallback=[record?.pets?.[`${code}:1`],record?.pets?.[`${code}:R`]].find(valid);
 return fallback?validateInstance(fallback):null;
}
export function petGrowthBonuses(instance,mode='PVE'){
 if(!instance)return null;validateInstance(instance);
 const buffs=PET_STATS.map((key,i)=>({type:['ATTACK_PERCENT','DEFENSE_PERCENT','MAX_HP_PERCENT','SPEED_PERCENT'][i],percent:PET_GROWTH_VALUES[key][instance.stats[key]]}));
 const trait=PET_TRAITS[instance.trait.id],active=instance.trait.activated!==false&&(trait.target!=='BOSS'||mode==='PVE');
 const percent=active?PET_GROWTH_VALUES[instance.trait.id][instance.trait.grade]:0;
 if(active&&['ATTACK_PERCENT','START_SHIELD_PERCENT','MAX_HP_PERCENT','SPEED_PERCENT'].includes(trait.effect)){
  const found=buffs.find(row=>row.type===trait.effect);if(found)found.percent+=percent;else buffs.push({type:trait.effect,percent});
 }
 return {buffs:buffs.filter(row=>row.percent>0),trait:{...instance.trait,name:trait.name,effect:trait.effect,percent,active}};
}
export function petGrowthCoinBonus(instance,mode='PVE'){
 const bonus=petGrowthBonuses(instance,mode);return mode==='PVE'&&bonus?.trait.active&&bonus.trait.id==='LUCK'?bonus.trait.percent:0;
}
