import test from 'node:test';
import assert from 'node:assert/strict';
import {forgeFixture} from './helpers/forge-db.mjs';
import {readForgePreparationInventory} from '../functions/_equipment_forge_preparation.js';
import {equipmentPreviewRows,equipmentEnhancementRows} from '../functions/_equipment_inventory.js';
import {forgePower} from '../shared/equipment-forge-policy-v1.mjs';
import {forgeQuote} from '../functions/_equipment_forge_transactions.js';

for(const postgres of [false,true]){
 const db=postgres?'PostgreSQL':'SQLite';
 test(`${db}: entire inventory sorts by enhanced power, not recent 40, and every cursor page is exact`,async t=>{
  const f=await forgeFixture(t,{postgres});
  await f.p('CREATE INDEX qa_user_item_id ON user_equipment_instances(user_id,equipment_id,id)').run();
  const specs=[[2,'소버린 SKS','WEAPON',115000],[3,'미스틱 슈트','TOP',50000],[4,'미스틱 레깅스','BOTTOM',50000],[5,'미스틱 슈즈','SHOES',50000],[6,'미스틱 듀얼디스크','ACCESSORY',50000],[7,'강화 무기','WEAPON',60000],[8,'비공개','TOP',999999],[9,'배틀슈트','BATTLE_SUIT',999999]];
  for(const [id,name,slot,total]of specs){
   await f.p("INSERT INTO character_equipment_items(id,code,name,slot,subtype,rarity,image_url,total_power,pve_power,pvp_power,is_public) VALUES(?,?,?,?,'TEST','MYTHIC','/test.png',?,?,?,?)",id,'ITEM_'+id,name,slot,total,Math.floor(total*.9),total-Math.floor(total*.9),id===8?0:1).run();
   await f.p("INSERT INTO user_equipment_instances(id,user_id,equipment_id,request_id,acquired_at) VALUES(?,7,?,?,'2026-01-01')",id*10,id,'old-'+id).run();
  }
  await f.p('INSERT INTO equipment_forge_states_v1 VALUES(70,7,10,4)').run();
  await f.p("INSERT INTO user_equipment_instances(id,user_id,equipment_id,request_id) VALUES(900,8,2,'foreign')").run();
  for(let id=100;id<183;id++)await f.p("INSERT INTO user_equipment_instances(id,user_id,equipment_id,request_id,acquired_at) VALUES(?,7,1,?,'2026-09-23')",id,'recent-'+id).run();
  // A zero-level state still has a meaningful revision, e.g. after MAINTAIN.
  await f.p('INSERT INTO equipment_forge_states_v1 VALUES(182,7,0,2)').run();
  const read=opts=>readForgePreparationInventory(f.DB,7,{includeEnhancement:true,...opts});
  const first=await read({limit:40});assert.deepEqual(first.items.slice(0,6).map(r=>r.instanceId),['70','20','60','50','40','30']);
  assert.equal(first.items[0].enhancement.power.total,132000);
  assert.equal(first.items.find(r=>r.instanceId==='182').enhancement.revision,2);
  const expected=['70','20','60','50','40','30',...Array.from({length:83},(_,i)=>String(182-i)),f.instanceId];
  for(const limit of [1,7,40,100]){
   let cursor=null,all=[];do{const page=await read({limit,beforeId:cursor});all.push(...page.items);cursor=page.nextCursor;assert.ok(all.length<=expected.length);}while(cursor);
   assert.deepEqual(all.map(r=>r.instanceId),expected);assert.equal(new Set(all.map(r=>r.instanceId)).size,expected.length);
  }
  assert.deepEqual((await read({group:'armor'})).items.map(r=>r.name),['미스틱 슈즈','미스틱 레깅스','미스틱 슈트']);
  assert.deepEqual((await read({beforeId:'900'})).items,[]);
  const plain=await readForgePreparationInventory(f.DB,7,{limit:3});assert.deepEqual(plain.items.map(r=>r.instanceId),['20','70','60']);
  assert.ok(plain.items.every(r=>r.enhancement===null));
  // All five high-tier catalog entries are normal eligible equipment for USER.
  await f.setting('equipment_forge_public_settings_v1',{schemaVersion:1,revision:2,publicVisible:true,executionMode:'ON',notice:'ISOLATED QA'});
  for(const instanceId of ['20','30','40','50','60']){
   const q=await forgeQuote(f.env,{...f.user,role:'USER'},{kind:'ENHANCE',instanceId,requestId:crypto.randomUUID()});assert.equal(q.item.instanceId,instanceId);
  }
  assert.equal(await f.coin(),10000000);assert.equal(await f.qty('MASTER_STAR'),100);
 });
 test(`${db}: every enhanced copy is separate even at the same level, preserving equipped IDs and exact counts`,async t=>{
  const f=await forgeFixture(t,{postgres});
  const alter='ALTER TABLE character_equipment_items ADD COLUMN sort_order INTEGER DEFAULT 0';
  if(postgres)await f.pg.exec(alter);else f.DB.sql.exec(alter);
  for(const id of [10,11,12,13])await f.p("INSERT INTO user_equipment_instances(id,user_id,equipment_id,request_id) VALUES(?,7,1,?)",id,'duplicate-'+id).run();
  for(const [id,level]of [[10,9],[11,9],[12,10]])await f.p('INSERT INTO equipment_forge_states_v1 VALUES(?,7,?,1)',id,level).run();
  const read=async(deferred=true)=>{
   const raw=(await equipmentPreviewRows(f.env,7)).results;if(!deferred)raw[0].quantity=5;
   return equipmentEnhancementRows(f.env,7,raw);
  };
  let rows=await read(false);assert.equal(rows.length,4);
  assert.deepEqual(rows.map(r=>[Number(r.instance_id),r.enhancement?.level,Number(r.quantity)]),[[Number(f.instanceId),0,2],[12,10,1],[11,9,1],[10,9,1]]);
  assert.equal(rows.reduce((sum,r)=>sum+Number(r.quantity),0),5);
  for(const r of rows.filter(r=>r.enhancement.level>0))assert.equal(r.total_power,forgePower(10000,r.enhancement.level).total);
  rows=await read();assert.equal(rows[0].quantity,null);assert.equal(rows[0].quantityOffset,3);assert.ok(rows.slice(1).every(r=>r.quantityFixed));
  await f.p("UPDATE user_equipment_loadout SET instance_id=10 WHERE user_id=7 AND slot='WEAPON'").run();
  rows=await read();assert.deepEqual(rows.map(r=>Number(r.instance_id)),[13,12,11,10]);
  await f.p('INSERT INTO equipment_forge_states_v1 VALUES(?,7,10,2)',f.instanceId).run();await f.p('INSERT INTO equipment_forge_states_v1 VALUES(13,7,10,1)').run();
  rows=await read(false);assert.equal(rows.length,5);assert.equal(rows.reduce((n,r)=>n+r.quantity,0),5);
  assert.ok(rows.every(r=>r.quantityFixed&&r.quantity===1));
  assert.equal((await f.p("SELECT instance_id FROM user_equipment_loadout WHERE user_id=7 AND slot='WEAPON'").first()).instance_id,10);
 });
}
