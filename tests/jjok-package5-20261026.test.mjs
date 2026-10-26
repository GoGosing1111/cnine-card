import test from 'node:test';
import assert from 'node:assert/strict';
import {SUPPORT_PACKAGE} from '../shared/support-package-v1.mjs';
import {processPackage} from '../functions/_support_package.js';
import {OP,PLAN,PENDING,TARGET,completePendingOrder} from '../scripts/ops/jjok-package5-20261026.mjs';
const pending=()=>({version:1,id:PENDING.id,userId:303,nickname:TARGET.nickname,product:structuredClone(SUPPORT_PACKAGE),status:'PENDING',revision:PENDING.revision,createdAt:1000,eligibleUntil:9999999999999});

test('five 1+1 purchases include the pending request and retain its original application data',()=>{
 const before=pending(),copy=structuredClone(before),order=completePendingOrder(before,2000);
 assert.deepEqual(before,copy);assert.equal(order.id,before.id);assert.equal(order.createdAt,before.createdAt);assert.equal(order.eligibleUntil,before.eligibleUntil);assert.deepEqual(order.product,before.product);
 assert.equal(order.status,'FULFILLED');assert.equal(order.revision,before.revision+1);assert.equal(order.processedBy,1);assert.equal(order.operationalGrant.operationKey,OP);
 assert.equal(order.fulfillment.purchaseQuantity,5);assert.equal(order.fulfillment.packageQuantity,10);assert.equal(order.fulfillment.priceWon,249000);assert.equal(order.fulfillment.coins,1000000000000000);
 assert.deepEqual(order.fulfillment.items.map(i=>[i.code,i.quantity]),[['EMPEROR_ENERGY',2000],['MERCENARY_SSS_LIMITED_SHARD',50]]);assert.equal(PLAN.coins,String(order.fulfillment.coins));
});

test('changed recipient, request, status, revision or product cannot complete the pinned application',()=>{
 for(const patch of [{id:'303_other_order_12345678'},{userId:304},{nickname:'다른계정'},{status:'FULFILLED'},{status:'REJECTED'},{revision:PENDING.revision+1},{product:{...SUPPORT_PACKAGE,coins:1}}])assert.throws(()=>completePendingOrder({...pending(),...patch},2000));
});

test('the normal CMS processing route refuses the fulfilled bulk application before any write',async()=>{
 const order=completePendingOrder(pending(),2000),queries=[];
 const env={DB:{prepare(sql){assert.match(sql,/^SELECT\b/);queries.push(sql);return {bind(key){return {first:async()=>key==='support_package_order_v1:'+PENDING.id?{value:JSON.stringify(order)}:null};}};}}};
 await assert.rejects(processPackage(env,{id:1,role:'OWNER',status:'ACTIVE',nickname:'핑크빛유두'},{requestId:'jjok_cms_replay_20261026',orderId:PENDING.id,expectedRevision:PENDING.revision,action:'FULFILL',note:'중복 요청 검증'},3000),{code:'SUPPORT_PACKAGE_REVISION'});
 assert.equal(queries.length,2);
});
