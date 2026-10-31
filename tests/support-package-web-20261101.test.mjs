import test from 'node:test';
import assert from 'node:assert/strict';
import {packageFixture} from './helpers/support-package-fixture.mjs';
import {SUPPORT_PACKAGE,SUPPORT_PACKAGE_CURRENT_UNIT,SUPPORT_PACKAGE_UNIT,SUPPORT_PACKAGE_LEGACY_BOGO,SUPPORT_PACKAGE_EVENT_DEADLINE,supportPackageWebRequest} from '../shared/support-package-v1.mjs';
const nativeAgents=['Mozilla/5.0 ReverseCallAndroid/1.0.0','Mozilla/5.0 Reversecall/1.0.0 Chrome/130.0.0 Electron/32.0.0 Safari/537.36','Mozilla/5.0 ReverseCallStore/onestore/1.0.0','Mozilla/5.0 (Linux; Android 14; Pixel 8; wv) AppleWebKit/537.36'];
test('November offer is 200 trillion per package, 400 trillion for 1+1; historical products are unchanged',()=>{
 assert.equal(SUPPORT_PACKAGE_CURRENT_UNIT.coins,200000000000000);assert.equal(SUPPORT_PACKAGE.coins,400000000000000);assert.equal(SUPPORT_PACKAGE.priceWon,49800);assert.equal(SUPPORT_PACKAGE.packageQuantity,2);
 assert.equal(SUPPORT_PACKAGE_UNIT.coins,100000000000000);assert.equal(SUPPORT_PACKAGE_LEGACY_BOGO.coins,200000000000000);
 assert.notEqual(SUPPORT_PACKAGE.code,SUPPORT_PACKAGE_UNIT.code);assert.notEqual(SUPPORT_PACKAGE.eventCode,SUPPORT_PACKAGE_LEGACY_BOGO.eventCode);
 assert.deepEqual(SUPPORT_PACKAGE.items.map(i=>[i.code,i.quantity]),[['EMPEROR_ENERGY',400],['MERCENARY_SSS_LIMITED_SHARD',10]]);
 assert.equal(SUPPORT_PACKAGE_EVENT_DEADLINE.endsAt,'2026-11-03T00:00:00+09:00');
});
test('ordinary desktop, Android Chrome and iPhone Safari browsers stay eligible for web checkout',()=>{
 for(const agent of ['Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/130.0.0 Safari/537.36','Mozilla/5.0 (Linux; Android 14) Chrome/130.0.0 Mobile Safari/537.36','Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) Version/18.0 Mobile/15E148 Safari/604.1'])assert(supportPackageWebRequest(new Request('https://support.test/api/server-support/package',{headers:{'user-agent':agent}})));
});
test('native clients and ONE store documents cannot expose or submit package checkout; no order or message is written',async()=>{
 const f=await packageFixture({postgres:true});try{
  f.clock.now=Date.parse('2026-11-01T12:00:00+09:00');await f.activate();
  for(const headers of [...nativeAgents.map(agent=>({'user-agent':agent})),{referer:'https://cnine-card.pages.dev/onestore/'}]){
   const call=async(path,body)=>{const r=await f.handle(new Request('https://support.test/api/'+path,{method:body?'POST':'GET',headers:{authorization:'Bearer qa-2',origin:'https://support.test','content-type':'application/json',...headers},...(body?{body:JSON.stringify(body)}:{})}));return {status:r.status,body:await r.json()};};
   const info=await call('server-support/info');assert.equal(info.status,200);assert.equal(info.body.packageVisible,false);assert.equal(info.body.subscription.active,true);
   for(const [path,body] of [['server-support/package',null],['server-support/package/apply',{requestId:crypto.randomUUID()}]]){const before=f.queries.length,r=await call(path,body);assert.equal(r.status,403);assert.equal(r.body.code,'SUPPORT_PACKAGE_WEB_ONLY');assert(!f.queries.slice(before).some(q=>/^\s*(INSERT|UPDATE|DELETE)\b/.test(q)));}
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
