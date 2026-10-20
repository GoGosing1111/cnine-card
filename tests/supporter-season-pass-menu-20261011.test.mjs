import test from 'node:test';
import assert from 'node:assert/strict';
import {supportFixture} from './helpers/server-support-fixture.mjs';

for(const postgres of [false,true])test(`${postgres?'PostgreSQL':'SQLite'}: 시즌패스 메뉴는 지정 OWNER만 예외이며 일반 계정은 2차 인증과 가입 72시간을 요구한다`,async t=>{
  const f=await supportFixture({postgres});t.after(()=>f.close());
  for(const user of [1,2,3]){
    const status=await f.call('server-support/status',{user});
    assert.deepEqual(status.body,{visible:true,seasonPassVisible:true});
    assert.match(status.headers.get('cache-control'),/no-store/);
    assert.equal((await f.call('server-support/info',{user})).body.seasonPassVisible,true);
  }
  for(const user of [4,5,6]){
    assert.deepEqual((await f.call('server-support/status',{user})).body,{visible:false,seasonPassVisible:false});
    assert.equal((await f.call('server-support/info',{user})).status,404);
    assert.equal((await f.call('server-support/pass/claim',{user,body:{}})).status,404);
    assert.equal((await f.call('server-support/pass/claim-all',{user,body:{}})).status,404);
  }
  // Verified account: 72 hours minus one millisecond remains hidden.
  f.clock.now+=1;
  assert.equal((await f.call('server-support/status',{user:4})).body.seasonPassVisible,true);
  assert.equal((await f.call('server-support/info',{user:4})).body.seasonPassVisible,true);
  f.clock.now-=1;
  await f.run('DELETE FROM user_second_verifications WHERE user_id=1');
  assert.deepEqual((await f.call('server-support/status')).body,{visible:true,seasonPassVisible:true});
  const preview=await f.call('server-support/info');
  assert.equal(preview.body.previewOnly,false);assert.equal(preview.body.seasonPassVisible,true);
  assert.equal((await f.call('server-support/pass/claim',{body:{}})).status,400);
  assert.equal((await f.call('server-support/pass/claim-all',{body:{}})).status,400);
  await f.run('INSERT INTO user_second_verifications VALUES(1,?)','2026-01-02 00:00:00');
  await f.run('UPDATE users SET created_at=? WHERE id=1',new Date(f.clock.now-3*86400000+1).toISOString());
  assert.deepEqual((await f.call('server-support/status')).body,{visible:true,seasonPassVisible:true});
  assert.equal((await f.call('server-support/info')).body.seasonPassVisible,true);
  assert.equal((await f.call('server-support/status',{user:0})).status,401);
  assert.equal((await f.call('server-support/pass/claim-all',{user:0,body:{}})).status,401);
});
