import test, {after} from 'node:test';
import assert from 'node:assert/strict';
import {Assets} from 'pixi.js';
import {gsap} from 'gsap';
import {BattleEngine as LiveEngine} from '../preview/project-v-v3/source/battle/BattleEngine.js';
import {BattleEngine as ScrapyardEngine} from '../preview/scrapyard-v3-v1/source/ScrapyardBattleEngine.js';
import {BattleEngine as CowEngine} from '../preview/cow-room-v3-v1/source/CowBattleEngine.js';
import {BattleEngine as TowerEngine} from '../preview/infinite-tower-v3-v1/source/TowerBattleEngine.js';
import {BattleEngine as NativeEngine} from '../pve-v3/BattleEngine.js';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';

after(()=>gsap.ticker.sleep());

test('legacy string getter cannot mask the battlefield selector during construction or loading', async t=>{
  const previous=globalThis.matchMedia;globalThis.matchMedia=()=>({matches:false});
  t.after(()=>{if(previous)globalThis.matchMedia=previous;else delete globalThis.matchMedia;});
  t.mock.method(Assets,'load',async url=>({url}));
  class LegacyTower extends LiveEngine {get battlefieldAsset(){return '/assets/ui/project-v/battlefields/v3-infinite-tower-sanctum-v1.png';}}
  const engine=new LegacyTower({battleData:{mode:'TOWER'}});
  assert.equal(engine.activeBattlefieldAsset,engine.battlefieldAsset);
  await engine.applyBattlePayload({mode:'TOWER',battleV2:{}});
  await engine.setBattlefield('TOWER');
  assert.equal((await engine.loadBattlefieldTexture('TOWER')).url,engine.battlefieldAsset);
});

test('already loaded obsolete runtime is replaced once before mounting; current runtime is reused',async()=>{
  const source=readFileSync(new URL('../js/battle-v3-live.js',import.meta.url),'utf8');
  const chunk=source.slice(source.indexOf('  const BATTLE_RUNTIME'),source.indexOf('  const PLAYBACK_SPEED'));
  let destroyed=0,loads=0;const root={ProjectVPixiBattle:{destroy(){destroyed++;}},__V3_PIXI_MOUNTED:true};
  const document={createElement(){return {remove(){}}},head:{appendChild(script){loads++;assert.match(script.src,/2119-battlefield-contract/);queueMicrotask(()=>{root.ProjectVPixiBattle={runtimeVersion:'2119-battlefield-contract'};script.onload();});}}};
  const ensure=vm.runInNewContext(chunk+'\nensureCurrentBattleRuntime',{root,document,setTimeout,clearTimeout});
  await Promise.all([ensure(),ensure()]);assert.equal(loads,1);assert.equal(destroyed,1);assert.equal(root.__V3_PIXI_MOUNTED,false);
  await ensure();assert.equal(loads,1);
});

test('service worker replaces old battle scripts even when their historical URL has a v query',async()=>{
  const source=readFileSync(new URL('../service-worker.js',import.meta.url),'utf8');
  const events={},deleted=[],url='https://test.invalid/js/app.js?v=old';let fetched=0;
  const cache={keys:async()=>[new Request(url),new Request('https://test.invalid/css/app.css?v=old')],delete:async r=>deleted.push(r.url),match:async()=>new Response('OLD',{headers:{'Content-Type':'text/javascript'}}),put:async()=>{}};
  const context={self:{location:{origin:'https://test.invalid'},addEventListener:(n,f)=>events[n]=f,clients:{claim:async()=>{}}},caches:{keys:async()=>['soop-card-shell-v2108-shared-navigation'],open:async()=>cache},URL,Response,fetch:async()=>{fetched++;return new Response('CURRENT',{headers:{'Content-Type':'text/javascript'}})}};
  vm.runInNewContext(source,context);let wait;events.activate({waitUntil:p=>wait=p});await wait;assert.deepEqual(deleted,[url]);
  let reply;events.fetch({request:{method:'GET',url,destination:'script',mode:'no-cors'},respondWith:p=>reply=p});
  assert.equal(await (await reply).text(),'CURRENT');assert.equal(fetched,1);
});
const paths={
  '폐차장':'/assets/ui/scrapyard/scrapyard-arena-v1676.png',
  '카우방':'/assets/ui/project-v/battlefields/v3-cow-pasture-v1.png',
  '무한의탑':'/assets/ui/project-v/battlefields/v3-infinite-tower-sanctum-v1.png'
};

test('real continuous constructors, payload binding and texture loading use the shared battlefield method',async t=>{
  const previous=globalThis.matchMedia;globalThis.matchMedia=()=>({matches:false});
  t.after(()=>{if(previous)globalThis.matchMedia=previous;else delete globalThis.matchMedia;});
  const loaded=[];t.mock.method(Assets,'load',async url=>{loaded.push(url);return {url};});
  for(const [Engine,title] of [[ScrapyardEngine,'폐차장'],[CowEngine,'카우방'],[TowerEngine,'무한의탑'],...Object.keys(paths).map(title=>[NativeEngine,title])]){
    const payload={title,mode:title==='무한의탑'?'TOWER':'HUNT',battleV2:{teams:{A:{cards:[]},B:{cards:[]}}}};
    const engine=new Engine({battleData:payload});
    assert.equal(engine.activeBattlefieldAsset,paths[title],`${title}: constructor`);
    assert.equal(typeof engine.battlefieldAsset,'function');
    await LiveEngine.prototype.applyBattlePayload.call(engine,payload);
    assert.equal(engine.activeBattlefieldAsset,paths[title],`${title}: payload`);
    await engine.setBattlefield(payload.mode);
    assert.equal(engine.activeBattlefieldAsset,paths[title],`${title}: transition`);
    assert.deepEqual(await engine.loadBattlefieldTexture(payload.mode),{url:paths[title]});
    assert.equal(loaded.at(-1),paths[title]);
  }
});

test('ordinary PVE/PVP/raid/escort/siege and palace scenes still select their own backgrounds',async t=>{
  const previous=globalThis.matchMedia;globalThis.matchMedia=()=>({matches:false});
  t.after(()=>{if(previous)globalThis.matchMedia=previous;else delete globalThis.matchMedia;});
  const engine=new LiveEngine({battleData:{mode:'SIEGE',sceneAssetKey:'COUP_PALACE'}});
  assert.equal(engine.activeBattlefieldAsset,'/assets/ui/coup/imperial-palace-coup-v2115.png');
  for(const [mode,file] of [['HUNT','v3-nightmare-forest-battlefield-v1.png'],['PVP','arena-v1.png'],['RAID','v3-world-raid-obsidian-citadel-v1.png'],['ESCORT','escort-fortress-route-bg-v1.webp?v=1830'],['SIEGE','v3-siege-fortress-courtyard-v1.png']]){
    await engine.applyBattlePayload({mode,battleV2:{}});
    assert.ok(engine.activeBattlefieldAsset.endsWith(file),mode);
  }
});
