import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';

const app=readFileSync(new URL('../js/app.js',import.meta.url),'utf8');
const snippet=(start,end)=>app.slice(app.indexOf(start),app.indexOf(end,app.indexOf(start)));
const response=()=>({requestId:'request-1234',packId:'superstar',count:10,cost:3000000000,coin:2000000000,cardShards:1300,drawProtocol:{status:'COMPLETED'},results:Array.from({length:10},(_,slot)=>({slot,hit:[0,4,8].includes(slot),card:[0,4,8].includes(slot)?{id:'S1',grade:'SUPERSTAR',title:'스타'}:null,quantityBefore:slot===0?0:slot===4?1:2,quantityAfter:slot===0?1:slot===4?2:3,duplicate:slot!==0}))});
function context(globals={}){return vm.createContext({console,...globals})}

test('client rejects wrong receipts, price, count, order, and incomplete card grants',()=>{
  const ctx=context();vm.runInContext(snippet('function validateSuperstarPackResponse(','async function revealSuperstarPackBatch('),ctx);
  const expected={requestId:'request-1234',count:10,cost:3000000000};
  assert.equal(ctx.validateSuperstarPackResponse(response(),expected).results.length,10);
  for(const mutate of [r=>r.requestId='wrong',r=>r.cost=300000000,r=>r.count=1,r=>r.results.pop(),r=>r.results[0].slot=1,r=>r.results[0].card.grade='UR',r=>r.results[0].quantityAfter=0]){
    const r=response();mutate(r);assert.throws(()=>ctx.validateSuperstarPackResponse(r,expected));
  }
});

test('applying a recovered batch preserves every winning slot and does not duplicate history',()=>{
  let user={coin:5000000000,owned:['old'],quantities:{old:2},history:[]};const cache=[];
  const ctx=context({loadUser:()=>user,saveUser:value=>{user=value},mergeClientCards:()=>{},clearApiCache:key=>cache.push(key)});
  vm.runInContext(snippet('function applySuperstarPackResultToUser(','async function revealSuperstarPackResult('),ctx);
  ctx.applySuperstarPackResultToUser(response());ctx.applySuperstarPackResultToUser(response());
  assert.equal(user.coin,2000000000);assert.equal(user.cardShards,1300);assert.equal(user.quantities.S1,3);assert.equal(user.quantities.old,2);
  assert.deepEqual([...user.owned],['old','S1']);assert.equal(user.history.length,3);
  assert.equal(new Set(user.history.map(row=>row.superstarReceiptKey)).size,3);assert.ok(cache.includes('me'));
});

function opening({pending=null,coin=5000000000,enabled=true}={}){
  let mounted=null,writes=[],calls=[];
  const ctx=context({getPack:()=>({price:300000000,drawEnabled:enabled}),loadUser:()=>({id:1,coin}),readPendingSuperstarDraw:()=>pending,writePendingSuperstarDraw:value=>writes.push(value),superstarPackAccess:()=>({owner:false,early:false}),showSupplyNotice:()=>{},alert:()=>{},superstarPackOpeningBusy:false,crypto:{randomUUID:()=> 'new-request-1234'},mountSuperstarPackOpening:(pack,cost,factory,options)=>{mounted={cost,factory,options}},requestSuperstarPackDraw:async(...args)=>{calls.push(args);return response()},validateSuperstarPackResponse:r=>r});
  vm.runInContext(snippet('async function openSuperstarPack(','window.SuperstarPackV1894='),ctx);
  return {ctx,writes,calls,get mounted(){return mounted}};
}

test('10-pack modal computes the full cost, and only the confirmed swipe creates the request',async()=>{
  const f=opening();await f.ctx.openSuperstarPack('superstar',1,10);
  assert.equal(f.mounted.cost,3000000000);assert.equal(f.writes.length,0);assert.equal(f.calls.length,0);
  await f.mounted.factory();assert.equal(f.writes.length,1);assert.equal(f.writes[0].count,10);assert.equal(f.writes[0].accountId,'1');
  assert.deepEqual(f.calls[0],['new-request-1234',10,3000000000]);
});

test('recovery reuses the original count/request/cost/animation position while OFF or short of coins',async()=>{
  const pending={requestId:'paid-request-1234',count:10,cost:3000000000,accountId:'1',nextIndex:6};
  const f=opening({pending,coin:0,enabled:false});await f.ctx.openSuperstarPack('superstar',300000000,1);
  assert.equal(f.mounted.options.count,10);assert.equal(f.mounted.options.pending.nextIndex,6);
  await f.mounted.factory();assert.deepEqual(f.calls[0],['paid-request-1234',10,3000000000]);assert.equal(f.writes.length,0);
  const other=opening({pending:{...pending,accountId:'2'},coin:0,enabled:false});await other.ctx.openSuperstarPack('superstar',1,10);assert.equal(other.mounted,null);
});

test('short total balance and invalid count cannot start a new draw',async()=>{
  const f=opening({coin:2999999999});await f.ctx.openSuperstarPack('superstar',1,10);assert.equal(f.mounted,null);
  const invalid=opening();await invalid.ctx.openSuperstarPack('superstar',1,2);assert.equal(invalid.mounted,null);
});

test('pending retries retain the exact request and payload, with no second payment identity',async()=>{
  const calls=[];let tries=0;
  const ctx=context({drawBrowserId:()=> 'client-1234567890',superstarOpeningSleep:async()=>{},apiRequest:async(path,options)=>{calls.push({path,...options});if(++tries<3)throw Object.assign(new Error('pending'),{status:tries===1?409:503,code:'SUPERSTAR_DRAW_PENDING'});return response()}});
  vm.runInContext(snippet('async function requestSuperstarPackDraw(','function superstarPackOpeningMarkup('),ctx);
  await ctx.requestSuperstarPackDraw('same-request-1234',10,3000000000);
  assert.equal(calls.length,3);assert.equal(new Set(calls.map(row=>row.body)).size,1);
  assert.deepEqual(JSON.parse(calls[0].body),{packId:'superstar',count:10,expectedCost:3000000000,requestId:'same-request-1234'});
});
