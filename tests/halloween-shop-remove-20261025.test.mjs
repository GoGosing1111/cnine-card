import test from 'node:test';
import assert from 'node:assert/strict';
import {halloweenFixture} from './helpers/halloween-pack-fixture.mjs';
import {HALLOWEEN_PACK,HALLOWEEN_PACK_KEY,HALLOWEEN_PACK_SHOP_ENABLED} from '../shared/mercenary-halloween-pack-v1.mjs';
import {BLOODMOON_PACK_RELEASE_ENABLED} from '../shared/mercenary-bloodmoon-pack-v1.mjs';
import {halloweenPackShopRow,handleHalloweenPack,readHalloweenPackState} from '../functions/_mercenary_halloween_pack.js';
import {createHalloweenPackService} from '../functions/_mercenary_halloween_opening.js';

test('removed Halloween pack has no shop row and every new open stops before account, body or DB access',async()=>{
 assert.equal(HALLOWEEN_PACK_SHOP_ENABLED,false);assert.equal(BLOODMOON_PACK_RELEASE_ENABLED,true);
 const env={DB:new Proxy({},{get(){throw Error('no DB access');}})},json=(body,status=200)=>({body,status});
 assert.equal(await halloweenPackShopRow(env),null);
 for(const role of ['USER','OWNER']){
  const r=await handleHalloweenPack({path:HALLOWEEN_PACK.openPath,request:new Request('https://qa.test/api/'+HALLOWEEN_PACK.openPath,{method:'POST',body:'invalid body'}),env,deps:{json,authenticate(){throw Error(role+' must not reach account access');}}});
  assert.equal(r.status,423);assert.equal(r.body.code,'MERCENARY_HALLOWEEN_SHOP_REMOVED');
 }
 const retired=createHalloweenPackService({readState(){throw Error('no state access');}});
 await assert.rejects(retired.open(env,{id:1},{}),e=>e.code==='MERCENARY_HALLOWEEN_SHOP_REMOVED');
});
test('stored ON economics stay readable without mutation, while actual opening stays disabled',async t=>{
 const f=await halloweenFixture(t),before=(await f.p('SELECT value FROM app_meta WHERE key=?',HALLOWEEN_PACK_KEY).first()).value;
 const state=await readHalloweenPackState(f.env);assert.equal(state.settings.mode,'ON');assert.equal(state.readiness.ready,true);assert.equal(state.shopEnabled,false);assert.equal(state.userOpeningEnabled,false);
 assert.equal((await f.p('SELECT value FROM app_meta WHERE key=?',HALLOWEEN_PACK_KEY).first()).value,before);assert.equal(await f.coin(),1000000);
});
test('a historical paid receipt remains authenticated and recoverable after shop removal without new grants',async t=>{
 const f=await halloweenFixture(t),paid=await f.service.open(f.env,f.user,f.body(10)),coin=await f.coin(),before=(await f.pg.query('SELECT * FROM mercenary_limited_stock_v1 ORDER BY code')).rows;
 const retired=createHalloweenPackService({readState:readHalloweenPackState});
 const recovered=await retired.receipt(f.env,f.user,paid.requestId);assert.deepEqual(recovered.draws,paid.draws);assert.equal(recovered.coinCost,paid.coinCost);
 const path=HALLOWEEN_PACK.receiptPath,request=new Request('https://qa.test/api/'+path+'?requestId='+paid.requestId),json=(body,status=200)=>({body,status});
 const response=await handleHalloweenPack({path,request,env:f.env,deps:{json,authenticate:async()=>f.user}});assert.equal(response.status,200);assert.equal(response.body.status,'COMPLETED');
 const denied=await handleHalloweenPack({path,request,env:f.env,deps:{json,authenticate:async()=>null}});assert.equal(denied.status,401);
 await assert.rejects(retired.open(f.env,f.user,paid),e=>e.code==='MERCENARY_HALLOWEEN_SHOP_REMOVED');
 assert.equal(await f.coin(),coin);assert.deepEqual((await f.pg.query('SELECT * FROM mercenary_limited_stock_v1 ORDER BY code')).rows,before);assert.equal(Number((await f.pg.query('SELECT COUNT(*) n FROM mercenary_card_acquisitions_v1')).rows[0].n),10);
});
