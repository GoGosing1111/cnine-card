import test from 'node:test';
import assert from 'node:assert/strict';
import {legionFixture} from './helpers/legion-hunt-fixture.mjs';
import {seedRegionalCatalog} from './helpers/legion-regions-fixture.mjs';
import {restoreHuntSession} from '../preview/sustained-hunt-v2/session.mjs';
import {LEGION_COIN_CAPS,createLegionCoins,legionCoinTotal} from '../shared/legion-hunt-coins-v1.mjs';
import {legionRegionDefaults} from '../shared/legion-regions-v1.mjs';
import {emptySupport,supportKey} from '../shared/server-support-v1.mjs';

const runKey=id=>'legion_hunt_owner_session_v1:'+id;
const read=async(f,id=2)=>JSON.parse((await f.DB.prepare('SELECT value FROM app_meta WHERE key=?').bind(runKey(id)).first()).value);
const write=async(f,run,id=2)=>f.DB.prepare('UPDATE app_meta SET value=? WHERE key=?').bind(JSON.stringify(run),runKey(id)).run();
const wallet=async(f,id=2)=>Number((await f.DB.prepare('SELECT coin FROM users WHERE id=?').bind(id).first()).coin);
const balanceLogs=async f=>Number((await f.DB.prepare('SELECT COALESCE(SUM(change_amount),0) amount FROM coin_logs').first()).amount);
const put=async(f,key,value)=>f.DB.prepare('INSERT INTO app_meta(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value').bind(key,JSON.stringify(value)).run();
async function fixture(postgres){
  const f=await legionFixture({postgres});
  f.clock.now=Date.parse('2026-10-18T12:00:00+09:00');
  f.events=[{seq:1,combatAtMs:100,huntKill:true},{seq:2,combatAtMs:200,huntKill:true,elite:true},{seq:3,combatAtMs:300,huntKill:true,boss:true},{seq:4,combatAtMs:400,type:'RESULT',winner:'A',reason:'ALL_KO'}];
  f.deps.createSession=options=>Object.assign(restoreHuntSession({id:crypto.randomUUID(),policy:{id:options.difficulty,huntDurationMs:1000,regionId:options.regionId,...options.dropPolicy},timeLimit:420000,eventTimes:f.events.map(e=>e.combatAtMs),timeline:f.events,outcome:{winner:'A',reason:'ALL_KO'}},{now:options.now}),{payload:{}});
  const response=await f.call('admin/legion-hunt');response.body.policy.mode='ON';
  response.body.policy.items=[];response.body.policy.difficulties.forEach(d=>{d.dropPercent=0;d.bossDropPercent=0;});
  assert.equal((await f.call('admin/legion-hunt',{policy:response.body.policy},{method:'PATCH'})).status,200);
  f.setUser(f.player);return f;
}
async function start(f,options={}){
  const r=await f.call('legion-hunt/start',{difficulty:'normal',...options});assert.equal(r.status,200,JSON.stringify(r.body));
  const begun=await f.call('legion-hunt/begin',{id:r.body.id});assert.equal(begun.status,200,JSON.stringify(begun.body));return r.body.id;
}
async function liveMode(f,mode){const p=JSON.parse((await f.DB.prepare('SELECT value FROM app_meta WHERE key=?').bind('legion_hunt_settings_v1').first()).value);p.mode=mode;await put(f,'legion_hunt_settings_v1',p);}

test('all approved map/difficulty caps, calamity 2x inferno, exact floor and bonuses never enlarge caps',()=>{
  assert.deepEqual(Object.values(LEGION_COIN_CAPS.island),[1e9,2e9,3e9,5e9]);
  for(const region of [null,'coast','desert','theatre','viscera','sky'])for(const difficulty of Object.keys(LEGION_COIN_CAPS[region?'regions':'island'])){
    const base=createLegionCoins(region,difficulty,{live:true});
    assert.equal(legionCoinTotal(base,base.referenceUnits),base.cap);
    assert.equal(legionCoinTotal(base,base.referenceUnits*10),base.cap);
    const bonus=createLegionCoins(region,difficulty,{bonusPercent:123.45});
    assert.equal(legionCoinTotal(bonus,base.referenceUnits),base.cap);
    assert.equal(legionCoinTotal(base,1),Math.floor(base.cap/base.referenceUnits));
  }
  assert.equal(LEGION_COIN_CAPS.regions.calamity,LEGION_COIN_CAPS.regions.inferno*2);
  const martial=createLegionCoins(null,'normal',{martialLaw:true});assert.equal(legionCoinTotal(martial,martial.referenceUnits),900_000_000);
});

for(const postgres of [false,true]){
  const dialect=postgres?'PostgreSQL':'SQLite';
  test(dialect+': first kill pays without item drops; weighted batches, replay and finish never double-pay',async()=>{
    const f=await fixture(postgres);try{
      const id=await start(f);assert.equal(await wallet(f),0);
      assert.equal((await f.call('legion-hunt/reveal',{id,seqs:[3]})).status,409,'unreached server KO is rejected');
      assert.equal((await f.call('legion-hunt/reveal',{id,seqs:[1],coinDelta:1e9})).status,400,'client money rejected');
      f.clock.now+=1000;f.resetQueries();
      const first=await f.call('legion-hunt/reveal',{id,seqs:[1]});assert.equal(first.status,200,JSON.stringify(first.body));
      assert.equal(first.body.earnedCoins,Math.floor(1e9/653));assert.equal(first.body.drops.filter(Boolean).length,0);
      assert.equal(await wallet(f),first.body.earnedCoins);assert.equal(await balanceLogs(f),first.body.earnedCoins);
      assert.ok(!f.queries.some(q=>/FROM (?:inventory_items|user_cards)/.test(q)),'coin batch does not load inventories');
      const duplicate=await f.call('legion-hunt/reveal',{id,seqs:[1]});assert.equal(duplicate.body.coinDelta,0);
      const next=await f.call('legion-hunt/reveal',{id,seqs:[1,2,3]});assert.equal(next.status,200,JSON.stringify(next.body));
      assert.equal(next.body.earnedCoins,Math.floor(1e9*9/653));
      const finished=await f.call('legion-hunt/finish',{id,seq:4});assert.equal(finished.status,200,JSON.stringify(finished.body));
      assert.equal(finished.body.earnedCoins,next.body.earnedCoins);assert.equal(finished.body.coinDelta,0);
      assert.equal((await f.call('legion-hunt/finish',{id,seq:4})).body.earnedCoins,next.body.earnedCoins);
      assert.equal(await wallet(f),next.body.earnedCoins);assert.equal(await balanceLogs(f),next.body.earnedCoins);
    }finally{await f.close();}
  });
  test(dialect+': wallet/log/session roll back together; lost response retry and CAS race pay once',async()=>{
    const f=await fixture(postgres);try{
      const id=await start(f);f.clock.now+=1000;const original=await read(f);
      f.fail('INSERT INTO coin_logs');assert.equal((await f.call('legion-hunt/reveal',{id,seqs:[1]})).status,503);f.fail('');
      assert.equal(await wallet(f),0);assert.deepEqual(await read(f),original);assert.equal(await balanceLogs(f),0);
      f.loseReply();assert.equal((await f.call('legion-hunt/reveal',{id,seqs:[1]})).status,503);
      assert.equal((await f.call('legion-hunt/reveal',{id,seqs:[1]})).body.coinDelta,0);
      const answers=await Promise.all([f.call('legion-hunt/reveal',{id,seqs:[2]}),f.call('legion-hunt/reveal',{id,seqs:[2]})]);
      assert.ok(answers.some(r=>r.status===200));
      assert.equal(await wallet(f),Math.floor(1e9*4/653));assert.equal(await balanceLogs(f),await wallet(f));
      assert.equal((await f.call('legion-hunt/reveal',{id,seqs:[2]})).body.coinDelta,0);
    }finally{await f.close();}
  });
  test(dialect+': paid retreat/disconnect consumes entries and keeps coins; zero-kill interruption refunds once',async()=>{
    const f=await fixture(postgres);try{
      const id=await start(f);f.clock.now+=1000;await f.call('legion-hunt/reveal',{id,seqs:[1]});const paid=await wallet(f);
      const cancel=await f.call('legion-hunt/cancel',{id});assert.equal(cancel.body.recovery.refunded,false);assert.equal(cancel.body.entries.used,1);
      assert.equal((await read(f)).coinDaily.used,1);assert.equal(await wallet(f),paid);
      assert.equal((await f.call('legion-hunt/finish',{id,seq:3})).status,409);
      const empty=await start(f);assert.equal((await f.call('legion-hunt/cancel',{id:empty})).body.entries.used,1);
      assert.equal((await read(f)).coinDaily.used,1);assert.equal((await f.call('legion-hunt/cancel',{id:empty})).body.entries.used,1);
      const retreat=await start(f);f.clock.now+=1000;const result=await f.call('legion-hunt/finish',{id:retreat,seq:2});
      assert.equal(result.body.reason,'RETREAT');assert.equal(result.body.earnedCoins,Math.floor(1e9*4/653));
      assert.equal(await wallet(f),paid+result.body.earnedCoins);assert.equal((await read(f)).daily.used,2);
    }finally{await f.close();}
  });
  test(dialect+': TEST/legacy do not pay; live OFF pauses uncredited kills; OWNER has finite coin runs',async()=>{
    const f=await fixture(postgres);try{
      f.setUser(f.owner);await liveMode(f,'TEST');const testId=await start(f);f.clock.now+=1000;
      await liveMode(f,'ON');assert.equal((await f.call('legion-hunt/reveal',{id:testId,seqs:[1]})).body.earnedCoins,0);assert.equal(await wallet(f,1),0);
      const id=await start(f);f.clock.now+=1000;await liveMode(f,'TEST');
      assert.equal((await f.call('legion-hunt/reveal',{id,seqs:[1]})).status,423);assert.equal(await wallet(f,1),0);
      await liveMode(f,'ON');assert.equal((await f.call('legion-hunt/reveal',{id,seqs:[1]})).status,200);
      let run=await read(f,1);run.coinDaily.used=10;await write(f,run,1);
      const limited=await start(f);f.clock.now+=1000;const limitedKill=await f.call('legion-hunt/reveal',{id:limited,seqs:[1]});
      assert.equal(limitedKill.body.coinEligible,false);assert.equal(limitedKill.body.earnedCoins,0);assert.equal((await read(f,1)).coinDaily.used,10);
      f.setUser(f.player);const legacy=await start(f);run=await read(f);delete run.coins;await write(f,run);f.clock.now+=1000;
      assert.equal((await f.call('legion-hunt/reveal',{id:legacy,seqs:[1]})).body.earnedCoins,0);assert.equal(await wallet(f),0);
    }finally{await f.close();}
  });
  test(dialect+': regional 300억 is exact, bonuses cap at 300억, all region gates remain authoritative',async()=>{
    const f=await fixture(postgres);try{
      await seedRegionalCatalog(f);
      const regions=legionRegionDefaults();regions.mode='OFF';await put(f,'legion_hunt_regions_v1',regions);
      assert.notEqual((await f.call('legion-hunt/start',{version:5,regionId:'sky',difficulty:'calamity'})).status,200);
      regions.mode='ON';await put(f,'legion_hunt_regions_v1',regions);
      f.events=Array.from({length:800},(_,i)=>({seq:i+1,combatAtMs:i+1,huntKill:true}));
      const id=await start(f,{version:5,regionId:'sky',difficulty:'calamity'});f.clock.now+=1000;
      const run=await read(f);run.coins.multiplier=250000;await write(f,run);
      regions.regions.find(r=>r.id==='sky').enabled=false;await put(f,'legion_hunt_regions_v1',regions);
      assert.equal((await f.call('legion-hunt/reveal',{id,seqs:[800]})).status,423);assert.equal(await wallet(f),0);
      regions.regions.find(r=>r.id==='sky').enabled=true;await put(f,'legion_hunt_regions_v1',regions);
      const r=await f.call('legion-hunt/reveal',{id,seqs:[800]});assert.equal(r.status,200,JSON.stringify(r.body));
      assert.equal(r.body.earnedCoins,30_000_000_000);assert.equal(await wallet(f),30_000_000_000);
      assert.equal((await f.call('legion-hunt/reveal',{id,seqs:[800]})).body.coinDelta,0);assert.equal(await balanceLogs(f),30_000_000_000);
      assert.equal((await read(f)).coinDaily.used,1);
    }finally{await f.close();}
  });
  test(dialect+': supporter 13-run coin quota is reserved once, survives disconnect and resets at KST midnight',async()=>{
    const f=await fixture(postgres);try{
      f.setUser(f.owner);
      await put(f,supportKey(1),{...emptySupport(),revision:1,startsAt:f.clock.now-1000,endsAt:f.clock.now+3*86400000});
      const id=await start(f);let run=await read(f,1);run.coinDaily.used=13;await write(f,run,1);
      assert.equal((await f.call('legion-hunt/begin',{id})).body.coinEligible,true,'repeated begin preserves reserved eligibility');
      assert.equal((await read(f,1)).coinDaily.used,13);f.clock.now+=1000;
      await f.call('legion-hunt/reveal',{id,seqs:[1]});await f.call('legion-hunt/recover',{});
      assert.equal((await read(f,1)).coinDaily.used,13);
      const extra=await start(f);f.clock.now+=1000;assert.equal((await f.call('legion-hunt/reveal',{id:extra,seqs:[1]})).body.coinEligible,false);
      f.clock.now=Date.parse('2026-10-19T00:00:01+09:00');
      const fresh=await start(f);assert.equal((await read(f,1)).coinDaily.used,1);f.clock.now+=1000;
      assert.ok((await f.call('legion-hunt/reveal',{id:fresh,seqs:[1]})).body.coinDelta>0);
    }finally{await f.close();}
  });
}
