import {jointAccountRequest as request} from './joint-account-transport.mjs';
import {createPveContinuousSession} from './pve-continuous-session-v1.mjs';

const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const number=n=>Math.max(0,Number(n)||0).toLocaleString('ko-KR');
const coin=n=>Number(n)>=100000000?`${number(Number(n)/100000000)}억`:Number(n)>=10000?`${number(Number(n)/10000)}만`:number(n);
let host,state,session,opening=false,active=false,renderer,modal,runId='',epoch=0,paused=false,releasePause,entryError='';
let deck=[],deckReady=false;
const busy=()=>opening||session&&session.getState().phase!=='IDLE';
const catalog=()=>globalThis.cnineCardCatalog?.()||[];
const signedIn=()=>globalThis.loadUser?.()||{};
const emitCount=()=>window.dispatchEvent(new CustomEvent('cow-portal:availability',{detail:{available:Number(state?.portals?.available||0)}}));
function ensureStyle(){
  if(document.querySelector('[data-cow-live-style]'))return;
  const link=document.createElement('link');link.rel='stylesheet';link.href='/css/cow-room-live.css?v=2093';link.dataset.cowLiveStyle='';document.head.append(link);
}
function entryBlock(){
  if(!state)return '입장 정보 확인 중';
  if(state.policy.mode!=='ON')return '현재 입장할 수 없습니다';
  if(state.budget.remaining<1)return '오늘 입장 완료';
  if(state.portals.available<1)return '발견한 포탈이 없습니다';
  if(!deckReady||deck.length!==5)return 'PVE 덱 5장을 편성하세요';
  if(Number(signedIn().coin||0)<state.policy.entryCoin)return '입장 코인이 부족합니다';
  return '';
}
function render(){
  if(!host?.isConnected||!state)return;
  const p=state.policy,b=state.budget,count=Number(state.portals.available||0),blocked=entryBlock();
  const cards=deck.map(id=>catalog().find(c=>String(c.id)===String(id))).filter(Boolean);
  host.innerHTML=`<section class="cow-live-gate" aria-labelledby="cowLiveTitle">
    <div class="cow-live-landscape" aria-hidden="true"></div>
    <header class="cow-live-location"><span><i></i> 숨겨진 전장</span><b>붉은 목초지</b></header>
    <div class="cow-live-story"><p class="cow-live-eyebrow">THE UNKNOWN PASTURE</p><h1 id="cowLiveTitle">미지의<br><strong>젖소방</strong></h1><p class="cow-live-prologue">붉은 달 아래, 포탈이 열렸다.<br>도끼병의 군단을 뚫고 카우 킹을 처치하세요.</p>
      <div class="cow-live-prize"><span>카우 킹 클리어 보상</span><strong>${coin(p.clearCoin?.[0]||0)}<small>코인</small></strong></div>
    </div>
    <aside class="cow-live-entry" aria-label="카우방 입장">
      <div class="cow-live-portal-count"><span class="cow-live-seal" aria-hidden="true">◌</span><div><span>보관 중인 포탈</span><strong>${number(count)}<small>개</small></strong></div><b>${count?'입장 가능':'탐색 필요'}</b></div>
      <dl><div><dt>이번 입장 비용</dt><dd>${coin(p.entryCoin)} 코인 <small>+ 포탈 1개</small></dd></div><div><dt>오늘 남은 입장</dt><dd>${number(b.remaining)} <small>/ ${number(p.dailyRuns)}회</small></dd></div></dl>
      <div class="cow-live-budget"><div><span>오늘 획득한 클리어 코인</span><b>${coin(b.coin)} <small>/ ${coin(p.dailyCoinCap)}</small></b></div><progress max="${p.dailyCoinCap||1}" value="${b.coin}" aria-label="오늘 획득한 클리어 코인"></progress></div>
      <button type="button" class="cow-live-enter" data-cow-start ${busy()||blocked?'disabled':''}>${busy()?'전투 기록 확인 중':blocked||'포탈 입장'}<span aria-hidden="true">↗</span></button>
      <p class="cow-live-entry-note">${count?'입장하면 포탈 1개를 사용합니다.':'일반 PVE 2% · 아포칼립스 3% 확률로 발견'}</p>
      <button type="button" class="cow-live-hunt" data-cow-hunt>PVE 토벌로 이동 <span aria-hidden="true">→</span></button>
      <p class="cow-live-error" role="status">${esc(entryError)}</p><button type="button" class="cow-live-recover" data-cow-recover ${session?.getState().phase==='RECOVERABLE'?'':'hidden'}>전투 결과 다시 확인</button>
    </aside>
    <ol class="cow-live-route" aria-label="전투 순서"><li><span>01</span><div><b>젖소 도끼병</b><small>목초지 돌파</small></div></li><li><span>02</span><div><b>왕의 도끼병</b><small>정예 군단</small></div></li><li><span>03</span><div><b>카우 킹</b><small>최종 결전</small></div></li></ol>
  </section>
  <section class="cow-live-deck" aria-label="저장된 PVE 편성"><header><div><span>출전 편성</span><h2>나의 PVE 덱</h2></div><button type="button" data-cow-deck>편성 변경 →</button></header><div class="cow-live-card-list">${cards.length?cards.map(c=>`<div class="cow-live-card-cell">${globalThis.cardHtml?.(c,true,'pve-deck-card-display')||`<img src="${esc(c.image)}" alt="${esc(c.title)}">`}</div>`).join(''):'<p>저장된 PVE 덱을 확인한 뒤 입장할 수 있습니다.</p>'}</div><p>저장한 일반 카드 5장과 장착 중인 배틀슈트로 출전합니다.</p></section>`;
  host.querySelector('[data-cow-start]').onclick=()=>void start();
  host.querySelector('[data-cow-recover]').onclick=()=>{entryError='';runId='';void session?.resume();};
  host.querySelector('[data-cow-hunt]').onclick=()=>{hide();globalThis.switchPveMode?.('hunt');};
  host.querySelector('[data-cow-deck]').onclick=()=>{hide();globalThis.switchPveMode?.('deck');};
}
async function refresh(){state=await request('cow-room/v3/state');emitCount();render();}
async function refreshWallet(){
  try{const data=await globalThis.apiRequest?.('me/summary',{}, {ttl:0});if(data?.user){globalThis.saveUser?.(globalThis.mergeApiUserSummary(data.user));globalThis.updateCoinDisplays?.();}}
  catch{ /* Next native shell refresh retries the authoritative wallet. */ }
}
function change(next){
  entryError=next.error?.message||'';render();
  if(active&&next.phase==='READY'&&next.result)void present(next.result);
}
function resumePlayback(){paused=false;releasePause?.();releasePause=null;const button=modal?.querySelector('[data-cow-pause]');if(button)button.textContent='일시정지';}
function closeBattle(){
  ++epoch;resumePlayback();renderer?.destroy();renderer=null;
  globalThis.ProjectVPixiBattle?.cancelActiveAnimations?.();
  modal?.remove();modal=null;document.body.classList.remove('cow-live-battle-open');
}
function resultMarkup(result,issue=''){
  return `<section class="cow-live-result ${result.success?'is-clear':''}" aria-labelledby="cowResultTitle"><p>${result.replayed?'복구한 전투 결과':'붉은 목초지 · 전투 종료'}</p><h2 id="cowResultTitle">${result.success?'카우 킹 토벌 완료':'원정 종료'}</h2><div class="cow-live-result-rewards">${(result.rewards||[]).map(r=>`<div><span>${esc(r.rewardName||r.rewardRef)}</span><strong>+${r.rewardType==='COIN'||r.rewardRef==='COIN'?coin(r.quantity):number(r.quantity)}</strong></div>`).join('')||'<span>이번 전투에서 획득한 보상이 없습니다.</span>'}</div><p>${esc(issue||'보상이 계정에 반영되었습니다.')}</p><button type="button" data-cow-confirm>카우방으로 돌아가기</button></section>`;
}
async function present(result){
  if(runId===result.requestId||!active)return;closeBattle();runId=result.requestId;const token=epoch;
  modal=document.createElement('div');modal.id='cowRoomBattle';modal.setAttribute('role','dialog');modal.setAttribute('aria-modal','true');modal.setAttribute('aria-label','카우방 전투');document.body.append(modal);document.body.classList.add('cow-live-battle-open');
  modal.className='modal show cow-live-loading';modal.innerHTML='<div><span>붉은 목초지</span><h2>포탈을 통과하는 중</h2><p>출전 편성을 불러오고 있습니다.</p></div>';
  const showResult=issue=>{
    if(token!==epoch||!modal)return;
    resumePlayback();const message=modal.querySelector('#battleMessage')||modal;
    message.innerHTML=resultMarkup(result,issue);renderer?.showResult();
    modal.querySelector('[data-cow-controls]')?.remove();
    const confirm=modal.querySelector('[data-cow-confirm]');confirm.onclick=async()=>{if(session.acknowledge()){confirm.disabled=true;await refreshWallet();closeBattle();runId='';globalThis.renderShell?.('battle');await open();}};confirm.focus();
    void refresh();void refreshWallet();
  };
  try{
    await globalThis.ensureFeatureResources('battleV2');if(token!==epoch)return;
    const view=globalThis.ProjectVBattleV3Live.prepareLoading({modal,mode:'PVE',playerName:result.playerName,opponentName:'카우 군단',autoText:'붉은 목초지로 이동하고 있습니다.'});
    modal.classList.add('cow-live-battle');view.stage.querySelector('.battle-v3-header small').textContent='붉은 목초지';view.stage.querySelector('.battle-v3-header strong').textContent='카우방';
    const field=view.stage.querySelector('.battle-v3-canvas-host');field.style.backgroundImage="url('/assets/ui/project-v/battlefields/v3-cow-pasture-v1.png')";
    view.stage.insertAdjacentHTML('beforeend','<div class="cow-live-battle-controls" data-cow-controls><button type="button" data-cow-pause>일시정지</button><button type="button" data-cow-result>결과 보기</button></div>');
    modal.querySelector('[data-cow-pause]').onclick=()=>{if(paused)resumePlayback();else{paused=true;modal.querySelector('[data-cow-pause]').textContent='재개';}};
    let defeated=0;const total=result.continuousEncounter?.total||22;
    renderer=await globalThis.ProjectVBattleV3Live.createRenderer({...view,modal,data:result,mode:'PVE',continuousPlayback:true,
      isPlaybackPaused:()=>paused,
      beforeCombatEvent:async()=>{if(paused){await globalThis.ProjectVPixiBattle.stopAccountBattleUnitSustainedFire({drain:true});await new Promise(resolve=>{releasePause=resolve;if(!paused)resolve();});if(token===epoch)globalThis.ProjectVPixiBattle.startAccountBattleUnitSustainedFire();}},
      onCombatEvent:event=>{if(event.type==='KO'&&String(event.targetId).startsWith('B:'))defeated++;if(token===epoch)view.phase.textContent=`토벌 ${defeated} / ${total}`;}});
    if(token!==epoch){renderer.destroy();return;}
    field.style.backgroundImage='none';
    modal.__battleV2Renderer=renderer;globalThis.ensureBattleSoundButton?.(view.stage);
    let skipped=false;modal.querySelector('[data-cow-result]').onclick=()=>{skipped=true;resumePlayback();renderer.destroy();globalThis.ProjectVPixiBattle.cancelActiveAnimations();showResult();};
    const complete=await renderer.play();if(token!==epoch||skipped)return;
    showResult(complete?'':'전투 기록의 확정 결과를 불러왔습니다.');
  }catch(error){showResult('전투 화면을 불러오지 못해 저장된 결과를 표시합니다.');console.warn('Cow Room presentation',error);}
}
async function start(){
  if(busy()||entryBlock())return;entryError='';void session.start('PASTURE');
}
export function hide(){active=false;if(host)host.hidden=true;session?.setVisible(false);if(modal){closeBattle();runId='';}}
export async function open({enter=false}={}){
  if(opening)return true;opening=true;active=true;ensureStyle();
  // Leave the completed PVE modal before entering the native Cow Room flow.
  for(const old of document.querySelectorAll('.battle-modal.show')){old.__battleV2Renderer?.destroy?.();old.classList.remove('show');old.onclick=null;}
  if(!document.getElementById('pveV2LiveViewport'))globalThis.renderShell?.('battle');
  const viewport=document.getElementById('pveV2LiveViewport');
  if(!viewport){opening=false;location.assign('/?screen=battle&pve=cow-room'+(enter?'&enter=1':''));return true;}
  for(const view of viewport.children)view.hidden=true;
  host=document.getElementById('pveCowRoomView');if(!host){host=document.createElement('div');host.id='pveCowRoomView';viewport.append(host);}host.hidden=false;
  document.getElementById('pveCommandV2')?.setAttribute('data-screen','cow-room');
  document.querySelectorAll('.pve-mode-btn').forEach(button=>{const on=button.hasAttribute('data-v3-cow-entry');button.classList.toggle('active',on);button.setAttribute('aria-selected',String(on));});
  document.querySelector('[data-v3-cow-entry]')?.scrollIntoView({block:'nearest',inline:'center'});
  host.innerHTML='<div class="cow-live-connect" role="status">카우방 입장 정보를 확인하고 있습니다.</div>';
  try{
    const [next,configuration]=await Promise.all([request('cow-room/v3/state'),request('battle/config')]);state=next;deck=Array.isArray(configuration.deck)?configuration.deck:[];deckReady=true;emitCount();
    if(!active)return true;
    if(!session||session.storageKey!==`cnine.pve-continuous.v1:COW_ROOM:${state.accountId}`){session?.dispose();session=createPveContinuousSession({accountId:state.accountId,transport:{run:body=>request('cow-room/v3/run',{method:'POST',body}),status:()=>request('cow-room/v3/status')},storage:localStorage,onChange:change,content:'COW_ROOM',validateSelection:value=>value==='PASTURE'});}
    session.setVisible(true);await session.resume();
    if(session.getState().phase==='READY')void present(session.getState().result);
    opening=false;render();if(enter)await start();
  }catch(error){entryError=error.message;host.innerHTML=`<div class="cow-live-connect"><h2>카우방</h2><p role="alert">${esc(error.message)}</p><button type="button" data-cow-retry>다시 연결</button></div>`;host.querySelector('[data-cow-retry]').onclick=()=>void open();}
  finally{opening=false;}
  return true;
}
document.addEventListener('visibilitychange',()=>{session?.setVisible(active&&!document.hidden);if(document.hidden&&modal){paused=true;const button=modal.querySelector('[data-cow-pause]');if(button)button.textContent='재개';}});
addEventListener('cnine:route-will-change',event=>{if(event.detail?.to!=='battle')hide();});
addEventListener('pagehide',()=>{closeBattle();session?.dispose();},{once:true});
globalThis.CowRoomLive={open,hide};
