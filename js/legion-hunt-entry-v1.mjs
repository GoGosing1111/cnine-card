import {jointAccountRequest} from './joint-account-transport.mjs';

const art='/preview/sustained-hunt-v2/assets/';
const escape=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const imagePath=value=>{
  const path=String(value||'').replace(/^\//,'');
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
      if(state.phase!=='lobby'||!state.data?.loadout||state.error)return;
      update({phase:'battle'});enter(state.difficulty);
    },
    close(){++revision;state={...state,phase:'closed'};dispose();}
  };
}

let active=null;
export function openLegionHunt(button){
  if(active)return;
  const dialog=document.createElement('dialog');dialog.className='legion-hunt-portal';dialog.setAttribute('aria-label','군단토벌 입장');
  dialog.innerHTML=`<header class="legion-portal-bar"><span>군단토벌 <small>OWNER</small></span><button type="button" data-hunt-close>PVE로 돌아가기 <span aria-hidden="true">↗</span></button></header>
    <div class="legion-lobby">
      <section class="legion-intro">
        <div class="legion-intro-copy"><p class="legion-kicker">군단토벌 / 제 1 전장</p><h1>잊혀진 섬</h1><p class="legion-intro-text">밀려오는 군단을 돌파하고,<br>섬의 수호자를 쓰러뜨리세요.</p>
        <div class="legion-facts"><span><b>37</b> 마리의 적</span><span><b>3</b> 보스</span><span><b>4</b> 난이도</span></div></div>
        <img class="legion-poster" src="${art}posters/legion-hunt-forgotten-island-v3.png" alt="군단토벌 · 잊혀진 섬 공식 포스터">
      </section>
      <div class="legion-preparation">
        <section class="legion-squad"><div class="legion-section-heading"><div><span>01 / 출전 편성</span><h2>나의 PVE 덱</h2></div><button type="button" data-hunt-refresh>편성 새로고침</button></div>
          <p class="legion-account"></p><div class="legion-cards" aria-label="저장된 일반 카드 5장"></div><div class="legion-mercenary" aria-label="용병 전용 슬롯"></div><p class="legion-equipment"></p>
        </section>
        <section class="legion-select"><div class="legion-section-heading"><div><span>02 / 전장 선택</span><h2>난이도</h2></div><span class="legion-limit"></span></div><div class="legion-difficulties" role="group" aria-label="사냥 난이도"></div>
          <p class="legion-risk">전멸하거나 제한 시간을 넘기면 토벌에 실패합니다.</p>
          <div class="legion-drop-guide"><b>전리품은 직접 획득</b><p>드랍 아이템은 필드의 무작위 위치에 나타납니다.<br>사라지기 전에 아이템을 직접 눌러 획득하세요.</p></div>
        </section>
      </div>
      <footer class="legion-entry-footer"><div><p class="legion-entry-status" role="status" aria-live="polite">저장된 편성을 불러오는 중입니다.</p><small>OWNER 공개 · 실계정 보상 지급 OFF</small></div><button type="button" class="legion-enter" data-hunt-enter disabled>편성 불러오는 중</button></footer>
    </div><div class="legion-play" hidden></div>`;
  const find=s=>dialog.querySelector(s);
  let frame=null,session=null;
  const clearFrame=()=>{
    if(session){void jointAccountRequest('legion-hunt/cancel',{method:'POST',body:{id:session}}).catch(()=>{});session=null;}
    if(frame){frame.src='about:blank';frame.remove();frame=null;}
    find('.legion-play').hidden=true;find('.legion-lobby').hidden=false;
  };
  const render=state=>{
    if(state.phase==='battle')return;
    const data=state.data,loadout=data?.loadout,loading=state.phase==='loading';
    find('[data-hunt-enter]').disabled=loading||!loadout||!!state.error;
    find('[data-hunt-enter]').textContent=loading?'편성 불러오는 중':'토벌 입장';
    find('[data-hunt-refresh]').disabled=loading;
    find('.legion-entry-status').textContent=state.error||(loading?'저장된 편성을 불러오는 중입니다.':'선택한 난이도와 현재 편성으로 출전합니다.');
    find('.legion-entry-status').classList.toggle('error',!!state.error);
    find('.legion-account').textContent=loadout?loadout.accountNickname+' · 편성 전투력 '+power(Object.values(loadout.power).reduce((a,b)=>a+Number(b||0),0)):'';
    find('.legion-cards').innerHTML=(loadout?.cards||[]).map((card,i)=>`<figure data-card-id="${escape(card.id)}"><img src="${escape(imagePath(card.originalCardArt||card.sourceArt||card.image_url||card.image))}" alt="${escape(card.title||card.name)}"><figcaption><small>${escape(card.rarity||card.grade)} · ${i+1}</small><strong>${escape(card.title||card.name)}</strong></figcaption></figure>`).join('');
    const merc=loadout?.mercenary;
    find('.legion-mercenary').innerHTML=merc?`<img src="${escape(imagePath(merc.sourceArt))}" alt="${escape(merc.name)}"><div><small>용병 전용 슬롯 · ${escape(merc.rank)}</small><strong>${escape(merc.name)}</strong><span>${escape((merc.skills||[]).map(s=>s.name).join(' · ')||merc.role||'편성된 용병')}</span></div><b>출전</b>`:'<div><small>용병 전용 슬롯</small><strong>편성된 용병 없음</strong><span>용병을 편성하면 일반 카드 5장과 함께 출전합니다.</span></div>';
    const eq=loadout?.characterBonus;
    find('.legion-equipment').textContent=loadout?'장착 슈트 · '+(eq?.equippedBattleSuit?.name||eq?.equippedBattleSuit?.code||'없음')+' / 무기 · '+(eq?.equippedWeapon?.name||eq?.equippedWeapon?.code||'없음'):'';
    find('.legion-difficulties').innerHTML=(data?.difficulties||[]).map((d,i)=>`<button type="button" data-hunt-difficulty="${escape(d.id)}" aria-pressed="${d.id===state.difficulty}"><span>0${i+1}</span><strong>${escape(d.name)}</strong><small>${escape(d.description)}</small></button>`).join('');
    const selected=data?.difficulties.find(d=>d.id===state.difficulty);
    find('.legion-limit').textContent=selected?'제한 '+Math.round(selected.limitMs/1000)+'초':'';
  };
  const controller=createHuntEntry({render,enter:()=>{
    find('.legion-lobby').hidden=true;find('.legion-play').hidden=false;
    frame=document.createElement('iframe');frame.title='군단토벌 전투';frame.src='/pve/legion-hunt/?v=20260926-entry';frame.allow='autoplay; fullscreen';find('.legion-play').append(frame);
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
    else if(target.dataset.huntDifficulty){const id=target.dataset.huntDifficulty;controller.select(id);dialog.querySelector('[data-hunt-difficulty="'+id+'"]')?.focus();}
  });
  dialog.addEventListener('cancel',event=>{event.preventDefault();controller.close();});
  window.addEventListener('message',onMessage);active=controller;document.body.append(dialog);dialog.showModal();void controller.refresh();
}
document.addEventListener('click',event=>{
  const button=event.target.closest('[data-legion-hunt-entry]');if(!button)return;event.preventDefault();openLegionHunt(button);
});
