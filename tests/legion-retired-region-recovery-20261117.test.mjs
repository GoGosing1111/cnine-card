import test from 'node:test';
import assert from 'node:assert/strict';
import {legionFixture} from './helpers/legion-hunt-fixture.mjs';
import {citadelFixture,veteranCitadelSquads} from './helpers/legion-citadel-fixture.mjs';
import {seedRegionalCatalog} from './helpers/legion-regions-fixture.mjs';
import {readRegionPolicy,saveRegionPolicy,validateRegionPolicy} from '../functions/_legion_regions.js';
import {legionRegionDefaults,LEGION_REGIONS_KEY,REGION_DIFFICULTIES,REGION_EQUIPMENT} from '../shared/legion-regions-v1.mjs';
import {RETIRED_HYPER_TICKET as ITEM} from '../functions/_hyper_ticket_retirement.js';
import {restoreHuntSession} from '../preview/sustained-hunt-v2/session.mjs';

const reward=ref=>({code:'INVENTORY_ITEM:'+ref,type:'INVENTORY_ITEM',ref,name:ref,enabled:true,weight:1,minQuantity:3,maxQuantity:3});
const retired=reward(ITEM),other=reward('VEHICLE_PART_FRAME');
const legacyPolicy=()=>({...legionRegionDefaults(),mode:'ON',regions:legionRegionDefaults().regions.map(r=>({...r,fieldDrops:{
  difficulties:REGION_DIFFICULTIES.map(d=>({id:d.id,dropPercent:100,bossDropPercent:100,lifetimeSeconds:9})),items:[retired,other]
}}))});
const seedLegacy=async f=>{const raw=JSON.stringify(legacyPolicy());await f.DB.prepare('INSERT INTO app_meta(key,value) VALUES(?,?)').bind(LEGION_REGIONS_KEY,raw).run();return raw;};
const ok=r=>{assert.equal(r.status,200,JSON.stringify(r.body));return r.body;};

test('legacy five-region pools load with one read and original CAS value; new retired or malformed configuration remains rejected',async t=>{
  const f=await legionFixture({regions:true});t.after(f.close);await seedRegionalCatalog(f);
  const raw=await seedLegacy(f);assert.throws(()=>validateRegionPolicy(JSON.parse(raw)),e=>e.code==='HUNT_POLICY'&&e.message.includes(ITEM));
  f.resetQueries();const {policy,raw:original}=await readRegionPolicy(f.env);assert.equal(f.queries.length,1);assert.equal(original,raw);
  for(const r of policy.regions)assert.deepEqual(r.fieldDrops.items,[other]);
  assert.deepEqual(policy.difficulties,legacyPolicy().difficulties);assert.equal(policy.mode,'ON');
  await assert.rejects(saveRegionPolicy(f.env,f.owner,JSON.parse(raw)),e=>e.code==='HUNT_POLICY');
  assert.equal((await f.DB.prepare('SELECT value FROM app_meta WHERE key=?').bind(LEGION_REGIONS_KEY).first()).value,raw);
  const saved=await saveRegionPolicy(f.env,f.owner,policy);assert.equal(saved.revision,policy.revision+1);
  const broken=legacyPolicy();broken.regions[0].fieldDrops.items[1]={...other,weight:-1};
  await f.DB.prepare('UPDATE app_meta SET value=? WHERE key=?').bind(JSON.stringify(broken),LEGION_REGIONS_KEY).run();
  await assert.rejects(readRegionPolicy(f.env),e=>e.code==='HUNT_REGION_UNAVAILABLE');
});

test('solo bootstrap, start, pickup and atomic settlement recover from stored legacy regional pools (Postgres)',async t=>{
  const f=await legionFixture({postgres:true,regions:true});t.after(f.close);await seedRegionalCatalog(f);
  const base=await f.configure();base.mode='ON';ok(await f.call('admin/legion-hunt',{policy:base},{method:'PATCH'}));await seedLegacy(f);f.setUser(f.player);
  f.deps.createSession=options=>Object.assign(restoreHuntSession({id:crypto.randomUUID(),policy:{id:options.difficulty,huntDurationMs:1000,regionId:options.regionId,...options.dropPolicy},timeLimit:1000,eventTimes:[100,200],timeline:[{seq:1,combatAtMs:100,huntKill:true},{seq:2,combatAtMs:200,type:'RESULT',winner:'A'}],outcome:{}},{now:options.now,random:()=>0}),{payload:{}});
  ok(await f.call('legion-hunt/bootstrap'));const {id}=ok(await f.call('legion-hunt/start',{regionId:'coast',difficulty:'normal',version:5}));
  ok(await f.call('legion-hunt/begin',{id}));f.clock.now+=250;
  const {drop}=ok(await f.call('legion-hunt/reveal',{id,seq:1}));assert(drop.rewards.some(i=>i.ref===other.ref));assert(!JSON.stringify(drop).includes(ITEM));
  ok(await f.call('legion-hunt/claim',{id,dropId:drop.id,token:drop.token,...drop.position}));
  const inventory=async()=>(await f.DB.prepare('SELECT item_code,quantity FROM cnine_user_inventory WHERE user_id=2 ORDER BY item_code').all()).results;
  f.fail('INSERT INTO inventory_logs');assert.equal((await f.call('legion-hunt/finish',{id,seq:2})).status,503);f.fail('');assert.deepEqual(await inventory(),[]);
  const receipt=ok(await f.call('legion-hunt/finish',{id,seq:2}));assert.equal(receipt.liveRewards,true);assert(!JSON.stringify(receipt).includes(ITEM));
  const own=await inventory();assert.equal(Number(own.find(i=>i.item_code===other.ref).quantity),3);
  ok(await f.call('legion-hunt/finish',{id,seq:2}));assert.deepEqual(await inventory(),own);
});

test('party start, battle, pickup and replay-safe claim work with the same legacy regional settings',async t=>{
  const f=await citadelFixture({squads:veteranCitadelSquads()});t.after(f.close);await seedLegacy(f);
  for(const [i,g] of REGION_EQUIPMENT.entries())await f.exec('INSERT INTO character_equipment_items(id,code,name,rarity,image_url,is_active,is_public) VALUES(?,?,?,?,?,1,1)',201+i,g.code,g.name,g.rarity,g.image);
  const call=async(u,path,body)=>ok(await f.action(u,path,body));
  const {state:{id}}=await call(1,'create',{requestId:'legacy-region-retirement-20261117'});await call(2,'join',{id});
  for(const u of [1,2])await call(u,'ready',{id,...f.selection(u-1)});
  assert.equal((await call(1,'start',{id})).state.status,'LOADING');assert((await call(1,'battle?id='+id)).chunk.frames.length>0);
  await call(1,'loaded',{id});const active=(await call(2,'loaded',{id})).state;assert.equal(active.status,'ACTIVE');
  const farm=JSON.parse((await f.DB.prepare('SELECT value FROM app_meta WHERE key=?').bind('legion_citadel_v1:farm:'+id+':1').first()).value),first=farm.events[0];assert(first);
  f.clock.now=active.startsAt+first[0]+10;await call(1,'pickup',{id,token:first[4]});
  f.clock.now=active.startsAt+active.duration+100;assert.equal((await call(1,'state?id='+id)).state.status,'VICTORY');
  const inventory=async()=>(await f.DB.prepare('SELECT item_code,quantity FROM cnine_user_inventory WHERE user_id=1 ORDER BY item_code').all()).results;
  f.fail('INSERT INTO inventory_logs');assert.equal((await f.action(1,'claim',{id})).status,503);f.fail('');assert.deepEqual(await inventory(),[]);
  await call(1,'claim',{id});const own=await inventory();assert(own.length>0);assert(!own.some(i=>i.item_code===ITEM));await call(1,'claim',{id});assert.deepEqual(await inventory(),own);
});

test('in-flight regional snapshots remove retired rolls and bundle rewards while preserving other loot and immutable history',()=>{
  const ticket={...retired,quantity:3},keep={...other,quantity:3},bundle={id:'mixed',token:'token',item:ticket,rewards:[ticket,keep],state:'GROUND',position:{x:.5,y:.5},expiresAt:9000};
  const state={id:'regional-legacy',policy:{id:'normal',regionId:'coast',regionLoot:{},items:[],fieldDrops:{items:[retired,other],dropChance:1,bossDropChance:1},dropLifeMs:9000},timeLimit:1000,eventTimes:[10,20,30],timeline:[{seq:1,combatAtMs:10,huntKill:true},{seq:2,combatAtMs:20,huntKill:true},{seq:3,combatAtMs:30,type:'RESULT',winner:'A'}],outcome:{winner:'A'},startedAt:0,lastAck:1,drops:[['mixed',bundle]],observed:[[1,'mixed']],inventory:[],claims:[]};
  const original=structuredClone(state),s=restoreHuntSession(state,{now:()=>100,random:()=>0});
  assert.deepEqual(s.exportState().policy.fieldDrops.items,[other]);const old=s.reveal(1).drop;assert.deepEqual(old.item,keep);assert.deepEqual(old.rewards,[keep]);
  const claim=s.claim({dropId:old.id,token:old.token,...old.position});assert.deepEqual(claim.inventory,[keep]);assert.equal(s.reveal(2).drop.item.ref,other.ref);assert.deepEqual(s.finish(3).inventory,[keep]);assert.deepEqual(state,original);
  const claimed={...original,drops:[['mixed',{...bundle,state:'CLAIMED'}]],inventory:[[ticket.code,ticket],[keep.code,keep]],claims:[['mixed',{dropId:'mixed',item:ticket,inventory:[ticket,keep]}]]};
  const resumed=restoreHuntSession(claimed,{now:()=>100,random:()=>0});assert.deepEqual(resumed.claim({dropId:'mixed',token:'token'}).inventory,[keep]);assert.deepEqual(resumed.exportState().inventory,[[keep.code,keep]]);
  const receipt={inventory:[ticket,keep],historical:true},ended=restoreHuntSession({...claimed,ended:true,receipt});assert.deepEqual(ended.finish(3),receipt);
});
