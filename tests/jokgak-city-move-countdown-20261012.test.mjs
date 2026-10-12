import test from 'node:test';
import assert from 'node:assert/strict';
import {cityFixture} from './helpers/jokgak-city-fixture.mjs';
import {handleJokgakCity,cityStatus} from '../functions/_jokgak_city.js';
import {cityShift} from '../shared/jokgak-city-v1.mjs';

for(const postgres of [false,true])test(`${postgres?'Postgres':'SQLite'}: 이동 거절은 실제 남은 초와 서버 마감 시각을 반환하고 경계에서 정상 이동한다`,async t=>{
  const f=await cityFixture(t,postgres),id=f.roles.CITIZEN,user=f.users.get(id);
  await f.join(id);const moved=await f.action(id,'move',{location:'HOME'}),endsAt=moved.mine.nextMoveAt;
  f.advance(1250);
  const body={requestId:crypto.randomUUID(),epoch:cityShift(f.now).id,location:'MARKET'};
  const send=()=>handleJokgakCity({path:'jokgak-city/move',env:f.env,deps:{...f.deps,authenticate:async()=>user,json:(value,status=200)=>Response.json(value,{status})},request:new Request('https://city.test/api/jokgak-city/move',{method:'POST',headers:{origin:'https://city.test','content-type':'application/json'},body:JSON.stringify(body)})});
  const response=await send(),error=await response.json();assert.equal(response.status,429);assert.equal(error.code,'CITY_COOLDOWN');
  assert.deepEqual(error.cooldown,{action:'move',endsAt,serverNow:f.now});assert.equal(error.error,`이동까지 ${Math.ceil((endsAt-f.now)/1000)}초 남았습니다.`);
  assert.equal((await cityStatus(f.env,user,'MARKET',0,f.now)).mine.location,'HOME');
  assert.equal(await f.p('SELECT request_id FROM jokgak_city_actions_v1 WHERE request_id=?',body.requestId).first(),null);
  f.setTime(endsAt-1);const edge=await send();assert.equal(edge.status,429);assert.match((await edge.json()).error,/1초/);
  f.advance(1);const success=await send();assert.equal(success.status,200);assert.equal((await success.json()).mine.location,'MARKET');
  const replay=await send();assert.equal(replay.status,200);assert.equal((await replay.json()).replayed,true);
});
