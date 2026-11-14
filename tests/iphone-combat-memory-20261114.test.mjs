import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import vm from 'node:vm';
import {ImageSource,Texture,Rectangle} from 'pixi.js';
import {mobileBattleImage,loadMobileBattleTexture,ownDecodedBitmap} from '../preview/project-v-v3/source/battle/BattleTextureLifecycle.mjs';
import {BATTLE_MOBILE_IMAGES} from '../preview/project-v-v3/source/battle/BattleMobileImages.mjs';
import sharp from 'sharp';
import {isProductionFile} from '../scripts/prepare-production-assets.mjs';
const deferred=()=>{let resolve;const promise=new Promise(r=>resolve=r);return {promise,resolve};};
const tick=()=>new Promise(r=>setImmediate(r));
class Bitmap{constructor(width,height){Object.assign(this,{width,height,closed:0});}close(){this.closed++;}}

test('mobile direct and Spine images preserve exact logical frames and UVs, including odd atlas dimensions',async()=>{
 for(const [width,height]of [[2048,2042],[2046,2043],[1024,1536]]){
  const original=new ImageSource({resource:new Bitmap(width,height)}),frame=new Rectangle(11,17,300,201),before=new Texture({source:original,frame});
  const calls=[],variant={url:'/small.webp',scale:.5,width,height};
  const base=await loadMobileBattleTexture(async(url,asset)=>{calls.push({url,asset});return new Texture({source:new ImageSource({resource:new Bitmap(Math.round(width/2),Math.round(height/2)),...asset.data})});},{},['/original.png',{src:'/original.png',data:{alphaMode:'premultiplied-alpha'}},{}],variant);
  assert.equal(calls[0].url,'/small.webp');assert.equal(calls[0].asset.data.alphaMode,'premultiplied-alpha');
  const after=new Texture({source:base.source,frame});assert.deepEqual(after.uvs,before.uvs);
  assert.equal(base.width,width);assert.equal(base.height,height);assert.equal(base.source.pixelWidth,Math.round(width/2));
  ownDecodedBitmap(base.source,Bitmap);const resource=base.source.resource;base.destroy(true);assert.equal(resource.closed,1);
  original.destroy();
 }
});
test('desktop, external URLs and unknown images keep their loaders; a missing mobile derivative falls back',async()=>{
 const first=Object.keys(BATTLE_MOBILE_IMAGES)[0],base='https://game.test/index.html';
 assert(mobileBattleImage('../'+first.slice(1)+'?v=1',{ios:true,base}));
 assert.equal(new URL(mobileBattleImage(first,{ios:true,base}).url).origin,'https://game.test');
 assert.equal(mobileBattleImage(first,{ios:false,base}),null);
 assert.equal(mobileBattleImage('https://foreign.test'+first,{ios:true,base}),null);
 assert.equal(mobileBattleImage('/unknown.png',{ios:true,base}),null);
 const calls=[],asset={src:'/original.png',data:{alphaMode:'keep'}},result={source:{}};
 const loaded=await loadMobileBattleTexture(async(url,options)=>{calls.push([url,options]);if(url==='/small.webp')throw Error('offline');return result;},{},['/original.png',asset],{url:'/small.webp',scale:.5});
 assert.equal(loaded,result);assert.equal(calls.length,2);assert.equal(calls[1][1],asset);assert.equal(asset.data.resolution,undefined);
});
test('every shipped derivative matches its manifest dimensions and has a smaller encoded payload',async()=>{
 const report=JSON.parse(await fs.readFile(new URL('../docs/qa/iphone-combat-20261114/images.json',import.meta.url),'utf8'));
 for(const row of report.rows){const buffer=await fs.readFile(new URL('../'+row.output,import.meta.url)),meta=await sharp(buffer).metadata();assert.equal(meta.width,Math.round(row.width*row.scale),row.source);assert.equal(meta.height,Math.round(row.height*row.scale),row.source);assert(buffer.length<row.sourceBytes,row.source);assert(isProductionFile(row.output));}
});
test('the mobile delivery budget preserves original assets and excludes only documented historical notes',async()=>{
 const notes=JSON.parse(await fs.readFile(new URL('../scripts/iphone-battle-audit-only-20261114.json',import.meta.url),'utf8'));
 assert(notes.length>=100);for(const file of notes){assert(/^docs\/.+\.md$/.test(file));assert.equal(isProductionFile(file),false);}
 for(const file of ['assets/ui/coin-prediction/arena-v1.png','assets/ui/project-v/mercenaries/jin-jokro-20261106/source-art-approved.png'])assert(isProductionFile(file),file);
});

async function advancement(){
 const gate=deferred(),unloadGate=deferred(),cache=new Map(),loads=[],unloads=[];let delayed=true,retiring=false;
 const source=await fs.readFile(new URL('../preview/project-v-v3/source/battle/mercenary-advancement/AdvancementEffects.mjs',import.meta.url),'utf8');
 const stateSource=await fs.readFile(new URL('../preview/project-v-v3/source/battle/mercenary-advancement/AdvancementStateEffects.mjs',import.meta.url),'utf8');
 const Assets={async load(url){loads.push(url);if(delayed)await gate.promise;if(!cache.has(url))cache.set(url,{source:{},id:loads.length});return cache.get(url);},async unload(url){unloads.push(url);if(retiring)await unloadGate.promise;cache.delete(url);}};
 const context={Assets,Texture:class{constructor(o){Object.assign(this,o);}destroy(){this.destroyed=true;}},Rectangle:class{},Point:class{},EFFECTS:{vanguard:{}},console};
 vm.createContext(context);
 const clean=s=>s.replace(/^import .*;\r?$/gm,'').replace(/^export \{[^\n]+\};\r?$/gm,'').replace(/^export /gm,'');
 vm.runInContext(clean(source)+'\nthis.FX=AdvancementEffects;this.acquire=acquire;this.release=release;this.trim=trimCache;this.acquireEffectAtlas=acquire;this.releaseEffectAtlases=release;this.trimEffectCache=trimCache;',context);
 vm.runInContext(clean(stateSource)+'\nthis.States=AdvancementStateEffects;',context);
 return {context,cache,loads,unloads,gate,unloadGate,immediate(){delayed=false;},pauseUnload(){retiring=true;}};
}
const spec={atlas:'effect.webp',decodedBytes:8*1048576,frames:[{x:0,y:0,w:64,h:64}]};
test('leaving while a new advancement burst decodes waits and releases the late texture',async()=>{
 const f=await advancement(),engine={visible:true,playbackEpoch:0},fx=new f.context.FX(engine,'/fx/',{effects:{vanguard:spec}});
 const work=fx.begin({id:'vanguard',eventId:'battle:1',actor:{root:{}},target:{root:{}}});let closed=false;
 const close=fx.destroy().then(()=>closed=true);await tick();assert.equal(closed,false);
 f.gate.resolve();await work;await close;assert.equal(f.cache.size,0);assert.equal(f.unloads.length,1);
});
test('leaving during a shield state decode releases it before the next battle',async()=>{
 const f=await advancement(),engine={visible:true,playbackEpoch:0,isAlive:()=>true},fx=new f.context.States(engine,{battleId:'one',base:'/fx/',manifest:{effects:{'knight-ward':spec}}});
 const work=fx.apply({id:'shield-knight',battleId:'one',revision:1,remaining:3,actor:{id:'hero',root:{parent:{}}}});let closed=false;
 const close=fx.destroy().then(()=>closed=true);await tick();assert.equal(closed,false);f.gate.resolve();await work;await close;assert.equal(f.cache.size,0);
});
test('an advancement texture requested during unload waits for retirement and receives a fresh source',async()=>{
 const f=await advancement();f.immediate();const first=await f.context.acquire('/fx/','vanguard',spec);await f.context.release([first]);f.pauseUnload();
 const release=f.context.trim(true),next=f.context.acquire('/fx/','vanguard',spec);await tick();assert.equal(f.loads.length,1);
 f.unloadGate.resolve();await release;const fresh=await next;assert.notEqual(fresh.atlas,first.atlas);assert.equal(fresh.refs,1);assert.equal(f.cache.size,1);await f.context.release([fresh]);await f.context.trim(true);
});
