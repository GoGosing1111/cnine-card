import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import crypto from 'node:crypto';
import sharp from 'sharp';
import {CITY_FOUND_WEAPONS,CITY_ARMORS} from '../shared/jokgak-city-exploration-v1.mjs';
import {defaultCitySettings} from '../shared/jokgak-city-settings-v1.mjs';
import {CITY_EXPLORATION_ART,cityExplorationArt} from '../js/jokgak-city-gear-art-v1.mjs';
import {cityExplorePanel,cityArmorInventory,cityGearDetail,cityExplorationResult} from '../js/jokgak-city-exploration-ui-v1.mjs';
const read=p=>fs.readFileSync(new URL('../'+p,import.meta.url));
const manifest=JSON.parse(read('assets/ui/jokgak-city/exploration-v2/manifest.json'));
const state=()=>({...defaultCitySettings(),mine:{active:true,location:'DOCK',cityPower:100000,ownedWeapons:[],ownedArmors:[]}});
const action=(html,name)=>html.match(new RegExp('<button[^>]*data-city-action="'+name+'"[^>]*>'))?.[0];
test('all 13 new equipment illustrations are distinct, hashed, transparent and budgeted',async()=>{
 const codes=[...CITY_FOUND_WEAPONS,...CITY_ARMORS].map(x=>x.code).sort();assert.deepEqual(Object.keys(CITY_EXPLORATION_ART).sort(),codes);assert.deepEqual(manifest.assets.map(x=>x.code).sort(),codes);assert.equal(new Set(manifest.assets.map(a=>a.files.source.sha256)).size,13);
 for(const asset of manifest.assets){
  for(const key of ['source','image','thumbnail']){const data=read(asset[key]),meta=await sharp(data).metadata();assert.equal(crypto.createHash('sha256').update(data).digest('hex'),asset.files[key].sha256);assert.equal(meta.hasAlpha,true);assert.equal(meta.width,meta.height);if(key!=='source')assert.equal(meta.width,key==='image'?768:256);}
  const {data,info}=await sharp(read(asset.thumbnail)).ensureAlpha().raw().toBuffer({resolveWithObject:true});let transparent=0,opaque=0;for(let i=3;i<data.length;i+=info.channels){transparent+=data[i]===0;opaque+=data[i]>200;}assert.ok(transparent/(info.width*info.height)>.08,asset.code);assert.ok(opaque/(info.width*info.height)>.04,asset.code);assert.ok(asset.files.image.bytes<250000&&asset.files.thumbnail.bytes<40000,asset.code);
  assert.ok(cityExplorationArt(asset.code).includes('/'+asset.image));assert.ok(cityExplorationArt(asset.code,true).includes('/'+asset.thumbnail));
 }
 for(const code of [null,undefined,'','__proto__','constructor','<img src=x>'])assert.equal(cityExplorationArt(code),'');
});
test('discovery cards and details use configured power, enabled loot pools and actual ownership',()=>{
 const s=state();s.exploration.weapons.find(w=>w.code==='SNIPER').power=987654;s.mine.ownedWeapons=['SNIPER'];let html=cityExplorePanel(s,'DOCK',100,false);assert.match(html,/987,654/);assert.match(html,/35\.0/);assert.match(html,/보유 중/);assert.equal((html.match(/class="jc-drop-card"/g)||[]).length,3);
 assert.match(cityGearDetail(s,'SNIPER'),/987,654/);assert.match(cityGearDetail(s,'SNIPER'),/항구 창고/);assert.equal(cityGearDetail(s,'__proto__'),'');s.exploration.weapons.find(w=>w.code==='SNIPER').enabled=false;assert.doesNotMatch(cityExplorePanel(s,'DOCK',100,false),/data-city-gear="SNIPER"/);assert.match(cityGearDetail(s,'SNIPER'),/현재 탐색 획득 중지/);
});
test('exploration and armor actions retain availability checks and saved result distinctions',()=>{
 const s=state();assert.doesNotMatch(action(cityExplorePanel(s,'DOCK',100,false),'explore'),/disabled/);assert.match(action(cityExplorePanel(s,'HOME',100,false),'explore'),/disabled/);
 for(const patch of [{deadUntil:200},{jailedUntil:200},{nextActionAt:200},{hospitalRequired:true},{restUntil:200},{career:{work:{}}},{exploreNextAt:200}])assert.match(action(cityExplorePanel({...s,mine:{...s.mine,...patch}},'DOCK',100,false),'explore'),/disabled/);
 s.mine.ownedArmors=['KEVLAR'];s.exploration.armors.find(a=>a.code==='KEVLAR').power=123456;let html=cityArmorInventory(s,100,false);assert.match(html,/123,456/);assert.match(html,/data-city-product="KEVLAR"/);s.mine.armor={code:'KEVLAR'};assert.ok(action(cityArmorInventory(s,100,false),'unequipArmor'));
 for(const outcome of ['FOUND','DUPLICATE','EMPTY']){html=cityExplorationResult({exploration:{outcome,location:'DOCK',item:outcome==='EMPTY'?null:{...CITY_FOUND_WEAPONS[6],power:987654}}});assert.match(html,new RegExp('data-outcome="'+outcome+'"'));if(outcome!=='EMPTY')assert.match(html,/987,654/);}
});
test('game, PWA entry points and CMS load the same current exploration UI and styles',()=>{
 const version=read('js/jokgak-city-v1.js').toString().match(/VERSION='([^']+)'/)[1];
 for(const file of ['index.html','preview/jokgak-city-v1/index.html','pve-v3/index.html','pve/legion-hunt/index.html','raid/lich-king/index.html','js/adventure-navigation-standalone.js'])assert.ok(read(file).toString().includes('jokgak-city-v1.js?v='+version),file);
 assert.ok(read('admin/index.html').toString().includes('jokgak-city-admin-v1.mjs?v='+version));assert.ok(read('admin/index.html').toString().includes('jokgak-city-admin-v1.css?v='+version));assert.ok(read('css/jokgak-city-v1.css').toString().includes('jokgak-city-exploration-v2.css?v='+version));
});
