// Reuse the complete live renderer, art adapters and card dock. Only controls
// and static server-simulated fixtures belong to this isolated review page.
import {mountForBattle} from '../project-v-v3/source/project-v-pixi-battle.src.js';
import {ApocalypseSignatureSkillFX} from '../project-v-v3/source/battle/ApocalypseSignatureSkillFX.js';
const controls=window.parent===window?document:parent.document;
const $=id=>controls.getElementById(id)||document.getElementById(id);
let engine,renderer,fixtures,payload,heldFx,heldTimeline,busy=false,ready=false;
function health(value){$('health').textContent=value;}
function holdCleanup(){heldTimeline?.kill();heldFx?.release();heldTimeline=null;heldFx=null;}
async function select(key=$('boss').value){
  if(busy)return;busy=true;ready=false;holdCleanup();
  try{
    if(renderer){renderer.destroy();await window.ProjectVPixiBattle.setVisible(false);}
    payload=structuredClone(fixtures[key]);
    window.cnineCardCatalog=()=>payload.battleV2.teams.A.cards;
    const api=window.ProjectVPixiBattle,original=api.mountForBattle;
    api.mountForBattle=async(data,host)=>{engine=await mountForBattle(data,host);return engine;};
    try{
      const prepared=window.ProjectVBattleV3Live.prepareLoading({modal:$('lab-modal'),mode:payload.mode,playerName:'SD / 전용 스킬 검수',opponentName:payload.monster.name,autoText:'실제 V3 자산 준비 중'});
      renderer=await window.ProjectVBattleV3Live.createRenderer({...prepared,modal:$('lab-modal'),data:payload,mode:payload.mode,playUltimateCinematics:false});
    }finally{api.mountForBattle=original;}
    await engine.deployCards({instant:true,force:true});
    if(key!=='yhwach')await engine.ensureApocalypseBossUltimateReady();
    ready=true;health(`${payload.monster.name} · SD 연결 완료 / FUR 이예준 포함 실제 카드 5장`);
    $('play').disabled=key==='yhwach';$('impact').disabled=key==='yhwach';$('reset').disabled=false;
  }catch(error){health(error.message);console.error(error);throw error;}finally{busy=false;}
}
function skillEvent(){const event=payload.battleV2.result.timeline.find(e=>e.type==='BOSS_ULTIMATE');return {...event,actorId:payload.battleV2.teams.B.cards[0].id,label:payload.bossUltimate.name};}
async function play(){
  if(busy||!ready||$('boss').value==='yhwach')return false;
  await select();busy=true;
  try{
    const schedule=engine.audio?.scheduleApocalypseBossUltimate;
    if(!$('audio').checked&&engine.audio)engine.audio.scheduleApocalypseBossUltimate=()=>{};
    try{await engine.playEvents([skillEvent()]);}finally{if(engine.audio)engine.audio.scheduleApocalypseBossUltimate=schedule;}
    health(`${payload.monster.name} · 서버 피해 판정 재생 완료`);return true;
  }finally{busy=false;}
}
async function impact(){
  if(busy||!ready||$('boss').value==='yhwach')return;
  await select();
  const targets=engine.allies.filter(target=>target.battleActive!==false),boss=engine.enemies.find(target=>target.battleActive!==false);
  const x=targets.reduce((sum,target)=>sum+target.root.x,0)/targets.length,y=targets.reduce((sum,target)=>sum+target.root.y,0)/targets.length-30;
  const runtime=engine.apocalypseUltimateRuntime();
  heldFx=runtime.create({x,y,scale:engine.mobile?.76:1.02,origin:{x:boss.root.x,y:boss.root.y-130},reducedMotion:false,viewport:engine.scene}).attach(engine.effectLayer);
  // The engine owns GSAP; capture its exact timeline instance without inventing
  // a second renderer or animation implementation for the collision snapshot.
  void engine.timeline(tl=>{heldTimeline=tl;heldFx.play(tl);tl.pause();},()=>{},1);
  heldTimeline.time(runtime.profile.impactAt,false).pause();
  health(`${payload.monster.name} · 6번 충돌 프레임 / 실제 전장 좌표`);
}
function diagnostics(){return {ready,busy,scope:'STATIC_PREVIEW_ONLY',engine:engine?.diagnostics(),fx:ApocalypseSignatureSkillFX.diagnostics(),roster:[...document.querySelectorAll('[data-v3-roster-art]')].map(image=>image.getAttribute('src')),heldFrame:heldFx?.dragon?.currentFrame,heldPoint:heldFx?.display?{x:heldFx.display.x,y:heldFx.display.y}:null};}
async function boot(){
  const response=await fetch('./payloads.json');if(!response.ok)throw new Error('Missing local QA payload');fixtures=await response.json();
  $('boss').addEventListener('change',()=>void select());$('reset').addEventListener('click',()=>void select());$('play').addEventListener('click',()=>void play());$('impact').addEventListener('click',()=>void impact());
  window.BossResourceLab={select,play,impact,diagnostics,get engine(){return engine;},get heldTimeline(){return heldTimeline;}};window.parent.BossResourceLab=window.BossResourceLab;
  await select();
}
window.addEventListener('pagehide',()=>{holdCleanup();renderer?.destroy();window.ProjectVPixiBattle.destroy();},{once:true});
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',()=>void boot().catch(error=>health(error.message)),{once:true});else void boot().catch(error=>health(error.message));
