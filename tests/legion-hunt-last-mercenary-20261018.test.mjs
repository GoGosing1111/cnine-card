import test from 'node:test';
import assert from 'node:assert/strict';
import {buildMonsterFighter,buildPvePlayerTeam,simulateBattleV2Preview} from '../functions/_battle_v2_preview.js';
import {limitedDeploymentSnapshot} from '../shared/mercenary-limited-deployment-v1.mjs';
import fixture from './fixtures/mercenary-valter-roster-20261008.json' with {type:'json'};

function lastStand({regionId='coast',suit='BATTLE_SUIT_H',regularAlive=0,lastCardHp,mercenaryAlive=true,hunt=true}={}){
  const cards=Array.from({length:5},(_,i)=>({id:'last-stand-'+i,power:100000,power_type:'ATTACK'}));
  const {simulationTeamA:teamA}=buildPvePlayerTeam({cards,battleSuit:{code:suit,pvePower:7000000},
    mercenary:{...limitedDeploymentSnapshot('V-996'),combat:fixture.combat}});
  for(const card of teamA.filter(c=>!c.isMercenary&&!c.isBattleSuit)){
    card.alive=card.slot<regularAlive;card.hp=card.alive?(lastCardHp??1e12):0;
    card.shield=card.maxShield=0;
    if(card.alive&&lastCardHp!==undefined)card.speed=1e6;
  }
  const mercenary=teamA.find(c=>c.isMercenary);
  mercenary.row='BACK';
  if(!mercenaryAlive){mercenary.hp=0;mercenary.alive=false;}
  const teamB=Array.from({length:12},(_,i)=>({...buildMonsterFighter({id:i+1,battle_power:14000000,
    pve_difficulty:regionId?'LEGION_REGION':'APOCALYPSE',pve_attack_percent:185}),id:'B:'+i,slot:i,
    ...(regionId?{legionRegion:regionId,legionRole:'STRIKER'}:{}),maxHp:1e12,hp:1e12}));
  const args={teamA,teamB,encounterCapacity:12,maxCombatDurationMs:30000,maxActions:6000,
    forcedMonsterEvery:3,seed:7919,...(hunt?{sustainedEncounter:{...(regionId?{regionId}:{}),
      durationMs:300000,templates:teamB,finalBoss:{...teamB[0],isBoss:true}}}:{})};
  return {args,mercenary,result:simulateBattleV2Preview(args)};
}
const monsterTurns=result=>result.timeline.filter(e=>e.type==='TURN'&&e.actorId?.startsWith('B:'));

test('all hunt maps keep attacking the last mercenary with H or SX support alive',()=>{
  for(const regionId of [null,'coast','desert','theatre','viscera','sky'])for(const suit of ['BATTLE_SUIT_H','BATTLE_SUIT_SX']){
    const {result,mercenary}=lastStand({regionId,suit}),turns=monsterTurns(result);
    assert.ok(turns.length>0,`${regionId||'island'} / ${suit}: monsters must act during the 30-second last stand`);
    assert.ok(turns.every(e=>e.targetId===mercenary.id),'the surviving mercenary is the target, never the support suit');
    assert.ok(turns[0].combatAtMs<10000,'a fast mercenary cannot suppress monster turns for tens of seconds');
    assert.ok(turns.some(e=>e.damage>0||e.absorbed>0),'attacks must pass through actual shield/HP damage');
  }
});

test('the monster clock continues after the last regular card falls mid-hunt',()=>{
  const {result,mercenary}=lastStand({regularAlive:1,lastCardHp:1});
  const ko=result.timeline.find(e=>e.type==='KO'&&e.targetId==='A:0:last-stand-0');
  assert.ok(ko,'fixture must lose its last ordinary card');
  const following=monsterTurns(result).find(e=>e.seq>ko.seq);
  assert.ok(following,'monsters resume against the mercenary after the card KO');
  assert.equal(following.targetId,mercenary.id);
  assert.ok(following.combatAtMs-ko.combatAtMs<10000);
});

test('living regular cards retain their existing monster-turn cadence',()=>{
  const {result}=lastStand({regularAlive:5}),first=monsterTurns(result)[0];
  assert.ok(first);
  const earlier=result.timeline.filter(e=>e.seq<first.seq&&e.type==='TURN');
  assert.equal(earlier.filter(e=>e.actorId?.startsWith('A:')&&!e.actorKind).length,2);
  assert.ok(result.timeline.some(e=>e.seq<first.seq&&e.actorKind==='MERCENARY'));
});

test('a support suit alone does not keep a defeated party in combat',()=>{
  const {result}=lastStand({mercenaryAlive:false});
  assert.equal(result.winner,'B');assert.equal(result.reason,'ELIMINATION');
  assert.equal(result.timeline.filter(e=>e.type==='TURN').length,0);
});
