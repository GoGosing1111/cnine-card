import test from 'node:test';import assert from 'node:assert/strict';
import {packageFixture} from './helpers/support-package-fixture.mjs';
import {SUPPORT_PACKAGE,SUPPORT_PACKAGE_BONUS_CODE,SUPPORT_PACKAGE_LEGACY_BONUS_CODE,supportPackageBonus,supportPackageBonusKey,supportPackageBonusState,supportPackageCycleProgress,supportPackageWithBonus,supportPackageOrderProduct,supportPackageAdvanceBonus,SUPPORT_PACKAGE_SALES_ENDS_AT,supportPackageSalesOpen} from '../shared/support-package-v1.mjs';
const key=supportPackageBonusKey(2),T=1000000000000n;
const original=(paid,cubes=190)=>({version:1,policyCode:SUPPORT_PACKAGE_BONUS_CODE,paidPurchases:paid,totalBonusCoins:(BigInt(paid>=10?28000:paid>=5?20000:[0,1000,3000,6000,12000][paid])*T).toString(),totalBonusCubes:cubes,lastOrderId:'preserved-order',lastResetOperation:'preserved-reset'});
const state=async f=>{const row=await f.one('SELECT value FROM app_meta WHERE key=?',key);return row?JSON.parse(row.value):null;};
const order=async(f,quantity=1)=>{const r=await f.call('server-support/package/apply',{user:2,body:{requestId:crypto.randomUUID(),quantity}});assert.equal(r.status,200,JSON.stringify(r.body));return r.body.order;};
const snapshot=async f=>({state:await state(f),coin:(await f.one('SELECT CAST(coin AS TEXT) coin FROM users WHERE id=2')).coin,inventory:await f.all('SELECT * FROM cnine_user_inventory ORDER BY item_code'),coinLogs:await f.all('SELECT * FROM coin_logs ORDER BY id'),itemLogs:await f.all('SELECT * FROM inventory_logs ORDER BY item_code'),orders:await f.all("SELECT key,value FROM app_meta WHERE key LIKE 'support_package_order_v1:%' ORDER BY key")});

test('every ten purchases repeat all six tiers, including multi-cycle bulk and cycle boundaries',()=>{
 for(const [before,quantity,coins,cubes] of [[0,10,28000,190],[0,20,56000,380],[0,100,280000,1900],[9,1,8000,100],[9,2,9000,105],[10,1,1000,5],[19,2,9000,105],[4,7,17000,145],[8,5,14000,130],[9,100,280000,1900]]){
  const b=supportPackageBonus(before,quantity);assert.equal(b.coins,(BigInt(coins)*T).toString());assert.equal(b.cubes,cubes);assert.equal(b.cyclePurchasesAfter,(before+quantity)%10);
  assert.equal(b.milestones.reduce((n,t)=>n+t.cubes,0),cubes);assert.equal(b.milestones.reduce((n,t)=>n+BigInt(t.coins),0n).toString(),b.coins);
 }
 assert.equal(supportPackageBonus(10,100,SUPPORT_PACKAGE_LEGACY_BONUS_CODE).coins,'0');
 for(const args of [[-1,1],[0,101],[1.5,1],[Number.MAX_SAFE_INTEGER,1],[Number.MAX_SAFE_INTEGER-100,100]])assert.throws(()=>supportPackageBonus(...args));
});

test('existing completed counts start at one; partial progress, exact prior rewards and resets remain preserved',()=>{
 for(const n of [10,12,20,100]){const before=original(n),copy=structuredClone(before),b=supportPackageWithBonus(SUPPORT_PACKAGE,before).purchaseBonus;
  assert.equal(b.coins,(1000n*T).toString());assert.equal(b.cubes,5);assert.equal(b.cyclePurchasesBefore,0);assert.equal(b.cyclePurchasesAfter,1);assert.deepEqual(before,copy);
  const next=supportPackageAdvanceBonus(before,b,{orderId:'new-order',now:1});assert.equal(next.version,2);assert.equal(next.paidPurchases,n+1);assert.equal(next.totalBonusCoins,(29000n*T).toString());assert.equal(next.totalBonusCubes,195);assert.equal(next.lastResetOperation,before.lastResetOperation);
  assert.deepEqual(next.repeatBaseline,{paidPurchases:n,totalBonusCoins:before.totalBonusCoins,totalBonusCubes:190});assert.equal(supportPackageCycleProgress(next).paidPurchases,1);assert.equal(supportPackageWithBonus(SUPPORT_PACKAGE,next).purchaseBonus.coins,(2000n*T).toString());
  for(const corrupted of [{...next,paidPurchases:n},{...next,totalBonusCoins:'0'},{...next,totalBonusCubes:190},{...next,repeatBaseline:{...next.repeatBaseline,paidPurchases:n+2}}])assert.throws(()=>supportPackageBonusState(corrupted));
 }
 for(const [paid,cubes,grant,grantCubes] of [[0,0,1000,5],[1,5,2000,10],[4,50,8000,40],[5,90,0,0],[9,90,8000,100]]){const before=original(paid,cubes),b=supportPackageWithBonus(SUPPORT_PACKAGE,before).purchaseBonus;assert.equal(b.coins,(BigInt(grant)*T).toString());assert.equal(b.cubes,grantCubes);assert.equal(b.cyclePurchasesBefore,paid);}
});

for(const postgres of [false,true])test(`old completed counter rolls into recurring payouts; bulk, rejection and old receipt replay (${postgres?'PostgreSQL':'SQLite'})`,async()=>{
 const f=await packageFixture({postgres});try{f.clock.now=Date.parse('2026-11-20T12:00:00+09:00');await f.activate();await f.call('server-support/package',{user:2});const old=original(12);await f.run('INSERT INTO app_meta(key,value) VALUES(?,?)',key,JSON.stringify(old));
  const prior=await snapshot(f),q=f.queries.length,info=await f.call('server-support/package',{user:2});assert.equal(info.status,200);assert.deepEqual(info.body.bonusProgress,old);assert.deepEqual(await snapshot(f),prior);assert(!f.queries.slice(q).some(s=>/^\s*(?:INSERT|UPDATE|DELETE)\b/i.test(s)));
  const first=await order(f,10),requestId=crypto.randomUUID(),paid=await f.process(first,'FULFILL',requestId);assert.equal(paid.status,200,JSON.stringify(paid.body));assert.equal(paid.body.order.fulfillment.purchaseBonus.coins,(28000n*T).toString());assert.equal((await state(f)).paidPurchases,22);assert.equal(supportPackageCycleProgress(await state(f)).paidPurchases,0);
  const second=await order(f,11);assert.equal((await f.process(second)).status,200);const current=await state(f);assert.equal(current.paidPurchases,33);assert.equal(current.totalBonusCoins,(85000n*T).toString());assert.equal(current.totalBonusCubes,575);
  assert.equal((await f.one('SELECT CAST(coin AS TEXT) coin FROM users WHERE id=2')).coin,(67500n*T+1234n).toString());assert.equal(Number((await f.one("SELECT quantity FROM cnine_user_inventory WHERE item_code='SSS_MIRACLE_CUBE'")).quantity),385);
  const beforeReplay=await snapshot(f),start=f.queries.length,replay=await f.process(first,'FULFILL',requestId);assert.equal(replay.body.replayed,true);assert.deepEqual(replay.body.order,paid.body.order);assert.deepEqual(await snapshot(f),beforeReplay);assert(!f.queries.slice(start).some(s=>/^\s*(?:INSERT|UPDATE|DELETE)\b/i.test(s)));
  assert.equal((await f.process(await order(f),'REJECT')).status,200);assert.deepEqual(await state(f),current);
 }finally{await f.close();}
});

test('migration and crossed-cycle payment roll back with inventory/audit/receipt failure; duplicate approvals grant once',async()=>{
 const f=await packageFixture({postgres:true});try{await f.activate();const old=original(20);await f.run('INSERT INTO app_meta(key,value) VALUES(?,?)',key,JSON.stringify(old));const o=await order(f,100),before=await snapshot(f);
  for(const failure of ['INSERT INTO inventory_logs','INSERT INTO admin_logs']){
   f.fail(failure);assert.equal((await f.process(o)).status,503);f.fail(null);assert.deepEqual(await snapshot(f),before);
  }
  const originalBatch=f.DB.batch.bind(f.DB);let receiptFailures=0;
  f.DB.batch=async statements=>{const index=statements.findIndex(s=>s.source?.startsWith('INSERT INTO app_meta')&&s.values?.some(v=>String(v).startsWith('support_package_process_v1:')));if(index<0)return originalBatch(statements);receiptFailures++;return originalBatch([...statements.slice(0,index+1),f.DB.prepare('SELECT 1/0'),...statements.slice(index+1)]);};
  assert.equal((await f.process(o)).status,503);assert.equal(receiptFailures,1);f.DB.batch=originalBatch;assert.deepEqual(await snapshot(f),before);
  const requestId=crypto.randomUUID(),results=await Promise.all([f.process(o,'FULFILL',requestId),f.process(o,'FULFILL',requestId)]);assert(results.every(r=>r.status===200));assert(results.some(r=>r.body.replayed));
  assert.equal(Number((await f.one("SELECT quantity FROM cnine_user_inventory WHERE item_code='SSS_MIRACLE_CUBE'")).quantity),1900);assert.equal((await state(f)).totalBonusCubes,2090);assert.equal(Number((await f.one("SELECT COUNT(*) n FROM admin_logs WHERE action_type='SUPPORT_PACKAGE_FULFILL'")).n),1);
  const pending=await order(f),bad={...(await state(f)),totalBonusCoins:'0'};await f.run('UPDATE app_meta SET value=? WHERE key=?',JSON.stringify(bad),key);assert.equal((await f.process(pending)).status,409);
 }finally{await f.close();}
});

test('23 November is fully open; midnight on the 24th rejects new applications but preserves receipts',async()=>{
 assert.equal(SUPPORT_PACKAGE_SALES_ENDS_AT,Date.parse('2026-11-24T00:00:00+09:00'));for(const date of ['2026-11-19T00:00:00+09:00','2026-11-23T00:00:00+09:00','2026-11-23T23:59:59.999+09:00'])assert(supportPackageSalesOpen(Date.parse(date)));assert(!supportPackageSalesOpen(SUPPORT_PACKAGE_SALES_ENDS_AT));
 const f=await packageFixture({postgres:true});try{f.clock.now=SUPPORT_PACKAGE_SALES_ENDS_AT-1;await f.activate();const requestId=crypto.randomUUID(),applied=await f.call('server-support/package/apply',{user:2,body:{requestId,quantity:11}});assert.equal(applied.status,200);
  f.clock.now=SUPPORT_PACKAGE_SALES_ENDS_AT;assert.equal((await f.call('server-support/info',{user:2})).body.packageVisible,false);assert.equal((await f.call('server-support/package/apply',{user:2,body:{requestId:crypto.randomUUID(),quantity:11}})).status,410);assert.equal((await f.call('server-support/package/apply',{user:2,body:{requestId,quantity:11}})).body.replayed,true);assert.equal((await f.process(applied.body.order)).status,200);
 }finally{await f.close();}
});
