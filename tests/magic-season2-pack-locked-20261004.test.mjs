import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {magicFixture} from './helpers/magic-presets-fixture.mjs';
import {MAGIC_SEASON2_PACK,magicPackRequestGuard} from '../shared/magic-pack-seasons-v1.mjs';

test('magic status publishes the approved season 2 pack at one billion coins while leaving season 1 settings intact',async t=>{
 const f=await magicFixture();t.after(()=>f.close());
 const status=await (await f.call('magic/status')).json(),[s1,s2]=status.summonSeasons;
 assert.equal(s1.season,'S1');assert.equal(s1.drawCoinCost,status.settings.drawCoinCost);assert.equal(s1.drawCost,status.settings.drawCost);assert.deepEqual(s1.packRewards,status.settings.packRewards);
 assert.equal(s1.drawEnabled,true);assert.equal(s2.season,'S2');assert.equal(s2.drawCoinCost,1_000_000_000);assert.equal(s2.drawCost,0);assert.equal(s2.drawEnabled,false);assert.equal(s2.openingEnabled,false);assert.equal(s2.visible,true);assert.equal(s2.drawCoinCost*10,10_000_000_000);
 assert.ok(fs.existsSync(new URL('../'+s2.imageUrl,import.meta.url)));
 assert.equal(s2.code,'MAGIC_CARD_SEASON2_PACK');assert.equal(MAGIC_SEASON2_PACK.rewardPolicy,'MIXED_CARD_CRYSTAL_SHARD');
});

test('season 2 direct draw and inventory-open requests stay locked for users and OWNER without any writes',async t=>{
 const f=await magicFixture(true);t.after(()=>f.close());
 for(const role of ['USER','OWNER']){
  await f.p('UPDATE users SET role=? WHERE id=1',role).run();
  const before=await f.user();
  for(const path of ['magic/draw','magic/pack/open']){
   for(const selector of [{season:'S2'},{season:2},{season:' s2 '},{itemCode:'MAGIC_CARD_SEASON2_PACK'},{packCode:'MAGIC_CARD_SEASON2_PACK'},{season:'S1',itemCode:'MAGIC_CARD_PACK',packCode:'MAGIC_CARD_SEASON2_PACK'}]){
    for(const count of [1,10]){
     f.queries.length=0;
     const response=await f.call(path,{requestId:'locked-s2',count,...selector});
     assert.equal(response.status,503);assert.equal((await response.json()).code,'MAGIC_SEASON2_OPENING_LOCKED');
     assert.equal(f.queries.some(sql=>/^(?:INSERT|UPDATE|DELETE|BEGIN)/i.test(sql)),false,'no receipt, balance, inventory or reward writes while locked');
    }
   }
  }
  assert.deepEqual(await f.user(),before);
 }
 assert.equal(Number((await f.p('SELECT COUNT(*) count FROM magic_card_draw_receipts').first()).count),0);
 for(const body of [{season:'S3'},{season:''},{packCode:'OTHER_PACK'}])assert.equal(magicPackRequestGuard(body).status,400);
});

test('legacy and explicit season 1 draws keep their original costs and idempotent receipts',async t=>{
 const f=await magicFixture(true);t.after(()=>f.close());
 for(const [count,selector] of [[1,{}],[10,{season:'S1'}]]){
  const body={requestId:'s1-'+count,count,...selector},response=await f.call('magic/draw',body);
  assert.equal(response.status,200);const result=await response.json();
  assert.equal(result.count,count);assert.equal(result.totalCoinCost,count*1000);assert.equal(result.totalCost,count*100);
  const before=await f.user();assert.deepEqual(await (await f.call('magic/draw',body)).json(),result);assert.deepEqual(await f.user(),before);
  const blocked=await f.call('magic/draw',{...body,season:'S2'});assert.equal(blocked.status,503);assert.equal((await blocked.json()).code,'MAGIC_SEASON2_OPENING_LOCKED');assert.deepEqual(await f.user(),before);
 }
});
