import {AREA_CUTIN_PROFILES as PROFILES} from '../../shared/mercenary-area-cutins-v1.mjs';
const $=id=>document.getElementById(id),api=window.ProjectVPixiBattle;
let data,engine,profile=PROFILES[0],busy=false,paused=false,runToken=0;
const stateNames={'V-976':'zeroStates','V-975':'primeStates','V-974':'generalJokStates','V-970':'cardguStates','V-971':'revanStates'};
const status=text=>$('status').textContent=text;
function controls(){for(const id of ['play','reset','skill'])$(id).disabled=!engine||busy;$('pause').disabled=!busy;$('stop').disabled=!engine;for(const b of $('characters').children)b.disabled=busy;}
function currentSkill(){return profile.skills[Number($('skill').value)||0];}
function setSpeed(){for(const {instance}of engine?.simpleTimelines||[])instance.timeScale((instance.__reviewBaseRate||1)*Number($('speed').value));}
function wrapSpeed(e){const original=e.timeline;e.timeline=function(build,cleanup,scale,...rest){const base=Number(scale)>0?Number(scale):this.actionPlaybackSpeed();return original.call(this,tl=>{build(tl);tl.__reviewBaseRate=base;},cleanup,base*Number($('speed').value),...rest);};}
async function choose(code){
 busy=true;controls();profile=PROFILES.find(p=>p.code===code)||PROFILES[0];
 for(const b of $('characters').children)b.setAttribute('aria-pressed',String(b.dataset.code===code));
 $('skill').replaceChildren(...profile.skills.map((s,i)=>{const o=document.createElement('option');o.value=i;o.textContent=s.name;return o;}));
 status(profile.name+' 전투 리소스 준비 중…');
 if(engine){await api.releaseBattle();engine=null;}
 const payload=structuredClone(data.payloads[profile.code]);
 window.cnineCardCatalog=()=>payload.battleV2.teams.A.cards;
 engine=await api.mountForBattle(payload,$('battle'));await api.setBattlePayload(payload);await api.setVisible(true);await engine.deployCards({instant:true,force:true});
 engine.audio?.setEnabled?.(false);engine.reducedMotion=$('reduced').checked;wrapSpeed(engine);
 const deadline=performance.now()+25000;
 while(!engine[stateNames[profile.code]]?.size&&performance.now()<deadline)await new Promise(r=>setTimeout(r,50));
 if(!engine[stateNames[profile.code]]?.size)throw Error(profile.name+' 전투 리소스 준비 실패');
 engine.uiLayer?.statusPanel&&(engine.uiLayer.statusPanel.visible=false);
 busy=false;controls();status(profile.name+' · 첫 궁극기에 컷신 1회');window.sssReview.engine=engine;
}
function event(){
 const actor=engine.mercenaries.find(a=>a.cardId===profile.code&&a.team==='ALLY'),skill=currentSkill();
 return {type:profile.event,actorId:actor.id,battleMode:'PVE',skillId:profile.code==='V-971'?'MS-929':skill.id,visualMode:skill.visualMode,
  hits:engine.enemies.map(t=>({targetId:t.id,damage:10,absorbed:0,targetHpAfter:t.serverMaxHp*.8,targetMaxHp:t.serverMaxHp,targetShieldAfter:0,targetMaxShield:0}))};
}
async function play(){
 if(busy)return;busy=true;paused=false;controls();const token=++runToken;$('pause').textContent='일시정지';
 for(const t of engine.enemies)engine.syncTargetHp(t,100);
 status(profile.name+' · '+currentSkill().name+' 사용');
 try{const ok=await engine.playMercenaryEvent(event());if(token===runToken)status(ok===false?'재생 중단':profile.name+' · 재생 완료 · 다음 궁극기는 컷신 생략');return ok;}
 finally{if(token===runToken){busy=false;paused=false;controls();}}
}
async function stop(){++runToken;engine?.cancelTimelines();paused=false;busy=false;$('pause').textContent='일시정지';await engine?.setVisible(true);controls();status('중단 완료 · 이 전투의 컷신 1회 기록 유지');}
function pause(){paused=!paused;for(const {instance}of engine.simpleTimelines){if(paused){instance.__reviewPaused=!instance.paused();instance.pause();}else if(instance.__reviewPaused)instance.resume();}$('pause').textContent=paused?'계속 재생':'일시정지';}
$('play').onclick=()=>play().catch(e=>status(e.message));$('reset').onclick=()=>choose(profile.code).catch(e=>status(e.message));$('stop').onclick=stop;$('pause').onclick=pause;$('speed').onchange=setSpeed;
$('skill').onchange=()=>status(profile.name+' · '+currentSkill().name+' 선택');$('reduced').onchange=()=>{engine.reducedMotion=$('reduced').checked;};
for(const p of PROFILES){const b=document.createElement('button');b.textContent=p.name;b.dataset.code=p.code;b.setAttribute('aria-pressed','false');b.disabled=true;b.onclick=()=>choose(p.code).catch(e=>{busy=false;controls();status(e.message);});$('characters').append(b);}
window.sssReview={PROFILES,choose,play,stop,pause,event,get profile(){return profile;},get busy(){return busy;},setSkill(index){$('skill').value=index;},setSpeed(value){$('speed').value=value;setSpeed();}};
window.addEventListener('pagehide',()=>engine?.cancelTimelines());localStorage.setItem('cnine_battle_sound','OFF');
try{const r=await fetch('fixtures.json');if(!r.ok)throw Error('검수 편성 파일 누락');data=await r.json();await choose(profile.code);window.sssReview.ready=true;}
catch(error){console.error(error);busy=false;controls();status(error.message);window.sssReview.error=error.message;}
