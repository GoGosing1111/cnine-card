import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import vm from 'node:vm';

const read=file=>fs.readFileSync(new URL('../'+file,import.meta.url),'utf8');
const memorySource=read('preview/project-v-v3/source/battle/BattleAssetMemory.mjs');
const entrySource=read('preview/project-v-v3/source/project-v-pixi-battle.src.js');
const deferred=()=>{let resolve,reject;const promise=new Promise((a,b)=>{resolve=a;reject=b;});return {promise,resolve,reject};};
function assets(){
  const cache=new Map(),unloaded=[];
  return {cache,unloaded,async load(url){cache.set(url,{url});return cache.get(url);},async unload(url){unloaded.push(url);cache.delete(url);}};
}
function memory(A,extra={}){
  const context={Assets:A,URL,Map,Set,Promise,...extra};
  vm.runInNewContext(memorySource.replace(/^import .*;\r?$/gm,'').replace(/^export /gm,'')+'\nthis.memory=battleAssetMemory;this.image=battleImageUrl;',context);
  return context;
}
test('close releases owned bodies and motion while persistent shared atlases stay valid',async()=>{
  const A=assets(),{memory:m}=memory(A);
  const body='/assets/ui/project-v/characters/fur/test.png',motion='/preview/mercenary-limited-ayoon-heeya-v3-20261008/assets/runtime/ayoon-motion.png';
  const shared='/preview/mercenary-role-attacks-v2100/assets/guard/atlas.json';
  await Promise.all([body,motion,shared].map(url=>A.load(url)));
  await m.release();
  assert.equal(A.cache.size,1);assert.ok(A.cache.has(shared));
  assert.deepEqual(A.unloaded.sort(),[body,motion].sort());
  await A.load(body);await m.release();assert.equal(A.unloaded.filter(url=>url===body).length,2);
});
test('late warm-up downloads finish and unload before release resolves; duplicate close shares barrier',async()=>{
  const A=assets(),gate=deferred(),{memory:m}=memory(A),url='/preview/mercenary-prime-requiem-v1/late.webp';
  const work=gate.promise.then(()=>A.load(url));
  const closing=m.release([work]);assert.equal(m.release(),closing);
  let done=false;closing.then(()=>done=true);await Promise.resolve();assert.equal(done,false);
  gate.resolve();await closing;assert.ok(!A.cache.has(url));assert.deepEqual(A.unloaded,[url]);
  assert.equal(m.diagnostics().pendingLoads,0);
});
test('already retired and failed assets are not unloaded twice',async()=>{
  const A=assets(),{memory:m}=memory(A),url='/assets/cards/test.png';
  await A.load(url);await A.unload(url);m.remember('/failed.png');await m.release();
  assert.deepEqual(A.unloaded,[url]);
});
test('standalone Legion uses approved responsive maps after art selection and keeps unknown originals',()=>{
  const {image}=memory(assets(),{CNineResponsiveBattleSprites:{'art/body.png':'/body-768.webp'},CNineResponsiveCardImages:{'art/card.png':'/card'}});
  assert.equal(image('/art/body.png?v=original'),'/body-768.webp');
  assert.equal(image('/art/card.png',{cutIn:true}),'/card-384.webp');
  assert.equal(image('/approved-unmapped.png'),'/approved-unmapped.png');
  assert.equal(image('https://example.test/art.png'),'https://example.test/art.png');
});
function runtime({mountGate=null,releaseGate=null,playbackGate=null}={}){
  const instances=[],calls=[];
  class Engine{
    constructor(){this.index=instances.length;instances.push(this);this.visible=false;}
    setAccountBattleUnitPreviewFireHook(){}
    async mount(){if(this.index===0&&mountGate)await mountGate.promise;this.mounted=true;return this;}
    async resetSession(){return this;}
    async playEvents(){if(playbackGate)await playbackGate.promise;calls.push('playback-settled');return false;}
    setVisible(value){this.visible=value;calls.push('visible:'+value);}
    diagnostics(){return {mounted:this.mounted,visible:this.visible,index:this.index};}
    destroy(){this.destroyed=true;this.mounted=false;calls.push('destroy:'+this.index);}
  }
  const context={window:{},document:{getElementById:()=>({})},BattleEngine:Engine,ExpeditionBattleEngine:Engine,
    Assets:{},Container:class{},Graphics:class{},Sprite:class{},Texture:class{},Rectangle:class{},prepareSealDragon(){},
    battleWarmupWork:()=>[],battleAssetMemory:{async release(){calls.push('release');if(releaseGate)await releaseGate.promise;}},
    SkillEffectFX:{async release(){}},releaseMercenaryRoleAssets:async()=>{},releaseIdleBattleBuffers(){},battleTextureDiagnostics:()=>({})};
  vm.runInNewContext(entrySource.replace(/^import .*;\r?$/gm,'').replace(/^export .*;\r?$/gm,''),context);
  return {api:context.window.ProjectVPixiBattle,instances,calls};
}
test('background hide preserves scene; idle release cannot take an active battle',async()=>{
  const {api,instances}=runtime();await api.mountForBattle({});await api.setVisible(true);
  assert.equal(await api.releaseBattle({onlyIfIdle:true}),false);
  await api.setVisible(false);assert.equal(instances[0].destroyed,undefined);
  await api.setVisible(true);assert.equal(instances.length,1);
  await api.releaseBattle();assert.equal(instances[0].destroyed,true);
});
test('next battle waits until old images finish unloading',async()=>{
  const releaseGate=deferred(),{api,instances,calls}=runtime({releaseGate});
  await api.mountForBattle({});const close=api.releaseBattle();const next=api.mountForBattle({});
  await new Promise(resolve=>setImmediate(resolve));assert.equal(instances.length,1);
  assert.deepEqual(calls.slice(-2),['destroy:0','release']);
  releaseGate.resolve();await close;const replacement=await next;
  assert.equal(replacement.index,1);assert.equal(replacement.destroyed,undefined);
});
test('closing during initialization cancels its result and disposes only the old scene',async()=>{
  const mountGate=deferred(),{api,instances}=runtime({mountGate});
  const first=api.mountForBattle({}).then(()=>null,e=>e);
  const close=api.releaseBattle(),second=api.mountForBattle({});
  assert.equal(instances.length,1);mountGate.resolve();
  assert.ok(await first);await close;const replacement=await second;
  assert.equal(instances[0].destroyed,true);assert.equal(replacement.index,1);assert.equal(replacement.destroyed,undefined);
});
test('cancelled playback finishes its asynchronous cleanup before the scene is destroyed',async()=>{
  const playbackGate=deferred(),{api,instances,calls}=runtime({playbackGate});
  await api.mountForBattle({});const play=api.playEvents([]),close=api.releaseBattle();
  await new Promise(resolve=>setImmediate(resolve));assert.equal(instances[0].destroyed,undefined);
  playbackGate.resolve();await play;await close;
  assert.ok(calls.indexOf('playback-settled')<calls.indexOf('destroy:0'));
});
