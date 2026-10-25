import test from 'node:test';
import assert from 'node:assert/strict';
import {bloodmoonFixture} from './helpers/bloodmoon-pack-fixture.mjs';
import {equipmentFixture} from './helpers/workshop-equipment-fixture.mjs';
import {PRIME_MATERIAL,PRIME_CRAFT_RELEASE_ENABLED,isPrimeMaterialDraw} from '../shared/mercenary-prime-material-v1.mjs';
import {BLOODMOON_PACK,bloodmoonReceiptResults,BLOODMOON_PACK_RELEASE_ENABLED} from '../shared/mercenary-bloodmoon-pack-v1.mjs';
import {bloodmoonResultsMarkup} from '../js/mercenary-bloodmoon-presentation-v2.mjs';
import {MERCENARY_CRAFTS,PRIME_CRAFT_KEY,PRIME_RECIPE_CODE,mercenaryCraftDraft,mercenaryCraftRecipe,mercenaryCraftStock,validateMercenaryCraft} from '../shared/mercenary-craft-v1.mjs';
import {saveMercenaryCraft,requireMercenaryCraft,decorateMercenaryCraft,mercenaryCraftGrantStatements} from '../functions/_mercenary_craft.js';
import {ensurePrimeMaterialCatalog} from '../functions/_mercenary_prime_material.js';
import {__workshopCraftTest} from '../functions/_workshop.js';
import {bloodmoonSsOnceKey} from '../functions/_mercenary_bloodmoon_once.js';

const prime=MERCENARY_CRAFTS.find(d=>d.recipeCode===PRIME_RECIPE_CODE);
async function fixture(t){
 const f=await bloodmoonFixture(t);
 await f.pg.exec('ALTER TABLE app_meta ADD COLUMN updated_at TEXT');
 f.settings.cardRatesPpm=Object.fromEntries(Object.keys(f.settings.cardRatesPpm).map(code=>[code,code==='V-975'?1000000:0]));await f.configure();
 f.items=async()=>Number((await f.p('SELECT quantity FROM cnine_user_inventory WHERE user_id=1 AND item_code=?',PRIME_MATERIAL.code).first())?.quantity||0);
 f.owned=async()=>Number((await f.p("SELECT total_copies FROM user_mercenary_cards_v1 WHERE user_id=1 AND mercenary_code='V-975'").first())?.total_copies||0);
 return f;
}
for(const count of [1,10,100000])test(`${count} draws award only depleted Prime items, preserve the slot and replay once`,async t=>{
 const f=await fixture(t);let request=f.body(count);
 if(count===100000){f.settings.prices={single:1e9,ten:1e10};await f.configure();await f.pg.exec('UPDATE users SET coin=200000000000000 WHERE id=1');request.budget='100000000000000';}
 const before=await f.coin(),started=performance.now(),receipt=await f.service.open(f.env,f.user,request),elapsed=performance.now()-started;
 const items=receipt.draws.filter(isPrimeMaterialDraw);assert.equal(items.length,Math.min(count,3));assert.equal(await f.items(),items.length);assert.equal(await f.owned(),0);
 assert(items.every(r=>r.name===PRIME_MATERIAL.name&&!r.mercenaryCode));assert.equal(await f.coin(),before-receipt.coinCost);
 assert.equal(Number((await f.p("SELECT COUNT(*) n FROM mercenary_card_acquisitions_v1 WHERE mercenary_code='V-975'").first()).n),0);
 assert.equal(Number((await f.p("SELECT issued FROM mercenary_limited_stock_v1 WHERE code='V-975'").first()).issued),items.length);
 const replay=await f.service.open(f.env,f.user,request);assert.deepEqual(replay.draws,receipt.draws);assert.equal(await f.items(),items.length);assert.equal(await f.coin(),before-receipt.coinCost);
 const rows=bloodmoonReceiptResults(receipt),markup=bloodmoonResultsMarkup(rows,BLOODMOON_PACK.image);assert(rows.filter(r=>r.kind==='ITEM').every(r=>r.artUrl==='/'+PRIME_MATERIAL.image));assert.match(markup,/제작 재료 · 제작 잠금/);assert(!markup.includes('프라임 레퀴엠</strong>'));
 if(count===100000){assert.equal(receipt.normalDraws.reduce((n,r)=>n+r.quantity,0),99997);assert(JSON.stringify(receipt).length<20000);t.diagnostic(`100,000 draws in isolated PGlite: ${elapsed.toFixed(1)}ms; no production transactions`);}
});
test('inventory failure rolls back stock, coins, logs and items; lost commit acknowledgement does not duplicate',async t=>{
 const f=await fixture(t),request=f.body(10);f.fail('INSERT INTO inventory_logs');await assert.rejects(f.service.open(f.env,f.user,request),/INJECTED/);
 assert.equal(await f.items(),0);assert.equal(await f.coin(),1e6);assert.equal(Number((await f.p("SELECT issued FROM mercenary_limited_stock_v1 WHERE code='V-975'").first()).issued),0);
 f.fail('');f.loseAck();const r=await f.service.open(f.env,f.user,request);assert.equal(r.draws.filter(isPrimeMaterialDraw).length,3);assert.equal(await f.items(),3);assert.equal(await f.owned(),0);
 assert.equal(Number((await f.p('SELECT COUNT(*) n FROM coin_logs').first()).n),1);
});
test('a legacy unpaid plan converts to material without rerolling or changing payment',async t=>{
 const f=await fixture(t),request=f.body();f.fail('INSERT INTO inventory_logs');await assert.rejects(f.service.open(f.env,f.user,request));f.fail('');
 const row=await f.p('SELECT plan_json FROM joint_operations_v1 WHERE request_id=?',request.requestId).first(),plan=JSON.parse(row.plan_json),draw=plan.draws[0];
 delete draw.kind;delete draw.itemCode;delete draw.stockCode;draw.mercenaryCode='V-975';draw.name='프라임 레퀴엠';draw.sourceArt='old-art';
 await f.p('UPDATE joint_operations_v1 SET plan_json=? WHERE request_id=?',JSON.stringify(plan),request.requestId).run();
 const receipt=await f.service.open(f.env,f.user,request);assert(isPrimeMaterialDraw(receipt.draws[0]));assert.equal(await f.items(),1);assert.equal(await f.owned(),0);assert.equal(receipt.coinCost,100);
});
test('the last material serial is issued once during a two-account race; exhausted slot becomes ordinary SSS',async t=>{
 const f=await fixture(t);await f.pg.exec("UPDATE mercenary_limited_stock_v1 SET issued=2 WHERE code='V-975'");
 const rows=await Promise.all([f.service.open(f.env,f.user,f.body()),f.service.open(f.env,{id:2},f.body())]);
 assert.equal(rows.flatMap(r=>r.draws).filter(isPrimeMaterialDraw).length,1);assert.equal(rows.flatMap(r=>r.draws).filter(r=>r.edition==='STANDARD'&&r.rank==='SSS').length,1);
 assert.equal(await f.coin(1),999900);assert.equal(await f.coin(2),999900);assert.equal(await f.owned(),0);
});
test('an armed Prime slot grants and consumes the material atomically',async t=>{
 const f=await fixture(t),armed={version:3,status:'ARMED',remaining:1,userId:1,packId:BLOODMOON_PACK.id,operationId:'fixture-prime-operation',actorId:1,rank:'SSS',edition:'SSS_LIMITED',mercenaryCode:'V-975',slotIndex:5};
 await f.setting(bloodmoonSsOnceKey(1),armed);const r=await f.service.open(f.env,f.user,f.body(10));assert(isPrimeMaterialDraw(r.draws[5]));
 const saved=JSON.parse((await f.p('SELECT value FROM app_meta WHERE key=?',bloodmoonSsOnceKey(1)).first()).value);assert.equal(saved.status,'CONSUMED');assert.equal(saved.itemCode,PRIME_MATERIAL.code);assert.equal(await f.owned(),0);
});
test('material receipts fail closed when their inventory audit is absent',async t=>{
 const f=await fixture(t),r=await f.service.open(f.env,f.user,f.body());await f.p('DELETE FROM inventory_logs WHERE item_code=?',PRIME_MATERIAL.code).run();
 await assert.rejects(f.service.receipt(f.env,f.user,r.requestId),e=>e.code==='MERCENARY_BLOODMOON_RECEIPT');assert.equal(await f.items(),1);
});
test('pre-change completed receipts and directly owned Prime cards remain mercenaries',async t=>{
 const f=await fixture(t),r=await f.service.open(f.env,f.user,f.body());
 await f.pg.exec("INSERT INTO user_mercenary_cards_v1 VALUES(1,'V-975',1,0,'before','before')");
 const row=await f.p('SELECT plan_json FROM joint_operations_v1 WHERE request_id=?',r.requestId).first(),plan=JSON.parse(row.plan_json);plan.draws=[{outcomeId:'BLOODMOON_SSS',mercenaryCode:'V-975',name:'프라임 레퀴엠',rank:'SSS',edition:'SSS_LIMITED',quantity:1,stockLimit:3}];
 await f.p('UPDATE joint_operations_v1 SET plan_json=? WHERE request_id=?',JSON.stringify(plan),r.requestId).run();
 await f.p("INSERT INTO mercenary_card_acquisitions_v1 VALUES(?,1,'V-975',0,1,0,'before')",r.requestId+':0').run();
 const legacy=await f.service.receipt(f.env,f.user,r.requestId),view=bloodmoonReceiptResults(legacy);assert.equal(view[0].kind,'MERCENARY');assert.match(view[0].artUrl,/v-975-640/);assert.equal(await f.owned(),1);
});
test('Prime craft is visible but has no invented quantity, costs, rate, or limit and cannot be enabled',async t=>{
 assert.equal(PRIME_CRAFT_RELEASE_ENABLED,false);assert.equal(BLOODMOON_PACK_RELEASE_ENABLED,true);
 const draft=mercenaryCraftDraft(prime),recipe=mercenaryCraftRecipe(prime,draft,{},mercenaryCraftStock(prime));
 assert.deepEqual(draft.materials,[{itemCode:PRIME_MATERIAL.code,quantity:null}]);for(const key of ['coinCost','masterStarCost','successRate'])assert.equal(draft[key],null);
 assert.equal(recipe.craftLocked,true);assert.equal(recipe.is_public,1);assert.equal(recipe.output_ref,'V-975');assert.equal(recipe.craftStock.limit,null);assert.equal(recipe.craftStock.remaining,null);
 assert.throws(()=>validateMercenaryCraft({...draft,materials:[]},prime),/재료/);assert.throws(()=>validateMercenaryCraft({...draft,coinCost:0,masterStarCost:0,successRate:100,materials:[{itemCode:PRIME_MATERIAL.code,quantity:1}],isActive:true},prime),/잠금/);
 assert.throws(()=>mercenaryCraftGrantStatements({}, {userId:1,requestId:'blocked',guardId:'blocked'},prime),/잠겨/);
 const f=await equipmentFixture(t);await ensurePrimeMaterialCatalog(f.env);await ensurePrimeMaterialCatalog(f.env);
 await f.p('INSERT INTO cnine_user_inventory(user_id,item_code,quantity,unseen_quantity) VALUES(7,?,10,10)',PRIME_MATERIAL.code).run();
 const raw={code:PRIME_RECIPE_CODE,category:'MERCENARY_CRAFT',outputType:'MERCENARY',outputRef:'V-975',outputQuantity:1,paymentMode:'BOTH',craftRevision:0,...draft};
 const id=await saveMercenaryCraft(f.env,f.user,raw);assert.equal(id,-975);
 const rows=await decorateMercenaryCraft(f.env,[]);assert(rows.some(r=>r.code===PRIME_RECIPE_CODE&&r.craftLocked));
 const coin=await f.coin();await assert.rejects(__workshopCraftTest.craft(f.env,f.user,{recipeId:id,requestId:'blocked-prime',paymentType:'BOTH'}));assert.equal(await f.coin(),coin);assert.equal(await f.quantity(PRIME_MATERIAL.code),10);
 await assert.rejects(requireMercenaryCraft(f.env,{...recipe,craftLocked:false}));
 const value=JSON.parse((await f.p('SELECT value FROM app_meta WHERE key=?',PRIME_CRAFT_KEY).first()).value);assert.equal(value.isActive,false);assert.equal(value.materials[0].quantity,null);
});
