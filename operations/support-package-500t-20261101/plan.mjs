import assert from 'node:assert/strict';import {OP,hash,validate} from './grant.mjs';
export function buildPlan(report){
 assert.equal(report.clock.kst,'2026-11-01');assert.equal(report.receipts.length,0);const targets=[];
 for(const user of report.targets){const orders=[];
  for(const row of report.today.filter(r=>String(r.order.userId)===user.id)){
   const o=row.order,quantity=o.quantity??1;assert.equal(o.status,'FULFILLED');assert.equal(o.fulfillment.packageQuantity,quantity*2);assert.equal(o.fulfillment.priceWon,49800*quantity);
   if(BigInt(o.fulfillment.coins)===500000000000000n*BigInt(quantity))continue;
   assert(['SEASON_PASS_PACKAGE_20261101','SEASON_PASS_PACKAGE_20261101_SCROLLS'].includes(o.product.code));assert.equal(BigInt(o.fulfillment.coins),400000000000000n*BigInt(quantity));
   const logs=report.logs.filter(l=>l.reason==='시즌패스 패키지 구매 '+o.id&&l.user_id===user.id);assert.equal(logs.length,1);assert.equal(logs[0].change_amount,String(o.fulfillment.coins));
   orders.push({key:row.key,raw:row.value,hash:hash(row.value),quantity,beforeCoins:String(o.fulfillment.coins),amount:(100000000000000n*BigInt(quantity)).toString(),log:logs[0]});
  }
  if(orders.length){const {coin,...identity}=user;targets.push({...identity,orders,amount:orders.reduce((n,o)=>n+BigInt(o.amount),0n).toString()});}
 }
 const plan={operationKey:OP,authorization:'총 500조 (250조+250조로 변경) 금일 지급자 차액분 추가 지급',dateKst:'2026-11-01',sourceCutoff:report.checkedAt,sourceHash:hash(report),targetCoinsPerPurchase:'500000000000000',delivery:'DIRECT',sendMessages:false,logFloor:report.logFloor,targets,recipients:targets.map(t=>({userId:t.id,nickname:t.nickname})),totalAmount:targets.reduce((n,t)=>n+BigInt(t.amount),0n).toString()};validate(plan);return plan;
}
