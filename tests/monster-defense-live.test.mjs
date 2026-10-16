import test from 'node:test';
import assert from 'node:assert/strict';
import {monsterDefenseFixture,defenseOwnedLoadout as defaultLoadout} from './helpers/monster-defense-fixture.mjs';
import {advanceRoom,RULES} from '../preview/coop-defense-v1/source/defense-model.mjs';
import {DEFENSE_KEY,defaultDefenseSettings} from '../shared/monster-defense-v1.mjs';
const id=()=>crypto.randomUUID();
test('defense TEST: real durable room API, tester gate, authority, retry, persistence and bounded tickets',async()=>{
 const h=await monsterDefenseFixture();
 const create=(capacity=3,extra={})=>({capacity,difficulty:'NORMAL',loadout:defaultLoadout(),requestId:id(),...extra});
 const cmd=(s,command,requestId=id())=>h.live(s,'command',{requestId,command});
 try{
  assert.equal((await h.api(0,'defense/feature')).status,401);
  assert.equal((await h.api(4,'defense/feature')).accessible,false);
  assert.equal((await h.api(4,'defense/create',create())).status,403);
  assert.equal((await h.api(2,'admin/defense/settings')).status,403);
  assert.equal((await h.api(1,'defense/create',create(4))).status,400);
  assert.equal((await h.api(1,'defense/create',create(2,{loadout:{mercenaries:['V-003','V-003'],card:'FAKER'}}))).status,400);
  const input=create(3),a=await h.api(1,'defense/create',input);assert.equal(a.status,200,JSON.stringify(a));assert.equal(a.playerId,'1');assert.equal(a.snapshot.players[0].name,'선봉 분대');assert.equal(a.snapshot.rewardsEnabled,false);
  assert.equal((await h.api(1,'defense/create',input)).roomId,a.roomId);
  const b=await h.api(2,'defense/join',{roomId:a.roomId,loadout:defaultLoadout(),requestId:id()}),c=await h.api(3,'defense/join',{roomId:a.roomId,loadout:defaultLoadout(),requestId:id()});assert.equal(b.status,200);assert.equal(c.status,200);
  const noOrigin=await fetch(h.origin+'/api/defense/live/state?room='+a.roomId,{headers:{authorization:'Bearer '+a.token}});assert.equal(noOrigin.status,200,'same origin GET browsers omit Origin');
  assert.equal((await h.live(a,'state',null,{origin:'https://elsewhere.example'})).status,403);
  assert.equal((await h.live({...a,token:'0'.repeat(72)},'state')).status,401);
  assert.equal((await h.live(a,'command',{requestId:id(),command:{type:'READY'},junk:'x'.repeat(5000)})).status,413);
  assert.equal((await cmd(a,{type:'START'})).status,400);
  for(const s of [a,b,c])assert.equal((await h.ready(s)).status,200);
  assert.equal((await cmd(b,{type:'START'})).status,400);
  const startId=id();assert.equal((await cmd(a,{type:'START'},startId)).status,200);assert.equal((await cmd(a,{type:'START'},startId)).duplicate,true);assert.equal((await cmd(a,{type:'READY'},startId)).status,409);
  let snapshot=await h.live(a,'state');assert.equal(snapshot.units.length,9);assert.equal(snapshot.phase,'PREP');assert.ok(snapshot.players.every(p=>p.loadout.mercenaries.length===2));
  assert.equal((await cmd(b,{type:'MOVE',unitId:'1:0',lane:1})).status,400);
  const moveId=id();const moves=await Promise.all([cmd(a,{type:'MOVE',unitId:'1:0',lane:1},moveId),cmd(a,{type:'MOVE',unitId:'1:1',lane:1})]);assert.ok(moves.every(r=>r.status===200),JSON.stringify(moves));assert.equal((await cmd(a,{type:'MOVE',unitId:'1:0',lane:1},moveId)).duplicate,true);
  snapshot=await h.live(c,'state');assert.equal(snapshot.units.filter(u=>u.ownerId==='1'&&u.move).length,2,'simultaneous commands preserve both writes');
  const renewed=await h.api(1,'defense/session',{roomId:a.roomId});assert.equal(renewed.roomId,a.roomId);assert.equal((await h.live(a,'state')).status,200,'overlapping old lease remains valid');assert.equal((await h.live(renewed,'state')).status,200);
  assert.equal((await h.api(1,'defense/leave',{})).status,409);
  let stored=await h.room(a.roomId);advanceRoom(stored,15000+RULES.moveMs);stored.units.filter(u=>u.ownerId==='1').forEach(u=>u.hp=0);advanceRoom(stored,100);stored.serverAt=Date.now();await h.room(a.roomId,stored);
  const restored=await h.api(1,'defense/session',{});assert.equal(restored.snapshot.players[0].wipeCount,1);assert.equal(restored.snapshot.players[0].reviveDelayMs,15000);assert.equal(restored.snapshot.units.filter(u=>u.ownerId==='1'&&u.hp===0).length,3);
  // Advancing a saved snapshot through the alarm path must not reset deaths.
  stored=await h.room(a.roomId);stored.serverAt=Date.now()-1500;await h.room(a.roomId,stored);await new Promise(r=>setTimeout(r,1200));const advanced=await h.room(a.roomId);assert.ok(advanced.time>stored.time);assert.equal(advanced.players[0].wipeCount,1);
  const settings=await h.api(1,'admin/defense/settings'),off={...settings.settings,mode:'OFF'};assert.equal((await h.api(1,'admin/defense/settings',{settings:off,requestId:id()})).status,200);assert.equal((await h.api(2,'defense/session',{roomId:a.roomId})).status,403);
  stored=await h.room(a.roomId);stored.phase='DEFEAT';stored.completedAt=stored.time;await h.room(a.roomId,stored);
  const back=await h.api(1,'admin/defense/settings');assert.equal((await h.api(1,'admin/defense/settings',{settings:{...back.settings,mode:'TEST'},requestId:id()})).status,200);
  assert.equal((await h.api(1,'defense/leave',{})).status,200);assert.equal((await h.live(restored,'state')).status,401);
  const practice=await h.api(1,'defense/create',create(2,{practice:true,difficulty:'GUIDE'}));assert.equal(practice.status,200);assert.equal(practice.snapshot.players.length,2);assert.equal(practice.snapshot.players[1].bot,true);assert.equal(practice.snapshot.totalWaves,30);assert.equal((await h.api(1,'defense/leave',{})).status,200);
  const balances=await h.db.batch([{sql:'SELECT coin FROM users'},{sql:'SELECT COUNT(*) AS n FROM coin_logs'},{sql:'SELECT COUNT(*) AS n FROM inventory_logs'}]);assert.ok(balances[0].results.every(x=>x.coin===12345678));assert.equal(balances[1].results[0].n,0);assert.equal(balances[2].results[0].n,0);
 }finally{await h.dispose();}
});
test('defense CMS: OWNER CAS, exact retry, validation, nickname lookup and frozen room policy',async()=>{
 const h=await monsterDefenseFixture();
 try{
  const initial=await h.api(1,'admin/defense/settings');assert.equal(initial.settings.mode,'TEST');assert.equal(initial.settings.difficulties.length,5);
  const users=await h.api(1,'admin/defense/test-users?q='+encodeURIComponent('분대 2'));assert.deepEqual(users.users,[{id:2,nickname:'분대 2'}]);
  for(const patch of [{mode:'ON'},{rewardsEnabled:true},{testUserIds:[9999]},{testUserIds:[2,2]}])assert.equal((await h.api(1,'admin/defense/settings',{settings:{...initial.settings,...patch},requestId:id()})).status,400);
  const next=structuredClone(initial.settings);next.difficulties[0].hpPercent=70;const payload={settings:next,requestId:id()};const saved=await h.api(1,'admin/defense/settings',payload);assert.equal(saved.status,200,JSON.stringify(saved));assert.equal(saved.settings.revision,1);assert.equal((await h.api(1,'admin/defense/settings',payload)).replayed,true);
  assert.equal((await h.api(1,'admin/defense/settings',{...payload,settings:{...next,mode:'OFF'}})).status,409);assert.equal((await h.api(1,'admin/defense/settings',{settings:next,requestId:id()})).status,409);
  const room=await h.api(2,'defense/create',{capacity:2,difficulty:'GUIDE',loadout:defaultLoadout(),practice:true,requestId:id()});assert.equal(room.status,200);assert.equal((await h.room(room.roomId)).encounter.hpPercent,70);
  const updated=structuredClone(saved.settings);updated.difficulties[0].hpPercent=150;updated.difficulties[0].enabled=false;assert.equal((await h.api(1,'admin/defense/settings',{settings:updated,requestId:id()})).status,200);assert.equal((await h.room(room.roomId)).encounter.hpPercent,70);assert.equal((await h.api(1,'defense/create',{capacity:2,difficulty:'GUIDE',loadout:defaultLoadout(),requestId:id()})).status,400);
  await h.db.batch([{sql:'DELETE FROM app_meta WHERE key=?',args:[DEFENSE_KEY]}]);assert.deepEqual((await h.api(1,'admin/defense/settings')).settings,defaultDefenseSettings());assert.equal((await h.api(2,'defense/feature')).accessible,false);
 }finally{await h.dispose();}
});
