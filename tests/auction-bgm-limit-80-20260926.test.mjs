import test from 'node:test';
import assert from 'node:assert/strict';
import {auctionFixture} from './helpers/auction-fixture-20260926.mjs';

test('80 shared BGM rules survive save/reload and the 80th rule appears in the guide and triggers', async t => {
  const f = await auctionFixture(t);
  const rules = Array.from({length:80}, (_, i) => ({minBid:(i+1)*1000,maxBid:(i+1)*1000,bgmUrl:`/qa/bgm-${i+1}.mp3#av=25`,duration:40}));
  // Start with the previous full catalog and keep its entries intact when extending it.
  assert.equal((await f.request('auction/admin/bgm-rules',{rules:rules.slice(0,50)})).body.rules.length,50);
  const previous=(await f.request('auction/admin/bgm-rules')).body.rules;
  const saved=await f.request('auction/admin/bgm-rules',{rules});
  assert.equal(saved.body.rules.length,80);
  assert.equal(saved.body.maxRules,80);
  const loaded=(await f.request('auction/admin/bgm-rules')).body;
  assert.equal(loaded.rules.length,80);
  assert.equal(loaded.maxRules,80);
  const value=row=>[row.min_bid,row.max_bid,row.bgm_url,row.bgm_duration,row.sort_order];
  assert.deepEqual(loaded.rules.slice(0,50).map(value),previous.map(value));
  const state=await (await f.request('auction/state')).json();
  assert.equal(state.bgmGuide.length,80);
  assert.equal(state.bgmGuide[79].order,80);
  await f.bid(80000,'bgm-80');
  const event=(await f.event('bgm-80')).body.event;
  assert.equal((await f.request('auction/schedule-event',{eventId:event.id})).body.event.bgm_url,'/qa/bgm-80.mp3#av=25');
});
