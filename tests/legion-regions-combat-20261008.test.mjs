import test from 'node:test';
import assert from 'node:assert/strict';
import {createHuntSession} from '../preview/sustained-hunt-v2/session.mjs';
import {profiles,legionBalanceSnapshot} from '../scripts/measure-legion-regions-20261008.mjs';
import {LEGION_REGIONS,regionEquipmentEffects} from '../shared/legion-regions-v1.mjs';
import {buildPvePlayerTeam} from '../functions/_battle_v2_preview.js';
import {equipmentAfterBasic,applyPveEquipmentGrowth} from '../shared/equipment-combat-growth-v1.mjs';
test('all five regions expose their actual boss mechanics on the canonical 15-minute timeline',()=>{
  for(const region of LEGION_REGIONS){
    const s=createHuntSession({snapshot:legionBalanceSnapshot(profiles.at(-1)),regionId:region.id,difficulty:'calamity',seed:7919});
    const events=s.payload.battleV2.result.timeline,spawn=events.find(e=>e.finalBoss),patterns=events.filter(e=>e.type==='LEGION_PATTERN');
    assert.equal(spawn.combatAtMs,780000);assert.ok(patterns.length>=3,region.id);assert.ok(events.every(e=>e.combatAtMs<=900000));
    assert.ok(s.payload.continuousEncounter.instances.every(i=>i.battleSprite.includes('/'+region.id+'/')));
    const shots=events.filter(e=>e.type==='TURN'&&e.actorKind==='BATTLE_SUIT');
    assert.ok(shots.length>500);for(let i=1;i<shots.length;i++)assert.ok(shots[i].combatAtMs-shots[i-1].combatAtMs>=374,'SX shots must not bunch when the party shrinks');
  }
});
test('tier increase cannot turn into a burst-fire reward and weak decks fail upper tiers',()=>{
  for(const p of [profiles[0],profiles[3],profiles.at(-1)]){
    const run=difficulty=>createHuntSession({snapshot:legionBalanceSnapshot(p),regionId:'coast',difficulty,seed:7919});
    const low=run('inferno'),high=run('calamity');
    const kills=s=>s.payload.battleV2.result.timeline.filter(e=>e.huntKill).length;
    assert.ok(kills(high)<=kills(low),p.id);
    if(p.id==='H')assert.equal(high.exportState().outcome.winner,'B');
  }
});
test('2/4 sets, unique mixing, unequip and leech budgets change only explicit PVE equipment runtime',()=>{
  const fx=regionEquipmentEffects(['HUNT_COAST_TOP','HUNT_COAST_BOTTOM','HUNT_COAST_SHOES','HUNT_COAST_ACCESSORY','HUNT_DESERT_UNIQUE']);
  assert.equal(fx.effects.hpPercent,8);assert.equal(fx.effects.bossDamagePercent,8);assert.equal(fx.sets[0].active,4);
  const mixed=regionEquipmentEffects(['HUNT_COAST_TOP','HUNT_COAST_BOTTOM','HUNT_DESERT_WEAPON','HUNT_DESERT_SHOES']);assert.equal(mixed.sets.length,2);assert.equal(mixed.effects.shieldPercent,undefined);
  const snapshot=legionBalanceSnapshot(profiles[0]);
  const base=buildPvePlayerTeam({cards:snapshot.cards,characterBonus:snapshot.cardSupportBonus});
  const grown=buildPvePlayerTeam({cards:snapshot.cards,characterBonus:snapshot.cardSupportBonus,pveEquipmentRuntime:fx});
  assert.ok(grown.teamA[0].maxHp>base.teamA[0].maxHp);assert.ok(grown.teamA[0].shield>base.teamA[0].shield);
  assert.deepEqual(buildPvePlayerTeam({cards:snapshot.cards,characterBonus:snapshot.cardSupportBonus}),base);
  const pvp={battleMode:'PVP',attack:10,maxHp:100,hp:100,speed:10,shield:0,maxShield:0};assert.deepEqual(applyPveEquipmentGrowth([structuredClone(pvp)],fx)[0],pvp);
  const actor={hp:1,maxHp:10000,equipmentEffects:{leechPercent:5},damageDealt:0};let healed=0;
  for(let i=0;i<100;i++)equipmentAfterBasic(actor,{hp:1},1e9,{emit:(_type,e)=>{healed+=e.amount;assert.ok(e.amount<=150);},damage:()=>{},knockout:()=>{}});
  assert.equal(healed,2500);assert.equal(actor.hp,2501);
});
