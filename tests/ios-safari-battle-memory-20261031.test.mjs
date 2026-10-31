import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {EventEmitter} from 'node:events';
import {battleDevicePolicy} from '../preview/project-v-v3/source/battle/BattleDevicePolicy.mjs';
const read=p=>fs.readFileSync(new URL('../'+p,import.meta.url),'utf8');
const deferred=()=>{let resolve,reject;const promise=new Promise((a,b)=>{resolve=a;reject=b;});return {promise,resolve,reject};};
const tick=()=>new Promise(r=>setImmediate(r));

test('iPhone and desktop-mode iPad are bounded without relying on deviceMemory or viewport',()=>{
 for(const device of [{userAgent:'Mozilla/5.0 (iPhone; CPU iPhone OS 18_6 like Mac OS X)'},{platform:'MacIntel',maxTouchPoints:5}]){
  const p=battleDevicePolicy({...device,pixelRatio:3});assert.equal(p.ios,true);assert.equal(p.resolution,1.25);assert.equal(p.imageConcurrency,3);assert.equal(p.maxFPS,45);
 }
 assert.equal(battleDevicePolicy({platform:'MacIntel',maxTouchPoints:0,pixelRatio:2}).resolution,2);
 assert.equal(battleDevicePolicy({coarse:true,pixelRatio:3}).resolution,1.5);
});

function lifecycle(){
 const canvas=()=>({canvas:{width:256,height:128}}),pooled=[];
 const context={BATTLE_DEVICE:{imageConcurrency:3},loadTextures:{async load(){return {source:{}};}},TexturePool:{clears:0,clear(){this.clears++;}},CanvasPool:{getOptimalCanvasAndContext(){return pooled.pop()||canvas();},returnCanvasAndContext(v){pooled.push(v);},clear(){pooled.length=0;}},console};
 vm.runInNewContext(read('preview/project-v-v3/source/battle/BattleTextureLifecycle.mjs').replace(/^import .*;\r?$/gm,'').replace(/^export /gm,'')+'\nthis.api={createImageLoadQueue,ownDecodedBitmap,releaseIdleBattleBuffers};',context);return context;
}
test('concurrent image decoding stays at three, including failure and late arrivals',async()=>{
 const {api}=lifecycle(),q=api.createImageLoadQueue(3),gates=Array.from({length:7},deferred),started=[];
 const jobs=gates.map((gate,i)=>q.run(()=>{started.push(i);return gate.promise;}).catch(e=>e.message));
 await tick();assert.deepEqual(started,[0,1,2]);gates[1].reject(Error('decode failure'));await tick();assert.deepEqual(started,[0,1,2,3]);
 gates.forEach((g,i)=>g.resolve(i));await Promise.all(jobs);await tick();assert.equal(q.diagnostics().peak,3);assert.equal(q.diagnostics().active,0);assert.equal(q.diagnostics().queued,0);
});
test('ImageBitmap closes exactly once on source destruction, never on GPU eviction',()=>{
 const {api}=lifecycle();class Bitmap{closed=0;close(){this.closed++;}}
 const source=new EventEmitter();source.resource=new Bitmap();assert.equal(api.ownDecodedBitmap(source,Bitmap),true);assert.equal(api.ownDecodedBitmap(source,Bitmap),false);
 source.emit('unload');assert.equal(source.resource.closed,0);source.emit('destroy');source.emit('destroy');assert.equal(source.resource.closed,1);
 assert.equal(api.ownDecodedBitmap({resource:{close(){throw Error('foreign resource');}}},Bitmap),false);
});
test('closing frees returned text canvases and filter buffers without touching a borrowed canvas',()=>{
 const c=lifecycle(),idle=c.CanvasPool.getOptimalCanvasAndContext(),borrowed=c.CanvasPool.getOptimalCanvasAndContext();c.CanvasPool.returnCanvasAndContext(idle);c.CanvasPool.returnCanvasAndContext(borrowed);
 assert.equal(c.CanvasPool.getOptimalCanvasAndContext(),borrowed);c.api.releaseIdleBattleBuffers();assert.equal(idle.canvas.width,0);assert.equal(idle.canvas.height,0);assert.equal(borrowed.canvas.width,256);assert.equal(c.TexturePool.clears,1);
});

test('role atlases load only on demand and a reentry waits for cache retirement',async()=>{
 const loads=[],unloads=[],gate=deferred();let wait=false;
 const context={console,Assets:{async load(url){loads.push(url);const prefix=url.includes('heal')?'heal_':'attack_';return {textures:Object.fromEntries(Array.from({length:12},(_,i)=>[prefix+i,{id:i}]))};},async unload(url){unloads.push(url);if(wait)await gate.promise;}}};
 vm.runInNewContext(read('preview/project-v-v3/source/battle/SkillEffectFX.js').replace(/^import .*;\r?$/gm,'').replace(/^export /gm,'')+'\nthis.FX=SkillEffectFX;',context);
 assert.equal(loads.length,0);await context.FX.preload('ATTACK');assert.equal(loads.length,1);await context.FX.preload('ATTACK');assert.equal(loads.length,1);
 wait=true;const release=context.FX.release(),next=context.FX.preload('HP');await tick();assert.equal(loads.length,1);gate.resolve();await release;await next;assert.equal(loads.length,2);assert.equal(context.FX.atlasCache.has('ATTACK'),false);assert.equal(context.FX.atlasCache.has('HP'),true);assert.equal(unloads.length,1);
});

test('Blackwing atlas views and decoded sources release only after the last owner, then reload',async()=>{
 const loads=[],unloads=[],views=[],gate=deferred();let wait=false;
 const rt={Assets:{async load(url){loads.push(url);return {source:{}};},async unload(url){unloads.push(url);if(wait)await gate.promise;}},Texture:class{constructor(o){Object.assign(this,o);views.push(this);}destroy(source){assert.equal(source,false);this.destroyed=true;}},Rectangle:class{}};
 const context={fetch:async()=>({ok:true,json:async()=>({atlases:{body:{url:'body.png',frames:[{rect:{x:0,y:0,width:20,height:20}}]},slash:{url:'slash.png',frames:[]}}})}),ProjectVPixiBattle:{fxRuntime:rt}};
 vm.runInNewContext(read('raid/blackwing/presentation.mjs').replace(/^export /gm,'')+'\nthis.acquire=preloadBlackwing;',context);
 const a=await context.acquire(),b=await context.acquire();assert.equal(loads.length,2);await a.release();assert.equal(unloads.length,0);assert.equal(views[0].destroyed,undefined);await a.release();assert.equal(unloads.length,0);
 wait=true;const last=b.release(),next=context.acquire();await tick();assert.equal(loads.length,2);assert.equal(views[0].destroyed,true);gate.resolve();await last;const c=await next;assert.equal(loads.length,4);await c.release();assert.equal(unloads.length,4);
});

test('Isgen retires a late atlas load before reentry and deduplicates simultaneous frame requests',async()=>{
 const gate=deferred(),loads=[],unloads=[],views=[];let wait=true;
 const rt={Assets:{async load(url){loads.push(url);if(wait)await gate.promise;return {source:{},width:512,height:512};},async unload(url){unloads.push(url);}},Texture:class{constructor(o){Object.assign(this,o);views.push(this);}destroy(){this.destroyed=true;}},Rectangle:class{}};
 const context={window:{ProjectVPixiBattle:{fxRuntime:rt},addEventListener(){}},console};
 vm.runInNewContext(read('preview/lich-king-raid-v1/battle.src.js').replace(/^import .*;\r?$/gm,'')+'\nthis.api={loadFrames,releaseFrames};',context);
 const a=context.api.loadFrames('zero'),b=context.api.loadFrames('zero');await tick();assert.equal(loads.length,1);
 const release=context.api.releaseFrames(),next=context.api.loadFrames('zero');await tick();assert.equal(loads.length,1);
 wait=false;gate.resolve();await a;await b;await release;await next;assert.equal(loads.length,2);assert.equal(unloads.length,1);assert(views.slice(0,16).every(v=>v.destroyed));assert(views.slice(16).every(v=>!v.destroyed));await context.api.releaseFrames();
});

test('Varsen releases all effect views and sources and can preload again after leaving mid-load',async()=>{
 const gate=deferred(),loads=[],unloads=[],views=[];let wait=true;
 const rt={Assets:{async load(url){loads.push(url);if(wait)await gate.promise;return {source:{}};},async unload(url){unloads.push(url);}},Texture:class{constructor(o){Object.assign(this,o);views.push(this);}destroy(){this.destroyed=true;}},Rectangle:class{}};
 const context={window:{ProjectVPixiBattle:{fxRuntime:rt}},fetch:async()=>({ok:true,json:async()=>({atlases:{cast:{url:'cast.png',frames:[]},fire:{url:'fire.png',frames:[{rect:{x:0,y:0,width:10,height:10}}]}}})})};
 vm.runInNewContext(read('preview/madara-raid-v1/presentation.js'),context);const p=context.window.MadaraPresentation;
 const first=p.preload();await tick();assert.equal(loads.length,1);const release=p.release(),next=p.preload();await tick();assert.equal(loads.length,1);
 wait=false;gate.resolve();await first;await release;await next;assert.equal(loads.length,2);assert.equal(unloads.length,1);assert.equal(views[0].destroyed,true);assert.equal(views[1].destroyed,undefined);assert.equal(p.diagnostics().bodyFrames,0);await p.release();assert.equal(p.diagnostics().loaded,false);
});

test('a failed raid atlas batch retires its successful siblings and remains retryable',async()=>{
 for(const kind of ['blackwing','madara']){
  const cache=new Set(),views=[],unloads=[];let fail=true;
  const rt={Assets:{cache,async load(url){if(fail&&url.includes('bad.png'))throw Error('decode failed');cache.add(url);return {source:{}};},async unload(url){unloads.push(url);cache.delete(url);}},Texture:class{constructor(){views.push(this);}destroy(){this.destroyed=true;}},Rectangle:class{}};
  const context={fetch:async()=>({ok:true,json:async()=>({atlases:{good:{url:'good.png',frames:[{rect:{x:0,y:0,width:1,height:1}}]},bad:{url:'bad.png',frames:[]}}})}),ProjectVPixiBattle:{fxRuntime:rt}};
  context.window=context;
  vm.runInNewContext(read(kind==='blackwing'?'raid/blackwing/presentation.mjs':'preview/madara-raid-v1/presentation.js').replace(/^export /gm,'')+(kind==='blackwing'?'\nthis.preload=preloadBlackwing;':'\nthis.preload=MadaraPresentation.preload;'),context);
  await assert.rejects(context.preload(),/decode failed/);assert.equal(cache.size,0);assert.equal(unloads.length,1);assert.equal(views[0].destroyed,true);
  fail=false;const asset=await context.preload();assert.equal(cache.size,2);await (kind==='blackwing'?asset.release():context.MadaraPresentation.release());assert.equal(cache.size,0);
 }
});
