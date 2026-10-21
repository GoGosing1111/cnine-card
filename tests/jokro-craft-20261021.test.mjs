import test from 'node:test';
import assert from 'node:assert/strict';
import {equipmentFixture} from './helpers/workshop-equipment-fixture.mjs';
import {mercenaryFixture} from './helpers/mercenary-db.mjs';
import {mercenaryAccountState,saveMercenaryLoadout,loadMercenaryBattleSnapshot,rankedOwnedMercenaries} from '../functions/_mercenary_account.js';
import {ensureLimitedPackSchema} from '../functions/_mercenary_limited_pack.js';
import {readJokroPackOwners} from '../functions/_mercenary_jokro_access.js';
import {JOKRO_RECIPE_CODE,JOKRO_CRAFT_KEY,jokroCraftDraft,mercenaryCraftDefinition} from '../shared/mercenary-craft-v1.mjs';
import {saveMercenaryCraft,readMercenaryCraft,readMercenaryCraftStock,decorateMercenaryCraft,saveKaironCraft} from '../functions/_mercenary_craft.js';
import {__workshopCraftTest} from '../functions/_workshop.js';
import {prepareJokroCraft} from '../scripts/ops/jokro-craft-prepare-20261021.mjs';
const definition=mercenaryCraftDefinition(JOKRO_RECIPE_CODE);
const raw=(extra={})=>({code:JOKRO_RECIPE_CODE,category:'MERCENARY_CRAFT',outputType:'MERCENARY',outputRef:'V-979',outputQuantity:1,paymentMode:'BOTH',craftRevision:0,...jokroCraftDraft(),...extra});
async function fixture(t,postgres=true){
 const f=await equipmentFixture(t,postgres);await ensureLimitedPackSchema(f.env);
 await f.p("INSERT INTO inventory_items(code,name,category,is_active) VALUES('MERCENARY_SSS_CARD_SHARD','SSS 용병 카드 조각','MATERIAL',1)").run();
 for(const id of [7,8]){
  await f.p("UPDATE cnine_user_inventory SET quantity=100000000,unseen_quantity=100000000 WHERE user_id=? AND item_code='MASTER_STAR'",id).run();
  await f.p("INSERT INTO cnine_user_inventory(user_id,item_code,quantity,unseen_quantity) VALUES(?,'MERCENARY_SSS_CARD_SHARD',100,100)",id).run();
 }
 await f.p("INSERT INTO mercenary_limited_stock_v1(code,stock_limit,issued,revision) VALUES('V-979',3,0,0)").run();
 const save=(extra={})=>saveMercenaryCraft(f.env,f.user,raw(extra)),stock=()=>readMercenaryCraftStock(f.env,definition);
 const balance=async(id=7)=>({coin:await f.coin(id),inventory:(await f.p("SELECT item_code,quantity FROM cnine_user_inventory WHERE user_id=? ORDER BY item_code",id).all()).results});
 const craft=(recipeId,requestId,user=f.user)=>__workshopCraftTest.craft(f.env,user,{recipeId,requestId,paymentType:'BOTH'});
 return {...f,save,stock,balance,craft};
}
test('prepared Jokro is OFF/hidden with exact requested economics; Kairon settings and two policies remain separate',async t=>{
 const f=await fixture(t),before=await f.balance();
 const k=await saveKaironCraft(f.env,f.user,{...raw(),code:'WORKSHOP_KAIRON',outputRef:'V-988',masterStarCost:1000000,successRate:2,isActive:true,isPublic:true});
 const kp=(await f.p("SELECT value FROM app_meta WHERE key='mercenary_kairon_craft_v1'").first()).value;
 const id=await f.save(),p=(await readMercenaryCraft(f.env,definition)).policy;
 assert.equal(p.coinCost,1e12);assert.equal(p.masterStarCost,1e7);assert.equal(p.successRate,1);assert.deepEqual(p.materials,[{itemCode:'MERCENARY_SSS_CARD_SHARD',quantity:15}]);assert.equal(p.isActive,false);assert.equal(p.isPublic,false);
 assert.deepEqual((await decorateMercenaryCraft(f.env,[],{admin:false})).map(r=>r.id),[k]);
 const recipes=await decorateMercenaryCraft(f.env,[],{admin:true}),j=recipes.find(r=>r.code===JOKRO_RECIPE_CODE);
 assert.equal(recipes.length,2);assert.deepEqual(j.craftStock,{limit:2,crafted:0,remaining:2,soldOut:false});assert(j.craftLocked);
 await assert.rejects(f.craft(id,'off'),/제작할 수 없는/);assert.deepEqual(await f.balance(),before);
 await assert.rejects(saveMercenaryCraft(f.env,{id:8,role:'ADMIN'},raw()),/OWNER/);
 for(const change of [{outputRef:'V-988'},{outputQuantity:2},{paymentMode:'COIN_ONLY'},{code:'WORKSHOP_UNKNOWN'},{cardShardCost:1}])await assert.rejects(f.save({...change,craftRevision:1}));
 await assert.rejects(f.save({craftRevision:0}),/변경/);assert.equal((await f.p("SELECT value FROM app_meta WHERE key='mercenary_kairon_craft_v1'").first()).value,kp);
});
test('1 percent boundary; failed attempts consume exact inputs, success gets a usable Jokro, replay and OFF never recharge',async t=>{
 const f=await fixture(t),id=await f.save({isActive:true,isPublic:true}),before=await f.balance();
 const original=Math.random;let failed,success;
 try{Math.random=()=>0.01;failed=await f.craft(id,'one-percent-miss');Math.random=()=>0.009999;success=await f.craft(id,'one-percent-hit');}finally{Math.random=original;}
 assert.equal(failed.success,false);assert.equal(success.success,true);assert.equal(success.output.ref,'V-979');assert.equal(success.output.quantity,1);
 assert.equal((await f.stock()).crafted,1);assert.equal(await f.coin(),before.coin-2e12);
 assert.equal(Number((await f.p("SELECT quantity FROM cnine_user_inventory WHERE user_id=7 AND item_code='MASTER_STAR'").first()).quantity),8e7);
 assert.equal(Number((await f.p("SELECT quantity FROM cnine_user_inventory WHERE user_id=7 AND item_code='MERCENARY_SSS_CARD_SHARD'").first()).quantity),70);
 assert.equal((await readJokroPackOwners(f.env,[7,8])).has(7),true);
 const stock=await f.p("SELECT * FROM mercenary_limited_stock_v1 WHERE code='V-979'").first();assert.equal(Number(stock.issued),0);assert.equal(Number(stock.stock_limit),3);
 const paid=await f.balance();await f.save({craftRevision:1});assert.equal((await f.craft(id,'one-percent-hit')).replayed,true);assert.deepEqual(await f.balance(),paid);
 await f.p("UPDATE workshop_craft_receipts_v1668 SET status='PENDING' WHERE request_id='one-percent-hit'").run();assert.equal((await readJokroPackOwners(f.env,[7])).has(7),false);
 await f.p("UPDATE workshop_craft_receipts_v1668 SET status='COMPLETED' WHERE request_id='one-percent-hit'").run();assert.equal((await readJokroPackOwners(f.env,[7])).has(7),true);
});
test('two craft successes are the global limit; cross-account last-slot race has no losing charge',async t=>{
 const f=await fixture(t,false),id=await f.save({successRate:100,isActive:true,isPublic:true});await f.craft(id,'first');
 const balances=await Promise.all([f.balance(7),f.balance(8)]),results=await Promise.allSettled([f.craft(id,'second-a'),f.craft(id,'second-b',{...f.user,id:8})]);
 assert.equal(results.filter(r=>r.status==='fulfilled').length,1);const loser=results.findIndex(r=>r.status==='rejected');assert.match(results[loser].reason.message,/소진/);assert.deepEqual(await f.balance(7+loser),balances[loser]);
 assert.deepEqual(await f.stock(),{limit:2,crafted:2,remaining:0,soldOut:true});await assert.rejects(f.craft(id,'third'),/2장|소진/);
 assert.equal(Number((await f.p("SELECT COUNT(*) n FROM mercenary_card_acquisitions_v1 WHERE mercenary_code='V-979'").first()).n),2);
});
test('grant failure rolls back currencies, materials, holdings and craft count; no partial receipt authorizes access',async t=>{
 const f=await fixture(t),id=await f.save({successRate:100,isActive:true,isPublic:true}),before=await f.balance();
 f.fail('INSERT INTO mercenary_card_acquisitions_v1');await assert.rejects(f.craft(id,'rollback'),/INJECTED_FAILURE/);f.fail('');
 assert.deepEqual(await f.balance(),before);assert.equal((await f.stock()).crafted,0);
 assert.equal(Number((await f.p("SELECT COUNT(*) n FROM user_mercenary_cards_v1 WHERE mercenary_code='V-979'").first()).n),0);
 assert.equal((await f.craft(id,'after-rollback')).success,true);assert.equal((await f.stock()).crafted,1);
});
test('insufficient SSS fragments or Master Stars cannot charge coins or consume a craft slot',async t=>{
 const f=await fixture(t),id=await f.save({isActive:true,isPublic:true});
 await f.p("UPDATE cnine_user_inventory SET quantity=14 WHERE item_code='MERCENARY_SSS_CARD_SHARD' AND user_id=7").run();
 const before=await f.balance();await assert.rejects(f.craft(id,'missing-shards'),/재료.*부족/);assert.deepEqual(await f.balance(),before);
 await f.p("UPDATE cnine_user_inventory SET quantity=100 WHERE item_code='MERCENARY_SSS_CARD_SHARD' AND user_id=7").run();
 await f.p("UPDATE cnine_user_inventory SET quantity=9999999 WHERE item_code='MASTER_STAR' AND user_id=7").run();
 const lowStars=await f.balance();await assert.rejects(f.craft(id,'missing-stars'),/별.*부족/);assert.deepEqual(await f.balance(),lowStars);assert.equal((await f.stock()).crafted,0);
});
test('a real craft recipient is visible, deployable in PVE/PVP and available in ranked ownership; a stray holding stays blocked',async t=>{
 const f=await fixture(t);
 await f.p("DELETE FROM cnine_user_inventory WHERE item_code='MASTER_STAR'").run();await f.p("DELETE FROM inventory_items WHERE code='MASTER_STAR'").run();
 await mercenaryFixture(t,{base:f});await f.p("UPDATE cnine_user_inventory SET quantity=100000000 WHERE item_code='MASTER_STAR'").run();
 const id=await f.save({successRate:100,isActive:true,isPublic:true});await f.craft(id,'actual-recipient');
 await f.p("INSERT INTO user_mercenary_cards_v1 VALUES(8,'V-979',1,0,'stray','stray')").run();
 const card=(await mercenaryAccountState(f.env,f.user)).cards.find(c=>c.code==='V-979');assert.equal(card.canDeploy,true);assert.equal(card.exclusiveGrant,false);
 assert.equal((await mercenaryAccountState(f.env,{id:8})).cards.length,0);assert.equal((await rankedOwnedMercenaries(f.env,[7])).get(7)[0].code,'V-979');
 for(const mode of ['PVE','PVP']){await saveMercenaryLoadout(f.env,f.user,{requestId:crypto.randomUUID(),mode,mercenaryCode:'V-979',revision:0});assert.equal((await loadMercenaryBattleSnapshot(f.env,f.user,mode)).code,'V-979');}
});
test('production preparation dry-run rolls back; apply is audited, OFF, idempotent and never changes pack stock or accounts',async t=>{
 const f=await fixture(t),before=await f.balance(),pack=await f.p("SELECT * FROM mercenary_limited_stock_v1 WHERE code='V-979'").first();
 await f.pg.exec("ALTER TABLE users ADD COLUMN status TEXT DEFAULT 'ACTIVE'");
 const dry=await prepareJokroCraft(f.pg);assert.equal(dry.dryRun,true);assert.equal(await f.p('SELECT value FROM app_meta WHERE key=?',JOKRO_CRAFT_KEY).first(),null);
 const applied=await prepareJokroCraft(f.pg,{apply:true});assert(applied.auditId);assert.equal(applied.policy.isActive,false);assert.equal(applied.policy.isPublic,false);
 const again=await prepareJokroCraft(f.pg,{apply:true});assert.equal(again.alreadyPrepared,true);assert.equal(again.recipeId,applied.recipeId);
 assert.deepEqual(await f.balance(),before);assert.deepEqual(await f.p("SELECT * FROM mercenary_limited_stock_v1 WHERE code='V-979'").first(),pack);
});
