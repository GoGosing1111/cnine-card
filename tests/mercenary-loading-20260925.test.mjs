import test from 'node:test';
import assert from 'node:assert/strict';
import {withMercenaryDeadline} from '../shared/mercenary-loading-v1.mjs';
import {FusionTextures} from '../mercenary-codex/fusion/textures.mjs';
import {FusionFX} from '../mercenary-codex/fusion/fx.mjs';
import {mercenaryCmsRequest} from '../admin/mercenary-request-v1.mjs';
import {readRegisteredMercenaryCms} from '../functions/_mercenary_cms_read.js';

const deferred=()=>{let resolve,reject;const promise=new Promise((a,b)=>{resolve=a;reject=b;});return {promise,resolve,reject};};
test('closing an unresolved load releases immediately and a late result cannot replace it',async()=>{
  const pending=deferred(),controller=new AbortController();
  const wait=withMercenaryDeadline(pending.promise,{signal:controller.signal});
  controller.abort();await assert.rejects(wait,{name:'AbortError'});
  pending.resolve('late');assert.equal(await withMercenaryDeadline(Promise.resolve('reopened')),'reopened');
});
test('an unresolved task times out without waiting for an abort-aware transport',async()=>{
  await assert.rejects(withMercenaryDeadline(new Promise(()=>{}),{timeoutMs:10}),{code:'MERCENARY_LOAD_TIMEOUT'});
});
test('already closed screens do not start their resource requests',async()=>{
  const controller=new AbortController();controller.abort();let starts=0;
  await assert.rejects(withMercenaryDeadline(()=>{starts++;},{signal:controller.signal}),{name:'AbortError'});
  assert.equal(starts,0);
});

function textureFixture(){
  const requests=[],created=[];
  class FakeImage {
    set src(value){this.url=value;requests.push(this);}
    removeAttribute(name){assert.equal(name,'src');this.cancelled=true;}
  }
  const textures=new FusionTextures({Sprite:{from(image,skipCache){assert.equal(skipCache,true);const texture={image,destroy(){this.destroyed=true;}};created.push(texture);return {texture,destroy(){}};}}},{ImageClass:FakeImage,timeoutMs:15});
  return {textures,requests,created};
}
test('eight identical materials share one image load; resolved textures reuse the same object',async()=>{
  const f=textureFixture();const waits=Array.from({length:8},()=>f.textures.load('/same.webp'));
  await Promise.resolve();assert.equal(f.requests.length,1);f.requests[0].onload();
  const values=await Promise.all(waits);assert.ok(values.every(v=>v===values[0]));
  assert.equal(await f.textures.load('/same.webp'),values[0]);assert.equal(f.requests.length,1);
  f.textures.destroy();assert.equal(f.created[0].destroyed,true);
});
test('timed-out images abort and are evicted so retry actually issues a fresh request',async()=>{
  const f=textureFixture();await assert.rejects(f.textures.load('/slow.webp'),{code:'MERCENARY_LOAD_TIMEOUT'});
  assert.equal(f.requests[0].cancelled,true);
  const retry=f.textures.load('/slow.webp');await Promise.resolve();assert.equal(f.requests.length,2);
  assert.notEqual(f.requests[0].url,f.requests[1].url,'a stalled browser image request cannot be reused');
  f.requests[1].onload();assert.ok(await retry);f.textures.destroy();
});
test('close cancels image loading and late completion never creates a texture',async()=>{
  const f=textureFixture(),wait=f.textures.load('/late.webp');await Promise.resolve();const late=f.requests[0].onload;
  f.textures.destroy();late();await assert.rejects(wait,{name:'AbortError'});assert.equal(f.created.length,0);assert.equal(f.requests[0].cancelled,true);
});
test('result art starts alongside materials and uses the 640px derivative before any original',async()=>{
  const material=deferred(),urls=[],applied=[];
  class Container{addChild(){} }
  class Sprite{constructor(){this.anchor={set(){}};} }
  const fx={generation:0,pixi:{Container,Sprite},controller:new AbortController(),
    textures:{load(url){urls.push(url);return url.includes('320')?material.promise:Promise.resolve('result texture');}},
    cardsLayer:{removeChildren:()=>[],addChild(){}},frame:{texture:{}},art:{},sound:{},render(){applied.push(this.resultCard.code);}};
  const card={code:'V-004',rank:'SS',sourceArt:'original.png'},result={code:'V-021',rank:'SSS',sourceArt:'large-result.png'};
  const pending=FusionFX.prototype.setCards.call(fx,[card],result);
  assert.deepEqual(urls,['/assets/ui/project-v/mercenaries/codex-v1/v-004-art-320.webp','/assets/ui/project-v/mercenaries/codex-v1/v-021-art-640.webp']);
  material.resolve('material texture');await pending;assert.equal(fx.art.texture,'result texture');assert.deepEqual(applied,['V-021']);
});
test('an old selection finishing last cannot replace the newer result',async()=>{
  const old=deferred();
  const fx={generation:0,pixi:{},controller:new AbortController(),textures:{load:()=>old.promise},destroyed:false};
  const pending=FusionFX.prototype.setCards.call(fx,[],{code:'V-021',sourceArt:'old.png'});
  fx.generation++;fx.resultCard={code:'new'};old.resolve({});await pending;assert.equal(fx.resultCard.code,'new');
});

function cmsTransport(t,fetch){
  t.mock.method(globalThis,'fetch',fetch);
  const previous=[globalThis.localStorage,globalThis.sessionStorage];
  globalThis.localStorage=globalThis.sessionStorage={getItem:()=>''};
  t.after(()=>{[globalThis.localStorage,globalThis.sessionStorage]=previous;});
}
test('CMS body decoding also has a deadline and aborts the underlying request',async t=>{
  let signal;const timer=globalThis.setTimeout;
  t.mock.method(globalThis,'setTimeout',(fn,ms,...args)=>timer(fn,Math.min(ms,10),...args));
  cmsTransport(t,async(_url,options)=>{signal=options.signal;return {ok:true,status:200,json:()=>new Promise(()=>{})};});
  await assert.rejects(mercenaryCmsRequest(),{code:'MERCENARY_LOAD_TIMEOUT'});assert.equal(signal.aborted,true);
});
test('empty, cut and invalid successful CMS responses never masquerade as definitive save failures',async t=>{
  let response;cmsTransport(t,async()=>response);
  for(const body of ['', '{"revision":', '{}']){
    response=new Response(body);await assert.rejects(mercenaryCmsRequest({method:'PATCH',body:'{}'}),error=>error.code==='CMS_RESPONSE_INVALID'&&!error.status&&!/Unexpected|JSON/.test(error.message));
  }
  response=new Response(JSON.stringify({error:'다른 창에서 저장했습니다.',code:'REVISION_CONFLICT'}),{status:409});
  await assert.rejects(mercenaryCmsRequest(),error=>error.status===409&&error.code==='REVISION_CONFLICT');
});
test('CMS warm reads never initialize; only missing CMS tables/rows may initialize once',async()=>{
  let initializations=0;const init=async()=>{initializations++;};
  assert.deepEqual(await readRegisteredMercenaryCms(async()=>({revision:7}),init,['mercenary_cms_documents_v1']),{revision:7});
  assert.equal(initializations,0);
  for(const missing of [null,Object.assign(Error('relation "mercenary_cms_documents_v1" does not exist'),{code:'42P01'}),Error('D1_ERROR: no such table: mercenary_cms_documents_v1')]){
    let calls=0;const read=async()=>{if(calls++)return {revision:1};if(missing)throw missing;return null;};
    assert.deepEqual(await readRegisteredMercenaryCms(read,init,['mercenary_cms_documents_v1']),{revision:1});assert.equal(calls,2);
  }
  assert.equal(initializations,3);
  for(const error of [Error('connection timed out'),Object.assign(Error('relation "users" does not exist'),{code:'42P01'}),Error('invalid stored document')])
    await assert.rejects(readRegisteredMercenaryCms(async()=>{throw error;},init,['mercenary_cms_documents_v1']),error);
  assert.equal(initializations,3);
});
