import test from 'node:test';
import assert from 'node:assert/strict';
import {forgeFixture} from './helpers/forge-db.mjs';
import {forgeQuote,executeForge,forgeReceipt,forgeAccountState,forgeEquipmentBonus,forgeEquipmentBonuses,handleForgeRuntimeReady} from './helpers/forge-held-runtime.mjs';
import {forgePower,FORGE_RUNTIME_KEY} from '../shared/equipment-forge-policy-v1.mjs';
import {FORGE_ADVANCED_KEY,forgeAdvancedDraft,validateForgeAdvanced,forgeAdvancedReadiness,forgeScrollForSlot,FORGE_SCROLL_ITEMS} from '../shared/equipment-forge-advanced-v1.mjs';
import {forgeAdvancedAdminState,saveForgeAdvancedPolicy,readForgeAdvancedPolicy} from '../functions/_equipment_forge_advanced.js';
import {ensureForgeScrollCatalog} from '../functions/_forge_scroll_catalog.js';
import {grantForgeTickets} from '../functions/_admin_forge_ticket_grant.js';
import {forgeQuoteShortages} from '../shared/equipment-forge-resources-v1.mjs';
import {readForgePreparationInventory} from '../functions/_equipment_forge_preparation.js';
import {equipmentEnhancementRows} from '../functions/_equipment_inventory.js';
import {migrateForgeLevelCap,registerForgeScrolls} from '../scripts/ops/equipment-forge-scrolls-20261012.mjs';
const rid=()=>crypto.randomUUID(),weapon=FORGE_SCROLL_ITEMS[0].code,armor=FORGE_SCROLL_ITEMS[1].code;
const complete=()=>{const p=forgeAdvancedDraft();for(const [i,s]of p.steps.entries())Object.assign(s,{successPpm:500000,maintainPpm:250000,destroyPpm:250000,coinCost:100,itemQuantity:2,scrollQuantity:2,protectionQuantity:1,powerBonusPercent:160+i*40});return p;};
const quote=f=>forgeQuote(f.env,f.user,{requestId:rid(),kind:'ENHANCE',instanceId:f.instanceId});
const level=(f,n)=>f.p('INSERT INTO equipment_forge_states_v1(instance_id,user_id,level,revision) VALUES(?,7,?,1) ON CONFLICT(instance_id) DO UPDATE SET level=excluded.level,revision=equipment_forge_states_v1.revision+1',f.instanceId,n).run();
const quantity=async(f,code)=>Number((await f.p('SELECT quantity FROM cnine_user_inventory WHERE user_id=7 AND item_code=?',code).first())?.quantity||0);
async function advancedFixture(t,postgres){const f=await forgeFixture(t,{postgres});await ensureForgeScrollCatalog(f.env);await saveForgeAdvancedPolicy(f.env,f.user,complete());for(const code of [weapon,armor])await f.p('INSERT INTO cnine_user_inventory(user_id,item_code,quantity) VALUES(7,?,50)',code).run();await level(f,10);return f;}
test('advanced draft stays empty, validates every field and maps weapon vs armor slots',()=>{
 const p=forgeAdvancedDraft();assert.equal(p.steps.length,5);assert(forgeAdvancedReadiness(p).every(row=>!row.ready));assert(p.steps.every(s=>s.scrollQuantity===null&&s.powerBonusPercent===null));
 for(const slot of ['TOP','BOTTOM','SHOES','ACCESSORY'])assert.equal(forgeScrollForSlot(slot).code,armor);assert.equal(forgeScrollForSlot('WEAPON').code,weapon);
 assert.deepEqual(forgePower(10000,10),{total:22000,pve:19800,pvp:2200});
 assert.throws(()=>forgePower(10000,11),{code:'FORGE_ADVANCED_POWER'});assert.throws(()=>forgePower(10000,16,complete()));
 assert.deepEqual(forgePower(10000,15,complete()),{total:42000,pve:37800,pvp:4200});
 for(const change of [p=>p.steps.pop(),p=>p.steps[0].scrollQuantity=0,p=>p.steps[0].successPpm=99999,p=>p.steps[0].powerBonusPercent=120,p=>p.steps[1].powerBonusPercent=150,p=>p.steps[0].maintainPpm=300000]){const p=complete();change(p);assert.throws(()=>validateForgeAdvanced(p),{code:'FORGE_ADVANCED_POLICY'});}
 const s={kind:'ENHANCE',cost:{coinCost:1,itemCode:'MASTER_STAR',itemQuantity:1,scroll:{code:weapon,name:'무기 강화주문서',quantity:2}}};
 assert.match(forgeQuoteShortages(s,{coins:100,masterStars:100,scrolls:{[weapon]:1}})[0],/무기 강화주문서 부족/);
});
for(const postgres of [false,true]){
 const prefix=postgres?'PostgreSQL':'SQLite';
 test(prefix+': CMS partial save locks only new steps, preserves legacy policy and CAS/audit rollback',async t=>{
  const f=await forgeFixture(t,{postgres}),before=(await f.p('SELECT value FROM app_meta WHERE key=?',FORGE_RUNTIME_KEY).first()).value;
  const state=await forgeAdvancedAdminState(f.env);assert(state.readiness.every(row=>!row.ready));assert.equal(await quantity(f,weapon),0);
  const partial=forgeAdvancedDraft();partial.steps[0].coinCost=100;const saved=await saveForgeAdvancedPolicy(f.env,f.user,partial);assert.equal(saved.policy.revision,1);assert(!saved.readiness[0].ready);
  assert.equal((await f.p('SELECT value FROM app_meta WHERE key=?',FORGE_RUNTIME_KEY).first()).value,before);
  await assert.rejects(()=>saveForgeAdvancedPolicy(f.env,f.user,partial),{code:'FORGE_POLICY_CONFLICT'});
  await assert.rejects(()=>saveForgeAdvancedPolicy(f.env,{...f.user,role:'ADMIN'},saved.policy),{code:'FORGE_PERMISSION'});
  const ready={...complete(),revision:1};f.fail('INSERT INTO admin_logs');await assert.rejects(()=>saveForgeAdvancedPolicy(f.env,f.user,ready));f.fail('');assert.deepEqual(await readForgeAdvancedPolicy(f.DB),saved.policy);
  const live=await saveForgeAdvancedPolicy(f.env,f.user,ready);assert(live.readiness.every(row=>row.ready));
  const cleared=structuredClone(live.policy);cleared.steps[0].powerBonusPercent=null;await assert.rejects(()=>saveForgeAdvancedPolicy(f.env,f.user,cleared),{code:'FORGE_ADVANCED_POWER'});
  assert.equal(await f.coin(),10000000);
 });
 test(prefix+': authenticated advanced route, blank +11 lock and unchanged +9→+10 cost',async t=>{
  const f=await forgeFixture(t,{postgres});await level(f,9);
  const q=await quote(f);assert.equal(q.cost.scroll,undefined);await executeForge(f.env,f.user,{requestId:rid(),quoteId:q.quoteId},'ENHANCE',{randomInt:()=>0});
  await assert.rejects(()=>quote(f),{code:'FORGE_ADVANCED_PENDING'});assert.equal(await f.coin(),9999900);
  const request=new Request('https://game.test/api/admin/equipment-forge/advanced',{headers:{authorization:'Bearer local-account-7'}});
  const args={path:'admin/equipment-forge/advanced',env:f.env,request,deps:f.deps};assert.equal((await handleForgeRuntimeReady(args)).status,200);
  assert.equal((await handleForgeRuntimeReady({...args,deps:{...f.deps,authenticate:async()=>({...f.user,role:'ADMIN'})}})).status,403);
  assert.equal((await handleForgeRuntimeReady({...args,deps:{...f.deps,authenticate:async()=>null}})).status,401);
 });
 test(prefix+': +10→+15 charges weapon scrolls once, enforces cap and connects current PVE/PVP power',async t=>{
  const f=await advancedFixture(t,postgres);
  for(let target=11;target<=15;target++){const q=await quote(f);assert.equal(q.cost.scroll.code,weapon);assert.equal(q.cost.scroll.quantity,2);const body={requestId:rid(),quoteId:q.quoteId};const r=await executeForge(f.env,f.user,body,'ENHANCE',{randomInt:()=>0});assert.equal(r.level,target);assert.deepEqual(r.power,forgePower(10000,target,complete()));assert.equal((await executeForge(f.env,f.user,body,'ENHANCE',{randomInt(){throw Error('reroll');}})).replayed,true);}
  assert.equal(await quantity(f,weapon),40);assert.equal(await quantity(f,armor),50);assert.equal(await f.coin(),9999500);
  await assert.rejects(()=>quote(f),{code:'FORGE_MAX_LEVEL'});
  const state=await forgeAccountState(f.env,f.user);assert.equal(state.policy.maxLevel,15);assert.equal(state.items[0].enhancement.power.total,42000);assert.equal(state.wallet.scrolls[weapon],40);
  assert.deepEqual(await forgeEquipmentBonus(f.env,7),{pve:28800,pvp:3200});assert.deepEqual((await forgeEquipmentBonuses(f.env,[7])).get(7),{pve:28800,pvp:3200});
  const rows=await equipmentEnhancementRows(f.env,7,[(await f.p('SELECT i.*,x.id AS instance_id,1 AS quantity FROM character_equipment_items i JOIN user_equipment_instances x ON x.equipment_id=i.id WHERE x.id=?',f.instanceId).first())]);assert.equal(rows.find(r=>r.enhancement.level===15).total_power,42000);
 });
 test(prefix+': correct armor type, missing scrolls fail before roll, atomic failure keeps inventory and original outcome',async t=>{
  const f=await advancedFixture(t,postgres);await f.p("UPDATE character_equipment_items SET slot='ACCESSORY' WHERE id=1").run();
  let q=await quote(f);assert.equal(q.cost.scroll.code,armor);
  await f.p('UPDATE cnine_user_inventory SET quantity=0 WHERE user_id=7 AND item_code=?',armor).run();
  await assert.rejects(()=>executeForge(f.env,f.user,{requestId:rid(),quoteId:q.quoteId},'ENHANCE',{randomInt(){throw Error('should not roll');}}),{code:'FORGE_MATERIAL'});
  assert.equal(await f.coin(),10000000);assert.equal(await quantity(f,weapon),50);
  await f.p('UPDATE cnine_user_inventory SET quantity=50 WHERE user_id=7 AND item_code=?',armor).run();
  q=await quote(f);const body={requestId:rid(),quoteId:q.quoteId};f.fail('INSERT INTO equipment_forge_states_v1');
  await assert.rejects(()=>executeForge(f.env,f.user,body,'ENHANCE',{randomInt:()=>600000}));assert.equal(await quantity(f,armor),50);assert.equal(await f.coin(),10000000);f.fail('');
  const result=await executeForge(f.env,f.user,body,'ENHANCE',{randomInt(){throw Error('reroll');}});assert.equal(result.outcome,'MAINTAIN');assert.equal(await quantity(f,armor),48);
 });
 test(prefix+': protection/destruction consume scrolls, +14 destruction restores the exact level without another scroll',async t=>{
  const f=await advancedFixture(t,postgres);await level(f,14);
  const protectedQuote=await forgeQuote(f.env,f.user,{requestId:rid(),kind:'ENHANCE',instanceId:f.instanceId,useProtection:true});
  const protectedResult=await executeForge(f.env,f.user,{requestId:rid(),quoteId:protectedQuote.quoteId},'ENHANCE',{randomInt:()=>999999});assert.equal(protectedResult.outcome,'PROTECTED');assert.equal(await quantity(f,weapon),48);
  const q=await quote(f),body={requestId:rid(),quoteId:q.quoteId};const destroyed=await executeForge(f.env,f.user,body,'ENHANCE',{randomInt:()=>999999});assert.equal(destroyed.outcome,'DESTROY');assert.equal(await quantity(f,weapon),46);
  const restore=await forgeQuote(f.env,f.user,{requestId:rid(),kind:'RESTORE',recordId:destroyed.recordId});assert.equal(restore.cost.scroll,undefined);
  const rb={requestId:rid(),quoteId:restore.quoteId},r=await executeForge(f.env,f.user,rb,'RESTORE');assert.equal(r.level,14);assert.deepEqual(r.power,forgePower(10000,14,complete()));assert.equal(await quantity(f,weapon),46);
  await executeForge(f.env,f.user,rb,'RESTORE');assert.equal(await quantity(f,weapon),46);assert.equal((await forgeReceipt(f.env,f.user,body.requestId,'ENHANCE')).level,14);
 });
 test(prefix+': inventory uses configured high-level power for ordering and pagination; double-star rule stays intact',async t=>{
  const f=await advancedFixture(t,postgres);await f.p("UPDATE character_equipment_items SET code='EMPEROR_TOP' WHERE id=1").run();assert.equal((await quote(f)).cost.itemQuantity,4);
  await level(f,15);await f.p("INSERT INTO character_equipment_items(id,code,name,slot,rarity,image_url,total_power,pve_power,pvp_power) VALUES(2,'BASE_30000','기본 3만','WEAPON','MYTHIC','/test.png',30000,27000,3000)").run();
  await f.p("INSERT INTO user_equipment_instances(user_id,equipment_id,source_type,request_id) VALUES(7,2,'TEST','second')").run();
  const first=await readForgePreparationInventory(f.DB,7,{includeEnhancement:true,limit:1});assert.equal(first.items[0].instanceId,f.instanceId);assert.equal(first.items[0].enhancement.power.total,42000);
  const second=await readForgePreparationInventory(f.DB,7,{includeEnhancement:true,limit:1,beforeId:first.nextCursor});assert.equal(second.items[0].code,'BASE_30000');
 });
 test(prefix+': CMS manual scroll grant is replayable and catalog never overwrites an operator edit',async t=>{
  const f=await forgeFixture(t,{postgres}),body={userId:7,itemCode:weapon,amount:3,reason:'검수 지급',requestId:rid()};
  const first=await grantForgeTickets(f.env,{id:8,role:'OWNER'},body);assert.equal(first.balance,3);assert.equal((await grantForgeTickets(f.env,{id:8,role:'OWNER'},body)).replayed,true);
  await f.p("UPDATE inventory_items SET name='운영 이름' WHERE code=?",weapon).run();await ensureForgeScrollCatalog(f.env);assert.equal((await f.p('SELECT name FROM inventory_items WHERE code=?',weapon).first()).name,'운영 이름');
  assert.equal(await quantity(f,weapon),3);assert.equal(await quantity(f,armor),0);
 });
}
test('PostgreSQL cap migration: dry run, preserving existing +10, 15 allowed / 16 rejected, replayable catalog registration',async t=>{
 const f=await forgeFixture(t,{postgres:true});await level(f,10);
 await f.pg.exec('ALTER TABLE equipment_forge_states_v1 DROP CONSTRAINT equipment_forge_states_v1_level_check, ADD CONSTRAINT equipment_forge_states_v1_level_check CHECK(level BETWEEN 0 AND 10)');
 const expectedDatabase=(await f.pg.query('SELECT current_database() db')).rows[0].db,client={query:(sql,values)=>f.pg.query(sql,values)};
 const dry=await migrateForgeLevelCap(client,{expectedDatabase});assert.equal(dry.dryRun,true);await assert.rejects(()=>level(f,11));
 const result=await migrateForgeLevelCap(client,{apply:true,expectedDatabase});assert(result.changed);assert.equal((await f.p('SELECT level FROM equipment_forge_states_v1 WHERE instance_id=?',f.instanceId).first()).level,10);
 await level(f,15);await assert.rejects(()=>level(f,16));assert.equal((await migrateForgeLevelCap(client,{apply:true,expectedDatabase})).replayed,true);
 const catalog=await registerForgeScrolls(client,{apply:true,expectedDatabase});assert.equal(catalog.registered,2);assert.equal((await registerForgeScrolls(client,{apply:true,expectedDatabase})).replayed,true);assert.equal(await quantity(f,weapon),0);
});
