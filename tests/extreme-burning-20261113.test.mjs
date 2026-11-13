import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {martialFixture,martialOwner as owner} from './helpers/martial-law-fixture.mjs';
import {citadelFixture} from './helpers/legion-citadel-fixture.mjs';
import {handleExtremeBurning} from '../functions/_extreme_burning.js';
import * as access from '../functions/_burning_event_access.js';
import * as miracle from '../functions/_miracle_burning.js';
import {EXTREME_BURNING_META_KEY as key,EXTREME_PULSE_KEY as pulseKey} from '../shared/extreme-burning-v1.mjs';
import {legionHuntEntries,restoreExtremeLegionEnergy} from '../functions/_legion_hunt.js';
import {resolveAvatarDropRate,withAvatarDropScope} from '../functions/_avatar_drop.js';
import {personalFarm} from '../functions/_legion_citadel_loot.js';

const api=readFileSync(new URL('../functions/api/[[path]].js',import.meta.url),'utf8');
const now=Date.parse('2026-11-13T03:00:00+09:00');
const draft=(revision=0,enabled=true)=>({revision,enabled,durationMinutes:1440,battleRewardMultiplier:1000,requestId:crypto.randomUUID()});
const meta=async(f,k)=>JSON.parse((await f.DB.prepare('SELECT value FROM app_meta WHERE key=?').bind(k).first())?.value||'null');
const put=(f,k,value)=>f.DB.prepare('INSERT INTO app_meta(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value').bind(k,JSON.stringify(value)).run();
const request=(f,user,body,method=body?'PATCH':'GET')=>handleExtremeBurning({request:{method},env:f.env,deps:{
  authenticate:async()=>user,readBody:async()=>body,json:(body,status=200)=>({body,status}),invalidate(){},now:()=>f.now
}});
const runtime=()=>vm.runInNewContext(api.slice(api.indexOf('const BURNING_EVENT_META_KEY='),api.indexOf('function defaultPvpSettings()'))+
  ';({burningEventPair,burningPublicState,applyBurningPveSettings,burningRewardAmount,activateChiefBurningEvent})',{...access,...miracle,console});

for(const postgres of [false,true]){
  const engine=postgres?'PostgreSQL':'SQLite';
  test(engine+' checks operator, time and multiplier, replays a single activation and expires exactly',async t=>{
    const f=await martialFixture({postgres});t.after(()=>f.close());f.now=now;
    for(const user of [null,{...owner,id:2},{...owner,role:'USER'},{...owner,nickname:'다른 계정'}]){
      for(const b of [undefined,draft()])assert.equal((await request(f,user,b)).status,user?403:401);
    }
    assert.equal((await request(f,owner)).body.settings.enabled,false);
    for(const field of [{battleRewardMultiplier:1001},{battleRewardMultiplier:0},{durationMinutes:1441},{durationMinutes:0},{enabled:'true'}])
      assert.equal((await request(f,owner,{...draft(),...field})).status,400);
    await put(f,miracle.MIRACLE_BURNING_META_KEY,{enabled:true});
    const start=draft();f.failAudit();await assert.rejects(request(f,owner,start));
    assert.equal(await meta(f,pulseKey),null);assert.equal(await meta(f,key),null);assert.equal((await meta(f,miracle.MIRACLE_BURNING_META_KEY)).enabled,true);
    f.loseResponse();assert.equal((await request(f,owner,start)).body.replayed,true);
    const on=(await request(f,owner,start)).body.settings;
    assert.equal(on.battleRewardMultiplier,1000);assert.equal(on.generation,1);assert.equal(Date.parse(on.endsAt)-now,86400000);
    assert.equal((await meta(f,miracle.MIRACLE_BURNING_META_KEY)).enabled,false);assert.deepEqual(await meta(f,pulseKey),[{generation:1,at:now}]);
    assert.equal((await request(f,owner,{...start,battleRewardMultiplier:1})).status,409);
    f.now=now+86400000-1;assert.equal((await request(f,owner)).body.settings.enabled,true);
    f.now++;assert.equal((await request(f,owner)).body.settings.enabled,false);
    const stop=await request(f,owner,draft(1,false));assert.equal(stop.body.settings.generation,1);
    const replay=(await request(f,owner,start)).body;assert.equal(replay.replayed,true);assert.equal(replay.settings.enabled,false);assert.equal(replay.settings.revision,2);
    assert.equal(Number((await f.p('SELECT COUNT(*) n FROM admin_logs').first()).n),2);
  });
  test(engine+' simultaneous starts and a stale cross-mode save cannot issue a second recovery',async t=>{
    const f=await martialFixture({postgres});t.after(()=>f.close());
    const race=await Promise.all([request(f,owner,draft()),request(f,owner,draft())]);
    assert.deepEqual(race.map(r=>r.status).sort(),[200,409]);
    assert.equal((await meta(f,pulseKey)).length,1);
    const stale=[[key,null]];
    assert.equal(await access.commitBurningChange(f.DB,stale,[f.p('INSERT INTO app_meta(key,value) VALUES(?,?)','hyper_burning_event_settings_v1310','{"enabled":true}')]),false);
    assert.equal(await meta(f,'hyper_burning_event_settings_v1310'),null);
  });
  test(engine+' actual party and solo lobbies restore offline balances once, including equal-time party admissions',async t=>{
    const f=await citadelFixture({postgres});t.after(()=>f.close());
    const ts=f.clock.now,solo='legion_hunt_owner_session_v1:2',party='legion_citadel_v1:next-entry:',gen='legion_citadel_v1:entry-generation:';
    f.setUser(f.player);
    await put(f,solo,{energy:{version:1,maximum:10,current:2,updatedAt:ts}});
    for(const i of [1,2])await put(f,party+i,ts+6*3600000);
    assert.ok((await f.action(2,'lobby')).body.nextEntryAt>ts);
    await put(f,pulseKey,[{generation:1,at:ts}]);
    for(const i of [1,2])assert.equal((await f.action(i,'lobby')).body.nextEntryAt,null);
    for(let i=0;i<2;i++)assert.equal((await f.call('legion-hunt/bootstrap')).body.entries.current,3);
    const go=async(uid,a,b)=>{const res=await f.action(uid,a,b);assert.equal(res.status,200,JSON.stringify(res.body));return res.body.state;};
    const {id}=await go(1,'create',{requestId:'extreme-party-entry',tier:'gate'});
    await go(2,'join',{id});for(const i of [1,2])await go(i,'ready',{id,...f.selection(i-1)});
    await go(1,'start',{id});await go(1,'loaded',{id});await go(2,'loaded',{id});
    for(const i of [1,2]){
      assert.equal(await meta(f,gen+i),1);
      assert.ok((await f.action(i,'lobby')).body.nextEntryAt>ts);
    }
    assert.equal((await f.call('legion-hunt/bootstrap')).body.entries.current,3);
    await put(f,pulseKey,[{generation:1,at:ts},{generation:2,at:ts}]);
    const lobby=(await f.action(2,'lobby')).body;assert.equal(lobby.nextEntryAt,null);assert.equal(lobby.state.nextEntryAt,null);
    assert.equal((await f.call('legion-hunt/bootstrap')).body.entries.current,4);
  });
}
test('reward multiplier and relative item probability reach their actual caps, and only the named events affect energy',async t=>{
  const f=await martialFixture();t.after(()=>f.close());f.now=Date.now()-10;
  await request(f,owner,draft());
  const rt=runtime(),pair=await rt.burningEventPair(f.env,{fresh:true});
  assert.equal(rt.burningPublicState(pair.active).mode,'EXTREME');assert.equal(rt.burningRewardAmount(25,pair.active),25000);
  const base={energy:{maxEnergy:5,rechargeMinutes:5}};
  assert.equal(rt.applyBurningPveSettings(base,pair.active).energy,base.energy);
  await assert.rejects(rt.activateChiefBurningEvent(f.env,{type:'HYPER'}),/익스트림/);
  assert.equal(await miracle.readMiracleDropPercent(f.env),100);
  const scoped=withAvatarDropScope(f.env);
  for(const [chance,result] of [[0,0],[.125,.25],[10,20],[60,100],[100,100]])assert.equal((await resolveAvatarDropRate(scoped,1,chance)).total,result);
  const player={id:2,role:'USER'},support={active:true,startsAt:now-86400000,endsAt:now+86400000};
  for(const maximum of [10,13]){
    const svc=maximum===13?support:null,record={energy:{version:1,maximum,current:maximum-1,updatedAt:now-300000}},pulses=[{at:now,generation:1}];
    const full=restoreExtremeLegionEnergy(record,pulses,now,svc,player);
    assert.equal(legionHuntEntries(full,now,player,svc).current,maximum);
    const spent={...full,energy:{...full.energy,current:maximum-1}};
    assert.equal(restoreExtremeLegionEnergy(spent,pulses,now+20,svc,player),spent);
  }
  const pool={goods:[{type:'INVENTORY_ITEM',ref:'a',quantity:4}],armory:[],itemMultiplier:1,rates:{normalPercent:20,elitePercent:20,bossPercent:20,bossMultiplier:1}};
  assert.equal(personalFarm(pool,[[3000,0]],true,()=>.3).events.length,0);
  const rolls=personalFarm({...pool,supplyDropMultiplier:2},[[3000,0]],true,()=>.3);assert.equal(rolls.events[0][2],4);
  await request(f,owner,draft(1,false));assert.equal(await miracle.readMiracleDropPercent(f.env),0);
});
