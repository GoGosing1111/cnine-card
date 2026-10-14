import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const read=file=>fs.readFileSync(new URL('../'+file,import.meta.url),'utf8');
const app=read('js/app.js'),worker=read('service-worker.js');
const route=app.slice(app.indexOf('async function openInventoryPack('),app.indexOf('async function openMagicCardPack('));
const code='PINGDU_THANKS_GIFT_BOX';

function inventoryRoute({failFirst=false}={}){
  const alerts=[],opened=[],loads=[],pending=new Map([['cnine:pingdu-thanks-gift:7:pending','original-receipt']]);
  const context=vm.createContext({window:{},console:{warn:()=>{}},alert:message=>alerts.push(message),
    apiRequest:()=>{throw Error('Preview must not submit a reward request');},
    clearApiCache:()=>{},loadUser:()=>({serverUserId:7}),saveUser:()=>{},apiUserToLocal:x=>x,renderShell:()=>{},
    localStorage:{getItem:key=>pending.get(key),removeItem:key=>pending.delete(key)},
    ensureFeatureResources:async key=>{
      loads.push(key);if(failFirst&&loads.length===1)throw Error('network unavailable');
      context.window.PingduThanksGiftV1={open:(deps,quantity)=>{opened.push({deps,quantity});}};
    }});
  vm.runInContext(route,context);
  return {context,alerts,opened,loads,pending};
}

test('a new app with an older HTML shell loads the missing gift module before opening',async()=>{
  const f=inventoryRoute();await f.context.openInventoryPack(code,5);
  assert.deepEqual(f.loads,['pingduThanksGift']);assert.equal(f.opened.length,1);
  assert.equal(f.opened[0].quantity,5);assert.equal(f.opened[0].deps.apiRequest,f.context.apiRequest);
  assert.deepEqual(f.alerts,[]);assert.equal(f.pending.get('cnine:pingdu-thanks-gift:7:pending'),'original-receipt');
});

test('a failed resource load leaves all rewards untouched and permits an explicit retry',async()=>{
  const f=inventoryRoute({failFirst:true});await f.context.openInventoryPack(code,5);
  assert.equal(f.opened.length,0);assert.equal(f.alerts.length,1);
  assert.notEqual(f.alerts[0],'이 아이템의 사용 화면을 찾을 수 없습니다.');
  assert.equal(f.pending.get('cnine:pingdu-thanks-gift:7:pending'),'original-receipt');
  await f.context.openInventoryPack(code,5);assert.equal(f.opened.length,1);assert.equal(f.opened[0].quantity,5);
});

function workerFixture(){
  const handlers={},entries=new Map(),removed=[],cacheNames=['soop-card-shell-v2108-shared-navigation-ranked-reform-20261002-retired-20261001-gift-recovery-ranked-energy150-furFrames14-15','soop-card-content-v3-media-integrity'];
  let offline=false,fetches=0;
  const cache={keys:async()=>[...entries.keys()].map(url=>({url})),match:async request=>entries.get(request.url||request)?.clone(),
    put:async(request,response)=>entries.set(request.url||request,response),delete:async request=>entries.delete(request.url||request),addAll:async()=>{}};
  const context=vm.createContext({URL,Response,self:{location:{origin:'https://test.invalid'},addEventListener:(name,fn)=>handlers[name]=fn,clients:{claim:async()=>{}},skipWaiting:()=>{}},
    caches:{keys:async()=>cacheNames,open:async()=>cache,delete:async name=>{removed.push(name);return true;},match:async()=>undefined},
    fetch:async()=>{fetches++;if(offline)throw Error('offline');return new Response('current gift module',{headers:{'content-type':'text/javascript'}});}});
  vm.runInContext(worker,context);
  return {entries,removed,get fetches(){return fetches;},set offline(value){offline=value;},
    activate:async()=>{let work;handlers.activate({waitUntil:value=>work=value});await work;},
    request:async url=>{let result;handlers.fetch({request:{url:'https://test.invalid'+url,method:'GET',mode:'cors',destination:'script'},respondWith:value=>result=value,waitUntil:()=>{}});return result?await result:undefined;}};
}

test('installed clients revalidate old gift module URLs and keep the last valid copy offline',async()=>{
  const f=workerFixture(),url='/js/pingdu-thanks-gift-v1.js?v=20261002';
  f.entries.set('https://test.invalid'+url,new Response('stale gift module',{headers:{'content-type':'text/javascript'}}));
  assert.equal(await (await f.request(url)).text(),'current gift module');assert.equal(f.fetches,1);
  f.offline=true;assert.equal(await (await f.request(url)).text(),'current gift module');assert.equal(f.fetches,2);
  assert.equal(await f.request('/api/inventory'),undefined);
});

test('the gift release invalidates the previous shell cache while preserving media',async()=>{
  const f=workerFixture();await f.activate();
  assert.equal(f.removed.length,1);assert.ok(f.removed[0].endsWith('furFrames14-15'));
  const appTag=read('index.html').match(/js\/app\.js\?v=([^"'&]+)/)?.[1];
  const shellTag=worker.match(/soop-card-shell-v([^']+)/)?.[1];
  assert.ok(appTag);assert.equal(appTag,shellTag);assert.notEqual('soop-card-shell-v'+shellTag,f.removed[0]);
});
