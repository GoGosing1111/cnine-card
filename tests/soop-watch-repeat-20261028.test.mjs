import test from 'node:test';
import assert from 'node:assert/strict';
import {createSoopWatchConsent,SOOP_NOTICE_VERSION} from '../js/soop-watch-consent-v1.mjs';

const noticeKey=id=>`cnine_soop_watch_notice:${SOOP_NOTICE_VERSION}:${id}`,pendingKey='cnine_soop_watch_reconnect:v1';
const result=identityAvailable=>({soopWatch:{identityAvailable}});
const store=()=>{const data=new Map();return {getItem:k=>data.get(k)||null,setItem:(k,v)=>data.set(k,v),removeItem:k=>data.delete(k)};};
function fixture({storage=store(),temporaryStorage=store(),account=7,request}={}){
  const handlers={},nodes=new Map(),navigation=[];let current=null;
  globalThis.window={addEventListener:(name,fn)=>handlers[name]=fn,removeEventListener:()=>{}};
  function node(){return {dataset:{},hidden:false,events:{},focus(){},setAttribute(){},addEventListener(name,fn){this.events[name]=fn;}};}
  const doc={head:{append(){}},body:{append(el){current=el;}},activeElement:null,
    querySelector:s=>s.includes('dialog[open]')?current:null,
    createElement(tag){const el=node();if(tag==='dialog'){
      el.querySelector=s=>{if(!nodes.has(s))nodes.set(s,node());return nodes.get(s);};
      el.querySelectorAll=()=>[el.querySelector('[data-soop-close]'),el.querySelector('footer [data-soop-close]')];
      el.showModal=()=>{};el.close=()=>{};el.remove=()=>current=null;
    }return el;}};
  const state={account,session:'session-a'},controller=createSoopWatchConsent({getUser:()=>({serverUserId:state.account}),getSession:()=>state.session,storage,temporaryStorage,doc,
    request:request||(async()=>({verification:{provider:'PLAYDK'},playdk:{enabled:true,startUrl:'https://www.playdk.kr/api/v2/g/skm'}})),navigate:url=>navigation.push(url)});
  return {controller,storage,temporaryStorage,state,handlers,nodes,navigation,get dialog(){return current;},async reconnect(){const button=nodes.get('[data-soop-reconnect]');await button.events.click({currentTarget:button});}};
}
test('ordinary confirmed entries never show a popup, including a fresh browser and reload',()=>{
  const f=fixture();assert.equal(f.controller.open({automatic:true,verificationResult:result(true)}),false);
  assert.equal(f.storage.getItem(noticeKey(7)),'shown');assert.equal(f.controller.open({automatic:true}),false);
  for(let n=0;n<3;n++)assert.equal(f.controller.open({automatic:true,verificationResult:result(true)}),false);
  const reloaded=fixture({storage:f.storage,temporaryStorage:f.temporaryStorage});assert.equal(reloaded.controller.open({automatic:true,verificationResult:result(true)}),false);
  assert.equal(reloaded.controller.open(),true,'Manual settings remains available');
});
test('missing provision still shows the first optional notice but never repeats an acknowledged notice',()=>{
  for(const verificationResult of [result(false),{}]){
    const f=fixture();assert.equal(f.controller.open({automatic:true,verificationResult}),true);f.controller.close();
    assert.equal(f.controller.open({automatic:true,verificationResult}),false);
    const reloaded=fixture({storage:f.storage});assert.equal(reloaded.controller.open({automatic:true,verificationResult}),false);
  }
});
test('explicit reconnect survives navigation, shows one result, and never stores consent or provider identity',async()=>{
  for(const available of [true,false]){
    const f=fixture();f.controller.open();await f.reconnect();assert.equal(f.navigation.length,1);
    const intent=JSON.parse(f.temporaryStorage.getItem(pendingKey));assert.deepEqual(Object.keys(intent).sort(),['account','at']);assert.equal(intent.account,7);
    const returned=fixture({storage:f.storage,temporaryStorage:f.temporaryStorage});
    assert.equal(returned.controller.open({automatic:true,verificationResult:result(available)}),true);assert.equal(returned.temporaryStorage.getItem(pendingKey),null);
    assert.equal(returned.nodes.get('[data-soop-reconnect]').hidden,available);
    returned.controller.close();assert.equal(returned.controller.open({automatic:true,verificationResult:result(available)}),false);
    assert.equal(returned.storage.getItem(noticeKey(7)),'shown');
  }
});
test('reconnect intent cannot force a popup for another account, an expired request, or malformed data',()=>{
  for(const intent of [{account:8,at:Date.now()},{account:7,at:Date.now()-600001},{account:7,at:Date.now()+60000},{account:7},'broken']){
    const f=fixture();f.temporaryStorage.setItem(pendingKey,typeof intent==='string'?intent:JSON.stringify(intent));
    assert.equal(f.controller.open({automatic:true,verificationResult:result(true)}),false);assert.equal(f.temporaryStorage.getItem(pendingKey),null);
  }
});
test('blocked browser storage keeps ordinary provision silent and preserves in-memory notice suppression',()=>{
  const blocked={getItem(){throw Error('blocked');},setItem(){throw Error('blocked');},removeItem(){throw Error('blocked');}};
  const f=fixture({storage:blocked,temporaryStorage:blocked});
  assert.equal(f.controller.open({automatic:true,verificationResult:result(true)}),false);assert.equal(f.controller.open({automatic:true}),false);
  assert.equal(f.controller.open(),true);f.controller.close();assert.equal(f.controller.open({automatic:true,verificationResult:result(false)}),false);
});
test('account or session changes during reconnect never navigate or leave an intent',async()=>{
  for(const change of [state=>state.account=8,state=>state.session='session-b']){
    let resolve;const response=new Promise(r=>resolve=r);const f=fixture({request:()=>response});f.controller.open();const pending=f.reconnect();
    change(f.state);resolve({playdk:{enabled:true,startUrl:'https://www.playdk.kr/api/v2/g/skm'}});await pending;
    assert.equal(f.navigation.length,0);assert.equal(f.temporaryStorage.getItem(pendingKey),null);assert.equal(f.dialog,null);
  }
});
test('bad provider URLs and existing WAGO links never create a reconnect intent',async()=>{
  for(const response of [{verification:{provider:'WAGO'},playdk:{enabled:true,startUrl:'https://www.playdk.kr/api/v2/g/skm'}},{playdk:{enabled:true,startUrl:'https://playdk.kr.attacker.invalid/api/v2/g/skm'}}]){
    const f=fixture({request:async()=>response});f.controller.open();await f.reconnect();assert.equal(f.navigation.length,0);assert.equal(f.temporaryStorage.getItem(pendingKey),null);
  }
});
