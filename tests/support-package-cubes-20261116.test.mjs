import test from 'node:test';import assert from 'node:assert/strict';
import {packageFixture} from './helpers/support-package-fixture.mjs';
import {SUPPORT_PACKAGE,SUPPORT_PACKAGE_NOVEMBER6,SUPPORT_PACKAGE_BONUS_TIERS,SUPPORT_PACKAGE_BONUS_CODE,supportPackageBonus,supportPackageBonusState,supportPackageBonusKey,supportPackageWithBonus,supportPackageOrderProduct} from '../shared/support-package-v1.mjs';
const key=supportPackageBonusKey(2),cube='SSS_MIRACLE_CUBE';
const state=async f=>{const r=await f.one('SELECT value FROM app_meta WHERE key=?',key);return r?JSON.parse(r.value):null;};
const cubeCount=async f=>Number((await f.one('SELECT quantity FROM cnine_user_inventory WHERE user_id=2 AND item_code=?',cube))?.quantity??0);
const order=async(f,quantity=1)=>(await f.call('server-support/package/apply',{user:2,body:{requestId:crypto.randomUUID(),quantity}})).body.order;
test('existing six milestones add 5/10/15/20/40/100 cubes without changing coins, base items or older campaigns',()=>{
 assert.deepEqual(SUPPORT_PACKAGE_BONUS_TIERS.map(t=>[t.purchases,t.cubes]),[[1,5],[2,10],[3,15],[4,20],[5,40],[10,100]]);
 for(const [count,total] of [[0,0],[1,5],[2,15],[3,30],[4,50],[5,90],[9,90],[10,190],[20,380],[100,1900]])assert.equal(supportPackageBonus(0,count).cubes,total);
 assert.equal(supportPackageBonus(4,6).cubes,140);assert.equal(supportPackageBonus(10,100).cubes,1900);
 assert.equal(supportPackageBonus(0,10).coins,'28000000000000000');assert(!SUPPORT_PACKAGE.items.some(i=>i.code===cube));
 assert(!supportPackageWithBonus(SUPPORT_PACKAGE_NOVEMBER6,0).items.some(i=>i.code===cube));assert.deepEqual(supportPackageOrderProduct({product:SUPPORT_PACKAGE_NOVEMBER6,status:'FULFILLED'}),SUPPORT_PACKAGE_NOVEMBER6);
});
test('bulk approval grants cumulative cubes, logs once, replays read-only and rejection leaves rewards unchanged',async()=>{
 const f=await packageFixture({postgres:true});try{await f.activate();const o=await order(f,10),requestId=crypto.randomUUID();
  const quote=(await f.call('admin/server-support/package')).body.pending[0].quotedFulfillment;assert.equal(quote.items.find(i=>i.code===cube).quantity,190);
  const r=await f.process(o,'FULFILL',requestId);assert.equal(r.status,200);assert.equal(await cubeCount(f),190);assert.equal((await state(f)).totalBonusCubes,190);assert.deepEqual(r.body.order.fulfillment,quote);
  assert.equal(Number((await f.one('SELECT COUNT(*) n FROM inventory_logs WHERE item_code=?',cube)).n),1);
  const start=f.queries.length;assert((await f.process(o,'FULFILL',requestId)).body.replayed);assert(!f.queries.slice(start).some(q=>/^\s*(INSERT|UPDATE|DELETE)\b/.test(q)));
  assert.equal((await f.process(await order(f),'REJECT')).status,200);assert.equal(await cubeCount(f),190);assert.equal((await state(f)).paidPurchases,10);
  assert.equal((await f.process(await order(f,100))).status,200);assert.equal(await cubeCount(f),2090);assert.equal((await state(f)).totalBonusCubes,2090);
 }finally{await f.close();}
});
test('successive milestones grant only newly crossed cube tiers',async()=>{
 const f=await packageFixture({postgres:false});try{await f.activate();for(const [quantity,total] of [[1,5],[1,15],[1,30],[1,50],[1,90],[4,90],[1,190]]){assert.equal((await f.process(await order(f,quantity))).status,200);assert.equal(await cubeCount(f),total);assert.equal((await state(f)).totalBonusCubes,total);}}finally{await f.close();}
});
test('pre-cube count stays valid; payment during retrospective work records only the cubes actually granted',async()=>{
 const f=await packageFixture({postgres:true});try{await f.activate();const original={version:1,policyCode:SUPPORT_PACKAGE_BONUS_CODE,paidPurchases:4,totalBonusCoins:'12000000000000000',lastOrderId:'historical'};
  await f.run('INSERT INTO app_meta(key,value) VALUES(?,?)',key,JSON.stringify(original));assert.deepEqual(supportPackageBonusState(original),original);
  assert.equal((await f.process(await order(f))).status,200);const after=await state(f);assert.equal(after.paidPurchases,5);assert.equal(after.totalBonusCubes,40);assert.equal(await cubeCount(f),40);
  assert.equal(supportPackageBonus(after.paidPurchases,0).totalEarnedCubes-after.totalBonusCubes,50);
  assert.throws(()=>supportPackageBonusState({...after,totalBonusCubes:91}));assert.throws(()=>supportPackageBonusState({...after,totalBonusCubes:-1}));assert.throws(()=>supportPackageBonusState({...after,totalBonusCubes:0.5}));
 }finally{await f.close();}
});
test('missing cube catalog and audit failure roll back money, prior materials, counter and cube together',async()=>{
 const f=await packageFixture({postgres:true});try{await f.activate();const o=await order(f,5);
  await f.run('UPDATE inventory_items SET is_active=0 WHERE code=?',cube);assert.equal((await f.process(o)).status,503);await f.run('UPDATE inventory_items SET is_active=1 WHERE code=?',cube);
  f.fail('INSERT INTO admin_logs');assert.equal((await f.process(o)).status,503);f.fail(null);
  assert.equal(await state(f),null);assert.equal(await cubeCount(f),0);assert.equal(Number((await f.one('SELECT COUNT(*) n FROM cnine_user_inventory')).n),0);assert.equal((await f.one('SELECT CAST(coin AS TEXT) coin FROM users WHERE id=2')).coin,'1234');
  assert.equal((await f.process(o)).status,200);assert.equal(await cubeCount(f),90);
 }finally{await f.close();}
});
