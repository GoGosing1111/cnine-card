import test from 'node:test';
import assert from 'node:assert/strict';
import {createHmac} from 'node:crypto';
import {jointFixture} from './helpers/joint-db.mjs';
import {accountRankAward,settleRankedHunt} from '../functions/_account_rank.js';
import {prepareApocalypseRewards} from '../functions/_apocalypse_rewards.js';
import {legionFixture} from './helpers/legion-hunt-fixture.mjs';
import {citadelFixture,veteranCitadelSquads} from './helpers/legion-citadel-fixture.mjs';
import {seedRegionalCatalog} from './helpers/legion-regions-fixture.mjs';
import {legionRegionDefaults,LEGION_REGIONS_KEY} from '../shared/legion-regions-v1.mjs';
import {COW_AREA,COW_REGION,COW_SOLO_CAP,COW_PARTY_CAP,COW_TICKETS} from '../shared/legion-cow-room.mjs';
import {cowTicketAward,cowTicketOutcome,cowTicketCount,COW_DRAW_KEY} from '../functions/_legion_cow_tickets.js';
import {createHuntSession} from '../preview/sustained-hunt-v2/session.mjs';
import {emptyHideout,HIDEOUT_KEY} from '../shared/personal-hideout-v1.mjs';

function winningId(user,source,kind,seed){
  for(let i=0;;i++){
    const id='qa-cow-'+i,value=createHmac('sha256',seed).update(JSON.stringify([user,source,id])).digest().readUInt32BE();
    if(value<4294967200&&value%400===kind)return id;
  }
}
const ok=r=>{assert.equal(r.status,200,JSON.stringify(r.body));return r.body;};
const exec=(f,s,...args)=>f.DB.prepare(s).bind(...args).run();
const saved=async(f,key)=>JSON.parse((await f.DB.prepare('SELECT value FROM app_meta WHERE key=?').bind(key).first()).value);
const setItem=(f,uid,kind,qty)=>exec(f,'INSERT INTO cnine_user_inventory(user_id,item_code,quantity,unseen_quantity) VALUES(?,?,?,?) ON CONFLICT(user_id,item_code) DO UPDATE SET quantity=excluded.quantity,unseen_quantity=excluded.unseen_quantity',uid,COW_TICKETS[kind].code,qty,qty);
async function regions(f){
  const policy=legionRegionDefaults();policy.mode='ON';
  await exec(f,'INSERT INTO app_meta(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value',LEGION_REGIONS_KEY,JSON.stringify(policy));
  await seedRegionalCatalog(f);
}
for(const postgres of [false,true]){
 const backend=postgres?'Postgres':'SQLite';
 test(backend+' · equal solo/party ticket buckets, cached misses, atomic grant, duplicate and failed receipt',async t=>{
  const f=await legionFixture({postgres});t.after(f.close);
  const seed='local-frozen-seed',source='PVE_HUNT',ids=new Map();await exec(f,'INSERT INTO app_meta(key,value) VALUES(?,?)',COW_DRAW_KEY,seed);
  for(let i=0;ids.size<3;i++){
    const id='battle-'+i,value=createHmac('sha256',seed).update(JSON.stringify([2,source,id])).digest().readUInt32BE();
    if(value>=4294967200)continue;
    const bucket=value%400;if(bucket<=2)ids.set(bucket,id);
  }
  f.resetQueries();assert.equal(await cowTicketOutcome(f.env,2,source,ids.get(2)),null);
  assert.equal((await cowTicketAward(f.env,2,source,ids.get(2))).statements.length,0);assert.equal(f.queries.length,1);
  for(const [n,kind] of ['solo','party'].entries()){
   const award=()=>cowTicketAward(f.env,2,source,ids.get(n));
   const first=await award();assert.equal(first.ticket.code,COW_TICKETS[kind].code);assert(first.ticket.acquisitionId);
   f.fail('INSERT INTO inventory_logs');await assert.rejects(()=>f.DB.batch(first.statements));f.fail('');
   assert.equal(await cowTicketCount(f.DB,2,kind),0);
   await f.DB.batch((await award()).statements);await f.DB.batch((await award()).statements);
   assert.equal(await cowTicketCount(f.DB,2,kind),1);
  }
  assert.equal(Number((await f.DB.prepare("SELECT count(*) n FROM inventory_logs WHERE reference_type='LEGION_COW_DROP'").first()).n),2);
 });
 test(backend+' · solo highest-difficulty formation, 5조 cap, no energy charge and retry-safe entry',async t=>{
  const f=await legionFixture({postgres,regions:true,inventoryBigInt:true});t.after(f.close);await regions(f);
  const base=await f.configure();base.mode='ON';ok(await f.call('admin/legion-hunt',{policy:base},{method:'PATCH'}));f.setUser(f.player);
  const opts={regionId:COW_AREA,difficulty:'calamity',version:5},key='legion_hunt_owner_session_v1:2';
  const menu=ok(await f.call('legion-hunt/bootstrap'));assert(menu.regionExpansion.regions.some(r=>r.id===COW_AREA));assert.equal(menu.cowTickets,0);
  assert.equal((await f.call('legion-hunt/start',opts)).status,409);await setItem(f,2,'solo',1);
  let snapshot;
  const create=f.deps.createSession;f.deps.createSession=args=>{snapshot=args.snapshot;return create(args);};
  const started=ok(await f.call('legion-hunt/start',opts)),{id}=started;
  const run=await saved(f,key);assert.equal(run.coins.cap,COW_SOLO_CAP);assert.equal(run.coins.cap,5e12);
  const source=run.state.policy.sourceRegionId,difficulty=legionRegionDefaults().difficulties.find(d=>d.id==='calamity');
  assert(source);assert.equal(run.state.policy.regionLoot.eliteSetPercent,Math.min(100,difficulty.loot.eliteSetPercent*1.5));
  const spawns=(regionId,dropPolicy)=>createHuntSession({snapshot,regionId,difficulty:'calamity',regionDifficulty:difficulty,dropPolicy,seed:1731}).payload;
  const cow=spawns(COW_AREA,{sourceRegionId:source}),normal=spawns(source,{});
  const placement=payload=>payload.continuousEncounter.instances.map(({slot,boss,elite,maxHp})=>[slot,boss,elite,maxHp]);
  assert.deepEqual(placement(cow),placement(normal));assert.equal(cow.battlefieldBackground,COW_REGION.background);
  const regional=await saved(f,LEGION_REGIONS_KEY);
  await exec(f,'UPDATE app_meta SET value=? WHERE key=?',JSON.stringify({...regional,mode:'OFF'}),LEGION_REGIONS_KEY);
  assert.equal((await f.call('legion-hunt/begin',{id})).status,423);assert.equal(await cowTicketCount(f.DB,2,'solo'),1);
  await exec(f,'UPDATE app_meta SET value=? WHERE key=?',JSON.stringify(regional),LEGION_REGIONS_KEY);
  assert.equal(await cowTicketCount(f.DB,2,'solo'),1);f.fail('INSERT INTO inventory_logs');
  assert((await f.call('legion-hunt/begin',{id})).status>=400);f.fail('');assert.equal(await cowTicketCount(f.DB,2,'solo'),1);
  ok(await f.call('legion-hunt/begin',{id}));ok(await f.call('legion-hunt/begin',{id}));assert.equal(await cowTicketCount(f.DB,2,'solo'),0);
  assert.equal((await saved(f,key)).energy.current,run.energy.current);
 });
}
test('hunt, sweep and Apocalypse results present only tickets the account actually received',async t=>{
 const f=await jointFixture(t,{postgres:true}),seed='server-only-fixture';
 await exec(f,'INSERT INTO app_meta(key,value) VALUES(?,?)',COW_DRAW_KEY,seed);
 f.env.PERSONAL_HIDEOUT_ENABLED='1';
 const hunt=winningId(7,'PVE_HUNT',0,seed),sweep=winningId(7,'PVE_SWEEP',1,seed);
 await f.DB.batch(await accountRankAward(f.env,7,'HUNT',hunt));
 assert.deepEqual(await settleRankedHunt(f.env,7,'HUNT',hunt,100,'old result'),{cowTicket:null,hideoutReward:null});
 assert.equal(await cowTicketCount(f.DB,7,'solo'),0);
 const roll=()=>settleRankedHunt(f.env,7,'HUNT',sweep,100,'sweep',{sweep:true});
 const first=await roll();assert.equal(first.cowTicket.code,COW_TICKETS.party.code);assert.deepEqual(first.hideoutReward,{STEEL:2,WIRE:1});assert.deepEqual(await roll(),first);
 assert.equal(await cowTicketCount(f.DB,7,'party'),1);
 const state={requestId:hunt,won:false,plan:{bonuses:{}},monsterId:1};
 const apo=await prepareApocalypseRewards(f.env,f.user,state);await f.DB.batch(apo.statements);
 assert.equal(apo.patch.cowTicket.code,COW_TICKETS.solo.code);assert.equal(await cowTicketCount(f.DB,7,'solo'),1);
});
for(const withHideout of [false,true])test((withHideout?'with a personal hideout: ':'')+'party highest-tier formation, 10조 per player; one host ticket only once after both load',async t=>{
 const f=await citadelFixture({postgres:true,squads:veteranCitadelSquads()});t.after(f.close);await regions(f);
 const call=async(u,path,body)=>ok(await f.action(u,path,body)),opts={area:COW_AREA,tier:'throne',requestId:'party-cow-20261120'};
 if(withHideout){
  f.env.PERSONAL_HIDEOUT_ENABLED='1';
  for(const uid of [1,2])await exec(f,'INSERT INTO app_meta(key,value) VALUES(?,?)',HIDEOUT_KEY(uid),JSON.stringify({...emptyHideout(),level:1,revision:1,rooms:['main']}));
  assert.equal((await call(1,'lobby')).partyEnergy.current,2);
 }
 assert.equal((await f.action(1,'create',opts)).status,409);await setItem(f,1,'party',1);
 const {state:{id}}=await call(1,'create',opts);assert((await call(2,'lobby')).cowRooms.some(r=>r.id===id));
 await call(2,'join',{id});for(const u of [1,2])await call(u,'ready',{id,...f.selection(u-1)});
 const loading=(await call(1,'start',{id})).state;assert.equal(loading.status,'LOADING');const battle=await call(2,'battle?id='+id);assert(battle.chunk.frames.length);
 const room=await saved(f,'legion_citadel_v1:room:'+id);for(const member of room.members){assert.equal(member.coins.cap,COW_PARTY_CAP);assert.equal(member.coins.cap*member.coins.partyMultiplier,1e13);}
 await call(1,'loaded',{id});assert.equal(await cowTicketCount(f.DB,1,'party'),1);
 f.fail('INSERT INTO inventory_logs');assert((await f.action(2,'loaded',{id})).status>=400);f.fail('');assert.equal(await cowTicketCount(f.DB,1,'party'),1);
 assert.equal((await call(2,'loaded',{id})).state.status,'ACTIVE');await call(1,'loaded',{id});await call(2,'loaded',{id});
 assert.equal(await cowTicketCount(f.DB,1,'party'),0);assert.equal(await cowTicketCount(f.DB,2,'party'),0);
 assert.equal(Number((await f.DB.prepare("SELECT count(*) n FROM inventory_logs WHERE reference_type='LEGION_COW_ENTRY'").first()).n),1);
 if(withHideout){
  for(const uid of [1,2])assert.equal((await call(uid,'lobby')).partyEnergy.current,2);
  const active=(await call(1,'state?id='+id)).state;
  f.clock.now=active.startsAt+active.duration+1;
  for(const uid of [1,2]){
   await call(uid,'state?id='+id);await call(uid,'state?id='+id);
   const home=await saved(f,HIDEOUT_KEY(uid));
   assert.equal(home.parts.STEEL,8);assert.equal(home.activityDates.length,1);
  }
 }
});
