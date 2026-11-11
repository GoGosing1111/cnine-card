import test from 'node:test';
import assert from 'node:assert/strict';
import {citadelFixture,citadelSquads} from './helpers/legion-citadel-fixture.mjs';
import {SEASON_S1_SCHEMA,seasonAccount} from '../functions/_season_s1.js';
import {buildCitadelBattle} from '../functions/_legion_citadel_battle.js';
import {legionHuntEnergy} from '../functions/_legion_hunt.js';
import {distributeCitadelLoot,personalFarm,farmView} from '../functions/_legion_citadel_loot.js';
import {validatePreparedMercenaries} from '../shared/companion-loadout-v2.mjs';
import {CITADEL_BOARDS,citadelStation} from '../shared/cooperative-battleground-v1.mjs';
import {citadelHitRows,citadelPlaybackFrames} from '../js/legion-citadel-v1.mjs';
import {CAPACITY as soloCapacity} from '../preview/sustained-hunt-v2/hunt-rules.mjs';
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
test('sixteen real Citadel slots refill through the boss, with two separate allied blocks',()=>{
 const b=buildCitadelBattle(citadelSquads(),5),enc=b.replay.payload.cooperativeEncounter;
 assert.equal(soloCapacity,12);assert.equal(enc.initialIds.length,16);
 assert.equal(new Set(enc.initialIds).size,16);
 const spawn=b.chunks.flatMap(c=>c.events).filter(e=>e.type==='ENEMY_SPAWN');
 assert.ok(spawn.some(e=>e.slot===15&&e.combatAtMs>=300000));assert.equal(spawn.filter(e=>e.boss).length,1);
 for(const compact of [false,true]){
  const all=(kind,size,enemy=false)=>Array.from({length:size},(_,i)=>citadelStation(kind,i,enemy,compact));
  const rear=all('cards',4),front=all('mercenaries',4),enemy=all('cards',16,true);
  const distinct=(points,axis)=>new Set(points.map(p=>p[axis])).size;
  for(const p of [front,rear]){assert.equal(distinct(p,'x'),2);assert.equal(distinct(p,'y'),2);}
  assert.equal(distinct(enemy,'x'),4);assert.equal(distinct(enemy,'y'),4);
  assert.equal(distinct([...front,...rear],'x'),2);assert.equal(distinct([...front,...rear],'y'),4);
  const line=(points,axis)=>points.map(p=>p[axis]);
  const ordered=(a,b,axis)=>Math.max(...line(a,axis))<Math.min(...line(b,axis));
  if(compact){assert.ok(ordered(enemy,front,'y'));assert.ok(ordered(front,rear,'y'));}
  else{assert.ok(ordered(rear,front,'y'));assert.ok(ordered(front,enemy,'x'));}
  const board=CITADEL_BOARDS[compact?'compact':'desktop'];for(const p of [...enemy,...front,...rear])assert.ok(p.x>0&&p.x<board.width&&p.y>0&&p.y<board.height);
 }
});
test('field damage uses each receipt once across area hits, combos, absorption, dodges and status effects',()=>{
 const rows=e=>citadelHitRows(e).map(h=>[h.id,h.damage,h.shield,h.dodge]);
 assert.deepEqual(rows({damage:15,hits:[{targetId:'x',damage:10},{targetId:'y',damage:5,absorbed:2}]}),[['x',10,0,false],['y',5,2,false]]);
 assert.deepEqual(rows({targetId:'x',damage:17,hits:[{damage:9},{damage:8}]}),[['x',9,0,false],['x',8,0,false]]);
 assert.deepEqual(rows({targetId:'y',absorbed:40}),[['y',0,40,false]]);
 assert.deepEqual(rows({targets:[{targetId:'x',damage:4}]}),[['x',4,0,false]]);
 assert.deepEqual(rows({type:'DODGE',targetId:'x'}),[['x',0,0,true]]);
 assert.deepEqual(rows({type:'ICON_STATUS',targetId:'x',targetHpAfter:30}),[]);
});
test('custom party-only pools stay disjoint even with an odd catalogue',()=>{
 const supply=['a','b','c'].map(ref=>({type:'INVENTORY_ITEM',ref})),gear=['1','2','3'].map(ref=>({type:'EQUIPMENT',ref}));
 for(const chance of [0,35,100])for(let i=0;i<100;i++){const [a,b]=distributeCitadelLoot(supply,gear,chance);assert.ok([...b.goods,...b.armory].every(y=>[...a.goods,...a.armory].every(x=>x.type!==y.type||x.ref!==y.ref)));const farm=personalFarm(a,[[10000,2],[15000,2]],true);assert.equal(farmView(farm,9999,true).picked,0);assert.equal(farmView(farm,20000,true).picked,2);}
});
for(const postgres of [false,true])test((postgres?'PostgreSQL':'SQLite')+' party flow, barriers, private grants, retries and recovery',async()=>{
 const f=await citadelFixture({postgres});try{
  if(postgres)await f.db.execSchema(SEASON_S1_SCHEMA.map(sql=>sql.replaceAll('INTEGER','BIGINT')));
  else for(const sql of SEASON_S1_SCHEMA)await f.exec(sql);
  f.env.SEASON_S1_ENABLED='1';f.env.SEASON_S1_NOW=()=>f.clock.now;f.env.SEASON_S1_SCHEDULE={PVE:{start:f.clock.now-86400000}};
  const counts=async()=>Promise.all([1,2,3].map(async u=>(await seasonAccount(f.env,u)).state.tracks.PVE.counts.LEGION||0));
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
  await states(f,2,'loaded',{id});assert.equal(await read(ukey(1)),null);assert.equal(await read(ukey(2)),null);assert.equal((await f.action(3,'claim',{id})).status,403);
  const deadline=active.startsAt+6*60*60*1000;
  assert.equal(active.nextEntryAt,deadline);
  for(const uid of [1,2])assert.equal((await states(f,uid,'lobby')).nextEntryAt,deadline);
  assert.equal((await states(f,3,'lobby')).nextEntryAt,null);
  const farms=[];for(const u of [1,2])farms.push(await read('legion_citadel_v1:farm:'+id+':'+u));
  const first=farms[0].events[0],next=farms[1].events[0];
  assert.equal((await f.action(1,'pickup',{id,token:first[4]})).status,409);assert.equal((await f.action(2,'pickup',{id,token:first[4]})).status,403);
  for(const [event,u] of [[first,1],[next,2]].sort((a,b)=>a[0][0]-b[0][0])){f.clock.now=active.startsAt+event[0]+10;const g=await states(f,u,'pickup',{id,token:event[4]});assert.equal(g.state.picked,1);assert.equal((await states(f,u,'pickup',{id,token:event[4]})).state.picked,1);}
  assert.deepEqual(await counts(),[0,0,0]);
  f.clock.now=active.startsAt+active.duration+100;assert.equal((await f.action(1,'pickup',{id,token:farms[0].events[1][4]})).status,409);const a=(await states(f,1,'state?id='+id)).state,b=(await states(f,2,'state?id='+id)).state;
  assert.deepEqual(await counts(),[1,1,0]);
  assert.equal(a.status,'VICTORY');assert.equal(a.drops.length,1);assert.ok(a.kills>100);assert.ok(b.drops.every(j=>a.drops.every(i=>i.type!==j.type||i.ref!==j.ref)));
  const inventory=async uid=>(await f.db.prepare('SELECT item_code,quantity FROM cnine_user_inventory WHERE user_id=? ORDER BY item_code').bind(uid).all()).results;
  assert.deepEqual(await inventory(2),[]);assert.equal((await f.action(1,'leave',{id})).status,409);
  f.fail('INSERT INTO inventory_logs');assert.equal((await f.action(1,'claim',{id})).status,503);f.fail('');assert.deepEqual(await inventory(1),[]);assert.equal((await states(f,1,'state?id='+id)).state.claimed,false);
  await states(f,1,'claim',{id});const own=await inventory(1);assert.equal(own.length,new Set(a.drops.map(i=>i.ref)).size);assert.deepEqual(await inventory(2),[]);
  await states(f,1,'claim',{id});assert.deepEqual(await inventory(1),own);await states(f,1,'leave',{id});
  assert.equal((await states(f,2,'lobby')).state.id,id);await states(f,2,'claim',{id});const other=await inventory(2);assert.ok(other.every(j=>own.every(i=>i.item_code!==j.item_code)));await states(f,2,'leave',{id});
  assert.equal((await states(f,2,'lobby')).state,null);assert.deepEqual(await inventory(3),[]);
  assert.deepEqual((await states(f,1,'claim',{id})).state.drops,a.drops);assert.deepEqual(await inventory(1),own);
  assert.deepEqual(await counts(),[1,1,0]);
  assert.equal(await read('legion_citadel_v1:farm:'+id+':1'),null);assert.equal((await f.action(3,'claim',{id})).status,404);
  // One party charge is shared across all tiers. Three hours after departure is still too early.
  f.clock.now=active.startsAt+3*60*60*1000;
  assert.equal((await states(f,1,'lobby')).partyRechargeHours,6);
  assert.equal((await f.action(1,'create',{requestId:'three-hours-after-departure',tier:'keep'})).body.code,'CITADEL_COOLDOWN');
  f.clock.now=deadline-1;
  const openRoom=(await states(f,3,'create',{requestId:'new-party-different-host',tier:'throne'})).state;
  for(const uid of [1,2]){
   const lobby=await states(f,uid,'lobby');
   assert.equal(lobby.state,null);assert.equal(lobby.serverNow,f.clock.now);assert.equal(lobby.nextEntryAt,deadline);
   for(const tier of ['gate','keep','throne']){
    const response=await f.action(uid,'create',{requestId:'cooldown-next-party-'+tier,tier});
    assert.equal(response.body.code,'CITADEL_COOLDOWN');assert.equal(response.status,409);
   }
   assert.equal((await f.action(uid,'join',{id:openRoom.id})).body.code,'CITADEL_COOLDOWN');
   assert.equal(await read(ukey(uid)),null);
  }
  // Both accounts can enter at the exact boundary, swapping the two original roles.
  f.clock.now=deadline;
  assert.equal((await states(f,1,'lobby')).nextEntryAt,null);
  const second=(await states(f,2,'create',{requestId:'cooldown-next-party-throne',tier:'throne'})).state;
  await states(f,1,'join',{id:second.id});
  for(const uid of [1,2])await states(f,uid,'ready',{id:second.id,...f.selection(uid-1)});
  await states(f,2,'start',{id:second.id});await states(f,2,'loaded',{id:second.id});
  const secondBattle=(await states(f,1,'loaded',{id:second.id})).state;
  assert.equal(secondBattle.nextEntryAt,secondBattle.startsAt+6*60*60*1000);
  for(const uid of [1,2])assert.equal(await read(ukey(uid)),null);
 }finally{await f.close();}
});
test('a party recharge already underway completes at its saved deadline',async()=>{
 const f=await citadelFixture();try{
  const until=f.clock.now+3*60*60*1000;
  await f.exec('INSERT INTO app_meta(key,value) VALUES(?,?)','legion_citadel_v1:next-entry:1',String(until));
  f.clock.now=until-1;
  assert.equal((await states(f,1,'lobby')).nextEntryAt,until);
  assert.equal((await f.action(1,'create',{requestId:'previous-party-deadline',tier:'gate'})).body.code,'CITADEL_COOLDOWN');
  f.clock.now=until;
  assert.equal((await states(f,1,'lobby')).nextEntryAt,null);
  assert.equal((await f.action(1,'create',{requestId:'previous-party-deadline',tier:'gate'})).status,200);
 }finally{await f.close();}
});

test('empty solo energy cannot block a paid party departure or be debited by a retry',async()=>{
 const f=await citadelFixture();
 try{
  const key='legion_hunt_owner_session_v1:2',original=JSON.stringify({energy:{version:1,current:0,updatedAt:f.clock.now,maximum:10}});
  await f.exec('INSERT INTO app_meta(key,value) VALUES(?,?)',key,original);
  assert.equal((await states(f,2,'lobby')).nextEntryAt,null);
  const id=await boot(f);
  await states(f,1,'loaded',{id});
  for(const uid of [1,2])assert.equal((await states(f,uid,'lobby')).nextEntryAt,null);
  const active=(await states(f,2,'loaded',{id})).state;
  assert.equal(active.status,'ACTIVE');
  await states(f,2,'loaded',{id});
  for(const uid of [1,2])assert.equal((await states(f,uid,'lobby')).nextEntryAt,active.startsAt+6*3600000);
  assert.equal((await f.db.prepare('SELECT value FROM app_meta WHERE key=?').bind(key).first()).value,original);
  assert.equal(await f.db.prepare('SELECT value FROM app_meta WHERE key=?').bind('legion_hunt_owner_session_v1:1').first(),null);
 }finally{await f.close();}
});

test('abandoned loading leaves both party charges available',async()=>{
 const f=await citadelFixture();
 try{
  const id=await boot(f);await states(f,1,'loaded',{id});
  f.clock.now+=130000;assert.equal((await states(f,1,'lobby')).state,null);
  for(const uid of [1,2])assert.equal((await states(f,uid,'lobby')).nextEntryAt,null);
 }finally{await f.close();}
});

test('activation rechecks both deadlines, survives a lost reply and keeps the party cooldown across the solo midnight refill',async()=>{
 const f=await citadelFixture();
 try{
  f.clock.now=Date.parse('2026-11-10T23:56:00+09:00');
  const id=await boot(f),peerKey='legion_citadel_v1:next-entry:2',until=f.clock.now+60000;
  await states(f,1,'loaded',{id});
  await f.exec('INSERT INTO app_meta(key,value) VALUES(?,?)',peerKey,String(until));
  f.clock.now=until-1;
  assert.equal((await f.action(2,'loaded',{id})).body.code,'CITADEL_COOLDOWN');
  const unchanged=(await states(f,1,'state?id='+id)).state;
  assert.equal(unchanged.status,'LOADING');assert.equal(unchanged.members[1].loaded,false);
  f.clock.now=until;
  f.loseReply();
  assert.equal((await f.action(2,'loaded',{id})).status,503);
  const retry=(await states(f,2,'loaded',{id})).state;
  assert.equal(retry.status,'ACTIVE');assert.equal(retry.nextEntryAt,retry.startsAt+6*60*60*1000);
  for(const uid of [1,2]){
   const row=await f.db.prepare('SELECT value FROM app_meta WHERE key=?').bind('legion_hunt_owner_session_v1:'+uid).first();
   assert.equal(row,null);
  }
  f.clock.now=retry.startsAt+retry.duration+1;
  const solo=await f.db.prepare('SELECT value FROM app_meta WHERE key=?').bind('legion_hunt_owner_session_v1:1').first();
  assert.equal(legionHuntEnergy(solo&&JSON.parse(solo.value),f.clock.now).current,10);
  await states(f,1,'claim',{id});await states(f,1,'leave',{id});
  assert.equal((await f.action(1,'create',{requestId:'after-midnight-party'})).body.code,'CITADEL_COOLDOWN');
 }finally{await f.close();}
});

for(const postgres of [false,true])test((postgres?'PostgreSQL':'SQLite')+' second seat write failure and overlapping loading confirmations spend exactly one entry per account',async()=>{
 const f=await citadelFixture({postgres});
 try{
  const id=await boot(f),key='legion_citadel_v1:next-entry:';
  await states(f,1,'loaded',{id});
  if(postgres)await f.db.execSchema([
   "CREATE FUNCTION deny_party_entry() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'entry failure'; END $$",
   "CREATE TRIGGER deny_party_entry BEFORE INSERT ON app_meta FOR EACH ROW WHEN (NEW.key='legion_citadel_v1:next-entry:2') EXECUTE FUNCTION deny_party_entry()"
  ]);
  else await f.exec("CREATE TRIGGER deny_party_entry BEFORE INSERT ON app_meta WHEN NEW.key='legion_citadel_v1:next-entry:2' BEGIN SELECT RAISE(ABORT,'entry failure'); END");
  assert.equal((await f.action(2,'loaded',{id})).status,503);
  assert.equal((await states(f,1,'state?id='+id)).state.status,'LOADING');
  const read=async k=>(await f.db.prepare('SELECT value FROM app_meta WHERE key=?').bind(k).first())?.value??null;
  for(const uid of [1,2]){
   assert.equal(await read(key+uid),null);
   assert.equal(await read('legion_hunt_owner_session_v1:'+uid),null);
  }
  if(postgres)await f.db.execSchema(['DROP TRIGGER deny_party_entry ON app_meta']);
  else await f.exec('DROP TRIGGER deny_party_entry');
  // The in-memory fixtures use a single connection. Serialize transactions while allowing both requests to read the same room version.
  const batch=f.db.batch.bind(f.db);let tail=Promise.resolve();
  f.db.batch=statements=>{const result=tail.then(()=>batch(statements));tail=result.catch(()=>{});return result;};
  const confirmations=await Promise.all([states(f,2,'loaded',{id}),states(f,2,'loaded',{id})]);
  assert.equal(confirmations[0].state.nextEntryAt,confirmations[1].state.nextEntryAt);
  for(const uid of [1,2]){
   assert.equal(await read(key+uid),String(confirmations[0].state.startsAt+6*60*60*1000));
   assert.equal(await read('legion_hunt_owner_session_v1:'+uid),null);
  }
 }finally{await f.close();}
});

test('party HP follows each impact timestamp and every 30-second part can resume independently',()=>{
 const {replay,chunks}=buildCitadelBattle(citadelSquads(),5);
 assert.equal(replay.impactFrames,true);
 const ids=[...replay.units.map(u=>u.id),...replay.payload.cooperativeEncounter.citadel.manifest.map(([s,n])=>n===-1?'B:4:CITADEL:BOSS':'B:'+s+':CITADEL'+(n?':R'+n:''))];
 let checked=0,subsecond=0;
 for(const [i,chunk] of chunks.entries()){
  const {frames}=chunk;assert.equal(frames[0][0],i*replay.chunkMs);
  const at=new Map(frames);let prev=-1;
  for(const [ms] of frames){assert.ok(ms>prev);if(prev>=0&&ms-prev<1000)subsecond++;prev=ms;}
  for(const e of chunk.events){
   if(e.type!=='KO')continue;
   const values=at.get(e.combatAtMs);if(!values)continue;
   const idx=ids.indexOf(e.targetId);for(let k=0;k<values.length;k+=3)if(values[k]===idx){assert.equal(values[k+1],0);checked++;break;}
  }
 }
 assert.ok(checked>100&&subsecond>20);
});
test('running legacy rooms apply absolute area damage, recovery and shield hits between checkpoints',()=>{
 const units=[{id:'a',side:'A',maxHp:90},{id:'b',side:'B',slot:0,maxHp:100},{id:'c',side:'B',slot:0,maxHp:100}];
 const events=[
  {combatAtMs:230,hits:[{targetId:'a',targetHpAfter:70,targetShieldAfter:0},{targetId:'b',targetHpAfter:20,targetShieldAfter:5}]},
  {combatAtMs:400,type:'KO',targetId:'b'},{combatAtMs:410,type:'ENEMY_SPAWN',targetId:'c',targetHpAfter:100,targetShieldAfter:3},
  {combatAtMs:420,targetId:'b',targetHpAfter:45},{combatAtMs:450,targets:[{targetId:'a',hpAfter:85}]}];
 const frames=citadelPlaybackFrames({frames:[[0,[0,90,0,1,100,10]]],events},{units});
 assert.deepEqual(frames.map(([ms])=>ms),[0,230,400,410,450]);
 assert.deepEqual(frames[1][1],[0,70,0,1,20,5]);assert.deepEqual(frames.at(-1)[1],[0,85,0,2,100,3]);
});
