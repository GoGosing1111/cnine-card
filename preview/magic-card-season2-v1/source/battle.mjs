import '../../project-v-v3/source/project-v-pixi-battle.src.js';
import {cards,effectAt} from '../catalog.mjs';
const $=id=>document.getElementById(id);let engine,renderer,fixtures,token=0,eventsSeen=0;
const phaseNames={STATUS:'효과 상태',PIERCE_READY:'관통 발동',INTERCEPT:'치명 피해 대리',OVERHEAL:'초과 회복 → 보호막',FORMATION_SWAP:'전열·후열 교대',LEDGER_RECORD:'보호막 피해 기록',LEDGER_BREAK:'보호막 붕괴',FALLEN_STAR:'최종 사망 후 유언',MIRROR:'상대 마법 복제',ECLIPSE_HIT:'월식 추가 피해',SKILL_BLOCK:'스킬 봉쇄 · 평타 허용'};
function log(event){eventsSeen++;$('event-count').textContent=String(eventsSeen);const li=document.createElement('li');const title=document.createElement('b');title.textContent=phaseNames[event.phase]||event.phase;li.append(title);li.append(document.createTextNode(' · '+(event.remaining!==undefined?`남은 ${event.remaining}${event.statusKind==='ECLIPSE'?'타':'회'}`:event.damage?`HP 피해 ${Math.round(event.damage).toLocaleString()}`:event.amount?`${Math.round(event.amount).toLocaleString()}`:`${event.magicName}`)));$('events').prepend(li);}
async function start(){
 const epoch=++token;engine?.cancelTimelines();$('restart').disabled=true;$('stop').disabled=true;$('card').disabled=true;$('level').disabled=true;$('health').textContent='공용 V3 전장 준비 중';eventsSeen=0;$('event-count').textContent='0';$('events').replaceChildren();
 const card=cards.find(c=>c.code===$('card').value),level=Number($('level').value),payload=structuredClone(fixtures.find(p=>p.review.code===card.code&&p.review.level===level));
 $('card-name').textContent=card.name;$('selected-art').src=card.art;$('fixture-note').textContent=payload.review.note;
 $('card-effect').textContent=card.stats.map(s=>`${s.label} ${effectAt(card,level)[s.key]}${s.unit}`).join(' · ');
 window.cnineCardCatalog=()=>payload.battleV2.teams.A.cards.map(c=>({...c,id:c.cardId}));
 try{
  renderer?.destroy();
  const prepared=window.ProjectVBattleV3Live.prepareLoading({modal:$('lab-modal'),mode:'PVP',playerName:card.name,opponentName:'시즌2 검수 편성',autoText:'전장 준비 중'});renderer=await window.ProjectVBattleV3Live.createRenderer({...prepared,modal:$('lab-modal'),data:payload,mode:'PVP',playerName:card.name});engine=window.ProjectVPixiBattle.getEngine();if(!engine)throw Error('V3 전장이 초기화되지 않았습니다.');
  if(epoch!==token)return;await engine.setVisible(true);await engine.deployCards({instant:true,force:true});
  for(const side of ['A','B'])for(const c of payload.battleV2.teams[side].cards){const unit=engine.combatantById(c.id);if(unit)engine.syncTargetHp(unit,engine.eventHpPercent(unit,c.hp));}
  $('restart').disabled=false;$('stop').disabled=false;$('card').disabled=false;$('level').disabled=false;$('health').textContent='서버 확정 전투 재생 중 · 음소거';
  window.MagicS2Review={engine,payload,get eventsSeen(){return eventsSeen;},stop:()=>{$('stop').click();}};
  for(const event of payload.battleV2.result.timeline){if(epoch!==token)break;await engine.playEvents([event]);}
  if(epoch===token){await engine.syncFinalState(payload.battleV2.result.final);$('health').textContent='재생 완료 · 발동 기록 확인 가능';$('stop').disabled=true;}
 }catch(error){if(epoch!==token)return;$('health').textContent='검수판 오류: '+error.message;console.error(error);$('restart').disabled=false;}
}
async function boot(){
 fixtures=(await (await fetch('battle-fixtures.json?v=20261001-ready')).json()).payloads;
 for(const c of cards){const opt=document.createElement('option');opt.value=c.code;opt.textContent=c.name;$('card').append(opt);}
 $('card').value=new URLSearchParams(location.search).get('card')||'S2_COMMAND_SEVERANCE';
 if(!$('card').value)$('card').value=cards[0].code;
 $('restart').onclick=start;$('card').onchange=start;$('level').onchange=start;
 $('stop').onclick=()=>{token++;engine?.cancelTimelines();$('health').textContent='재생 정지 · 처음부터 다시 확인할 수 있습니다.';$('stop').disabled=true;};
 $('lab-modal').addEventListener('magic-season2-event',e=>log(e.detail));
 window.addEventListener('pagehide',()=>{token++;renderer?.destroy();window.ProjectVPixiBattle?.destroy();},{once:true});await start();
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',()=>void boot(),{once:true});else void boot();
