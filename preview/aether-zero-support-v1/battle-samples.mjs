import {createPveBattleV2, createPvpBattleV2, createDuoBattleV2} from '../../functions/_battle_v2_preview.js';
import {buildTowerV3Battle} from '../../functions/_tower_v3.js';
import {createHuntSession} from '../sustained-hunt-v2/session.mjs';
import {simulateRankedSeries} from '../../shared/ranked-series-v1.mjs';
import {attachVehicleSupports, garageTransit} from '../../functions/_mercenary_vehicle_support.js';
import {VEHICLE_SUPPORTS} from '../../shared/mercenary-vehicle-support-v1.mjs';
import {fixture} from '../../tests/helpers/cooperative-fixture.mjs';
import base from '../equipment-sets-v3-20261019/fixture-pve.json' with {type:'json'};

export const vehicles = ['HELIOS_R','AETHER_ZERO','ROLLS_ROYCE_HYPERCAR','BMW_M9','VECTOR_GT','ASTRA_VOLT'];
export const vehicleNames = ['헬리오스-R','에테르 제로','롤스로이스 하이퍼카','BMW M9','벡터-GT','아스트라 볼트'];
const photos = ['','stealth-aero-fighter-scene-v1.png','rolls-royce-hypercar-teal-silver-aura-v3.png','bmw-m9-concept-aura-v2.png','white-striped-aero-hypercar-high-angle-v1.png','silver-cyan-hypercar-aura-v2.png'];
export const cards = base.cards;
const boss = {...base.monster,battle_power:10000000,pve_hp_percent:650,pve_forced_action_every:2};
const roster = ['V-048','V-049','V-004','V-055','V-009','V-046'].map(code=>fixture.mercenaries.find(row=>row.code===code));
const enemies = cards.map(c=>({...c,power:c.power*3,base_power:c.base_power*3}));
export const seed = 1;

export function equipment(code, ownerId, rows = roster.slice(0,2)) {
  const i=vehicles.indexOf(code), policy=VEHICLE_SUPPORTS.find(s=>s.vehicle===code);
  const vehicleTransit=i<0?null:garageTransit({VEHICLE_TRANSIT_FX:'1'},ownerId,{code,name:vehicleNames[i],image_url:photos[i]?'assets/tire/'+photos[i]:''});
  const mercenaries=policy?attachVehicleSupports(new Map([[ownerId,rows]]),new Map([[ownerId,policy]])).get(ownerId):rows;
  return {ownerId,mercenaries,...(vehicleTransit?{vehicleTransit}:{})};
}

export function rankedSample(codes) {
  const a=equipment(codes[0],1,roster), b=equipment(codes[1],2,roster);
  return simulateRankedSeries({createBattle:createPvpBattleV2,seed,attackerMercenaries:a.mercenaries,defenderMercenaries:b.mercenaries,
    options:{attackerCards:cards,defenderCards:enemies,attackerVehicleTransit:a.vehicleTransit,defenderVehicleTransit:b.vehicleTransit}});
}

export function sample(mode, codes) {
  const a=equipment(codes[0],1), snapshot={cards,mercenaries:a.mercenaries,accountNickname:'선봉 분대',characterBonus:{pveEquipmentRuntime:{vehicleTransit:a.vehicleTransit}}};
  if (mode==='tower') return buildTowerV3Battle({snapshot,tier:10,operatingFloor:{id:10,name:'10층 수호자',power:10000000},seed});
  if (mode==='hunt') return createHuntSession({snapshot,regionId:'coast',seed,now:()=>1000,random:()=>.5}).payload;
  if (mode==='pve') return {mode:'PVE',cards,monster:boss,battleV2:createPveBattleV2({cards,monster:boss,mercenaries:a.mercenaries,pveEquipmentRuntime:snapshot.characterBonus.pveEquipmentRuntime,seed})};
  if (mode==='pvp') return {mode:'PVP',cards,attackerCards:cards,defenderCards:enemies,enemyCards:enemies,battleV2:rankedSample(codes).rounds[0].battleV2};
  const squads=[1,2,3,4].map((ownerId,i)=>({...equipment(codes[i],ownerId),ownerName:['선봉','지원','돌파','후위'][i]+' 분대',
    cards:cards.map((c,j)=>({...c,rarity:['FUR','FUR','ZENITH','ZENITH','SUPERSTAR'][j]}))}));
  if (mode!=='duo') throw Error('Unknown sample mode '+mode);
  const battleV2=createDuoBattleV2({attackerSquads:squads.slice(0,2),defenderSquads:squads.slice(2),seed});
  return {mode:'PVP',cards,attackerCards:cards,defenderCards:cards,enemyCards:cards,battleV2};
}
