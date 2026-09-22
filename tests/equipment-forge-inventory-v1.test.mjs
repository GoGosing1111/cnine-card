import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {forgeFixture} from './helpers/forge-db.mjs';
import {ensureForgeProtectionCatalog,FORGE_PROTECTION_ITEM,FORGE_PROTECTION_CATALOG_MARKER} from '../functions/_forge_protection_catalog.js';
import {ensureForgeRepairCatalog,FORGE_REPAIR_ITEM} from '../functions/_forge_repair_catalog.js';
import {forgeAdminState} from '../functions/_equipment_forge_cms.js';
import {saveForgeRuntime,readForgeRuntime} from '../functions/_equipment_forge_transactions.js';

const api=fs.readFileSync(new URL('../functions/api/[[path]].js',import.meta.url),'utf8');
// Exercise the actual inventory route SQL and response mapping, not a copied query.
const body=api.slice(api.indexOf("    if(path==='inventory'){"),api.indexOf("    if(path==='inventory/seen'"));
assert(body.includes('ensureForgeProtectionCatalog'));
const AsyncFunction=Object.getPrototypeOf(async function(){}).constructor;
const inventoryRoute=new AsyncFunction('deps',`const {env,request,authenticate,json,ensureForgeProtectionCatalog,FORGE_PROTECTION_ITEM,ensureForgeRepairCatalog,FORGE_REPAIR_ITEM}=deps;
const path='inventory',ensureSkillChipFoundation=async()=>{},ensureBattleSuitCoreCatalog=async()=>{},ensureUniqueAdvancementPassCatalog=async()=>{},ensureMysticEnergyCatalog=async()=>{},blackMiracleSettings=async()=>({enabled:false}),UNIQUE_ADVANCEMENT_PASS_CODE='UNIQUE_ADVANCEMENT_PASS';${body}`);

for(const postgres of [false,true]){
  const label=postgres?'PostgreSQL':'SQLite';
  test(`${label}: protection catalog is registered beyond the old fast gate, idempotently and without grants or policy changes`,async t=>{
    const f=await forgeFixture(t,{postgres}),before=await readForgeRuntime(f.env,{draft:true});
    await f.p("INSERT INTO app_meta(key,value) VALUES('safe_runtime_upgrade_v2121_runtime_foundation_fast_gate','1')").run();
    const stock=(await f.p('SELECT * FROM cnine_user_inventory ORDER BY user_id,item_code').all()).results;
    await ensureForgeProtectionCatalog(f.env);await ensureForgeProtectionCatalog({...f.env});
    const row=await f.p('SELECT * FROM inventory_items WHERE code=?',FORGE_PROTECTION_ITEM.code).first();
    assert.equal(row.name,FORGE_PROTECTION_ITEM.name);assert.equal(row.category,'MATERIAL');assert.equal(row.image_url,FORGE_PROTECTION_ITEM.image);assert.equal(Number(row.is_active),1);
    assert.equal((await f.p('SELECT value FROM app_meta WHERE key=?',FORGE_PROTECTION_CATALOG_MARKER).first()).value,'1');
    assert.deepEqual((await f.p('SELECT * FROM cnine_user_inventory ORDER BY user_id,item_code').all()).results,stock);
    assert.deepEqual(await readForgeRuntime(f.env,{draft:true}),before);assert.equal(await f.coin(),10000000);
    const catalog=await forgeAdminState(f.env,before),item=catalog.catalog.find(item=>item.code===FORGE_PROTECTION_ITEM.code);
    assert.equal(item.image,FORGE_PROTECTION_ITEM.image);assert.equal(item.is_active,1);
    const saved=await saveForgeRuntime(f.env,f.user,{...before,protection:{...before.protection,itemCode:item.code}});
    assert.equal(saved.protection.itemCode,item.code);assert.equal(catalog.executionMode,'OFF');
  });
  test(`${label}: failed catalog registration cannot leave a completion marker and operator metadata is preserved`,async t=>{
    const f=await forgeFixture(t,{postgres});f.fail('INSERT INTO app_meta');
    await assert.rejects(()=>ensureForgeProtectionCatalog(f.env),/INJECTED_FAILURE/);f.fail('');
    assert.equal(await f.p('SELECT code FROM inventory_items WHERE code=?',FORGE_PROTECTION_ITEM.code).first(),null);
    assert.equal(await f.p('SELECT value FROM app_meta WHERE key=?',FORGE_PROTECTION_CATALOG_MARKER).first(),null);
    await f.p("INSERT INTO inventory_items(code,name,image_url,is_active) VALUES(?,'운영자 지정 이름','/assets/custom.png',0)",FORGE_PROTECTION_ITEM.code).run();
    await ensureForgeProtectionCatalog(f.env);
    const row=await f.p('SELECT name,image_url,is_active FROM inventory_items WHERE code=?',FORGE_PROTECTION_ITEM.code).first();
    assert.equal(row.name,'운영자 지정 이름');assert.equal(row.image_url,'/assets/custom.png');assert.equal(Number(row.is_active),0);
  });
  test(`${label}: actual inventory route returns owned protection artwork and quantity but no direct-use action`,async t=>{
    const f=await forgeFixture(t,{postgres});
    await f.p('INSERT INTO cnine_user_inventory(user_id,item_code,quantity,unseen_quantity) VALUES(7,?,3,1)',FORGE_PROTECTION_ITEM.code).run();
    await f.p('INSERT INTO cnine_user_inventory(user_id,item_code,quantity) VALUES(8,?,99)',FORGE_PROTECTION_ITEM.code).run();
    const deps={env:f.env,request:new Request('https://qa.test/api/inventory'),authenticate:async()=>f.user,json:(body,status=200)=>({body,status}),ensureForgeProtectionCatalog,FORGE_PROTECTION_ITEM,ensureForgeRepairCatalog,FORGE_REPAIR_ITEM};
    const response=await inventoryRoute(deps),item=response.body.items.find(item=>item.code===FORGE_PROTECTION_ITEM.code);
    assert.equal(response.status,200);assert.equal(item.quantity,3);assert.equal(item.unseenQuantity,1);assert.equal(item.image,FORGE_PROTECTION_ITEM.image);assert.equal(item.usable,false);assert.match(item.useDisabledMessage,/장비 강화/);
    assert.equal(await f.qty(FORGE_PROTECTION_ITEM.code),3);assert.equal(await f.coin(),10000000);
    assert.equal((await inventoryRoute({...deps,authenticate:async()=>null,env:{}})).status,401);
  });
}
test('live scrolling host and generator keep the same accessible region without modifying approved artwork',()=>{
  for(const name of ['equipment-forge/index.html','scripts/build-equipment-forge-public-v1.mjs']){
    const html=fs.readFileSync(new URL('../'+name,import.meta.url),'utf8');
    assert.match(html,/id="inventory-scroll" class="inventory-scroll" role="region" aria-labelledby="inventory-heading" tabindex="0"/);
    assert.match(html,/id="inventory-more"[^]*?더 불러오기 ↓<\/button><\/div><div class="inventory-footer">/);
    assert.ok(html.includes('/'+FORGE_PROTECTION_ITEM.image));
  }
  assert.ok(fs.statSync(new URL('../'+FORGE_PROTECTION_ITEM.image,import.meta.url)).size<100000,'small inventory asset');
});
