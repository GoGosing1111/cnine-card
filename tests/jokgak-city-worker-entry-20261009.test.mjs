import test from 'node:test';
import assert from 'node:assert/strict';
import {cityWorkerFixture} from './helpers/jokgak-city-worker.mjs';
test('Workers runtime: first entry, seed cache and retry retain one receipt, role and wallet',async t=>{
  const f=await cityWorkerFixture();t.after(()=>f.dispose());
  const before=await (await f.request('status')).json();assert.equal(before.mine,null);
  const body={requestId:'worker-entry-retry-20261009',epoch:before.shift.id};
  const joinedResponse=await f.request('join',body),joined=await joinedResponse.json();assert.equal(joinedResponse.status,200,JSON.stringify(joined));assert.equal(joined.mine.cash,10000);assert.equal(joined.mine.active,true);
  for(let i=0;i<3;i++){
    const statusResponse=await f.request('status'),status=await statusResponse.json();assert.equal(statusResponse.status,200,JSON.stringify(status));assert.equal(status.mine.role,joined.mine.role);assert.equal(status.mine.cash,10000);
  }
  const replay=await (await f.request('join',body)).json();assert.equal(replay.replayed,true);assert.equal(replay.mine.role,joined.mine.role);assert.equal(replay.mine.cash,10000);
  assert.equal((await f.db.prepare('SELECT COUNT(*) n FROM jokgak_city_actions_v1').first()).n,1);
  assert.equal((await f.db.prepare('SELECT coin FROM users WHERE id=1').first()).coin,123456);
  assert.equal((await f.request('join',{...body,requestId:'worker-entry-nontester'},2)).status,403);
});
