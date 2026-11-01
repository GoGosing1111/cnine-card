import assert from 'node:assert/strict';
import fixture from '../fixtures/tower-expansion-20261102.json' with {type:'json'};
import {buildTowerExpansionPlan} from '../../scripts/ops/tower-121-150-policy-20261102.mjs';
import {buildTowerV3Battle,TOWER_V3_DRAFT} from '../../functions/_tower_v3.js';
import {COMPANION_PREPARATION_REVIEW as REVIEW} from '../../shared/companion-loadout-v2.mjs';
export {fixture,REVIEW};
export const plan=buildTowerExpansionPlan(fixture);
export const PAIRS=[['V-021','V-009'],['V-057','V-042'],['V-996','V-952'],['V-999','V-977']];
export function reviewSnapshot({codes=PAIRS[2],level=21,count=2,power=250000}={}){
 const mask=[5,10,15,20].reduce((sum,n,i)=>sum|(n<level?1<<i:0),0);
 const mercenaries=codes.slice(0,count).map(code=>{
  const source=fixture.snapshots.find(row=>row.code===code);assert(source);
  return {...structuredClone(source),mercenaryLevel:{version:2,level,breakthroughMask:mask,policyRevision:fixture.growthRevision,growth:structuredClone(fixture.growth)}};
 });
 return {cards:['ATTACK','DEFENSE','SPEED','HP','ATTACK'].map((power_type,i)=>({id:'QA-'+i,power,power_type})),
  mercenaries,[REVIEW]:true,accountNickname:'무한의탑 준비 검수',characterBonus:{pve:0},cardSupportBonus:0,magicCards:[],singleHealerBonus:{},ultimateDamage:0};
}
export function reviewBattle({floor=121,seed=1,...options}={}){
 const row=floor===120?{floor,monsterId:69,power:1800000000}:plan.floors.find(row=>row.floor===floor);assert(row);
 const monster=fixture.monsters.find(m=>Number(m.id)===row.monsterId);assert(monster);
 return buildTowerV3Battle({snapshot:reviewSnapshot(options),tier:floor,seed,
  config:{...TOWER_V3_DRAFT,mode:'ON',maxTier:150,powerGrowth:1.001,rulesVersion:'TOWER_ABYSS_20261022'},
  operatingFloor:{id:row.monsterId,name:monster.name,image:monster.image_url,power:row.power}});
}
