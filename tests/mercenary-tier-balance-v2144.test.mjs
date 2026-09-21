import test from 'node:test';
import assert from 'node:assert/strict';
import {buildFighter,createPvpBattleV2,simulateBattleV2Preview} from '../functions/_battle_v2_preview.js';
import {buildMercenaryFighter,mercenaryCombat,mercenaryTurnCadence,MERCENARY_SKILL_CAP_SCALE} from '../functions/_mercenary_combat.js';
import {MERCENARY_COMBAT_LINK,applyMercenaryCombatLink,mercenaryPvpTierGuard,mercenaryDamageCapHp} from '../shared/mercenary-combat-link-v2103.mjs';
import {fixture,operatingMercenaries as roster,tierCards,tierDecks} from './helpers/mercenary-operating-roster-v2144.mjs';
const snapshot=code=>roster.find(c=>c.code===code);
const fighter=(code,side='A',mode='PVP')=>buildMercenaryFighter(snapshot(code),side,mode,buildFighter);
const linked=(code,side='A',mode='PVP')=>[...tierCards(20000000).map((c,i)=>buildFighter(c,i,side,null,mode)),fighter(code,side,mode)];

test('upper-tier durability is frozen, finite and excludes PVE, equal ranks, absent/dead opponents and ordinary cards',()=>{
 const a=linked('V-011'),b=linked('V-037','B'),before=structuredClone([a,b]);
 applyMercenaryCombatLink([a,b]);const low=a.at(-1),high=b.at(-1);
 assert.equal(low.mercenaryLink.tierGuard,1);assert.equal(high.mercenaryLink.tierGuard,1+MERCENARY_COMBAT_LINK.pvpTierGuardPerStep);
 assert.equal(mercenaryDamageCapHp(high),(high.maxHp+high.mercenaryLink.openingShield)/high.mercenaryLink.tierGuard);
 for(const [index,team] of [a,b].entries()){
  assert.deepEqual(team.slice(0,5),before[index].slice(0,5));
  for(const key of ['power','basePower','attack','defense','speed'])assert.equal(team.at(-1)[key],before[index].at(-1)[key]);
 }
 const fixed=structuredClone(high);low.hp=0;low.alive=false;applyMercenaryCombatLink([a,b]);assert.deepEqual(high,fixed);
 for(const [ac,bc,mode] of [['V-037','V-044','PVP'],['V-011','V-037','PVE']]){
  const teams=[linked(ac,'A',mode),linked(bc,'B',mode)];applyMercenaryCombatLink(teams);assert.ok(teams.every(t=>t.at(-1).mercenaryLink.tierGuard===1));
 }
 for(const opponents of [[],[{...fighter('V-011','B'),hp:0}],[{...fighter('V-011','B'),isMercenary:false}],[{...fighter('V-011','B'),rank:'A'}]])assert.equal(mercenaryPvpTierGuard(fighter('V-037'),[opponents]),1);
});

test('front-row PVP compensation is rank-aware while PVE uses its unchanged sixty-percent bonus',()=>{
 for(const [code,rank] of [['V-011','S'],['V-010','SS'],['V-021','SSS']])for(const mode of ['PVE','PVP']){
  const team=linked(code,'A',mode),average=team.slice(0,5).reduce((sum,c)=>sum+c.maxHp,0)/5;
  applyMercenaryCombatLink([team]);const bonus=mode==='PVE'?60:MERCENARY_COMBAT_LINK.pvpFrontRowShieldBonusByRank[rank];
  assert.equal(team.at(-1).shield,Math.round(average*(MERCENARY_COMBAT_LINK.ranks[rank].shieldPercent+bonus)/100));
 }
});

test('a last-standing PVP mercenary responds to regular enemy turns without recursion, extra regular turns or PVE changes',()=>{
 for(const mode of ['PVP','PVE']){
  const m=fighter('V-037','A',mode),ally={side:'A',hp:1,alive:true},enemy={side:'B',hp:1,alive:true};
  const cadence=mercenaryTurnCadence({A:[ally,m],B:[enemy]});
  cadence.acted(enemy);assert.equal(cadence.pending(),null);
  ally.hp=0;cadence.acted(enemy);assert.equal(cadence.pending(),mode==='PVP'?m:null);
  cadence.acted(m);assert.equal(cadence.pending(),null);cadence.acted(m);assert.equal(cadence.pending(),null);
  cadence.acted({...enemy,isMercenary:true});cadence.acted({...enemy,isBattleSuit:true});assert.equal(cadence.pending(),null);
  m.hp=0;cadence.acted(enemy);assert.equal(cadence.pending(),null);
 }
});

function skillHarness(code,{veil=0,mode='PVP',targetCount=1}={}){
 const actor=fighter(code,'A',mode),targets=Array.from({length:targetCount},(_,i)=>({...buildFighter({id:'target-'+i,power:1000000000},i,'B',null,mode),hp:1e12,maxHp:1e12,shield:0,alive:true}));
 const rolls=[],runtime=mercenaryCombat({teams:{A:[actor],B:targets},hit:(a,t,ratio,options)=>{rolls.push({ratio,...options});return {dodge:false,damage:100};},damage:(t,n)=>{t.hp-=n;return {hpDamage:n,absorbed:0};},knockout(){},emit(){},clock:()=>0});
 if(veil)runtime.debuffs.set(actor.id,{veil:{percent:veil}});
 return {actor,runtime,rolls,turn(){actor.actions++;return runtime.beforeAction(actor);}};
}

test('Mangisa sends the configured per-cast cap through all six bullets and never receives six full caps',()=>{
 const h=skillHarness('V-045');h.turn();assert.equal(h.rolls.length,6);
 assert.ok(h.rolls.every(r=>Math.abs(r.capScale-r.castShare*MERCENARY_SKILL_CAP_SCALE['MS-045'])<1e-10));
 assert.ok(Math.abs(h.rolls.reduce((sum,r)=>sum+r.capScale,0)-.8*MERCENARY_SKILL_CAP_SCALE['MS-045'])<1e-10);
 assert.equal(h.runtime.state(h.actor).energy,75);assert.equal(h.runtime.state(h.actor).cooldown.get('MS-045'),6);
});

test('PVP suppression scales the actual cap and every contact of one cast, including custom volleys and multi-action bursts',()=>{
 for(const [code,turns] of [['V-044',1],['V-045',1],['V-046',1],['V-037',3],['V-036',1]]){
  const normal=skillHarness(code),veiled=skillHarness(code,{veil:25});
  for(let i=0;i<turns;i++){normal.turn();veiled.turn();}
  assert.equal(veiled.rolls.length,normal.rolls.length);
  for(const [i,r] of normal.rolls.entries()){
   assert.ok(Math.abs(veiled.rolls[i].ratio-r.ratio*.75)<1e-10,code+' raw');
   assert.ok(Math.abs(veiled.rolls[i].capScale-r.capScale*.75)<1e-10,code+' cap');
  }
  assert.equal(veiled.runtime.debuffs.get(veiled.actor.id).veil,undefined);
 }
 const pve=skillHarness('V-044',{mode:'PVE',veil:25}),plain=skillHarness('V-044',{mode:'PVE'});pve.turn();plain.turn();assert.equal(pve.rolls[0].capScale,plain.rolls[0].capScale);
 const support=skillHarness('V-011',{veil:25});support.turn();assert.equal(support.runtime.debuffs.get(support.actor.id).veil.percent,25);support.runtime.basicMultiplier(support.actor);assert.equal(support.runtime.debuffs.get(support.actor.id).veil.percent,25);
});

test('the real PVP damage engine reduces capped offensive damage after Adeline suppression',()=>{
 const run=percent=>{
  const a=linked('V-037'),b=linked('V-044','B');a.at(-1).combat={...a.at(-1).combat,veilPercent:percent};applyMercenaryCombatLink([a,b]);
  const result=simulateBattleV2Preview({teamA:[a.at(-1)],teamB:[b.at(-1)],seed:7919,maxActions:83,suddenDeathAfter:64});
  const debuff=result.timeline.find(e=>e.type==='MERCENARY_DEBUFF'&&e.effect==='OFFENSIVE_SKILL_ONLY');assert.ok(debuff);
  const hit=result.timeline.find(e=>e.seq>debuff.seq&&e.actorId===debuff.targetId&&e.type==='MERCENARY_HIT');assert.ok(hit);return hit.damage+(hit.absorbed||0);
 };
 assert.ok(Math.abs(run(25)-run(0)*.75)<=1);
});

test('all current S/SS/SSS pairs preserve grade order with equal five-card support across power, type, side and independent seeds',()=>{
 const ranks={S:0,SS:1,SSS:2};let games=0;
 for(const low of roster)for(const high of roster.filter(c=>ranks[c.rank]>ranks[low.rank]))for(const power of [1000000,20000000,100000000,2000000000])for(const types of Object.values(tierDecks))for(const side of ['A','B'])for(let n=401;n<409;n++){
  const cards=tierCards(power,types),result=createPvpBattleV2({attackerCards:cards,defenderCards:cards,attackerMercenary:side==='A'?low:high,defenderMercenary:side==='B'?low:high,seed:n*7919,singleHealerBonus:fixture.singleHealerBonus}).result;
  assert.notEqual(result.winner,side,`${low.code} must not beat ${high.code}: ${power}/${types}/${side}/${n}`);games++;
 }
 assert.equal(games,25600);
});

test('Ragniel retains a measured 60-65% aggregate advantage over Omega on two disjoint seed sets without an outcome override',()=>{
 for(const start of [1,1001]){let wins=0,games=0;
  for(const power of [1000000,20000000,100000000,2000000000])for(const types of Object.values(tierDecks))for(const side of ['A','B'])for(let n=start;n<start+128;n++){
   const cards=tierCards(power,types),result=createPvpBattleV2({attackerCards:cards,defenderCards:cards,attackerMercenary:snapshot(side==='A'?'V-046':'V-021'),defenderMercenary:snapshot(side==='B'?'V-046':'V-021'),seed:n*7919,singleHealerBonus:fixture.singleHealerBonus}).result;
   wins+=Number(result.winner===side);games++;
  }
  assert.ok(wins/games>=.60&&wins/games<=.65,`${start}: ${wins}/${games}`);
 }
});

test('linked isolated upper-rank mercenaries also preserve rank order without regular-card damage',()=>{
 const ranks={S:0,SS:1,SSS:2};let games=0;
 for(const low of roster)for(const high of roster.filter(c=>ranks[c.rank]>ranks[low.rank]))for(const power of [1000000,20000000,100000000,2000000000])for(const types of Object.values(tierDecks))for(const side of ['A','B'])for(let n=701;n<705;n++){
  const cards=tierCards(power,types),teams=[side==='A'?low:high,side==='B'?low:high].map((m,i)=>{const teamSide=i?'B':'A';return [...cards.map((c,k)=>buildFighter(c,k,teamSide,null,'PVP')),buildMercenaryFighter(m,teamSide,'PVP',buildFighter)];});
  applyMercenaryCombatLink(teams);
  const result=simulateBattleV2Preview({teamA:[teams[0].at(-1)],teamB:[teams[1].at(-1)],seed:n*7919,maxActions:83,suddenDeathAfter:64,healerPenalty:true,singleHealerBonus:fixture.singleHealerBonus});
  assert.notEqual(result.winner,side,`${low.code} isolated vs ${high.code}: ${power}/${types}/${side}/${n}`);games++;
 }
 assert.equal(games,12800);
});
