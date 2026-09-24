import {mountForBattle} from '../../project-v-v3/source/project-v-pixi-battle.src.js';
const $=id=>document.getElementById(id),root='/preview/mercenary-ice-crystal-dual-sword-v1/';
let engine,renderer,payloads,running=false;
const status=text=>$('qa-status').textContent=text;
async function reset(mode='PVP'){
 if(running)engine?.cancelTimelines();
 running=false;renderer?.destroy();window.ProjectVPixiBattle?.destroy();
 const battle=mode==='PVE'?payloads.pve:payloads.pvp;
 const payload={previewOnly:true,mode,battlefieldMode:mode,battleV2:battle};
 window.cnineCardCatalog=()=>payloads.cards;
 const api=window.ProjectVPixiBattle;api.mountForBattle=async(data,host)=>{engine=await mountForBattle(data,host);return engine;};
 const prepared=window.ProjectVBattleV3Live.prepareLoading({modal:$('lab-modal'),mode,playerName:'크라이베른 · SSS',opponentName:mode==='PVP'?'라그니엘 · SSS':'PVE 검수',autoText:'로컬 서버 판정 준비'});
 renderer=await window.ProjectVBattleV3Live.createRenderer({...prepared,modal:$('lab-modal'),data:payload,mode,playerName:'크라이베른 · SSS'});api.mountForBattle=mountForBattle;
 await engine.deployCards({instant:true,force:true});window.CryvernCombatQA||={};Object.assign(window.CryvernCombatQA,{engine,battle,payloads,reset,renderer});
 status(mode+' · 실제 전투 로직의 로컬 결과 · 라이브 미반영');
 return window.CryvernCombatQA;
}
async function run(onlySkill=false){
 if(running)return;running=true;
 try{
  const battle=window.CryvernCombatQA.battle,events=onlySkill?[battle.result.timeline.find(e=>e.type==='MERCENARY_CRYSTAL_CROWN')]:battle.result.timeline;
  status(onlySkill?'서버 확정 스킬 재생':'서버 확정 전체 전투 재생');
  await engine.playEvents(events.filter(Boolean));
  if(!onlySkill)engine.syncFinalState(battle.result.final);
  status('재생 완료 · 결과 '+battle.result.winner);
 }catch(e){status('검수 오류: '+e.message);console.error(e);}finally{running=false;}
}
async function boot(){
 try{
  const r=await fetch(root+'release/combat-payloads.json');if(!r.ok)throw Error('LOCAL_PAYLOAD_MISSING');
  payloads=await r.json();await reset();
  $('qa-play').onclick=()=>run();$('qa-skill').onclick=()=>run(true);
  $('qa-reset').onclick=()=>reset($('qa-mode').value).catch(e=>status(e.message));
  $('qa-mode').onchange=()=>reset($('qa-mode').value).catch(e=>status(e.message));
  $('qa-cancel').onclick=()=>{engine.cancelTimelines();running=false;status('중단 · 등록 타임라인 정리');};
  window.addEventListener('pagehide',()=>{engine?.cancelTimelines();renderer?.destroy();window.ProjectVPixiBattle?.destroy();},{once:true});
 }catch(e){status('준비 실패: '+e.message);console.error(e);}
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});else void boot();
