import {raidViewModel,raidViewEvents,raidPercent,raidAmount,raidClock} from '../shared/world-raid-view-v2.mjs';

const esc=value=>String(value??'').replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
const asset=value=>/^\/(?!\/)[\w\-./%]+$/.test(String(value||''))?value:'';
const integer=value=>Math.floor(Number(value)||0).toLocaleString('ko-KR');
const phaseNames=['','돌입','방벽 공략','광폭화'];
const icon=(name)=>({party:'◈',damage:'↗',clock:'◷',boss:'◆',shield:'◇'}[name]||'·');
let root=null,data=null,model=null,clockTimer=null,lastReceived=0,serverAnchor=0,localAnchor=0,filter='all',expanded=new Set(),events=[],eventTimer=null;
const seen=new Set(),enteredV3=new Set();
function text(key,value){root?.querySelectorAll(`[data-wr="${key}"]`).forEach(node=>{const next=String(value);if(node.textContent!==next)node.textContent=next;});}
function bar(key,value){root?.querySelectorAll(`[data-wr-bar="${key}"]`).forEach(node=>node.style.setProperty('--value',`${value}%`));}
function num(key,value){root?.querySelectorAll(`[data-wr="${key}"]`).forEach(node=>{node.textContent=raidAmount(value);node.title=integer(value);});}
function profileName(row){return model?.settings.showNicknames===false?'공대원':String(row.nickname||'공대원');}
function cardsMarkup(cards){return(cards||[]).slice(0,5).map(card=>typeof raidCombatCard==='function'?raidCombatCard(card,'wr2-card'):'').join('');}
function renderRow(row){
  const hpVisible=model.settings.showParticipantHp!==false,damageVisible=model.settings.showPersonalDamage!==false;
  const title=typeof publicTitleBadgeHtml==='function'?publicTitleBadgeHtml(row.title):'';
  return `<article class="wr2-member${row.mine?' is-me':''}${row.isDefeated?' is-defeated':''}" data-wr-user="${row.userId}"><button class="wr2-member-toggle" type="button" aria-expanded="${expanded.has(row.userId)}" aria-controls="wr2-deck-${row.userId}"><span class="wr2-place">${model.settings.showLiveRanking===false?'·':String(row.rank).padStart(2,'0')}</span><span class="wr2-member-name"><b>${esc(profileName(row))}${row.mine?'<em>나</em>':''}</b><small>${row.isDefeated?'전투 불능':'전투 중'}${hpVisible?` · HP ${Math.ceil(row.hpPct)}%`:''}</small></span><span class="wr2-member-damage"><b>${damageVisible?raidAmount(row.shownDamage):'—'}</b><small>${damageVisible?`${row.share.toFixed(1)}% 기여`:'덱 보기'}</small></span><span class="wr2-chevron">⌄</span></button>${hpVisible?`<div class="wr2-member-hp" style="--value:${row.hpPct}%" role="meter" aria-label="${esc(profileName(row))} 체력" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${Math.ceil(row.hpPct)}"><i></i></div>`:''}<div class="wr2-member-detail" id="wr2-deck-${row.userId}" ${expanded.has(row.userId)?'':'hidden'}>${title}<div class="wr2-member-cards">${expanded.has(row.userId)?cardsMarkup(row.cards):''}</div><span>전투력 ${integer(row.totalPower)}${hpVisible?` · 체력 ${integer(row.currentHp)} / ${integer(row.maxHp)}`:''}</span></div></article>`;
}
function patchParty(){
  const list=root.querySelector('.wr2-members'),existing=new Map([...list.children].map(node=>[Number(node.dataset.wrUser),node])),focused=list.contains(document.activeElement)?document.activeElement:null;
  for(const row of model.rows){let node=existing.get(row.userId);if(!node){const template=document.createElement('template');template.innerHTML=renderRow(row);node=template.content.firstElementChild;}else{
    node.classList.toggle('is-defeated',!!row.isDefeated);node.classList.toggle('is-me',row.mine);
    node.querySelector('.wr2-place').textContent=model.settings.showLiveRanking===false?'·':String(row.rank).padStart(2,'0');
    node.querySelector('.wr2-member-name small').textContent=`${row.isDefeated?'전투 불능':'전투 중'}${model.settings.showParticipantHp!==false?` · HP ${Math.ceil(row.hpPct)}%`:''}`;
    node.querySelector('.wr2-member-damage b').textContent=model.settings.showPersonalDamage!==false?raidAmount(row.shownDamage):'—';
    node.querySelector('.wr2-member-damage small').textContent=model.settings.showPersonalDamage!==false?`${row.share.toFixed(1)}% 기여`:'덱 보기';
    const hp=node.querySelector('.wr2-member-hp');if(hp){hp.style.setProperty('--value',`${row.hpPct}%`);hp.setAttribute('aria-valuenow',Math.ceil(row.hpPct));}
    const detail=node.querySelector('.wr2-member-detail>span');if(detail)detail.textContent=`전투력 ${integer(row.totalPower)}${model.settings.showParticipantHp!==false?` · 체력 ${integer(row.currentHp)} / ${integer(row.maxHp)}`:''}`;
  }
  node.hidden=filter==='alive'&&row.isDefeated||filter==='me'&&!row.mine;
  // Move existing keyed rows; focused controls and expanded decks survive a poll.
  const at=model.rows.indexOf(row);if(list.children[at]!==node){if(list.moveBefore&&node.parentElement===list)list.moveBefore(node,list.children[at]||null);else list.insertBefore(node,list.children[at]||null);}existing.delete(row.userId);}
  for(const node of existing.values())node.remove();
  if(focused?.isConnected&&document.activeElement!==focused)focused.focus({preventScroll:true});
  root.querySelector('.wr2-party-empty').hidden=[...list.children].some(node=>!node.hidden);
}
function showEvent(event){
  events.unshift({...event,at:raidClock((Date.parse(data.serverNow)-Date.parse(data.current.startsAt))/1000)});events=events.slice(0,6);
  const log=root.querySelector('.wr2-event-list');log.innerHTML=events.map(e=>`<li class="is-${esc(e.kind)}"><time>${e.at}</time><b>${esc(e.title)}</b><span>${esc(e.detail)}</span></li>`).join('');
  if(event.kind==='attack')return;
  const banner=root.querySelector('.wr2-cue');banner.dataset.kind=event.kind;banner.querySelector('b').textContent=event.title;banner.querySelector('span').textContent=event.detail;
  banner.classList.remove('is-visible');void banner.offsetWidth;banner.classList.add('is-visible');clearTimeout(eventTimer);eventTimer=setTimeout(()=>banner.classList.remove('is-visible'),3000);

}
function updateClock(){
  if(!root?.isConnected||root.closest('[hidden]')){dispose();return;}
  if(document.hidden)return;
  const now=serverAnchor+performance.now()-localAnchor,live=raidViewModel(data,now),stale=performance.now()-lastReceived>22000;
  text('clock',raidClock(live.remaining));text('clockLabel',live.remaining>0?'남은 시간':'종료 확인 중');
  text('sync',stale?'전황 재연결 대기':'전황 연결됨');root.classList.toggle('is-stale',stale);
  text('attack-label',live.nextIsUltimate?'다음 공격 · 궁극기':'다음 보스 공격');
  text('attack-clock',stale||live.nextAttackMs===null?'동기화 중':live.due?'판정 확인 중':`${Math.ceil(live.nextAttackMs/1000)}초`);
  text('ultimate-clock',stale||live.nextUltimateMs===null?'동기화 중':live.nextUltimateMs===0?'판정 확인 중':`${Math.ceil(live.nextUltimateMs/1000)}초 후`);
  bar('cast',live.charge);root.classList.toggle('is-cast-near',!stale&&live.nextIsUltimate&&live.nextAttackMs<=6000);
}
function patch(next){
  if(!root?.isConnected||Number(next?.current?.id)!==Number(data?.current?.id)||next?.current?.status!=='BATTLE'||!next.me)return false;
  if(Date.parse(next.serverNow)<Date.parse(data.serverNow))return true;
  const changes=raidViewEvents(data,next);data=next;model=raidViewModel(data);lastReceived=performance.now();serverAnchor=Date.parse(data.serverNow)||Date.now();localAnchor=performance.now();
  root.dataset.phase=String(model.phase);root.classList.toggle('is-knocked-out',!!model.me?.isDefeated);
  text('phase',phaseNames[model.phase]);text('instruction',model.instruction);text('boss-percent',`${model.hpPct.toFixed(1)}%`);num('boss-hp',data.current.currentHp);num('boss-max',data.current.maxHp);bar('boss',model.hpPct);
  const meter=root.querySelector('.wr2-boss-health');meter.setAttribute('aria-valuenow',Math.ceil(model.hpPct));
  text('alive',model.alive);text('count',model.count);num('party-damage',model.totalDamage);num('my-damage',model.me?.shownDamage);text('my-share',`${raidPercent(model.me?.shownDamage,model.totalDamage).toFixed(1)}%`);text('my-rank',model.settings.showLiveRanking!==false&&model.myRank?`${model.myRank}위`:'—');
  text('my-hp',`${Math.ceil(model.myHpPct)}%`);bar('my-hp',model.myHpPct);text('my-state',model.me?.isDefeated?'전투 불능 · 파티 전황을 지켜보세요.':'출전 중 · 자동으로 공략에 참여합니다.');
  root.querySelectorAll('[data-wr-phase]').forEach(node=>{node.classList.toggle('is-active',Number(node.dataset.wrPhase)===model.phase);node.classList.toggle('is-complete',Number(node.dataset.wrPhase)<model.phase);});
  const shield=root.querySelector('.wr2-shield');shield.hidden=model.phase!==2;text('shield-label',data.current.shieldBroken?'방벽 파괴 · 공격 기회':'보스 방벽');num('shield-hp',data.current.shieldHp);bar('shield',model.shieldPct);shield.classList.toggle('is-broken',!!data.current.shieldBroken);
  for(const m of model.minions){const node=root.querySelector(`[data-wr-minion="${m.index}"]`);if(!node)continue;node.classList.toggle('is-waiting',!m.spawned);node.classList.toggle('is-defeated',!!m.defeated);node.querySelector('.wr2-minion-state').textContent=m.defeated?'처치 완료':m.spawned?'전투 중':`보스 HP ${Math.round(m.spawnAtHpPct*100)}%에 등장`;node.querySelector('.wr2-minion-hp').style.setProperty('--value',`${m.hpPct}%`);node.querySelector('.wr2-minion-value').textContent=m.spawned&&!m.defeated?`${raidAmount(m.currentHp)} / ${raidAmount(m.maxHp)}`:m.defeated?'방벽 해제':'대기 중';}
  patchParty();updateClock();changes.forEach(showEvent);return true;
}
function render(next){
  if(next?.current?.status!=='BATTLE'||!next.me)return false;
  if(patch(next))return true;
  dispose();data=next;model=raidViewModel(next);events=[];filter='all';expanded=new Set();
  const box=document.getElementById('pveRaidView');if(!box)return false;
  const c=next.current,accent=/^#[0-9a-f]{6}$/i.test(c.bossAccent||'')?c.bossAccent:'#a58bff';
  box.innerHTML=`<section class="wr2" data-phase="${model.phase}" style="--wr-accent:${accent}" aria-label="월드레이드 전투 현황">
    <header class="wr2-top"><div class="wr2-breadcrumb"><small>WORLD RAID</small><h2>월드레이드 <span>전투 현황</span></h2></div><div class="wr2-live"><i></i><span data-wr="sync">전황 연결됨</span></div><div class="wr2-countdown"><small data-wr="clockLabel">남은 시간</small><b data-wr="clock">${raidClock(model.remaining)}</b></div></header>
    <div class="wr2-mobile-tabs" role="group" aria-label="레이드 현황 화면"><button type="button" data-wr-pane="battle" aria-pressed="true">전투 전황</button><button type="button" data-wr-pane="party" aria-pressed="false">공대 현황 <b data-wr="alive">${model.alive}</b></button></div>
    <div class="wr2-layout"><main class="wr2-main"><section class="wr2-field" aria-label="보스 전황"><div class="wr2-field-vignette"></div>
      <nav class="wr2-phases" aria-label="공략 단계">${[1,2,3].map(p=>`<span data-wr-phase="${p}" class="${p===model.phase?'is-active':''}"><i>${String(p).padStart(2,'0')}</i>${phaseNames[p]}</span>`).join('')}</nav>
      <div class="wr2-boss-heading"><div><small>${esc(c.bossTitle||'월드레이드 보스')}</small><h1>${esc(c.bossName)}</h1></div><span class="wr2-phase-label" data-wr="phase">${phaseNames[model.phase]}</span></div>
      <div class="wr2-boss-health" role="meter" aria-label="보스 체력" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${Math.ceil(model.hpPct)}"><div><b data-wr="boss-percent">${model.hpPct.toFixed(1)}%</b><span><strong data-wr="boss-hp">${raidAmount(c.currentHp)}</strong> / <span data-wr="boss-max">${raidAmount(c.maxHp)}</span></span></div><div class="wr2-track" data-wr-bar="boss" style="--value:${model.hpPct}%"><i></i></div></div>
      <div class="wr2-shield" ${model.phase===2?'':'hidden'}><div><b data-wr="shield-label">보스 방벽</b><span data-wr="shield-hp">${raidAmount(c.shieldHp)}</span></div><div class="wr2-track" data-wr-bar="shield" style="--value:${model.shieldPct}%"><i></i></div></div>
      <div class="wr2-boss-stage"><div class="wr2-boss-halo"></div><img class="wr2-boss-art" src="${esc(asset(c.bossBattleSprite||c.bossImage))}" alt="${esc(c.bossName)}" decoding="async"><div class="wr2-stage-caption"><span>${icon('boss')} TARGET</span><b>${esc(c.bossName)}</b><small>파티가 함께 공략 중</small></div><div class="wr2-fx" aria-hidden="true"></div><div class="wr2-cue" role="status" aria-live="polite"><small>RAID EVENT</small><b></b><span></span></div></div>
      <div class="wr2-cast"><div><span data-wr="attack-label">다음 보스 공격</span><b data-wr="attack-clock">동기화 중</b></div><div class="wr2-track" data-wr-bar="cast" style="--value:0%"><i></i></div><small>${esc(c.ultimate?.name||'고유 궁극기')} <strong data-wr="ultimate-clock"></strong></small></div>
      <div class="wr2-directive"><i>${icon('shield')}</i><p data-wr="instruction">${esc(model.instruction)}</p></div>
    </section>
    <section class="wr2-minions" aria-label="호위병 상태">${model.minions.map(m=>`<article class="wr2-minion${m.spawned?'':' is-waiting'}${m.defeated?' is-defeated':''}" data-wr-minion="${m.index}"><div class="wr2-minion-portrait"><img src="${esc(asset(m.sprite))}" alt="" loading="lazy"></div><div><small class="wr2-minion-state">${m.spawned?'전투 중':`보스 HP ${Math.round(m.spawnAtHpPct*100)}%에 등장`}</small><b>${esc(m.name)}</b><div class="wr2-track wr2-minion-hp" style="--value:${m.hpPct}%"><i></i></div><span class="wr2-minion-value">${raidAmount(m.currentHp)} / ${raidAmount(m.maxHp)}</span></div><span class="wr2-minion-index">0${m.index+1}</span></article>`).join('')}</section>
    <section class="wr2-deployment"><header><div><small>MY SQUAD</small><h3>내 출전 덱</h3></div><span><i data-wr="my-hp">${Math.ceil(model.myHpPct)}%</i><small>생존 체력</small></span></header><div class="wr2-track wr2-personal-hp" data-wr-bar="my-hp" style="--value:${model.myHpPct}%"><i></i></div><div class="wr2-deck">${cardsMarkup(model.me?.cards)}</div><footer><p data-wr="my-state">출전 중 · 자동으로 공략에 참여합니다.</p><button type="button" id="raidV3Start" class="wr2-primary">V3 전투화면 열기 <span>↗</span></button></footer></section>
    <details class="wr2-event-log" ${model.settings.showDamageLog===false?'hidden':''}><summary>전투 기록 <span>최근 6개</span></summary><ol class="wr2-event-list"></ol></details></main>
    <aside class="wr2-party"><header><div><small>RAID PARTY</small><h3>공대 현황</h3></div><span class="wr2-party-count"><b data-wr="alive">${model.alive}</b> / <span data-wr="count">${model.count}</span><small>생존</small></span></header><div class="wr2-party-total"><small>파티 누적 피해</small><strong data-wr="party-damage">${raidAmount(model.totalDamage)}</strong></div><section class="wr2-my-contribution" ${model.settings.showPersonalDamage===false?'hidden':''}><div><small>내 기여도</small><b data-wr="my-share">${raidPercent(model.me?.shownDamage,model.totalDamage).toFixed(1)}%</b></div><div><strong data-wr="my-damage">${raidAmount(model.me?.shownDamage)}</strong><span data-wr="my-rank">${model.myRank}위</span></div></section><div class="wr2-party-filters" role="group" aria-label="파티원 표시"><button type="button" data-wr-filter="all" aria-pressed="true">전체</button><button type="button" data-wr-filter="alive" aria-pressed="false">생존</button><button type="button" data-wr-filter="me" aria-pressed="false">내 정보</button></div><div class="wr2-party-columns"><span>파티원 · 체력</span><span>누적 피해 / 기여</span></div><div class="wr2-members">${model.rows.map(renderRow).join('')}</div><p class="wr2-party-empty" hidden>표시할 파티원이 없습니다.</p><footer>파티원을 누르면 출전 덱을 볼 수 있습니다.</footer></aside></div></section>`;
  root=box.querySelector('.wr2');root.dataset.pane='battle';root.addEventListener('click',onClick);clockTimer=setInterval(updateClock,250);patch(next);
  const key=String(c.id);if(!seen.has(key)){seen.add(key);if(seen.size>12)seen.delete(seen.values().next().value);showEvent(raidViewEvents(null,next)[0]);}
  if(!enteredV3.has(key)){enteredV3.add(key);if(enteredV3.size>12)enteredV3.delete(enteredV3.values().next().value);queueMicrotask(()=>{if(root?.isConnected&&!raidState.v3InFlight)void startRaidV3Battle();});}
  return true;
}
function onClick(event){
  const paneButton=event.target.closest('[data-wr-pane]');if(paneButton){root.dataset.pane=paneButton.dataset.wrPane;root.querySelectorAll('.wr2-mobile-tabs button').forEach(b=>b.setAttribute('aria-pressed',String(b===paneButton)));return;}
  const filterButton=event.target.closest('[data-wr-filter]');if(filterButton){filter=filterButton.dataset.wrFilter;root.querySelectorAll('[data-wr-filter]').forEach(b=>b.setAttribute('aria-pressed',String(b===filterButton)));patchParty();return;}
  const button=event.target.closest('.wr2-member-toggle');if(button){const id=Number(button.closest('[data-wr-user]').dataset.wrUser),open=!expanded.has(id);if(open)expanded.add(id);else expanded.delete(id);button.setAttribute('aria-expanded',String(open));const detail=button.closest('article').querySelector('.wr2-member-detail');if(open&&!detail.querySelector('.wr2-member-cards').children.length)detail.querySelector('.wr2-member-cards').innerHTML=cardsMarkup(model.rows.find(row=>row.userId===id)?.cards);detail.hidden=!open;}
}
function decorate(next){
  const box=document.getElementById('pveRaidView');if(!box)return;
  box.dataset.raidPresentation='v2';
  if(next?.current?.status==='LOBBY')box.querySelector('.raid-lobby-screen')?.classList.add('wr2-lobby');
  if(next?.current?.status==='ENDED'){const screen=box.querySelector('.raid-outcome-screen,.raid-result-screen');screen?.classList.add('wr2-outcome');const source=asset(next.current.bossBattleSprite||next.current.bossImage);if(screen&&source&&!screen.querySelector('.wr2-result-boss'))screen.insertAdjacentHTML('afterbegin',`<img class="wr2-result-boss" src="${esc(source)}" alt="">`);}
}
function dispose(){clearInterval(clockTimer);clearTimeout(eventTimer);clockTimer=null;eventTimer=null;root?.removeEventListener('click',onClick);root=null;data=null;model=null;globalThis.WeeklyRaidUltimateFxV1?.destroy?.();}
globalThis.WorldRaidCombatV2={render,patch,decorate,dispose,get active(){return!!root?.isConnected;},get diagnostics(){return{active:!!root?.isConnected,timer:clockTimer!==null,instanceId:data?.current?.id,events:events.map(e=>e.kind),rows:root?.querySelectorAll('.wr2-member').length||0};}};
// Existing lobby / reward controls keep their authoritative lifecycle and receipts.
const previousRender=renderRaidView;
renderRaidView=function(next){previousRender(next);decorate(next);};
document.addEventListener('visibilitychange',()=>{if(document.hidden)globalThis.WeeklyRaidUltimateFxV1?.destroy?.();else if(root)updateClock();});
