import test from 'node:test';
import assert from 'node:assert/strict';
import WebSocket from 'ws';
import {cooperativeMiniflare} from './helpers/cooperative-miniflare.mjs';
import {coopSquads} from './helpers/cooperative-fixture.mjs';
const waitFor=async fn=>{for(let n=0;n<150;n++){if(fn())return;await new Promise(r=>setTimeout(r,40));}throw Error('WebSocket state timeout');};
test('real Durable Objects: gated/authenticated API, ownership, retry, three WebSockets, shared start and refresh defeat',async()=>{
 const h=await cooperativeMiniflare(),sockets=[],messages=[[],[],[]];
 const clients=[1,2,3].map(id=>'qa-websocket-client-'+id);let roomId;
 const command=(id,kind,extra={})=>h.request(id,kind,{clientId:clients[id-1],roomId,requestId:crypto.randomUUID(),...extra});
 try{
  assert.equal((await h.request(0,'feature')).status,401);assert.equal((await h.request(4,'options')).status,403);
  assert.equal((await h.request(2,'settings')).status,403);
  const settings={mode:'TEST',testUserIds:[2,3],revision:0};assert.equal((await h.request(1,'settings',{settings})).status,200);assert.equal((await h.request(1,'settings',{settings})).status,400);
  const create={clientId:clients[0],difficulty:'NORMAL',requestId:'retry-create-request'};
  const first=await h.request(1,'create',create);assert.equal(first.status,200,JSON.stringify(first));roomId=first.roomId;
  assert.equal((await h.request(1,'create',create)).roomId,roomId);
  assert.equal((await command(1,'create',{difficulty:'NORMAL'})).code,'COOP_ALREADY_JOINED');
  for(let id=2;id<=3;id++)assert.equal((await command(id,'join')).status,200);
  const squads=coopSquads();
  const selection=id=>({cardIds:squads[id-1].cards.map(c=>c.id),mercenaryCode:squads[id-1].mercenary.code});
  assert.equal((await command(1,'select',{...selection(1),power:999999999})).status,400);
  assert.equal((await command(1,'select',{...selection(1),cardIds:['NOT-OWNED',selection(1).cardIds[1]]})).status,403);
  assert.equal((await command(1,'select',{...selection(1),mercenaryCode:'V-001'})).status,403);
  const wrongOrigin=await fetch(h.origin+'/api/coop/ticket',{method:'POST',headers:{authorization:'Bearer local-qa-1',origin:'https://outside.example','content-type':'application/json'},body:JSON.stringify({roomId,clientId:clients[0],requestId:crypto.randomUUID()})});assert.equal(wrongOrigin.status,403);
  for(let id=1;id<=3;id++){
   const ticket=await command(id,'ticket');assert.equal(ticket.status,200);
   const ws=new WebSocket(h.origin.replace('http:','ws:')+'/api/coop/stream?room='+roomId+'&ticket='+ticket.ticket,{origin:h.origin});sockets.push(ws);ws.on('message',raw=>messages[id-1].push(JSON.parse(raw)));await new Promise((resolve,reject)=>{ws.once('open',resolve);ws.once('error',reject);});
   const reused=new WebSocket(ws.url,{origin:h.origin});let status;reused.on('error',()=>{});reused.on('unexpected-response',(_q,res)=>{status=res.statusCode;res.resume();reused.terminate();});await waitFor(()=>status);assert.equal(status,401);
   assert.equal((await command(id,'ready',selection(id))).status,200);
  }
  await waitFor(()=>messages.every(list=>list.some(m=>m.state?.status==='LOADING')));
  const payloads=messages.map(list=>list.findLast(m=>m.payload).payload);assert.deepEqual(payloads[0],payloads[1]);assert.deepEqual(payloads[1],payloads[2]);
  for(const ws of sockets)ws.send(JSON.stringify({type:'loaded'}));
  await waitFor(()=>messages.every(list=>list.some(m=>m.state?.status==='ACTIVE')));
  const starts=messages.map(list=>list.findLast(m=>m.state?.status==='ACTIVE').state.startsAt);assert.equal(new Set(starts).size,1);
  assert.equal((await command(1,'select',selection(1))).code,'COOP_LOCKED');
  const refresh=await command(1,'ticket',{clientId:'qa-websocket-refreshed-1'});assert.equal(refresh.state.myResult,'DEFEAT');assert.equal(refresh.ticket,undefined);
  await waitFor(()=>messages[1].some(m=>m.state?.members[0].result==='DEFEAT'));
  const other=messages[1].findLast(m=>m.state).state;assert.equal(other.status,'ACTIVE');assert.equal(other.members.filter(m=>m.result==='DEFEAT').length,1);assert.equal(other.fighters.A.filter(f=>f.ownerId===1&&f.hp===0).length,3);
  assert.equal((await command(2,'abandon')).status,200);assert.equal((await h.request(2,'current')).state.myResult,'DEFEAT');
  assert.equal((await command(2,'leave',{clientId:'qa-websocket-result-return-2'})).status,200);assert.equal((await command(3,'leave')).status,200);
  const end=await h.request(1,'current');assert.equal(end.state.status,'DEFEAT');assert.ok(end.state.members.every(m=>m.result==='DEFEAT'));
  assert.equal((await command(1,'leave',{clientId:'qa-websocket-refreshed-1'})).status,200);assert.equal((await h.request(1,'current')).state,null);assert.equal((await h.request(3,'current')).state,null);
  assert.equal((await h.request(1,'settings',{settings:{...settings,mode:'OFF',revision:1}})).status,200);
  const closed=await h.request(1,'feature');assert.equal(closed.visible,true);assert.equal(closed.accessible,false);assert.equal((await h.request(1,'options')).status,403);assert.equal((await h.request(1,'settings')).status,200);
  assert.equal((await h.request(1,'settings',{settings:{...settings,revision:2}})).status,200);assert.equal((await h.request(1,'feature')).accessible,true);
 }finally{for(const ws of sockets)ws.terminate();await h.dispose();}
});
