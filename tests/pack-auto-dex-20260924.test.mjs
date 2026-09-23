import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const read=file=>fs.readFileSync(new URL('../'+file,import.meta.url),'utf8');
const settle=()=>new Promise(resolve=>setImmediate(resolve));

function rerollHarness({deferred=false}={}){
  let observer,calls=0,writes=0,button;const mutations=[],requests=[],events=new Map();
  const makeButton=()=>{let text='등급별 계정 1회';const small={get textContent(){return text;},set textContent(value){writes++;text=value;mutations.push(observer);}};return {hidden:true,disabled:true,querySelector:()=>small};};
  button=makeButton();
  const context={document:{documentElement:{},getElementById:()=>button},apiRequest:()=>{calls++;return deferred?new Promise((resolve,reject)=>requests.push({resolve,reject})):Promise.resolve({visible:true,ticketQuantity:3});},MutationObserver:class{constructor(fn){observer=fn;}observe(){}},addEventListener:(type,fn)=>events.set(type,fn)};
  context.window=context;vm.runInNewContext(read('js/high-grade-reroll-v1354.js'),context);
  return {inject:()=>context.HighGradeReroll.injectButton(),mutate:()=>observer(),events,requests,get calls(){return calls;},get writes(){return writes;},get button(){return button;},replace(){button=makeButton();observer();},async flush(){for(let i=0;i<20;i++){await settle();if(!mutations.length)return;mutations.splice(0).forEach(fn=>fn());}assert.fail('observer feedback loop did not stop');}};
}
test('dex reroll label settles after one read and one write; unrelated mutations never restart it',async()=>{
  const h=rerollHarness();h.inject();await h.flush();assert.equal(h.calls,1);assert.equal(h.writes,1);
  for(let i=0;i<1000;i++)h.mutate();await h.flush();assert.equal(h.calls,1);assert.equal(h.writes,1);
  assert.equal(h.button.hidden,false);assert.equal(h.button.querySelector().textContent,'재뽑기권 3개');
});
test('a replacement dex button joins the in-flight read, while a removed button is not updated',async()=>{
  const h=rerollHarness({deferred:true});h.inject();const previous=h.button;h.replace();assert.equal(h.calls,1);
  h.requests[0].resolve({visible:true,ticketQuantity:7});await h.flush();assert.equal(previous.hidden,true);assert.equal(h.button.hidden,false);assert.equal(h.writes,1);
});
test('account changes refresh the button and ignore an old-account response',async()=>{
  const h=rerollHarness({deferred:true});h.inject();h.events.get('cnine:player-updated')();assert.equal(h.calls,2);
  h.requests[1].resolve({visible:false,ticketQuantity:0});await h.flush();h.requests[0].resolve({visible:true,ticketQuantity:9});await h.flush();assert.equal(h.button.hidden,true);assert.equal(h.button.querySelector().textContent,'재뽑기권 0개');
});
test('failed state fetch does not trigger an observer retry storm, but re-entry retries',async()=>{
  const h=rerollHarness({deferred:true});h.inject();h.requests[0].reject(Error('offline'));await h.flush();
  for(let i=0;i<100;i++)h.mutate();assert.equal(h.calls,1);h.replace();assert.equal(h.calls,2);h.requests[1].resolve({visible:false});await h.flush();
});
test('auto opening keeps existing authenticated receipt APIs and explicitly chooses Black Miracle slot one',()=>{
  const hyper=read('js/mercenary-pack-live.mjs'),black=read('js/black-miracle-opening-v1926.js'),app=read('js/app.js'),index=read('index.html');
  assert.match(hyper,/Math\.min\(chunk,n-session\.completed\)/);
  assert.match(hyper,/state\.accountId\)!==autoSession\.accountId/);
  assert.match(hyper,/if\(autoSession&&pending\)/);
  assert.match(black,/data-black-miracle-auto-choice="0"/);
  assert.match(black,/if\(state\.fastMode\)\{renderFastResult\(\);return;\}/);
  const fastBranch=hyper.slice(hyper.indexOf('if(autoSession){'),hyper.indexOf('const dialog=document.createElement'));
  assert.match(fastBranch,/autoSession\.showResults\(results\)/);
  assert.doesNotMatch(fastBranch,/HyperPackFX|MercenaryAcquisitionVideo|new Image|script\(/);
  assert.match(black,/JSON\.stringify\(\{itemCode:'BLACK_MIRACLE_PACK',requestId:state\.requestId\}\)/);
  assert.match(black,/if\(state\.closed\)return/);
  assert.match(app,/loadUser,\s*saveUser,\s*apiUserToLocal/);
  const modulePath=app.match(/import\('\.\/(mercenary-pack-live\.mjs[^']+)'\)/)[1];
  assert.ok(index.replaceAll('&amp;','&').includes(modulePath),'module URL must match so only one click listener runs');
  assert.match(app,/high-grade-reroll-v1354\.js[^']*dexPerf=20260924/);
});
