import test from 'node:test';import assert from 'node:assert/strict';
import {buildFighter,createPvpBattleV2,createDuoBattleV2,simulateBattleV2Preview} from '../functions/_battle_v2_preview.js';
import {buildMercenaryFighter} from '../functions/_mercenary_combat.js';
import {mercenaryPvpTierGuard,applyMercenaryCombatLink,mercenaryEffectiveAttack} from '../shared/mercenary-combat-link-v2103.mjs';
import {ZERO_PRIME_GENERAL_JOK_PRIORITY,ZERO_ART} from '../shared/mercenary-zero-v1.mjs';
import {PRIME_ART} from '../shared/mercenary-prime-requiem-v1.mjs';
import {GENERAL_JOK_ART} from '../shared/mercenary-general-jok-v1.mjs';
import {snapshot,scenarios} from '../scripts/measure-razak-balance-20261026.mjs';
const fighter=(code,side='A',level=1,gear=0,mode='PVP')=>buildMercenaryFighter(snapshot(code,level,mode,gear),side,mode,buildFighter);
const team=(code,side,level=1,gear=0,powerScale=1)=>[...scenarios[1].cards.map((c,i)=>buildFighter({...c,power:c.power*powerScale},i,side,null,'PVP')),fighter(code,side,level,gear)];

test('only canonical Prime/Zero against all-General-Jok PVP lineups receive priority',()=>{
 for(const code of ['V-975','V-976'])for(const side of ['A','B']){
  const a=fighter(code,side),b=fighter('V-974',side==='A'?'B':'A');assert.equal(mercenaryPvpTierGuard(a,[[a],[b]]),16);
  for(const change of [{code:'V-978',cardId:'V-974',name:'제너럴 족'},{isMercenary:false},{statMode:'CARD'},{battleMode:'PVE'},{hp:0},{alive:false}])assert.equal(mercenaryPvpTierGuard(a,[[a],[{...b,...change}]]),1);
  for(const change of [{code:'V-978',name:'제로'},{isMercenary:false},{hp:0},{battleMode:'PVE'}])assert.equal(mercenaryPvpTierGuard({...a,...change},[[a],[b]]),1);
  const owned={...a,ownerId:1};for(const other of [{...fighter('V-978',b.side),ownerId:3},{...fighter('V-021',b.side),code:'V-001',cardId:'V-001',rank:'C',ownerId:3}])assert.equal(mercenaryPvpTierGuard(owned,[[owned],[{...b,ownerId:2},other]]),1);
 }
 const a=fighter('V-974'),b=fighter('V-975','B');assert.equal(mercenaryPvpTierGuard(a,[[a],[b]]),1);
});

test('post-growth floors cover stronger gear/decks once, preserve injury and never alter cards or General Jok',()=>{
 for(const code of ['V-975','V-976']){
  const teams=[team(code,'A'),team('V-974','B',21,1e8,100)],a=teams[0].at(-1);a.hp=Math.round(a.maxHp/2);const ratio=a.hp/a.maxHp;
  const cards=structuredClone(teams.map(t=>t.slice(0,5))),control=[team('V-978','A'),team('V-974','B',21,1e8,100)];applyMercenaryCombatLink(control);applyMercenaryCombatLink(teams);
  const b=teams[1].at(-1),link=a.mercenaryLink,reference=link.primeZeroGeneralJokPriority.reference;
  assert.deepEqual(teams.map(t=>t.slice(0,5)),cards);assert.deepEqual(b,control[1].at(-1));
  assert.equal(link.tierGuard,16);assert.equal(link.tierOffense,4);assert.equal(link.primeZeroGeneralJokPriority.version,ZERO_PRIME_GENERAL_JOK_PRIORITY.version);
  assert(mercenaryEffectiveAttack(a)>=mercenaryEffectiveAttack(b)*4);assert(a.maxHp>=b.maxHp*16);assert(link.openingShield>=b.maxShield*16*ratio);assert(a.speed>=reference.actionRate*2);assert(a.speed>reference.speed*2);
  assert(Math.abs(a.hp/a.maxHp-ratio)<1e-10);assert.equal(a.basePower,3000000);assert.equal(a.mercenaryLevel.level,1);assert.equal(b.mercenaryLevel.level,21);
  const once=structuredClone(teams);applyMercenaryCombatLink(teams);assert.deepEqual(teams,once);
  b.hp=0;b.speed*=20;a.hp=Math.floor(a.hp/2);const damaged=structuredClone(teams);applyMercenaryCombatLink(teams);assert.deepEqual(teams,damaged,'re-entry must not heal or recalculate priority');
 }
});

test('PVE and other opponents keep normal stats, while existing Razak SS priority remains intact',()=>{
 for(const code of ['V-975','V-976']){
  for(const other of ['V-975','V-976','V-978','V-999','V-058']){const teams=[team(code,'A'),team(other,'B')];applyMercenaryCombatLink(teams);assert.equal(teams[0].at(-1).mercenaryLink.tierGuard,1);assert.equal(teams[0].at(-1).mercenaryLink.primeZeroGeneralJokPriority,undefined);}
  const teams=[team(code,'A'),team('V-974','B')];for(const a of teams.flat())a.battleMode='PVE';applyMercenaryCombatLink(teams);assert.equal(teams[0].at(-1).mercenaryLink.tierGuard,1);assert.equal(teams[0].at(-1).mercenaryLink.primeZeroGeneralJokPriority,undefined);
 }
 assert.equal(mercenaryPvpTierGuard(fighter('V-058'),[[fighter('V-058')],[fighter('V-963','B')]]),16);
 for(const art of [ZERO_ART,PRIME_ART]){assert.match(art.combatLinkDescription,/상대 용병이 모두 제너럴 족/);assert.match(art.combatLinkDescription,/성장·장비/);assert.match(art.combatLinkDescription,/추가 행동/);}
 assert.doesNotMatch(GENERAL_JOK_ART.combatLinkDescription,/상대 용병이 모두 제너럴 족/);
});

test('duo retains owner isolation, supports two General Joks, and disables priority for mixed opponents',()=>{
 const squad=(ownerId,code,multiplier=1)=>({ownerId,cards:scenarios[1].cards.map(c=>({...c,power:c.power*multiplier})),mercenary:snapshot(code,11,'PVP',1e6)});
 const run=(enemy,ally)=>createDuoBattleV2({attackerSquads:[squad(101,'V-975'),squad(102,ally,.1)],defenderSquads:[squad(201,'V-974'),squad(202,enemy,10)],seed:7654321});
 const both=run('V-974','V-976');assert.equal(both.result.winner,'A');
 for(const m of both.teams.A.mercenaries){assert.equal(m.mercenaryLink.primeZeroGeneralJokPriority.opponentIds.length,2);assert.equal(m.mercenaryLink.tierGuard,16);}
 const withOtherAlly=run('V-974','V-978');assert.equal(withOtherAlly.result.winner,'A');assert.equal(withOtherAlly.teams.A.mercenaries.find(m=>m.code==='V-978').mercenaryLink.primeZeroGeneralJokPriority,undefined);
 const mixed=run('V-999','V-976');for(const m of mixed.teams.A.mercenaries)assert.equal(m.mercenaryLink.primeZeroGeneralJokPriority,undefined);
});

test('both sides win team battles and duels even at level 1 against level 21 and 100x opposing cards',()=>{
 let games=0;
 for(const code of ['V-975','V-976'])for(const gap of [1,10,100])for(const side of ['A','B'])for(const seed of [611001,611003,611007,611011]){
  const a=snapshot(code,1,'PVP',0),b=snapshot('V-974',21,'PVP',1e8),own=scenarios[1].cards,enemy=own.map(c=>({...c,power:c.power*gap}));
  const battle=createPvpBattleV2({attackerCards:side==='A'?own:enemy,defenderCards:side==='B'?own:enemy,attackerMercenary:side==='A'?a:b,defenderMercenary:side==='B'?a:b,seed});assert.equal(battle.result.winner,side,code+'/'+gap+'/'+side);
  const teams=[side==='A'?team(code,'A'):team('V-974','A',21,1e8,gap),side==='B'?team(code,'B'):team('V-974','B',21,1e8,gap)];applyMercenaryCombatLink(teams);
  const duel=simulateBattleV2Preview({teamA:[teams[0].at(-1)],teamB:[teams[1].at(-1)],seed,maxActions:300,suddenDeathAfter:240});assert.equal(duel.winner,side);games+=2;
 }
 assert.equal(games,96);
});
