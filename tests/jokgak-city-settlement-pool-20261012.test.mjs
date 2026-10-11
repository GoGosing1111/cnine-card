import test from 'node:test';
import assert from 'node:assert/strict';
import {cityFixture} from './helpers/jokgak-city-fixture.mjs';
import {settleCityRound} from '../functions/_jokgak_city_round.js';
import {cityShift} from '../shared/jokgak-city-v1.mjs';
import {CITY_TOP_CURSOR} from '../functions/_jokgak_city_top.js';
const LEASE='jokgak_city_rotation_lease_v1';

for(const pg of [false,true]){
 const db=pg?'Postgres':'SQLite';
 test(db+': concurrent pollers cannot duplicate a pending settlement scan; completion and retry release the lease',async t=>{
  const f=await cityFixture(t,pg);await f.join(1);await f.join(2);const end=cityShift(f.now).endsAt;
  const real=f.env.DB;let scans=0,release,started;
  const gate=new Promise(resolve=>{release=resolve;}),entered=new Promise(resolve=>{started=resolve;});
  f.env.DB={dialect:real.dialect,batch:s=>real.batch(s),prepare(sql){
   const statement=real.prepare(sql);
   if(!sql.startsWith('SELECT c.*,life.value AS life_raw,'))return statement;
   return {bind(...values){const bound=statement.bind(...values);return {async all(){scans++;started();await gate;return bound.all();}};}};
  }};
  const winner=settleCityRound(f.env,end);await entered;
  try{
   const contenders=await Promise.allSettled(Array.from({length:20},()=>settleCityRound(f.env,end)));
   assert.ok(contenders.every(r=>r.status==='rejected'&&r.reason.code==='CITY_ROUND_SETTLING'));
   assert.equal(scans,1);
  }finally{release();}
  assert.equal((await winner).changed,true);assert.equal(scans,1);
  assert.equal(await f.p('SELECT value FROM app_meta WHERE key=?',LEASE).first(),null);
  assert.equal((await settleCityRound(f.env,end)).changed,false);assert.equal(scans,1);
 });
 test(db+': crashed settlement leases expire, failed grants retain the round, and a retry settles once',async t=>{
  const f=await cityFixture(t,pg);await f.join(1);const shift=cityShift(f.now),end=shift.endsAt;
  await f.p('INSERT INTO app_meta(key,value) VALUES(?,?)',LEASE,JSON.stringify({token:'crashed',until:Date.now()-1})).run();
  f.fail('DELETE FROM jokgak_city_actions_v1');await assert.rejects(settleCityRound(f.env,end),/INJECTED_FAILURE/);f.fail('');
  assert.equal((await f.p('SELECT value FROM app_meta WHERE key=?',CITY_TOP_CURSOR).first()).value,String(shift.id));
  assert.equal(await f.p('SELECT value FROM app_meta WHERE key=?',LEASE).first(),null);
  assert.equal((await settleCityRound(f.env,end)).changed,true);
  assert.equal((await settleCityRound(f.env,end)).changed,false);
 });
}
