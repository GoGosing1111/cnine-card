import test, {after} from 'node:test';
import assert from 'node:assert/strict';
import {Assets} from 'pixi.js';
import {gsap} from 'gsap';
import {BattleEngine as LiveEngine} from '../preview/project-v-v3/source/battle/BattleEngine.js';
import {BattleEngine as ScrapyardEngine} from '../preview/scrapyard-v3-v1/source/ScrapyardBattleEngine.js';
import {BattleEngine as CowEngine} from '../preview/cow-room-v3-v1/source/CowBattleEngine.js';
import {BattleEngine as TowerEngine} from '../preview/infinite-tower-v3-v1/source/TowerBattleEngine.js';
import {BattleEngine as NativeEngine} from '../pve-v3/BattleEngine.js';

after(()=>gsap.ticker.sleep());
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
