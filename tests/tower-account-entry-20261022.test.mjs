import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const app=fs.readFileSync(new URL('../js/app.js',import.meta.url),'utf8');
const mapUser=vm.runInNewContext(app.slice(app.indexOf('function apiUserToLocal('),app.indexOf('function mergeApiUserSummary('))+'\napiUserToLocal',{loadUser:()=>null,MA_HIGH_ENHANCEMENT_FALLBACK:{},LIMITED_HIGH_ENHANCEMENT_FALLBACK:{},FUR_HIGH_ENHANCEMENT_FALLBACK:{},ZENITH_HIGH_ENHANCEMENT_FALLBACK:{},HIGH_ENHANCEMENT_LOCAL_VERSION:1});
function harness(){
 const values=new Map(),calls=[],records=[],errors=[],events={},box={};let account=mapUser({id:7,nickname:'격리 계정',role:'USER'});
 const stage={isConnected:true,focus(){},querySelectorAll:()=>[],querySelector:()=>null};
 const view={stage,phase:{},towerMsg:{querySelector:()=>null,querySelectorAll:()=>[]}};
 const modal={classList:{add(){},remove(){},contains:()=>true},innerHTML:''};
 const context={console,URL,location:{href:'https://test.invalid/'},setTimeout,clearTimeout,crypto,sessionStorage:{getItem:k=>values.get(k)||null,setItem:(k,v)=>values.set(k,v),removeItem:k=>values.delete(k)},
  cards:Array.from({length:5},(_,i)=>({id:String(i+1),basePower:1})),loadUser:()=>account,MutationObserver:class{observe(){}},
  document:{documentElement:{},querySelector:()=>null,getElementById:id=>id==='modal'?modal:box,addEventListener(){},removeEventListener(){}},
  apiRequest:async(path,options)=>{calls.push({path,body:JSON.parse(options.body)});return {requestId:calls.at(-1).body.requestId,floorNo:1,result:'WIN',reward:1000000000};}};
 context.window=context;context.addEventListener=(name,fn)=>events[name]=fn;
 context.TowerAbyssUI={starting(){},prepareBattle(){},remember:id=>records.push(id),readRecords:()=>[],result(){},state:(_box,state)=>errors.push(state),render(_box,props){context.lastRender=props;},errorResult(){}};
 context.ProjectVBattleV3Live={ready:()=>true};context.prepareBattleV2LiveLoading=()=>view;context.playTowerBattleV3Live=async()=>({showResult(){}});context.ensureFeatureResources=async()=>{};
 const source=fs.readFileSync(new URL('../js/tower-v1038.js',import.meta.url),'utf8').replace('  const observer=new MutationObserver','  window.__entry={S,startFight,pendingKey,pendingBattle,rememberBattle,acknowledgeBattle,render};\n  const observer=new MutationObserver');
 vm.runInNewContext(source,context);context.__entry.S.data={active:true,maxFloor:120,floor:{floorNo:1},deck:['1','2','3','4','5']};
 return {context,calls,records,values,errors,events,setAccount:id=>account=mapUser({id,nickname:'격리 계정',role:'USER'}),getAccount:()=>account};
}

test('Tower accepts the actual apiUserToLocal serverUserId shape and submits a fight',async()=>{
 const h=harness();assert.equal(h.getAccount().id,undefined);assert.equal(h.getAccount().serverUserId,7);
 await h.context.__entry.startFight();assert.equal(h.calls.length,1);assert.equal(h.calls[0].path,'tower/start');assert.equal(h.calls[0].body.floorNo,1);
 assert.equal(h.records[0],7);assert.ok(h.values.has('cnine:tower:battle:v2094:7'));assert.equal(h.values.has('cnine:tower:battle:v2094:0'),false);
 h.context.__entry.render();assert.equal(h.context.lastRender.userId,7);
});

test('Tower recovery ignores the legacy zero key and stays isolated after account switches',async()=>{
 const h=harness();h.values.set('cnine:tower:battle:v2094:0',JSON.stringify({requestId:'other-account',floorNo:120,result:{}}));
 assert.equal(h.context.__entry.pendingBattle(),null);await h.context.__entry.startFight();assert.notEqual(h.calls[0].body.requestId,'other-account');
 h.setAccount(8);assert.equal(h.context.__entry.pendingBattle(),null);assert.equal(h.context.__entry.pendingKey(),'cnine:tower:battle:v2094:8');
});

test('a refused equipment requirement leaves no local battle to recover', async () => {
 const h=harness(),entry=h.context.__entry;
 entry.S.data={...entry.S.data,maxFloor:200,floor:{floorNo:180,requiredUniqueTier:1}};
 h.context.apiRequest=async()=>{throw Object.assign(new Error('출전 용병 유니크 1단계'),{code:'TOWER_UNIQUE_REQUIRED'});};
 let message;
 h.context.TowerAbyssUI.errorResult=(_view,text,pending)=>{message={text,pending};};
 await entry.startFight();
 assert.deepEqual(message,{text:'출전 용병 유니크 1단계',pending:false});
 assert.equal(entry.pendingBattle(),null);
});

test('a long upper encounter fits a small session quota and the completed server receipt resumes after reload', async () => {
 const h=harness(),entry=h.context.__entry,requestId='tower-200-long-encounter';
 const response={requestId,floorNo:200,result:'WIN',reward:1000,completed:true,
  settlement:{protocol:'TOWER_ABYSS_20261022',status:'COMPLETED',startedAt:1795471200000},battleV2:{padding:'a'.repeat(8500000)}};
 const key=entry.pendingKey();
 h.context.sessionStorage.setItem=(k,value)=>{if(value.length>5000000)throw Error('QuotaExceededError');h.values.set(k,value);};
 entry.rememberBattle({requestId,floorNo:200,result:response,playbackComplete:true});
 assert.equal(entry.pendingBattle().result,response);
 assert(h.values.get(key).length<300);
 h.setAccount(8);
 assert.equal(entry.pendingBattle(),null);
 const resumed=harness(),next=resumed.context.__entry;
 resumed.values.set(key,h.values.get(key));
 next.S.data={active:true,completed:true,maxFloor:200,floor:null,deck:[]};
 const reads=[];
 resumed.context.apiRequest=async(path,opts)=>{reads.push([path,JSON.parse(opts.body).requestId]);return response;};
 resumed.context.playTowerBattleV3Live=async()=>{throw Error('playback was already completed');};
 await next.startFight();
 assert.deepEqual(reads,[['tower/start',requestId]]);
 assert.deepEqual(resumed.records,[7]);
 next.acknowledgeBattle();assert.equal(next.pendingBattle(),null);
});

test('Tower double clicks and account changes during resource loading cannot send a stale start',async()=>{
 const h=harness();let release,loads=0;h.context.ensureFeatureResources=()=>{loads++;return new Promise(resolve=>release=resolve);};
 const first=h.context.__entry.startFight();await h.context.__entry.startFight();assert.equal(loads,1);
 h.setAccount(8);release();await first;assert.equal(h.calls.length,0);assert.equal(h.context.__entry.S.busy,false);
 h.context.ensureFeatureResources=async()=>{};await h.context.__entry.startFight();assert.equal(h.calls.length,1);assert.equal(h.records[0],8);
});

test('Tower rejects a missing account visibly before loading or submitting a battle',async()=>{
 const h=harness();h.setAccount(undefined);await h.context.__entry.startFight();assert.equal(h.calls.length,0);assert.match(h.errors[0].title,/로그인/);assert.equal(h.context.__entry.S.busy,false);
});
