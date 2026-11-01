import * as PIXI from 'pixi.js';
import * as core from '@v3/core';
import {BattleCharacter} from '@v3/character';
import {SpineBattleAdapter,connectSpineAttacks} from './SpineBattleAdapter.mjs';
import {BakedBattleEffects} from '../v35-effects-production-20261102/BakedBattleEffects.mjs';
import {WhitecoatBattleAdapter} from '../v35-whitecoat-swordsman-20261102/WhitecoatBattleAdapter.mjs';
import {WhitecoatEffects} from '../v35-whitecoat-swordsman-20261102/WhitecoatEffects.mjs';
window.PIXI=PIXI;
const api=window.v35Review={ready:false,errors:[],impacts:[],normalPlayback:[]};
window.addEventListener('error',e=>api.errors.push(e.message));window.addEventListener('unhandledrejection',e=>api.errors.push(String(e.reason)));
document.addEventListener('DOMContentLoaded',async()=>{try{
 const kind=new URLSearchParams(location.search).get('case')||'whitecoat',whitecoat=kind.startsWith('whitecoat');document.querySelector('#case').value=kind;
 const payload=await(await fetch('/fixture.json?case='+(whitecoat?'mixed':kind))).json(),modal=document.querySelector('#modal');
 const live=window.ProjectVBattleV3Live,view=live.prepareLoading({modal,mode:'HUNT',playerName:'V3.5 검수 분대',opponentName:'검수 상대'});
 const mount=window.ProjectVPixiBattle.mountForBattle;let engine;window.ProjectVPixiBattle.mountForBattle=async(...args)=>(engine=await mount(...args));
 const renderer=await live.createRenderer({...view,modal,data:payload,mode:'HUNT',playerName:'V3.5 검수 분대'});window.ProjectVPixiBattle.mountForBattle=mount;
 await engine.deployCards({instant:true,force:true});
 if(kind==='mixed'||kind==='enemy'){
  const base='/preview/v35-character-baseline-20261101/attack-v2/',delivery=await(await fetch(base+'qa/native.json')).json();
  await PIXI.Assets.load([{alias:'v35Skeleton',src:base+delivery.runtimeDir+'/'+delivery.skeletonJson},{alias:'v35Atlas',src:base+delivery.runtimeDir+'/'+delivery.atlas},{alias:'v35Reference',src:'/preview/v35-character-baseline-20261101/baseline-v4.png'}]);
  const texture=PIXI.Assets.get('v35Reference'),actor=new BattleCharacter({id:'QA:SPINE',name:'붉은 코트 검사',team:kind==='enemy'?'ENEMY':'ALLY',texture,fullBodyTexture:texture,cutInTexture:texture,fullBodyHeight:1536*285/1215,hp:100,scale:.5});
  Object.assign(actor,{cardId:'QA-V35-SPINE',actorKind:'MERCENARY',isMercenary:true,battleActive:true,enabled:true,serverMaxHp:100000,serverMaxShield:0,art:{bodyHeight:285,footAnchor:{x:.5,y:.9375}},role:'WARRIOR'});
  const effects=new BakedBattleEffects(engine,await BakedBattleEffects.load());effects.setEnabled(document.querySelector('#effects').checked);api.effects=effects;
  const rig=window.spine.Spine.from({skeleton:'v35Skeleton',atlas:'v35Atlas',autoUpdate:false,ticker:engine.app.ticker}),adapter=new SpineBattleAdapter(engine,actor,rig,{effects});
  actor.setAnimationAdapter(adapter);engine.combatLayer.addChild(actor.root);engine.characters.push(actor);engine.mercenaries.push(actor);engine.setFormationMercenaries(engine.mercenaries);actor.formationHudY=-403;actor.hud.y=-403;engine.sortCombatDepth();connectSpineAttacks(engine);api.spine=adapter;
 }
 if(whitecoat){
  const base='/preview/v35-whitecoat-swordsman-20261102/',delivery=await(await fetch(base+'qa/native.json')).json();
  await PIXI.Assets.load([{alias:'whitecoatSkeleton',src:base+delivery.runtimeDir+'/'+delivery.skeletonJson},{alias:'whitecoatAtlas',src:base+delivery.runtimeDir+'/'+delivery.atlas},{alias:'whitecoatReference',src:base+'images/guard.png'}]);
  const texture=PIXI.Assets.get('whitecoatReference'),actor=new BattleCharacter({id:'QA:WHITECOAT',name:'흰 코트 검사',team:kind==='whitecoat-enemy'?'ENEMY':'ALLY',texture,fullBodyTexture:texture,cutInTexture:texture,fullBodyHeight:310,hp:100,scale:.5});
  Object.assign(actor,{cardId:'QA-V35-WHITECOAT',actorKind:'MERCENARY',isMercenary:true,battleActive:true,enabled:true,serverMaxHp:100000,serverMaxShield:0,art:{bodyHeight:300,footAnchor:{x:740/1431,y:1082/1099}},role:'WARRIOR'});
  const effects=new WhitecoatEffects(engine,await WhitecoatEffects.load());effects.setEnabled(document.querySelector('#effects').checked);api.effects=effects;
  const rig=window.spine.Spine.from({skeleton:'whitecoatSkeleton',atlas:'whitecoatAtlas',autoUpdate:false,ticker:engine.app.ticker}),adapter=new WhitecoatBattleAdapter(engine,actor,rig,{effects});
  actor.setAnimationAdapter(adapter);engine.combatLayer.addChild(actor.root);engine.characters.push(actor);engine.mercenaries.push(actor);engine.setFormationMercenaries(engine.mercenaries);actor.formationHudY=-403;actor.hud.y=-403;engine.sortCombatDepth();connectSpineAttacks(engine);api.spine=adapter;
 }
 const stateMaps=['limitedStates','jokroStates','cardguStates'];
 const audit=()=>({kind,canvasCount:modal.querySelectorAll('canvas').length,pixi:PIXI.VERSION,engineType:engine.constructor.name,spine:api.spine?{autoUpdate:api.spine.rig.autoUpdate,busy:api.spine.busy,time:api.spine.clock.time}:null,actors:engine.mercenaries.map(a=>({id:a.id,code:a.cardId,name:a.name,team:a.team,base:{x:a.baseX,y:a.baseY,scale:a.restScale},root:{x:a.root.x,y:a.root.y,scale:a.root.scale.x},facing:a.view.scale.x,bodyHeight:a.art.bodyHeight,footAnchor:a.art.footAnchor,hp:a.hp,adapter:a.animationAdapter.constructor.name})),states:Object.fromEntries(stateMaps.map(k=>[k,engine[k]?.size||0])),errors:[...api.errors],timelines:engine.simpleTimelines.size,impacts:[...api.impacts],last:engine.lastMercenaryPlayback});
 const attack=async(index=0,action='attack_basic')=>{const a=engine.mercenaries[index];const target=(a.team==='ALLY'?engine.enemies:engine.allies).find(x=>engine.isAlive(x));const started=performance.now();const ok=await engine.normalAttack(0,{attacker:a,target,action,damage:1000,targetHp:90,onImpact:t=>api.impacts.push({actor:a.id,target:t.id,at:performance.now()})});api.normalPlayback.push({actor:a.id,ok,elapsedMs:performance.now()-started,last:engine.lastMercenaryPlayback});return audit();};
 let paused=false;const pausedEntries=new Set();function pause(value){paused=value;for(const entry of engine.simpleTimelines){if(value&&!entry.instance.paused()){pausedEntries.add(entry);entry.instance.pause();}else if(!value&&pausedEntries.has(entry)){entry.instance.resume();pausedEntries.delete(entry);}}}
 document.querySelector('#attack').onclick=()=>attack(0);document.querySelector('#second').onclick=()=>attack(1);document.querySelector('#cancel').onclick=()=>{engine.cancelTimelines();for(const a of engine.mercenaries)a.setState('IDLE');};document.querySelector('#pause').onclick=e=>{pause(!paused);e.target.textContent=paused?'재개':'일시정지';};
 document.querySelector('#attack').textContent=whitecoat?'발테르 비교 공격':'첫 용병 공격';document.querySelector('#second').textContent=whitecoat?'흰 코트 기본 공격':'둘째 용병 공격';document.querySelector('#skill').hidden=!whitecoat;document.querySelector('#skill').onclick=()=>attack(engine.mercenaries.indexOf(api.spine.actor),'skill_iai');
 const rate=engine.actionPlaybackSpeed.bind(engine);engine.actionPlaybackSpeed=(options)=>rate(options)*Number(document.querySelector('#speed').value);
 document.querySelector('#case').onchange=e=>{location.search='?case='+e.target.value;};
 document.querySelector('#effects').onchange=e=>api.effects?.setEnabled(e.target.checked);
 Object.assign(api,{ready:true,engine,renderer,attack,audit,pause,case:kind});
 document.querySelector('#status').textContent='현재 V3 전장·편성·HUD·서버 이벤트 경로 재사용 / 로컬 검수 / 운영 반영 전';
 window.addEventListener('pagehide',()=>core.destroy(),{once:true});
}catch(error){api.errors.push(error.stack);document.querySelector('#status').textContent=error.stack;console.error(error);}});
