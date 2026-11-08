import test from 'node:test';
import assert from 'node:assert/strict';
import {citadelFixture,citadelSquads} from './helpers/legion-citadel-fixture.mjs';
import {buildCitadelBattle} from '../functions/_legion_citadel_battle.js';
import {distributeCitadelLoot,personalFarm,farmView} from '../functions/_legion_citadel_loot.js';
import {validatePreparedMercenaries} from '../shared/companion-loadout-v2.mjs';
const states=async(f,uid,cmd,body)=>{const r=await f.action(uid,cmd,body);assert.equal(r.status,200,JSON.stringify(r.body));return r.body;};
const boot=async f=>{const {state:{id}}=await states(f,1,'create',{requestId:'citadel-party-fixture-01'});await states(f,2,'join',{id});for(const u of [1,2])await states(f,u,'ready',{id,...f.selection(u-1)});await states(f,1,'start',{id});return id;};
test('seeded fixed enemies, rank recommendations rather than restrictions, cross-owner IDs and existing raid caps',()=>{
 const ss=citadelSquads({codes:[['V-952','V-977'],['V-952','V-977']]}),sss=citadelSquads({codes:[['V-996','V-999'],['V-996','V-999']]});
 assert.throws(()=>validatePreparedMercenaries(ss[0].mercenaries));assert.throws(()=>validatePreparedMercenaries(sss[0].mercenaries));
 const common=buildCitadelBattle(citadelSquads(),5),low=buildCitadelBattle(citadelSquads({ss:1,sss:1}),5);
 for(const party of [ss,sss]){const b=buildCitadelBattle(party,5);assert.equal(b.won,true);assert.deepEqual(b.replay.payload.cooperativeEncounter.instances,common.replay.payload.cooperativeEncounter.instances);
 const {A}=b.replay.payload.battleV2.teams;assert.equal(A.cards.length,4);assert.equal(A.mercenaries.length,4);assert.equal(new Set([...A.cards,...A.mercenaries].map(u=>u.id)).size,8);}
 assert.equal(common.duration,420000);assert.ok(common.kills.length>low.kills.length);assert.ok(common.kills.some(k=>k[1]===2));assert.ok(!low.kills.some(k=>k[1]===2));assert.ok(common.kills.at(-1)[0]>415000);
 assert.equal(common.chunks.length,14);assert.ok(common.chunks.at(-1).events.some(e=>e.type==='ENEMY_SPAWN'));assert.ok(common.kills.some(([at])=>at>common.kills.find(k=>k[1]===2)[0]+30000));
 assert.throws(()=>buildCitadelBattle(ss.slice(0,1),1));assert.throws(()=>buildCitadelBattle([{...ss[0],cards:ss[0].cards.map(c=>({...c,grade:'C',rarity:'C'}))},ss[1]],1));
});
test('no player can draw any of the other player’s item types even with an odd catalogue',()=>{
 const supply=['a','b','c'].map(ref=>({type:'INVENTORY_ITEM',ref})),gear=['1','2','3'].map(ref=>({type:'EQUIPMENT',ref}));
 for(const chance of [0,35,100])for(let i=0;i<100;i++){const [a,b]=distributeCitadelLoot(supply,gear,chance);assert.ok([...b.goods,...b.armory].every(y=>[...a.goods,...a.armory].every(x=>x.type!==y.type||x.ref!==y.ref)));const farm=personalFarm(a,[[10000,2],[15000,2]],true);assert.equal(farmView(farm,9999,true).picked,0);assert.equal(farmView(farm,20000,true).picked,2);}
});
for(const postgres of [false,true])test((postgres?'PostgreSQL':'SQLite')+' party flow, barriers, private grants, retries and recovery',async()=>{
 const f=await citadelFixture({postgres});try{
  const {state:{id}}=await states(f,1,'create',{requestId:'citadel-party-fixture-01'});
  assert.equal((await states(f,1,'create',{requestId:'citadel-party-fixture-01'})).state.id,id);assert.equal((await states(f,3,'lobby')).rooms.length,1);
  assert.equal((await f.action(1,'start',{id})).status,409);await states(f,2,'join',{id});assert.equal((await states(f,3,'lobby')).rooms.length,0);
  assert.equal((await f.action(3,'join',{id})).status,409);assert.equal((await f.action(3,'state?id='+id)).status,403);
  assert.equal((await f.action(1,'ready',{id,...f.selection(0),cardIds:[f.selection(0).cardIds[0],'CN-TEST']})).status,403);
  assert.equal((await f.action(1,'ready',{id,...f.selection(0),mercenaryCodes:['V-999','V-999']})).status,400);
  for(const u of [1,2])await states(f,u,'ready',{id,...f.selection(u-1)});
  assert.equal((await f.action(2,'start',{id})).status,403);const start=await states(f,1,'start',{id});assert.equal(start.state.status,'LOADING');assert.ok(!JSON.stringify(start).includes('VEHICLE_PART'));
  const battle=await states(f,1,'battle?id='+id);assert.ok(battle.chunk.frames.length>2);assert.ok(battle.chunk.events.every(e=>e.combatAtMs<30000));assert.ok((await states(f,1,'chunk?id='+id+'&part=13')).chunk.events.some(e=>e.type==='ENEMY_SPAWN'));assert.equal((await f.action(3,'battle?id='+id)).status,403);
  assert.equal((await states(f,1,'loaded',{id})).state.status,'LOADING');assert.equal((await f.action(1,'claim',{id})).status,409);
  const ukey=u=>'legion_hunt_owner_session_v1:'+u,read=async k=>JSON.parse((await f.db.prepare('SELECT value FROM app_meta WHERE key=?').bind(k).first())?.value||'null');
  assert.equal(await read(ukey(1)),null);const active=(await states(f,2,'loaded',{id})).state;assert.equal(active.status,'ACTIVE');
  await states(f,2,'loaded',{id});assert.equal((await read(ukey(1))).energy.current,9);assert.equal((await read(ukey(2))).energy.current,9);assert.equal((await f.action(3,'claim',{id})).status,403);
  const farms=[];for(const u of [1,2])farms.push(await read('legion_citadel_v1:farm:'+id+':'+u));
  const first=farms[0].events[0],next=farms[1].events[0];
  assert.equal((await f.action(1,'pickup',{id,token:first[4]})).status,409);assert.equal((await f.action(2,'pickup',{id,token:first[4]})).status,403);
  for(const [event,u] of [[first,1],[next,2]].sort((a,b)=>a[0][0]-b[0][0])){f.clock.now=active.startsAt+event[0]+10;const g=await states(f,u,'pickup',{id,token:event[4]});assert.equal(g.state.picked,1);assert.equal((await states(f,u,'pickup',{id,token:event[4]})).state.picked,1);}
  f.clock.now=active.startsAt+active.duration+100;assert.equal((await f.action(1,'pickup',{id,token:farms[0].events[1][4]})).status,409);const a=(await states(f,1,'state?id='+id)).state,b=(await states(f,2,'state?id='+id)).state;
  assert.equal(a.status,'VICTORY');assert.equal(a.drops.length,1);assert.ok(a.kills>100);assert.ok(b.drops.every(j=>a.drops.every(i=>i.type!==j.type||i.ref!==j.ref)));
  const inventory=async uid=>(await f.db.prepare('SELECT item_code,quantity FROM cnine_user_inventory WHERE user_id=? ORDER BY item_code').bind(uid).all()).results;
  assert.deepEqual(await inventory(2),[]);assert.equal((await f.action(1,'leave',{id})).status,409);
  f.fail('INSERT INTO inventory_logs');assert.equal((await f.action(1,'claim',{id})).status,503);f.fail('');assert.deepEqual(await inventory(1),[]);assert.equal((await states(f,1,'state?id='+id)).state.claimed,false);
  await states(f,1,'claim',{id});const own=await inventory(1);assert.equal(own.length,new Set(a.drops.map(i=>i.ref)).size);assert.deepEqual(await inventory(2),[]);
  await states(f,1,'claim',{id});assert.deepEqual(await inventory(1),own);await states(f,1,'leave',{id});
  assert.equal((await states(f,2,'lobby')).state.id,id);await states(f,2,'claim',{id});const other=await inventory(2);assert.ok(other.every(j=>own.every(i=>i.item_code!==j.item_code)));await states(f,2,'leave',{id});
  assert.equal((await states(f,2,'lobby')).state,null);assert.deepEqual(await inventory(3),[]);
  assert.deepEqual((await states(f,1,'claim',{id})).state.drops,a.drops);assert.deepEqual(await inventory(1),own);
  assert.equal(await read('legion_citadel_v1:farm:'+id+':1'),null);assert.equal((await f.action(3,'claim',{id})).status,404);
 }finally{await f.close();}
});
test('abandoned loading and failed second-player energy transaction never charge either participant',async()=>{
 const f=await citadelFixture();try{const id=await boot(f);await states(f,1,'loaded',{id});
 const key='legion_hunt_owner_session_v1:2';await f.exec('INSERT INTO app_meta(key,value) VALUES(?,?)',key,JSON.stringify({energy:{version:1,current:0,updatedAt:f.clock.now,maximum:10}}));
 assert.equal((await f.action(2,'loaded',{id})).status,409);
 assert.equal(await f.db.prepare('SELECT value FROM app_meta WHERE key=?').bind('legion_hunt_owner_session_v1:1').first(),null);
 f.clock.now+=130000;assert.equal((await states(f,1,'lobby')).state,null);assert.equal((await f.action(2,'claim',{id})).status,409);
 }finally{await f.close();}
});
