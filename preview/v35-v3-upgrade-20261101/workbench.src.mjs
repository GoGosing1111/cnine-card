import * as PIXI from 'pixi.js';
import * as core from '@v3/core';
import {BattleCharacter} from '@v3/character';
import {SpineBattleAdapter,connectSpineAttacks} from './SpineBattleAdapter.mjs';
import {BakedBattleEffects} from '../v35-effects-production-20261102/BakedBattleEffects.mjs';
import {WhitecoatBattleAdapter} from '../v35-whitecoat-swordsman-20261102/WhitecoatBattleAdapter.mjs';
import {WhitecoatEffects} from '../v35-whitecoat-swordsman-20261102/WhitecoatEffects.mjs';
import {techniques} from '../v35-whitecoat-swordsman-20261102/swordplay-v5/skills.mjs';
window.PIXI=PIXI;
const api=window.v35Review={ready:false,errors:[],impacts:[],normalPlayback:[]};
window.addEventListener('error',e=>api.errors.push(e.message));window.addEventListener('unhandledrejection',e=>api.errors.push(String(e.reason)));
document.addEventListener('DOMContentLoaded',async()=>{try{
 const kind=new URLSearchParams(location.search).get('case')||'whitecoat-squad',whitecoat=kind.startsWith('whitecoat');document.querySelector('#case').value=kind;
 const payload=await(await fetch('/fixture.json?case='+(whitecoat?'mixed':kind))).json(),modal=document.querySelector('#modal');
 if(kind.startsWith('whitecoat-squad')){
  // Use the usual V3 roster/deploy path for three individually identified opponents.
  const {A,B}=payload.battleV2.teams;
  A.mercenaries=[];
  B.cards=A.cards.slice(0,3).map((card,index)=>({...card,
   id:'B:'+index+':'+card.cardId,side:'B',slot:index,row:index<2?'FRONT':'BACK',
   maxHp:10000,hp:10000,shield:130+40*index,maxShield:240
  }));
  delete payload.monster;
 }
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
  const base='/preview/v35-whitecoat-swordsman-20261102/',delivery=await(await fetch(base+'skills-v4/qa/native.json')).json();
  await PIXI.Assets.load([{alias:'whitecoatSkeleton',src:base+delivery.runtimeDir+'/'+delivery.skeletonJson},{alias:'whitecoatAtlas',src:base+delivery.runtimeDir+'/'+delivery.atlas},{alias:'whitecoatReference',src:base+'images/guard.png'}]);
  const texture=PIXI.Assets.get('whitecoatReference'),actor=new BattleCharacter({id:'QA:WHITECOAT',name:'하쿠야 신',team:kind.endsWith('-enemy')?'ENEMY':'ALLY',texture,fullBodyTexture:texture,cutInTexture:texture,fullBodyHeight:310,hp:100,scale:.5});
  Object.assign(actor,{cardId:'QA-V35-WHITECOAT',actorKind:'MERCENARY',isMercenary:true,battleActive:true,enabled:true,serverMaxHp:100000,serverMaxShield:0,art:{bodyHeight:300,footAnchor:{x:740/1431,y:1082/1099}},role:'WARRIOR'});
  const effects=new WhitecoatEffects(engine,await WhitecoatEffects.load());effects.setEnabled(document.querySelector('#effects').checked);api.effects=effects;
  const rig=window.spine.Spine.from({skeleton:'whitecoatSkeleton',atlas:'whitecoatAtlas',autoUpdate:false,ticker:engine.app.ticker}),adapter=new WhitecoatBattleAdapter(engine,actor,rig,{effects});
  actor.setAnimationAdapter(adapter);engine.combatLayer.addChild(actor.root);engine.characters.push(actor);engine.mercenaries.push(actor);engine.setFormationMercenaries(engine.mercenaries);actor.formationHudY=-403;actor.hud.y=-403;engine.sortCombatDepth();connectSpineAttacks(engine);api.spine=adapter;
 }
 const stateMaps=['limitedStates','jokroStates','cardguStates'];
 const audit=()=>({kind,canvasCount:modal.querySelectorAll('canvas').length,pixi:PIXI.VERSION,engineType:engine.constructor.name,spine:api.spine?{autoUpdate:api.spine.rig.autoUpdate,busy:api.spine.busy,time:api.spine.clock.time}:null,actors:engine.mercenaries.map(a=>({id:a.id,code:a.cardId,name:a.name,team:a.team,base:{x:a.baseX,y:a.baseY,scale:a.restScale},root:{x:a.root.x,y:a.root.y,scale:a.root.scale.x},facing:a.view.scale.x,bodyHeight:a.art.bodyHeight,footAnchor:a.art.footAnchor,hp:a.hp,adapter:a.animationAdapter.constructor.name})),states:Object.fromEntries(stateMaps.map(k=>[k,engine[k]?.size||0])),errors:[...api.errors],timelines:engine.simpleTimelines.size,impacts:[...api.impacts],last:engine.lastMercenaryPlayback});
 const attack=async(index=0,action='attack_basic')=>{
  const actor=engine.mercenaries[index];
  if(!actor || actor.animationAdapter?.busy)return audit();
  const opponents=(actor.team==='ALLY'?engine.enemies:engine.allies).filter(t=>engine.isAlive(t));
  const target=kind.startsWith('whitecoat-squad') && actor===api.spine?.actor
   ? opponents.reduce((near,t)=>!near || Math.abs(t.root.x-actor.root.x)<Math.abs(near.root.x-actor.root.x)?t:near,null)
   : opponents[0];
  if(!target)return audit();
  const skill=techniques[action], started=performance.now();
  // These are review event fixtures. The playback path consumes these rows and
  // never derives area victims or damage from the size of an effect.
  const hits=skill ? (skill.area?opponents:[target]).map((victim,i)=>{
   const maximum=victim.serverMaxHp || 100;
   const before=Math.round(maximum*victim.hp/100);
   const after=Math.max(1,before-Math.ceil(maximum*(.06+i*.015)));
   return {targetId:victim.id,damage:Math.max(0,before-after),targetMaxHp:maximum,
    targetHpAfter:after,targetShieldAfter:Math.max(0,(victim.shield||0)-35-i*13),targetMaxShield:victim.serverMaxShield};
  }) : undefined;
  const ok=await engine.normalAttack(0,{attacker:actor,target,action,hits,damage:1000,targetHp:90,
   onImpact:t=>api.impacts.push({actor:actor.id,target:t.id,at:performance.now()})});
  api.normalPlayback.push({actor:actor.id,ok,elapsedMs:performance.now()-started,last:engine.lastMercenaryPlayback});
  return audit();
 };
 let paused=false;const pausedEntries=new Set();function pause(value){paused=value;for(const entry of engine.simpleTimelines){if(value&&!entry.instance.paused()){pausedEntries.add(entry);entry.instance.pause();}else if(!value&&pausedEntries.has(entry)){entry.instance.resume();pausedEntries.delete(entry);}}}
 document.querySelector('#attack').onclick=()=>attack(0);document.querySelector('#second').onclick=()=>attack(1);document.querySelector('#cancel').onclick=()=>{engine.cancelTimelines();for(const a of engine.mercenaries)a.setState('IDLE');};document.querySelector('#pause').onclick=e=>{pause(!paused);e.target.textContent=paused?'재개':'일시정지';};
 document.querySelector('#combo').hidden=!whitecoat;document.querySelector('#combo').onclick=()=>attack(engine.mercenaries.indexOf(api.spine.actor),'skill_tempest');
 for(const [id,mode]of [['rift','skill_rift'],['echo','skill_echo'],['verdict','skill_verdict']]){document.querySelector('#'+id).hidden=!whitecoat;document.querySelector('#'+id).onclick=()=>attack(engine.mercenaries.indexOf(api.spine.actor),mode);}
 document.querySelector('#attack').textContent=whitecoat?'발테르 비교 공격':'첫 용병 공격';document.querySelector('#second').textContent=whitecoat?'하쿠야 신 기본 공격':'둘째 용병 공격';document.querySelector('#skill').hidden=!whitecoat;document.querySelector('#skill').onclick=()=>attack(engine.mercenaries.indexOf(api.spine.actor),'skill_iai');
 const rate=engine.actionPlaybackSpeed.bind(engine);engine.actionPlaybackSpeed=(options)=>rate(options)*Number(document.querySelector('#speed').value);
 document.querySelector('#case').onchange=e=>{location.search='?case='+e.target.value;};
 const techniqueBar=document.querySelector('#swordplay');
 if(kind.startsWith('whitecoat-squad')){
  document.querySelector('#attack').hidden=true;
  document.querySelector('#second').onclick=()=>attack(engine.mercenaries.indexOf(api.spine.actor));
 }
 techniqueBar.hidden=!whitecoat;
 for(const button of techniqueBar.querySelectorAll('[data-sword]')){
  const id=button.dataset.sword;
  button.textContent=techniques[id].name;
  button.onclick=()=>attack(engine.mercenaries.indexOf(api.spine.actor),id);
 }
 document.querySelector('#effects').onchange=e=>api.effects?.setEnabled(e.target.checked);
 Object.assign(api,{ready:true,engine,renderer,attack,audit,pause,case:kind});
 document.querySelector('#status').textContent=whitecoat?'하쿠야 신 공격 모션 2배 · 로컬 전장':'기존 V3 전장 비교';
 window.addEventListener('pagehide',()=>core.destroy(),{once:true});
}catch(error){api.errors.push(error.stack);document.querySelector('#status').textContent=error.stack;console.error(error);}});
