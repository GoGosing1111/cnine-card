import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {v3Harness} from './helpers/v3-raid-renderer-harness.mjs';
import {createPveContinuousSession} from '../js/pve-continuous-session-v1.mjs';

const source=readFileSync(new URL('../js/cow-room-live.mjs',import.meta.url),'utf8').replace(/^import .*\r?\n/gm,'').replace(/^export /gm,'');
const tick=async()=>{for(let i=0;i<40;i++)await Promise.resolve();};
const deferred=()=>{let resolve,reject;const promise=new Promise((yes,no)=>{resolve=yes;reject=no;});return {promise,resolve,reject};};
const classes=()=>{const values=new Set();return {add:(...names)=>names.forEach(n=>values.add(n)),remove:(...names)=>names.forEach(n=>values.delete(n)),contains:n=>values.has(n)};};

async function harness({holdConstruction=false}={}){
 const values=new Map(),posts=[],refreshes=[],playback=deferred(),construction=deferred();
 const storage={getItem:key=>values.get(key)||null,setItem:(key,value)=>values.set(key,value),removeItem:key=>values.delete(key)};
 const result={ok:true,status:'COMPLETED',requestId:'cow-saved-result',difficulty:{id:'PASTURE'},success:true,rewards:[{rewardType:'COIN',rewardRef:'COIN',quantity:500000000}],battleV2:{result:{winner:'A',timeline:[]}}};
 const session=createPveContinuousSession({accountId:7,content:'COW_ROOM',validateSelection:value=>value==='PASTURE',makeRequestId:()=>result.requestId,storage,transport:{status:async()=>({ok:true,status:'IDLE'}),run:async body=>{posts.push(body);return result;}}});
 await session.start('PASTURE');
 const live=v3Harness(),stage=live.stage,header={},field={style:{}},controls={remove(){this.removed=true;}},pause={},skip={},confirm={focus(){this.focused=true;}};
 const message={innerHTML:''};let hasStage=false,markup='',modal,renderer,rendererOptions,stopped=0;
 stage.querySelector=selector=>selector.startsWith('.battle-v3-header')?header:selector==='.battle-v3-canvas-host'?field:null;
 stage.insertAdjacentHTML=(_position,html)=>{pause.disabled=/<button[^>]*data-cow-pause[^>]*disabled/.test(html);skip.disabled=/<button[^>]*data-cow-result[^>]*disabled/.test(html);};
 const context={console:{warn(){}},createPveContinuousSession,localStorage:storage,addEventListener(){},CustomEvent:class{constructor(type,options){this.type=type;this.detail=options?.detail;}},
  request:async path=>{refreshes.push(path);return {portals:{available:1}};},
  document:{addEventListener(){},body:{append(){},classList:classes()},createElement(){modal={classList:classes(),setAttribute(){},remove(){this.removed=true;},get innerHTML(){return markup;},set innerHTML(value){markup=value;hasStage=false;},querySelector(selector){
   if(selector==='#battleMessage')return hasStage?message:null;
   if(selector==='[data-cow-confirm]')return confirm;
   return {'[data-cow-controls]':controls,'[data-cow-pause]':pause,'[data-cow-result]':skip}[selector]||null;
  }};return modal;}},
  ensureFeatureResources:async()=>{},
  ProjectVPixiBattle:{cancelActiveAnimations(){stopped++;},stopAccountBattleUnitSustainedFire:async()=>{},startAccountBattleUnitSustainedFire(){}},
  ProjectVBattleV3Live:{prepareLoading(){hasStage=true;return {stage,phase:{}};}}
 };
 // The real shared renderer owns showResult/destroy, including its destroyed guard.
 const canvas={width:1600,height:820,getContext:()=>({isContextLost:()=>false})};
 context.ProjectVBattleV3Live.createRenderer=async options=>{rendererOptions=options;if(holdConstruction)await construction.promise;renderer=await live.create({data:options.data,mode:'PVE',host:{querySelector:selector=>selector==='canvas'?canvas:null,querySelectorAll:()=>[]}});renderer.play=()=>playback.promise;return renderer;};
 context.window=context;context.dispatchEvent=()=>{};
 vm.runInNewContext(source+'\nglobalThis.testCow={activate(value){active=true;session=value;},present,hide};',context);
 context.testCow.activate(session);
 const presenting=context.testCow.present(result);await tick();
 const visible=()=>hasStage?stage.classList.contains('is-result-visible')&&message.innerHTML.includes('data-cow-confirm'):modal.className.includes('cow-live-loading')&&markup.includes('data-cow-confirm');
 return {context,session,storage,posts,refreshes,playback,construction,presenting,pause,skip,confirm,visible,message,get modal(){return modal;},get rendererOptions(){return rendererOptions;},get stopped(){return stopped;}};
}

for(const paused of [false,true])test(`Cow result skip reveals the saved receipt with real V3 lifecycle${paused?' while paused':''}`,async()=>{
 const h=await harness();
 let waiting;
 if(paused){h.pause.onclick();waiting=h.rendererOptions.beforeCombatEvent();await tick();}
 h.skip.onclick();await tick();
 assert.equal(h.visible(),true,'result must be visible after stopping the V3 renderer');
 assert.match(h.modal.innerHTML,/카우 킹 토벌 완료/);assert.match(h.modal.innerHTML,/\+5억/);
 assert.equal(h.modal.__battleV2Renderer,null,'destroyed renderer is detached from the result modal');
 assert.ok(h.storage.getItem(h.session.storageKey),'receipt remains recoverable until confirmation');
 assert.equal(h.posts.length,1,'result viewing must not enter or award again');
 if(waiting)await waiting;
 const markup=h.modal.innerHTML,refreshes=h.refreshes.length;
 h.playback.reject(new Error('cancelled playback'));await h.presenting;
 assert.equal(h.modal.innerHTML,markup,'late cancellation cannot replace the already shown result');
 assert.equal(h.refreshes.length,refreshes,'result is presented once');
 h.context.testCow.hide();h.session.dispose();
});

test('Cow natural completion keeps the live result layer and pending receipt',async()=>{
 const h=await harness();h.playback.resolve(true);await h.presenting;
 assert.equal(h.visible(),true);assert.match(h.message.innerHTML,/\+5억/);
 assert.ok(h.storage.getItem(h.session.storageKey));assert.equal(h.posts.length,1);
 h.context.testCow.hide();h.session.dispose();
});

test('Cow battle controls wait for renderer readiness',async()=>{
 const h=await harness({holdConstruction:true});
 assert.equal(h.skip.disabled,true);assert.equal(h.pause.disabled,true);
 h.construction.resolve();await tick();
 assert.equal(h.skip.disabled,false);assert.equal(h.pause.disabled,false);
 h.skip.onclick();assert.equal(h.visible(),true);h.playback.resolve(false);await h.presenting;
 h.context.testCow.hide();h.session.dispose();
});
