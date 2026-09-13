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
test('public release opens cow and legacy tower while new tower economy and other launches stay held',async()=>{
 const state=v3JointReleaseState();assert.equal(state.enabled,false);assert.equal(state.publicContent.COW_ROOM.enabled,true);assert.equal(state.publicContent.TOWER.policy,'LEGACY');assert.equal(state.publicContent.TOWER.reAscentEnabled,false);assert.equal(state.connections.TOWER.run,'tower/fight');assert.equal(state.connections.TOWER.url,TOWER_LIVE_URL);
 const deps={json:(b,s=200)=>Response.json(b,{status:s}),authenticate:async()=>null},env={get DB(){throw Error('No anonymous DB access');}};
 for(const path of ['cow-room/v3/state','cow-room/v3/run','cow-room/v3/portals','scrapyard/v3/state','scrapyard/v3/run'])assert.equal((await handlePveV3({path,request:request(path),env,deps})).status,401);
 for(const path of ['tower/v3/run','idle-dungeon/v3/run'])assert.equal((await handlePveV3({path,request:request(path),env,deps})).status,423);
 assert.match(read('pve-v3/entry.mjs'),/location.replace\(TOWER_LIVE_URL\)/);
});
test('legacy tower completion wins over absent next floor and never offers re-ascent',()=>{
 const source=read('js/tower-v1038.js'),start=source.indexOf('  function render(){'),end=source.indexOf('  function syncTowerStartCopy',start),box={innerHTML:''};
 const S={data:{active:true,completed:true,maxFloor:70,floor:null,progress:{currentFloor:71,highestFloor:70,completed:true}}};
 const context=vm.createContext({S,document:{getElementById:()=>box},currentDeckCards:()=>[],battleState:{},esc:String});
 vm.runInContext(source.slice(start,end)+'\nrender();',context);
 assert.match(box.innerHTML,/최고층 등반 완료/);assert.doesNotMatch(box.innerHTML,/아직 설정되지|다시 등반|재등반/);
 assert.match(source,/playTowerBattleV3Live/);assert.match(source,/apiRequest\('tower\/fight'/);
});
for(const postgres of [false,true]){
 test(`${postgres?'PostgreSQL':'SQLite'}: ordinary user scrapyard admission uses one ticket and recovers the same receipt`,async t=>{
  const f=await jointFixture(t,{postgres}),deps={...f.deps,authenticate:async()=>({...f.user,role:'USER'})};
  const body={requestId:'public-scrapyard-once',difficulty:'OUTER'},call=()=>handlePveV3({path:'scrapyard/v3/run',request:request('scrapyard/v3/run',body),env:f.env,deps});
  const first=await call();assert.equal(first.status,200,await first.clone().text());const result=await first.json();assert.equal(result.success,true);
  const balance=await f.coin();assert.equal((await(await call()).json()).replayed,true);assert.equal(await f.coin(),balance);
  assert.equal(Number((await f.p("SELECT quantity FROM cnine_user_inventory WHERE user_id=7 AND item_code='SCRAPYARD_ENTRY_TICKET'").first()).quantity),4);
  assert.doesNotMatch(read('js/workshop-v1881.js'),/PveV3Runtime\?\.tryOpen\('scrapyard'\)/);
 });
 test(`${postgres?'PostgreSQL':'SQLite'}: OWNER enables cow, ordinary user enters, exact reward and six-run cap survive replay`,async t=>{
  const f=await jointFixture(t,{postgres}),policy=await readExpeditionPolicy(f.env,'COW_ROOM');
  const enable={content:'COW_ROOM',revision:policy.revision,economy:{...policy,mode:'ON',approved:false}};
  const userDeps={...f.deps,authenticate:async r=>r.headers.get('authorization')==='Bearer local-account-7'?{...f.user,role:'USER'}:null};
  const call=(path,body,deps=userDeps,method)=>handlePveV3({path,request:request(path,body,method),env:f.env,deps});
  assert.equal((await call('admin/pve-v3',enable,userDeps,'PATCH')).status,403);
  const saved=await call('admin/pve-v3',enable,f.deps,'PATCH');assert.equal(saved.status,200);assert.equal((await saved.json()).approved,true);
  const coinsBefore=await f.coin();
  for(let i=1;i<=6;i++){
   const body={requestId:`user-cow-${i}`,difficulty:'PASTURE'},response=await call('cow-room/v3/run',body);
   assert.equal(response.status,200,await response.clone().text());const result=await response.json();assert.equal(result.success,true);assert.equal(result.rewards.find(r=>r.rewardType==='COIN').quantity,500000000);
   assert.equal((await(await call('cow-room/v3/run',body)).json()).replayed,true);
  }
  assert.equal(await f.coin(),coinsBefore+3000000000-6*250000);assert.equal((await cowPortalStatus(f.env,f.user)).available,0);
  assert.equal((await call('cow-room/v3/run',{requestId:'user-cow-seven',difficulty:'PASTURE'})).status,409);
  const current=await readExpeditionPolicy(f.env,'COW_ROOM');await call('admin/pve-v3',{content:'COW_ROOM',revision:current.revision,economy:{...current,mode:'OFF'}},f.deps,'PATCH');
  assert.equal(await discoverCowPortal(f.env,f.user,{battleMode:'PVE',sourceType:'HUNT',sourceRef:'closed-event',result:'WIN'}),null);
  const restored=await call('cow-room/v3/run',{requestId:'user-cow-one-after-off',difficulty:'PASTURE'});assert.equal(restored.status,423);
  assert.equal((await(await call('cow-room/v3/run',{requestId:'user-cow-6',difficulty:'PASTURE'})).json()).replayed,true,'CMS stop preserves settled result recovery');
 });
}
