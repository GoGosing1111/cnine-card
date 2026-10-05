import test,{after} from 'node:test';
import assert from 'node:assert/strict';
import {Assets,Texture} from 'pixi.js';
import {gsap} from 'gsap';
import {BattleEngine} from '../preview/project-v-v3/source/battle/BattleEngine.js';

after(()=>gsap.ticker.sleep());
const engine=()=>({resolveBattlefieldAsset:()=>'/assets/ui/coin-prediction/arena-v1.png',activeBattlefieldTexture:null});

test('a rejected primary and compatibility background cannot abort a saved ranked duo replay',async t=>{
  const calls=[];t.mock.method(Assets,'load',async url=>{calls.push(url);throw new TypeError('Failed to fetch');});
  assert.equal(await BattleEngine.prototype.loadBattlefieldTexture.call(engine(),'PVP'),Texture.EMPTY);
  assert.equal(calls.length,2);
});

test('a background outage preserves the previously loaded scene and leaves battle data unchanged',async t=>{
  const texture={valid:true},battle={winner:'A',reward:250000},context={...engine(),activeBattlefieldTexture:texture,livePayload:battle};
  t.mock.method(Assets,'load',async()=>{throw new Error('network unavailable');});
  assert.equal(await BattleEngine.prototype.loadBattlefieldTexture.call(context,'PVE'),texture);
  assert.deepEqual(battle,{winner:'A',reward:250000});
});

test('a working primary is retained and a working compatibility image recovers a failed primary',async t=>{
  const primary={},fallback={};let calls=0;
  const mock=t.mock.method(Assets,'load',async()=>{calls++;return primary;});
  assert.equal(await BattleEngine.prototype.loadBattlefieldTexture.call(engine(),'PVP'),primary);assert.equal(calls,1);
  mock.mock.mockImplementation(async()=>{if(++calls===2)throw new Error('primary unavailable');return fallback;});
  assert.equal(await BattleEngine.prototype.loadBattlefieldTexture.call(engine(),'PVP'),fallback);assert.equal(calls,3);
});

test('a stalled background request has a bounded wait and a later scene can load normally',async t=>{
  t.mock.timers.enable({apis:['setTimeout']});
  const mock=t.mock.method(Assets,'load',()=>new Promise(()=>{}));
  const loading=BattleEngine.prototype.loadBattlefieldTexture.call(engine(),'PVP');
  t.mock.timers.tick(2501);await Promise.resolve();await Promise.resolve();await Promise.resolve();
  t.mock.timers.tick(2501);await Promise.resolve();await Promise.resolve();await Promise.resolve();
  assert.equal(await loading,Texture.EMPTY);
  const recovered={};mock.mock.mockImplementation(async()=>recovered);
  assert.equal(await BattleEngine.prototype.loadBattlefieldTexture.call(engine(),'PVP'),recovered);
});

test('the shell keeps its CSS artwork for a transparent fallback and removes it after texture recovery',()=>{
  const toggles=[],context={activeBattlefieldTexture:Texture.EMPTY,parallaxLayers:[],host:{classList:{toggle:(name,enabled)=>toggles.push({name,enabled})}}};
  BattleEngine.prototype.layoutParallax.call(context,1600,820);
  context.activeBattlefieldTexture={width:1024,height:1536};
  BattleEngine.prototype.layoutParallax.call(context,1600,820);
  assert.deepEqual(toggles,[{name:'is-v3-background-fallback',enabled:true},{name:'is-v3-background-fallback',enabled:false}]);
});
