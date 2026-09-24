import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const app=fs.readFileSync(new URL('../js/app.js',import.meta.url),'utf8');
const client=fs.readFileSync(new URL('../js/workshop-v1881.js',import.meta.url),'utf8');
const flush=()=>new Promise(resolve=>setImmediate(resolve));
const deferred=()=>{let resolve,reject;const promise=new Promise((a,b)=>{resolve=a;reject=b});return {promise,resolve,reject};};
function harness(){
  const reads=[],nodes=[],events=[];let now=1000,ready=false;
  const manifest={workshop:{parallelStyles:true,prepare:()=>context.prepareWorkshopEntryRead(),styles:['a.css','b.css'],scripts:['a.js','b.js'],ready:()=>ready},other:{styles:['other.css'],scripts:['other.js'],ready:()=>ready}};
  const document={querySelectorAll:()=>nodes.filter(n=>n.tag==='link'),get scripts(){return nodes.filter(n=>n.tag==='script')},createElement:tag=>{
    const listeners={};return {tag,dataset:{},getAttribute(name){return this[name]},addEventListener(name,fn){(listeners[name]??=[]).push(fn)},remove(){nodes.splice(nodes.indexOf(this),1)},finish(error=false){this[error?'onerror':'onload']?.();for(const fn of listeners[error?'error':'load']||[])fn()}};
  }};
  const append=node=>{nodes.push(node);events.push(node.href||node.src)};
  document.head={appendChild:append};document.body={appendChild:append};
  const context=vm.createContext({window:{},document,Date:{now:()=>now},FEATURE_RESOURCE_MANIFEST:manifest,API_TOKEN:'account-a',PLAYER_STATE_MUTATION_EPOCH:0,apiRequest:(path,options,config)=>{const d=deferred();reads.push({...d,path,options,config});events.push('api');return d.promise}});
  vm.runInContext(app.slice(app.indexOf('const featureResourcePromises='),app.indexOf('function featureKeyForTab')),context);
  return {context,reads,nodes,events,setReady:()=>{ready=true},advance:ms=>{now+=ms}};
}
test('only workshop overlaps CSS, ordered scripts and exactly one uncached entry read',async()=>{
  const h=harness(),loading=h.context.ensureFeatureResources('workshop');
  assert.deepEqual(h.events,['api','a.css','b.css','a.js','b.js']);
  assert.equal(h.context.ensureFeatureResources('workshop'),loading);
  for(const node of h.nodes.filter(n=>n.tag==='script')){assert.equal(node.async,false);node.finish()}
  h.setReady();await flush();assert.equal(h.context.featureResourcesReady('workshop'),false,'no unstyled early mount');
  h.reads[0].resolve({wallet:{coin:42}});
  for(const node of h.nodes.filter(n=>n.tag==='link'))node.finish();
  await loading;assert.equal(h.context.featureResourcesReady('workshop'),true);
  assert.deepEqual(await h.context.consumeWorkshopEntryRead(),{wallet:{coin:42}});
  assert.equal(h.reads.length,1);assert.equal(h.reads[0].config.microcache,false);
  const refreshed=h.context.consumeWorkshopEntryRead();assert.equal(h.reads.length,2);
  h.reads[1].resolve({wallet:{coin:40}});assert.equal((await refreshed).wallet.coin,40);
});
test('other features keep CSS-first loading and do not request workshop data',async()=>{
  const h=harness(),loading=h.context.ensureFeatureResources('other');
  assert.deepEqual(h.events,['other.css']);h.nodes[0].finish();await flush();
  assert.deepEqual(h.events,['other.css','other.js']);h.setReady();h.nodes[1].finish();await loading;
  assert.equal(h.reads.length,0);
});
test('asset failure can retry and waits for an already pending stylesheet',async()=>{
  const h=harness(),first=h.context.ensureFeatureResources('workshop');
  h.nodes.find(n=>n.src==='a.js').finish(true);await assert.rejects(first,/스크립트/);
  const retry=h.context.ensureFeatureResources('workshop');let done=false;retry.then(()=>{done=true});
  for(const node of [...h.nodes].filter(n=>n.tag==='script'))node.finish();h.setReady();await flush();
  assert.equal(done,false);
  for(const node of h.nodes.filter(n=>n.tag==='link'))node.finish();await retry;
});
test('account switches and resource mutations discard the prefetched state',async()=>{
  for(const change of ['API_TOKEN','PLAYER_STATE_MUTATION_EPOCH'])for(const during of [false,true]){
    const h=harness();h.context.prepareWorkshopEntryRead();
    const pending=during?h.context.consumeWorkshopEntryRead():null;
    h.context[change]=change==='API_TOKEN'?'account-b':1;
    h.reads[0].resolve({old:true});const result=pending||h.context.consumeWorkshopEntryRead();await flush();
    assert.equal(h.reads.length,2);assert.equal(h.reads[1].config.replaceInflight,true);
    h.reads[1].resolve({fresh:true});assert.deepEqual(await result,{fresh:true});
  }
});
test('completed entry data expires after one second and failures stay retryable',async()=>{
  const h=harness();h.context.prepareWorkshopEntryRead();h.reads[0].resolve({old:true});await flush();h.advance(1001);
  const result=h.context.consumeWorkshopEntryRead();await flush();assert.equal(h.reads.length,2);
  h.reads[1].resolve({fresh:true});assert.deepEqual(await result,{fresh:true});
  h.context.prepareWorkshopEntryRead();h.reads[2].reject(new Error('temporary outage'));await flush();
  await assert.rejects(h.context.consumeWorkshopEntryRead(),/temporary outage/);
  const retry=h.context.consumeWorkshopEntryRead();h.reads[3].resolve({recovered:true});assert.deepEqual(await retry,{recovered:true});
});
test('reentry replaces an abandoned inflight read instead of joining an old account snapshot',async()=>{
  const h=harness();h.context.prepareWorkshopEntryRead();
  vm.runInContext('workshopEntryRead=null;API_TOKEN="account-b"',h.context);
  const entered=h.context.consumeWorkshopEntryRead();assert.equal(h.reads[1].config.replaceInflight,true);
  h.reads[1].resolve({account:'b'});assert.deepEqual(await entered,{account:'b'});
  h.reads[0].resolve({account:'a'});
});
test('entry prefetch is opt-in, clears on exit and keeps assembly effects deferred',()=>{
  assert.equal((app.match(/parallelStyles:true/g)||[]).length,1);
  assert.match(app,/if\(tab!=='workshop'\)workshopEntryRead=null/);
  const manifest=app.slice(app.indexOf('workshop:{'),app.indexOf('workshopAssemblyFx:{'));
  assert.match(manifest,/prepareWorkshopEntryRead/);assert.doesNotMatch(manifest,/ui-fx-vendor|workshop-assembly-fx/);
});
test('late workshop responses cannot render after navigation or account change',async()=>{
  for(const change of ['routeEpoch','session']){
    const request=deferred();let renders=0;
    const context=vm.createContext({window:{consumeWorkshopEntryRead:()=>request.promise},document:{getElementById:()=>({})},workshopLoadVersion:0,routeEpoch:0,session:'a',sessionIdentity:()=>context.session,workshopMounted:()=>true,workshopState:null,renderWorkshop:()=>{renders++}});
    vm.runInContext(client.slice(client.indexOf('  async function bindWorkshopView()'),client.indexOf('  async function bindScrapyardView()')),context);
    const loading=context.bindWorkshopView();context[change]=change==='session'?'b':1;request.resolve({wallet:{coin:1}});await loading;
    assert.equal(renders,0);assert.equal(context.workshopState,null);
  }
});
