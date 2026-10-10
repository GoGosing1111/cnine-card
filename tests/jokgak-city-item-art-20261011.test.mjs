import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import crypto from 'node:crypto';
import sharp from 'sharp';
import {CITY_SUPPLIES,defaultCityLifePolicy} from '../shared/jokgak-city-life-v1.mjs';
import {CITY_WEAPONS,defaultCityArsenal} from '../shared/jokgak-city-expansion-v1.mjs';
import {CITY_ITEM_ART,cityItemArt} from '../js/jokgak-city-item-art-v1.mjs';
import {cityServices,cityBag} from '../js/jokgak-city-life-ui-v1.mjs';
import {cityWeapons,cityMiniInventory,cityWeaponProfile} from '../js/jokgak-city-expansion-ui-v1.mjs';
const read=file=>fs.readFileSync(new URL('../'+file,import.meta.url));
const manifest=JSON.parse(read('assets/ui/jokgak-city/items-v1/manifest.json'));
const codes=[...CITY_SUPPLIES,...CITY_WEAPONS].map(p=>p.code).concat('SET_MEAL','TREATMENT');
const icon=()=>'<svg></svg>';
const state=()=>({mode:'ON',life:defaultCityLifePolicy(),arsenal:defaultCityArsenal(),mine:{active:true,location:'SHOP',cash:80000,bag:{LUNCHBOX:2,VITAMIN:1,FIRST_AID:1},ownedWeapons:['PIPE','PISTOL','RIFLE'],weapon:{code:'RIFLE',name:'소총'},cityPower:450000}});
const button=(html,action,code='')=>html.match(new RegExp('<button[^>]*data-city-action="'+action+'"'+(code?'[^>]*data-city-product="'+code+'"':'')+'[^>]*>'))?.[0];

test('every city supply, weapon and service has a unique generated object asset',()=>{
 assert.deepEqual(Object.keys(CITY_ITEM_ART).sort(),[...codes].sort());
 assert.deepEqual(manifest.assets.map(a=>a.code).sort(),[...codes].sort());
 assert.equal(new Set(manifest.assets.map(a=>a.files.source.sha256)).size,codes.length);
 for(const asset of manifest.assets){
  assert.ok(asset.prompt.length>100);assert.ok(asset.generatedSource.endsWith('.png'));
  assert.equal(CITY_ITEM_ART[asset.code].name,asset.name);
  assert.ok(cityItemArt(asset.code).includes('/'+asset.image));
  assert.ok(cityItemArt(asset.code,true).includes('/'+asset.thumbnail));
 }
 for(const code of [null,undefined,'','NOT_AN_ITEM','__proto__','constructor','<img src=x>'])assert.equal(cityItemArt(code),'');
});

test('all PNG originals and both delivery sizes decode, retain transparency and match recorded hashes',async()=>{
 for(const asset of manifest.assets){
  for(const key of ['source','image','thumbnail']){
   const bytes=read(asset[key]),meta=await sharp(bytes).metadata();
   assert.equal(crypto.createHash('sha256').update(bytes).digest('hex'),asset.files[key].sha256,asset.code+'/'+key);
   assert.equal(meta.width,meta.height);assert.equal(meta.hasAlpha,true);
   if(key==='source')assert.ok(meta.width>=1024);else assert.equal(meta.width,key==='image'?768:256);
  }
  const {data,info}=await sharp(read(asset.thumbnail)).ensureAlpha().raw().toBuffer({resolveWithObject:true});
  let transparent=0,visible=0;
  for(let i=3;i<data.length;i+=info.channels){if(data[i]===0)transparent++;if(data[i]>200)visible++;}
  const pixels=info.width*info.height;
  assert.ok(transparent/pixels>.08,asset.code+' needs actual alpha outside object');
  assert.ok(visible/pixels>.05,asset.code+' object is empty or too faint');
  assert.ok(asset.files.image.bytes<250000&&asset.files.thumbnail.bytes<40000,'delivery budget');
 }
});

test('item art preserves configured prices, effects, action identities and unavailable states',()=>{
 const s=state();s.life.supplies[0].price=777;s.life.supplies[0].hunger=17;
 let html=cityServices(s,'SHOP',0,false,icon);
 for(const code of CITY_SUPPLIES.map(p=>p.code)){assert.ok(html.includes('data-city-item-art="'+code+'"'));assert.ok(button(html,'buy',code));}
 assert.match(html,/777원/);assert.match(html,/포만감 \+17/);
 s.mine.cash=0;html=cityServices(s,'SHOP',0,false,icon);
 for(const code of CITY_SUPPLIES.map(p=>p.code))assert.match(button(html,'buy',code),/disabled/);
 s.mine.cash=80000;s.life.supplies[0].enabled=false;
 assert.match(button(cityServices(s,'SHOP',0,false,icon),'buy','LUNCHBOX'),/disabled/);
 assert.match(button(cityBag(s,0,false,icon),'use','LUNCHBOX'),/disabled/);
 s.mine.location='RESTAURANT';html=cityServices(s,'RESTAURANT',0,false,icon);
 assert.match(html,/data-city-item-art="SET_MEAL"/);assert.ok(button(html,'eat'));assert.match(html,/1,000원/);
 s.mine.location='HOSPITAL';html=cityServices(s,'HOSPITAL',0,false,icon);
 assert.match(html,/data-city-item-art="TREATMENT"/);assert.ok(button(html,'treat'));assert.match(html,/2,000원/);
 s.mine.location='MARKET';
 html=cityWeapons(s,'MARKET',0,false);
 for(const code of CITY_WEAPONS.map(p=>p.code))assert.ok(html.includes('data-city-item-art="'+code+'"'));
 assert.match(button(html,'equipWeapon','RIFLE'),/disabled/);
 html=cityMiniInventory(s,0,false);assert.ok(button(html,'unequipWeapon'));assert.ok(button(html,'equipWeapon','PIPE'));
 assert.match(cityWeaponProfile(s),/data-city-item-art="RIFLE"/);
 s.mine.weapon={code:null,name:'맨손'};assert.doesNotMatch(cityWeaponProfile(s),/data-city-item-art/);
});

test('production and preview entries load the item stylesheet and the refreshed city modules',()=>{
 const city=read('js/jokgak-city-v1.js').toString(),css=read('css/jokgak-city-v1.css').toString();
 assert.match(city,/VERSION='20261011-items1'/);
 assert.match(city,/jokgak-city-life-ui-v1\.mjs\?v=/);assert.match(city,/jokgak-city-expansion-ui-v1\.mjs\?v=/);
 assert.match(css,/jokgak-city-items-v1\.css\?v=20261011-items1/);
 for(const file of ['index.html','preview/jokgak-city-v1/index.html'])assert.match(read(file).toString(),/jokgak-city-v1\.js\?v=20261011-items1/);
 assert.match(read('service-worker.js').toString(),/soop-card-shell-v20261011-city-items1/);
});

