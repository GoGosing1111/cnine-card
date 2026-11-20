import test from 'node:test';
import assert from 'node:assert/strict';
import {packageFixture} from './helpers/support-package-fixture.mjs';
import {
  SUPPORT_PACKAGE as bundle, SUPPORT_PACKAGE_CURRENCY as currency, SUPPORT_PACKAGE_NOVEMBER15_PETS as former,
  supportPackageOrderProduct, supportPackageWithBonus, supportPackageBonusKey, supportPackageEventDeadline
} from '../shared/support-package-v1.mjs';

const hundredMillion=100_000_000;
const items=product=>Object.fromEntries(product.items.map(item=>[item.code,item.quantity]));
const apply=(f,product,quantity=1,requestId=crypto.randomUUID())=>
  f.call('server-support/package/apply',{user:2,body:{productCode:product.code,quantity,requestId}});

test('both 1+1 totals are distinct and the currency package awards all six star bonuses every ten paid units',()=>{
  assert.deepEqual([bundle.name,currency.name],['묶음패키지','재화패키지']);
  assert.deepEqual(items(bundle),items(former));
  assert.deepEqual(items(currency),{MASTER_STAR:25_000_000_000,WEAPON_ENHANCEMENT_SCROLL:5,ARMOR_ENHANCEMENT_SCROLL:20,MERCENARY_SSS_LIMITED_SHARD:10});
  for(const product of [bundle,currency]){
    assert.equal(product.priceWon,49800);assert.equal(product.packageQuantity,2);
    assert.equal(supportPackageEventDeadline(product).endsAt,null);
    for(const before of [0,10])for(const [offset,stars] of [50,100,200,400,800,0,0,0,0,1000].entries()){
      const quote=supportPackageWithBonus(product,before+offset);
      assert.equal(quote.purchaseBonus.masterStars,stars*hundredMillion);
      assert.equal(items(quote).MASTER_STAR,items(product).MASTER_STAR+stars*hundredMillion);
      assert.equal(quote.items.filter(item=>item.code==='MASTER_STAR').length,1);
    }
  }
  assert.equal(currency.coins,1_500_000_000_000_000);assert.equal(bundle.coins,500_000_000_000_000);
  const maximum=supportPackageWithBonus(supportPackageOrderProduct({product:currency,quantity:100}));
  assert.equal(maximum.coins,'430000000000000000');
  assert.equal(items(maximum).MASTER_STAR,5_050_000_000_000);assert.equal(items(maximum).SSS_MIRACLE_CUBE,1900);
  assert.equal(supportPackageWithBonus(former).purchaseBonus.masterStars,undefined);
});

test('selection, bank and CMS quote, campaign reset, mixed orders, retry and rollback agree in PostgreSQL',async()=>{
  const f=await packageFixture({postgres:true});
  try{
    f.clock.now=Date.parse('2027-01-12T12:00:00+09:00');await f.activate();
    const oldKey=supportPackageBonusKey(2,former.bonusPolicy),newKey=supportPackageBonusKey(2);
    const previous=JSON.stringify({version:1,policyCode:former.bonusPolicy,paidPurchases:5,totalBonusCoins:'20000000000000000',totalBonusCubes:90});
    await f.run('INSERT INTO app_meta(key,value) VALUES(?,?)',oldKey,previous);
    const read=async key=>(await f.one('SELECT value FROM app_meta WHERE key=?',key))?.value;
    const info=(await f.call('server-support/package',{user:2})).body;
    assert.deepEqual(info.products,[bundle,currency]);assert.equal(info.bonusProgress.paidPurchases,0);assert.equal(info.salesOpen,true);
    assert.equal((await apply(f,{code:former.code})).status,400);
    assert.equal((await apply(f,{code:'unknown'})).status,400);assert.equal(await read(newKey),undefined);
    const requestId=crypto.randomUUID(),applied=await apply(f,currency,1,requestId);
    assert.equal(applied.status,200);assert.deepEqual(applied.body.order.product,currency);
    assert.equal((await apply(f,bundle,1,requestId)).body.code,'SUPPORT_PACKAGE_REQUEST_CONFLICT');
    assert.equal((await apply(f,bundle)).body.code,'SUPPORT_PACKAGE_PRODUCT_CONFLICT');
    assert.equal((await apply(f,currency,2)).body.code,'SUPPORT_PACKAGE_QUANTITY_CONFLICT');
    assert.equal((await apply(f,currency,1,requestId)).body.replayed,true);
    assert.equal((await f.call('server-support/package',{user:2})).body.pending.product.code,currency.code);
    const bank=await f.one('SELECT body FROM user_messages WHERE campaign_key=?',applied.body.campaignKey);
    assert.match(bank.body,/재화패키지/);assert.match(bank.body,/마스터의 별 300억개/);assert.doesNotMatch(bank.body,/아르덴/);
    const quote=(await f.call('admin/server-support/package')).body.pending[0].quotedFulfillment;
    assert.equal(quote.purchaseBonus.masterStars,5_000_000_000);assert.equal(quote.coins,2_500_000_000_000_000);
    f.fail('INSERT INTO admin_logs');assert.equal((await f.process(applied.body.order)).status,503);f.fail(null);
    assert.equal(await read(newKey),undefined);assert.equal(Number((await f.one('SELECT COUNT(*) n FROM inventory_logs')).n),0);
    const receipt=crypto.randomUUID(),paid=await f.process(applied.body.order,'FULFILL',receipt);
    assert.equal(paid.status,200);assert.deepEqual(paid.body.order.fulfillment,quote);
    assert.equal((await f.process(applied.body.order,'FULFILL',receipt)).body.replayed,true);
    const next=await apply(f,bundle);assert.equal(next.status,200);
    const second=(await f.process(next.body.order)).body.order.fulfillment;
    assert.equal(second.purchaseBonus.masterStars,10_000_000_000);assert.equal(items(second).ARDEN_ENERGY,50);
    assert.equal(items(second).MASTER_STAR,11_000_000_000);
    const owned=await f.one("SELECT quantity,unseen_quantity FROM cnine_user_inventory WHERE user_id=2 AND item_code='MASTER_STAR'");
    assert.equal(Number(owned.quantity),41_000_000_000);assert.equal(Number(owned.unseen_quantity),41_000_000_000);
    assert.equal(Number((await f.one("SELECT COUNT(*) n FROM inventory_logs WHERE item_code='MASTER_STAR'")).n),2);
    assert.equal(JSON.parse(await read(newKey)).paidPurchases,2);assert.equal(await read(oldKey),previous);
  }finally{await f.close();}
});
