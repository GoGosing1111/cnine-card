import test from 'node:test';
import assert from 'node:assert/strict';
import {monsterDefenseFixture,defenseOwnedLoadout} from './helpers/monster-defense-fixture.mjs';
import {createRoom,joinRoom} from '../preview/coop-defense-v1/source/defense-model.mjs';
import {defenseRoomListing,DEFENSE_LIST_LEASE_MS} from '../shared/monster-defense-room-list-v1.mjs';
import {DEFENSE_RULES} from '../shared/monster-defense-v1.mjs';

test('defense public summary hides practice, combat, empty, expired and abandoned rooms without exposing roster or tickets',()=>{
 const room=createRoom({id:'123456789ABC',now:1000,capacity:2});joinRoom(room,{id:'1',name:'선봉'});
 assert.deepEqual(Object.keys(defenseRoomListing(room,1001)).sort(),['id','hostName','difficulty','difficultyName','members','maxMembers','ready','totalWaves','createdAt','expiresAt','joinable'].sort());
 for(const phase of ['PREP','WAVE','INTERMISSION','VICTORY','DEFEAT'])assert.equal(defenseRoomListing({...room,phase},1001),null);
 assert.equal(defenseRoomListing({...room,practice:true},1001),null);assert.equal(defenseRoomListing({...room,players:[]},1001),null);
 assert.equal(defenseRoomListing(room,1000+DEFENSE_LIST_LEASE_MS),null);assert.equal(defenseRoomListing(room,1000+DEFENSE_RULES.roomMs),null);
});

test('real defense directory: access/filter, separate battleground, practice exclusion, ready/full/host transfer, start removal and stale publications',async()=>{
 const h=await monsterDefenseFixture(),make=(difficulty='NORMAL',capacity=3,practice=false)=>({difficulty,capacity,practice,loadout:defenseOwnedLoadout(),requestId:crypto.randomUUID()}),join=(id,roomId)=>h.api(id,'defense/join',{roomId,loadout:defenseOwnedLoadout(),requestId:crypto.randomUUID()});
 try{
  assert.equal((await h.api(0,'defense/rooms')).status,401);assert.equal((await h.api(4,'defense/rooms')).status,403);assert.equal((await h.api(1,'defense/rooms?difficulty=WRONG')).status,400);
  assert.deepEqual((await h.api(2,'defense/rooms')).rooms,[]);
  const input=make('HARD'),a=await h.api(1,'defense/create',input);assert.equal(a.status,200);assert.equal((await h.api(1,'defense/create',input)).roomId,a.roomId);
  let list=await h.api(2,'defense/rooms');assert.equal(list.rooms.length,1);assert.equal(list.rooms[0].hostName,'선봉 분대');assert.equal(list.rooms[0].totalWaves,30);
  assert.deepEqual((await h.api(2,'defense/rooms?difficulty=NORMAL')).rooms,[]);
  const coop=await h.request(1,'create',{clientId:'qa-defense-independent-list',requestId:crypto.randomUUID(),difficulty:'NORMAL'});assert.equal(coop.status,200);assert.equal((await h.request(2,'rooms')).rooms[0].id,coop.roomId);assert.equal((await h.api(2,'defense/rooms')).rooms[0].id,a.roomId);
  const practice=await h.api(2,'defense/create',make('NORMAL',2,true));assert.equal(practice.status,200);assert.equal((await h.api(3,'defense/rooms')).rooms.length,1);await h.api(2,'defense/leave',{});
  const b=await join(2,a.roomId),c=await join(3,a.roomId);assert.equal(b.status,200);assert.equal(c.status,200);assert.equal((await h.ready(a)).status,200);
  list=await h.api(3,'defense/rooms');assert.equal(list.rooms[0].ready,1);assert.equal(list.rooms[0].members,3);assert.equal(list.rooms[0].joinable,false);
  await h.api(1,'defense/leave',{});list=await h.api(1,'defense/rooms');assert.equal(list.rooms[0].hostName,'지원 분대');assert.equal(list.rooms[0].members,2);
  const again=await join(1,a.roomId);for(const s of [again,b,c])assert.equal((await h.ready(s)).status,200);
  const stale=await h.room(a.roomId),listing=(await h.api(1,'defense/rooms')).rooms[0];
  assert.equal((await h.live(b,'command',{requestId:crypto.randomUUID(),command:{type:'START'}})).status,200);assert.deepEqual((await h.api(3,'defense/rooms')).rooms,[]);
  await fetch(h.origin+'/__qa/defense-directory',{method:'POST',body:JSON.stringify({id:a.roomId,revision:stale.directoryRevision,listing,retireAt:listing.expiresAt+3600000})});assert.deepEqual((await h.api(3,'defense/rooms')).rooms,[],'late publication cannot resurrect started room');
  const settings=(await h.api(1,'admin/defense/settings')).settings;settings.testUserIds.push(4);assert.equal((await h.api(1,'admin/defense/settings',{settings,requestId:crypto.randomUUID()})).status,200);assert.notEqual((await join(4,a.roomId)).status,200);
  const d=await h.api(4,'defense/create',make('GUIDE',2));assert.equal(d.status,200);await h.api(4,'defense/leave',{});assert.deepEqual((await h.api(1,'defense/rooms')).rooms,[]);
  const e=await h.api(4,'defense/create',make('NORMAL',2)),offline=await h.room(e.roomId);offline.players[0].lastSeen=Date.now()-DEFENSE_LIST_LEASE_MS-1000;await h.room(e.roomId,offline);assert.deepEqual((await h.api(1,'defense/rooms')).rooms,[]);
  await h.live(e,'state');assert.equal((await h.api(1,'defense/rooms')).rooms[0].id,e.roomId,'reconnect republishes the waiting room');
  const expired=await h.room(e.roomId);expired.createdAt=Date.now()-DEFENSE_RULES.roomMs;await h.room(e.roomId,expired);assert.deepEqual((await h.api(1,'defense/rooms')).rooms,[]);
 }finally{await h.dispose();}
});

test('simultaneous list joins fill the last slot once',async()=>{
 const h=await monsterDefenseFixture();try{
  const a=await h.api(1,'defense/create',{difficulty:'NORMAL',capacity:2,loadout:defenseOwnedLoadout(),requestId:crypto.randomUUID()});
  const results=await Promise.all([2,3].map(user=>h.api(user,'defense/join',{roomId:a.roomId,loadout:defenseOwnedLoadout(),requestId:crypto.randomUUID()})));
  assert.equal(results.filter(r=>r.status===200).length,1);assert.equal((await h.room(a.roomId)).players.length,2);assert.equal((await h.api(1,'defense/rooms')).rooms[0].joinable,false);
 }finally{await h.dispose();}
});
