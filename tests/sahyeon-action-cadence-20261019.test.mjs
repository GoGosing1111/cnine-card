import test from 'node:test';
import assert from 'node:assert/strict';
import {createPveBattleV2,createPvpBattleV2,buildPvePlayerTeam,buildMonsterFighter,simulateBattleV2Preview} from '../functions/_battle_v2_preview.js';
import {buildApocalypseLegion} from '../functions/_apocalypse_legion.js';
import {pveDifficultyRuntime} from '../functions/_pve_nightmare.js';
import {limitedDeploymentSnapshot} from '../shared/mercenary-limited-deployment-v1.mjs';
import {sahyeonLiveProfile,SAHYEON} from '../shared/apocalypse-sahyeon-v1.mjs';
import {baselineModule} from '../scripts/measure-apocalypse-grade-balance-20261008.mjs';
import reference from '../preview/apocalypse-sahyeon-20261019-v1/azuma-reference.json' with {type:'json'};
import fixture from './fixtures/mercenary-valter-roster-20261008.json' with {type:'json'};
const before=await baselineModule('d9b645826');
const cards=power=>Array.from({length:5},(_,i)=>({id:'Q'+i,power,power_type:['ATTACK','DEFENSE','SPEED','HP','ATTACK'][i]}));
const mercenary={...limitedDeploymentSnapshot('V-978'),combat:fixture.combat};
const monster=(id=80,overrides={})=>pveDifficultyRuntime({apocalypse:{enabled:true,monsterProfiles:{[id]:{...(id===80?sahyeonLiveProfile(reference.referenceProfile):reference.referenceProfile),...overrides}}}},{id,pve_tab:'APOCALYPSE',is_boss:1}).engineMonster;
const casts=b=>b.result.timeline.filter(e=>e.type==='APOCALYPSE_SKILL');

test('fast Leonel teams no longer finish a living Sahyeon without any boss skill',()=>{
 for(const power of [4e6,2e7,1e8])for(const seed of [83,7,991]){
  const args={cards:cards(power),mercenary,monster:monster(),seed};const old=before.createPveBattleV2(args),fixed=createPveBattleV2(args);
  assert.equal(casts(old).length,0,'confirmed production regression');assert.deepEqual(casts(fixed).map(e=>e.skillCode),SAHYEON.skills.map(s=>s.code));
  assert(casts(fixed)[2].hits.some(h=>h.damage>0),'the ultimate deals server damage');assert.deepEqual(createPveBattleV2(args),fixed);
  assert.deepEqual(fixed.teams,old.teams,'the action fix does not change stats or the initial formation');
 }
});

function durable({interval=4,lastStand=false,suit=false,disabled=false}={}){
 const {simulationTeamA:teamA}=buildPvePlayerTeam({cards:cards(2e7),mercenary:{...mercenary,skills:[]},...(suit?{battleSuit:{code:'BATTLE_SUIT_H',pvePower:7000000}}:{})});
 for(const a of teamA){a.hp=a.maxHp=1e14;a.attack=1;if(!a.isBattleSuit)a.speed=500000;if(lastStand&&!a.isMercenary&&!a.isBattleSuit){a.hp=0;a.alive=false;}}
 const teamB=buildApocalypseLegion(monster(80,{skillEnabled:!disabled}),buildMonsterFighter);
 for(const b of teamB){b.hp=b.maxHp=1e14;b.shield=0;b.maxShield=0;b.attack=1;b.speed=1;}
 return {args:{teamA,teamB,forcedMonsterEvery:interval,maxActions:60,seed:83},leader:teamB[0].id};
}

test('CMS interval and two-action bursts count completed card/mercenary actions, excluding independent support fire',()=>{
 for(const interval of [2,4,6])for(const lastStand of [false,true]){
  const {args,leader}=durable({interval,lastStand,suit:true});const r=simulateBattleV2Preview(args);
  const events=r.timeline.filter(e=>['TURN','APOCALYPSE_SKILL','MERCENARY_LEONEL_AREA'].includes(e.type));let party=0,bursts=0;
  for(const e of events){
   if(e.actorId===leader){if(e.type==='APOCALYPSE_SKILL'&&e.kind==='seal')assert.equal(party,interval);assert(party<=interval,'boss cannot be starved');party=0;bursts++;}
   else if(e.actorId?.startsWith('A:')&&!String(e.actorKind).startsWith('BATTLE_SUIT'))party++;
  }
  assert(bursts>=6);assert.equal(events.filter(e=>e.type==='APOCALYPSE_SKILL').length,3,'opening skills cast once; later turns remain normal attacks');
  const turns=events.filter(e=>!String(e.actorKind).startsWith('BATTLE_SUIT')),first=turns.findIndex(e=>e.actorId===leader);assert.equal(turns[first+1].actorId,leader,'configured two-action burst is preserved');
 }
});

test('disabled skills stay off and defeated bosses cannot receive reserved turns',()=>{
 const {args,leader}=durable({disabled:true});const r=simulateBattleV2Preview(args);assert(!r.timeline.some(e=>e.type==='APOCALYPSE_SKILL'));assert(r.timeline.some(e=>e.actorId===leader&&e.type==='TURN'));
 args.teamB[0].hp=0;args.teamB[0].alive=false;const dead=simulateBattleV2Preview(args);assert(!dead.timeline.some(e=>e.actorId===leader));
});

test('Azuma, other Apocalypse bosses, ordinary PVE and PVP retain their exact server outcomes',()=>{
 for(const id of [75,78,79])for(const power of [1e6,2e7]){
  const args={cards:cards(power),mercenary,monster:monster(id),seed:83};assert.deepEqual(createPveBattleV2(args),before.createPveBattleV2(args));
 }
 const normal={cards:cards(2e7),mercenary,monster:{id:1,battle_power:1e9,is_boss:1},seed:83};assert.deepEqual(createPveBattleV2(normal),before.createPveBattleV2(normal));
 const pvp={attackerCards:cards(2e7),defenderCards:cards(3e7),attackerMercenary:mercenary,seed:83};assert.deepEqual(createPvpBattleV2(pvp),before.createPvpBattleV2(pvp));
});
