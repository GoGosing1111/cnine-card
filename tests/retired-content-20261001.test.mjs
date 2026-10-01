import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {onRequest} from '../functions/api/[[path]].js';
import {retiredContentResponse} from '../functions/_retired_content.js';
import {handleIdleDungeon} from '../functions/_idle_dungeon.js';
import {handleIdleV3Ready} from '../functions/_idle_v3_routes.js';
import {handlePveV3,handlePveV3Ready} from '../functions/_pve_v3_routes.js';
import {claimIdleV3} from '../functions/_idle_v3_claim.js';
import {accountRankIdleSettlement} from '../functions/_account_rank.js';
const read=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');
const json=(body,status=200)=>Response.json(body,{status});
const forbidden=new Proxy({},{get(){throw Error('retired request touched DB/auth/runtime');}});
const deps={json,authenticate(){throw Error('must not authenticate');}};

test('actual public API rejects legacy, V3 and admin endpoints before forwarding or opening a DB',async()=>{
  for(const path of ['administration/treasury/state','administration/treasury/proposals','administration/treasury/decision',
    'idle-dungeon','idle-dungeon/status','idle-dungeon/start','idle-dungeon/heartbeat','idle-dungeon/stop','idle-dungeon/claim',
    'idle-dungeon/v3/state','idle-dungeon/v3/start','idle-dungeon/v3/claim','admin/idle-dungeon']){
    for(const method of ['GET','POST','PATCH','OPTIONS']){
      const response=await onRequest({request:new Request('https://cnine-card.pages.dev/api/'+path,{method}),env:forbidden});
      assert.equal(response.status,410,path+' '+method);
      assert.equal(response.headers.get('cache-control'),'no-store');
      const body=await response.json();assert.equal(body.retired,true);assert.equal(body.enabled,false);
    }
  }
});

test('stale internal entry points cannot settle coins, XP, leases or receipts',async()=>{
  for(const handler of [handleIdleDungeon,handleIdleV3Ready,handlePveV3,handlePveV3Ready]){
    for(const path of ['idle-dungeon/status','idle-dungeon/v3/state','idle-dungeon/v3/claim','admin/idle-dungeon']){
      const result=await handler({path,request:new Request('https://local/api/'+path),env:forbidden,user:{id:7,role:'OWNER'},deps});
      assert.equal(result.status,410);assert.equal((await result.json()).code,'IDLE_DUNGEON_RETIRED');
    }
  }
  await assert.rejects(()=>claimIdleV3(forbidden,{id:7},{requestId:'stale'}),{code:'IDLE_DUNGEON_RETIRED',status:410});
  assert.deepEqual(await accountRankIdleSettlement(forbidden,7,{},{}),[]);
  for(const path of ['legion-hunt/bootstrap','scrapyard/v3/run','coin-prediction/state','administration/treasury-other','idle-dungeon-other'])assert.equal(retiredContentResponse(path,json),null,path);
});

test('PC/mobile navigation shares legion entry and excludes retired features/loaders',()=>{
  const context={console,document:{currentScript:null,readyState:'loading',documentElement:{dataset:{}},body:null,addEventListener(){},querySelector(){return null;},querySelectorAll(){return [];}},location:{search:''},URLSearchParams,setTimeout,clearTimeout,setInterval,clearInterval};
  context.window=context;context.globalThis=context;vm.createContext(context);
  vm.runInContext(read('js/soopketmon-v21-exact-shell-adapter.js'),context);
  vm.runInContext(read('js/soopketmon-v21-runtime-router.js'),context);
  const nav=context.SoopketmonV21NavigationContract;
  assert.ok(nav.groups.pve.routes.includes('legion'));
  assert.equal(nav.routes.legion.title,'군단토벌');
  assert.equal(nav.routes.idle,undefined);assert.equal(nav.routes.treasury,undefined);
  assert.ok(!Object.values(nav.groups).some(group=>group.routes.includes('idle')||group.routes.includes('treasury')));
  assert.match(read('js/soopketmon-v21-runtime-router.js'),/legion: \{ shell: 'battle', global: 'openLegionHunt'/);
  assert.match(read('js/legion-hunt-entry-v1.mjs'),/window\.openLegionHunt=openLegionHunt/);
  assert.doesNotMatch(read('index.html'),/idle-dungeon-v1600|idle-dungeon-v1603/);
  assert.doesNotMatch(read('admin/index.html'),/idle-dungeon-admin-v1600/);
  assert.doesNotMatch(read('pve-v3/index.html'),/data-content-link="idle-dungeon"/);
  assert.match(read('pve-v3/app.mjs'),/if\(nativeContent==='idle-dungeon'\)\{[\s\S]*?location\.replace\('\/\?screen=battle'\)/);
  assert.doesNotMatch(read('functions/_idle_dungeon.js'),/env\.DB|accountRankIdleSettlement/);
});
