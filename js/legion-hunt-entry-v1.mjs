import {jointAccountRequest} from './joint-account-transport.mjs';

const art='/preview/sustained-hunt-v2/assets/';
const escape=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const imagePath=value=>{
  const path=String(value||'').trim().replace(/^\//,'');
  if(/^https:\/\//i.test(path)){try{return new URL(path).href;}catch{return '';}}
  if(!/^(assets|preview)\//.test(path)||path.includes('..'))return '';
  return '/'+path;
};
const power=value=>Math.round(Number(value)||0).toLocaleString('ko-KR');
export function createHuntEntry({request=jointAccountRequest,render,enter,dispose}){
  let state={phase:'loading',difficulty:'normal',data:null,error:''},revision=0;
  const update=next=>{state={...state,...next};render(state);};
  return {
    get state(){return state;},
    async refresh(){
      const token=++revision;update({phase:'loading',data:null,error:''});
      try{const data=await request('legion-hunt/bootstrap');if(token===revision)update({phase:'lobby',data,error:data.loadoutError||''});}
      catch(error){if(token===revision)update({phase:'lobby',error:error.message});}
    },
    select(id){if(state.phase==='lobby'&&state.data?.difficulties.some(d=>d.id===id))update({difficulty:id});},
    enter(){
      if(state.phase!=='lobby'||!state.data?.loadout||state.error||state.data.entries?.remaining===0)return;
      update({phase:'battle'});enter(state.difficulty);
    },
    close(){++revision;state={...state,phase:'closed'};dispose();}
  };
}

let active=null;
export function openLegionHunt(button){
  if(active)return;
  const dialog=document.createElement('dialog');dialog.className='legion-hunt-portal';dialog.setAttribute('aria-label','군단토벌 입장');
  dialog.innerHTML=`<header class="legion-portal-bar"><div class="legion-brand"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 8V3h5m8 0h5v5M3 16v5h5m8 0h5v-5M8 6v12l8-6Z"/></svg><span>숲켓몬<small>SOOPKETMON</small></span></div><nav class="legion-breadcrumb" aria-label="현재 위치"><span>모험</span><i aria-hidden="true">/</i><b>군단토벌</b></nav><button type="button" data-hunt-close><span aria-hidden="true">←</span> PVE로 돌아가기</button></header>
    <div class="legion-lobby"><div class="legion-lobby-layout">
      <section class="legion-intro" aria-labelledby="legion-island-title">
        <div class="legion-hero-halo" aria-hidden="true"></div><img class="legion-guardian" src="${art}monsters/ancient-forge-warden-boss-sd-v2.png" alt="섬의 최종 보스 태고의 수호자">
        <div class="legion-intro-copy"><p class="legion-kicker"><span></span> LEGION HUNT · CHAPTER 01</p><h1 id="legion-island-title">잊혀진 섬</h1><p class="legion-intro-text">길은 끊겼다.<br>돌아갈 방법은, 끝까지 돌파하는 것.</p>
        <div class="legion-facts"><span><b>15분</b> 연속 토벌</span><span><b>1</b> 최종 보스</span><span><b>2회</b> 하루 입장</span></div></div>
        <div class="legion-guardian-caption"><span>FINAL TARGET</span><strong>태고의 수호자</strong></div>
      </section>
      <nav class="legion-route" aria-label="토벌 진행 경로">
        <div><img src="${art}monsters/ember-mantis-sd-v2.png" alt=""><span><small>00:00 · 상륙</small><b>군단 조우</b></span></div>
        <div><img src="${art}monsters/mossback-tortoise-sd-v2.png" alt=""><span><small>05:00 · 교전</small><b>끊임없는 증원</b></span></div>
        <div><img src="${art}monsters/cobalt-bat-sd-v2.png" alt=""><span><small>10:00 · 돌파</small><b>끝까지 생존</b></span></div>
        <div><img src="${art}monsters/ancient-forge-warden-boss-sd-v2.png" alt=""><span><small>15:00 · 최종 보스</small><b>태고의 수호자</b></span></div>
      </nav>
      <section class="legion-squad"><div class="legion-section-heading"><div><span>YOUR EXPEDITION</span><h2>출전 원정대</h2></div><button type="button" data-hunt-refresh>편성 새로고침 <span aria-hidden="true">↻</span></button></div>
        <p class="legion-account"></p><div class="legion-loadout"><div class="legion-cards" aria-label="저장된 일반 카드 5장"></div><div class="legion-mercenary" aria-label="용병 전용 슬롯"></div></div><p class="legion-equipment"></p>
      </section>
      <aside class="legion-select"><div class="legion-section-heading"><div><span>SELECT DIFFICULTY</span><h2>난이도 선택</h2></div></div>
        <div class="legion-difficulties" role="group" aria-label="사냥 난이도"></div>
        <div class="legion-conditions"><span>토벌 진행 <strong class="legion-limit"></strong></span><span>오늘 입장 <b class="legion-entries"></b></span></div>
        <div class="legion-drop-guide"><div class="legion-pickup-symbol" aria-hidden="true"><i></i><svg viewBox="0 0 32 40"><path d="M6 2v28l7-7 7 12 5-3-7-12h11z"/></svg></div><div><b>전리품은 직접 눌러 획득</b><p>필드에 나타난 아이템을<br>사라지기 전에 챙기세요.</p></div></div>
        <button class="legion-poster-link" data-hunt-poster type="button"><img src="${art}posters/legion-hunt-forgotten-island-v3.png" alt="군단토벌 공식 포스터"><span><small>군단토벌 · 잊혀진 섬</small><b>콘텐츠 소개 보기</b></span><span aria-hidden="true">↗</span></button>
        <footer class="legion-entry-footer"><p class="legion-entry-status" role="status" aria-live="polite">저장된 편성을 불러오는 중입니다.</p><button type="button" class="legion-enter" data-hunt-enter disabled>편성 불러오는 중</button><small>OWNER 공개 · 실계정 보상 지급 OFF</small></footer>
      </aside>
    </div></div><div class="legion-play" hidden></div><dialog class="legion-poster-view" aria-label="군단토벌 콘텐츠 소개"><button type="button" data-hunt-poster-close aria-label="소개 닫기">닫기 ×</button><img src="${art}posters/legion-hunt-forgotten-island-v3.png" alt="군단토벌 · 잊혀진 섬 콘텐츠 소개 포스터"></dialog>`;
  const find=s=>dialog.querySelector(s);
  let frame=null,session=null;
  const clearFrame=()=>{
    if(session){void jointAccountRequest('legion-hunt/cancel',{method:'POST',body:{id:session}}).catch(()=>{});session=null;}
    if(frame){frame.src='about:blank';frame.remove();frame=null;}
    find('.legion-play').hidden=true;find('.legion-lobby').hidden=false;dialog.dataset.phase='lobby';
  };
  const render=state=>{
    dialog.dataset.phase=state.phase;
    if(state.phase==='battle')return;
    const data=state.data,loadout=data?.loadout,loading=state.phase==='loading';
    const exhausted=data?.entries?.remaining===0;
    find('[data-hunt-enter]').disabled=loading||!loadout||!!state.error||exhausted;
    find('[data-hunt-enter]').textContent=loading?'편성 불러오는 중':exhausted?'오늘 입장 횟수 소진':'토벌 입장';
    find('[data-hunt-refresh]').disabled=loading;
    find('.legion-entry-status').textContent=state.error||(loading?'저장된 편성을 불러오는 중입니다.':exhausted?'한국시간 자정에 입장 횟수가 초기화됩니다.':'전투 시작 시 1회 사용 · 매일 한국시간 자정 초기화');
    find('.legion-entry-status').classList.toggle('error',!!state.error);
    find('.legion-account').textContent=loadout?loadout.accountNickname+' · 편성 전투력 '+power(Object.values(loadout.power).reduce((a,b)=>a+Number(b||0),0)):'';
    find('.legion-cards').innerHTML=(loadout?.cards||[]).map((card,i)=>`<figure data-card-id="${escape(card.id)}" data-grade="${escape(card.rarity||card.grade)}"><span class="legion-card-slot">0${i+1}</span><img src="${escape(imagePath(card.originalCardArt||card.sourceArt||card.image_url||card.image))}" alt="${escape(card.title||card.name)}"><figcaption><small>${escape(card.rarity||card.grade)}</small><strong>${escape(card.title||card.name)}</strong></figcaption></figure>`).join('');
    const merc=loadout?.mercenary;
    find('.legion-mercenary').innerHTML=merc?`<img src="${escape(imagePath(merc.sourceArt))}" alt="${escape(merc.name)}"><b class="legion-merc-rank">${escape(merc.rank)}</b><div><small>용병 전용 슬롯</small><strong>${escape(merc.name)}</strong><span>${escape((merc.skills||[]).map(s=>s.name).join(' · ')||merc.role||'편성된 용병')}</span></div>`:'<div><small>용병 전용 슬롯</small><strong>용병 미편성</strong><span>편성한 용병 1명이<br>원정대에 합류합니다.</span></div>';
    const eq=loadout?.characterBonus;
    if(loading)find('.legion-mercenary').innerHTML='<div><small>용병 전용 슬롯</small><strong>편성 불러오는 중</strong></div>';
    find('.legion-equipment').textContent=loadout?'장착 슈트 · '+(eq?.equippedBattleSuit?.name||eq?.equippedBattleSuit?.code||'없음')+' / 무기 · '+(eq?.equippedWeapon?.name||eq?.equippedWeapon?.code||'없음'):'';
    find('.legion-difficulties').innerHTML=(data?.difficulties||[]).map((d,i)=>`<button type="button" data-hunt-difficulty="${escape(d.id)}" aria-pressed="${d.id===state.difficulty}"><span class="legion-difficulty-number">0${i+1}</span><span class="legion-difficulty-copy"><strong>${escape(d.name)}</strong><small>${escape(d.description)}</small></span><span class="legion-threat-bars" aria-hidden="true">${[0,1,2,3].map(n=>`<i class="${n<=i?'lit':''}"></i>`).join('')}</span><span class="legion-selection-dot" aria-hidden="true"></span></button>`).join('');
    const selected=data?.difficulties.find(d=>d.id===state.difficulty);
    find('.legion-limit').textContent=selected?'15분 + 최종 보스':'';
    find('.legion-entries').textContent=data?.entries?data.entries.remaining+' / '+data.entries.limit+'회 남음':'';
    dialog.dataset.difficulty=state.difficulty;
  };
  const controller=createHuntEntry({render,enter:()=>{
    find('.legion-lobby').hidden=true;find('.legion-play').hidden=false;
    frame=document.createElement('iframe');frame.title='군단토벌 전투';frame.src='/pve/legion-hunt/?v=20260927-lobby-ui';frame.allow='autoplay; fullscreen';find('.legion-play').append(frame);
  },dispose:()=>{clearFrame();window.removeEventListener('message',onMessage);dialog.close();dialog.remove();active=null;button?.focus();}});
  const onMessage=event=>{
    if(event.origin!==location.origin||event.source!==frame?.contentWindow)return;
    if(event.data?.type==='legion-hunt-ready')frame.contentWindow.postMessage({type:'legion-hunt-enter',difficulty:controller.state.difficulty},location.origin);
    if(event.data?.type==='legion-hunt-session')session=event.data.id;
    if(event.data?.type==='legion-hunt-return'){clearFrame();void controller.refresh();}
  };
  dialog.addEventListener('click',event=>{
    const target=event.target.closest('button');if(!target)return;
    if(target.hasAttribute('data-hunt-close'))controller.close();
    else if(target.hasAttribute('data-hunt-refresh'))void controller.refresh();
    else if(target.hasAttribute('data-hunt-enter'))controller.enter();
    else if(target.hasAttribute('data-hunt-poster'))find('.legion-poster-view').showModal();
    else if(target.hasAttribute('data-hunt-poster-close'))find('.legion-poster-view').close();
    else if(target.dataset.huntDifficulty){const id=target.dataset.huntDifficulty;controller.select(id);dialog.querySelector('[data-hunt-difficulty="'+id+'"]')?.focus();}
  });
  dialog.addEventListener('cancel',event=>{event.preventDefault();if(event.target===find('.legion-poster-view'))find('.legion-poster-view').close();else controller.close();});
  window.addEventListener('message',onMessage);active=controller;document.body.append(dialog);dialog.showModal();void controller.refresh();
}
document.addEventListener('click',event=>{
  const button=event.target.closest('[data-legion-hunt-entry]');if(!button)return;event.preventDefault();openLegionHunt(button);
});
