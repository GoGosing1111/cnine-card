import test from 'node:test';
import assert from 'node:assert/strict';
import {createServerClock} from '../shared/server-clock-v1.mjs';
import {contentEnergy,contentEnergyView,contentEnergyText,CONTENT_ENERGY_RECHARGE_MS as H} from '../shared/content-energy-v1.mjs';

const at=Date.parse('2026-10-20T10:30:00+09:00');

test('cooperative synchronized clock can render energy after room and websocket updates',()=>{
 let mono=100;
 const clock=createServerClock({now:()=>mono,wallNow:()=>at});
 clock.sample(at,{receivedAt:mono});
 mono+=0.25;
 const displayTime=clock.now();
 assert.equal(displayTime,at+0.25);
 const record=contentEnergy(null,{at,maximum:3,initial:2});
 const view=contentEnergyView(record,{at:displayTime,maximum:3});
 assert.equal(view.current,2);
 assert.equal(view.serverNow,at);
 assert.match(contentEnergyText(view,displayTime),/행동력 2 \/ 3 · 다음 충전 03:00:00/);
 assert.equal(record.updatedAt,at,'rendering does not change the stored balance');
});

test('fractional display time does not recharge early or persist fractional timestamps',()=>{
 for(const maximum of [3,10,13]){
  const record=contentEnergy(null,{at,maximum,initial:0});
  const before=contentEnergyView(record,{at:at+H-0.25,maximum});
  assert.equal(before.current,0);
  assert.match(contentEnergyText(before,at+H-0.25),/다음 충전 00:00:01/);
  const after=contentEnergyView(record,{at:at+H+0.25,maximum});
  assert.equal(after.current,1);
  assert.equal(after.updatedAt,at+H);
  assert.equal(after.serverNow,at+H);
  const full=contentEnergyView({...record,current:maximum},{at:at+0.25,maximum});
  assert.equal(full.updatedAt,at);
  assert.equal(full.nextRechargeAt,null);
  assert.match(contentEnergyText(full,at+0.25),/충전 완료/);
 }
});

test('display normalization preserves invalid-policy checks and strict persisted clocks',()=>{
 const record=contentEnergy(null,{at,maximum:3});
 for(const time of [NaN,Infinity,-Infinity,-0.25,'123'])
  assert.throws(()=>contentEnergyView(record,{at:time,maximum:3}),/Invalid content energy policy/);
 for(const maximum of [0,1.5,undefined])
  assert.throws(()=>contentEnergyView(record,{at:at+0.25,maximum}),/Invalid content energy policy/);
 assert.throws(()=>contentEnergy(record,{at:at+0.25,maximum:3}),/Invalid content energy policy/);
});
