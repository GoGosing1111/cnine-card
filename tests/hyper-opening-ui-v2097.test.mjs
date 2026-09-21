import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {MERCENARY_PACK,mercenaryPackResults} from '../shared/mercenary-pack-contract-v1.mjs';
import {randomUUID} from 'node:crypto';

test('ON survives a store rerender; OFF and back navigation refresh the same status and buttons',async()=>{
 let enabled=true,observer,observations=0;const listeners=new Map(),replaceable={buttons:[{disabled:true}],labels:[{textContent:'개봉 준비 중'}],statuses:[{textContent:'용병카드 개봉은 현재 OFF입니다.'}]};
 const document={hidden:false,body:{},addEventListener(){},querySelector(){return replaceable.buttons[0];},querySelectorAll(selector){return selector==='[data-mercenary-open]'?replaceable.buttons:selector==='[data-hyper-opening-label]'?replaceable.labels:selector==='[data-mercenary-open-status]'?replaceable.statuses:[];}};
 const context={document,MERCENARY_PACK,api:async()=>({connected:true,userOpeningEnabled:enabled}),console,localStorage:{getItem:()=>null},setInterval:()=>1,clearInterval(){},addEventListener:(name,fn)=>listeners.set(name,fn),dispatchEvent(){},CustomEvent:class{constructor(type,options){this.type=type;this.detail=options?.detail;}},MutationObserver:class{constructor(fn){observer=fn;}observe(){observations++;}disconnect(){}}};context.window=context;
 const source=fs.readFileSync('js/mercenary-pack-live.mjs','utf8').replace(/^import .+;\r?\n/gm,'').replace(/^export /gm,'');vm.runInNewContext(source,context);
 const settle=()=>new Promise(resolve=>setImmediate(resolve));await settle();assert.equal(replaceable.buttons[0].disabled,false);assert.match(replaceable.statuses[0].textContent,/균등 추첨/);
 // syncButtons 는 DOM 변경마다 동기로 돌지 않고 프레임당 1회로 합쳐진다. 관찰자 호출 뒤 한 틱을 기다린다.
 replaceable.buttons=[{disabled:true}];replaceable.labels=[{textContent:'개봉 준비 중'}];replaceable.statuses=[{textContent:'용병카드 개봉은 현재 OFF입니다.'}];observer();await settle();assert.equal(replaceable.buttons[0].disabled,false);assert.equal(replaceable.labels[0].textContent,'용병 계약 개봉 가능');assert.doesNotMatch(replaceable.statuses[0].textContent,/OFF/);
 enabled=false;listeners.get('focus')();await settle();assert.equal(replaceable.buttons[0].disabled,true);assert.match(replaceable.statuses[0].textContent,/OFF/);
 listeners.get('pagehide')();enabled=true;listeners.get('pageshow')({persisted:true});await settle();assert.equal(observations,2);assert.equal(replaceable.buttons[0].disabled,false);assert.doesNotMatch(replaceable.statuses[0].textContent,/OFF/);
});

function openingHarness({storage=new Map(),receipts=new Map(),onPost,onShow}={}){
 const pendingKey='cnine.mercenary.pack.pending:7',receiptKey='cnine.mercenary.pack.receipt:7',posts=[],shown=[],statuses=[{textContent:''}];let coin=10000000000;
 const context={MERCENARY_PACK,mercenaryPackResults,crypto:{randomUUID},console,
  localStorage:{getItem:k=>storage.get(k)||null,setItem:(k,v)=>storage.set(k,v),removeItem:k=>storage.delete(k)},
  document:{hidden:false,body:{},addEventListener(){},querySelector(){return null;},querySelectorAll:s=>s==='[data-mercenary-open-status]'?statuses:[]},
  setInterval:()=>1,clearInterval(){},addEventListener(){},dispatchEvent(){},CustomEvent:class{},MutationObserver:class{observe(){}disconnect(){}},
  showMercenaryReceipt:async(receipt,options)=>{shown.push({receipt,options});await onShow?.(receipt,options);},
  api:async(path,options={})=>{
   if(path===MERCENARY_PACK.featurePath)return {connected:true,userOpeningEnabled:true};
   if(path===MERCENARY_PACK.statePath)return {accountId:7,available:true,openingAvailable:true};
   if(path.startsWith(MERCENARY_PACK.receiptPath+'?')){const id=new URLSearchParams(path.split('?')[1]).get('requestId');if(!receipts.has(id))throw Object.assign(Error('Not found'),{status:404});return receipts.get(id);}
   assert.equal(options.method,'POST');assert.ok([MERCENARY_PACK.openPath,MERCENARY_PACK.batchPath].includes(path));
   const body=JSON.parse(JSON.stringify(options.body));posts.push({path,...body});
   if(receipts.has(body.requestId))return receipts.get(body.requestId);
   const result={requestId:body.requestId,status:'COMPLETED',coinCost:body.count*MERCENARY_PACK.price,draws:Array.from({length:body.count},()=>({outcomeId:'NONE'}))};
   receipts.set(body.requestId,result);coin-=result.coinCost;await onPost?.(result);return result;
  }};context.window=context;
 let source=fs.readFileSync('js/mercenary-pack-live.mjs','utf8').replace(/^import .+;\r?\n/gm,'');
 // Exercise the real transaction flow; presentation is observed independently
 // so a page navigation can discard its close callback exactly as in a browser.
 source=source.replace(/export async function showMercenaryReceipt[\s\S]*?(?=async function open\()/,'');
 vm.runInNewContext(source,context);
 return {pack:context.MercenaryPack,posts,shown,storage,receipts,pendingKey,receiptKey,get coin(){return coin;},get status(){return statuses[0].textContent;}};
}

test('10 opens followed by navigation and a 1-open click use separate receipts and exact costs without closing the first result',async()=>{
 const shop=openingHarness();assert.equal(await shop.pack.open(10),true);
 assert.equal(shop.storage.has(shop.pendingKey),false);assert.equal(JSON.parse(shop.storage.get(shop.receiptKey)).count,10);
 const hangar=openingHarness(shop);assert.equal(await hangar.pack.open(1),true);
 assert.deepEqual([...shop.posts,...hangar.posts].map(p=>[p.path,p.count]),[[MERCENARY_PACK.batchPath,10],[MERCENARY_PACK.openPath,1]]);
 assert.notEqual(shop.posts[0].requestId,hangar.posts[0].requestId);assert.equal(shop.coin,5000000000);assert.equal(hangar.coin,9500000000);
 assert.equal(hangar.shown[0].receipt.draws.length,1);assert.equal(hangar.storage.has(hangar.pendingKey),false);
 await hangar.shown[0].options.onRepeat();assert.deepEqual(hangar.posts.map(p=>p.count),[1,1]);
});

test('legacy completed 10-open pending state is cleared before a newly selected single draw',async()=>{
 const h=openingHarness(),old={requestId:'old-completed-ten',count:10};h.storage.set(h.pendingKey,JSON.stringify(old));h.receipts.set(old.requestId,{requestId:old.requestId,status:'COMPLETED',draws:Array.from({length:10},()=>({outcomeId:'NONE'}))});
 assert.equal(await h.pack.open(1),true);assert.deepEqual(h.posts.map(p=>p.count),[1]);assert.equal(h.shown[0].receipt.draws.length,1);assert.equal(h.coin,9500000000);
});

test('unresolved 10-open request cannot replace a selected single draw; explicit recovery keeps its original id',async()=>{
 const h=openingHarness(),old={requestId:'old-unresolved-ten',count:10};h.storage.set(h.pendingKey,JSON.stringify(old));
 assert.equal(await h.pack.open(1),false);assert.equal(h.posts.length,0);assert.match(h.status,/이전 10회.*선택한 1회/);assert.equal(JSON.parse(h.storage.get(h.pendingKey)).requestId,old.requestId);
 assert.equal(await h.pack.recover(),true);assert.equal(h.posts[0].requestId,old.requestId);assert.equal(h.posts[0].count,10);assert.equal(h.storage.has(h.pendingKey),false);
});

test('lost response recovers the completed receipt without paying twice; completed receipt history is read-only',async()=>{
 const h=openingHarness({onPost:()=>{throw Error('network interrupted');}});
 assert.equal(await h.pack.open(10),false);assert.equal(h.posts.length,1);assert.equal(h.coin,5000000000);assert.equal(h.storage.has(h.pendingKey),true);
 assert.equal(await h.pack.recover(),true);assert.equal(h.posts.length,1);assert.equal(h.storage.has(h.pendingKey),false);
 assert.equal(await h.pack.recover(),true);assert.equal(h.posts.length,1);assert.equal(h.coin,5000000000);
 h.receipts.clear();assert.equal(await h.pack.recover(),false);assert.equal(h.posts.length,1);
});

test('rapid duplicate clicks send one request; an inconsistent receipt never clears a pending transaction',async()=>{
 let release;const h=openingHarness({onPost:()=>new Promise(resolve=>{release=resolve;})});
 const first=h.pack.open(1),duplicate=h.pack.open(10);assert.match(h.status,/이전 개봉 요청을 처리/);assert.equal(await duplicate,false);while(!release)await new Promise(resolve=>setImmediate(resolve));release();assert.equal(await first,true);assert.equal(h.posts.length,1);
 const bad=openingHarness(),pending={requestId:'bad-receipt',count:1};bad.storage.set(bad.pendingKey,JSON.stringify(pending));bad.receipts.set(pending.requestId,{requestId:pending.requestId,status:'COMPLETED',draws:Array.from({length:10},()=>({outcomeId:'NONE'}))});
 assert.equal(await bad.pack.open(1),false);assert.equal(bad.posts.length,0);assert.equal(bad.storage.has(bad.pendingKey),true);assert.match(bad.status,/횟수와 개봉 결과가 다릅니다/);
});

test('a stalled presentation releases the transaction lock and its late completion cannot unlock a later request',async()=>{
 let finishPresentation,finishPost,shown=0,posted=0;
 const h=openingHarness({onShow:()=>++shown===1?new Promise(resolve=>{finishPresentation=resolve;}):undefined,
  onPost:()=>++posted===2?new Promise(resolve=>{finishPost=resolve;}):undefined});
 const first=h.pack.open(10);
 while(!finishPresentation)await new Promise(resolve=>setImmediate(resolve));
 assert.equal(h.storage.has(h.pendingKey),false);
 const second=h.shown[0].options.onRepeat();
 while(!finishPost)await new Promise(resolve=>setImmediate(resolve));
 finishPresentation();assert.equal(await first,true);
 assert.equal(await h.pack.open(1),false);assert.equal(h.posts.length,2);
 finishPost();assert.equal(await second,true);assert.equal(h.posts.length,2);
});

test('DOM churn coalesces without account reparsing; account and storage updates refresh the recovery button',async()=>{
 let observer,reads=0,accountId=7;const frames=[],listeners=new Map(),storage=new Map(),recover={textContent:'',setAttribute(){}};
 const context={MERCENARY_PACK,console,document:{hidden:false,body:{},addEventListener(){},querySelector(){return null;},
  querySelectorAll:s=>s==='[data-mercenary-recover]'?[recover]:[]},loadUser:()=>{reads++;return {serverUserId:accountId};},
  localStorage:{getItem:k=>storage.get(k)||null},api:async()=>({connected:true,userOpeningEnabled:true}),
  requestAnimationFrame:fn=>frames.push(fn),setInterval:()=>1,clearInterval(){},addEventListener:(name,fn)=>listeners.set(name,fn),
  dispatchEvent(){},CustomEvent:class{},MutationObserver:class{constructor(fn){observer=fn;}observe(){}disconnect(){}}};
 context.window=context;vm.runInNewContext(fs.readFileSync('js/mercenary-pack-live.mjs','utf8').replace(/^import .+;\r?\n/gm,'').replace(/^export /gm,''),context);
 await new Promise(resolve=>setImmediate(resolve));const initialReads=reads;
 for(let i=0;i<100;i++)observer();assert.equal(frames.length,1);frames.shift()();assert.equal(reads,initialReads);assert.equal(recover.hidden,true);
 storage.set('cnine.mercenary.pack.pending:7','pending');listeners.get('cnine:account-mutation')();frames.shift()();
 assert.equal(reads,initialReads+1);assert.equal(recover.hidden,false);assert.equal(recover.textContent,'이전 개봉 처리 확인');
 accountId=8;listeners.get('cnine:player-updated')();frames.shift()();assert.equal(recover.hidden,true);
 storage.set('cnine.mercenary.pack.receipt:8','receipt');listeners.get('storage')({key:'cnine.mercenary.pack.receipt:8'});frames.shift()();
 assert.equal(recover.hidden,false);assert.equal(recover.textContent,'최근 개봉 결과');
});
