import test from 'node:test';import assert from 'node:assert/strict';
import {LEGION_RECOVERY_EVENT as EVENT,legionRechargeAt,legionRechargeWork,legionRechargeMs} from '../shared/legion-hunt-energy-v1.mjs';
import {legionHuntEnergyView,legionHuntEnergyBalance,legionHuntEnergyText} from '../shared/legion-hunt-energy-v1.mjs';
import {contentEnergyView} from '../shared/content-energy-v1.mjs';
import {legionHuntEnergy,restoreExtremeLegionEnergy} from '../functions/_legion_hunt.js';
import {citadelFixture} from './helpers/legion-citadel-fixture.mjs';
const H=3600000,S=EVENT.startsAt,E=EVENT.endsAt,record=(at,current=0)=>({version:1,current,maximum:10,updatedAt:at});

test('November 25 is inclusive in Korea; only the two legion recovery rates change',()=>{
 assert.equal(new Date(E).toISOString(),'2026-11-25T15:00:00.000Z');
 for(const [at,rate] of [[S-1,1],[S,2],[Date.parse('2026-11-24T00:00:00+09:00'),2],[E-1,2],[E,1]]){
  assert.equal(legionRechargeMs(3*H,at),3*H/rate);assert.equal(legionRechargeMs(6*H,at),6*H/rate);
 }
 assert.equal(contentEnergyView(record(S),{at:S+1.5*H,maximum:3}).current,0,'cooperative battleground remains three hours');
 assert.match(legionHuntEnergyText(record(S),S),/1시간 30분마다 1회.*11월 25일 23:59까지/);
 assert.match(legionHuntEnergyText(record(E),E),/3시간마다 1회/);assert.doesNotMatch(legionHuntEnergyText(record(E),E),/50%/);
});

test('solo retains pre-event progress, charges at 90 minutes, and restores three hours after expiry',()=>{
 const before=record(S-H),original=structuredClone(before);
 assert.equal(legionHuntEnergyView(before,{at:S,maximum:10}).nextRechargeAt,S+H);
 assert.equal(legionHuntEnergyView(before,{at:S+H-1,maximum:10}).current,0);
 assert.equal(legionHuntEnergyView(before,{at:S+H,maximum:10}).current,1);assert.deepEqual(before,original);
 const during=record(S);assert.equal(legionHuntEnergyView(during,{at:S+1.5*H-1,maximum:10}).current,0);assert.equal(legionHuntEnergyView(during,{at:S+1.5*H,maximum:10}).current,1);
 const after=record(E);assert.equal(legionHuntEnergyView(after,{at:E+1.5*H,maximum:10}).current,0);assert.equal(legionHuntEnergyView(after,{at:E+3*H,maximum:10}).current,1);
});

test('capacity, daily refill, debit/refund anchors and Extreme Burning pulses remain consistent',()=>{
 const supporter={active:true,startsAt:S-H,endsAt:E+H},full=legionHuntEnergy({energy:record(S-48*H)},S,supporter);
 assert.equal(full.current,13);assert.equal(full.updatedAt,S);
 const spent=legionHuntEnergyBalance({...full,current:12},{at:S,maximum:13});assert.equal(legionHuntEnergyView(spent,{at:S+1.5*H-1,maximum:13}).current,12);
 assert.equal(legionHuntEnergyView(spent,{at:S+1.5*H,maximum:13}).current,13);
 assert.equal(legionHuntEnergyView(record(E-1),{at:E,maximum:10}).current,10,'daily midnight refill remains full');
 const run={energy:record(S)},pulses=[{generation:1,at:S+H}];
 const restored=restoreExtremeLegionEnergy(run,pulses,S+H,null,{role:'USER'});assert.equal(restored.energy.current,1);
 assert.deepEqual(restoreExtremeLegionEnergy(restored,pulses,S+H,null,{role:'USER'}),restored);
 assert.equal(legionHuntEnergy(restored,S+1.5*H).current,2,'pulse does not discard the already accrued hour');
});

test('party deadlines retain recovery earned before either boundary, including expiry while offline',()=>{
 assert.equal(legionRechargeAt(S-2*H,6*H),S+2*H);
 assert.equal(legionRechargeAt(S,6*H),S+3*H);
 assert.equal(legionRechargeAt(E-H,6*H),E+4*H);
 assert.equal(legionRechargeAt(E,6*H),E+6*H);
 for(const from of [S-6*H,S-H,S,S+H,E-4*H,E-H,E,E+H])for(const work of [0,3*H,6*H]){
  const deadline=legionRechargeAt(from,work);assert(legionRechargeWork(from,deadline)>=work);
  if(work)assert(legionRechargeWork(from,deadline-1)<work,'never recharge a millisecond early');
 }
});

const states=async(f,uid,cmd,body)=>{const r=await f.action(uid,cmd,body);assert.equal(r.status,200,JSON.stringify(r.body));return r.body;};
for(const postgres of [false,true]){
 test(`${postgres?'PostgreSQL':'SQLite'}: existing party cooldown, reopening, expiry and entry guards share the same scheduled deadline`,async t=>{
  const f=await citadelFixture({postgres});t.after(()=>f.close());const key='legion_citadel_v1:next-entry:1',nominal=String(S+4*H);
  await f.exec('INSERT INTO app_meta(key,value) VALUES(?,?)',key,nominal);f.clock.now=S+2*H-1;
  assert.equal((await states(f,1,'lobby')).nextEntryAt,S+2*H);assert.equal((await states(f,1,'lobby')).partyRechargeHours,3);
  assert.equal((await f.action(1,'create',{requestId:'event-existing-party-cooldown'})).body.code,'CITADEL_COOLDOWN');
  assert.equal((await f.db.prepare('SELECT value FROM app_meta WHERE key=?').bind(key).first()).value,nominal,'read-only deadline projection preserves the saved anchor');
  f.clock.now=S+2*H;assert.equal((await states(f,1,'lobby')).nextEntryAt,null);
  await f.exec('UPDATE app_meta SET value=? WHERE key=?',String(E+5*H),key);
  f.clock.now=E-1;assert.equal((await states(f,1,'lobby')).nextEntryAt,E+4*H);
  f.clock.now=E;const restored=await states(f,1,'lobby');assert.equal(restored.partyRechargeHours,6);assert.equal(restored.nextEntryAt,E+4*H);assert.equal(restored.recoveryEvent,null);
  f.clock.now=E+4*H;assert.equal((await f.action(1,'create',{requestId:'event-expiry-party-cooldown'})).status,200);
 });
 test(`${postgres?'PostgreSQL':'SQLite'}: two loading acknowledgments debit once and publish a three-hour party deadline`,async t=>{
  const f=await citadelFixture({postgres});t.after(()=>f.close());f.clock.now=S+H;
  const {state:{id}}=await states(f,1,'create',{requestId:'event-party-two-loading-acks'});await states(f,2,'join',{id});
  for(const u of [1,2])await states(f,u,'ready',{id,...f.selection(u-1)});await states(f,1,'start',{id});
  await states(f,1,'loaded',{id});assert.equal((await states(f,2,'lobby')).nextEntryAt,null);
  const active=(await states(f,2,'loaded',{id})).state;assert.equal(active.nextEntryAt,active.startsAt+3*H);
  await states(f,2,'loaded',{id});for(const uid of [1,2]){
   assert.equal((await states(f,uid,'lobby')).nextEntryAt,active.startsAt+3*H);
   assert.equal((await f.db.prepare('SELECT value FROM app_meta WHERE key=?').bind('legion_citadel_v1:next-entry:'+uid).first()).value,String(active.startsAt+6*H));
  }
 });
}
