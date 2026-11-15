import test from 'node:test';import assert from 'node:assert/strict';import {mergePolish} from '../scripts/ops/workshop-polish-inheritance-20261115.mjs';
const state=(id,levels,rolls)=>JSON.stringify({schemaVersion:1,userId:1195,instanceId:id,attempts:levels.reduce((a,b)=>a+b,0),rolls,levels,values:levels.map((n,i)=>n*[2,.5,3,2,.5][i])}),policy={maxAttempts:50,options:Array.from({length:5},()=>({maxLevel:20}))};
test('recovery adds lost source to later earned polish without replacing new options or rolls',()=>{
 const r=mergePolish(state('1',[0,0,0,1,0],10),state('2',[0,1,1,0,0],13),'1','2',1195,policy);assert.equal(r.after.attempts,3);assert.equal(r.after.rolls,23);assert.deepEqual(r.after.levels,[0,1,1,1,0]);assert.deepEqual(r.after.values,[0,.5,3,2,0]);assert.equal(r.after.instanceId,'2');
});
test('recovery without subsequent polish transfers all five options and historical failures',()=>{
 const r=mergePolish(state('1',[1,1,1,1,1],73),null,'1','2',1195,policy);assert.equal(r.after.attempts,5);assert.equal(r.after.rolls,73);assert.deepEqual(r.after.values,[2,.5,3,2,.5]);
});
test('recovery refuses wrong owner, corrupt state or overflowing policy rather than truncating earned growth',()=>{
 assert.throws(()=>mergePolish(state('1',[1,1,1,1,1],73),null,'1','2',5,policy));
 assert.throws(()=>mergePolish(state('1',[20,0,0,0,0],73),state('2',[1,0,0,0,0],1),'1','2',1195,policy),/cap/);
 assert.throws(()=>mergePolish(state('1',[20,20,10,0,0],73),state('2',[0,0,0,1,0],1),'1','2',1195,policy),/over-cap/);
});
