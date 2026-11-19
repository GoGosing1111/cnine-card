import test from 'node:test';
import assert from 'node:assert/strict';
import {noxFixture,NOX_DECK} from './helpers/nox-live-fixture.mjs';
import {createNoxRoom,addNoxMember,readyNoxMember,startNoxRoom,actNoxRoom,NOX_RULES} from '../functions/_raid_nox.js';

function party(){const r=createNoxRoom({id:'STREAMQA01',hostId:'1',size:3});for(let n=1;n<=3;n++){addNoxMember(r,{id:String(n),cards:NOX_DECK});readyNoxMember(r,String(n));}startNoxRoom(r,'1',0);return r;}
const stream=(r,seq,inputs)=>({seq,challengeId:r.challenge.id,inputs,stream:true});
const hits=r=>r.challenge.chart.slice(0,3).map(n=>({lane:n.lane,at:r.challenge.musicStartAt+n.at}));

test('overlapping and reordered stream packets score every physical press once',()=>{
  for(const order of [[0,1,2],[2,0,1],[1,2,0]]){
    const r=party(),p=hits(r),packets=p.map((_,i)=>stream(r,i+1,p.slice(0,i+1))),now=p[2].at;
    for(const i of order)actNoxRoom(r,'1',packets[i],now);
    assert.equal(r.members[0].score,3);assert.equal(r.members[0].lastSequence,3);assert.equal(r.members[0].hits.length,3);
    assert.equal(r.events.filter(e=>e.type==='NOX_JUDGE').length,3);
    actNoxRoom(r,'1',packets[2],now+3000);assert.equal(r.members[0].score,3);
    assert.throws(()=>actNoxRoom(r,'1',{...packets[2],inputs:[{lane:0,at:now}]},now+3000),{code:'REPLAY_CONFLICT'});
  }
});

test('acknowledged overlap may be old; every new input retains receipt and lane validation',()=>{
  const r=party(),c=r.challenge,first=c.chart[0],last=c.chart.find(n=>n.at>first.at+2200),p={lane:first.lane,at:c.musicStartAt+first.at},q={lane:last.lane,at:c.musicStartAt+last.at};
  actNoxRoom(r,'1',stream(r,1,[p]),p.at);
  actNoxRoom(r,'1',stream(r,2,[p,q]),q.at);assert.equal(r.members[0].score,2);
  for(const input of [{lane:0,at:q.at+NOX_RULES.inputLeadMs+1},{lane:0,at:q.at-NOX_RULES.receiptGraceMs-1},{lane:4,at:q.at},null]){
    const before=JSON.stringify(r.members[0]);assert.throws(()=>actNoxRoom(r,'1',stream(r,3,[input]),q.at),{code:'INPUT_TIME'});assert.equal(JSON.stringify(r.members[0]),before);
  }
  for(const packet of [{...stream(r,3,[])} ,{...stream(r,1,[p,q])},{...stream(r,3,[q]),stream:'true'}])assert.throws(()=>actNoxRoom(r,'1',packet,q.at),{code:'INPUT'});
  // A fresh repeated key remains a penalized empty press, not an idempotent retry.
  actNoxRoom(r,'1',stream(r,3,[q]),q.at);assert.equal(r.members[0].score,1.5);
});

test('cumulative floor input keeps order, once-only progress, and mine deaths',()=>{
  for(const mine of [false,true]){
    const r=party(),at=10000;r.stage='MEMORY';r.challenge={id:'memory2',stage:'MEMORY',startsAt:at-2000,revealEnd:at-500,deadline:at+1000,sequence:[2,13,28],tiles:Array.from({length:30},(_,id)=>({id,kind:[2,13,28].includes(id)?'safe':'mine'}))};
    for(const m of r.members){m.memoryIndex=0;m.memoryTiles=[];}
    const p=(mine?[2,0,28]:[2,13,28]).map(lane=>({lane,at}));
    actNoxRoom(r,'1',stream(r,1,p.slice(0,1)),at);
    actNoxRoom(r,'1',stream(r,3,p),at);actNoxRoom(r,'1',stream(r,2,p.slice(0,2)),at);
    assert.equal(r.members[0].memoryIndex,mine?1:3);assert.equal(r.members[0].hp>0,!mine);
    assert.deepEqual(r.members[0].memoryTiles,mine?[2]:[2,13,28]);
  }
});

test('six live streams merge reordered overlapping requests with no lost or duplicate hits',async t=>{
  const h=await noxFixture(t),{roomId,ids}=await h.party(6);await h.command('start',{roomId});const at=Date.now();
  const r=await h.changeRoom(roomId,r=>{r.clock=at-1000;r.challenge.startsAt=r.challenge.musicStartAt=at-400;r.challenge.deadline=at+30000;r.challenge.chart=[0,1,2].map((lane,i)=>({id:i+1,lane,at:(i+1)*100}));});
  const p=hits(r),packets=[3,1,2].map(seq=>({...stream(r,seq,p.slice(0,seq)),roomId}));
  const results=await Promise.all(ids.flatMap(user=>packets.map(body=>h.call('action',{user,body}))));
  for(const result of results)assert.equal(result.status,200,JSON.stringify(result));
  const stored=JSON.parse((await h.one('SELECT state_json FROM raid_nox_rooms_v1 WHERE room_id=$1',[roomId])).state_json);
  assert(stored.members.every(m=>m.hits.length===3&&m.score===3&&m.lastSequence===3));
  assert.equal(stored.events.filter(e=>e.type==='NOX_JUDGE').length,18);assert.equal(new Set(stored.events.map(e=>e.seq)).size,stored.events.length);
  h.resetQueries();assert.equal((await h.call('action',{body:packets[0]})).status,200);assert.equal(h.queries().filter(q=>/^UPDATE|^INSERT|^DELETE/.test(q)).length,0);
  assert.equal((await h.command('create',{size:3,clientVersion:2},4)).body.code,'NOX_TEST_ONLY');
});

test('old response-blocking clients must refresh before creating or joining a new raid',async t=>{
  const h=await noxFixture(t);assert.equal((await h.command('create',{size:3,clientVersion:2})).body.code,'NOX_CLIENT_UPDATE');
  const created=await h.command('create',{size:3});assert.equal(created.status,200);
  assert.equal((await h.command('join',{roomId:created.body.roomId,clientVersion:2},2)).body.code,'NOX_CLIENT_UPDATE');
});
