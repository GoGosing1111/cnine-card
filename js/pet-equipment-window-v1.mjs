import {jointAccountRequest,jointAdminRequest} from './joint-account-transport.mjs';

const esc=value=>String(value??'').replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
const imagePath=value=>typeof value==='string'&&/^\/?assets\/[A-Za-z0-9_./-]+\.(png|webp)$/i.test(value)&&!value.includes('..')?'/'+value.replace(/^\//,''):'';
const icons={paw:'<ellipse cx="6" cy="7" rx="2" ry="2.7"/><ellipse cx="11" cy="4.8" rx="2" ry="2.7"/><ellipse cx="16" cy="5.8" rx="2" ry="2.7"/><ellipse cx="20" cy="10" rx="1.8" ry="2.5"/><path d="M6 15c2-1 3-5 6-5s4 3 6 5c3 4 0 7-3 6l-4-1-3 1c-4 1-6-3-2-6Z"/>',arrow:'<path d="M4 12h16m-6-6 6 6-6 6"/>',refresh:'<path d="M20 8a8 8 0 1 0 .5 7M20 3v5h-5"/>',check:'<path d="m5 12 4 4L19 6"/>',close:'<path d="m6 6 12 12M18 6 6 18"/>',remove:'<path d="M5 12h14"/><circle cx="12" cy="12" r="9"/>',buff:'<path d="m13 2-9 12h7l-1 8 10-13h-7Z"/>',shield:'<path d="m12 3 8 3v6c0 4-5 8-8 9-3-1-8-5-8-9V6Z"/><path d="m8 12 3 3 5-6"/>'};
export const petUiIcon=name=>`<svg class="pe-icon" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">${icons[name]||icons.paw}</svg>`;
let activeDialog=null;

export function mountPetEquipment(root,{review=false,request=review?jointAdminRequest:jointAccountRequest}={}){
  let state=null,selected=null,busy=false,pending=null,needsRefresh=false,disposed=false,controller=null;
  const endpoint=review?'admin/pets/equipment/':'pets/v1/';
  root.classList.add('pet-equipment');
  root.innerHTML=`<header class="pe-heading"><div class="pe-heading-title"><span class="pe-heading-icon">${petUiIcon('paw')}</span><div><span class="pe-eyebrow">지원 편성</span><h1>펫 장착</h1><p>함께할 동료를 선택하고 시작 버프를 확인하세요.</p></div></div><div class="pe-capacity"><span>펫 지원 슬롯</span><b><i data-pet-equipped-count>0</i><em>/ 1</em></b></div></header>
    <p class="pe-notice" data-pet-notice hidden></p>
    <div class="pe-workspace"><section class="pe-collection"><div class="pe-collection-head"><h2 data-pet-collection-title>보유 펫</h2><span data-pet-count></span></div><div class="pe-grid" data-pet-grid aria-label="펫 선택"></div><p class="pe-collection-note">펫은 별도 지원 슬롯에<br>한 마리만 장착할 수 있습니다.</p></section>
    <section class="pe-stage" aria-label="선택한 펫 일러스트"><div class="pe-stage-environment" aria-hidden="true"></div><div class="pe-stage-top"><span>선택한 동료</span><span class="pe-stage-state" data-pet-stage-state>선택 대기</span></div><div class="pe-stage-floor" aria-hidden="true"></div><div data-pet-art></div><div class="pe-stage-caption" data-pet-caption></div></section>
    <aside class="pe-inspector"><section class="pe-equipped" aria-label="현재 장착한 펫"><div class="pe-equipped-head"><h2>장착 슬롯</h2><span>01</span></div><div data-pet-equipped></div><button type="button" class="pe-button pe-button-quiet" data-pet-unequip disabled>${petUiIcon('remove')}<span>장착 해제</span></button></section><section class="pe-detail" data-pet-detail aria-label="펫 상세"></section></aside></div>
    <footer class="pe-footer"><div class="pe-save-state">${petUiIcon('shield')}<p data-pet-status role="status" aria-live="polite">펫 정보를 불러오고 있습니다.</p></div><div class="pe-footer-actions"><button type="button" class="pe-button pe-button-secondary" data-pet-refresh>${petUiIcon('refresh')}<span>새로고침</span></button><button type="button" class="pe-button pe-primary" data-pet-equip disabled><span>펫을 선택하세요</span>${petUiIcon('arrow')}</button></div></footer>`;
  const $=selector=>root.querySelector(selector),pet=()=>state?.cards?.find(row=>row.code===selected),equipped=()=>state?.cards?.find(row=>row.code===state.loadout?.petCode);
  function status(message,error=false){$('[data-pet-status]').textContent=message;$('[data-pet-status]').classList.toggle('pe-error',error);}
  function sync(){
    const locked=busy||Boolean(pending)||needsRefresh,row=pet();
    root.setAttribute('aria-busy',String(busy));
    $('[data-pet-equip]').disabled=busy||needsRefresh||!state?.canEquip||(!pending&&(!row||!row.owned||row.code===state.loadout?.petCode));
    const isEquipped=Boolean(row&&row.code===state?.loadout?.petCode),label=pending?'장착 결과 재확인':isEquipped?'장착 중':row?`${row.name} 장착`:'펫을 선택하세요';
    $('[data-pet-equip]').innerHTML=`<span>${esc(label)}</span>${petUiIcon(busy?'refresh':isEquipped?'check':'arrow')}`;
    $('[data-pet-equip]').dataset.processing=String(busy);
    $('[data-pet-unequip]').disabled=locked||!state?.canEquip||!state.loadout?.petCode;
    $('[data-pet-refresh]').disabled=busy||Boolean(pending);
    root.querySelectorAll('[data-pet-select]').forEach(button=>button.disabled=locked||!state?.canEquip);
  }
  function render(){
    const row=pet(),current=equipped(),notice=$('[data-pet-notice]');notice.hidden=!state?.reviewOnly;notice.innerHTML='<b>OWNER 검수</b><span>검수용 펫의 선택만 저장합니다. 실제 보유·편성·전투에는 적용되지 않습니다.</span>';
    $('[data-pet-equipped-count]').textContent=current?'1':'0';
    $('[data-pet-stage-state]').textContent=row&&row.code===state?.loadout?.petCode?'장착 중':row?'미리보기':'선택 대기';
    const currentImage=imagePath(current?.sourceArt||current?.battleSprite);
    $('[data-pet-equipped]').innerHTML=`<span class="pe-equipped-portrait">${currentImage?`<img src="${esc(currentImage)}" alt="">`:petUiIcon('paw')}</span><div><small>${current?'함께하는 동료':'지원 슬롯 비어 있음'}</small><strong>${esc(current?.name||'빈 지원 슬롯')}</strong><span>${current?'전투 시작 지원':'아래 장착 버튼으로 편성하세요'}</span></div>`;
    const art=imagePath(row?.sourceArt||row?.battleSprite);
    $('[data-pet-art]').innerHTML=art?`<img class="pe-hero" src="${esc(art)}" alt="${esc(row.name)} 펫 일러스트"><span class="pe-art-error" hidden>일러스트를 불러오지 못했습니다.</span>`:`<div class="pe-stage-empty">${petUiIcon('paw')}<p>${state?.available?'함께할 펫을 선택하세요':'새로운 동료를 준비하고 있어요'}</p></div>`;
    $('[data-pet-caption]').innerHTML=row?`<span>${esc(row.animal||'동료')}</span><strong>${esc(row.name)}</strong><small>${row.reviewOwned?'검수용 보유':'보유한 펫'}</small>`:'<strong>새로운 동료를 기다리며</strong><small>펫 지원 슬롯 · 1마리</small>';
    $('[data-pet-detail]').innerHTML=row?`<div class="pe-detail-heading"><span class="pe-eyebrow">동료 정보</span><h2>${esc(row.name)}<small>${esc(row.animal||'동료')}</small></h2><p>${esc(row.description||'전투 시작에 등장해 아군을 지원합니다.')}</p></div><div class="pe-buff-title">${petUiIcon('buff')}<h3>시작 버프</h3><span>1회</span></div><ul class="pe-buff-list">${row.buffs?.length?row.buffs.map(buff=>`<li><span>${esc(state.buffTypes?.[buff.type]||buff.type)}</span><b class="${buff.percent===null?'pe-value-pending':''}">${buff.percent===null?'미정':`${esc(buff.percent)}%`}</b></li>`).join(''):'<li><span>버프 설정 대기</span><b class="pe-value-pending">미정</b></li>'}</ul><dl class="pe-support-info"><div><dt>적용 대상</dt><dd>${esc(state.buffTargets?.[row.target]||'설정 대기')}</dd></div><div><dt>사용 모드</dt><dd>${row.modes?.length?row.modes.map(mode=>`<span class="pe-mode">${mode==='PVE'?'PvE':'PvP'}</span>`).join(''):'설정 대기'}</dd></div></dl><p class="pe-help">${row.ready?.length?'전투 시작 시 1회 적용합니다.':'전투 SD·시작 버프 설정을 준비하고 있습니다.'}</p>`:`<div class="pe-detail-empty"><span class="pe-eyebrow">전투 시작 지원</span><h2>${state?.available?'함께할 동료 선택':'펫 시스템 준비 중'}</h2><p>${esc(state?.available?'목록에서 펫을 선택하면 일러스트와 시작 버프를 확인할 수 있습니다.':state?.message||'잠시만 기다려 주세요.')}</p><div class="pe-buff-title">${petUiIcon('buff')}<h3>전투 시작 지원</h3><span>1회</span></div><p class="pe-help">펫은 별도 지원 슬롯에 한 마리 장착합니다.</p></div>`;
    $('[data-pet-collection-title]').textContent=state?.reviewOnly?'구구가가 보관함':'보유 펫';
    $('[data-pet-count]').textContent=`${state?.cards?.length||0}마리`;
    $('[data-pet-grid]').innerHTML=state?.cards?.length?state.cards.map(card=>{
      const source=imagePath(card.sourceArt||card.battleSprite),active=card.code===selected,worn=card.code===state.loadout?.petCode;
      return `<button type="button" class="pe-card ${active?'pe-selected':''}" data-pet-select="${esc(card.code)}" aria-pressed="${active}" aria-label="${esc(card.name)} 선택"><span class="pe-card-art">${source?`<img src="${esc(source)}" alt="" loading="lazy">`:petUiIcon('paw')}</span><span class="pe-card-identity"><strong>${esc(card.name)}</strong><small>${worn?'장착 중':card.reviewOwned?'검수용 보유':card.owned?'보유':'미보유'}</small></span><span class="pe-card-indicator" aria-hidden="true">${petUiIcon(worn?'check':'arrow')}</span></button>`;
    }).join(''):'<p class="pe-empty-collection">펫 획득 기능을 준비하고 있습니다.</p>';
    root.querySelectorAll('img').forEach(img=>img.addEventListener('error',()=>{img.hidden=true;if(img.classList.contains('pe-hero'))$('.pe-art-error').hidden=false;},{once:true}));sync();
  }
  function accessFailure(error){
    state=null;selected=null;pending=null;needsRefresh=false;render();
    $('[data-pet-detail]').innerHTML=`<div class="pe-detail-empty"><h2>펫 정보를 확인해 주세요</h2><p>${esc(error.message)}</p><a class="pe-login" href="${review?'/admin/':'/'}">${review?'CMS 로그인':'게임으로 돌아가기'}</a></div>`;
  }
  async function load(){
    if(busy||pending||disposed)return;busy=true;controller=new AbortController();sync();status('펫 정보를 불러오고 있습니다.');
    try{
      const value=await request(endpoint+'state',{signal:controller.signal});if(disposed)return;
      if(value.version!==1||!Array.isArray(value.cards)||!value.loadout)throw Error('펫 정보를 확인하지 못했습니다. 다시 불러와 주세요.');
      state=value;needsRefresh=false;if(!state.cards.some(row=>row.code===selected))selected=state.loadout.petCode||state.cards[0]?.code||null;
      render();status(state.orphaned?'장착했던 펫이 목록에서 제외되어 빈 슬롯으로 표시합니다.':state.reviewOnly?'검수용 펫을 선택해 장착·해제를 확인하세요.':state.message||'장착할 펫을 선택하세요.');
    }catch(error){if(!disposed){if([401,403].includes(error.status))accessFailure(error);else if(!state){render();$('[data-pet-detail]').innerHTML=`<div class="pe-detail-empty"><h2>펫 정보를 확인해 주세요</h2><p>${esc(error.message)}</p></div>`;}status(error.message,true);}}
    finally{if(!disposed){busy=false;sync();}}
  }
  async function save(code){
    if(busy||disposed||needsRefresh||!state?.canEquip)return;
    if(!pending)pending={petCode:code,expectedRevision:state.loadout.revision,petCmsRevision:state.petCmsRevision,requestId:crypto.randomUUID()};
    busy=true;controller=new AbortController();sync();status('장착 정보를 저장하고 있습니다.');
    try{
      const value=await request(endpoint+'loadout',{method:'POST',body:pending,signal:controller.signal});if(disposed)return;
      if(value.version!==1||!Array.isArray(value.cards)||!value.loadout)throw Error('저장 결과를 확인하지 못했습니다. 같은 요청으로 다시 확인해 주세요.');
      state=value;pending=null;render();status(state.loadout.petCode?`${equipped()?.name||'펫'} 장착을 저장했습니다.${state.reviewOnly?' OWNER 검수에만 반영됩니다.':''}`:'장착을 해제했습니다.');
      window.dispatchEvent(new CustomEvent('cnine:pet-equipment-changed',{detail:{reviewOnly:state.reviewOnly}}));
    }catch(error){if(!disposed){if([401,403].includes(error.status))accessFailure(error);else if(!error.retryable&&error.status&&error.status<500&&![408,429].includes(error.status)){pending=null;needsRefresh=true;}status(error.message,true);}}
    finally{if(!disposed){busy=false;sync();}}
  }
  function click(event){
    const button=event.target.closest('button');if(!button||button.disabled)return;
    if(button.hasAttribute('data-pet-select')){selected=button.dataset.petSelect;render();root.querySelector(`[data-pet-select="${selected}"]`)?.focus({preventScroll:true});status(`${pet().name} · 시작 버프를 확인한 뒤 장착하세요.`);}
    if(button.hasAttribute('data-pet-equip'))void save(selected);
    if(button.hasAttribute('data-pet-unequip'))void save(null);
    if(button.hasAttribute('data-pet-refresh'))void load();
  }
  root.addEventListener('click',click);void load();
  return {reload:load,dispose(){disposed=true;controller?.abort();root.removeEventListener('click',click);root.replaceChildren();}};
}

export function openPetEquipment(options={}){
  if(activeDialog){activeDialog.dialog.focus();return activeDialog;}
  const previous=document.activeElement,dialog=document.createElement('dialog');dialog.className='pe-dialog';dialog.setAttribute('aria-label','펫 장착창');
  dialog.innerHTML=`<div class="pe-dialog-chrome"><button type="button" class="pe-close" aria-label="펫 장착창 닫기">${petUiIcon('close')}</button></div><div data-pet-window></div>`;
  document.body.append(dialog);const mounted=mountPetEquipment(dialog.querySelector('[data-pet-window]'),options);
  const close=()=>dialog.close();dialog.querySelector('.pe-close').addEventListener('click',close);
  dialog.addEventListener('click',event=>{if(event.target===dialog){const box=dialog.getBoundingClientRect();if(event.clientX<box.left||event.clientX>box.right||event.clientY<box.top||event.clientY>box.bottom)close();}});
  dialog.addEventListener('keydown',event=>{
    if(event.key!=='Tab')return;const controls=[...dialog.querySelectorAll('button:not(:disabled),a[href],input:not(:disabled)')].filter(el=>el.getClientRects().length);
    const first=controls[0],last=controls.at(-1);if(event.shiftKey&&document.activeElement===first){event.preventDefault();last?.focus();}else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first?.focus();}
  });
  dialog.addEventListener('close',()=>{mounted.dispose();dialog.remove();activeDialog=null;if(previous?.isConnected)previous.focus();},{once:true});
  dialog.showModal();activeDialog={dialog,close};dialog.querySelector('.pe-close').focus();return activeDialog;
}
