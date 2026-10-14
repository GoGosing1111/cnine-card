import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {rankedMatchPower} from '../shared/ranked-matchmaking-v2.mjs';

test('matching power removes only mercenary contribution and fails closed for invalid values',()=>{
 assert.equal(rankedMatchPower(1980160,1080000),900160);
 assert.equal(rankedMatchPower(1080160,180000),900160);
 assert.equal(rankedMatchPower(900160),900160);
 for(const values of [[0,0],[100,100],[100,101],[NaN,0],[Infinity,0],[100,NaN],[100,-1]])assert.equal(rankedMatchPower(...values),0);
});

test('attack and batched defense keep equipment, forge and full combat power on the same basis',async()=>{
 const source=readFileSync(new URL('../functions/api/[[path]].js',import.meta.url),'utf8');
 const functions=source.slice(source.indexOf('async function pvpFormationPower('),source.indexOf('async function createRankedMatchTicket('));
 const cards=Array.from({length:5},(_,i)=>({id:String(i),base_power:180000}));
 const mercenaries=new Map([[1,{power:1080000}],[2,{power:180000}]]),calls=[];
 const deps={rankedMatchPower,pvpDeckSnapshot:async()=>cards,userEquipmentBonuses:async()=>({pvp:160}),releasedMercenarySnapshot:async(_,u,mode)=>{assert.equal(mode,'PVP');return mercenaries.get(u.id);},mercenarySnapshotPower:m=>m?.power??0,
  cardBattlePower:card=>card.base_power,releasedMercenarySnapshots:async(_,ids,mode)=>{calls.push(ids);assert.equal(mode,'PVP');return mercenaries;},FORGE_RUNTIME_RELEASE_ENABLED:true,forgeEquipmentBonuses:async()=>new Map([[1,{pvp:10}],[2,{pvp:10}]]),MERCENARY_EQUIPMENT_SQL_CODES:"'MERCENARY_WEAPON'",superstarDeckCount:()=>0,iconDeckCount:()=>0,SUPERSTAR_DECK_LIMIT:1,ICON_DECK_LIMIT:2};
 const {attack,defense}=Function('deps',`with(deps){${functions};return {attack:pvpFormationPower,defense:pvpDefenseFormationPowers};}`)(deps);
 const env={DB:{prepare(sql){
  return {bind(...ids){
   return {async all(){
    if(sql.includes('FROM pvp_decks'))return {results:ids.flatMap(user_id=>cards.map(card=>({...card,user_id})))};
    const power=sql.includes('user_equipment_loadout')?100:sql.includes('user_garage_loadout')?30:20;
    return {results:ids.map(user_id=>({user_id,power}))};
   }};
  }};
 }}};
 const formations=await defense(env,[1,2],{});
 for(const id of [1,2]){const own=await attack(env,id,{});assert.deepEqual(formations.get(id),own);assert.equal(own.matchPower,900160);assert.equal(own.power,900160+mercenaries.get(id).power);assert.equal(own.deckReady,true);}
 assert.deepEqual(calls,[[1,2]]);
});
