import * as PIXI from 'pixi.js';
import * as core from '@v3/core';
import {AdvancementEffects} from './AdvancementEffects.mjs';
import {AdvancementStateEffects} from './AdvancementStateEffects.mjs';
import {createAdvancementWindow} from './ui/AdvancementWindow.mjs';
import {createFixtureAdapter} from './ui/fixture-adapter.mjs';
import {ADVANCEMENT_FX,FX_BY_ID} from './painted-v2/catalog.mjs';
window.PIXI=PIXI;
const api=window.advancementReview={ready:false,errors:[],impacts:[],catalog:ADVANCEMENT_FX};
window.addEventListener('error',e=>api.errors.push(e.message));window.addEventListener('unhandledrejection',e=>api.errors.push(String(e.reason)));
document.addEventListener('DOMContentLoaded',async()=>{try{
 const payload=await(await fetch('/fixture.json')).json(),modal=document.querySelector('#modal'),live=window.ProjectVBattleV3Live;
 const view=live.prepareLoading({modal,mode:'HUNT',playerName:'전직 효과 검수',opponentName:'검수 상대'}),mount=window.ProjectVPixiBattle.mountForBattle;let engine;
 window.ProjectVPixiBattle.mountForBattle=async(...args)=>(engine=await mount(...args));
 const renderer=await live.createRenderer({...view,modal,data:payload,mode:'HUNT',playerName:'전직 효과 검수'});window.ProjectVPixiBattle.mountForBattle=mount;
 await engine.deployCards({instant:true,force:true});
 const fx=await AdvancementEffects.create(engine),stateFx=await AdvancementStateEffects.create(engine,{battleId:'local-advancement-review'});let serial=0,current=null,paused=false;
 const select=document.querySelector('#effect');for(const s of ADVANCEMENT_FX){const opt=document.createElement('option');opt.value=s.id;opt.textContent=s.name;select.append(opt);}
 const speed=()=>Number(document.querySelector('#speed').value);
 const event=(id,extra={})=>{
  const ally=engine.mercenaries.filter(a=>a.team==='ALLY'),enemy=engine.enemies.filter(a=>engine.isAlive(a)),reverse=document.querySelector('#direction').value==='enemy';
  const actor=reverse?enemy[0]:ally[0],friend=reverse?enemy[1]||enemy[0]:ally[1]||ally[0];
  const target=['healer','guardian','cleanser'].includes(id)?friend:['self'].includes(FX_BY_ID.get(id).anchor)?actor:reverse?ally[0]:enemy[0];
  return {id,eventId:'fixture:'+ ++serial,actor,target,allies:reverse?enemy:ally,...extra};
 };
 const setStatus=id=>{const s=FX_BY_ID.get(id);document.querySelector('#status').textContent=s.name+' · '+s.trigger+' · ImageGen 연속 작화 · 로컬 전투 검수';};
 async function play(id=select.value,options={}){
  if(options.cancel!==false)fx.cancel();select.value=id;setStatus(id);
  current=await fx.play(event(id,options.event),{speed:options.speed||speed(),paused:!!options.paused});api.current=current;return current;
 }
 function seek(t){if(current&&!current.disposed){current.timeline.pause();current.timeline.time(Math.min(t,current.duration-1e-5),false);current.render(Math.min(t,current.duration-1e-5));engine.app.render();}return fx.audit();}
 function pause(value){paused=value;for(const entry of engine.simpleTimelines)value?entry.instance.pause():entry.instance.resume();document.querySelector('#pause').textContent=value?'재개':'일시정지';}
 const cancel=()=>{fx.cancel();stateFx.cancel();engine.cancelTimelines();current=null;api.current=null;};
 async function state(id,extra={}){
  const e=event(id);return stateFx.apply({battleId:'local-advancement-review',id,actor:e.actor,allies:[...engine.allies,...engine.mercenaries.filter(a=>a.team==='ALLY')],revision:++serial,charged:true,remaining:3,active:true,...extra});
 }
 async function showState(value=document.querySelector('#state').value){
  cancel();const id=value.startsWith('shield-')?'shield-knight':value==='avenger-charge'?'avenger':'commander';
  await state(id,id==='shield-knight'?{remaining:Number(value.at(-1))}:{});stateFx.setSpeed(speed());
  document.querySelector('#status').textContent=FX_BY_ID.get(id).name+' · 지속 상태 연출 · 로컬 검수';
 }
 const fixtureAdapter=createFixtureAdapter();
 const advancementWindow=createAdvancementWindow({adapter:fixtureAdapter,onPreview:async id=>{await play(id);if(['avenger','commander','shield-knight'].includes(id))await state(id);}});
 document.querySelector('#openAdvancement').onclick=()=>advancementWindow.open();
 document.querySelector('#showState').onclick=()=>showState();
 async function attackWithFx(id=select.value){
  cancel();setStatus(id);const e=event(id),before=api.impacts.length;
  // Warm only this clip before the real normal-attack contact; the visual
  // event still carries a separate stable ID and never changes the server hit.
  const warm=await fx.begin({...e,eventId:'warm:'+e.eventId});warm?.destroy();
  const combatTarget=(e.actor.team==='ALLY'?engine.enemies:engine.allies).find(a=>engine.isAlive(a));
  const ok=await engine.normalAttack(0,{attacker:e.actor,target:combatTarget,damage:1000,targetHp:90,onImpact:t=>{api.impacts.push({actor:e.actor.id,target:t.id});void fx.play(e,{speed:speed()}).then(s=>{current=s;api.current=s;});}});
  return {ok,hits:api.impacts.length-before};
 }
 document.querySelector('#play').onclick=()=>play();document.querySelector('#attack').onclick=()=>attackWithFx();
 document.querySelector('#all').onclick=async()=>{for(const s of ADVANCEMENT_FX){const session=await play(s.id);if(!session||!await session.done)break;}};
 document.querySelector('#pause').onclick=()=>pause(!paused);document.querySelector('#cancel').onclick=cancel;
 document.querySelector('#enabled').onchange=e=>{fx.setEnabled(e.target.checked);stateFx.setEnabled(e.target.checked);};
 document.querySelector('#speed').onchange=()=>{for(const entry of engine.simpleTimelines)entry.instance.timeScale(speed());};
 document.querySelector('#seek').oninput=e=>seek(Number(e.target.value));
 select.onchange=()=>play();document.querySelector('#direction').onchange=cancel;
 const audit=()=>({ready:api.ready,errors:[...api.errors],canvasCount:modal.querySelectorAll('canvas').length,pixi:PIXI.VERSION,engineType:engine.constructor.name,fx:fx.audit(),stateFx:stateFx.audit(),impacts:[...api.impacts],actors:[...engine.allies,...engine.enemies].map(a=>({id:a.id,name:a.name,team:a.team,hp:a.hp,shield:a.shield,root:{x:a.root.x,y:a.root.y},bodyHeight:a.art?.bodyHeight}))});
 Object.assign(api,{engine,renderer,fx,stateFx,state,showState,advancementWindow,fixtureAdapter,play,seek,pause,cancel,attackWithFx,event,audit});setStatus(ADVANCEMENT_FX[0].id);
 // Control/status text and webfonts can change the available stage height.
 // Let the existing renderer finish that initial layout before exposing QA.
 await document.fonts.ready;
 await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));
 engine.app.resize?.();engine.resize();engine.app.render();api.ready=true;
 if(new URLSearchParams(location.search).get('ui')==='1')await advancementWindow.open();
 window.addEventListener('pagehide',()=>{advancementWindow.destroy();void stateFx.destroy();void fx.destroy();core.destroy();},{once:true});
}catch(error){api.errors.push(error.stack);document.querySelector('#status').textContent=error.stack;console.error(error);}});
