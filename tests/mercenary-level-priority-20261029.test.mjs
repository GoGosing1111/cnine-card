import test from 'node:test';
import assert from 'node:assert/strict';
import {rankedSnapshot as at,rankedTeam,tierCards} from './helpers/mercenary-rank-growth-20261029.mjs';
import {mercenaryRankRetention,mercenaryRankMasteryScale,mercenaryRankBasicCapScale} from '../shared/mercenary-rank-growth-v1.mjs';
import {applyMercenaryCombatLink} from '../shared/mercenary-combat-link-v2103.mjs';
import {createPvpBattleV2} from '../functions/_battle_v2_preview.js';
import {simulateRankedSeries} from '../shared/ranked-series-v1.mjs';
import {simulateTerritoryDuel,__territoryLoadoutTest as territory} from '../functions/_territory_war.js';

test('grade bonus fades continuously to zero at a ten-level disadvantage',()=>{
 for(const gap of [0,1,4,5,9,10,11,16,20]){
  const teams=[rankedTeam('V-979',1),rankedTeam('V-058',1+gap,'B')],upper=teams[0].at(-1),lower=teams[1].at(-1),retained=Math.max(0,1-gap/10);
  assert.equal(mercenaryRankRetention(upper,teams),retained);
  assert.equal(mercenaryRankMasteryScale(lower,upper),1-.75*retained);
  applyMercenaryCombatLink(teams);
  assert.equal(upper.mercenaryLink.tierGuard,1+5*retained);
  assert.equal(upper.mercenaryLink.tierOffense,1+retained);
  if(gap>=10){assert.equal(upper.mercenaryLink.rankGrowth,undefined);assert.equal(mercenaryRankBasicCapScale(upper),1);}
 }
});

test('a low-level duo companion cannot restore the grade bonus against a trained opponent',()=>{
 const a=rankedTeam('V-979',5,'A',250000,'PVP',1),b=rankedTeam('V-058',21,'B',250000,'PVP',2),c=rankedTeam('V-057',1,'B',250000,'PVP',3),teams=[a,[...b,...c]];
 applyMercenaryCombatLink(teams);
 assert.equal(a.at(-1).mercenaryLink.tierGuard,1);
 assert.equal(a.at(-1).mercenaryLink.rankGrowth,undefined);
 assert.equal(mercenaryRankMasteryScale(b.at(-1),a.at(-1)),1);
 assert.equal(mercenaryRankMasteryScale(c.at(-1),a.at(-1)),.25);
});

test('Razak Lv21 defeats Jokro Lv5 with equal decks on either side and independent seeds',()=>{
 for(const power of [250000,20000000])for(const side of ['A','B'])for(let n=0;n<12;n++){
  const args={attackerCards:tierCards(power),defenderCards:tierCards(power),attackerMercenary:at(side==='A'?'V-058':'V-979',side==='A'?21:5),defenderMercenary:at(side==='B'?'V-058':'V-979',side==='B'?21:5),seed:9121103+n*104729},saved=structuredClone(args);
  const b=createPvpBattleV2(args);
  assert.equal(b.result.winner,side,`${power}/${side}/${n}`);assert.equal(b.result.reason,'ELIMINATION');assert.deepEqual(args,saved);
 }
});

test('ranked series carries the trained level into each fresh battle and keeps ordinary settlement rules',()=>{
 const args={createBattle:createPvpBattleV2,options:{attackerCards:tierCards(250000),defenderCards:tierCards(250000)},attackerMercenaries:[at('V-058',21),at('V-057',21),at('V-984',21)],defenderMercenaries:[at('V-979',5),at('V-972',5),at('V-987',5)],seed:9121103};
 const result=simulateRankedSeries(args);
 const first=result.rounds[0].battleV2;
 assert.equal(first.result.winner,'A');assert.equal(first.teams.A.mercenaries[0].mercenaryLevel.level,21);assert.equal(first.teams.B.mercenaries[0].mercenaryLevel.level,5);
 assert.equal(first.teams.B.mercenaries[0].mercenaryLink.tierGuard,1);
 assert.equal(result.score[result.winner],2);assert(result.rounds.length>=2&&result.rounds.length<=3);
});

test('territory uses the same level rules and a changed replay never replaces an already settled result',async()=>{
 const cards=tierCards(250000),mine={round_id:1,user_id:1,side:'A',currentCards:cards,deck_power:1250000,loadout_bonus_json:JSON.stringify({mercenary:at('V-058',21)})},opponent={...mine,user_id:2,side:'B',loadout_bonus_json:JSON.stringify({mercenary:at('V-979',5)})};
 const deps={battleSettings:async()=>({}),createPvpBattleV2},saved=structuredClone({mine,opponent});
 const duel=await simulateTerritoryDuel({},deps,{id:1},mine,opponent,'LEVEL:QA',9121103);
 assert.equal(duel.battleV2.result.winner,'A');assert.equal(duel.battleV2.teams.A.mercenaries[0].mercenaryLevel.level,21);assert.equal(duel.battleV2.teams.B.mercenaries[0].mercenaryLevel.level,5);
 assert.deepEqual(duel.battleV2,createPvpBattleV2(duel.replayInput));assert.deepEqual({mine,opponent},saved);
 const receipt={attackerWon:false,damage:900};
 assert.equal(await territory.hydrateBattleReplay({},deps,{}, {battle_meta_json:JSON.stringify({replayInput:duel.replayInput})},receipt),receipt);
});
