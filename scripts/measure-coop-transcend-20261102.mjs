import fs from 'node:fs';
import assert from 'node:assert/strict';
import {createCooperativeBattle} from '../functions/_cooperative_battle.js';
import {currentSquads} from '../tests/helpers/cooperative-current.mjs';
import {reviewSnapshot,PAIRS,REVIEW} from '../tests/helpers/tower-expansion-20261102.mjs';
import {rollCoopRoster} from '../shared/cooperative-roster-v3.mjs';
import {transcendCombat} from './ops/coop-transcend-20261102.mjs';
const path='docs/qa/coop-transcend-20261102/',baseline=JSON.parse(fs.readFileSync(path+'baseline.json'));
const powerMultiplier=Number(process.env.COOP_POWER||60),seeds=Number(process.env.COOP_SEEDS||8),combat=transcendCombat(baseline.combat,{powerMultiplier});
const cohorts=[{name:'VALTER_BLACKJOEUN',codes:PAIRS[2],gear:20000000},{name:'GANGYUN_JOEUN',codes:PAIRS[1],gear:50000000},{name:'HELIOS_BATHORY',codes:PAIRS[3],gear:50000000},{name:'VALTER_BLACKJOEUN_MAX_GEAR',codes:PAIRS[2],gear:100000000}];
const rows=[];
for(const cohort of cohorts)for(const deck of ['BALANCED','CLEANSE'])for(const count of [2,3])for(const level of [16,21])for(const difficulty of ['EXTREME','TRANSCEND']){
 let wins=0;const remaining=[],seconds=[],waves=[];
 const squads=currentSquads({deck,gear:cohort.gear}).slice(0,count).map(({mercenary,...s})=>({...s,mercenaries:reviewSnapshot({codes:cohort.codes,level}).mercenaries}));
 for(let i=1;i<=seeds;i++){
  const seed=i*7919,b=createCooperativeBattle({squads,difficulty,combat,seed,encounter:rollCoopRoster(seed),[REVIEW]:true}).payload.battleV2;
  const units=[...b.teams.A.cards,...b.teams.A.mercenaries];assert.equal(units.length,count*4);assert.equal(new Set(units.map(m=>m.id)).size,units.length);assert.equal(new Set(units.map(m=>m.slot)).size,units.length);
  const win=b.result.winner==='A';wins+=Number(win);if(win)seconds.push(b.result.timeline.at(-1).combatAtMs/1000);
  remaining.push(b.result.final.B.reduce((n,a)=>n+a.hp,0)/Math.max(1,b.result.final.B.reduce((n,a)=>n+a.maxHp,0)));
  waves.push(Math.max(1,...b.result.timeline.filter(e=>e.type==='ENEMY_SPAWN').map(e=>e.wave||1)));
 }
 const mean=a=>a.length?a.reduce((x,y)=>x+y,0)/a.length:null;
 rows.push({cohort:cohort.name,deck,players:count,level,difficulty,seeds,wins,meanClearSeconds:mean(seconds),meanRemainingEnemyHp:mean(remaining),meanReachedWave:mean(waves)});
}
const report={scope:'FIXED_QA_COHORTS_NOT_LIVE_PLAYER_WIN_RATES',readOnlySource:{at:baseline.at,revision:baseline.revision,settingsHash:baseline.settingsHash},cardSource:'20261012 ICON +13 metadata; no pet/avatar or magical cards',twoMercenariesPerOwner:true,upperCombat:combat.difficulties.at(-1),powerMultiplier,cohorts,battles:rows.length*seeds,rows};
fs.writeFileSync(path+'balance-final.json',JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify({battles:report.battles,powerMultiplier,results:rows.filter(r=>r.level===21&&r.deck==='BALANCED').map(({cohort,players,difficulty,wins,seeds,meanClearSeconds,meanReachedWave})=>({cohort,players,difficulty,wins,seeds,meanClearSeconds,meanReachedWave}))}));
