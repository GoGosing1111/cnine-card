import test from 'node:test';
import assert from 'node:assert/strict';
import {equipmentFixture} from './helpers/workshop-equipment-fixture.mjs';
import {saveMercenaryCraft} from '../functions/_mercenary_craft.js';
import {__workshopCraftTest} from '../functions/_workshop.js';

const ordinary='MERCENARY_SSS_CARD_SHARD',limited='MERCENARY_SSS_LIMITED_SHARD';
async function setup(t,material,successRate){
  const f=await equipmentFixture(t);
  for(const code of [ordinary,limited]){
    await f.p("INSERT INTO inventory_items(code,name,category,is_active) VALUES(?,?,'MATERIAL',1)",code,code).run();
    await f.p('INSERT INTO cnine_user_inventory(user_id,item_code,quantity,unseen_quantity) VALUES(7,?,20,20)',code).run();
  }
  const id=await saveMercenaryCraft(f.env,f.user,{code:'WORKSHOP_JOKRO',category:'MERCENARY_CRAFT',outputType:'MERCENARY',outputRef:'V-979',outputQuantity:1,paymentMode:'BOTH',craftRevision:0,coinCost:100,masterStarCost:10,successRate,materials:[{itemCode:material,quantity:5}],isActive:true,isPublic:true});
  return {...f,attempt:requestId=>__workshopCraftTest.craft(f.env,f.user,{recipeId:id,requestId,paymentType:'BOTH'})};
}
for(const successRate of [0,100])test(`CMS-selected LIMITED shards are consumed on ${successRate?'success':'failure'}; ordinary shards remain and replay never charges again`,async t=>{
  const f=await setup(t,limited,successRate),coin=await f.coin();
  const result=await f.attempt('limited-material-receipt');
  assert.equal(result.success,successRate===100);assert.equal(result.category,'MERCENARY_CRAFT');
  assert.equal(await f.quantity(limited),15);assert.equal(await f.quantity(ordinary),20);assert.equal(await f.quantity('MASTER_STAR'),90);assert.equal(await f.coin(),coin-100);
  if(result.success)assert.equal(result.output.name,'족로');else assert.equal(result.output,null);
  const replay=await f.attempt('limited-material-receipt');assert.equal(replay.replayed,true);assert.equal(replay.success,result.success);
  assert.equal(await f.quantity(limited),15);assert.equal(await f.coin(),coin-100);
});
test('LIMITED shards cannot replace missing ordinary shards without an explicit CMS material change',async t=>{
  const f=await setup(t,ordinary,100),coin=await f.coin();
  await f.p('UPDATE cnine_user_inventory SET quantity=0 WHERE user_id=7 AND item_code=?',ordinary).run();
  await assert.rejects(f.attempt('no-implicit-exchange'),/재료.*부족/);
  assert.equal(await f.quantity(limited),20);assert.equal(await f.quantity('MASTER_STAR'),100);assert.equal(await f.coin(),coin);
});
