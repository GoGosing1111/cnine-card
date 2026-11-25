import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {cnineStreamerBoxFixture} from './helpers/cnine-streamer-box-fixture.mjs';
import {CNINE_WINTER_BOX as box, CNINE_STREAMER_SHARD as shard} from '../shared/cnine-winter-box-v1.mjs';
import {ensureCnineWinterBoxCatalog, grantCnineWinterBox, openCnineWinterBox} from '../functions/_cnine_winter_box.js';
import {AUCTION_BOUND_ITEMS} from '../functions/_auction_user_catalog.js';

const expected = {
  COIN:50_000_000_000_000, MASTER_STAR:500_000_000, WEAPON_ENHANCEMENT_SCROLL:1,
  ARMOR_ENHANCEMENT_SCROLL:3, SUIT_CORE_8:1, RANK_EXP_POTION_2X_60M:1, CNINE_STREAMER_SHARD:1
};
const fixture = async t => {
  const f = await cnineStreamerBoxFixture(t);
  await f.pg.query("INSERT INTO inventory_items(code,is_active) VALUES('RANK_EXP_POTION_2X_60M',1)");
  await ensureCnineWinterBoxCatalog(f.env);
  const grant = (requestId=crypto.randomUUID(), amount=1) => grantCnineWinterBox(f.env,{id:9},{userId:1,amount,requestId});
  const open = (requestId=crypto.randomUUID(), count=1) => openCnineWinterBox(f.env,{id:1},{requestId,count});
  return {...f, grant, open};
};

test('grant-only catalog and both distributed inventory shells expose the winter box', async t => {
  const f = await fixture(t);
  for (const [item,category] of [[box,'GIFT_BOX'],[shard,'MATERIAL']]) {
    const row = await f.one('SELECT name,category,image_url FROM inventory_items WHERE code=$1',[item.code]);
    assert.deepEqual(row,{name:item.name,category,image_url:item.image});
    assert.equal(readFileSync(new URL('../'+item.image,import.meta.url)).toString('ascii',8,12),'WEBP');
    assert.ok(AUCTION_BOUND_ITEMS[item.code]);
  }
  assert.equal(await f.quantity(box.code),0);
  for (const file of ['js/app.js','onestore/js/app.js']) {
    const source = readFileSync(new URL('../'+file,import.meta.url),'utf8');
    assert.ok(source.includes("code:'CNINE_WINTER_BOX',key:'cnine-winter-box'"));
    assert.ok(source.includes("itemCode==='CNINE_WINTER_BOX'"));
  }
  const admin = readFileSync(new URL('../admin/admin-v1276.js',import.meta.url),'utf8');
  assert.ok(admin.includes('<option value="CNINE_WINTER_BOX">'));
  assert.ok(!admin.includes("CNINE_WINTER_BOX:{label:"));
});

test('one grant and open settle exactly once, the seven rewards go to the correct wallet and inventory', async t => {
  const f = await fixture(t), grantId=crypto.randomUUID(), openId=crypto.randomUUID();
  await assert.rejects(f.open(),/보유한/);
  await assert.rejects(f.grant(grantId,0));
  await f.grant(grantId);
  assert.equal((await f.grant(grantId)).replayed,true);
  await assert.rejects(f.open(openId,2),/1개씩/);
  assert.deepEqual((await f.open(openId)).rewards,expected);
  assert.equal((await f.open(openId)).replayed,true);
  assert.equal(await f.quantity(box.code),0);
  assert.equal((await f.one('SELECT coin FROM users WHERE id=1')).coin,expected.COIN+123);
  for (const [code,quantity] of Object.entries(expected).filter(([code])=>code!=='COIN')) {
    assert.equal(await f.quantity(code),quantity+(code==='MASTER_STAR'?17:0));
  }
  assert.equal(await f.quantity('CNINE_STREAMER_BOX'),0);
  assert.equal(await f.quantity('SUIT_CORE_6'),0);
  assert.equal(await f.quantity('PINGDU_REPAIR_COUPON'),0);
  assert.equal((await f.one('SELECT COUNT(*) n FROM coin_logs')).n,1);
  assert.equal((await f.one('SELECT COUNT(*) n FROM inventory_logs')).n,8);
});

test('late failure, lost acknowledgement and concurrent opens preserve the box and all seven awards', async t => {
  const f = await fixture(t);
  await f.grant();
  const id = crypto.randomUUID();
  f.fault({pattern:'INSERT INTO coin_logs'});
  await assert.rejects(f.open(id));
  assert.equal(await f.quantity(box.code),1);
  assert.equal(await f.quantity(shard.code),0);
  assert.equal(await f.quantity('MASTER_STAR'),17);
  assert.equal((await f.one('SELECT coin FROM users WHERE id=1')).coin,123);
  f.fault({ack:true});
  await f.open(id);
  assert.equal((await f.open(id)).replayed,true);
  await f.grant();
  const concurrent = await Promise.allSettled([f.open(),f.open()]);
  assert.equal(concurrent.filter(result=>result.status==='fulfilled').length,1);
  assert.equal(await f.quantity(shard.code),2);
  assert.equal(await f.quantity(box.code),0);
});
