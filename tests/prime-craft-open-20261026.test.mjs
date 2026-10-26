import test from 'node:test';
import assert from 'node:assert/strict';
import {equipmentFixture} from './helpers/workshop-equipment-fixture.mjs';
import {ensurePrimeMaterialCatalog} from '../functions/_mercenary_prime_material.js';
import {saveMercenaryCraft,decorateMercenaryCraft,mercenaryCraftStockGuard} from '../functions/_mercenary_craft.js';
import {PRIME_CRAFT_KEY,PRIME_RECIPE_CODE,mercenaryCraftDefinition} from '../shared/mercenary-craft-v1.mjs';
import {__workshopCraftTest} from '../functions/_workshop.js';
import {activate,inspect,protectedState,OP} from '../scripts/ops/prime-craft-open-20261026.mjs';
const card='MERCENARY_PRIME_DEPLETED_CARD',blueprint='PRIME_REQUIEM_BLUEPRINT';
export const configured=(extra={})=>({code:PRIME_RECIPE_CODE,category:'MERCENARY_CRAFT',outputType:'MERCENARY',outputRef:'V-975',outputQuantity:1,paymentMode:'BOTH',craftRevision:0,coinCost:150000000000000,masterStarCost:0,successRate:100,materials:[{itemCode:card,quantity:1},{itemCode:blueprint,quantity:1}],isActive:true,isPublic:true,...extra});
async function fixture(t,{active=true,postgres=true}={}){
 const f=await equipmentFixture(t,postgres);await ensurePrimeMaterialCatalog(f.env);
 await f.p("INSERT INTO inventory_items(code,name,category,image_url,is_active) VALUES(?,'프라임 레퀴엠 설계도','MATERIAL','assets/items/prime-requiem-blueprint-v1.webp',1)",blueprint).run();
 await f.p('UPDATE users SET coin=600000000000000').run();
 for(const item of [card,blueprint])await f.p('INSERT INTO cnine_user_inventory(user_id,item_code,quantity,unseen_quantity) VALUES(7,?,3,3)',item).run();
 const recipeId=await saveMercenaryCraft(f.env,f.user,configured({isActive:active}));
 const craft=requestId=>__workshopCraftTest.craft(f.env,f.user,{recipeId,requestId,paymentType:'BOTH'});
 const state=async()=>({coin:await f.coin(),card:await f.quantity(card),blueprint:await f.quantity(blueprint),owned:Number((await f.p("SELECT total_copies FROM user_mercenary_cards_v1 WHERE user_id=7 AND mercenary_code='V-975'").first())?.total_copies||0)});
 return {...f,recipeId,craft,state};
}
test('configured Prime crafts with exact existing cost and both materials; replay never charges twice',async t=>{
 const f=await fixture(t);const row=(await decorateMercenaryCraft(f.env,[])).find(r=>r.code===PRIME_RECIPE_CODE);assert.equal(row.craftReleaseLocked,false);assert.equal(row.craftLocked,false);
 assert.equal((await f.craft('prime-success')).success,true);assert.deepEqual(await f.state(),{coin:450000000000000,card:2,blueprint:2,owned:1});
 assert.equal((await f.craft('prime-success')).replayed,true);assert.deepEqual(await f.state(),{coin:450000000000000,card:2,blueprint:2,owned:1});
});
test('missing blueprint and disabled/public-off policies cannot consume or grant',async t=>{
 const f=await fixture(t);await f.p('UPDATE cnine_user_inventory SET quantity=0 WHERE user_id=7 AND item_code=?',blueprint).run();let before=await f.state();await assert.rejects(f.craft('missing-blueprint'));assert.deepEqual(await f.state(),before);
 await f.p('UPDATE cnine_user_inventory SET quantity=3 WHERE user_id=7 AND item_code=?',blueprint).run();
 for(const [revision,extra] of [[1,{isActive:false}],[2,{isPublic:false}]]){await saveMercenaryCraft(f.env,f.user,configured({craftRevision:revision,...extra}));before=await f.state();await assert.rejects(f.craft('blocked-'+revision));assert.deepEqual(await f.state(),before);}
 await assert.rejects(saveMercenaryCraft(f.env,{...f.user,role:'ADMIN'},configured({craftRevision:3})),/OWNER/);
});
test('grant audit failure rolls back costs and inventory; failed guard stays failed',async t=>{
 const f=await fixture(t),before=await f.state();f.fail('INSERT INTO mercenary_card_acquisitions_v1');await assert.rejects(f.craft('grant-failure'),/INJECTED/);f.fail('');assert.deepEqual(await f.state(),before);
 await f.p("INSERT INTO workshop_craft_guards_v1668(guard_id,user_id,recipe_id,verified) VALUES('invalid',7,1,0)").run();await mercenaryCraftStockGuard(f.env.DB,'invalid',mercenaryCraftDefinition(PRIME_RECIPE_CODE)).run();assert.equal(Number((await f.p("SELECT verified FROM workshop_craft_guards_v1668 WHERE guard_id='invalid'").first()).verified),0);
});
test('two requests competing for one material pair produce one paid card',async t=>{
 const f=await fixture(t,{postgres:false});await f.p('UPDATE cnine_user_inventory SET quantity=1 WHERE user_id=7 AND item_code IN (?,?)',card,blueprint).run();
 const results=await Promise.allSettled([f.craft('race-a'),f.craft('race-b')]);assert.equal(results.filter(r=>r.status==='fulfilled').length,1);assert.deepEqual(await f.state(),{coin:450000000000000,card:0,blueprint:0,owned:1});
});
test('activation is atomic, preserves recipe economics, rejects stale reads and replays read-only',async t=>{
 const f=await fixture(t,{active:false});await f.pg.exec("ALTER TABLE users ADD COLUMN status TEXT DEFAULT 'ACTIVE'");
 const before=await inspect(f.pg),protectedBefore=await protectedState(f.pg),wallet=await f.state();
 await assert.rejects(activate(f.pg,{expectedRaw:'stale'}),/changed/);assert.deepEqual(await inspect(f.pg),before);
 const dry=await activate(f.pg,{expectedRaw:before.raw});assert(dry.rolledBack);assert.deepEqual(await inspect(f.pg),before);
 await f.pg.exec("ALTER TABLE app_meta ADD CONSTRAINT reject_prime_receipt CHECK(key<>'"+OP+"')");await assert.rejects(activate(f.pg,{expectedRaw:before.raw,dryRun:false}));await f.pg.exec('ALTER TABLE app_meta DROP CONSTRAINT reject_prime_receipt');assert.deepEqual(await inspect(f.pg),before);
 const applied=await activate(f.pg,{expectedRaw:before.raw,dryRun:false});assert(applied.committed);assert.equal(applied.receipt.after.policy.isActive,true);assert.deepEqual(await f.state(),wallet);assert.deepEqual(await protectedState(f.pg),protectedBefore);
 const replay=await activate({query(sql,args){assert.match(sql,/^SELECT/);return f.pg.query(sql,args);}});assert(replay.replayed);assert.equal(replay.auditId,applied.receipt.auditId);
 assert.equal((await f.craft('after-ops')).success,true);
});
