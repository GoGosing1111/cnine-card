import test from 'node:test';
import assert from 'node:assert/strict';
import {createOrganizationDay,nextOrganizationStart} from '../shared/organization-schedule-v1.mjs';
import {advanceOrganizationFaction,newOrganizationFactionState} from '../functions/_organization_faction_model.js';
import {organizationFactionFixture} from './helpers/organization-faction-fixture.mjs';
const at=s=>Date.parse(s+'+09:00'),day='2026-10-24',start=at(day+'T20:00:00'),end=at(day+'T22:00:00');
const state=()=>newOrganizationFactionState(start-1000);
const tick=(s,now,wars=[])=>advanceOrganizationFaction(s,{now,schedule:[],wars,roster:[],assignedAt:start-86400000,policy:{fundsPerRegion:null}});
test('organization schedule uses KST Tue Thu Sat Sun 20–22, including midnight/week rollover',()=>{
 assert.deepEqual(Array.from({length:7},(_,i)=>createOrganizationDay('2026-10-'+(25+i)).length),[1,0,1,0,1,0,1]);
 const [slot]=createOrganizationDay(day);assert.equal(slot.startsAt,start);assert.equal(slot.endsAt,end);
 assert.equal(nextOrganizationStart(end),at('2026-10-25T20:00:00'));
 assert.equal(nextOrganizationStart(at('2026-10-25T22:00:00')),at('2026-10-27T20:00:00'));
});
test('20:00 opens, 22:00 closes once; settled history and holdings persist; no random/deferred starts',()=>{
 const s=state();s.sessionDay=day;s.sessionPlan=[{key:'old',startsAt:start-100,endsAt:end,status:'SCHEDULED'}];s.sessionQueue=[{key:'old-queued'}];s.districts[0].owner=2;
 assert.equal(tick(s,start-1).view.active,false);assert.equal(s.sessionQueue.length,0);
 assert.equal(tick(s,start).view.active,true);assert.equal(s.session.key,day+':fixed-20');
 assert.equal(tick(s,end-1).view.active,true);
 const result=tick(s,end);assert.equal(result.view.active,false);assert.equal(result.settlements.length,1);assert.equal(s.session.closedAt,end);
 assert.equal(tick(s,end+1).settlements.length,0);assert.equal(s.districts[0].owner,2);
 assert.equal(tick(s,at('2026-10-26T21:00:00')).view.active,false);
});
test('territory wars pause and resume inside the fixed window without extending 22:00',()=>{
 const s=state();tick(s,start);
 const war={id:1,status:'ACTIVE',starts_at:new Date(start+1800000).toISOString(),ends_at:new Date(end+3600000).toISOString()};
 assert.equal(tick(s,start+3600000,[war]).view.current.status,'PAUSED');
 const finished={...war,status:'FINISHED',settled_at:new Date(start+4000000).toISOString()};
 assert.equal(tick(s,start+4100000,[finished]).view.active,true);assert.equal(s.session.endsAt,end);
 assert.equal(tick(s,end,[finished]).settlements.length,1);
 const second=state();tick(second,start,[war]);tick(second,start+3600000,[war]);
 assert.equal(tick(second,end,[war]).settlements.length,1);assert.equal(second.session.status,'SETTLED');
 assert.equal(tick(second,end+86400000,[war]).settlements.length,0);
});
test('late first visit never backfills an unplayed session; assignment after start waits for next slot',()=>{
 const s=state();assert.equal(tick(s,end+1).settlements.length,0);assert.equal(s.sessionPlan[0].status,'SKIPPED');
 const other=state();const result=advanceOrganizationFaction(other,{now:start+1000,schedule:[],wars:[],roster:[],assignedAt:start+1,policy:{fundsPerRegion:null}});
 assert.equal(result.view.active,false);assert.equal(other.sessionPlan[0].reason,'BEFORE_ASSIGNMENT');
});
test('API fixed settlement rolls back on failure and retries once; old published schedule cannot reopen',async t=>{
 const f=await organizationFactionFixture(t,{live:true,funds:100});f.advance(start-f.clock());
 let r=await f.overview();assert.equal(r.status,200);assert.equal(r.data.sessions.active,true);
 await f.mutateState(s=>{s.session.participants=[2];s.session.participantClans={2:1};s.districts.slice(0,8).forEach(d=>d.owner=1);});
 f.advance(end-f.clock());f.fail('INSERT INTO user_message_rewards');
 assert.equal((await f.overview()).status,503);f.fail('');
 assert.equal((await f.pg.query("SELECT count(*)::int n FROM organization_faction_settlements_v1 WHERE session_key LIKE '%fixed%'")).rows[0].n,0);
 r=await f.overview();assert.equal(r.status,200);assert.equal(r.data.sessions.active,false);
 const once=(await f.pg.query('SELECT count(*)::int n FROM user_message_rewards')).rows[0].n;assert.equal(once,3);
 await f.overview();assert.equal((await f.pg.query('SELECT count(*)::int n FROM user_message_rewards')).rows[0].n,once);
 assert.equal(r.data.sessions.nextStartsAt,at('2026-10-25T20:00:00'));
});
