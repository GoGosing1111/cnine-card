import test from 'node:test';
import assert from 'node:assert/strict';
import {packageFixture} from './helpers/support-package-fixture.mjs';
import {readPackageCoinAccounting,requirePredictionCoins,packageCoinGuardStatements} from '../functions/_package_coin_accounting.js';
import {SUPPORT_PACKAGE,SUPPORT_PACKAGE_CURRENT_UNIT,SUPPORT_PACKAGE_NOVEMBER_BOGO,SUPPORT_PACKAGE_UNIT,SUPPORT_PACKAGE_LEGACY_BOGO,SUPPORT_PACKAGE_EVENT_DEADLINE,supportPackageClientAllowed} from '../shared/support-package-v1.mjs';
const nativeAgents=['Mozilla/5.0 ReverseCallStore/onestore/1.0.0','Mozilla/5.0 (Windows NT 10.0; Win64; x64) ReverseCallStore/onestore/1.0.0 Electron/32.0.0'];
test('direct Windows and Android clients plus browser/PWA user agents expose and submit the same offer, preserving eligibility and deadline',async()=>{
 const f=await packageFixture({postgres:true});try{
  f.clock.now=Date.parse('2026-11-01T12:00:00+09:00');await f.activate();
  const agents=['Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Reversecall/0.1.10 Chrome/130.0.0 Electron/32.0.0 Safari/537.36','Mozilla/5.0 (Linux; Android 14; Pixel 8; wv) AppleWebKit/537.36 ReverseCallAndroid/1.1.0','Mozilla/5.0 (Linux; Android 14) Chrome/130.0.0 Mobile Safari/537.36','Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) Version/18.0 Mobile/15E148 Safari/604.1'];
  const call=async(agent,path,body,user=2)=>{const r=await f.handle(new Request('https://support.test/api/'+path,{method:body?'POST':'GET',headers:{authorization:'Bearer qa-'+user,origin:'https://support.test','content-type':'application/json','user-agent':agent},...(body?{body:JSON.stringify(body)}:{})}));return {status:r.status,body:await r.json()};};
  for(const agent of agents){
   assert(supportPackageClientAllowed(new Request('https://support.test',{headers:{'user-agent':agent}})));
   const info=await call(agent,'server-support/info');assert.equal(info.status,200);assert.equal(info.body.packageVisible,true);
   const offer=await call(agent,'server-support/package');assert.equal(offer.status,200);assert.equal(offer.body.product.coins,500000000000000);
   const body={requestId:crypto.randomUUID(),quantity:100},applied=await call(agent,'server-support/package/apply',body);assert.equal(applied.status,200,JSON.stringify(applied.body));assert.equal(applied.body.order.quantity,100);assert.equal((await call(agent,'server-support/package/apply',body)).body.replayed,true);
   assert.equal((await call(agent,'server-support/package/apply',{requestId:crypto.randomUUID(),quantity:1},3)).status,403);
  }
  assert.equal(Number((await f.one("SELECT COUNT(*) n FROM user_messages WHERE campaign_key LIKE 'support_package_owner_alert_v1:%'")).n),1);
  f.clock.now=Date.parse('2026-11-03T00:00:00+09:00');for(const agent of agents){assert.equal((await call(agent,'server-support/info')).body.packageVisible,true);assert.equal((await call(agent,'server-support/package/apply',{requestId:crypto.randomUUID(),quantity:100})).status,200);}
  f.clock.now=Date.parse('2026-11-04T00:00:00+09:00');for(const agent of agents){assert.equal((await call(agent,'server-support/info')).body.packageVisible,false);assert.equal((await call(agent,'server-support/package/apply',{requestId:crypto.randomUUID(),quantity:100})).status,410);}
 }finally{await f.close();}
});
const applyQuantity=(f,quantity,requestId=crypto.randomUUID())=>f.call('server-support/package/apply',{user:2,body:{requestId,quantity}});
test('5, 10, custom 7 and maximum 100 applications have matching bank, owner, CMS and exact atomic grants',async()=>{
 const f=await packageFixture({postgres:true});try{
  await f.activate();let balance=1234n,restricted=0n,units=0;
  for(const quantity of [5,10,7,100]){
   const id=crypto.randomUUID(),applied=await applyQuantity(f,quantity,id);assert.equal(applied.status,200,JSON.stringify(applied.body));const order=applied.body.order;assert.equal(order.quantity,quantity);
   assert.equal((await applyQuantity(f,quantity,id)).body.replayed,true);
   const messages=await f.env.DB.prepare('SELECT title,body FROM user_messages WHERE campaign_key IN (?,?)').bind(applied.body.campaignKey,'support_package_owner_alert_v1:'+order.id).all();assert.equal(messages.results.length,2);
   for(const m of messages.results){assert(m.body.includes((quantity*49800).toLocaleString('ko-KR')+'원'));assert(m.body.includes(quantity+'회'));assert(m.body.includes(quantity*500+'조 코인'));}
   const alert=(await f.call('admin/server-support/package/alerts')).body.pending[0];assert.equal(alert.quantity,quantity);assert.equal(alert.product.priceWon,49800*quantity);assert.equal(BigInt(alert.product.coins),500000000000000n*BigInt(quantity));
   const rid=crypto.randomUUID(),paid=await f.process(order,'FULFILL',rid);assert.equal(paid.status,200,JSON.stringify(paid.body));assert.equal(paid.body.order.fulfillment.packageQuantity,quantity*2);
   units+=quantity;restricted+=500000000000000n*BigInt(quantity);balance+=500000000000000n*BigInt(quantity);
   assert.equal((await f.one('SELECT CAST(coin AS TEXT) coin FROM users WHERE id=2')).coin,balance.toString());
   for(const [code,count] of [['EMPEROR_ENERGY',400],['MERCENARY_SSS_LIMITED_SHARD',10],['WEAPON_ENHANCEMENT_SCROLL',10],['ARMOR_ENHANCEMENT_SCROLL',10]])assert.equal(Number((await f.one('SELECT quantity FROM cnine_user_inventory WHERE user_id=2 AND item_code=?',code)).quantity),units*count);
   assert.equal((await f.process(order,'FULFILL',rid)).body.replayed,true);assert.equal((await f.process(order)).status,409);
   const accounting=await readPackageCoinAccounting(f.env,2);assert.equal(accounting.restrictedExact,restricted.toString());assert.equal(accounting.availableExact,'1234');assert.throws(()=>requirePredictionCoins(accounting,1235),{code:'PREDICTION_PACKAGE_COIN'});
  }
 }finally{await f.close();}
});
test('quantity boundaries and conflicting retries never create or modify an order',async()=>{
 const f=await packageFixture({postgres:true});try{
  await f.activate();for(const q of [0,-1,101,1.5,'5',null,true,{},[],1e12]){const r=await applyQuantity(f,q);assert.equal(r.status,400,JSON.stringify({q,...r}));}
  assert.equal(Number((await f.one('SELECT COUNT(*) n FROM user_messages')).n),0);
  const id=crypto.randomUUID(),a=await applyQuantity(f,5,id);assert.equal(a.status,200);assert.equal((await applyQuantity(f,10,id)).body.code,'SUPPORT_PACKAGE_REQUEST_CONFLICT');assert.equal((await applyQuantity(f,10)).body.code,'SUPPORT_PACKAGE_QUANTITY_CONFLICT');
  const reissued=await applyQuantity(f,5);assert.equal(reissued.status,200);assert.equal(reissued.body.order.id,a.body.order.id);assert.equal(reissued.body.order.quantity,5);assert.equal(Number((await f.one("SELECT COUNT(*) n FROM user_messages WHERE campaign_key LIKE 'support_package_owner_alert_v1:%'")).n),1);
 }finally{await f.close();}
});
test('100 applications roll back completely on partial inventory failure and preserve bigint origin through spending and auction refunds',async()=>{
 const f=await packageFixture({postgres:true});try{
  await f.activate();const order=(await applyQuantity(f,100)).body.order;
  f.fail('INSERT INTO inventory_logs');assert.equal((await f.process(order)).status,503);f.fail(null);
  assert.equal((await f.one('SELECT CAST(coin AS TEXT) coin FROM users WHERE id=2')).coin,'1234');assert.equal(Number((await f.one('SELECT COUNT(*) n FROM cnine_user_inventory')).n),0);assert.equal(await f.one("SELECT value FROM app_meta WHERE key='support_package_coin_v1:2'"),null);
  assert.equal((await f.process(order)).status,200);
  const change=async(amount,reason)=>f.env.DB.batch([f.env.DB.prepare('UPDATE users SET coin=coin+CAST(? AS BIGINT) WHERE id=2').bind(amount),f.env.DB.prepare('INSERT INTO coin_logs(user_id,change_amount,balance_after,reason) SELECT id,CAST(? AS BIGINT),coin,? FROM users WHERE id=2').bind(amount,reason)]);
  await change('-1','일반 구매');let snapshot=await readPackageCoinAccounting(f.env,2);assert.equal(snapshot.restrictedExact,'49999999999999999');assert.equal(snapshot.availableExact,'1234');
  await change('-20000000000000001','경매 #42 누적 입찰');snapshot=await readPackageCoinAccounting(f.env,2);assert.equal(snapshot.restrictedExact,'29999999999999998');assert.equal(snapshot.state.auctionReserved['42'],'20000000000000001');
  await f.env.DB.batch(packageCoinGuardStatements(f.env,2,snapshot));
  await change('20000000000000001','경매 #42 유찰·차순위 환급');snapshot=await readPackageCoinAccounting(f.env,2);assert.equal(snapshot.restrictedExact,'49999999999999999');assert.equal(snapshot.availableExact,'1234');assert.deepEqual(snapshot.state.auctionReserved,{});
  assert.throws(()=>requirePredictionCoins(snapshot,1235),{code:'PREDICTION_PACKAGE_COIN'});requirePredictionCoins(snapshot,1234);
 }finally{await f.close();}
});
test('November offer is 250 trillion per package, 500 trillion for 1+1; historical products are unchanged',()=>{
 assert.equal(SUPPORT_PACKAGE_CURRENT_UNIT.coins,250000000000000);assert.equal(SUPPORT_PACKAGE.coins,500000000000000);assert.equal(SUPPORT_PACKAGE.priceWon,49800);assert.equal(SUPPORT_PACKAGE.packageQuantity,2);
 assert.equal(SUPPORT_PACKAGE_UNIT.coins,100000000000000);assert.equal(SUPPORT_PACKAGE_LEGACY_BOGO.coins,200000000000000);
 assert.notEqual(SUPPORT_PACKAGE.code,SUPPORT_PACKAGE_UNIT.code);assert.notEqual(SUPPORT_PACKAGE.eventCode,SUPPORT_PACKAGE_LEGACY_BOGO.eventCode);
 assert.deepEqual(SUPPORT_PACKAGE_CURRENT_UNIT.items.slice(-2).map(i=>[i.code,i.quantity]),[['WEAPON_ENHANCEMENT_SCROLL',5],['ARMOR_ENHANCEMENT_SCROLL',5]]);
 assert.deepEqual(SUPPORT_PACKAGE.items.map(i=>[i.code,i.quantity]),[['EMPEROR_ENERGY',400],['MERCENARY_SSS_LIMITED_SHARD',10],['WEAPON_ENHANCEMENT_SCROLL',10],['ARMOR_ENHANCEMENT_SCROLL',10]]);
 assert.equal(SUPPORT_PACKAGE_EVENT_DEADLINE.endsAt,'2026-11-04T00:00:00+09:00');
});
test('ordinary desktop, Android Chrome and iPhone Safari browsers stay eligible for web checkout',()=>{
 for(const agent of ['Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/130.0.0 Safari/537.36','Mozilla/5.0 (Linux; Android 14) Chrome/130.0.0 Mobile Safari/537.36','Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) Version/18.0 Mobile/15E148 Safari/604.1'])assert(supportPackageClientAllowed(new Request('https://support.test/api/server-support/package',{headers:{'user-agent':agent}})));
});
test('ONE store clients and documents cannot expose or submit package checkout; no order or message is written',async()=>{
 const f=await packageFixture({postgres:true});try{
  f.clock.now=Date.parse('2026-11-01T12:00:00+09:00');await f.activate();
  for(const headers of [...nativeAgents.map(agent=>({'user-agent':agent})),{referer:'https://cnine-card.pages.dev/onestore/'}]){
   const call=async(path,body)=>{const r=await f.handle(new Request('https://support.test/api/'+path,{method:body?'POST':'GET',headers:{authorization:'Bearer qa-2',origin:'https://support.test','content-type':'application/json',...headers},...(body?{body:JSON.stringify(body)}:{})}));return {status:r.status,body:await r.json()};};
   const info=await call('server-support/info');assert.equal(info.status,200);assert.equal(info.body.packageVisible,false);assert.equal(info.body.subscription.active,true);
   for(const [path,body] of [['server-support/package',null],['server-support/package/apply',{requestId:crypto.randomUUID()}]]){const before=f.queries.length,r=await call(path,body);assert.equal(r.status,403);assert.equal(r.body.code,'SUPPORT_PACKAGE_CLIENT_UNAVAILABLE');assert(!f.queries.slice(before).some(q=>/^\s*(INSERT|UPDATE|DELETE)\b/.test(q)));}
  }
  assert.equal(Number((await f.one('SELECT COUNT(*) n FROM user_messages')).n),0);assert.equal((await f.call('admin/server-support/package/alerts')).body.pending.length,0);
  assert.equal((await f.apply()).status,200);
 }finally{await f.close();}
});
test('an October pending order keeps 200 trillion in the page, reissued bank instructions and fulfillment',async()=>{
 const f=await packageFixture({postgres:true});try{
  f.clock.now=Date.parse('2026-11-01T12:00:00+09:00');await f.activate();
  const old={...(await f.apply()).body.order,product:SUPPORT_PACKAGE_LEGACY_BOGO};await f.run('UPDATE app_meta SET value=? WHERE key=?',JSON.stringify(old),'support_package_order_v1:'+old.id);
  const info=await f.call('server-support/package',{user:2});assert.deepEqual(info.body.product,SUPPORT_PACKAGE_LEGACY_BOGO);
  const next=await f.apply();assert.equal(next.body.order.id,old.id);assert.deepEqual(next.body.order.product,SUPPORT_PACKAGE_LEGACY_BOGO);
  const bank=await f.one('SELECT body FROM user_messages WHERE campaign_key=?',next.body.campaignKey);assert.match(bank.body,/200조 코인/);assert.doesNotMatch(bank.body,/400조 코인/);
  const paid=await f.process(old);assert.equal(paid.status,200);assert.deepEqual(paid.body.order.fulfillment,SUPPORT_PACKAGE_LEGACY_BOGO);assert.equal(Number((await f.one('SELECT coin FROM users WHERE id=2')).coin),200000000001234);
 }finally{await f.close();}
});
test('pre-scroll November bulk orders preserve other items and receive the increased coins; new scroll grants fail atomically on armor-item failure',async()=>{
 const f=await packageFixture({postgres:true});try{
  await f.activate();const old={...(await applyQuantity(f,5)).body.order,product:SUPPORT_PACKAGE_NOVEMBER_BOGO};await f.run('UPDATE app_meta SET value=? WHERE key=?',JSON.stringify(old),'support_package_order_v1:'+old.id);
  const paid=await f.process(old);assert.equal(paid.status,200);assert.equal(paid.body.order.fulfillment.items.length,2);assert.equal(paid.body.order.fulfillment.coins,2500000000000000);assert.equal(Number((await f.one("SELECT COUNT(*) n FROM cnine_user_inventory WHERE item_code LIKE '%ENHANCEMENT_SCROLL'")).n),0);
  const order=(await applyQuantity(f,1)).body.order,before=(await f.one('SELECT CAST(coin AS TEXT) coin FROM users WHERE id=2')).coin;
  await f.run("INSERT INTO inventory_items(code,name,is_active) VALUES('ARMOR_ENHANCEMENT_SCROLL','기존 비활성 주문서',0)");
  assert.equal((await f.process(order)).status,503);assert.equal((await f.one('SELECT CAST(coin AS TEXT) coin FROM users WHERE id=2')).coin,before);assert.equal(Number((await f.one("SELECT COUNT(*) n FROM cnine_user_inventory WHERE item_code LIKE '%ENHANCEMENT_SCROLL'")).n),0);
  await f.run("UPDATE inventory_items SET is_active=1 WHERE code='ARMOR_ENHANCEMENT_SCROLL'");const rid=crypto.randomUUID();assert.equal((await f.process(order,'FULFILL',rid)).status,200);assert.equal((await f.process(order,'FULFILL',rid)).body.replayed,true);
  for(const code of ['WEAPON_ENHANCEMENT_SCROLL','ARMOR_ENHANCEMENT_SCROLL'])assert.equal(Number((await f.one('SELECT quantity FROM cnine_user_inventory WHERE user_id=2 AND item_code=?',code)).quantity),10);
  assert.equal(Number((await f.one("SELECT COUNT(*) n FROM cnine_user_inventory WHERE item_code LIKE '%PROTECTION%'")).n),0);
 }finally{await f.close();}
});
