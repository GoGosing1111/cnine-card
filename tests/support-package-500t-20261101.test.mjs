import test from 'node:test';
import assert from 'node:assert/strict';
import {packageFixture} from './helpers/support-package-fixture.mjs';
import {SUPPORT_PACKAGE,SUPPORT_PACKAGE_NOVEMBER_BOGO,SUPPORT_PACKAGE_SCROLLS_400_BOGO,supportPackageOrderProduct} from '../shared/support-package-v1.mjs';
test('both earlier November products receive 500 trillion per paid unit without changing items or original snapshots; completed receipts replay unchanged',async()=>{
 const f=await packageFixture({postgres:true});try{await f.activate();
 for(const product of [SUPPORT_PACKAGE_NOVEMBER_BOGO,SUPPORT_PACKAGE_SCROLLS_400_BOGO]){
  const order={...(await f.call('server-support/package/apply',{user:2,body:{requestId:crypto.randomUUID(),quantity:2}})).body.order,product};
  await f.run('UPDATE app_meta SET value=? WHERE key=?',JSON.stringify(order),'support_package_order_v1:'+order.id);
  const view=supportPackageOrderProduct(order);assert.equal(view.coins,1000000000000000);assert.deepEqual(view.items,product.items.map(i=>({...i,quantity:i.quantity*2})));
  assert.equal(supportPackageOrderProduct({...order,status:'FULFILLED'}).coins,800000000000000);
  const rid=crypto.randomUUID(),paid=await f.process(order,'FULFILL',rid);assert.equal(paid.status,200,JSON.stringify(paid.body));assert.deepEqual(paid.body.order.product,product);assert.deepEqual(paid.body.order.fulfillment,view);
  const n=f.queries.length,replay=await f.process(order,'FULFILL',rid);assert.equal(replay.body.replayed,true);assert.deepEqual(replay.body.order,paid.body.order);assert(!f.queries.slice(n).some(q=>/^\s*(INSERT|UPDATE|DELETE)\b/.test(q)));
 }
 assert.equal(SUPPORT_PACKAGE.coins,500000000000000);assert.equal(supportPackageOrderProduct({product:SUPPORT_PACKAGE,quantity:100}).coins,'50000000000000000');
 }finally{await f.close();}
});
