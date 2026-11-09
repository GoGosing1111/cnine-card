import test from 'node:test';
import assert from 'node:assert/strict';
import {ascendantEquipmentFixture} from './helpers/ascendant-equipment-db.mjs';
import {mercenaryCardAcquisitionStatements} from '../functions/_mercenary_draw_accounting.js';
import {saveMercenaryLoadout,releasedMercenaryFormations,selectedMercenaryBattleSnapshots} from '../functions/_mercenary_account.js';
import {mercenaryEquipmentState,saveMercenaryEquipment,readMercenaryEquipmentRecords,mercenaryEquipmentKey,mercenaryEquipmentV2Key} from '../functions/_mercenary_equipment.js';
import {equipmentSlots} from '../functions/_mercenary_equipment_model.js';
import {auctionMetaSelectionContains,auctionAssetDebit} from '../functions/_auction_user_assets.js';
import {readForgePreparationInventory} from '../functions/_equipment_forge_preparation.js';
const rid=()=>crypto.randomUUID();
async function fixture(t,postgres){
 const f=await ascendantEquipmentFixture(t,{postgres});for(const [code,rank]of [['V-001','SSS'],['V-002','SS']])f.document.mercenaries.find(c=>c.code===code).rank=rank;
 await f.p("UPDATE mercenary_cms_documents_v1 SET payload_json=? WHERE doc_key='config'",JSON.stringify(f.document)).run();
 await f.env.DB.batch(mercenaryCardAcquisitionStatements(f.env.DB,{userId:7,mercenaryCode:'V-002',acquisitionId:rid()}));
 return {...f,save:(code,mode,instanceId,revision,extra={})=>saveMercenaryEquipment(f.env,f.user,{requestId:rid(),mercenaryCode:code,mode,slot:'WEAPON',instanceId,revision,...extra})};
}
for(const postgres of [false,true]){
 const label=postgres?'PostgreSQL':'SQLite';
 test(`${label}: explicit transfer clears only the prior wearer and atomically retains one owner across modes`,async t=>{
  const f=await fixture(t,postgres);await f.save('V-001','PVE','1000',0);await f.save('V-001','PVP','1000',1);
  await assert.rejects(()=>f.save('V-002','PVE','1000',2),{code:'MERCENARY_EQUIPMENT_TRANSFER'});
  const requestId=rid();f.fail('INSERT INTO admin_logs');await assert.rejects(()=>f.save('V-002','PVE','1000',2,{requestId,transferConfirmed:true}));
  let r=(await readMercenaryEquipmentRecords(f.env,[7])).get(7);assert.equal(r.state.loadouts['V-001'].PVE.WEAPON,'1000');assert.equal(r.state.revision,2);
  f.fail('');await f.save('V-002','PVE','1000',2,{requestId,transferConfirmed:true});assert.equal((await f.save('V-002','PVE','1000',2,{requestId,transferConfirmed:true})).replayed,true);
  r=(await readMercenaryEquipmentRecords(f.env,[7])).get(7);assert.equal(r.state.loadouts['V-001'].PVE.WEAPON,null);assert.equal(r.state.loadouts['V-001'].PVP.WEAPON,null);assert.equal(r.state.loadouts['V-002'].PVE.WEAPON,'1000');assert.equal(r.state.loadouts['V-002'].PVP.WEAPON,null);
  await assert.rejects(()=>f.save('V-001','PVP','1001',2),{code:'MERCENARY_EQUIPMENT_CONFLICT'});
  await f.save('V-002','PVP','1000',3);assert.equal((await mercenaryEquipmentState(f.env,f.user)).revision,4);
  const forged=(await readForgePreparationInventory(f.env.DB,7,{focusId:'1000'})).items[0];assert.equal(forged.equipped,true);assert.deepEqual(forged.mercenaryModes,['PVE','PVP']);
  await assert.rejects(()=>auctionAssetDebit(f.env,7,{kind:'MERCENARY',ref:'V-002',name:'QA',tradeable:true},1,'QA-LAST-MERC'),/장비를 착용한 마지막 용병/);
  assert.equal(auctionMetaSelectionContains('EQUIPMENT',mercenaryEquipmentV2Key(7),r.state,'1000'),true);
 });
 test(`${label}: approved legacy migration favors PVP, freezes before formation changes and preserves source records`,async t=>{
  const f=await fixture(t,postgres);await saveMercenaryLoadout(f.env,f.user,{requestId:rid(),mode:'PVP',mercenaryCodes:['V-002'],revision:1});
  const old={schemaVersion:1,revision:6,slots:{...equipmentSlots(),WEAPON:'1000'}};
  for(const mode of ['PVE','PVP'])await f.setting(mercenaryEquipmentKey(7,mode),old);
  let r=(await readMercenaryEquipmentRecords(f.env,[7])).get(7);assert.equal(r.state.loadouts['V-002'].PVP.WEAPON,'1000');assert.equal(r.state.loadouts['V-001'],undefined);assert.equal(r.state.migration.cleared.length,1);
  await saveMercenaryLoadout(f.env,f.user,{requestId:rid(),mode:'PVP',mercenaryCodes:['V-001'],revision:2});
  r=(await readMercenaryEquipmentRecords(f.env,[7])).get(7);assert.ok(r.raw);assert.equal(r.state.loadouts['V-002'].PVP.WEAPON,'1000');assert.equal(r.PVP.slots.WEAPON,null);
  for(const mode of ['PVE','PVP'])assert.deepEqual(JSON.parse((await f.p('SELECT value FROM app_meta WHERE key=?',mercenaryEquipmentKey(7,mode)).first()).value),old);
 });
 test(`${label}: each companion in actual battle snapshots receives only its own equipment`,async t=>{
  const f=await fixture(t,postgres);await f.p("INSERT INTO user_equipment_instances(id,user_id,equipment_id,source_type,request_id) VALUES(9000,7,100,'QA',?)",rid()).run();
  await f.save('V-001','PVE','1000',0);await f.save('V-002','PVE','9000',1);
  await saveMercenaryLoadout(f.env,f.user,{requestId:rid(),mode:'PVE',mercenaryCodes:['V-001','V-002'],revision:1});
  const formation=(await releasedMercenaryFormations(f.env,[7],'PVE')).get(7);assert.deepEqual(formation.mercenaries.map(m=>m.equipment.items[0].instanceId),['1000','9000']);
  assert.deepEqual((await selectedMercenaryBattleSnapshots(f.env,f.user,['V-001','V-002'],'PVE')).map(m=>m.equipment.items[0].instanceId),['1000','9000']);
  const state=await mercenaryEquipmentState(f.env,f.user);assert.equal(state.items.filter(i=>i.equipmentId===100).length,2);
 });
 test(`${label}: inventory cursor exposes every duplicate once and applies filters before pagination`,async t=>{
  const f=await fixture(t,postgres);for(let n=0;n<145;n++)await f.p("INSERT INTO user_equipment_instances(id,user_id,equipment_id,source_type,request_id) VALUES(?,7,100,'QA',?)",9000+n,rid()).run();
  let cursor='',seen=[];do{const page=await mercenaryEquipmentState(f.env,f.user,{cursor,slot:'WEAPON'});assert.ok(page.items.length<=120);assert.ok(page.items.every(i=>i.slot==='WEAPON'));seen.push(...page.items.map(i=>i.instanceId));cursor=page.nextCursor;}while(cursor);
  const expected=(await f.p("SELECT x.id FROM user_equipment_instances x JOIN character_equipment_items i ON i.id=x.equipment_id WHERE x.user_id=7 AND i.slot='WEAPON'").all()).results.map(row=>String(row.id));
  assert.deepEqual([...seen].sort(),expected.sort());assert.equal(new Set(seen).size,seen.length);
  await f.save('V-001','PVE','1000',0);const own=await mercenaryEquipmentState(f.env,f.user,{owner:'self',mercenaryCode:'V-001'});assert.deepEqual(own.items.map(i=>i.instanceId),['1000']);
  const free=await mercenaryEquipmentState(f.env,f.user,{owner:'free'});assert.ok(!free.items.some(i=>i.instanceId==='1000'));
  await assert.rejects(()=>f.save('V-999','PVE','1000',1),{code:'MERCENARY_EQUIPMENT_MERCENARY'});
 });
}
