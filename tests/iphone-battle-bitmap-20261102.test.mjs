import test from 'node:test';
import assert from 'node:assert/strict';
import {ImageSource,Texture,Rectangle} from 'pixi.js';
import {compactBitmapPlan,compactBattleTexture,ownDecodedBitmap} from '../preview/project-v-v3/source/battle/BattleTextureLifecycle.mjs';
import {createBattleAssetMemory} from '../preview/project-v-v3/source/battle/BattleAssetMemory.mjs';
import {battleDevicePolicy} from '../preview/project-v-v3/source/battle/BattleDevicePolicy.mjs';

class Bitmap {
  constructor(width,height){Object.assign(this,{width,height,closed:0});}
  close(){this.closed++;}
}
const makeTexture=(width=2304,height=1536)=>new Texture({source:new ImageSource({resource:new Bitmap(width,height)})});
const options={Bitmap,createBitmap:async(_image,o)=>new Bitmap(o.resizeWidth,o.resizeHeight)};

test('Jinmu atlas keeps every authored frame and UV while decoded memory drops 75%',async()=>{
  const texture=makeTexture(),source=texture.source,original=source.resource;
  const frames=Array.from({length:6},(_,i)=>new Texture({source,frame:new Rectangle(i%3*768,Math.floor(i/3)*768,768,768)}));
  const before=frames.map(t=>({...t.uvs}));
  assert.equal(await compactBattleTexture(texture,options),true);
  assert.equal(original.closed,1);assert.equal(source.pixelWidth,1152);assert.equal(source.pixelHeight,768);
  assert.equal(source.width,2304);assert.equal(source.height,1536);assert.equal(texture.width,2304);
  frames.forEach((t,i)=>{t.updateUvs();assert.deepEqual(t.uvs,before[i]);assert.equal(t.height,768);});
  assert.equal(source.pixelWidth*source.pixelHeight/(2304*1536),.25);
  const retained=source.resource;ownDecodedBitmap(source,Bitmap);source.unload();assert.equal(retained.closed,0);
  assert.equal(await compactBattleTexture(texture,options),false);texture.destroy(true);assert.equal(retained.closed,1);
});

test('small/odd images keep exact geometry and large sheets stay under the pixel budget',()=>{
  assert.equal(compactBitmapPlan(768,768),null);assert.equal(compactBitmapPlan(2049,1537),null);
  assert.deepEqual(compactBitmapPlan(4096,4096),{width:1024,height:1024,scale:.25});
  assert.deepEqual(compactBitmapPlan(2048,1536),{width:1024,height:768,scale:.5});
});

test('unsupported/failed resizing retains original image; ignored resize copy is returned',async()=>{
  for(const createBitmap of [async()=>{throw Error('unsupported resize');},async()=>new Bitmap(2304,1536)]){
    const texture=makeTexture(),original=texture.source.resource;let copy;
    assert.equal(await compactBattleTexture(texture,{Bitmap,createBitmap:async(...a)=>(copy=await createBitmap(...a))}),false);
    assert.equal(texture.source.resource,original);assert.equal(original.closed,0);assert.equal(texture.source.width,2304);
    if(copy)assert.equal(copy.closed,1);texture.destroy(true);
  }
});

test('direct iOS images alone receive logical-coordinate flag; JSON and desktop preserve loader options',async()=>{
  const image='/preview/mercenary-golden-dragon-battle-v1/assets/atlases/slash.png';
  const json='/preview/mercenary-role-attacks-v2100/assets/guard/atlas.json';
  for(const ios of [false,true]){
    const calls=[],removed=[],cache=new Map();
    const assets={cache,load(input,...args){calls.push({input,args});for(const item of Array.isArray(input)?input:[input])cache.set(typeof item==='string'?item:item.src,{});return Promise.resolve({});},async unload(url){removed.push(url);cache.delete(url);}};
    const memory=createBattleAssetMemory(assets,{ios});
    const configured={src:image,alias:'jinmu',data:{resolution:2,alphaMode:'premultiplied-alpha'}};
    const progress=()=>{};await assets.load([configured,json],progress);
    assert.equal(calls[0].input[1],json);assert.equal(calls[0].args[0],progress);
    assert.equal(calls[0].input[0].alias,'jinmu');assert.equal(calls[0].input[0].data.resolution,2);
    assert.equal(calls[0].input[0].data.battleLogicalPixels,ios?true:undefined);
    assert.equal(configured.data.battleLogicalPixels,undefined);
    await memory.release();assert.deepEqual(removed,[image]);assert(cache.has(json));
  }
});

test('iPhone bounds decode-plus-compaction at two without reducing Android or desktop concurrency',()=>{
  assert.equal(battleDevicePolicy({userAgent:'iPhone',pixelRatio:3}).imageConcurrency,2);
  assert.equal(battleDevicePolicy({userAgent:'Android',coarse:true}).imageConcurrency,3);
  assert.equal(battleDevicePolicy({}).imageConcurrency,8);
});
