import test from 'node:test';
import assert from 'node:assert/strict';
import {lichLiveFixture} from './helpers/lich-live-fixture.mjs';
import {REVIEW_DECK} from '../preview/lich-king-raid-v1/fixture.mjs';
import {projectLichChallenge,lichControlKey} from '../preview/lich-king-raid-v1/clock.mjs';
import {accountDeck} from './helpers/lich-raid-loadout-fixture.mjs';

test('each ready account supplies its own ordered five cards, mercenary and support; shared HP stays common',async t=>{
  const h=await lichLiveFixture();t.after(()=>h.close());
  for(const id of [1,2,3])h.setDeck(id,accountDeck(id));
  const roomId=await h.party();
  for(const id of [1,2,3])assert.equal((await h.command('ready',{roomId,ready:true},id)).status,200);
  const started=await h.command('start',{roomId});
  assert.equal(started.status,200);assert.ok(started.body.state);assert.ok(started.body.payload,'start mounts without a second GET');
  const views=await Promise.all([1,2,3].map(user=>h.call('status?roomId='+roomId+'&payload=1',{user})));
  for(const [i,{body}]of views.entries()){
    const {payload,state}=body,team=payload.battleV2.teams.A;
    assert.deepEqual(payload.cards.map(c=>c.id),accountDeck(i+1).ids);
    assert.equal(team.cards.length,5);assert.equal(team.mercenaries.length,1);assert.equal(team.supports.length,1);
    assert.equal(team.supports[0].untargetable,true);
    assert.equal(payload.equippedBattleSuit.code,'BATTLE_SUIT_H_BODY');
    assert.equal(payload.monster.projectVMonsterArt.scaleMultiplier,1.65,'Lich art is 50% larger than 1.1');
    assert.ok(team.cards.every(c=>c.ownerId===String(i+1)));
    assert.equal(state.fighters.length,6);assert.equal(state.partyFighters.length,18);
    assert.equal(state.bossHp,views[0].body.state.bossHp);
    assert.equal(state.challenge.id,views[0].body.state.challenge.id);
  }
  assert.equal(new Set(views.flatMap(v=>v.body.payload.battleV2.teams.A.cards.map(f=>f.id))).size,15,'identical cards never merge accounts');
});

test('ready recaptures changes; invalid participant deck cannot ready and cannot spend another ticket',async t=>{
  const h=await lichLiveFixture();t.after(()=>h.close());const roomId=await h.party();
  h.setDeck(2,accountDeck(2));await h.command('ready',{roomId,ready:true},2);
  h.setDeck(2,accountDeck(3));await h.command('ready',{roomId,ready:true},2);
  const payload=(await h.call('status?roomId='+roomId+'&payload=1',{user:2})).body.payload;
  assert.deepEqual(payload.cards.map(c=>c.id),accountDeck(3).ids);
  h.setDeck(3,{cards:REVIEW_DECK.slice(0,4),ids:REVIEW_DECK.slice(0,4).map(c=>c.id)});
  assert.equal((await h.command('ready',{roomId,ready:true},3)).status,400);
  assert.equal((await h.call('status?roomId='+roomId,{user:3})).body.state.me.ready,false);
  assert.equal(Number((await h.one('SELECT quantity FROM cnine_user_inventory WHERE user_id=1')).quantity),4);
});

test('a weak host cannot replace the stronger participant deck; support and mercenary attacks use server damage',async t=>{
  const h=await lichLiveFixture();t.after(()=>h.close());
  h.setDeck(1,{cards:REVIEW_DECK.map(c=>({...c,power:500})),ids:REVIEW_DECK.map(c=>c.id)});
  h.setDeck(2,accountDeck(2));h.setDeck(3,accountDeck(3));const roomId=await h.party();
  for(const user of [1,2,3])await h.command('ready',{roomId,ready:true},user);
  await h.command('start',{roomId});
  const row=await h.one('SELECT state_json FROM raid_lich_rooms_v1 WHERE room_id=?',roomId),room=JSON.parse(row.state_json);
  const now=Date.now();room.clock=now-1;room.startedAt=now-20000;room.endsAt=now+100000;
  room.round=6;room.boss.hp=room.boss.maxHp=100000000;
  room.step='EXPOSED';room.challenge={id:roomId+':0',kind:'PLAGUE',startedAt:now-1000,deadline:now+10000,lastStrikeAt:now-2000,transferred:true};
  await h.run('UPDATE raid_lich_rooms_v1 SET state_json=? WHERE room_id=?',JSON.stringify(room),roomId);
  const result=await h.call('action?since='+room.eventSeq,{body:{requestId:h.uid(),roomId,challengeId:room.challenge.id,action:'STRIKE'}});
  assert.equal(result.status,200);assert.ok(result.body.state.bossHp<room.boss.hp);
  assert.ok(result.body.state.events.some(e=>e.actorId?.startsWith('A:OWNER:2:')&&e.damage>0),'participant contributes actual damage');
  assert.ok(result.body.state.events.some(e=>e.actorKind==='BATTLE_SUIT'&&e.damage>0),'support damage is authoritative');
  assert.ok(result.body.state.events.some(e=>e.actorId?.includes('MERCENARY')&&e.damage>0),'mercenary contributes actual damage');
  assert.ok(result.body.state.events.every(e=>e.seq>room.eventSeq),'input replies omit already received events');
  const same=await h.call('action',{body:{requestId:'same_action_123',roomId,challengeId:room.challenge.id,action:'STRIKE'}});
  assert.equal(same.status,429,'server cooldown remains enforced');
  const wall=JSON.parse((await h.one('SELECT state_json FROM raid_lich_rooms_v1 WHERE room_id=?',roomId)).state_json);
  wall.boss.hp=1500;wall.challenge.lastStrikeAt=Date.now()-2000;
  await h.run('UPDATE raid_lich_rooms_v1 SET state_json=? WHERE room_id=?',JSON.stringify(wall),roomId);
  const finish=await h.call('action?since='+wall.eventSeq,{body:{requestId:h.uid(),roomId,challengeId:wall.challenge.id,action:'STRIKE'}});
  assert.equal(finish.status,200);assert.equal(finish.body.state.bossHp,0);
  for(const owner of [2,3])assert.ok(finish.body.state.events.some(e=>e.actorId?.startsWith('A:OWNER:'+owner+':')&&e.damage>0),'phase cap includes every strong participant');
});

test('known deadlines unlock transfer/interrupt/rescue promptly without mutating authoritative state',()=>{
  const base={id:'c',kind:'PLAGUE',startedAt:1000,plague:true,plagueStacks:1,cast:'FROST_NOVA',interrupted:false,rescueAt:0};
  assert.equal(projectLichChallenge(base,2999).plagueStacks,1);
  assert.equal(projectLichChallenge(base,3000).plagueStacks,2);
  assert.equal(projectLichChallenge(base,7999).cast,'FROST_NOVA');
  assert.equal(projectLichChallenge(base,8000).cast,'SOUL_ANNIHILATION');
  assert.equal(base.cast,'FROST_NOVA');
  const prison={...base,kind:'CONVERGENCE',prison:true,breathResolved:false,rescueAt:3500,rescued:0};
  assert.equal(projectLichChallenge(prison,7000).prison,false);
  assert.equal(projectLichChallenge(prison,3500).rescued,1);
  const s={status:'ACTIVE',step:'MECHANIC',resources:{},souls:0,doom:0,me:{role:'RESCUE'},fighters:[]};
  assert.equal(lichControlKey(s,{...base,plagueStacks:2,lastStrikeAt:100}),lichControlKey(s,{...base,plagueStacks:4,lastStrikeAt:200}),'timer/HP updates keep buttons stable');
});
