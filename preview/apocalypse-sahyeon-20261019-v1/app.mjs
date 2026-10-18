import {mountForBattle} from '../project-v-v3/source/project-v-pixi-battle.src.js';
import {SAHYEON,STORY} from './boss.mjs';
import {SahyeonFX} from './SahyeonFX.mjs';
import {showApocalypseStatus} from './playback.mjs';
const $=id=>document.getElementById(id);let engine,renderer,payload,busy=false,stamp=0;
const qa=window.SahyeonReview={ready:false,playing:false,records:[],liveWrites:0};
const status=text=>{$('health').textContent=text;};
function controls(disabled){for(const el of document.querySelectorAll('[data-skill],#full-battle'))el.disabled=disabled;$('stop').disabled=!disabled;}
function restore(until=null){
 for(const side of ['A','B'])for(const row of payload.battleV2.teams[side].cards){const unit=engine.combatantById(row.id);if(!unit)continue;
  unit.root.visible=true;unit.root.alpha=1;engine.syncTargetHp(unit,100);engine.syncTargetShield(unit,row.shield||0);showApocalypseStatus(engine,{targetId:row.id,statuses:{}});
 }
 if(until)for(const e of payload.battleV2.result.timeline){if(e===until)break;
  for(const h of [e,...(e.hits||[])]){const unit=engine.combatantById(h.targetId);if(!unit)continue;if(Number.isFinite(h.targetHpAfter))engine.syncTargetHp(unit,engine.eventHpPercent(unit,h.targetHpAfter));if(Number.isFinite(h.targetShieldAfter))engine.syncTargetShield(unit,h.targetShieldAfter);if(h.statuses)showApocalypseStatus(engine,{targetId:h.targetId,statuses:h.statuses});}
 }
}
async function mount(){
 if(engine)return;
 status('전투 리소스를 불러오고 있습니다.');
 payload=await fetch('./payload.json').then(r=>r.json());window.cnineCardCatalog=()=>payload.battleV2.teams.A.cards;
 const api=window.ProjectVPixiBattle,original=api.mountForBattle;api.mountForBattle=async(...args)=>(engine=await mountForBattle(...args));
 try{const prepared=window.ProjectVBattleV3Live.prepareLoading({modal:$('lab-modal'),mode:'APOCALYPSE',opponentName:'사현',playerName:'검수 분대'});renderer=await window.ProjectVBattleV3Live.createRenderer({...prepared,modal:$('lab-modal'),mode:'APOCALYPSE',data:payload,playUltimateCinematics:false});}finally{api.mountForBattle=original;}
 await engine.deployCards({instant:true,force:true});await SahyeonFX.preload();
 $('lab-modal').querySelector('.battle-v3-header small').textContent='APOCALYPSE';$('lab-modal').querySelector('.battle-v3-header strong').textContent='지워진 관측소';$('battlePhase').textContent='연출 검수';
 qa.engine=engine;qa.renderer=renderer;qa.payload=payload;qa.ready=true;status('기술을 선택해 발동 장면을 확인하세요.');
}
async function play(kind){
 if(busy)return;busy=true;controls(true);qa.playing=true;const current=++stamp;
 try{
  delete qa.error;await mount();if(current!==stamp)return;await engine.resetSession(payload);await engine.deployCards({instant:true,force:true});await engine.setVisible(true);if(current!==stamp)return;
  engine.reducedMotion=$('reduced').checked;qa.paused=false;$('pause').textContent='일시정지';
  const event=payload.battleV2.result.timeline.find(e=>e.type==='APOCALYPSE_SKILL'&&e.kind===kind);restore(event);engine.sahyeonPlaybackTime=0;
  status(kind==='full'?'보스와 여섯 잔영의 전투를 재생합니다.':SAHYEON.skills.find(s=>s.kind===kind).name+' · 발동 중');
  await window.ProjectVPixiBattle.playEvents(kind==='full'?payload.battleV2.result.timeline:[event]);
  if(current!==stamp)return;
  const record={...engine.lastSahyeonPlayback};qa.records.push(record);status(kind==='full'?'전투 완료 · '+(payload.battleV2.result.winner==='A'?'검수 분대 승리':'사현 승리'):`${record.targets}명 ${kind==='ultimate'?'타격 · 피해 '+record.damage.toLocaleString('ko-KR'):'상태 적용'} · 발동 완료`);
 }catch(e){qa.error=e.message;status('재생 오류: '+e.message);console.error(e);}finally{if(current===stamp){busy=false;qa.playing=false;controls(false);}}
}
function stop(){stamp++;void engine?.setVisible(false);engine?.cancelTimelines();engine?.activeSahyeonFX?.release();if(engine)engine.activeSahyeonFX=null;busy=false;qa.playing=false;controls(false);status('재생을 멈췄습니다. 기술을 다시 선택할 수 있습니다.');}
function boot(){
 $('premise').textContent=STORY.premise;$('story').innerHTML=STORY.paragraphs.map(p=>'<p>'+p+'</p>').join('');$('dialogue').innerHTML=STORY.dialogue.map(([who,line])=>'<p><b>'+who+'</b><span>'+line+'</span></p>').join('');
 for(const skill of SAHYEON.skills){const article=document.createElement('article');article.innerHTML='<small>'+({seal:'01 · 시선 봉인',curse:'02 · 회복 차단',ultimate:'03 · 거대 수호체'})[skill.kind]+'</small><h3>'+skill.name+'</h3><p>'+skill.description+'</p>';$('skills').append(article);}
 document.querySelectorAll('[data-skill]').forEach(button=>button.addEventListener('click',()=>play(button.dataset.skill)));
 $('full-battle').addEventListener('click',()=>play('full'));$('stop').addEventListener('click',stop);$('pause').addEventListener('click',()=>{const next=!qa.paused;qa.paused=next;for(const entry of engine?.simpleTimelines||[])entry.instance.paused(next);$('pause').textContent=next?'이어 재생':'일시정지';});
 $('reduced').addEventListener('change',()=>{if(engine)engine.reducedMotion=$('reduced').checked;});
 $('battle-link').addEventListener('click',()=>void mount().catch(e=>status(e.message)));window.addEventListener('pagehide',()=>{stop();renderer?.destroy();},{once:true});
 qa.play=play;qa.stop=stop;qa.mount=mount;
 if(location.hash==='#battle'||new URLSearchParams(location.search).has('qa'))void mount();
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});else boot();
