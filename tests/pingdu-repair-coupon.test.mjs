import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {forgeFixture} from './helpers/forge-db.mjs';
import {ensureForgeRepairCatalog,FORGE_REPAIR_ITEM as item,FORGE_REPAIR_CATALOG_MARKER as marker} from '../functions/_forge_repair_catalog.js';
import {ensureForgeProtectionCatalog,FORGE_PROTECTION_ITEM} from '../functions/_forge_protection_catalog.js';
import {ensureEmperorEnergyCatalog} from '../functions/_emperor_energy.js';
import {forgeAdminState} from './helpers/forge-held-runtime.mjs';
import {forgeQuote,executeForge,readForgeRuntime,saveForgeRuntime,forgeAccountState} from './helpers/forge-held-runtime.mjs';
import {FORGE_RUNTIME_KEY} from '../shared/equipment-forge-policy-v1.mjs';

const rid=()=>crypto.randomUUID();
const api=fs.readFileSync(new URL('../functions/api/[[path]].js',import.meta.url),'utf8');
const AsyncFunction=Object.getPrototypeOf(async function(){}).constructor;
const inventoryBody=api.slice(api.indexOf("    if(path==='inventory'){"),api.indexOf("    if(path==='inventory/seen'"));
const inventory=new AsyncFunction('deps',`const {env,request,authenticate,json,ensureForgeProtectionCatalog,FORGE_PROTECTION_ITEM,ensureForgeRepairCatalog,FORGE_REPAIR_ITEM,ensureEmperorEnergyCatalog}=deps;
const path='inventory',ensureSkillChipFoundation=async()=>{},ensureBattleSuitCoreCatalog=async()=>{},ensureUniqueAdvancementPassCatalog=async()=>{},ensureMysticEnergyCatalog=async()=>{},blackMiracleSettings=async()=>({enabled:false}),UNIQUE_ADVANCEMENT_PASS_CODE='UNIQUE_ADVANCEMENT_PASS';${inventoryBody}`);
const useStart=api.indexOf("    if(path==='inventory/use'&&request.method==='POST'){");
const useBody=api.slice(useStart,api.indexOf('      const usableCodes=',useStart))+'}';
const directUse=new AsyncFunction('deps',`const {env,request,authenticate,json,readBody,FORGE_REPAIR_ITEM}=deps;const path='inventory/use',UNIQUE_ADVANCEMENT_PASS_CODE='UNIQUE_ADVANCEMENT_PASS';${useBody}`);
const deps=f=>({env:f.env,request:new Request('https://qa.test/api/inventory'),authenticate:async()=>f.user,json:(body,status=200)=>({body,status}),ensureForgeProtectionCatalog,FORGE_PROTECTION_ITEM,ensureForgeRepairCatalog,FORGE_REPAIR_ITEM:item,ensureEmperorEnergyCatalog});
async function ready(t,postgres,quantity=2){
  const f=await forgeFixture(t,{postgres});await ensureForgeRepairCatalog(f.env);
  const policy={...f.policy,restoration:{enabled:true,coinCost:0,itemCode:item.code,itemQuantity:1,levelMode:'PREVIOUS',expiresHours:0}};
  await f.setting(FORGE_RUNTIME_KEY,policy);
  await f.p('INSERT INTO cnine_user_inventory(user_id,item_code,quantity,unseen_quantity) VALUES(7,?,?,?)',item.code,quantity,quantity).run();
  await f.p('INSERT INTO equipment_forge_states_v1(instance_id,user_id,level,revision) VALUES(?,7,8,1)',f.instanceId).run();
  const q=await forgeQuote(f.env,f.user,{requestId:rid(),kind:'ENHANCE',instanceId:f.instanceId});
  const destroyed=await executeForge(f.env,f.user,{requestId:rid(),quoteId:q.quoteId},'ENHANCE',{randomInt:()=>999999});
  return {...f,recordId:destroyed.recordId,restore:()=>forgeQuote(f.env,f.user,{requestId:rid(),kind:'RESTORE',recordId:destroyed.recordId})};
}

for(const postgres of [false,true]){
  const db=postgres?'PostgreSQL':'SQLite';
  test(`${db}: repair registration survives old gates without grants, policy changes or replacing operator metadata`,async t=>{
    const f=await forgeFixture(t,{postgres}),before=await readForgeRuntime(f.env,{draft:true});
    await f.p("INSERT INTO app_meta(key,value) VALUES('safe_runtime_upgrade_v2121_runtime_foundation_fast_gate','1'),('equipment_protection_catalog_20260922_v1','1')").run();
    const stock=(await f.p('SELECT * FROM cnine_user_inventory ORDER BY user_id,item_code').all()).results;
    await ensureForgeRepairCatalog(f.env);await ensureForgeRepairCatalog({...f.env});
    const row=await f.p('SELECT * FROM inventory_items WHERE code=?',item.code).first();
    assert.equal(row.name,item.name);assert.equal(row.category,'MATERIAL');assert.equal(row.image_url,item.image);
    assert.equal((await f.p('SELECT value FROM app_meta WHERE key=?',marker).first()).value,'1');
    assert.deepEqual(await readForgeRuntime(f.env,{draft:true}),before);
    assert.deepEqual((await f.p('SELECT * FROM cnine_user_inventory ORDER BY user_id,item_code').all()).results,stock);
    const cms=await forgeAdminState(f.env,before);assert.equal(cms.catalog.find(x=>x.code===item.code).image,item.image);
    const saved=await saveForgeRuntime(f.env,f.user,{...before,mode:'OFF',restoration:{enabled:false,coinCost:0,itemCode:item.code,itemQuantity:1,levelMode:'PREVIOUS',expiresHours:0}});
    assert.equal(saved.restoration.itemCode,item.code);assert.equal(saved.restoration.enabled,false);assert.equal(saved.mode,'OFF');
    assert.deepEqual(saved.steps,before.steps);assert.deepEqual(saved.protection,before.protection);
  });
  test(`${db}: catalog and marker roll back together and existing metadata is never overwritten`,async t=>{
    const f=await forgeFixture(t,{postgres});f.fail('INSERT INTO app_meta');
    await assert.rejects(()=>ensureForgeRepairCatalog(f.env),/INJECTED_FAILURE/);f.fail('');
    assert.equal(await f.p('SELECT code FROM inventory_items WHERE code=?',item.code).first(),null);
    assert.equal(await f.p('SELECT value FROM app_meta WHERE key=?',marker).first(),null);
    await f.p("INSERT INTO inventory_items(code,name,image_url,is_active) VALUES(?,'운영자 수정','/assets/custom.png',0)",item.code).run();
    await ensureForgeRepairCatalog(f.env);const row=await f.p('SELECT name,image_url,is_active FROM inventory_items WHERE code=?',item.code).first();
    assert.equal(row.name,'운영자 수정');assert.equal(row.image_url,'/assets/custom.png');assert.equal(Number(row.is_active),0);
  });
  test(`${db}: actual inventory API exposes only own quantities and refuses direct coupon consumption`,async t=>{
    const f=await forgeFixture(t,{postgres});await ensureForgeRepairCatalog(f.env);
    await f.p('INSERT INTO cnine_user_inventory(user_id,item_code,quantity,unseen_quantity) VALUES(7,?,2,1),(8,?,99,0)',item.code,item.code).run();
    const result=await inventory(deps(f)),coupon=result.body.items.find(x=>x.code===item.code);
    assert.equal(coupon.quantity,2);assert.equal(coupon.unseenQuantity,1);assert.equal(coupon.usable,false);assert.equal(coupon.image,item.image);assert.match(coupon.useDisabledMessage,/파괴 기록/);
    const denied=await directUse({...deps(f),request:new Request('https://qa.test/api/inventory/use',{method:'POST'}),readBody:async()=>({itemCode:item.code})});
    assert.equal(denied.status,400);assert.match(denied.body.error,/파괴 기록/);assert.equal(await f.qty(item.code),2);
    assert.equal((await inventory({...deps(f),env:{},authenticate:async()=>null})).status,401);
  });
  test(`${db}: a coupon restores +8 exactly once with zero coin cost and unlimited record age`,async t=>{
    const f=await ready(t,postgres),before=await f.coin();await f.p("UPDATE equipment_forge_destroyed_v1 SET destroyed_at='2000-01-01T00:00:00.000Z' WHERE record_id=?",f.recordId).run();
    const q=await f.restore(),body={requestId:rid(),quoteId:q.quoteId};
    assert.equal(q.cost.itemName,item.name);assert.equal(q.cost.itemImage,item.image);assert.equal(q.cost.itemQuantity,1);assert.equal(q.cost.coinCost,0);
    const r=await executeForge(f.env,f.user,body,'RESTORE');assert.equal(r.outcome,'RESTORED');assert.equal(r.level,8);assert.equal(await f.qty(item.code),1);assert.equal(await f.coin(),before);
    assert.equal((await executeForge(f.env,f.user,body,'RESTORE')).replayed,true);assert.equal(await f.qty(item.code),1);
    const state=await forgeAccountState(f.env,f.user);assert.equal(state.items.length,1);assert.equal(state.items[0].enhancement.level,8);assert.equal(state.items[0].equipped,false);
    assert.equal(Number((await f.p('SELECT COUNT(*) n FROM inventory_logs WHERE item_code=? AND change_amount=-1',item.code).first()).n),1);
    await assert.rejects(()=>f.restore(),{code:'FORGE_RECORD'});
  });
  test(`${db}: missing coupons, foreign records and disabled restore do not charge or create equipment`,async t=>{
    const f=await ready(t,postgres,0),before=await f.coin();
    await assert.rejects(()=>forgeQuote(f.env,{id:8,role:'OWNER'},{requestId:rid(),kind:'RESTORE',recordId:f.recordId}),{code:'FORGE_RECORD'});
    const q=await f.restore();await assert.rejects(()=>executeForge(f.env,f.user,{requestId:rid(),quoteId:q.quoteId},'RESTORE'),{code:'FORGE_MATERIAL'});
    const policy=await readForgeRuntime(f.env,{draft:true});policy.restoration.enabled=false;await f.setting(FORGE_RUNTIME_KEY,policy);
    await assert.rejects(()=>f.restore(),{code:'FORGE_RESTORE_OFF'});assert.equal(await f.coin(),before);assert.equal(await f.qty(item.code),0);
    assert.equal((await forgeAccountState(f.env,f.user)).items.length,0);
  });
  test(`${db}: restoration insertion failure rolls back coupon debit, logs and recovery record`,async t=>{
    const f=await ready(t,postgres),before=await f.coin(),q=await f.restore(),body={requestId:rid(),quoteId:q.quoteId};
    f.fail('INSERT INTO equipment_forge_states_v1');await assert.rejects(()=>executeForge(f.env,f.user,body,'RESTORE'),/INJECTED_FAILURE/);f.fail('');
    assert.equal(await f.qty(item.code),2);assert.equal(await f.coin(),before);assert.equal((await forgeAccountState(f.env,f.user)).items.length,0);
    assert.equal((await f.p('SELECT restored_instance_id FROM equipment_forge_destroyed_v1 WHERE record_id=?',f.recordId).first()).restored_instance_id,null);
    assert.equal(Number((await f.p('SELECT COUNT(*) n FROM inventory_logs WHERE item_code=?',item.code).first()).n),0);
    await executeForge(f.env,f.user,body,'RESTORE');assert.equal(await f.qty(item.code),1);assert.equal((await forgeAccountState(f.env,f.user)).items.length,1);
  });
  test(`${db}: two independent quotes cannot consume two coupons for the same destruction`,async t=>{
    const f=await ready(t,postgres),a=await f.restore(),b=await f.restore();
    await executeForge(f.env,f.user,{requestId:rid(),quoteId:a.quoteId},'RESTORE');
    await assert.rejects(()=>executeForge(f.env,f.user,{requestId:rid(),quoteId:b.quoteId},'RESTORE'),{code:'FORGE_RECORD'});
    assert.equal(await f.qty(item.code),1);assert.equal((await forgeAccountState(f.env,f.user)).items.length,1);
  });
}
test('live host and generator share the new coupon asset while retaining disabled restore',()=>{
  for(const file of ['equipment-forge/index.html','scripts/build-equipment-forge-public-v1.mjs']){
    const text=fs.readFileSync(new URL('../'+file,import.meta.url),'utf8');assert.ok(text.includes('/'+item.image));assert.match(text,/핑두 리페어 쿠폰/);assert.match(text,/id="restore-button"[^>]* disabled/);
  }
  assert.ok(fs.statSync(new URL('../'+item.image,import.meta.url)).size<100000);
});

async function opsFixture(t){
  const f=await forgeFixture(t,{postgres:true}),policy={...f.policy,revision:1,mode:'OFF',restoration:{enabled:false,coinCost:null,itemCode:null,itemQuantity:null,levelMode:'UNSET',expiresHours:null}};
  await f.setting(FORGE_RUNTIME_KEY,policy);await f.setting('equipment_forge_public_settings_v1',{revision:1,executionMode:'OFF',publicVisible:true});
  await f.p("INSERT INTO users(id,nickname,role) VALUES(1,'검수 OWNER','OWNER')").run();
  const sql=fs.readFileSync(new URL('../scripts/ops/pingdu-repair-policy-20260922.sql',import.meta.url),'utf8');
  // The production database-name guard is first verified; only its literal is
  // localized to PGlite's database for the subsequent exact SQL transaction.
  const database=(await f.pg.query('SELECT current_database() AS name')).rows[0].name;assert.match(database,/^[a-z0-9_]+$/);
  if(database!=='cnine')await assert.rejects(()=>f.pg.exec(sql),/WRONG_DATABASE/);
  return {...f,policy,sql:sql.replace("current_database() <> 'cnine'",`current_database() <> '${database}'`)};
}
test('approved one-time production SQL preserves OFF, all other costs and stock; reruns never reset edits',async t=>{
  const f=await opsFixture(t),stock=(await f.p('SELECT * FROM cnine_user_inventory ORDER BY user_id,item_code').all()).results;
  await f.pg.exec(f.sql);const saved=await readForgeRuntime(f.env,{draft:true});
  assert.equal(saved.revision,2);assert.equal(saved.mode,'OFF');assert.equal(saved.restoration.enabled,false);
  assert.deepEqual(saved.restoration,{enabled:false,coinCost:0,itemCode:item.code,itemQuantity:1,levelMode:'PREVIOUS',expiresHours:0});
  assert.deepEqual(saved.steps,f.policy.steps);assert.deepEqual(saved.protection,{...f.policy.protection,sources:saved.protection.sources});
  assert.deepEqual((await f.p('SELECT * FROM cnine_user_inventory ORDER BY user_id,item_code').all()).results,stock);
  const later={...saved,revision:3,quoteSeconds:180};await f.setting(FORGE_RUNTIME_KEY,later);await f.pg.exec(f.sql);
  assert.deepEqual(await readForgeRuntime(f.env,{draft:true}),later);
  assert.equal(Number((await f.p("SELECT COUNT(*) n FROM admin_logs WHERE action_type='PINGDU_REPAIR_POLICY'").first()).n),1);
});
test('production SQL rejects concurrent policy changes and rolls catalog/policy back when audit fails',async t=>{
  const f=await opsFixture(t);await f.setting(FORGE_RUNTIME_KEY,{...f.policy,revision:2});await assert.rejects(()=>f.pg.exec(f.sql),/POLICY_CHANGED/);
  await f.setting(FORGE_RUNTIME_KEY,f.policy);
  await f.pg.exec("CREATE FUNCTION deny_repair_audit() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'AUDIT_REJECTED'; END $$; CREATE TRIGGER deny_repair_audit BEFORE INSERT ON admin_logs FOR EACH ROW EXECUTE FUNCTION deny_repair_audit();");
  await assert.rejects(()=>f.pg.exec(f.sql),/AUDIT_REJECTED/);
  assert.equal(await f.p('SELECT code FROM inventory_items WHERE code=?',item.code).first(),null);
  assert.equal((await readForgeRuntime(f.env,{draft:true})).revision,1);
  assert.equal(await f.p('SELECT value FROM app_meta WHERE key=?',marker).first(),null);
  assert.equal(await f.p("SELECT value FROM app_meta WHERE key='ops:pingdu-repair-policy:20260922:v1'").first(),null);
});
