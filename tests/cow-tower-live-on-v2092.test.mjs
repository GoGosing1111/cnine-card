import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {jointFixture} from './helpers/joint-db.mjs';
import {handlePveV3} from '../functions/_pve_v3_routes.js';
import {readExpeditionPolicy} from '../functions/_expedition_v3_settings.js';
import {discoverCowPortal,cowPortalStatus} from '../functions/_cow_room_portal.js';
import {v3JointReleaseState} from '../shared/v3-joint-release-v1.mjs';
import {TOWER_LIVE_URL} from '../shared/pve-public-release-v2092.mjs';
const origin='https://game.example';
const request=(path,body,method)=>new Request(origin+'/api/'+path,{method:method||(body?'POST':'GET'),headers:{authorization:'Bearer local-account-7',origin,'content-type':'application/json'},...(body?{body:JSON.stringify(body)}:{})});
const read=file=>fs.readFileSync(new URL('../'+file,import.meta.url),'utf8');
test('public release retires the old cow portal and opens legacy tower while new tower economy and other launches stay held',async()=>{
 const state=v3JointReleaseState();assert.equal(state.enabled,false);assert.equal(state.publicContent.COW_ROOM.enabled,false);assert.equal(state.publicContent.TOWER.policy,'LEGACY');assert.equal(state.publicContent.TOWER.reAscentEnabled,false);assert.equal(state.connections.TOWER.run,'tower/start');assert.equal(state.connections.TOWER.url,TOWER_LIVE_URL);
 const deps={json:(b,s=200)=>Response.json(b,{status:s}),authenticate:async()=>null},env={get DB(){throw Error('No anonymous DB access');}};
 for(const path of ['scrapyard/v3/state','scrapyard/v3/run'])assert.equal((await handlePveV3({path,request:request(path),env,deps})).status,401);
 assert.equal((await handlePveV3({path:'tower/v3/run',request:request('tower/v3/run'),env,deps})).status,423);
 for(const path of ['cow-room/v3/state','cow-room/v3/run','cow-room/v3/portals'])assert.equal((await handlePveV3({path,request:request(path),env,deps})).status,410);
 const retired=await handlePveV3({path:'idle-dungeon/v3/run',request:request('idle-dungeon/v3/run'),env,deps});
 assert.equal(retired.status,410);assert.equal((await retired.json()).code,'IDLE_DUNGEON_RETIRED');
 assert.match(read('pve-v3/entry.mjs'),/location.replace\(TOWER_LIVE_URL\)/);
});
test('completed weekly tower shows the next Monday reset without an immediate fight',()=>{
 const source=read('js/tower-v1038.js'),start=source.indexOf('  function render(){'),end=source.indexOf('  function lockBattleFocus',start),body={innerHTML:''},box={innerHTML:'',classList:{add(){}},querySelector:()=>body};
 const S={data:{active:true,completed:true,maxFloor:70,floor:null,progress:{currentFloor:71,highestFloor:70,completed:true}}};
 const root={};vm.runInNewContext(read('js/tower-abyss-ui.js'),{window:root});
 const context=vm.createContext({S,document:{getElementById:()=>box},currentDeckCards:()=>[],currentPower:()=>0,user:()=>({serverUserId:7}),ui:()=>root.TowerAbyssUI});
 const helpers=['currentUserId','autoNextEnabled'].map(name=>source.split('\n').find(line=>line.trim().startsWith('function '+name+'('))).join('\n');
 vm.runInContext(helpers+'\n'+source.slice(start,end)+'\nrender();',context);
 assert.match(body.innerHTML,/현재 열린 모든 문을 돌파했습니다/);assert.match(body.innerHTML,/월요일 0시\(한국시간\)부터 다시 등반/);assert.doesNotMatch(body.innerHTML,/아직 열리지|data-abyss-action="(?:fight|restart|reascend)"/);
 assert.match(source,/playTowerBattleV3Live/);assert.match(source,/apiRequest\('tower\/start'/);
});
for(const postgres of [false,true]){
 test(`${postgres?'PostgreSQL':'SQLite'}: ordinary user scrapyard admission is free and recovers the same receipt`,async t=>{
  const f=await jointFixture(t,{postgres}),deps={...f.deps,authenticate:async()=>({...f.user,role:'USER'})};
  const body={requestId:'public-scrapyard-once',difficulty:'OUTER'},call=()=>handlePveV3({path:'scrapyard/v3/run',request:request('scrapyard/v3/run',body),env:f.env,deps});
  const first=await call();assert.equal(first.status,200,await first.clone().text());const result=await first.json();assert.equal(result.success,true);
  const balance=await f.coin();assert.equal((await(await call()).json()).replayed,true);assert.equal(await f.coin(),balance);
  assert.equal(Number((await f.p("SELECT quantity FROM cnine_user_inventory WHERE user_id=7 AND item_code='SCRAPYARD_ENTRY_TICKET'").first()).quantity),5);
  assert.doesNotMatch(read('js/workshop-v1881.js'),/PveV3Runtime\?\.tryOpen\('scrapyard'\)/);
 });
 test(`${postgres?'PostgreSQL':'SQLite'}: owner settings cannot reopen the retired cow-room routes`,async t=>{
  const f=await jointFixture(t,{postgres}),policy=await readExpeditionPolicy(f.env,'COW_ROOM'),before=await f.coin();
  const path='admin/pve-v3',body={content:'COW_ROOM',revision:policy.revision,economy:{...policy,mode:'ON'}};
  assert.equal((await handlePveV3({path,request:request(path,body,'PATCH'),env:f.env,deps:f.deps})).status,400);
  for(const route of ['cow-room/v3/state','cow-room/v3/portals','cow-room/v3/run','cow-room/v3/result']){
    const reply=await handlePveV3({path:route,request:request(route),env:f.env,deps:f.deps});
    assert.equal(reply.status,410);assert.equal((await reply.json()).code,'COW_PVE_RETIRED');
  }
  assert.equal(await f.coin(),before);assert.deepEqual(await readExpeditionPolicy(f.env,'COW_ROOM'),policy);
 });
}
