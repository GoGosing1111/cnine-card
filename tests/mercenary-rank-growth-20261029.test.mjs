import test from 'node:test';
import assert from 'node:assert/strict';
import {rankedSnapshot as at,rankedTeam,tierCards,roster} from './helpers/mercenary-rank-growth-20261029.mjs';
import {SSS_LIMITED_COMBAT_CODES,mercenaryBattleTier,mercenaryRankGap,mercenaryRankMasteryScale,mercenaryRankBasicCapScale,applyMercenaryRankGrowth,MERCENARY_RANK_GROWTH_DESCRIPTION} from '../shared/mercenary-rank-growth-v1.mjs';
import {growthProbe} from '../scripts/measure-mercenary-growth-roster-20261020.mjs';
import {applyMercenaryCombatLink,mercenaryEffectiveAttack,mercenaryDamageCapHp} from '../shared/mercenary-combat-link-v2103.mjs';
import {mercenaryGrowthMitigationBypass,mercenaryGrowthBasicCapScale,mercenaryGrowthActionCredit,applyMercenaryGrowthMatchups} from '../shared/mercenary-growth-review-v2.mjs';
import {mercenaryBaseActionCredit} from '../functions/_mercenary_combat.js';
import {createPvpBattleV2,createDuoBattleV2} from '../functions/_battle_v2_preview.js';
import {mercenaryCodexDocument} from '../functions/_mercenary_codex.js';
import {MERCENARY_CMS_SEED} from '../functions/_mercenary_cms_seed.js';

test('catalog identity separates every SSS limited and retains SS limited combat rank',()=>{
 for(const code of SSS_LIMITED_COMBAT_CODES)assert.equal(mercenaryBattleTier(rankedTeam(code,1).at(-1)),6,code);
 for(const code of ['V-021','V-057','V-058','V-977','V-984','V-960','V-961'])assert.equal(mercenaryBattleTier(rankedTeam(code,1).at(-1)),5,code);
 assert.equal(mercenaryBattleTier({...rankedTeam('V-058',21).at(-1),edition:'LIMITED',name:'SSS 리미티드',title:'SSS 리미티드'}),5);
 assert.equal(mercenaryBattleTier({rank:'SSS',code:'V-999'}),-1);
 assert.equal(mercenaryBattleTier({isMercenary:true,code:'V-000',rank:'UNKNOWN'}),-1);
});
test('all SSS limited keep a bounded rank advantage over trained lower tiers, applied once',()=>{
 for(const code of SSS_LIMITED_COMBAT_CODES)for(const power of [100,250000,20000000]){
  const teams=[rankedTeam(code,1,'A',power),rankedTeam('V-058',21,'B',power)];
  applyMercenaryCombatLink(teams);const high=teams[0].at(-1),low=teams[1].at(-1),g=high.mercenaryLink.rankGrowth;
  assert.equal(high.mercenaryLink.tierGuard,6,code);assert.equal(high.mercenaryLink.tierOffense,2,code);
  assert.equal(g.attackScale,Math.sqrt(11));assert.equal(g.hpScale,Math.sqrt(10));
  assert.equal(mercenaryDamageCapHp(high),(high.maxHp/g.hpScale+high.mercenaryLink.openingShield)/6);
  assert.equal(low.mercenaryGrowth.total.attackPercent,1000);assert.equal(mercenaryGrowthBasicCapScale(low),Math.sqrt(11));assert.equal(mercenaryGrowthActionCredit([low]),.75);
  const once=structuredClone(teams);applyMercenaryCombatLink(teams);applyMercenaryRankGrowth(teams);assert.deepEqual(teams,once);
 }
});
test('level growth remains monotonic for both sides of the grade gap',()=>{
 for(const code of ['V-999','V-989','V-979'])for(const power of [250000,20000000]){
  let previous=null;
  for(let level=1;level<=21;level++){
   const teams=[rankedTeam(code,level,'A',power),rankedTeam('V-058',21,'B',power)];applyMercenaryCombatLink(teams);
   const actor=teams[0].at(-1),values={attack:mercenaryEffectiveAttack(actor),hp:actor.maxHp,cap:mercenaryGrowthBasicCapScale(actor)*mercenaryRankBasicCapScale(actor)};
   if(previous)for(const k of ['attack','hp','cap'])assert(values[k]>previous[k],`${code} ${level} ${k}`);previous=values;
  }
 }
 for(const code of ['V-001','V-042','V-058','V-984']){
  let previous=null;
  for(const level of [1,5,6,10,11,16,20,21]){
   const teams=[rankedTeam(code,level),rankedTeam('V-999',1,'B')];applyMercenaryCombatLink(teams);
   const a=teams[0].at(-1),values=[mercenaryEffectiveAttack(a),a.maxHp,mercenaryGrowthBasicCapScale(a)];
   if(previous)values.forEach((v,i)=>assert(v>previous[i],`${code} ${level} ${i}`));previous=values;
  }
 }
});
test('grade compensation reaches capped basic hits without extending skill/counter budgets',async()=>{
 const {engine}=await growthProbe(),teams=[rankedTeam('V-999',1),rankedTeam('V-984',21,'B')];applyMercenaryCombatLink(teams);
 const actor={...teams[0].at(-1),attack:1e12},target={...teams[1].at(-1),defense:0},plain={...actor,mercenaryLink:{...actor.mercenaryLink,rankGrowth:undefined}};
 const hit=(a,basic,counter=false)=>engine.hitResult(a,target,()=>.5,1,counter,{basicAttack:basic,damageCapScale:4}).damage;
 assert.equal(mercenaryRankBasicCapScale(actor),Math.sqrt(Math.sqrt(11)));
 assert(Math.abs(hit(actor,true)/hit(plain,true)-Math.pow(11,.25))<.00001);
 assert.equal(hit(actor,false),hit(plain,false));assert.equal(hit(actor,true,true),hit(plain,true,true));
 assert.equal(mercenaryRankBasicCapScale({...actor,battleMode:'PVE'}),1);
 assert.equal(mercenaryRankBasicCapScale(target),1);
});
test('only lower-to-higher mastery is softened; ordinary growth and same-tier mastery remain',()=>{
 const teams=[rankedTeam('V-058',21),rankedTeam('V-999',1,'B')];applyMercenaryCombatLink(teams);
 const low=teams[0].at(-1),high=teams[1].at(-1);
 assert.equal(mercenaryGrowthMitigationBypass(low,high),.125);assert.equal(mercenaryRankMasteryScale(low,high),.25);
 const peer=rankedTeam('V-057',1,'B').at(-1);assert.equal(mercenaryGrowthMitigationBypass(low,peer),.5);
 const higher=rankedTeam('V-999',21).at(-1),lower=rankedTeam('V-058',1,'B').at(-1);applyMercenaryCombatLink([[higher],[lower]]);assert.equal(mercenaryGrowthMitigationBypass(higher,lower),.5);
 applyMercenaryGrowthMatchups(teams,{baseActionCredit:mercenaryBaseActionCredit});
 assert.equal(low.mercenaryGrowthMatchup.opponents[0].rankMasteryScale,.25);assert.equal(high.mercenaryGrowthMatchup.opponents[0].rankMasteryScale,undefined);
 assert.equal(low.gauge,75);assert.equal(mercenaryGrowthActionCredit([low]),.75);
});
test('mixed duo cannot borrow a low-rank companion bonus against an equal-rank opponent',()=>{
 const a=rankedTeam('V-999',1,'A',250000, 'PVP',11),peer=rankedTeam('V-996',1,'B',250000,'PVP',21),low=rankedTeam('V-058',21,'B',250000,'PVP',22),teams=[a,[...peer,...low]];
 assert.equal(mercenaryRankGap(a.at(-1),teams),0);applyMercenaryCombatLink(teams);assert.equal(a.at(-1).mercenaryLink.rankGrowth,undefined);assert.equal(a.at(-1).mercenaryLink.tierGuard,1);
 const args={attackerSquads:[{ownerId:11,cards:tierCards(250000),mercenary:at('V-999',1)},{ownerId:12,cards:tierCards(250000),mercenary:at('V-058',21)}],defenderSquads:[{ownerId:21,cards:tierCards(250000),mercenary:at('V-996',1)},{ownerId:22,cards:tierCards(250000),mercenary:at('V-984',21)}],seed:772719},original=structuredClone(args);
 const b=createDuoBattleV2(args);assert.deepEqual(args,original);assert.equal(b.result.reason,'ELIMINATION');
 for(const team of Object.values(b.teams))for(const actor of team.mercenaries)assert.equal(actor.mercenaryLink.rankGrowth,undefined);
});
test('same tiers, PvE, old snapshots and unrecognized fighters do not opt into the new grade guard',()=>{
 for(const mode of ['PVE','PVP']){
  const teams=[rankedTeam('V-999',21,'A',250000,mode),rankedTeam('V-996',1,'B',250000,mode)];applyMercenaryCombatLink(teams);
  for(const actor of teams.flat().filter(a=>a.isMercenary))assert.equal(actor.mercenaryLink.rankGrowth,undefined);
 }
 const legacy=[rankedTeam('V-999',1),rankedTeam('V-058',21,'B')];for(const a of legacy.flat())if(a.isMercenary)delete a.mercenaryLevel;
 applyMercenaryCombatLink(legacy);assert.equal(legacy[0].at(-1).mercenaryLink.rankGrowth,undefined);assert.equal(legacy[0].at(-1).mercenaryLink.tierGuard,1);
 const codes=['V-017','V-012','V-002','V-001','V-042','V-058','V-999'];
 for(let i=1;i<codes.length;i++){const teams=[rankedTeam(codes[i],1),rankedTeam(codes[i-1],21,'B')];applyMercenaryCombatLink(teams);assert.equal(teams[0].at(-1).mercenaryLink.tierGuard,6,codes[i]);}
});
test('current PvP results preserve inputs and codex discloses the distinct limited tier',()=>{
 const args={attackerCards:tierCards(250000),defenderCards:tierCards(250000),attackerMercenary:at('V-999',1),defenderMercenary:at('V-058',16),seed:91571},original=structuredClone(args);
 const battle=createPvpBattleV2(args);assert.deepEqual(args,original);assert.equal(battle.result.winner,'A');assert.equal(battle.teams.A.mercenaries[0].mercenaryLink.rankGrowth.gap,1);
 const doc=mercenaryCodexDocument({payload_json:JSON.stringify(MERCENARY_CMS_SEED.document),revision:61});
 for(const code of ['V-001','V-042','V-058',...SSS_LIMITED_COMBAT_CODES])assert.equal(doc.cards.find(c=>c.code===code)?.combatLinkDescription.split(MERCENARY_RANK_GROWTH_DESCRIPTION).length,2,code);
 assert.equal(roster.growth.perLevel.attackPercent,25);
});
