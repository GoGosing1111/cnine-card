import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {liveAssemblyReceipt} from '../preview/workshop-assembly-v1/source/live-contract.mjs';
import {MODELS} from '../preview/workshop-assembly-v1/source/models.mjs';
import {createWorkshopAssemblyPresenter} from '../js/workshop-assembly-live-v2073.src.js';
const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');
const flush=()=>new Promise(resolve=>setImmediate(resolve));
function fixture(key='e',success=true){
  const m=MODELS[key],recipe={id:100,category:m.mode==='suit'?'BATTLE_SUIT_CRAFT':'VEHICLE',output_ref:String(m.catalogId||901),output_type:m.mode==='suit'?'EQUIPMENT':'VEHICLE',output_name:m.name,output_image:key==='veneno'?'assets/tire/lamborghini-veneno-showroom-v1.png':m.source};
  const data={ok:true,requestId:'saved-receipt',recipeId:100,category:recipe.category,success,coinSpent:200000000,masterStarSpent:1000,
    output:success?{ref:recipe.output_ref,type:recipe.output_type,name:m.name,image:m.source}:null};
  return {data,recipe};
}
test('live target mapping accepts all approved models, including failure with no output',()=>{
  for(const key of Object.keys(MODELS))for(const success of [true,false]){
    const {data,recipe}=fixture(key,success),receipt=liveAssemblyReceipt(data,recipe);
    assert.equal(receipt.model,key);assert.equal(receipt.result.success,success);assert.equal(receipt.name,MODELS[key].name);
    if(data.output)data.output.name='mutated';assert.notEqual(receipt.result.output?.name,'mutated');
  }
  const {data,recipe}=fixture();
  for(const change of [{ok:false},{success:'false'},{requestId:''},{recipeId:101},{category:'VEHICLE'},{output:{...data.output,ref:'37'}}])assert.equal(liveAssemblyReceipt({...data,...change},recipe),null);
  assert.equal(liveAssemblyReceipt(data,{...recipe,output_type:'VEHICLE'}),null);
  const unknown=fixture('ignis',false);unknown.recipe.output_ref='999';assert.equal(liveAssemblyReceipt(unknown.data,unknown.recipe).model,null);
  assert.equal(liveAssemblyReceipt(data,null),null);
});
test('live bridge awaits animation only after receipt clear, state/balance sync; no mutation in renderer',()=>{
  const client=read('js/workshop-v1881.js'),adapter=read('js/workshop-assembly-live-v2073.src.js'),app=read('js/app.js');
  for(const [start,end,kind]of [['async function craftVehicle()','function showVehicleResult','vehicle'],['async function craftBattleSuit()','function showBattleSuitResult','battleSuit']]){
    const part=client.slice(client.indexOf(start),client.indexOf(end));
    assert.ok(part.indexOf("api('workshop/craft'")<part.indexOf(`clearMutationRequest('${kind}'`));
    assert.ok(part.indexOf(`clearMutationRequest('${kind}'`)<part.indexOf('await presentWorkshopAssembly'));
    assert.ok(part.indexOf('syncWorkshopBalances(data)')<part.indexOf('await presentWorkshopAssembly'));
    assert.match(part,/finally[\s\S]*workshopBusy = false/);
  }
  const bridge=client.slice(client.indexOf('async function presentWorkshopAssembly'),client.indexOf('async function craftMaterial'));
  assert.doesNotMatch(bridge,/api\(|prepareMutationRequest|mutationTransportUncertain/);
  assert.match(bridge,/canPresent\(\)[\s\S]*fallback\(\)[\s\S]*catch[\s\S]*showFallback\(\)/);
  assert.doesNotMatch(adapter,/apiRequest|workshop\/craft|Math\.random|previewResult|createOscillator|localStorage|sessionStorage/);
  const manifest=app.slice(app.indexOf('workshop:{'),app.indexOf('alchemy:{'));
  assert.match(manifest,/workshopAssemblyFx:[\s\S]*ui-fx-vendor-v2045/);
  const light=manifest.slice(0,manifest.indexOf('workshopAssemblyFx:'));
  assert.doesNotMatch(light,/ui-fx-vendor|workshop-assembly-fx/);
  assert.doesNotMatch(read('index.html'),/<script[^>]*src=["'](?:\/)?js\/(?:workshop-assembly|ui-fx-vendor)/);
  assert.doesNotMatch(read('js/workshop-assembly-live-v2073.bundle.js'),/class WebGLRenderer|class WebGPURenderer|class Application/);
  const film=read('preview/workshop-assembly-v1/source/AssemblyFilm.js');
  assert.match(film,/new URL\('\/preview\/workshop-assembly-v1\/',location.origin\)/);
  assert.match(film,/item\?resourceKeysFor\(item\):RESOURCE_KEYS/);
  const report=JSON.parse(read('preview/workshop-assembly-v1/live-build-report.json'));
  for(const item of report.outputs)assert.equal(createHash('sha256').update(read(item.path).replace(/\r\n/g,'\n')).digest('hex'),item.sha256,item.path);
});

// DOM I/O is stubbed, not the presenter: it executes the actual timers,
// result branching, asynchronous load guards, callbacks and teardown.
class NodeStub{
  constructor(doc){this.doc=doc;this.dataset={};this.style={setProperty(){}};this.nodes=new Map();this.children=[];this.isConnected=false;this.attrs={};this.classList={toggle(){}};}
  append(node){node.parent=this;node.isConnected=true;this.children.push(node);}
  remove(){this.isConnected=false;if(this.parent)this.parent.children=this.parent.children.filter(n=>n!==this);}
  querySelector(selector){if(!this.nodes.has(selector)){const node=new NodeStub(this.doc);node.parent=this;node.isConnected=true;this.nodes.set(selector,node);}return this.nodes.get(selector);}
  querySelectorAll(){return [...this.nodes.values()].filter(n=>!n.disabled&&!n.hidden);}
  setAttribute(key,value){this.attrs[key]=value;}
  replaceChildren(...nodes){this.children=nodes;}
  contains(node){return this===node||[...this.nodes.values()].includes(node);}
  focus(){this.doc.activeElement=this;}
}
function setup(){
  const saved=Object.fromEntries(['window','document','location','MutationObserver'].map(k=>[k,globalThis[k]]));
  const doc=new EventTarget();doc.createElement=()=>new NodeStub(doc);doc.body=new NodeStub(doc);doc.body.isConnected=true;
  doc.activeElement=new NodeStub(doc);doc.activeElement.isConnected=true;
  const win=new EventTarget();win.matchMedia=()=>({matches:false});
  Object.assign(globalThis,{document:doc,window:win,location:{origin:'https://example.test'},MutationObserver:class{observe(){}disconnect(){}}});
  const films=[];
  class Film{
    constructor(host,update){this.update=update;this.audio={enabled:false};this.destroyed=0;films.push(this);}
    async init(key){this.key=key;}
    prepare(mode,result,key){this.mode=mode;this.result=result;this.key=key;}
    diagnostics(){return {mode:this.mode,phase:['조립 중','ASSEMBLY'],time:this.finished?13.4:1,progress:this.finished?1:.1,playing:!!this.playing,finished:!!this.finished,activeTimelines:this.destroyed?0:1};}
    play(){this.playing=true;this.update(this.diagnostics());}
    pause(){this.playing=false;this.update(this.diagnostics());}
    resume(){this.play();}
    skip(){this.playing=false;this.finished=true;this.update(this.diagnostics());}
    destroy(){this.destroyed++;}
  }
  return {doc,win,Film,films,restore(){for(const [key,value]of Object.entries(saved))if(value===undefined)delete globalThis[key];else globalThis[key]=value;}};
}
test('skip, failure, result persistence, close, and repeated attempts clean every film',async()=>{
  const env=setup(),presenter=createWorkshopAssemblyPresenter({loadFilm:async()=>env.Film});
  try{
    for(const key of Object.keys(MODELS))for(const success of [true,false]){
      const task=presenter.play(fixture(key,success));await flush();
      const root=env.doc.body.children[0],film=env.films.at(-1);
      assert.equal(film.key,key);assert.equal(film.result.success,success);
      root.querySelector('[data-action="skip"]').onclick();
      assert.equal(root.dataset.state,'complete');assert.equal(root.querySelector('[data-result-title]').textContent,success?'제작 성공':'제작 실패');
      root.querySelector('[data-action="done"]').onclick();assert.equal(await task,true);
      assert.equal(film.destroyed,1);assert.equal(env.doc.body.children.length,0);assert.equal(presenter.diagnostics().activeTimelines,0);
    }
  }finally{presenter.cancel();env.restore();}
});
test('lazy load failure, timeout and reduced motion show stored outcome without re-roll',async()=>{
  const env=setup();let presenter;
  try{
    for(const kind of ['error','timeout','reduced']){
      env.win.matchMedia=()=>({matches:kind==='reduced'});let loads=0;
      presenter=createWorkshopAssemblyPresenter({loadTimeout:5,loadFilm:async()=>{loads++;if(kind==='error')throw Error('offline');return new Promise(()=>{});}});
      const task=presenter.play(fixture('f',false));await new Promise(resolve=>setTimeout(resolve,20));
      const root=env.doc.body.children[0];assert.equal(root.dataset.state,'fallback');assert.equal(root.querySelector('[data-result-title]').textContent,'제작 실패');
      if(kind==='reduced')assert.equal(loads,0);
      presenter.cancel();await task;assert.equal(env.doc.body.children.length,0);
    }
  }finally{presenter?.cancel();env.restore();}
});
test('route cancellation and closing during async init cannot reopen or resurrect the film',async()=>{
  const env=setup();let release,presenter;
  try{
    presenter=createWorkshopAssemblyPresenter({loadFilm:()=>new Promise(resolve=>{release=resolve;})});
    let task=presenter.play(fixture());env.win.dispatchEvent(new Event('cnine:route-will-change'));await task;release(env.Film);await flush();
    assert.equal(env.films.length,0);assert.equal(env.doc.body.children.length,0);
    class SlowFilm extends env.Film{init(){return new Promise(resolve=>{release=resolve;});}}
    presenter=createWorkshopAssemblyPresenter({loadFilm:async()=>SlowFilm});
    task=presenter.play(fixture());await flush();presenter.cancel();await task;release();await flush();
    assert.equal(env.doc.body.children.length,0);assert.ok(env.films.at(-1).destroyed>=1);assert.equal(presenter.diagnostics().activeTimelines,0);
  }finally{presenter?.cancel();env.restore();}
});
