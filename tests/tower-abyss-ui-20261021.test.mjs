import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import fs from 'node:fs';
const code=fs.readFileSync(new URL('../js/tower-abyss-ui.js',import.meta.url),'utf8');
const mem=()=>{const data=new Map();return {getItem:k=>data.get(k)||null,setItem:(k,v)=>data.set(k,v)};};
function harness(storage=mem()){const root={localStorage:storage};vm.runInNewContext(code,{window:root});return root.TowerAbyssUI;}
const battle=(id='one',floor=30)=>({requestId:id,floorNo:floor,result:'LOSE',elapsedCombatMs:180000,combatLimitMs:180000,guardianHpPercent:63.7,guardianProgress:100,failureReason:'TIME_LIMIT',rulesVersion:'v1',battleV2:{teams:{A:{cards:[{id:'A:0:1'}]}},result:{timeline:[{type:'KO',targetId:'A:0:1',elapsedCombatMs:87000}],final:{A:[{hp:1},{hp:0},{hp:4},{hp:0},{hp:8}]}}}});
test('double-click admission and leaving during renderer loading never submit a stale fight',async()=>{
 const source=fs.readFileSync(new URL('../js/tower-v1038.js',import.meta.url),'utf8').replace("  const observer=new MutationObserver","  window.__towerTest={S,startFight};\n  const observer=new MutationObserver");
 const events={},context={console,URL,location:{href:'https://test.invalid/'},setTimeout,clearTimeout,crypto,
   cards:Array.from({length:5},(_,i)=>({id:String(i+1),basePower:1})),loadUser:()=>({id:7}),sessionStorage:mem(),
   document:{documentElement:{},querySelector:()=>null,getElementById:()=>({}),},MutationObserver:class{observe(){}},
   apiRequest:async()=>{throw Error('Stale battle must not reach the API');}};
 context.window=context;context.addEventListener=(name,fn)=>events[name]=fn;context.TowerAbyssUI={};
 let release,loads=0;context.ensureFeatureResources=()=>{loads++;return new Promise(r=>release=r);};
 vm.runInNewContext(source,context);
 context.__towerTest.S.data={floor:{floorNo:1},deck:['1','2','3','4','5']};
 const first=context.__towerTest.startFight();await context.__towerTest.startFight();assert.equal(loads,1);
 events['cnine:route-will-change']();release();await first;assert.equal(context.__towerTest.S.busy,false);
});
test('growth summary uses actual server time, guardian HP, party survivors and first KO',()=>{
 const ui=harness(),r=ui.summarize(battle(),123);
 assert.equal(r.elapsed,180000);assert.equal(r.guardianHp,63.7);assert.equal(r.survivors,3);assert.equal(r.total,5);assert.equal(r.firstFall,87000);
 assert.equal(r.at,123);assert.equal(ui.clock(r.elapsed),'03:00');
 const old=ui.summarize({requestId:'old',floorNo:1,result:'WIN'});for(const k of ['elapsed','guardianHp','survivors','firstFall'])assert.equal(old[k],null,k);
 assert.equal(ui.clock(null),'—');assert.equal(ui.clock(0),'00:00');
});
test('history is isolated per account, capped and idempotent on battle recovery',()=>{
 const ui=harness(),store=mem();
 ui.remember(7,battle(),store);ui.remember(7,battle(),store);assert.equal(ui.readRecords(7,store).length,1);assert.equal(ui.readRecords(8,store).length,0);
 for(let i=0;i<44;i++)ui.remember(7,battle('id-'+i),store);
 assert.equal(ui.readRecords(7,store).length,40);assert.equal(ui.readRecords(7,store)[0].id,'id-43');
 assert.equal(ui.previousFor(ui.summarize(battle()),[ui.summarize(battle('other',31))]),null);
 assert.equal(ui.previousFor(ui.summarize(battle()),[{...ui.summarize(battle('other')),rulesVersion:'v2'}]),null);
 assert.equal(ui.previousFor(ui.summarize(battle()),[{...ui.summarize(battle('other')),enemyPower:999999}]),null);
 assert.equal(ui.previousFor(ui.summarize(battle()),[{...ui.summarize(battle('other')),limit:120000}]),null);
 assert.equal(ui.previousFor(ui.summarize(battle()),[ui.summarize(battle('other'))]).id,'other');
});
test('unavailable and malformed browser storage never prevent rendering a battle result',()=>{
 const root={};Object.defineProperty(root,'localStorage',{get(){throw Error('blocked');}});vm.runInNewContext(code,{window:root});
 assert.equal(root.TowerAbyssUI.readRecords(7).length,0);assert.equal(root.TowerAbyssUI.remember(7,battle()).floor,30);
 const store={getItem:()=>'{bad json',setItem(){throw Error('quota');}};assert.equal(harness(store).readRecords(7).length,0);
});
test('only Tower removes early result controls while preserving pause and other continuous modes',async()=>{
 const source=fs.readFileSync(new URL('../js/pve-continuous-battle-live.mjs',import.meta.url),'utf8');
 const fn=vm.runInNewContext(source.replace('export async function','async function')+'\nplayContinuousBattle',{
  globalThis:{ensureFeatureResources:async()=>{},ProjectVBattleV3Live:{createRenderer:async()=>({play:async()=>{},showResult(){},destroy(){}})}},
  document:{querySelector:()=>true,addEventListener(){},removeEventListener(){}},addEventListener(){},removeEventListener(){},Promise,Set
 });
 for(const mode of ['TOWER','SCRAPYARD']){
  const fields=new Map(),markups=[];const button={textContent:'',disabled:true};
  const stage={querySelector:s=>s==='[data-continuous-result]'?(mode==='TOWER'?null:{...button}):s==='[data-continuous-pause]'?button:s==='.pve-continuous-track i'?{style:{}}:{textContent:'',remove(){}},insertAdjacentHTML:(_,html)=>markups.push(html)};
  await fn({modal:{classList:{add(){}}},data:{floorNo:1,combatLimitMs:180000,continuousEncounter:{instances:[]},battleV2:{result:{timeline:[]}}},view:{stage,host:{style:{}},phase:{}},mode});
  assert.equal(markups.join('').includes('data-continuous-result'),mode!=='TOWER');
  assert.equal(markups.join('').includes('data-continuous-pause'),true);
 }
});
