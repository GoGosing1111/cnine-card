import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {randomUUID} from 'node:crypto';
import {MERCENARY_PACK,mercenaryPackResults} from '../shared/mercenary-pack-contract-v1.mjs';
const read=file=>fs.readFileSync(new URL('../'+file,import.meta.url),'utf8');
const json=(value,status=200)=>new Response(JSON.stringify(value),{status,headers:{'content-type':'application/json'}});

function harness({postFault=null,commit=true,stateFaults=0,receiptFault=null}={}){
 const storage=new Map(),receipts=new Map(),calls=[],shown=[],statuses=[{textContent:''}];let coin=10000000000,mutations=0;
 const h={postFault,commit,stateFaults,receiptFault,storage,receipts,calls,shown,pendingKey:'cnine.mercenary.pack.pending:7'};
 const context={MERCENARY_PACK,mercenaryPackResults,Response,AbortController,URLSearchParams,crypto:{randomUUID},console,
  localStorage:{getItem:k=>storage.get(k)||null,setItem:(k,v)=>storage.set(k,v),removeItem:k=>storage.delete(k)},
  sessionStorage:{getItem:()=>null},setTimeout,clearTimeout,setInterval:()=>1,clearInterval(){},addEventListener(){},CustomEvent:class{},Event,
  document:{hidden:false,body:{},addEventListener(){},querySelector(){return null;},querySelectorAll:s=>s==='[data-mercenary-open-status]'?statuses:[]},
  MutationObserver:class{observe(){}disconnect(){}},dispatchEvent:event=>{if(event.type==='cnine:account-mutation')mutations++;},
  showMercenaryReceipt:async receipt=>shown.push(receipt),
  fetch:async(url,options)=>{
   const path=url.slice(5),body=options.body?JSON.parse(options.body):null;calls.push({path,method:options.method,body});
   if(path===MERCENARY_PACK.featurePath)return json({userOpeningEnabled:true});
   if(path===MERCENARY_PACK.statePath)return h.stateFaults-->0?new Response(''):json({accountId:7,openingAvailable:true});
   if(path.startsWith(MERCENARY_PACK.receiptPath+'?')){
    if(h.receiptFault)return h.receiptFault();
    const value=receipts.get(new URLSearchParams(path.split('?')[1]).get('requestId'));
    return value?json(value):json({code:'JOINT_NOT_FOUND',error:'내 요청 기록을 찾을 수 없습니다.'},404);
   }
   if(h.commit&&!receipts.has(body.requestId)){
    coin-=body.count*MERCENARY_PACK.price;
    receipts.set(body.requestId,{status:'COMPLETED',requestId:body.requestId,coinCost:body.count*MERCENARY_PACK.price,draws:Array.from({length:body.count},()=>({outcomeId:'MASTER_STAR',quantity:3}))});
   }
   return h.postFault?h.postFault():json(receipts.get(body.requestId));
  }
 };context.window=context;
 vm.createContext(context);
 vm.runInContext(read('js/joint-account-transport.mjs').replace(/^export /gm,'')+'\nglobalThis.api=jointAccountRequest;',context);
 const source=read('js/mercenary-pack-live.mjs').replace(/^import .+;\r?\n/gm,'').replace(/export async function showMercenaryReceipt[\s\S]*?(?=async function open\()/,'');
 vm.runInContext(source,context);
 return Object.assign(h,{pack:context.MercenaryPack,context,posts:()=>calls.filter(call=>call.method==='POST'),getCoin:()=>coin,status:()=>statuses[0].textContent,mutations:()=>mutations});
}

test('empty/non-JSON responses keep HTTP status and never report a completed mutation',async()=>{
 const h=harness();
 for(const [body,status,retryable] of [['',200,true],['{"cut":',200,true],['<html>upstream unavailable</html>',502,true],['',404,false]]){
  h.context.fetch=async()=>new Response(body,{status});
  await assert.rejects(h.context.api('test',{method:'POST',body:{requestId:'same'}}),error=>error.code==='JOINT_RESPONSE_INVALID'&&error.status===status&&error.retryable===retryable&&!/JSON|html|Unexpected/.test(error.message));
 }
 assert.equal(h.mutations(),0);
 h.context.fetch=async()=>json({code:'MERCENARY_AUTH',error:'로그인이 필요합니다.'},401);
 await assert.rejects(h.context.api('test'),error=>error.code==='MERCENARY_AUTH'&&error.status===401&&error.message==='로그인이 필요합니다.');
});

test('an empty preflight read retries once before the one authorized debit',async()=>{
 const h=harness({stateFaults:1});assert.equal(await h.pack.open(10),true);
 assert.equal(h.calls.filter(call=>call.path===MERCENARY_PACK.statePath).length,2);
 assert.equal(h.posts().length,1);assert.equal(h.getCoin(),5000000000);assert.equal(h.shown.length,1);
});

test('lost/empty/truncated opening response recovers the same completed receipt with GET only',async()=>{
 for(const postFault of [()=>new Response(''),()=>new Response('{"status":'),()=>new Response('<html>bad gateway</html>',{status:502}),()=>{throw new TypeError('Failed to fetch');}]){
  const h=harness({postFault});assert.equal(await h.pack.open(10),true);
  assert.equal(h.posts().length,1);assert.equal(h.getCoin(),5000000000);assert.equal(h.shown.length,1);
  assert.equal(h.shown[0].requestId,h.posts()[0].body.requestId);assert.equal(h.storage.has(h.pendingKey),false);
  assert.ok(h.calls.some(call=>call.method==='GET'&&call.path.endsWith(h.posts()[0].body.requestId)));
 }
});

test('unconfirmed response stops with Korean guidance; explicit recovery reuses the original request',async()=>{
 const h=harness({commit:false,postFault:()=>new Response('')});
 assert.equal(await h.pack.open(10),false);assert.equal(h.posts().length,1);assert.equal(h.getCoin(),10000000000);
 assert.match(h.status(),/이전 개봉 처리 확인/);assert.doesNotMatch(h.status(),/JSON|Unexpected/);
 const pending=JSON.parse(h.storage.get(h.pendingKey));assert.equal(pending.requestId,h.posts()[0].body.requestId);
 h.commit=true;h.postFault=null;assert.equal(await h.pack.recover(),true);
 assert.equal(h.posts().length,2);assert.equal(h.posts()[1].body.requestId,pending.requestId);assert.equal(h.getCoin(),5000000000);
});

test('an empty 404 is not proof that a pending receipt is missing and cannot trigger another POST',async()=>{
 const h=harness({receiptFault:()=>new Response('',{status:404})});
 const pending={requestId:'pending-before-disconnection',count:10};h.storage.set(h.pendingKey,JSON.stringify(pending));
 assert.equal(await h.pack.recover(),false);assert.equal(h.posts().length,0);assert.equal(h.getCoin(),10000000000);
 assert.equal(JSON.parse(h.storage.get(h.pendingKey)).requestId,pending.requestId);assert.doesNotMatch(h.status(),/JSON|Unexpected/);
});

test('persistently empty state reads are bounded and never consume currency',async()=>{
 const h=harness({stateFaults:100});assert.equal(await h.pack.open(10),false);
 assert.equal(h.calls.filter(call=>call.path===MERCENARY_PACK.statePath).length,2);assert.equal(h.posts().length,0);
 assert.match(h.status(),/서버 응답/);assert.equal(h.storage.has(h.pendingKey),false);
});

test('explicit insufficient funds is not retried or treated as an unknown completed draw',async()=>{
 const h=harness({commit:false,postFault:()=>json({code:'MERCENARY_FUNDS',error:'코인이 부족합니다.'},400)});
 assert.equal(await h.pack.open(10),false);assert.equal(h.posts().length,1);
 assert.equal(h.calls.filter(call=>call.path.startsWith(MERCENARY_PACK.receiptPath+'?')).length,0);
 assert.equal(h.storage.has(h.pendingKey),false);assert.equal(h.status(),'코인이 부족합니다.');
});
