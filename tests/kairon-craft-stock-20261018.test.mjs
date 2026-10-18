import test from 'node:test';
import assert from 'node:assert/strict';
import {equipmentFixture} from './helpers/workshop-equipment-fixture.mjs';
import {saveKaironCraft,readKaironCraft,readKaironCraftStock,decorateMercenaryCraft} from '../functions/_mercenary_craft.js';
import {__workshopCraftTest} from '../functions/_workshop.js';
import {KAIRON_CRAFT_LIMIT,kaironCraftStock} from '../shared/mercenary-craft-v1.mjs';
const configured=(extra={})=>({code:'WORKSHOP_KAIRON',category:'MERCENARY_CRAFT',outputType:'MERCENARY',outputRef:'V-988',outputQuantity:1,paymentMode:'BOTH',craftRevision:0,coinCost:1000,masterStarCost:2,successRate:100,materials:[{itemCode:'QA_MATERIAL',quantity:3}],isActive:true,isPublic:true,...extra});
async function fixture(t,postgres=false){
 const f=await equipmentFixture(t,postgres),recipeId=await saveKaironCraft(f.env,f.user,configured());
 return {...f,recipeId,craft:(requestId,user=f.user)=>__workshopCraftTest.craft(f.env,user,{recipeId,requestId,paymentType:'BOTH'}),stock:()=>readKaironCraftStock(f.env)};
}
const inventory=async(f,userId=7)=>(await f.p('SELECT item_code,quantity FROM cnine_user_inventory WHERE user_id=? ORDER BY item_code',userId).all()).results;

test('five lifetime craft slots include historical success, exclude failed attempts and direct exceptions',async t=>{
 const f=await fixture(t,true);assert.equal(KAIRON_CRAFT_LIMIT,5);
 const first=await f.craft('historical-success');assert.equal(first.success,true);
 await f.p("INSERT INTO user_mercenary_cards_v1(user_id,mercenary_code,total_copies,duplicate_count,first_obtained_at,last_obtained_at) VALUES(8,'V-988',1,0,'direct','direct')").run();
 await f.p("INSERT INTO mercenary_card_acquisitions_v1 VALUES('ops:direct-gift',8,'V-988',0,1,0,'direct')").run();
 await saveKaironCraft(f.env,f.user,configured({craftRevision:1,successRate:0}));
 assert.equal((await f.craft('failed-attempt')).success,false);
 const recipe=(await decorateMercenaryCraft(f.env,[],{admin:true}))[0];
 assert.deepEqual(recipe.craftStock,{limit:5,crafted:1,remaining:4,soldOut:false});assert.equal(recipe.craftLocked,false);
 assert.equal((await readKaironCraft(f.env)).policy.successRate,0);
 assert.equal(Number((await f.p('SELECT COUNT(*) n FROM mercenary_card_acquisitions_v1').first()).n),2);
});

test('the fifth success exhausts crafting; a completed request still replays and rejected attempts charge nothing',async t=>{
 const f=await fixture(t,true);let last;
 for(let i=1;i<=5;i++)last=await f.craft('slot-'+i);
 assert.equal(last.state.recipes.find(r=>r.code==='WORKSHOP_KAIRON').craftStock.remaining,0);
 const before={coin:await f.coin(),inventory:await inventory(f)},policy=await readKaironCraft(f.env);
 await assert.rejects(f.craft('sixth'),/5장|수량.*소진/);assert.equal((await f.craft('slot-5')).replayed,true);
 assert.deepEqual({coin:await f.coin(),inventory:await inventory(f)},before);
 assert.deepEqual(await readKaironCraft(f.env),policy);
 assert.deepEqual(await f.stock(),{limit:5,crafted:5,remaining:0,soldOut:true});
 const card=await f.p("SELECT total_copies,duplicate_count FROM user_mercenary_cards_v1 WHERE user_id=7 AND mercenary_code='V-988'").first();assert.equal(Number(card.total_copies),5);assert.equal(Number(card.duplicate_count),4);
 const recipe=(await decorateMercenaryCraft(f.env,[],{admin:true}))[0];assert.equal(recipe.craftLocked,true);assert.equal(recipe.is_active,0);assert.match(recipe.lockReason,/5장.*소진/);
});

test('different accounts racing the last slot yield one success and no charge for the losing request',async t=>{
 const f=await fixture(t);for(let i=0;i<4;i++)await f.craft('prior-'+i);
 const before=new Map();for(const id of [7,8])before.set(id,{coin:await f.coin(id),inventory:await inventory(f,id)});
 const results=await Promise.allSettled([f.craft('last-a'),f.craft('last-b',{...f.user,id:8})]);
 assert.equal(results.filter(r=>r.status==='fulfilled').length,1);assert.equal(results.filter(r=>r.status==='rejected').length,1);
 const loser=results[0].status==='rejected'?7:8;assert.match(results[loser===7?0:1].reason.message,/소진/);
 assert.deepEqual({coin:await f.coin(loser),inventory:await inventory(f,loser)},before.get(loser));assert.equal((await f.stock()).crafted,5);
 assert.equal(Number((await f.p("SELECT COUNT(*) n FROM mercenary_card_acquisitions_v1 WHERE mercenary_code='V-988'").first()).n),5);
});

test('an acquisition failure rolls back costs and keeps the last craft slot available',async t=>{
 const f=await fixture(t,true);for(let i=0;i<4;i++)await f.craft('prior-'+i);
 const before={coin:await f.coin(),inventory:await inventory(f),stock:await f.stock()};
 f.fail('INSERT INTO mercenary_card_acquisitions_v1');await assert.rejects(f.craft('rollback-last'),/INJECTED_FAILURE/);f.fail('');
 assert.deepEqual({coin:await f.coin(),inventory:await inventory(f),stock:await f.stock()},before);
 assert.equal((await f.craft('actual-last')).success,true);assert.equal((await f.stock()).remaining,0);
});

test('existing excess successes display zero and stay locked without rewriting prior records',()=>{
 assert.deepEqual(kaironCraftStock(7),{limit:5,crafted:7,remaining:0,soldOut:true});
 assert.throws(()=>kaironCraftStock(-1));assert.throws(()=>kaironCraftStock(Number.NaN));
});
