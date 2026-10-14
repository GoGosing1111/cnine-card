import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const read=file=>fs.readFileSync(new URL('../'+file,import.meta.url),'utf8');
const app=read('js/app.js'),wrapper=read('js/battle-v3-live.js');
const runtime=wrapper.match(/const BATTLE_RUNTIME = '([^']+)'/)[1];
const earlier=runtime.slice(0,runtime.lastIndexOf('-azant-berkan-parity-'));
const loader=app.slice(app.indexOf('const FEATURE_RESOURCE_MANIFEST='),app.indexOf('function featureKeyForTab('));
const playback=['prepareBattleV2LiveLoading','playPveBattleV2Live','playPvpBattleV2Live','playSiegeBattleV2Live'];

function harness({expected=runtime,staleWrapper=false,failRefresh=false}={}){
 const requests=[],scripts=[],context={console,setTimeout,clearTimeout};context.window=context;
 const engine=version=>({runtimeVersion:version,destroy(){}});
 const load=node=>{
  requests.push(node.src||node.href);
  queueMicrotask(()=>{
   if(failRefresh&&node.src?.includes('battleRecovery=')){node.onerror?.();return;}
   const url=new URL(node.src||node.href,'https://game.invalid/');
   if(url.pathname.endsWith('project-v-pixi-battle.bundle.js'))context.ProjectVPixiBattle=engine(runtime);
   else if(url.pathname.endsWith('battle-v3-live.js'))vm.runInContext(staleWrapper&&!url.searchParams.has('battleRecovery')?wrapper.replaceAll(runtime,earlier):wrapper,context);
   else if(url.pathname.endsWith('project-v-firearm-qc-audio.js'))context.ProjectVFirearmAudio={};
   else if(url.pathname.endsWith('battle-v2-live.js'))for(const name of playback)context[name]=()=>{};
   node.onload?.();
  });
 };
 context.document={scripts,querySelectorAll:()=>[],createElement:()=>({dataset:{},getAttribute(k){return this[k];},remove(){}}),head:{appendChild:load},body:{appendChild(node){scripts.push(node);load(node);}}};
 vm.createContext(context);
 const api=vm.runInContext(loader+'\n({manifest:FEATURE_RESOURCE_MANIFEST.battleV2,ensureFeatureResources,featureResourcePromises})',context);
 api.manifest.runtimeVersion=expected;
 return {...api,context,requests};
}

test('an open pre-deploy lobby accepts a newer coherent compatible engine and wrapper',async()=>{
 const h=harness({expected:earlier});
 await h.ensureFeatureResources('battleV2');
 assert.equal(h.manifest.ready(),true);
 assert.equal(h.context.ProjectVPixiBattle.runtimeVersion,runtime);
 assert.equal(h.context.ProjectVBattleV3Live.runtimeVersion,runtime);
 assert.equal(h.requests.filter(x=>x.includes('battleRecovery=')).length,0);
});

test('a cached wrapper cannot pin a newer engine to an old version; one paired refresh repairs it',async()=>{
 const h=harness({staleWrapper:true});
 await Promise.all([h.ensureFeatureResources('battleV2'),h.ensureFeatureResources('battleV2')]);
 assert.equal(h.manifest.ready(),true);
 const recovery=h.requests.filter(x=>x.includes('battleRecovery='));
 assert.equal(recovery.length,2);assert(recovery.some(x=>x.includes('battle-v3-live.js')));assert(recovery.some(x=>x.includes('project-v-pixi-battle.bundle.js')));
});

test('a completed resource promise cannot hide a runtime replaced by another scene',async()=>{
 const h=harness();await h.ensureFeatureResources('battleV2');
 h.context.ProjectVPixiBattle.runtimeVersion='obsolete-runtime';
 await h.ensureFeatureResources('battleV2');
 assert.equal(h.manifest.ready(),true);assert.equal(h.featureResourcePromises.size,0);
});

test('failed refresh is bounded and leaves entry retryable without starting a battle',async()=>{
 const h=harness({staleWrapper:true,failRefresh:true});
 await assert.rejects(h.ensureFeatureResources('battleV2'));
 assert.equal(h.requests.filter(x=>x.includes('battleRecovery=')).length,2);
 assert.equal(h.featureResourcePromises.size,0);assert.equal(h.manifest.ready(),false);
});

test('an older matching pair and an unrelated runtime never satisfy the current manifest',async()=>{
 const h=harness();await h.ensureFeatureResources('battleV2');
 for(const version of [earlier,'unrelated-runtime']){
  h.context.ProjectVPixiBattle.runtimeVersion=version;
  vm.runInContext(wrapper.replaceAll(runtime,version),h.context);
  assert.equal(h.context.ProjectVBattleV3Live.ready(),true);
  assert.equal(h.manifest.ready(),false);
 }
});

test('a newer pair with a breaking entry contract is not accepted by an open lobby',async()=>{
 const h=harness({expected:earlier});await h.ensureFeatureResources('battleV2');
 vm.runInContext(wrapper.replace('entryContractVersion: 1','entryContractVersion: 2'),h.context);
 assert.equal(h.context.ProjectVBattleV3Live.ready(),true);assert.equal(h.manifest.ready(),false);
});

test('core resource failure creates no attempt or abandon request and restores the button',async()=>{
 const core=read('js/core-protocol-raid-v1924.js');
 const body=core.slice(core.indexOf('  async function battle()'),core.indexOf('  function bindActions()'));
 const busy=[],calls=[],context={data:{current:{id:'local-room'}},activeAttempt:null,CLIENT_SESSION_ID:'local-session',
  bridge:()=>({ensureFeatureResources:async()=>{throw new Error('resource recovery failed');}}),
  setBusy:value=>busy.push(value),document:{getElementById:()=>null},stopAttemptWatch:()=>{},load:async()=>{},requestId:()=>crypto.randomUUID(),api:async path=>calls.push(path)};
 const battle=vm.runInNewContext(body+'\nbattle',context);
 await assert.rejects(battle(),/resource recovery failed/);assert.deepEqual(calls,[]);assert.deepEqual(busy,[true,false]);assert.equal(context.activeAttempt,null);
});
