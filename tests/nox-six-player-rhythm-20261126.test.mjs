import test from 'node:test';
import assert from 'node:assert/strict';
import {NOX_RHYTHM_VERSION} from '../shared/nox-raid-chart-v1.mjs';
import {createNoxRoom, addNoxMember, readyNoxMember, startNoxRoom, actNoxRoom, tickNoxRoom, NOX_RULES} from '../functions/_raid_nox.js';
import {NOX_DECK, noxFixture} from './helpers/nox-live-fixture.mjs';

function sixPlayerRoom(track, difficulty = 'NORMAL') {
  const room = createNoxRoom({id: '0123456789', hostId: '1', size: 6, difficulty, rhythmVersion: NOX_RHYTHM_VERSION});
  room.playlist[0] = track;
  for (let i = 1; i <= room.size; i++) {
    const id = String(i);
    addNoxMember(room, {id, cards: NOX_DECK});
    readyNoxMember(room, id);
  }
  startNoxRoom(room, '1', 0);
  return room;
}

for (const difficulty of ['NORMAL', 'HELL']) {
  test('six full combos survive queued packets and a poll at song end in ' + difficulty, () => {
    for (const track of ['bgm-08d1da738cc0-full1', 'bgm-8f33aa7cdf7f-full1']) {
      const room = sixPlayerRoom(track, difficulty);
      const c = room.challenge, timeline = [], originalEnrage = room.endsAt;
      for (const [i, member] of room.members.entries()) {
        // Mix GOOD and PERFECT full combos. Keep a hold's tail as its own transition.
        const delta = i % 2 ? 92 : 6;
        const inputs = c.chart.flatMap(n => {
          const press = {lane:n.lane, at:c.musicStartAt+n.at+delta};
          return n.endAt === undefined ? [press] : [press, {lane:n.lane, at:c.musicStartAt+n.endAt+4, release:true}];
        }).sort((a, b) => a.at-b.at);
        for (let start = 0; start < inputs.length;) {
          let end = start + 1;
          while (end < inputs.length && end-start < 18 && inputs[end].at-inputs[start].at < 2800) end++;
          const packet = {challengeId:c.id, seq:end, inputs:inputs.slice(Math.max(0,start-2),end), stream:true};
          const at = inputs[end-1].at + (end===inputs.length ? 3350 : 1550) + i*13;
          timeline.push({at, member, packet}, {at:at+125, member, packet});
          start = end;
        }
      }
      timeline.push({at:c.deadline}, {at:c.deadline+500});
      timeline.sort((a,b) => a.at-b.at);
      for (const {at,member,packet} of timeline) {
        if (packet) actNoxRoom(room,member.id,packet,at);
        else tickNoxRoom(room,at);
      }
      tickNoxRoom(room, timeline.at(-1).at+1);
      assert.equal(room.stage,'MEMORY');
      assert.equal(room.status,'ACTIVE');
      for (const [i,m] of room.members.entries()) {
        assert.equal(m.hits.length,c.chart.length);
        assert.equal(new Set(m.hits).size,c.chart.length);
        assert.equal(m.miss,0);
        assert(Math.abs(m.score-c.chart.length*(i%2?NOX_RULES.goodScore:1))<1e-6);
        assert(m.hp>0);
      }
      assert(room.challenge.startsAt >= timeline.filter(e=>e.packet).at(-2).at);
      assert.equal(room.endsAt-originalEnrage, room.challenge.startsAt-1200-c.deadline);
    }
  });
}

test('six-player delays preserve note windows and an unplayed ending still fails', () => {
  const room=sixPlayerRoom('bgm-8f33aa7cdf7f-full1');
  const c=room.challenge, m=room.members[0];
  c.chart=[1000,2000,4000,8000,9000].map((at,id)=>({id,lane:id%4,at}));
  c.deadline=c.musicStartAt+9500+NOX_RULES.receiptGraceMs;
  const at=relative=>c.musicStartAt+relative;
  const send=(seq,lane,relative,receipt)=>actNoxRoom(room,m.id,{challengeId:c.id,seq,stream:true,inputs:[{lane,at:at(relative)}]},at(receipt));
  send(1,0,1000,7001);
  send(2,1,2161,7200);
  send(3,2,4000,7300);
  assert.deepEqual(m.hits,[2]);
  assert.throws(()=>send(4,3,8000,7700),{code:'INPUT_TIME'});
  tickNoxRoom(room,c.deadline);
  tickNoxRoom(room,at(16000));
  assert.equal(room.status,'FAILED');
  assert.equal(m.miss,4);
});

test('six concurrent action acknowledgements confirm the stored sequence and preserve full state for polling and older clients', async t=>{
  const h=await noxFixture(t), {roomId,ids}=await h.party(6);
  assert.equal((await h.command('start',{roomId})).status,200);
  const now=Date.now();
  const room=await h.changeRoom(roomId,r=>{
    r.clock=now-5000;
    r.challenge.startsAt=r.challenge.musicStartAt=now-5000;
    r.challenge.deadline=now+30000;
    r.challenge.chart=[0,1,2,3].map((lane,i)=>({id:i,lane,at:1200+i*100}));
  });
  const c=room.challenge, packet={roomId,challengeId:c.id,seq:4,stream:true,inputs:c.chart.map(n=>({lane:n.lane,at:c.musicStartAt+n.at}))};
  const requests=await Promise.all(ids.map(user=>h.call('action?ack=1',{user,body:packet})));
  for(const result of requests) {
    assert.equal(result.status,200);
    assert.deepEqual(result.body.rhythmAck,{challengeId:c.id,seq:4});
    assert.equal(result.body.state,undefined);
  }
  const retry=await h.call('action?ack=1',{body:packet});
  assert.deepEqual(retry.body.rhythmAck,requests[0].body.rhythmAck);
  const legacy=await h.call('action',{body:packet});
  assert.equal(legacy.body.state.me.score,4);
  for(const user of ids) {
    const result=await h.call('state?roomId='+roomId,{user});
    assert.deepEqual(result.body.state.me.hits,[0,1,2,3]);
    assert.equal(result.body.state.me.lastSequence,4);
  }
});
