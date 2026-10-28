import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {ASCENDANT_EQUIPMENT,ASCENDANT_EQUIPMENT_SETS,ASCENDANT_POWER_BASELINE,ascendantEquipmentEffects} from '../shared/mercenary-ascendant-equipment-v1.mjs';
import {MERCENARY_EQUIPMENT_CODES,isMercenaryEquipment,mercenaryPvpEquipmentEffects,mercenaryEquipmentPower} from '../shared/mercenary-equipment-v1.mjs';
import {REGION_EQUIPMENT} from '../shared/legion-regions-v1.mjs';
import {normalizedEquipmentEffects} from '../shared/equipment-combat-growth-v1.mjs';
import {applyMercenaryCombatLink,mercenaryEffectiveAttack} from '../shared/mercenary-combat-link-v2103.mjs';
import {ascendantEquipmentFixture} from './helpers/ascendant-equipment-db.mjs';
import {saveMercenaryEquipment,mercenaryEquipmentState,mercenaryEquipmentRuntimes} from '../functions/_mercenary_equipment.js';
import {releasedMercenarySnapshot} from '../functions/_mercenary_account.js';
import {equipmentGrowthRuntime,polishStateKey} from '../functions/_equipment_growth.js';
import {forgeEquipmentBonus} from '../functions/_equipment_forge_transactions.js';
import {forgePower} from '../shared/equipment-forge-policy-v1.mjs';
import {buildMercenaryFighter} from '../functions/_mercenary_combat.js';
import {buildFighter,createPveBattleV2,createPvpBattleV2,createDuoBattleV2,simulateBattleV2Preview} from '../functions/_battle_v2_preview.js';
const gear=tier=>ASCENDANT_EQUIPMENT.filter(item=>item.tier===tier);
const snapshotGear=(tier,mode)=>({schemaVersion:1,mode,revision:1,items:gear(tier),power:gear(tier).reduce((sum,item)=>sum+item[mode==='PVE'?'pvePower':'pvpPower'],0),effects:ascendantEquipmentEffects(gear(tier).map(i=>i.code),mode).effects});
const cards=Array.from({length:5},(_,i)=>({id:String(i+1),title:'장비 검수',rarity:'FUR',power:100000,power_type:'ATTACK'}));

test('all 50 pieces preserve the mercenary slot ratio, exceed existing unique pieces, and increase at every tier',async()=>{
 assert.deepEqual(ASCENDANT_POWER_BASELINE,{WEAPON:200000,TOP:140000,BOTTOM:130000,SHOES:100000,ACCESSORY:120000});
 assert.equal(ASCENDANT_EQUIPMENT.length,50);assert.equal(new Set(MERCENARY_EQUIPMENT_CODES).size,80);
 for(const code of ['ARDEN_TOP','ARDEN_BOTTOM','EMPEROR_TOP','EMPEROR_DUAL_DISK'])assert.equal(isMercenaryEquipment(code),false);
 for(const item of ASCENDANT_EQUIPMENT){
  const previous=item.tier===1?Math.max(...REGION_EQUIPMENT.filter(i=>i.slot===item.slot).map(i=>i.totalPower)):gear(item.tier-1).find(i=>i.slot===item.slot).totalPower;
  assert.ok(item.totalPower>previous,item.code);assert.equal(item.pvePower+item.pvpPower,item.totalPower);assert.equal(item.pvpPower,item.totalPower/10);
  assert.equal(item.totalPower/ASCENDANT_POWER_BASELINE[item.slot],ASCENDANT_EQUIPMENT_SETS[item.tier-1].powerScalePercent/100);
  assert.ok((await fs.stat(new URL('..'+item.image,import.meta.url))).size>10000,item.image);
 }
 assert.deepEqual(ASCENDANT_EQUIPMENT_SETS.map(set=>set.totalPower),[1207500,1380000,1552500,1725000,1897500,2070000,2415000,2760000,3105000,3450000]);
});

test('2/4/5 thresholds accumulate equally in PVE/PVP, remain below combat caps, and strictly improve by tier',()=>{
 for(const set of ASCENDANT_EQUIPMENT_SETS)for(const count of [0,1,2,3,4,5]){
  const codes=gear(set.tier).slice(0,count).map(i=>i.code),expected={...(count>=2?set.two:{}),...(count>=4?set.four:{}),...(count>=5?set.five:{})};
  for(const mode of ['PVE','PVP']){
   const actual=ascendantEquipmentEffects(codes,mode);assert.deepEqual(actual.effects,expected);assert.deepEqual(ascendantEquipmentEffects([...codes,...codes],mode),actual);
   for(const [key,value] of Object.entries(actual.effects))assert.equal(normalizedEquipmentEffects(actual.effects)[key],value);
  }
 }
 for(let i=1;i<10;i++)for(const threshold of ['two','four','five'])for(const key of Object.keys(ASCENDANT_EQUIPMENT_SETS[i][threshold]))assert.ok(ASCENDANT_EQUIPMENT_SETS[i][threshold][key]>ASCENDANT_EQUIPMENT_SETS[i-1][threshold][key]);
 const mixed=[...gear(1).slice(0,2),...gear(10).slice(2,4),gear(3)[4]].map(i=>i.code),mix=ascendantEquipmentEffects(mixed,'PVP');
 assert.equal(mix.sets.length,2);assert.deepEqual(mix.effects,{attackPercent:34,hpPercent:38});assert.equal(normalizedEquipmentEffects(mix.effects).attackPercent,30);
 assert.deepEqual(ascendantEquipmentEffects(gear(10).map(i=>i.code),'INVALID').effects,{});
});

test('PVP derives only authorized catalog sets, ignoring forged effects, character gear, duplicates and wrong slots',()=>{
 const equipment={...snapshotGear(10,'PVP'),effects:{attackPercent:99999,bossDamagePercent:40,leechPercent:5}};
 assert.deepEqual(mercenaryPvpEquipmentEffects(equipment),{...ASCENDANT_EQUIPMENT_SETS[9].two,...ASCENDANT_EQUIPMENT_SETS[9].four,...ASCENDANT_EQUIPMENT_SETS[9].five});
 assert.deepEqual(mercenaryPvpEquipmentEffects({...equipment,items:gear(10).map(i=>({...i,slot:'INVALID'}))}),{});
 assert.deepEqual(mercenaryPvpEquipmentEffects({...equipment,items:[...REGION_EQUIPMENT,{code:'ARDEN_TOP',slot:'TOP'}]}),{});
 assert.deepEqual(mercenaryPvpEquipmentEffects({...equipment,mode:'PVE'}),{});
 assert.deepEqual(mercenaryPvpEquipmentEffects({...equipment,items:[]}),{});
 assert.deepEqual(mercenaryPvpEquipmentEffects({...equipment,items:Array(5).fill(gear(10)[0])}),{});
});

for(const postgres of [false,true])test(`${postgres?'PostgreSQL':'SQLite'}: owned first/last tier gear, independent modes, polish isolation and ordinary-character exclusion`,async t=>{
 const f=await ascendantEquipmentFixture(t,{postgres}),coins=await f.coin();
 for(const tier of [1,10])for(const mode of ['PVE','PVP'])for(const item of gear(tier))await f.equip(mode,item);
 let state=await mercenaryEquipmentState(f.env,f.user);
 assert.equal(state.catalog.length,80);assert.equal(state.regions.length,15);assert.equal(state.regions.at(-1).five.shieldPercent,25);
 for(const mode of ['PVE','PVP']){
  const loadout=state.loadouts[mode];assert.equal(loadout.power,mode==='PVE'?3105000:345000);assert.equal(loadout.sets[0].active,5);assert.deepEqual(loadout.effects,snapshotGear(10,mode).effects);
  const snapshot=await releasedMercenarySnapshot(f.env,f.user,mode);assert.equal(snapshot.equipment.mode,mode);assert.equal(snapshot.equipment.power,loadout.power);
 }
 const weapon=f.instances.get(gear(10)[0].code);
 await f.setting(polishStateKey(weapon,7),{schemaVersion:1,userId:7,instanceId:weapon,attempts:10,levels:[10,0,0,0,0],values:[5,0,0,0,0]});
 await f.p('INSERT INTO equipment_forge_states_v1 VALUES(?,7,10,1)',Number(weapon)).run();
 state=await mercenaryEquipmentState(f.env,f.user);
 assert.equal(state.loadouts.PVE.effects.attackPercent,31);assert.equal(state.loadouts.PVP.effects.attackPercent,26);
 assert.equal(state.loadouts.PVP.power,345000+forgePower(1000000,10).pvp-100000);
 await f.p("INSERT INTO user_equipment_loadout(user_id,slot,instance_id) VALUES(7,'WEAPON',?)",Number(weapon)).run();
 assert.deepEqual(await forgeEquipmentBonus(f.env,7),{pve:0,pvp:0});assert.deepEqual((await equipmentGrowthRuntime(f.env,7)).effects,{});
 await f.p('UPDATE user_equipment_instances SET user_id=8 WHERE id=?',Number(weapon)).run();
 assert.equal((await mercenaryEquipmentRuntimes(f.env,[7],'PVP')).get(7).sets[0].active,4);
 assert.equal((await mercenaryEquipmentRuntimes(f.env,[7],'PVP')).get(7).effects.damageReductionPercent,undefined);
 await assert.rejects(saveMercenaryEquipment(f.env,f.user,{requestId:crypto.randomUUID(),mode:'PVP',slot:'WEAPON',instanceId:weapon,revision:10}),{code:'MERCENARY_EQUIPMENT_OWNERSHIP'});
 assert.equal(await f.coin(),coins);
});

test('all tiers produce higher PVE/PVP stats and actual combat payloads without applying personal set effects to ordinary cards',async t=>{
 const f=await ascendantEquipmentFixture(t),base=await releasedMercenarySnapshot(f.env,f.user,'PVE');
 for(const mode of ['PVE','PVP']){
  let previous;
  for(let tier=1;tier<=10;tier++){
   const snapshot={...base,equipment:snapshotGear(tier,mode)},fighter=buildMercenaryFighter(snapshot,'A',mode,buildFighter);
   assert.equal(mercenaryEquipmentPower(snapshot,mode),snapshot.equipment.power);
   assert.equal(fighter.equipmentEffects.shieldPercent,ASCENDANT_EQUIPMENT_SETS[tier-1].five.shieldPercent);
   if(previous)for(const key of ['power','attack','maxHp','shield','speed'])assert.ok(fighter[key]>previous[key],`${mode} tier ${tier} ${key}`);
   previous=fighter;
   const battle=mode==='PVE'?createPveBattleV2({cards,mercenary:snapshot,monster:{id:1,name:'검수',battle_power:10000000},seed:12}):createPvpBattleV2({attackerCards:cards,defenderCards:cards,attackerMercenary:snapshot,defenderMercenary:base,seed:12});
   // PVP's existing whole-formation power advantage is intentional. Hold that
   // power constant when checking that personal set effects do not buff cards.
   const powerOnly={...base,equipment:{...snapshot.equipment,items:[],effects:{}}};
   const bare=mode==='PVE'?createPveBattleV2({cards,mercenary:base,monster:{id:1,name:'검수',battle_power:10000000},seed:12}):createPvpBattleV2({attackerCards:cards,defenderCards:cards,attackerMercenary:powerOnly,defenderMercenary:base,seed:12});
   assert.deepEqual(battle.teams.A.cards,bare.teams.A.cards);
   assert.ok(battle.teams.A.mercenaries[0].maxHp>bare.teams.A.mercenaries[0].maxHp);assert.ok(battle.result.timeline.length>0);
  }
 }
 const pvp={...base,equipment:snapshotGear(10,'PVP')},strong=cards.map((c,i)=>buildFighter({...c,power:100000000},i,'A',null,'PVP'));
 const armed=buildMercenaryFighter(pvp,'A','PVP',buildFighter),unarmed=buildMercenaryFighter(base,'A','PVP',buildFighter);
 applyMercenaryCombatLink([[...structuredClone(strong),armed]]);applyMercenaryCombatLink([[...structuredClone(strong),unarmed]]);
 assert.ok(mercenaryEffectiveAttack(armed)>mercenaryEffectiveAttack(unarmed));assert.equal(armed.mercenaryLink.hpFloor,Math.round((unarmed.mercenaryLink.hpFloor+armed.equipmentStats.hp)*1.28));
 assert.equal(armed.shield-armed.mercenaryLink.openingShield,Math.round(armed.maxHp*.25));
 const once=structuredClone(armed);applyMercenaryCombatLink([[...strong,armed]]);assert.deepEqual(armed,once);
 const squad=(ownerId,mercenary)=>({ownerId,cards:cards.map((c,i)=>({...c,rarity:['FUR','FUR','ZENITH','ZENITH','SUPERSTAR'][i]})),mercenary}),duo=createDuoBattleV2({attackerSquads:[squad(7,pvp),squad(8,base)],defenderSquads:[squad(9,base),squad(10,base)],seed:12});
 const own=duo.teams.A.mercenaries;assert.ok(own.find(m=>m.ownerId===7).maxHp>own.find(m=>m.ownerId===8).maxHp);
});

test('actual PVP hit resolution honors new damage reduction and critical damage',async t=>{
 const f=await ascendantEquipmentFixture(t),base=await releasedMercenarySnapshot(f.env,f.user,'PVP');
 const attacker=buildMercenaryFighter({...base,equipment:snapshotGear(10,'PVP')},'A','PVP',buildFighter),defender=buildMercenaryFighter({...base,equipment:snapshotGear(10,'PVP')},'B','PVP',buildFighter);
 const run=(criticalDamagePoints,damageReductionPercent)=>{
  const a=structuredClone(attacker),b=structuredClone(defender);Object.assign(a,{speed:1000,attack:1000,energy:0});Object.assign(b,{speed:1,hp:10000000,maxHp:10000000,shield:0,maxShield:0});
  a.equipmentEffects.criticalDamagePoints=criticalDamagePoints;a.equipmentEffects.criticalChancePoints=100;b.equipmentEffects.damageReductionPercent=damageReductionPercent;
  return simulateBattleV2Preview({teamA:[a],teamB:[b],seed:4,maxActions:1,petMode:'PVP'}).timeline.find(e=>e.type==='TURN'&&e.actorId===a.id);
 };
 const plain=run(0,0),reduced=run(0,14);assert.ok(plain.damage>0);assert.ok(reduced.damage<plain.damage);assert.ok(Math.abs(reduced.damage/ plain.damage-.86)<.01);
 // Select a deterministic critical seed rather than weakening hit caps or production random logic.
 let compared=false;
 for(let seed=1;seed<=32;seed++){
  const a=structuredClone(attacker),b=structuredClone(defender);Object.assign(a,{speed:1000,attack:1000,energy:0});Object.assign(b,{speed:1,hp:10000000,maxHp:10000000,shield:0,maxShield:0});
  const simulate=points=>{const source=structuredClone(a);source.equipmentEffects.criticalDamagePoints=points;return simulateBattleV2Preview({teamA:[source],teamB:[structuredClone(b)],seed,maxActions:1,petMode:'PVP'}).timeline.find(e=>e.type==='TURN'&&e.actorId===source.id);};
  const before=simulate(0),after=simulate(42);if(after.damage>before.damage){assert.ok(after.damage/before.damage>1.25);compared=true;break;}
 }
 assert.equal(compared,true);
});
