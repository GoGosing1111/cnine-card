import test from 'node:test';import assert from 'node:assert/strict';
import {restoreBlackwingClear} from '../scripts/ops/blackwing-trophy-progress-20261102.mjs';
const launch='2026-11-01T02:55:44.000Z',at=Date.parse(launch);
const fixture=()=>({room_id:'0123456789',status:'CANCELLED',version:'13',state_json:JSON.stringify({id:'0123456789',status:'CANCELLED',releaseMode:'ON',step:'FINISHED',phase:4,boss:{hp:0},failure:null,startedAt:at-1000,finishedAt:at+5000,presentation:{key:'CLEAR',at},members:[{id:'45',left:true}],events:[{type:'BLACKWING_CUE',cueKey:'CLEAR',at}],clearRewards:{45:{status:'WEEKLY_LIMIT',granted:false}},untouched:{nested:[1,2]}}),receipts:[{kind:'action',status:'CLEAR',finished_at:String(at)}]});
test('repair uses the exact clear receipt time and changes only status, finishedAt and CAS version',()=>{
 const row=fixture(),before=structuredClone(row),plan=restoreBlackwingClear(row,launch);assert.deepEqual(row,before);
 assert.equal(plan.afterVersion,'14');assert.deepEqual(plan.participants,['45']);
 const expected=JSON.parse(row.state_json);expected.status='CLEAR';expected.finishedAt=at;assert.deepEqual(JSON.parse(plan.afterRaw),expected);
});
test('repair rejects pre-launch clears even when the last departure is after launch, and rejects missing/contradicting proof',()=>{
 for(const mutate of [
  r=>{r.receipts=[];},r=>{r.receipts[0].finished_at=String(at+1);},r=>{r.status='CLEAR';},
  (r,s)=>{s.releaseMode='TEST';},(r,s)=>{s.clearRewards={};},(r,s)=>{s.members[0].left=false;},
  (r,s)=>{s.boss.hp=1;},(r,s)=>{s.failure={code:'MEMBER_LEFT'};},(r,s)=>{s.events=[];},
  (r,s)=>{s.presentation.at=at-1;s.events[0].at=at-1;r.receipts[0].finished_at=String(at-1);}
 ]){const row=fixture(),state=JSON.parse(row.state_json);mutate(row,state);row.state_json=JSON.stringify(state);assert.throws(()=>restoreBlackwingClear(row,launch));}
});
