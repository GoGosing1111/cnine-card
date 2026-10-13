import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
const globals={};
vm.runInNewContext(readFileSync(new URL('../js/territory-vote-alert-v1.js',import.meta.url),'utf8'),{globalThis:globals,Date});
const {pollsFor,createTracker,createPreferences}=globals.CNineTerritoryVoteAlert;
const now=Date.now();
function fixture(){
  const skill=(side,code,votes)=>({ready:true,readyAt:null,voteKey:`V25:7:11:${side}:${code}:0`,votes,voted:false});
  return {mode:'ON',round:{id:7,status:'ACTIVE',ends_at:new Date(now+60000).toISOString()},front:{id:11},mine:{user_id:1,side:'A',status:'ACTIVE'},truce:{active:false},counter:{model:'SKILL_COOLDOWN',canVote:true,requiredVotes:25,operations:{ASSAULT:{name:'총공세'},INFILTRATION:{name:'기습 침투'}},A:{skills:{ASSAULT:skill('A','ASSAULT',0),INFILTRATION:skill('A','INFILTRATION',7)}},B:{skills:{ASSAULT:skill('B','ASSAULT',20)}}}};
}
test('only a ready ballot with actual allied votes on the selected front is highlighted',()=>{
  const s=fixture(),polls=pollsFor(s,now);
  assert.equal(polls.length,1);assert.equal(polls[0].code,'INFILTRATION');assert.equal(polls[0].votes,7);
  s.counter.A.skills.INFILTRATION.voted=true;
  assert.equal(pollsFor(s,now).length,1,'voters still see an ongoing ballot');
  s.front.id=12;assert.equal(pollsFor(s,now).length,0,'old front votes must not leak');
});
test('cooldown, completion, truce, spectators and inaccessible fronts remove the indicator',()=>{
  const changes=[s=>s.counter.A.skills.INFILTRATION.votes=0,s=>s.counter.A.skills.INFILTRATION.ready=false,
    s=>s.counter.A.skills.INFILTRATION.readyAt=new Date(now+1000).toISOString(),s=>s.truce.active=true,
    s=>s.counter.canVote=false,s=>s.round.status='FINISHED',s=>s.mode='OFF',s=>s.mine=null,
    s=>s.mine.status='LEFT',s=>s.round.ends_at=new Date(now-1).toISOString()];
  for(const change of changes){const s=fixture();change(s);assert.equal(pollsFor(s,now).length,0);}
});
test('own side, vote counts and threshold come from server state without changing vote permissions',()=>{
  const s=fixture();s.mine.side='B';s.counter.requiredVotes=30;
  const before=JSON.stringify(s),polls=pollsFor(s,now);
  assert.equal(polls.length,1);assert.equal(polls[0].votes,20);assert.equal(polls[0].required,30);
  assert.equal(JSON.stringify(s),before);
});
test('poll refresh, count increments, closing and reopening keep one notice per account and ballot',()=>{
  const data=new Map(),storage={getItem:k=>data.get(k),setItem:(k,v)=>data.set(k,v)};
  const s=fixture(),tracker=createTracker(storage),polls=pollsFor(s,now);
  assert.equal(tracker.unseen(polls).length,1);tracker.remember(polls);
  s.counter.A.skills.INFILTRATION.votes++;
  assert.equal(tracker.unseen(pollsFor(s,now)).length,0);
  assert.equal(createTracker(storage).unseen(pollsFor(s,now)).length,0,'refresh restores seen state');
  s.mine.user_id=2;assert.equal(tracker.unseen(pollsFor(s,now)).length,1,'another account has its own notice');
  s.mine.user_id=1;s.counter.A.skills.INFILTRATION.voteKey='V25:7:11:A:INFILTRATION:123';
  assert.equal(tracker.unseen(pollsFor(s,now)).length,1,'a new cooldown cycle opens a new ballot');
});
test('own votes do not create a duplicate confirmation alert; storage failure keeps in-memory deduplication',()=>{
  const tracker=createTracker({getItem(){throw Error('denied');},setItem(){throw Error('denied');}}),s=fixture();
  s.counter.A.skills.INFILTRATION.voted=true;
  assert.equal(tracker.unseen(pollsFor(s,now)).length,0);
  tracker.remember(pollsFor(s,now));s.counter.A.skills.INFILTRATION.voted=false;
  assert.equal(tracker.unseen(pollsFor(s,now)).length,0);
});
test('vote alert preference defaults on, survives reload and stays account-specific',()=>{
  const data=new Map(),storage={getItem:k=>data.get(k),setItem:(k,v)=>data.set(k,v)},prefs=createPreferences(storage);
  assert.equal(prefs.enabled(1),true);
  prefs.set(1,false);assert.equal(prefs.enabled(1),false);
  assert.equal(createPreferences(storage).enabled(1),false);
  assert.equal(prefs.enabled(2),true);
  prefs.set(1,true);assert.equal(createPreferences(storage).enabled(1),true);
});
test('unavailable preference storage still lets this page turn notifications off',()=>{
  const prefs=createPreferences({getItem(){throw Error('denied');},setItem(){throw Error('denied');}});
  assert.equal(prefs.enabled(1),true);prefs.set(1,false);assert.equal(prefs.enabled(1),false);
});
