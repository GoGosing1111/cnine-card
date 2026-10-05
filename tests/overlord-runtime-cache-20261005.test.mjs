import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';

const read=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');
const app=read('js/app.js'),wrapper=read('js/battle-v3-live.js');
const runtime=read('preview/project-v-v3/project-v-pixi-battle.bundle.js').match(/runtimeVersion:\s*["']([^"']+)["']/)[1];
const oldRuntime='20261005-coop-readable-v4-backdrop';
// The actual pre-Overlord wrapper differs only in its runtime constant; it did
// not expose runtimeVersion. Keep its old downgrade behavior in the cache.
const oldWrapper=wrapper.replaceAll(runtime,oldRuntime).replace(/    runtimeVersion: BATTLE_RUNTIME,\r?\n/,'');
const lobby=app.slice(app.indexOf('const FEATURE_RESOURCE_MANIFEST='),app.indexOf('function featureKeyForTab('));

function warmLobby({alreadyLoaded=false}={}){
 const requests=[],scripts=[],context={console,setTimeout,clearTimeout};context.window=context;
 const engine=version=>({runtimeVersion:version,destroy(){}});
 const load=node=>{
  requests.push(node.src||node.href);
  queueMicrotask(()=>{
   try{
    const url=new URL(node.src||node.href,'https://game.invalid/');
    if(url.pathname.endsWith('project-v-pixi-battle.bundle.js')){
     context.ProjectVPixiBattle=engine(url.searchParams.get('battleRuntime')===oldRuntime?oldRuntime:runtime);
    }else if(url.pathname.endsWith('battle-v3-live.js')){
     // Existing players have cached the former URL, which had no Overlord key.
     vm.runInNewContext(url.searchParams.has('overlord')?wrapper:oldWrapper,context);
    }else if(url.pathname.endsWith('project-v-firearm-qc-audio.js'))context.ProjectVFirearmAudio={};
    else if(url.pathname.endsWith('battle-v2-live.js'))for(const name of ['prepareBattleV2LiveLoading','playPveBattleV2Live','playPvpBattleV2Live','playSiegeBattleV2Live'])context[name]=()=>{};
    node.onload?.();
   }catch(error){node.onerror?.(error);}
  });
 };
 context.document={scripts,querySelectorAll:()=>[],createElement:()=>({dataset:{},getAttribute(key){return this[key];},remove(){}}),head:{appendChild:load},body:{appendChild(node){scripts.push(node);load(node);}}};
 if(alreadyLoaded){
  context.ProjectVPixiBattle=engine(oldRuntime);context.ProjectVFirearmAudio={};
  for(const name of ['prepareBattleV2LiveLoading','playPveBattleV2Live','playPvpBattleV2Live','playSiegeBattleV2Live'])context[name]=()=>{};
  vm.runInNewContext(oldWrapper,context);
 }
 const api=vm.runInNewContext(lobby+'\n({manifest:FEATURE_RESOURCE_MANIFEST.battleV2,ensureFeatureResources})',context);
 return {...api,context,requests};
}

test('the actual lobby cannot downgrade the new suit engine through a cached pre-Overlord wrapper',async()=>{
 const h=warmLobby();
 await h.ensureFeatureResources('battleV2');
 assert.equal(h.context.ProjectVPixiBattle.runtimeVersion,runtime);
 assert.equal(h.context.ProjectVBattleV3Live.runtimeVersion,runtime);
 assert.ok(!h.requests.some(url=>url.includes('battleRuntime='+oldRuntime)&&!url.includes(oldRuntime+'-overlord')),'no request for an obsolete engine');
 assert.equal(h.manifest.ready(),true);
});

test('an already loaded old wrapper/engine pair cannot satisfy the current lobby readiness gate',async()=>{
 const h=warmLobby({alreadyLoaded:true});
 assert.equal(h.context.ProjectVBattleV3Live.ready(),true,'the old pair agrees with itself');
 assert.equal(h.manifest.ready(),false,'the current lobby must reject that old pair');
 await Promise.all([h.ensureFeatureResources('battleV2'),h.ensureFeatureResources('battleV2')]);
 assert.equal(h.context.ProjectVPixiBattle.runtimeVersion,runtime);
 assert.equal(h.context.ProjectVBattleV3Live.runtimeVersion,runtime);
 assert.equal(h.requests.filter(x=>x.includes('/battle-v3-live.js')).length,1);
});

test('native and sustained PVE entries invalidate both cached halves and the loader document',()=>{
 const token=new URL(warmLobby().manifest.scripts.find(x=>x.includes('/battle-v3-live.js')),'https://game.invalid/').searchParams.get('overlord');
 assert.ok(token,'main entry must version the wrapper');
 const native=read('pve-v3/battle-loader.mjs');
 const urls=[...native.matchAll(/['"]([^'"\s]+(?:bundle\.js|battle-v3-live\.js)\?[^'"]+)['"]/g)].map(x=>x[1]);
 assert.equal(urls.length,3);
 for(const url of urls)assert.equal(new URL(url,'https://game.invalid').searchParams.get('overlord'),token,url);
 const nativeHtml=read('pve-v3/battle.html');
 assert.ok(nativeHtml.includes('overlord='+token),'version the nested module loader too');
 const sustained=read('preview/sustained-hunt-v2/index.html');
 for(const [,url]of sustained.matchAll(/src="([^"]*(?:battle\.bundle\.js|battle-v3-live\.js)[^"]*)"/g))assert.equal(new URL(url.replaceAll('&amp;','&'),'https://game.invalid/').searchParams.get('overlord'),token,url);
 assert.ok(read('index.html').includes('overlord='+token),'the root must request the current lobby');
});
