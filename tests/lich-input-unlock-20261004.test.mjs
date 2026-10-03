import test from 'node:test';
import assert from 'node:assert/strict';
import {lichCoopInputState,lichInputKey} from '../preview/lich-king-raid-v1/clock.mjs';
const state={status:'ACTIVE',combatRevision:2};
test('countdowns distinguish advance warning, live input, pending request and expired input',()=>{
  const control={action:'CLEANSE',startsAt:3000,deadline:9000,blocked:false};
  const warning=lichCoopInputState(state,{},control,0);assert.equal(warning.ready,false);assert.equal(warning.clock,'예고 3초');
  const open=lichCoopInputState(state,{},control,3000);assert.equal(open.ready,true);assert.equal(open.clock,'남은 6초');
  const pending=lichCoopInputState(state,{},control,3000,true);assert.equal(pending.ready,false);assert.equal(pending.clock,'입력 확인 중');
  assert.equal(lichCoopInputState(state,{},control,9000).clock,'시간 종료');
  assert.equal(lichCoopInputState({...state,status:'FAILED'},{},control,5000).ready,false);
});
test('only the accepted attack opportunity is locked; unrelated duties, users, tokens and next phase remain independent',()=>{
  const strike='room:v2:3:strike-7:2',burst='room:v2:3:burst-7:2';
  assert.equal(lichInputKey(strike),lichInputKey(burst));
  for(const token of ['room:v2:3:curse:0','room:v2:3:soul-0:0','room:v2:3:strike-8:2','room:v2:3:strike-7:3','room:v2:4:strike-7:2'])assert.notEqual(lichInputKey(strike),lichInputKey(token));
  assert.notEqual(lichInputKey('room:v2:3:seal-0:0:1'),lichInputKey('room:v2:3:seal-0:0:2'));
  const cooldown=lichCoopInputState(state,{}, {action:'STRIKE',startsAt:1400,deadline:11000},0);
  assert.equal(cooldown.clock,'재사용 1.4초');assert.equal(cooldown.ready,false);
  assert.equal(lichCoopInputState(state,{}, {action:'STRIKE',startsAt:1400,deadline:11000},1400).ready,true);
});
test('known absorption deadline releases shatter without waiting for another poll, but seal and expiry still gate it',()=>{
  const challenge={hasPrison:true,sealed:true,breathAt:8000};
  const shatter={action:'SHATTER',blocked:true,startsAt:8000,deadline:14000};
  assert.equal(lichCoopInputState(state,challenge,shatter,7999).ready,false);
  assert.equal(lichCoopInputState(state,challenge,shatter,8000).ready,true);
  assert.equal(lichCoopInputState(state,{...challenge,sealed:false},shatter,8000).ready,false);
  assert.equal(lichCoopInputState(state,challenge,shatter,14000).ready,false);
  assert.equal(lichCoopInputState(state,challenge,shatter,8000,true).ready,false);
  assert.equal(shatter.blocked,true,'presentation never edits authoritative controls');
});
test('a timer does not bypass unresolved prerequisites or spent resources',()=>{
  for(const action of ['TRANSFER','RESCUE','CLEANSE','INTERRUPT','BURST'])assert.equal(lichCoopInputState(state,{hasPrison:true,sealed:true,breathAt:1000},{action,blocked:true,startsAt:1000,deadline:9000},4000).ready,false);
});
