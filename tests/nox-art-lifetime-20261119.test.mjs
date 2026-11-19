import test from 'node:test';
import assert from 'node:assert/strict';
import {Texture,TextureSource} from 'pixi.js';
import {NoxBattleArt} from '../raid/nox/assets.mjs';

const texture=()=>new Texture({source:new TextureSource({width:64,height:64})});
test('retry replaces every retired Nox texture and releases all 48 frame views',async()=>{
  let cache=new Map();const remembered=new Set(),art=new NoxBattleArt({load:async url=>{if(!cache.has(url))cache.set(url,texture());return cache.get(url);}},{remember:url=>remembered.add(url)});
  let lastIdle;
  for(let attempt=0;attempt<3;attempt++){
    assert.equal(await art.load(),true);assert.equal(remembered.size,9);assert.deepEqual(art.diagnostics(),{poses:6,fxFrames:48,invalid:0});
    assert.notEqual(art.poses.idle,lastIdle);lastIdle=art.poses.idle;const frames=Object.values(art.fx).flat();
    art.clear();assert(frames.every(t=>t.destroyed));assert.equal(lastIdle.destroyed,false,'the V3 asset lease, not a frame view, owns the source');
    for(const t of cache.values())t.destroy(true);cache=new Map();remembered.clear();
    assert.deepEqual(art.diagnostics(),{poses:0,fxFrames:0,invalid:0});
  }
});
test('an interrupted preparation cannot repopulate art after teardown',async()=>{
  let resolve;const ready=new Promise(r=>resolve=r),sources=[];const art=new NoxBattleArt({load:async()=>{await ready;const t=texture();sources.push(t);return t;}},{remember(){}});
  const pending=art.load();art.clear();resolve();assert.equal(await pending,false);assert.deepEqual(art.diagnostics(),{poses:0,fxFrames:0,invalid:0});
  for(const t of sources)t.destroy(true);
});
