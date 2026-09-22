import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createForgeTransport,createForgeQuoteQueue,readForgePending} from '../equipment-forge/requests.mjs';
import {forgeFixture} from './helpers/forge-db.mjs';
import {handleForgeRuntimeReady} from '../functions/_equipment_forge_routes.js';
import {forgeQuote,executeForge,forgeReceipt} from '../functions/_equipment_forge_transactions.js';
import {forgePower} from '../shared/equipment-forge-policy-v1.mjs';
import {terminalForgeErrors} from '../equipment-forge/requests.mjs';
const rid=()=>crypto.randomUUID();
const tick=()=>new Promise(resolve=>setTimeout(resolve,5));
const until=async fn=>{for(let i=0;i<200;i++){if(fn())return;await tick();}assert.fail('condition not reached');};
test('quote selection bursts coalesce, cache briefly, and never run two requests concurrently',async()=>{
 let calls=0,inFlight=0,max=0,finish;
 const queue=createForgeQuoteQueue(async body=>{calls++;max=Math.max(max,++inFlight);await new Promise(resolve=>{finish=resolve;});inFlight--;return {...body,expiresAt:new Date(Date.now()+60000).toISOString()};},{debounceMs:0});
 const first=queue.select('first',{id:1});await until(()=>calls===1);
 const burst=Array.from({length:100},(_,i)=>queue.select('key-'+i,{id:i+2}));
 finish();assert.equal(await first,null);await until(()=>calls===2);finish();const values=await Promise.all(burst);
 assert.equal(max,1);assert.equal(calls,2);assert.equal(values.filter(Boolean).length,1);assert.equal(values.at(-1).id,101);
 assert.equal((await queue.select('key-99',{id:101})).id,101);assert.equal(calls,2);
 queue.invalidate();const next=queue.select('key-99',{id:101});await until(()=>calls===3);finish();await next;
});
test('lock retries are capped with backoff and preserve the exact request body',async()=>{
 const bodies=[],delays=[];const request=createForgeTransport({jitter:()=>0,delay:async ms=>delays.push(ms),fetchImpl:async(_url,options)=>{bodies.push(options.body);return Response.json({code:'JOINT_LOCK_BUSY',error:'busy',retryable:true},{status:409});}});
 await assert.rejects(request('enhance',{body:{requestId:rid(),quoteId:rid()},retries:2,lockOnly:true}),{code:'JOINT_LOCK_BUSY'});
 assert.equal(bodies.length,3);assert.equal(new Set(bodies).size,1);assert.deepEqual(delays,[500,1500]);
});
test('ambiguous enhancement response is not automatically resubmitted, but quote retry reuses its ID',async()=>{
 let calls=0;const bodies=[];const request=createForgeTransport({jitter:()=>0,delay:async()=>{},fetchImpl:async(_url,options)=>{calls++;bodies.push(options.body);throw TypeError('lost response');}});
 await assert.rejects(request('enhance',{body:{requestId:rid()},retries:2,lockOnly:true}));assert.equal(calls,1);
 await assert.rejects(request('quote',{body:{requestId:rid()},retries:2}));assert.equal(calls,4);assert.equal(new Set(bodies.slice(1)).size,1);
});
test('transport timeout, body timeout, and cancellation settle instead of locking indefinitely',async()=>{
 for(const bodyOnly of [false,true]){
  const request=createForgeTransport({timeoutMs:15,fetchImpl:async(_url,{signal})=>{
   const pending=new Promise((_,reject)=>signal.addEventListener('abort',()=>reject(Object.assign(Error('abort'),{name:'AbortError'})),{once:true}));
   return bodyOnly?{ok:true,status:200,json:()=>pending}:pending;
  }});
  await assert.rejects(request('quote'),{code:'FORGE_TIMEOUT'});
 }
 const controller=new AbortController();controller.abort();let called=false;
 const request=createForgeTransport({fetchImpl:async(_url,{signal})=>{called=true;signal.throwIfAborted();}});
 await assert.rejects(request('state',{signal:controller.signal}),{name:'AbortError'});assert.equal(called,true);
});
test('corrupt pending records fail visibly without deleting a potentially committed request',()=>{
 let removed=false;const storage={getItem:()=>'{bad',removeItem:()=>{removed=true;}};
 assert.throws(()=>readForgePending(storage,'key'),{code:'FORGE_PENDING_INVALID'});assert.equal(removed,false);
});
for(const postgres of [false,true]){
 const label=postgres?'PostgreSQL':'SQLite';
 test(`${label}: quoting bypasses busy account lock; enhancement still requires it`,async t=>{
  const f=await forgeFixture(t,{postgres});await f.setting('equipment_forge_public_settings_v1',{schemaVersion:1,revision:1,publicVisible:true,executionMode:'ON',notice:'QA'});
  let locks=0;const deps={...f.deps,withUserMutationLock:async()=>{locks++;throw Object.assign(Error('busy'),{code:'JOINT_LOCK_BUSY',status:409});}};
  const call=(action,body)=>handleForgeRuntimeReady({env:f.env,deps,path:'character/equipment/forge/'+action,request:new Request('https://game.test/api/character/equipment/forge/'+action,{method:'POST',headers:{authorization:'Bearer local-account-7',origin:'https://game.test','content-type':'application/json'},body:JSON.stringify(body)})});
  const q=await call('quote',{requestId:rid(),kind:'ENHANCE',instanceId:f.instanceId});assert.equal(q.status,200);assert.equal(locks,0);
  const result=await call('enhance',{requestId:rid(),quoteId:(await q.json()).quoteId});assert.equal(result.status,409);assert.equal(locks,1);assert.equal(await f.coin(),10000000);
 });
 test(`${label}: 12 concurrent retries persist one exact quote and cannot cross account boundaries`,async t=>{
  const f=await forgeFixture(t,{postgres});await f.setting('equipment_forge_public_settings_v1',{schemaVersion:1,revision:1,publicVisible:true,executionMode:'ON',notice:'QA'});
  const body={requestId:rid(),kind:'ENHANCE',instanceId:f.instanceId};
  const results=await Promise.all(Array.from({length:12},(_,i)=>forgeQuote(f.env,f.user,body,{now:Date.now()+i})));
  assert.ok(results.every(row=>JSON.stringify(row)===JSON.stringify(results[0])));
  assert.equal(Number((await f.p('SELECT COUNT(*) AS n FROM equipment_forge_quotes_v1').first()).n),1);
  await assert.rejects(forgeQuote(f.env,{id:8,role:'USER'},body),{code:'FORGE_QUOTE_CONFLICT'});assert.equal(await f.coin(),10000000);
 });
 test(`${label}: read-only receipt recovery after lost response never charges again`,async t=>{
  const f=await forgeFixture(t,{postgres});await f.setting('equipment_forge_public_settings_v1',{schemaVersion:1,revision:1,publicVisible:true,executionMode:'ON',notice:'QA'});
  await f.p('UPDATE users SET coin=9000000000000 WHERE id=7').run();await f.p("UPDATE cnine_user_inventory SET quantity=1000000 WHERE user_id=7 AND item_code='MASTER_STAR'").run();
  const q=await forgeQuote(f.env,f.user,{requestId:rid(),kind:'ENHANCE',instanceId:f.instanceId}),requestId=rid();
  const receipt=await executeForge(f.env,f.user,{requestId,quoteId:q.quoteId},'ENHANCE',{randomInt:()=>0});const coins=await f.coin(),stars=await f.qty('MASTER_STAR');
  for(let n=0;n<4;n++)assert.equal((await forgeReceipt(f.env,f.user,requestId,'ENHANCE')).level,receipt.level);
  assert.equal(await f.coin(),coins);assert.equal(await f.qty('MASTER_STAR'),stars);
 });
}
test('live host includes visible recovery, bounded transport, and no quote/receipt account lock',()=>{
 const app=readFileSync(new URL('../equipment-forge/app.mjs',import.meta.url),'utf8');
 assert.match(app,/control-panel'\)\.prepend\(connection\)/);assert.match(app,/recoverPending\(false\)/);assert.match(app,/retries:2,lockOnly:true/);assert.match(app,/fxGeneration/);
 assert.doesNotMatch(app,/await api\('status',controller\.signal\)/);
});

// Exercise the real app state machine without a browser or player data. The
// separate local-browser QA checks layout and actual DOM interaction.
async function appFixture(t,handle,{pending=null}={}){
 class Element{
  constructor(){this.dataset={};this.style={};this.hidden=false;this.disabled=false;this.checked=false;this.children=new Map();this.classList={toggle(){}};this.scrollTop=0;}
  querySelector(k){if(!this.children.has(k))this.children.set(k,new Element());return this.children.get(k);}
  querySelectorAll(){return [];}
  setAttribute(k,v){this[k]=v;}addEventListener(){}prepend(){}append(){}contains(){return false;}
 }
 const nodes=new Map(),get=k=>{if(!nodes.has(k))nodes.set(k,new Element());return nodes.get(k);};
 const values=new Map([['cnine_card_api_token','test-account-7']]);if(pending)values.set('cnine.forge.pending:7',JSON.stringify(pending));
 const storage={getItem:k=>values.get(k)??null,setItem:(k,v)=>values.set(k,v),removeItem:k=>values.delete(k)};
 const events={},window={addEventListener:(k,v)=>events[k]=v},document={hidden:true,getElementById:get,querySelector:get,querySelectorAll:()=>[],createElement:()=>new Element(),addEventListener(){}};
 const item={instanceId:'310',selectionId:'310',name:'검수 무기',slot:'WEAPON',grade:'MYTHIC',image:'/assets/test.png',basePower:{total:10000,pve:9000,pvp:1000},enhancement:{level:0,revision:0,power:{total:10000,pve:9000,pvp:1000}}};
 const state={accountId:7,items:[item],wallet:{coins:'100000000000',masterStars:20000,protection:10},canEnhance:true,canRestore:true,publicVisible:true,policy:{revision:6,steps:[{protectionQuantity:0}],protection:{itemCode:'PROTECTION'}},records:[],history:[]};
 const snapshot={kind:'ENHANCE',item:{...item,level:0},cost:{successPpm:700000,maintainPpm:300000,destroyPpm:0,coinCost:100000000,itemCode:'MASTER_STAR',itemQuantity:10000},quoteId:rid(),expiresAt:new Date(Date.now()+60000).toISOString()};
 const receipt={requestId:pending?.requestId,status:'COMPLETED',outcome:'SUCCESS',level:1,item};
 const calls=[];const transport=createForgeTransport({timeoutMs:100,jitter:()=>0,delay:async()=>{},fetchImpl:async(url,options)=>{
  const path=url.split('/forge/')[1],body=options.body?JSON.parse(options.body):null;calls.push({path,body});
  const result=await handle?.({path,body,state,snapshot,receipt});if(result!==undefined)return result;
  return Response.json(path.startsWith('state?')?state:path==='quote'?snapshot:receipt);
 }});
 const source=readFileSync(new URL('../equipment-forge/app.mjs',import.meta.url),'utf8').replace(/^import .*;\r?\n/gm,'');
 const AsyncFunction=Object.getPrototypeOf(async function(){}).constructor;
 class NoFX{async init(){throw Error('canvas intentionally absent in unit test');}destroy(){}}
 const timer=(fn,ms)=>{const id=setTimeout(fn,ms);id.unref();return id;};
 const api=await new AsyncFunction('ForgeFX','forgePower','createForgeTransport','createForgeQuoteQueue','readForgePending','terminalForgeErrors','document','window','localStorage','sessionStorage','location','matchMedia','setTimeout',source+'\nreturn {execute,recoverPending,load,select,state:()=>({executing,recovering,quote})};')(NoFX,forgePower,()=>transport,(fn)=>createForgeQuoteQueue(fn,{debounceMs:0}),readForgePending,terminalForgeErrors,document,window,storage,{getItem:()=>null},{origin:'https://game.test'},()=>({matches:true}),timer);
 t.after(()=>events.pagehide?.());return {api,calls,get,storage,values,pendingKey:'cnine.forge.pending:7'};
}
test('real app: failed quote offers enabled retry, and retry never executes enhancement',async t=>{
 let failures=3;const f=await appFixture(t,({path})=>path==='quote'&&failures-->0?Response.json({code:'JOINT_LOCK_BUSY',error:'busy'},{status:409}):undefined);
 await until(()=>f.get('enhance-button').querySelector('span').textContent==='견적 다시 확인');
 assert.equal(f.get('enhance-button').disabled,false);await f.api.execute();await until(()=>!!f.api.state().quote);
 assert.equal(f.calls.filter(c=>c.path==='quote').length,4);assert.equal(f.calls.filter(c=>c.path==='enhance').length,0);assert.equal(f.storage.getItem(f.pendingKey),null);
});
test('real app: completed pending request auto-recovers using receipt GET only',async t=>{
 const pending={requestId:rid(),quoteId:rid(),kind:'ENHANCE'},f=await appFixture(t,null,{pending});
 await until(()=>!f.storage.getItem(f.pendingKey)&&!!f.api.state().quote);
 assert.equal(f.calls.filter(c=>c.path.startsWith('receipt?')).length,1);assert.equal(f.calls.filter(c=>c.path==='enhance').length,0);assert.equal(f.api.state().recovering,false);
});
test('real app: missing receipt waits for explicit same-request continuation',async t=>{
 const pending={requestId:rid(),quoteId:rid(),kind:'ENHANCE'},f=await appFixture(t,({path})=>path.startsWith('receipt?')?Response.json({code:'JOINT_NOT_FOUND',error:'not found'},{status:404}):undefined,{pending});
 await until(()=>f.get('forge-retry').textContent==='같은 요청 이어서 확인'&&!f.api.state().recovering);
 assert.equal(f.calls.filter(c=>c.path==='enhance').length,0);assert.equal(f.get('forge-retry').disabled,false);
 await f.api.recoverPending(true);await until(()=>!!f.api.state().quote);
 assert.deepEqual(f.calls.find(c=>c.path==='enhance').body,{requestId:pending.requestId,quoteId:pending.quoteId});assert.equal(f.storage.getItem(f.pendingKey),null);
});
test('real app: ambiguous POST response leaves a visible recovery action, not an automatic second charge',async t=>{
 const f=await appFixture(t,({path})=>{if(path==='enhance')throw TypeError('lost response after commit');});await until(()=>!!f.api.state().quote);
 await f.api.execute();assert.equal(f.calls.filter(c=>c.path==='enhance').length,1);assert.ok(f.storage.getItem(f.pendingKey));assert.equal(f.api.state().executing,false);assert.equal(f.get('forge-retry').disabled,false);
 await f.api.recoverPending(false);await until(()=>!!f.api.state().quote);assert.equal(f.calls.filter(c=>c.path==='enhance').length,1);assert.equal(f.storage.getItem(f.pendingKey),null);
});
test('real app: repeated inventory refreshes do not overlap account-state queries',async t=>{
 let block=false,release;const f=await appFixture(t,async({path,state})=>{if(block&&path.startsWith('state?')){await new Promise(resolve=>release=resolve);return Response.json(state);}});await until(()=>!!f.api.state().quote);
 block=true;const first=f.api.load();await until(()=>!!release);await Promise.all(Array.from({length:25},()=>f.api.load()));
 assert.equal(f.calls.filter(c=>c.path.startsWith('state?')).length,2);release();await first;
});
