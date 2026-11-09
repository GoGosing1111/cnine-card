import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import {UNIQUE_MERCENARY_EQUIPMENT as pieces, individualMercenaryBonuses} from '../shared/mercenary-unique-equipment-v1.mjs';
import {ASCENDANT_EQUIPMENT,ASCENDANT_EQUIPMENT_SLOTS,ascendantEquipmentEffects} from '../shared/mercenary-ascendant-equipment-v1.mjs';
import {mercenaryEquipmentDefinition,mercenaryEquipmentPower} from '../shared/mercenary-equipment-v1.mjs';
import {applyPveEquipmentGrowth} from '../shared/equipment-combat-growth-v1.mjs';
import {regionRewardCatalog} from '../functions/_legion_regions.js';
import {mercenaryEquipmentState,saveMercenaryEquipment} from '../functions/_mercenary_equipment.js';
import {releasedMercenarySnapshot} from '../functions/_mercenary_account.js';
import {buildMercenaryFighter} from '../functions/_mercenary_combat.js';
import {buildFighter,createPveBattleV2,createPvpBattleV2} from '../functions/_battle_v2_preview.js';
import {attachPolishInventory} from '../functions/_equipment_growth.js';
import {ascendantEquipmentFixture} from './helpers/ascendant-equipment-db.mjs';

const byTier=tier=>pieces.filter(item=>item.tier===tier);
const crown=ASCENDANT_EQUIPMENT.filter(item=>item.tier===10);
const crownEffects=ascendantEquipmentEffects(crown.map(i=>i.code),'PVE').effects;
const cards=Array.from({length:5},(_,i)=>({id:String(i+1),title:'검수',rarity:'FUR',power:100000,power_type:'ATTACK'}));

test('fifteen unique images, five real slots per tier, and stronger individual bonuses than the complete tenth tier',async()=>{
 assert.equal(new Set(pieces.map(i=>i.code)).size,15);
 assert.equal(new Set(pieces.map(i=>i.name)).size,15);
 for(const [stage,family,total] of [[1,'새벽별',8280000],[2,'그믐달',11040000],[3,'태양왕좌',15180000]]){
  const items=byTier(stage);assert.deepEqual(items.map(i=>i.slot),ASCENDANT_EQUIPMENT_SLOTS);
  assert.equal(items.reduce((sum,i)=>sum+i.totalPower,0),total);
  for(const item of items){
   assert.equal(item.tierLabel,'유니크 '+stage+'단계');
   for(const label of [family,item.name,item.passiveName])assert.match(label,/^[가-힣]{3,4}$/);
   assert.equal(item.family,family);assert.equal(item.setId,null);assert.equal(item.regionId,null);
   assert.equal(mercenaryEquipmentDefinition(item.code),item);assert.deepEqual(item.modes,['PVE','PVP']);
   assert.equal(item.pvePower+item.pvpPower,item.totalPower);assert(item.individualEffects.attackPercent>crownEffects.attackPercent);assert(item.individualEffects.hpPercent>crownEffects.hpPercent);
   assert.deepEqual(individualMercenaryBonuses([item]).effects,item.individualEffects);
   const art=await readFile(new URL('..'+item.image,import.meta.url));assert.equal(art.toString('ascii',8,12),'WEBP');assert(art.length>8000);
  }
 }
});

test('the published fifteen item identifiers, passives, stats and mode rules retain their original values',()=>{
 const options=pieces.map(({code,kind,slot,subtype,rarity,setId,regionId,totalPower,pvePower,pvpPower,modes,individualEffects,description})=>
  ({code,kind,slot,subtype,rarity,setId,regionId,totalPower,pvePower,pvpPower,modes,individualEffects,description}));
 const digest=createHash('sha256').update(JSON.stringify(options)).digest('hex');
 // Captured from the original live definitions before the artwork and rank change.
 assert.equal(digest,'a57eae0d295621fdd164ca55d360959b79985081bbdd522a3998f5f5c0efd858');
});

test('duplicates, wrong slots and unrelated items cannot multiply or supply a passive',()=>{
 const second=byTier(2)[1],third=byTier(3)[1],wrong={...second,slot:'SHOES'};
 assert.equal(individualMercenaryBonuses([wrong,...crown]),null);
 assert.deepEqual(individualMercenaryBonuses([second,second,{...second,individualEffects:{hpPercent:9999}}]),individualMercenaryBonuses([second]));
 assert.equal(individualMercenaryBonuses([second,third,second]),null);
});

for(const postgres of [false,true])test((postgres?'PostgreSQL':'SQLite')+' registers, equips, mixes, and removes each passive in its own battle mode',async t=>{
 const f=await ascendantEquipmentFixture(t,{postgres});const base=await releasedMercenarySnapshot(f.env,f.user,'PVE');
 const rewards=await regionRewardCatalog(f.env,{ascendant:true});assert(!rewards.some(r=>pieces.some(i=>i.code===r.equipmentCode)));assert.equal(rewards.length,81);
 for(const mode of ['PVE','PVP']){
  const items=byTier(mode==='PVE'?2:3);
  for(const item of items){
   await f.equip(mode,item);
   const snapshot=await releasedMercenarySnapshot(f.env,f.user,mode),fighter=buildMercenaryFighter(snapshot,'A',mode,buildFighter);
   const equipped=items.slice(0,items.indexOf(item)+1);
   const personal=individualMercenaryBonuses(equipped).effects;
   assert.deepEqual(snapshot.equipment.individualEffects,personal);assert.deepEqual(snapshot.equipment.sets,[]);
   for(const [stat,value] of Object.entries(personal))assert.equal(fighter.equipmentEffects[stat],value);
   assert.equal(mercenaryEquipmentPower(snapshot,mode),equipped.reduce((sum,i)=>sum+(mode==='PVE'?i.pvePower:i.pvpPower),0));
  }
  const snapshot=await releasedMercenarySnapshot(f.env,f.user,mode);
  const fighter=buildMercenaryFighter(snapshot,'A',mode,buildFighter);
  const bare=buildMercenaryFighter(base,'A',mode,buildFighter);
  assert(fighter.maxHp>bare.maxHp);assert(fighter.attack>bare.attack);assert(fighter.shield>0);
  const battle=mode==='PVE'?createPveBattleV2({cards,mercenary:snapshot,monster:{id:1,name:'검수',battle_power:10000000},seed:19}):
    createPvpBattleV2({attackerCards:cards,defenderCards:cards,attackerMercenary:snapshot,defenderMercenary:base,seed:19});
  assert(battle.result.timeline.length);assert.equal(battle.teams.A.mercenaries[0].equipmentEffects.shieldPercent,items[2].individualEffects.shieldPercent);
  assert(battle.teams.A.cards.every(c=>!c.equipmentIndividualEffects));
  const other=mode==='PVE'?'PVP':'PVE';
  const wrong=buildMercenaryFighter({...base,equipment:snapshot.equipment,equipmentIndividualEffects:{attackPercent:999}},'A',other,buildFighter);
  assert.equal(wrong.equipmentIndividualEffects,undefined);
  if(mode==='PVE'){
   applyPveEquipmentGrowth([fighter],{effects:{attackPercent:90}});
   assert.equal(fighter.equipmentEffects.attackPercent,snapshot.equipment.individualEffects.attackPercent+30);
  }
 }
 await f.equip('PVE',crown[0]);await f.equip('PVE',crown[1]);
 let state=await mercenaryEquipmentState(f.env,f.user);assert.equal(state.loadouts.PVE.sets[0].active,2);
 const mixed=buildMercenaryFighter(await releasedMercenarySnapshot(f.env,f.user,'PVE'),'A','PVE',buildFighter);
 assert.equal(mixed.equipmentEffects.attackPercent,crownEffects.attackPercent+3*44);
 const pvpBefore=state.loadouts.PVP.power;
 await saveMercenaryEquipment(f.env,f.user,{mercenaryCode:'V-001',requestId:crypto.randomUUID(),revision:state.revision,mode:'PVE',slot:'BOTTOM',instanceId:null});
 state=await mercenaryEquipmentState(f.env,f.user);assert.equal(state.loadouts.PVE.individualEffects.shieldPercent,undefined);assert.equal(state.loadouts.PVP.power,pvpBefore);
 assert.equal(state.catalog.filter(i=>i.individualEffects).length,15);
 const [attached]=await attachPolishInventory(f.env,7,[{instanceId:f.instances.get(pieces[0].code),code:pieces[0].code}]);assert.deepEqual(attached.regionEquipment.individualEffects,pieces[0].individualEffects);
});
