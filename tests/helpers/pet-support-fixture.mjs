// Isolated presentation fixtures. These percentages never write to live CMS.
import {PET_ART_CATALOG} from '../../shared/pet-art-catalog-v1.mjs';
import {PET_BUFF_VISUALS} from '../../shared/pet-buff-visuals-v1.mjs';
import {createPveBattleV2,createPvpBattleV2} from '../../functions/_battle_v2_preview.js';
import {createCooperativeBattle} from '../../functions/_cooperative_battle.js';
import {coopSquads} from './cooperative-fixture.mjs';
import {REVIEW_DECK} from '../../preview/lich-king-raid-v1/fixture.mjs';
export const PET_EFFECT_TYPES=Object.keys(PET_BUFF_VISUALS);
export function reviewPet(type='MAX_HP_PERCENT',ownerId=1,index=4){
 const art=PET_ART_CATALOG[index%PET_ART_CATALOG.length];
 return {ownerId,definition:{code:art.code,name:art.name,battleSprite:art.sourceArt,enabled:true,modes:['PVE','PVP'],target:'ALL_ALLIES',buffs:(type==='ALL'?PET_EFFECT_TYPES:[type]).map(type=>({type,percent:20})),notes:''}};
}
export function petSupportFixture({mode='PVE',type='MAX_HP_PERCENT'}={}){
 if(mode==='COOP'){
  const squads=coopSquads();squads.forEach((s,i)=>{s.pet=reviewPet(type==='ALL'?PET_EFFECT_TYPES[i]:type,s.ownerId,i+4);});
  return createCooperativeBattle({squads,seed:21}).payload;
 }
 const cards=REVIEW_DECK.map(c=>({...c,rarity:c.grade,basePower:c.power})),pet=reviewPet(type);
 if(mode==='PVP')return {mode,battleV2:createPvpBattleV2({attackerCards:cards,defenderCards:cards,attackerPet:pet,defenderPet:reviewPet('START_SHIELD_PERCENT',2,5),seed:37}),opponent:'상대 진영'};
 const monster={id:1,name:'슬라임',battle_power:180000,image:'assets/cards/monster/sla2.jfif'};
 return {mode,monster,battleV2:createPveBattleV2({cards,pet,monster,seed:37})};
}
