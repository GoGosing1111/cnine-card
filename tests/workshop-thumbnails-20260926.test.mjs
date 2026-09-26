import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import vm from 'node:vm';
import sharp from 'sharp';
const root=new URL('../',import.meta.url);
const read=file=>fs.readFile(new URL(file,root),'utf8');
const context=vm.createContext({window:{}});
vm.runInContext(await read('js/workshop-thumbnails-v1.js'),context);
vm.runInContext(await read('js/workshop-recipes-v1.js'),context);
const map=context.window.SoopketmonWorkshopThumbnails;
const client=await read('js/workshop-v1881.js');
vm.runInContext(client.slice(client.indexOf('  const esc ='),client.indexOf('  const normalizeImages =')),context);
const asset=vm.runInContext('asset',context);

test('workshop images resolve encoded local paths and preserve custom CMS URLs',()=>{
 for(const resolve of [asset,context.window.WorkshopRecipes.image]){
  for(const p of ['assets/new myth/20.jpeg','/assets/new myth/20.jpeg','/assets/new%20myth/20.jpeg'])assert.equal(resolve(p),'/'+map['assets/new myth/20.jpeg']);
  assert.equal(resolve('https://cms.example/custom.png'),'https://cms.example/custom.png');
  assert.equal(resolve('/assets/items/custom-future.png'),'/assets/items/custom-future.png');
  assert.equal(resolve('assets/items/a%bad.png'),'/assets/items/a%bad.png');
 }
 assert.match(context.window.WorkshopRecipes.costRows([{image:'assets/items/suit-core-1-v2004.png',name:'코어',owned:1,required:1}]),/\/assets\/ui\/workshop\/thumbnails\//);
});

test('every derivative exists, keeps aspect ratio and small parts stay below 20 KB total',async()=>{
 let partsBytes=0;
 const sources=JSON.parse(await read('assets/ui/workshop/thumbnail-sources-v1.json'));
 for(const [source,target] of Object.entries(map)){
  const data=await fs.readFile(new URL(target,root));assert.ok(data.length>0);
  const spec=sources.find(s=>s.source===source);
  if(!spec)continue;
  const original=await sharp(await fs.readFile(new URL(source,root))).metadata(),thumb=await sharp(data).metadata();
  assert.equal(thumb.format,'webp');assert.ok(Math.max(thumb.width,thumb.height)<=spec.size);
  assert.ok(Math.abs(original.width/original.height-thumb.width/thumb.height)<0.02);
  if(source.includes('vehicle-part-'))partsBytes+=data.length;
 }
 assert.ok(partsBytes>0&&partsBytes<20000);
});
