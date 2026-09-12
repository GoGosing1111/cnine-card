import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {jointFixture} from './helpers/joint-db.mjs';
import {cowPortalRate,discoverCowPortal,discoverCowPortalReady,cowPortalStatus} from '../functions/_cow_room_portal.js';
import {runExpeditionV3} from '../functions/_expedition_v3_runs.js';
import {handlePveV3,handlePveV3Ready} from '../functions/_pve_v3_routes.js';
const origin='https://game.example';
const event=(ref,sourceType='HUNT',isApocalypse=false,result='WIN')=>({sourceRef:ref,sourceType,isApocalypse,result});
const read=file=>fs.readFileSync(new URL('../'+file,import.meta.url),'utf8');
const clean=f=>f.p('DELETE FROM cow_room_portal_rolls_v1').run();
const grant=(f,ref,roll=0,source='HUNT',apocalypse=false,result='WIN')=>discoverCowPortalReady(f.env,f.user,event(ref,source,apocalypse,result),{randomInt:()=>roll});

test('joint hold blocks discovery and portal inspection before touching the database',async()=>{
  const env={get DB(){throw Error('DB must not be touched');}};
  assert.equal(await discoverCowPortal(env,{id:7},event('held')),null);
  const response=await handlePveV3({path:'cow-room/v3/portals',request:new Request(origin+'/api/cow-room/v3/portals'),env,deps:{json:(b,s)=>Response.json(b,{status:s}),authenticate(){throw Error('must not authenticate');}}});
  assert.equal(response.status,423);
  assert.equal(cowPortalRate({isApocalypse:false}),2);assert.equal(cowPortalRate({isApocalypse:true}),3);
});

for(const postgres of[false,true]){
  const backend=postgres?'PostgreSQL':'SQLite';
  test(`${backend}: exact 2%/3% boundaries, completed losses, individual sweep rolls and replay protection`,async t=>{
    const f=await jointFixture(t,{postgres});await clean(f);
    for(const [ref,roll,source,apocalypse,hit] of[
      ['normal-hit',19999,'HUNT',false,true],['normal-miss',20000,'HUNT',false,false],
      ['apocalypse-hit',29999,'HUNT',true,true],['apocalypse-miss',30000,'HUNT',true,false],
      ['sweep:1',0,'SWEEP',false,true],['sweep:2',999999,'SWEEP',false,false],['sweep:3',19999,'SWEEP',false,true]
    ])assert.equal(Boolean(await grant(f,ref,roll,source,apocalypse)),hit,ref);
    assert.ok(await grant(f,'completed-loss',0,'HUNT',false,'LOSE'));
    assert.equal(await grant(f,'apocalypse-sweep',0,'SWEEP',true),null);
    assert.equal(await discoverCowPortalReady(f.env,f.user,event('normal-miss'),{randomInt(){throw Error('No reroll');}}),null);
    const first=await grant(f,'normal-hit',999999);assert.ok(first);
    assert.equal((await cowPortalStatus(f.env,f.user)).available,5);
    assert.equal((await cowPortalStatus(f.env,{id:8})).available,0);
    assert.equal(Number((await f.p('SELECT COUNT(*) n FROM cow_room_portal_rolls_v1').first()).n),8);
    await assert.rejects(()=>discoverCowPortalReady(f.env,f.user,event('forged','PVP')),{code:'PVE_V3_PORTAL_EVENT'});
    await assert.rejects(()=>discoverCowPortalReady(f.env,f.user,event('unfinished','HUNT',false,'RUNNING')),{code:'PVE_V3_PORTAL_EVENT'});
    await assert.rejects(()=>grant(f,'invalid-rng',1000000),{code:'PVE_V3_PORTAL_RANDOM'});
  });
  test(`${backend}: no portal means no entry, atomic admission spends one and replay spends none`,async t=>{
    const f=await jointFixture(t,{postgres});await clean(f);
    const body={requestId:'portal-entry-once',difficulty:'PASTURE'};
    await assert.rejects(()=>runExpeditionV3(f.env,f.user,'COW_ROOM',body,f.deps),{code:'PVE_V3_PORTAL_REQUIRED'});
    assert.equal(await f.coin(),10000000);
    const portal=await grant(f,'one-open');
    const response=await runExpeditionV3(f.env,f.user,'COW_ROOM',body,f.deps);assert.equal(response.portalId,portal.id);
    assert.equal((await cowPortalStatus(f.env,f.user)).available,0);
    const balance=await f.coin();assert.equal((await runExpeditionV3(f.env,f.user,'COW_ROOM',body,f.deps)).replayed,true);assert.equal(await f.coin(),balance);
    assert.equal(await grant(f,'one-open'),null,'consumed discovery cannot re-open');
    await assert.rejects(()=>runExpeditionV3(f.env,f.user,'COW_ROOM',{...body,requestId:'no-second-portal'},f.deps),{code:'PVE_V3_PORTAL_REQUIRED'});
    assert.equal(Number((await f.p("SELECT COUNT(*) n FROM cow_room_portal_rolls_v1 WHERE state='CONSUMED'").first()).n),1);
  });
  test(`${backend}: entry rollback restores portal; saved settlement recovers without a second portal`,async t=>{
    const f=await jointFixture(t,{postgres});await clean(f);await grant(f,'rollback-portal');
    const body={requestId:'portal-rollback-run',difficulty:'PASTURE'};
    f.fail('INSERT INTO coin_logs');await assert.rejects(()=>runExpeditionV3(f.env,f.user,'COW_ROOM',body,f.deps),{code:'PVE_V3_ENTRY_CONFLICT'});
    assert.equal(await f.coin(),10000000);assert.equal((await cowPortalStatus(f.env,f.user)).available,1);
    assert.equal(Number((await f.p('SELECT COUNT(*) n FROM expedition_v3_runs_v1').first()).n),0);
    f.fail('INSERT INTO expedition_v3_progress_v1');await assert.rejects(()=>runExpeditionV3(f.env,f.user,'COW_ROOM',body,f.deps),{code:'PVE_V3_RESULT_PENDING'});
    assert.equal(await f.coin(),9750000);assert.equal((await cowPortalStatus(f.env,f.user)).available,0);
    f.fail('');assert.equal((await runExpeditionV3(f.env,f.user,'COW_ROOM',body,f.deps)).status,'COMPLETED');
    assert.equal(await f.coin(),11750000);
  });
  test(`${backend}: authenticated concurrent entry cannot use one portal twice or another account's portal`,async t=>{
    const f=await jointFixture(t,{postgres});await clean(f);await grant(f,'concurrent-portal');
    const run=(id,user=7)=>handlePveV3Ready({path:'cow-room/v3/run',env:f.env,deps:f.deps,request:new Request(origin+'/api/cow-room/v3/run',{method:'POST',headers:{authorization:`Bearer local-account-${user}`,'content-type':'application/json',origin},body:JSON.stringify({requestId:id,difficulty:'PASTURE'})})});
    assert.equal((await run('foreign-request',8)).status,409);
    const responses=await Promise.all([run('concurrent-a'),run('concurrent-b')]);
    assert.deepEqual(responses.map(r=>r.status).sort(),[200,409]);
    assert.equal(Number((await f.p('SELECT COUNT(*) n FROM expedition_v3_runs_v1').first()).n),1);
  });
}

test('sweep result aggregation retains every unique portal and both real result paths await the prompt',()=>{
  const source=read('js/app.js'),start=source.indexOf('function pveSweepFirstResult('),end=source.indexOf('function pveSweepLootRows(',start);
  const context=vm.createContext({});vm.runInContext(source.slice(start,end),context);
  const a={id:'a',state:'OPEN'},b={id:'b',state:'OPEN'};
  const first=context.pveSweepFirstResult({result:'WIN',cowPortal:a});
  const merged=context.mergePveSweepResults(first,{battles:2,wins:2,cowPortals:[a,b]});
  assert.equal(JSON.stringify(merged.cowPortals),JSON.stringify([a,b]));
  assert.ok(source.includes('await window.CowRoomPortal?.offer(summary.cowPortals)'));
  assert.ok(read('js/battle-v2-live.js').includes('await window.CowRoomPortal?.offer([data.cowPortal])'));
  const api=read('functions/api/[[path]].js');
  assert.ok(api.includes("sourceType:'HUNT',sourceRef:requestId,isApocalypse:difficulty.isApocalypse,result"));
  assert.ok(api.includes("sourceType:'SWEEP',sourceRef:dropRequestId,isApocalypse:difficulty.isApocalypse,result"));
  assert.ok(api.includes('if(one.cowPortal)cowPortals.push(one.cowPortal)'));
  assert.ok(read('index.html').includes('cowPortal=20260913'));
});
