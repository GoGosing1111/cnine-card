import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';

const source=readFileSync(new URL('../js/workshop-v1881.js',import.meta.url),'utf8');
function client(handler){
  const calls=[],storage=new Map(),listeners={};let now=1_000_000;
  const window={addEventListener:(name,fn)=>listeners[name]=fn,apiRequest:async(path,options)=>{
    calls.push({path,body:options.body?JSON.parse(options.body):null});return handler(path,options,calls.length);
  }};
  const context={window,console,crypto,Date:class extends Date{static now(){return now;}},
    setTimeout:(fn,ms)=>{now+=ms;fn();},document:{getElementById:()=>null},
    localStorage:{getItem:()=> 'local-qa-session'},sessionStorage:{getItem:key=>storage.get(key),setItem:(key,value)=>storage.set(key,value)}};
  vm.runInNewContext(source.replace('  window.workshopView = workshopView;',
    '  window.qa = {requestScrapyardResult,prepareMutationRequest,currentMutationRequest,scrapyardTransportUncertain};\n  window.workshopView = workshopView;'),context);
  const ticket=window.qa.prepareMutationRequest('scrapyard','FURNACE','SCRAP');
  return {calls,ticket,storage,qa:window.qa,run:(active=()=>true)=>window.qa.requestScrapyardResult(ticket,active)};
}
const completed=requestId=>({ok:true,status:'COMPLETED',requestId,rewards:[{rewardRef:'EQUIPMENT_PROTECTION_TICKET',quantity:1}]});
const pending=(requestId,extra={})=>({ok:true,status:'RUNNING',requestId,difficulty:'FURNACE',...extra});

test('lost committed response resolves by receipt GET with exactly one POST',async()=>{
  const c=client((path,options,n)=>{if(n===1)throw new TypeError('Failed to fetch');return completed(c.ticket.requestId);});
  assert.equal((await c.run()).status,'COMPLETED');
  assert.equal(c.calls.length,2);assert.match(c.calls[1].path,/result\?requestId=/);
  assert.equal(c.calls.filter(x=>x.body).length,1);assert.equal(c.qa.currentMutationRequest('scrapyard').requestId,c.ticket.requestId);
});
test('503 before acceptance reads NOT_FOUND then resumes the same request ID',async()=>{
  const c=client((path,options,n)=>{if(n===1)throw Object.assign(Error('temporary'),{status:503});if(n===2)return {status:'NOT_FOUND'};return completed(c.ticket.requestId);});
  assert.equal((await c.run()).status,'COMPLETED');
  assert.equal(c.calls.length,3);assert.equal(c.calls[0].body.requestId,c.calls[2].body.requestId);
});
test('server lock rejection is automatically reconciled without a new request',async()=>{
  const c=client((path,options,n)=>{if(n===1)throw Object.assign(Error('busy'),{status:409,code:'USER_ACTION_IN_PROGRESS'});if(n===2)return {status:'NOT_FOUND'};return completed(c.ticket.requestId);});
  assert.equal((await c.run()).status,'COMPLETED');assert.equal(c.calls[0].body.requestId,c.calls[2].body.requestId);
});
test('live lease is observed for more than six polls, then resumed only when allowed',async()=>{
  const c=client((path,options,n)=>n===14?completed(c.ticket.requestId):pending(c.ticket.requestId,{canResume:n===13}));
  assert.equal((await c.run()).status,'COMPLETED');
  assert.equal(c.calls.length,14);assert.equal(c.calls.filter(x=>x.body).length,2);
  assert.ok(c.calls.slice(1,13).every(x=>!x.body));assert.equal(c.calls[13].body.requestId,c.ticket.requestId);
});
test('server-discovered original request replaces the new local ID before recovery',async()=>{
  const c=client((path,options,n)=>n===1?pending('original-run',{code:'SCRAPYARD_V3_RECOVER_ACTIVE',difficulty:'CORE'}):n===2?pending('original-run',{canResume:true,difficulty:'CORE'}):completed('original-run'));
  assert.equal((await c.run()).requestId,'original-run');
  assert.equal(c.calls[2].body.requestId,'original-run');assert.equal(c.calls[2].body.difficulty,'CORE');
  assert.equal(JSON.parse(c.storage.get('cnine_pending_workshop_requests_v1881')).scrapyard.requestId,'original-run');
});
test('saved request after reload checks its receipt before any POST',async()=>{
  const c=client(()=>completed(c.ticket.requestId));c.ticket.reused=true;
  assert.equal((await c.run()).status,'COMPLETED');assert.equal(c.calls.length,1);assert.equal(c.calls[0].body,null);
});
test('navigation or session change stops retries and retains the original request',async()=>{
  let active=true;const c=client(()=>{active=false;return pending(c.ticket.requestId);});
  assert.equal(await c.run(()=>active),null);assert.equal(c.calls.length,1);
  assert.equal(c.qa.currentMutationRequest('scrapyard').requestId,c.ticket.requestId);
});
test('definitive entry denial is not retried and persistent outages are bounded',async()=>{
  const terminal=client(()=>{throw Object.assign(Error('entry denied'),{status:400});});
  await assert.rejects(()=>terminal.run(),/entry denied/);assert.equal(terminal.calls.length,1);
  const outage=client(()=>{throw Object.assign(Error('offline'),{status:503});});
  await assert.rejects(()=>outage.run(),/offline/);assert.equal(outage.calls.length,6);
  assert.equal(outage.qa.currentMutationRequest('scrapyard').requestId,outage.ticket.requestId);
});
