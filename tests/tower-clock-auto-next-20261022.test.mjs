import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const read=name=>fs.readFileSync(new URL('../'+name,import.meta.url),'utf8');
const flush=async()=>{for(let n=0;n<40;n++)await Promise.resolve();};
const deferred=()=>{let resolve;const promise=new Promise(r=>resolve=r);return {promise,resolve};};
const protocol='TOWER_ABYSS_20261022';
function harness(){
 const tasks=new Map(),values=new Map(),events={},calls=[],shown=[],errors=[],views=[];let now=0,id=0,accountId=7,floor=1;
 const box={isConnected:true,hidden:false,dataset:{},addEventListener(){},querySelector:()=>null};
 const modal={classList:{add(){},remove(){},contains:()=>true}};
 const doc={hidden:false,documentElement:{},querySelector:()=>null,querySelectorAll:()=>[],getElementById:id=>id==='modal'?modal:id==='pveTowerView'?box:null,addEventListener:(type,fn)=>events[type]=fn,removeEventListener(){}};
 const status=()=>({active:true,maxFloor:120,floor:{floorNo:floor},deck:['1','2','3','4','5']});
 const c={console,URL,location:{href:'https://example.invalid/'},crypto,performance:{now:()=>now},document:doc,MutationObserver:class{observe(){}},cards:Array.from({length:5},(_,i)=>({id:String(i+1),basePower:1})),loadUser:()=>({serverUserId:accountId}),
  setTimeout:(fn,ms)=>{tasks.set(++id,{fn,at:now+ms});return id;},clearTimeout:id=>tasks.delete(id),sessionStorage:{getItem:key=>values.get(key)||null,setItem:(key,value)=>values.set(key,value),removeItem:key=>values.delete(key)}};
 c.window=c;c.addEventListener=(type,fn)=>events[type]=fn;
 c.TowerAbyssUI={starting(){},state(){},render(){},prepareBattle(){},readRecords:()=>[],remember(){},result:(_v,data)=>shown.push(data),settling(){},errorResult:(_v,error)=>errors.push(error),syncAutoNext(){}};
 c.ProjectVBattleV3Live={ready:()=>true};c.ensureFeatureResources=async()=>{};
 c.prepareBattleV2LiveLoading=()=>{const view={stage:{isConnected:true,focus(){},querySelectorAll:()=>[],querySelector:()=>null},phase:{},towerMsg:{querySelector:()=>null,querySelectorAll:()=>[]}};views.push(view);return view;};
 c.playTowerBattleV3Live=async()=>({showResult(){},destroy(){}});
 const receipts=new Map();
 c.apiRequest=async(path,options={})=>{
  const body=options.body?JSON.parse(options.body):null;calls.push({path,body});
  if(path==='tower/status')return status();if(path==='tower/pending')return {pending:null};
  if(path==='tower/start'){const data={...body,result:'WIN',completed:false,reward:0,settlement:{protocol,status:'PENDING'}};receipts.set(body.requestId,data);return data;}
  if(path==='tower/finish'){const data={...receipts.get(body.requestId),reward:1e9,settlement:{protocol,status:'COMPLETED'}};floor=data.floorNo+1;return data;}
  throw Error(path);
 };
 vm.runInNewContext(read('js/tower-v1038.js').replace('  const observer=new MutationObserver','  window.__auto={S,startFight,setAutoNext,autoNextEnabled,closeBattle};\n  const observer=new MutationObserver'),c);
 c.__auto.S.data=status();
 const advance=async ms=>{const until=now+ms;for(let n=0;n<500;n++){const next=[...tasks].sort((a,b)=>a[1].at-b[1].at)[0];if(!next||next[1].at>until)break;now=next[1].at;tasks.delete(next[0]);next[1].fn();await flush();}now=until;await flush();};
 return {c,api:c.__auto,calls,shown,errors,values,events,views,advance,tasks,setAccount:id=>accountId=id,setFloor:value=>floor=value,starts:()=>calls.filter(r=>r.path==='tower/start')};
}

test('ordinary continuous playback publishes every official clock event; skill-chip playback keeps its single shared timeline',async()=>{
 const source=read('js/battle-v3-live.js'),begin=source.indexOf('            if (timedSkillChips) {');
 // Run the actual branch using an ordinary engine that (as shipped) does not call hooks.
 const code=source.slice(begin,source.indexOf('            await stopAccountBattleUnitContinuousFire({ drain: true });',begin));
 for(const timed of [false,true]){
  const timeline=[{type:'DEPLOY',remainingCombatMs:180000},{type:'ATTACK',remainingCombatMs:179980},{type:'KO',remainingCombatMs:179820}],played=[],seen=[],prepared=[];
  const options={onCombatEvent:event=>seen.push(event),isPlaybackPaused:()=>false};
  const engine={playEvents:async(rows,hooks)=>{played.push(rows);if(timed)for(const row of rows){await hooks.beforeEvent(row);hooks.afterEvent(row);}}};
  const run=vm.runInNewContext('(async()=>{'+code+'})',{timedSkillChips:timed,root:{ProjectVPixiBattle:engine},timeline,options,destroyed:false,prepareEvent:async e=>{prepared.push(e);return e;}});
  await run();assert.equal(played.length,timed?1:3);assert.deepEqual(seen,timeline);assert.deepEqual(prepared,timeline);
 }
});

test('HUD exposes subsecond official time and metadata-free events cannot reset it or guardian progress',()=>{
 const root={};vm.runInNewContext(read('js/tower-abyss-ui.js'),{window:root});const ui=root.TowerAbyssUI,fields=new Map();
 for(const key of ['clock','progress','meter','phase'])fields.set('[data-abyss-'+key+']',{value:0});
 const stage={querySelector:key=>fields.get(key),classList:{toggle(){}}};
 ui.updateBattle(stage,{remainingCombatMs:179820,guardianProgress:70},{combatLimitMs:180000});assert.equal(fields.get('[data-abyss-clock]').textContent,'02:59.82');
 ui.updateBattle(stage,{type:'DEPLOY'},{combatLimitMs:180000});assert.equal(fields.get('[data-abyss-clock]').textContent,'02:59.82');assert.equal(fields.get('[data-abyss-meter]').value,70);
 ui.updateBattle(stage,{elapsedCombatMs:12345},{combatLimitMs:180000});assert.equal(fields.get('[data-abyss-clock]').textContent,'02:47.65');assert.equal(ui.combatClock(0),'00:00.00');
});

test('auto is opt-in and starts exactly the next floor once, only after full playback, settled reward and three seconds',async()=>{
 const off=harness();await off.api.startFight();await off.advance(10000);assert.equal(off.starts().length,1);
 const h=harness(),play=deferred();h.c.playTowerBattleV3Live=()=>play.promise;h.api.setAutoNext(true);const run=h.api.startFight();await flush();await h.advance(5000);
 assert.equal(h.calls.some(x=>x.path==='tower/finish'),false);assert.equal(h.shown.length,0);
 play.resolve({showResult(){},destroy(){}});await run;assert.equal(h.shown[0].settlement.status,'COMPLETED');
 h.c.playTowerBattleV3Live=async()=>({showResult(){},destroy(){}});await h.advance(2999);assert.equal(h.starts().length,1);
 await h.advance(1);assert.equal(h.starts().length,2);assert.equal(h.starts()[1].body.floorNo,2);assert.notEqual(h.starts()[0].body.requestId,h.starts()[1].body.requestId);
 h.api.setAutoNext(false);await h.advance(6000);assert.equal(h.starts().length,2);
});

test('finish wait/error cannot start another floor or discard the unsettled receipt',async()=>{
 const h=harness(),base=h.c.apiRequest,finish=deferred();h.c.apiRequest=(path,options)=>path==='tower/finish'?finish.promise:base(path,options);
 h.api.setAutoNext(true);const run=h.api.startFight();await flush();await h.advance(9000);assert.equal(h.starts().length,1);assert.equal(h.shown.length,0);
 finish.resolve({...h.starts()[0].body,result:'WIN',settlement:{protocol,status:'COMPLETED'}});await run;h.api.setAutoNext(false);
 const fail=harness(),transport=fail.c.apiRequest;fail.c.apiRequest=(path,options)=>path==='tower/finish'?Promise.reject(Error('offline')):transport(path,options);
 fail.api.setAutoNext(true);await fail.api.startFight();await fail.advance(9000);assert.equal(fail.starts().length,1);assert.equal(fail.api.autoNextEnabled(),false);assert.equal(fail.values.size,1);assert.equal(fail.errors[0],'offline');
});

test('loss and final floor stop automatically; no repeated-farm request is created',async()=>{
 for(const patch of [{result:'LOSE'},{completed:true,floorNo:120}]){
  const h=harness(),base=h.c.apiRequest;h.c.apiRequest=async(path,options)=>{const data=await base(path,options);return path==='tower/finish'?{...data,...patch}:data;};
  h.api.setAutoNext(true);await h.api.startFight();await h.advance(10000);assert.equal(h.starts().length,1);assert.equal(h.api.autoNextEnabled(),false);
 }
});

test('off, background, route exit, account switch and missing/changed next floor cancel the countdown',async()=>{
 for(const action of ['off','hidden','route','account','changed-floor']){
  const h=harness();h.api.setAutoNext(true);await h.api.startFight();
  if(action==='off')h.api.setAutoNext(false);
  if(action==='hidden'){h.c.document.hidden=true;h.events.visibilitychange();}
  if(action==='route')h.events['cnine:route-will-change']();
  if(action==='account')h.setAccount(8);
  if(action==='changed-floor')h.setFloor(3);
  await h.advance(10000);assert.equal(h.starts().length,1,action);
 }
});

test('cancelling during next-floor status or resource loading prevents a stale automatic POST',async()=>{
 for(const where of ['status','resources']){
  const h=harness(),gate=deferred(),base=h.c.apiRequest;h.api.setAutoNext(true);await h.api.startFight();
  if(where==='status')h.c.apiRequest=(path,options)=>path==='tower/status'?gate.promise:base(path,options);
  else h.c.ensureFeatureResources=()=>gate.promise;
  await h.advance(3000);h.api.setAutoNext(false);gate.resolve({active:true,maxFloor:120,floor:{floorNo:2},deck:['1','2','3','4','5']});await flush();
  assert.equal(h.starts().length,1,where);assert.equal(h.api.S.busy,false,where);
 }
});
