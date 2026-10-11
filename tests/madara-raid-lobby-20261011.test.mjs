import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import sharp from 'sharp';
import {createMadaraPreviewServer} from '../preview/madara-raid-v1/server.mjs';
async function fixture(t){
 const server=createMadaraPreviewServer();await new Promise(r=>server.listen(0,'127.0.0.1',r));t.after(()=>new Promise(r=>server.close(r)));
 const base=`http://127.0.0.1:${server.address().port}`;
 const call=async(token,route,body)=>{const response=await fetch(base+'/__madara/'+route,{method:body?'POST':'GET',headers:{authorization:token?'Bearer '+token:'',...(body?{origin:base,'content-type':'application/json'}:{})},body:body?JSON.stringify(body):undefined});return {status:response.status,...await response.json()};};
 const session=async()=>call(null,'session',{});
 return {call,session,host:await session(),guest:await session(),third:await session()};
}
const create=(id='unique-create-001',extra={})=>({requestId:id,name:'공대장',mode:'PARTY',role:'WARDEN',...extra});
test('duplicate and concurrent room creates charge the creator exactly once; refresh and free joins retain identity',async t=>{
 const {call,host,guest}=await fixture(t),body=create();
 const [a,b]=await Promise.all([call(host.token,'create',body),call(host.token,'create',body)]);
 assert.equal(a.status,200);assert.equal(b.status,200);assert.equal(a.state.id,b.state.id);assert.equal(b.account.tickets,2);assert.equal(b.receipt.replayed,true);
 assert.equal((await call(host.token,'create',create('another-request-001'))).code,'ALREADY_JOINED');
 const refreshed=await call(host.token,'session',{});assert.equal(refreshed.account.id,host.account.id);assert.equal(refreshed.account.tickets,2);
 const joined=await call(guest.token,'join',{code:a.state.id,name:'정벌 참가자',role:'ASSAULT'});assert.equal(joined.account.tickets,3);
 const retry=await call(guest.token,'join',{code:a.state.id,name:'정벌 참가자',role:'ASSAULT'});assert.equal(retry.state.members.length,2);
 const list=await call(host.token,'lobby');assert.equal(list.rooms.length,1);assert.equal(list.rooms[0].roles.ASSAULT,1);assert.equal(list.rooms[0].hostName,'공대장');
 assert.equal((await call(host.token,'create',{...body,name:'다른 내용'})).code,'REQUEST_CONFLICT');
});
test('invalid creation rolls back; depleted tickets cannot create; closed receipts cannot debit again',async t=>{
 const {call,host}=await fixture(t);
 assert.equal((await call(host.token,'create',create('invalid-request-001',{mode:'INVALID'}))).status,400);
 for(const role of ['constructor','__proto__',['WARDEN']])assert.equal((await call(host.token,'create',create('invalid-role-request',{role}))).code,'INVALID_ROLE');
 assert.equal((await call(host.token,'lobby')).account.tickets,3);
 for(let i=0;i<3;i++){assert.equal((await call(host.token,'create',create('valid-request-00'+i))).status,200);await call(host.token,'leave',{});}
 assert.equal((await call(host.token,'create',create('valid-request-004'))).code,'NO_TICKET');
 assert.equal((await call(host.token,'create',create('valid-request-000'))).code,'RECEIPT_CLOSED');
 assert.equal((await call(host.token,'lobby')).account.tickets,0);
 const show=await call(host.token,'showcase?form=spirit');assert.equal(show.status,200);assert.equal(show.reviewOnly,true);assert.ok(show.payload.monster.projectVMonsterArt.primaryUrl.includes('azure'));
});
test('only the host kicks before launch; kicked identity loses access and cannot rejoin after bootstrap; host migration is free',async t=>{
 const {call,host,guest,third}=await fixture(t),room=await call(host.token,'create',create());
 const code=room.state.id;
 await call(guest.token,'join',{code,name:'정벌',role:'ASSAULT'});await call(third.token,'join',{code,name:'구출',role:'RESCUE'});
 assert.equal((await call(guest.token,'kick',{targetId:third.account.id})).code,'HOST_ONLY');
 assert.equal((await call(host.token,'kick',{targetId:host.account.id})).code,'KICK_SELF');
 const kick=await call(host.token,'kick',{targetId:guest.account.id});assert.equal(kick.state.members.length,2);
 assert.equal((await call(guest.token,'state')).code,'KICKED');assert.equal((await call(guest.token,'action',{action:'STRIKE'})).code,'KICKED');
 const recovered=await call(guest.token,'session',{});assert.equal(recovered.account.id,guest.account.id);
 assert.equal((await call(guest.token,'join',{code,role:'ASSAULT'})).code,'KICKED');
 assert.equal((await call(guest.token,'lobby')).rooms[0].canJoin,false);
 await call(host.token,'leave',{});const migrated=await call(third.token,'state');assert.equal(migrated.state.hostId,third.account.id);assert.equal(migrated.account.tickets,3);
 const own=await call(guest.token,'create',create('kicked-new-room-001'));assert.equal(own.status,200,'kicks are limited to one room');
});
test('full and started parties reject new participants without charges; active kick is blocked; authoritative dialogue is exported',async t=>{
 const {call,session,host}=await fixture(t),room=await call(host.token,'create',create());
 const members=[host];for(let i=0;i<5;i++){const a=await session();members.push(a);await call(a.token,'join',{code:room.state.id,name:'대원'+i,role:i%2?'RESCUE':'ASSAULT'});}
 const extra=await session();assert.equal((await call(extra.token,'join',{code:room.state.id,role:'WARDEN'})).code,'ROOM_FULL');
 assert.equal((await call(extra.token,'lobby')).account.tickets,3);
 for(const a of members)await call(a.token,'ready',{});
 const started=await call(host.token,'start',{});assert.equal(started.state.presentation.key,'ILLUSION');assert.ok(started.state.presentation.line.includes('진실'));
 assert.equal((await call(host.token,'kick',{targetId:members[1].account.id})).code,'ROOM_STARTED');
 assert.equal((await call(extra.token,'join',{code:room.state.id,role:'WARDEN'})).code,'ROOM_STARTED');
 assert.equal((await call(extra.token,'lobby')).rooms[0].canJoin,false);
});
test('packed motion and five distinct effects retain real alpha and source hashes',async()=>{
 const manifest=JSON.parse(await readFile(new URL('../preview/madara-raid-v1/assets/presentation-manifest.json',import.meta.url)));
 assert.equal(manifest.atlases.cast.frames.length,4);assert.equal(Object.keys(manifest.atlases).length,6);
 for(const [key,a]of Object.entries(manifest.atlases)){
  assert.equal(a.frames.length,key==='cast'?4:12);assert.equal(new Set(a.frames.map(f=>f.sha256)).size,a.frames.length);
  const meta=await sharp(new URL('../preview/madara-raid-v1/'+a.url,import.meta.url).pathname.slice(1)).metadata();assert.equal(meta.hasAlpha,true);
  assert.equal(meta.width,a.columns*a.frameSize);assert.equal(meta.height,a.rows*a.frameSize);
 }
});
