import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {GENERAL_REIGN_BOUNDARY as boundary,chiefReignStyle} from '../shared/chief-presentation-v1.mjs';

test('current ninth reign and extensions keep the queen; all later appointments become general',()=>{
  const current={id:boundary.appointmentId,userId:boundary.userId,startsAt:boundary.startsAt,ordinal:9};
  assert.equal(chiefReignStyle(current),'QUEEN');
  assert.equal(chiefReignStyle({...current,endsAt:'2099-01-01',nickname:'renamed'}),'QUEEN');
  assert.equal(chiefReignStyle({...current,startsAt:'2099-01-01'}),'QUEEN');
  for(const userId of [boundary.userId,4773,9000])for(const source of ['PLAY DK 투표','COUP']){
    assert.equal(chiefReignStyle({...current,id:'next-term',userId,source,startsAt:'2026-10-06T00:00:00Z'}),'GENERAL');
  }
  assert.equal(chiefReignStyle({...current,id:'later-than-next',userId:500,startsAt:'2027-01-01'}),'GENERAL');
  assert.equal(chiefReignStyle({...current,id:'historical',startsAt:'2026-09-20T00:00:00Z'}),'QUEEN');
  for(const invalid of [{},{id:'next',startsAt:'bad'},{startsAt:'2027-01-01'}])assert.equal(chiefReignStyle(invalid),'QUEEN');
});

test('public status adds presentation without changing authority or mutating the appointment',()=>{
  const source=readFileSync(new URL('../functions/_chief.js',import.meta.url),'utf8');
  const fn=source.slice(source.indexOf('function publicState('),source.indexOf('async function activate('));
  const context={Date,chiefReignStyle,chiefOrdinal:value=>Number(value)};
  vm.createContext(context);vm.runInContext(fn,context);
  const a={id:'next',userId:4773,nickname:'후임',ordinal:10,startsAt:'2026-10-06T00:00:00Z',endsAt:'2026-10-13T00:00:00Z',active:true};
  const before=structuredClone(a),usage={burningToday:1,hyperToday:0,towerResetCount:1};
  const state=context.publicState(a,usage,4773);
  assert.equal(state.reignStyle,'GENERAL');assert.equal(state.isChief,true);assert.equal(state.appointmentId,a.id);
  assert.equal(state.startsAt,a.startsAt);assert.equal(state.endsAt,a.endsAt);assert.equal(state.usage,usage);
  assert.equal(state.limits.burningPerDay,2);assert.equal(state.limits.hyperPerDay,1);assert.equal(state.limits.towerResetsPerTerm,2);
  assert.deepEqual(a,before);
  assert.equal(context.publicState({...a,active:false,dutyStatus:'OPEN'},usage,4773).isChief,false);
  assert.equal(context.publicState(a,usage,1).isChief,false);
});
