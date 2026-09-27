import test from 'node:test';
import assert from 'node:assert/strict';
import {takeXBodyBatch} from '../preview/project-v-v3/source/battle/XBodySwordModel.mjs';
import {createBattleSuitCombatSchedule,Z_BODY_AREA_SKILL} from '../shared/z-body-area-skill.mjs';
import {X_BODY_AREA_SKILL} from '../shared/x-body-area-skill.mjs';

test('X flurry is boss-only and requires ten combat seconds between starts',()=>{
 const boss={id:'boss',isBoss:true},mob={id:'mob',isBoss:false};
 const batch=(target,combatAtMs,nextFlurryAtMs=0,count=1)=>takeXBodyBatch(Array.from({length:count},()=>({target,options:{damage:12,authoritative:true}})),{combatAtMs,nextFlurryAtMs});
 assert.equal(batch(mob,50000,0,48).mode,'attack');
 assert.equal(batch(boss,5000).mode,'skill','a single confirmed boss receipt is enough');
 assert.equal(batch(boss,14999,15000).mode,'attack');
 assert.equal(batch(boss,15000,15000).mode,'skill');
 assert.equal(batch({...boss,id:'another-boss'},14999,15000).mode,'attack','boss changes cannot reset the suit cooldown');
 assert.equal(batch(boss,null).mode,'attack','missing combat clock cannot invent a ready skill');
});

test('first X-BODY action is its area skill, then twenty seconds; Z and helicopter retain their cadence',()=>{
 const code='SKILL_CHIP_HELICOPTER_AIRSTRIKE',schedule=createBattleSuitCombatSchedule([code],false,true),events=[];
 while(schedule.peek()?.atMs<=60000)events.push(schedule.take());
 assert.equal(events[0].chip.code,X_BODY_AREA_SKILL.code);
 assert.deepEqual(events.filter(e=>e.chip.code===X_BODY_AREA_SKILL.code).map(e=>e.atMs),[0,20000,40000,60000]);
 assert.deepEqual(events.filter(e=>e.chip.code===code).map(e=>e.atMs),[15000,30000,45000,60000]);
 const z=createBattleSuitCombatSchedule([],true,false);
 assert.equal(z.take().atMs,Z_BODY_AREA_SKILL.intervalMs);
});
