import test from 'node:test';
import assert from 'node:assert/strict';
import {cooperativeMiniflare} from './helpers/cooperative-miniflare.mjs';
import {coopSquads} from './helpers/cooperative-fixture.mjs';
import {createCoopRoom,coopCommand} from '../functions/_cooperative_room.js';
import {coopRoomListing} from '../shared/cooperative-room-list-v1.mjs';

test('public summaries expose only lobby details and disappear at start/expiry',()=>{
 const room=createCoopRoom({id:'123456789A',user:{id:1,nickname:'방장'},clientId:'private-client-111',difficulty:'NORMAL',seed:123,now:1000});
 const listing=coopRoomListing(room,1001);
 assert.deepEqual(Object.keys(listing).sort(),['id','hostName','difficulty','members','maxMembers','ready','power','createdAt','expiresAt','joinable'].sort());
 assert.equal(listing.hostName,'방장');assert.equal(listing.joinable,true);
 coopCommand(room,{id:2,nickname:'다음 방장'},'join',{clientId:'private-client-222'},1100);
 coopCommand(room,{id:1},'leave',{clientId:'private-client-111'},1101);
 assert.equal(coopRoomListing(room,1102).hostName,'다음 방장');
 assert.equal(coopRoomListing(room,room.expiresAt),null);
 for(const status of ['LOADING','ACTIVE','VICTORY','DEFEAT','CANCELLED'])assert.equal(coopRoomListing({...room,status},1102),null);
});

test('real directory: authenticated listing, filters, creation retry, joining, host transfer, full rooms and start removal',async()=>{
 const h=await cooperativeMiniflare(),clients=[0,1,2,3,4].map(id=>'qa-directory-client-'+id);
 const command=(id,kind,roomId,extra={})=>h.request(id,kind,{clientId:clients[id],requestId:crypto.randomUUID(),roomId,...extra});
 try{
  assert.equal((await h.request(0,'rooms')).status,401);assert.equal((await h.request(4,'rooms')).status,403);
  assert.deepEqual((await h.request(2,'rooms')).rooms,[]);assert.equal((await h.request(2,'rooms?difficulty=INVALID')).status,400);
  const requestId=crypto.randomUUID(),created=await command(1,'create',undefined,{difficulty:'NORMAL',requestId});assert.equal(created.status,200);
  assert.equal((await command(1,'create',undefined,{difficulty:'NORMAL',requestId})).roomId,created.roomId);
  let list=await h.request(2,'rooms');assert.equal(list.rooms.length,1);assert.equal(list.rooms[0].hostName,'선봉 분대');assert.equal(list.rooms[0].members,1);
  assert.deepEqual((await h.request(2,'rooms?difficulty=HARD')).rooms,[]);
  assert.equal((await command(2,'join',created.roomId)).status,200);
  assert.equal((await command(1,'leave',created.roomId)).status,200);
  list=await h.request(1,'rooms?difficulty=NORMAL');assert.equal(list.rooms[0].hostName,'지원 분대');assert.equal(list.rooms[0].members,1);
  assert.equal((await command(1,'join',created.roomId)).status,200);assert.equal((await command(3,'join',created.roomId)).status,200);
  list=await h.request(2,'rooms');assert.equal(list.rooms[0].members,3);assert.equal(list.rooms[0].joinable,false);
  await h.request(1,'settings',{settings:{mode:'ON',testUserIds:[],revision:0}});
  assert.equal((await command(4,'join',created.roomId)).code,'COOP_FULL');
  const squads=coopSquads();for(const id of [1,2,3]){
   const ready=await command(id,'ready',created.roomId,{cardIds:squads[id-1].cards.map(c=>c.id),mercenaryCode:squads[id-1].mercenary.code});assert.equal(ready.status,200,JSON.stringify(ready));
   if(id===1){list=await h.request(4,'rooms');assert.equal(list.rooms[0].ready,1);assert.ok(list.rooms[0].power>0);}
  }
  assert.deepEqual((await h.request(4,'rooms')).rooms,[]);assert.equal((await command(4,'join',created.roomId)).code,'COOP_STARTED');
  const next=await command(4,'create',undefined,{difficulty:'HARD'});assert.equal(next.status,200);
  assert.equal((await h.request(1,'rooms?difficulty=HARD')).rooms[0].id,next.roomId);
  assert.equal((await command(4,'leave',next.roomId)).status,200);assert.deepEqual((await h.request(1,'rooms')).rooms,[]);
  await h.request(1,'settings',{settings:{mode:'OFF',testUserIds:[],revision:1}});assert.equal((await h.request(1,'rooms')).status,403);
 }finally{await h.dispose();}
});

test('real directory removes an abandoned lobby when its heartbeat expires',async()=>{
 const h=await cooperativeMiniflare();try{
  const created=await h.request(1,'create',{clientId:'qa-directory-expiry-client',requestId:crypto.randomUUID(),difficulty:'NORMAL'});assert.equal(created.status,200);
  assert.equal((await h.request(2,'rooms')).rooms.length,1);
  await new Promise(resolve=>setTimeout(resolve,15500));
  assert.deepEqual((await h.request(2,'rooms')).rooms,[]);
 }finally{await h.dispose();}
});
