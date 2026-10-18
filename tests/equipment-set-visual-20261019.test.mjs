import test from 'node:test';
import assert from 'node:assert/strict';
import {EQUIPMENT_SET_PARTS,equipmentSetVisualFromRows,equipmentSetVisualGroups,equipmentSetOwnsActor} from '../shared/equipment-set-visual-v1.mjs';
import {equipmentGrowthRuntime} from '../functions/_equipment_growth.js';
import {readDuoEquipment} from '../functions/_ranked_duo_equipment.js';
import {createPveBattleV2,createPvpBattleV2,createDuoBattleV2} from '../functions/_battle_v2_preview.js';
import {polishFixture} from './helpers/equipment-polish-db.mjs';
import {isProductionFile} from '../scripts/prepare-production-assets.mjs';
import {createCooperativeBattle} from '../functions/_cooperative_battle.js';
import {coopSquads} from './helpers/cooperative-fixture.mjs';

const rows=(set,level=10)=>Object.entries(EQUIPMENT_SET_PARTS[set]).map(([slot,code])=>({slot,code,level,equipped:true}));
const visual=(set,id)=>equipmentSetVisualFromRows(rows(set),id);
const cards=Array.from({length:5},(_,i)=>({id:`SET-QA-${i}`,rarity:['FUR','FUR','PRESTIGE','PRESTIGE','ZENITH'][i],power_type:['ATTACK','DEFENSE','SPEED','HP','ATTACK'][i],power:10000,breakthrough_level:0}));
for(const set of ['EMPEROR','ARDEN'])test(set+' exact equipped four-part threshold',()=>{
  assert.equal(visual(set,7).set,set);
  assert.equal(equipmentSetVisualFromRows(rows(set,15),7).minimumLevel,15);
  for(let i=0;i<4;i++)for(const change of [{level:9},{level:0},{level:16},{level:10.5},{equipped:false},{equipped_count:0},{code:'OTHER'},{slot:'WEAPON'}]){
    const gear=rows(set);Object.assign(gear[i],change);assert.equal(equipmentSetVisualFromRows(gear,7),null);
  }
  assert.equal(equipmentSetVisualFromRows(rows(set).slice(0,3),7),null);
  assert.equal(equipmentSetVisualFromRows([...rows(set),rows(set)[0]],7),null);
});
test('cosmetics cannot change battle damage, timeline, outcome or power',()=>{
  const pvp={attackerCards:cards,defenderCards:cards,seed:7},plain=createPvpBattleV2(pvp),fx=createPvpBattleV2({...pvp,attackerEquipmentSetVisual:visual('ARDEN',7),defenderEquipmentSetVisual:visual('EMPEROR',8)});
  assert.deepEqual(fx.result,plain.result);assert.deepEqual(fx.teams.A.cards,plain.teams.A.cards);assert.deepEqual(fx.teams.A.summary,plain.teams.A.summary);
  assert.equal(fx.teams.A.equipmentSetVisual.set,'ARDEN');assert.equal(fx.teams.B.equipmentSetVisual.set,'EMPEROR');
  const pve={cards,seed:9,monster:{id:'MONSTER:SET-QA',name:'검수',battle_power:30000}};
  assert.deepEqual(createPveBattleV2({...pve,pveEquipmentRuntime:{equipmentSetVisual:visual('ARDEN',7)}}).result,createPveBattleV2(pve).result);
});
test('duo snapshots keep each owner separate and replay identically',()=>{
  const squad=(id,set)=>({ownerId:id,ownerName:'검수'+id,cards,equipmentBonus:0,...(set?{equipmentSetVisual:visual(set,id)}:{})});
  const base={attackerSquads:[squad(7),squad(8)],defenderSquads:[squad(9),squad(10)],seed:3};
  const battle=createDuoBattleV2({...base,attackerSquads:[squad(7,'ARDEN'),squad(8)],defenderSquads:[squad(9),squad(10,'EMPEROR')]});
  assert.deepEqual(battle.result,createDuoBattleV2(base).result);
  const groups=equipmentSetVisualGroups({battleV2:battle});assert.equal(groups.length,2);
  for(const group of groups)for(const side of ['A','B'])for(const ownerId of [7,8,9,10])assert.equal(equipmentSetOwnsActor(group,{ownerId},side),group.side===side&&group.ownerId===ownerId);
  assert.equal(equipmentSetOwnsActor(groups[0],{ownerId:7,isMercenary:true},'A'),false);
  assert.deepEqual(equipmentSetVisualGroups({sceneAssetKey:'JOKGAK_CITY',battleV2:battle}),[]);
  battle.teams.A.members[0].equipmentSetVisual.ownerId=99;
  assert.equal(equipmentSetVisualGroups({battleV2:battle}).length,1,'mismatched owners fail closed');
});
test('custom raid fallback uses its saved equipped snapshot; multi-owner never inherits it',()=>{
  const payload={characterBonus:{pveEquipmentRuntime:{equipmentSetVisual:visual('ARDEN',7)}},battleV2:{teams:{A:{cards}}}};
  assert.equal(equipmentSetVisualGroups(payload)[0].set,'ARDEN');
  payload.battleV2.teams.A.members=[{ownerId:7},{ownerId:8},{ownerId:9}];
  assert.deepEqual(equipmentSetVisualGroups(payload),[]);
});
test('cooperative snapshot has two equipped owners and one unadorned owner without combat changes',()=>{
  const squads=coopSquads(),before=createCooperativeBattle({squads,seed:5});
  squads[0].equipmentSetVisual=visual('ARDEN',1);squads[1].equipmentSetVisual=visual('EMPEROR',2);
  const after=createCooperativeBattle({squads,seed:5});
  assert.deepEqual(after.payload.battleV2.result,before.payload.battleV2.result);
  assert.deepEqual(equipmentSetVisualGroups(after.payload).map(x=>x.ownerId),[1,2]);
});
test('delivery retains live textures and combined preview, while preserving authoring only in Git',()=>{
  for(const set of ['emperor','arden'])for(const name of ['crest','ground','impact-sequence']){
    assert.equal(isProductionFile(`assets/effects/equipment-sets-20261019/${set}/${name}.webp`),true);
    assert.equal(isProductionFile(`assets/effects/equipment-sets-20261019/${set}/source/${name}.png`),false);
  }
  for(const file of ['index.html','app.mjs','preview.css','fixture-pvp.json','fixture-pve.json','fixture-coop.json'])assert.equal(isProductionFile('preview/equipment-sets-v3-20261019/'+file),true);
  assert.equal(isProductionFile('preview/emperor-set-v3-20261019/qa/desktop-review.mp4'),false);
});

for(const postgres of [false,true])test(`${postgres?'Postgres':'SQLite'} equipped joins use actual owner/slot/enhancement and duo counts`,async t=>{
  const f=await polishFixture(t,{postgres});
  await f.p('DELETE FROM user_equipment_loadout').run();
  for(const [i,item] of rows('ARDEN').entries()){
    const id=100+i;
    await f.p('INSERT INTO character_equipment_items(id,code,name,slot,total_power,pve_power,pvp_power,is_active,is_public) VALUES(?,?,?,?,200000,180000,20000,1,1)',id,item.code,item.code,item.slot).run();
    await f.p('INSERT INTO user_equipment_instances(id,user_id,equipment_id) VALUES(?,7,?)',id,id).run();
    await f.p('INSERT INTO equipment_forge_states_v1(instance_id,user_id,level,revision) VALUES(?,7,10,1)',id).run();
    await f.p('INSERT INTO user_equipment_loadout(user_id,slot,instance_id) VALUES(7,?,?)',item.slot,id).run();
  }
  assert.equal((await equipmentGrowthRuntime(f.env,7)).equipmentSetVisual.set,'ARDEN');
  assert.equal((await equipmentGrowthRuntime(f.env,8)).equipmentSetVisual,undefined);
  assert.equal(equipmentSetVisualFromRows((await readDuoEquipment(f.env,[7])).results,7).set,'ARDEN');
  if(postgres){
    await f.env.DB.client.query('CREATE TABLE user_equipment_counts_v1(user_id BIGINT,equipment_id BIGINT,quantity BIGINT)');
    await f.p('INSERT INTO user_equipment_counts_v1 SELECT user_id,equipment_id,COUNT(*) FROM user_equipment_instances GROUP BY user_id,equipment_id').run();
    await f.p("INSERT INTO app_meta(key,value) VALUES('equipment_counts_v1_ready','1') ON CONFLICT(key) DO UPDATE SET value='1'").run();
    const fresh={DB:f.env.DB,RUNTIME_DB_CACHE_SCOPE:{}};
    assert.equal(equipmentSetVisualFromRows((await readDuoEquipment(fresh,[7])).results,7).set,'ARDEN','production sparse/counts branch');
  }
  await f.p('UPDATE equipment_forge_states_v1 SET level=9 WHERE instance_id=100').run();
  await f.p('INSERT INTO user_equipment_instances(id,user_id,equipment_id) VALUES(200,7,100)').run();
  await f.p('INSERT INTO equipment_forge_states_v1(instance_id,user_id,level,revision) VALUES(200,7,15,1)').run();
  assert.equal((await equipmentGrowthRuntime(f.env,7)).equipmentSetVisual,undefined,'owned +15 does not replace equipped +9');
  assert.equal(equipmentSetVisualFromRows((await readDuoEquipment(f.env,[7])).results,7),null);
  await f.p('UPDATE equipment_forge_states_v1 SET level=10 WHERE instance_id=100').run();
  await f.p("UPDATE user_equipment_loadout SET slot='WEAPON' WHERE user_id=7 AND slot='TOP'").run();
  assert.equal((await equipmentGrowthRuntime(f.env,7)).equipmentSetVisual,undefined,'slot mismatch excluded');
});
