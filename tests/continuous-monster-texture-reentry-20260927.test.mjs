import test from 'node:test';import assert from 'node:assert/strict';import {Assets} from 'pixi.js';
import {BattleEngine as Base} from '../preview/project-v-v3/source/battle/BattleEngine.js';
import {BattleEngine as Continuous} from '../preview/scrapyard-v3-v1/source/ScrapyardBattleEngine.js';
test('multi -> single -> multi reloads released monster texture sources and retains valid entries',async t=>{
 t.mock.method(Base.prototype,'applyBattlePayload',async()=>{});
 const loaded=[];t.mock.method(Assets,'load',async url=>{loaded.push(url);return{source:{uid:loaded.length},url};});
 const alive={source:{uid:99}},dead={source:null,destroyed:true},deadSource={source:{destroyed:true}};
 const engine=Object.create(Continuous.prototype),remembered=[];
 Object.assign(engine,{spriteTextures:new Map([['alive.png',alive],['released.png',dead],['source-released.png',deadSource]]),enemies:[],isAlive:()=>false,bindMonster(){},rememberPendingLiveAsset:(url,texture)=>remembered.push({url,texture})});
 const payload={continuousEncounter:{instances:['alive.png','released.png','source-released.png'].map((battleSprite,i)=>({id:i,battleSprite})),initialIds:[]},battleV2:{teams:{}}};
 await engine.applyBattlePayload(payload);assert.deepEqual(loaded,['released.png','source-released.png']);assert.equal(engine.spriteTextures.get('alive.png'),alive);
 assert.ok(remembered.every(r=>r.texture.source&&!r.texture.destroyed));
 await engine.applyBattlePayload(payload);assert.equal(loaded.length,2);
});
