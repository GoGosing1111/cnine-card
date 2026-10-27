import test from 'node:test';
import assert from 'node:assert/strict';
import {ensureDuoAlarm,handleDuoAlarm} from '../workers/clan-draft/src/duo-schedule.js';

const clock=Date.parse('2026-10-27T06:47:48.087Z');
function storage(alarm){
 const writes=[];
 return {writes,getAlarm:async()=>alarm,setAlarm:async value=>{alarm=value;writes.push(value);}};
}

test('the persisted October 25 alarm is rearmed and a repeated cron preserves the recovery',async()=>{
 const s=storage(Date.parse('2026-10-25T13:34:08.126Z'));
 assert.deepEqual(await ensureDuoAlarm(s,clock),{nextAlarmAt:clock+1000});
 assert.deepEqual(await ensureDuoAlarm(s,clock+100),{nextAlarmAt:clock+1000});
 assert.deepEqual(s.writes,[clock+1000]);
 let ticks=0;
 await handleDuoAlarm(s,{}, {now:()=>clock+1000,run:async()=>{ticks++;return {phase:'ACTIVE',nextCheckAt:new Date(clock+2000).toISOString()};}});
 assert.equal(ticks,1);
 assert.equal(await s.getAlarm(),clock+2000);
});

test('scheduled and recently due alarms are preserved without postponing delivery',async()=>{
 for(const offset of [-60000,-1,0,1000,60000]){
  const s=storage(clock+offset);
  assert.deepEqual(await ensureDuoAlarm(s,clock),{nextAlarmAt:clock+offset});
  assert.deepEqual(s.writes,[]);
 }
});

test('an alarm beyond the grace interval is recovered on the next cron',async()=>{
 const s=storage(clock-60001);
 await ensureDuoAlarm(s,clock);
 assert.deepEqual(s.writes,[clock+1000]);
});

test('missing and excessively distant alarms keep the existing one-second arming behavior',async()=>{
 for(const current of [null,clock+60001]){
  const s=storage(current);
  await ensureDuoAlarm(s,clock);
  assert.deepEqual(s.writes,[clock+1000]);
 }
});

test('a recovered alarm retains the failure retry before doing database work',async()=>{
 const s=storage(clock-60001);
 await ensureDuoAlarm(s,clock);
 await assert.rejects(handleDuoAlarm(s,{}, {now:()=>clock+1000,run:async()=>{throw Error('database offline');}}),/database offline/);
 assert.equal(await s.getAlarm(),clock+61000);
 await ensureDuoAlarm(s,clock+1001);
 assert.deepEqual(s.writes,[clock+1000,clock+61000]);
});

test('storage failures propagate so cron can retry instead of reporting a false recovery',async()=>{
 await assert.rejects(ensureDuoAlarm({getAlarm:async()=>clock-60001,setAlarm:async()=>{throw Error('storage offline');}},clock),/storage offline/);
});
