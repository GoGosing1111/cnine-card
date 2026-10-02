import {jointAccountRequest,jointAdminRequest} from './joint-account-transport.mjs';

const esc=value=>String(value??'').replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
const imagePath=value=>typeof value==='string'&&/^\/?assets\/[A-Za-z0-9_./-]+\.(png|webp)$/i.test(value)&&!value.includes('..')?'/'+value.replace(/^\//,''):'';
let activeDialog=null;

export function mountPetEquipment(root,{review=false,request=review?jointAdminRequest:jointAccountRequest}={}){
  let state=null,selected=null,busy=false,pending=null,needsRefresh=false,disposed=false,controller=null;
  const endpoint=review?'admin/pets/equipment/':'pets/v1/';
  root.classList.add('pet-equipment');
  root.innerHTML=`<header class="pe-heading"><div><span class="pe-eyebrow">COMPANION / OPENING SUPPORT</span><h1>펫 장착</h1><p>전투의 첫 순간, 함께하는 작은 동료</p></div><span class="pe-capacity">지원 슬롯 <b>1</b></span></header>
    <p class="pe-notice" data-pet-notice hidden></p>
    <section class="pe-equipped" aria-label="현재 장착한 펫"><div data-pet-equipped></div><button type="button" data-pet-unequip disabled>장착 해제</button></section>
    <div class="pe-layout"><section class="pe-stage" aria-label="선택한 펫 일러스트"><div class="pe-stage-ring" aria-hidden="true"></div><div data-pet-art></div><span class="pe-stage-label">YOUR LITTLE COMPANION</span></section><section class="pe-detail" data-pet-detail aria-label="펫 상세"></section></div>
    <section class="pe-collection"><div class="pe-collection-head"><h2 data-pet-collection-title>보유 펫</h2><span data-pet-count></span></div><div class="pe-grid" data-pet-grid aria-label="펫 선택"></div></section>
    <footer class="pe-footer"><p data-pet-status role="status" aria-live="polite">펫 정보를 불러오고 있습니다.</p><div><button type="button" data-pet-refresh>새로고침</button><button type="button" class="pe-primary" data-pet-equip disabled>펫을 선택하세요</button></div></footer>`;
  const $=selector=>root.querySelector(selector),pet=()=>state?.cards?.find(row=>row.code===selected),equipped=()=>state?.cards?.find(row=>row.code===state.loadout?.petCode);
  function status(message,error=false){$('[data-pet-status]').textContent=message;$('[data-pet-status]').classList.toggle('pe-error',error);}
  function sync(){
    const locked=busy||Boolean(pending)||needsRefresh,row=pet();
    root.setAttribute('aria-busy',String(busy));
    $('[data-pet-equip]').disabled=busy||needsRefresh||!state?.canEquip||(!pending&&(!row||!row.owned||row.code===state.loadout?.petCode));
    $('[data-pet-equip]').textContent=pending?'장착 결과 재확인':row&&row.code===state?.loadout?.petCode?'장착 중':row?`${row.name} 장착`:'펫을 선택하세요';
    $('[data-pet-unequip]').disabled=locked||!state?.canEquip||!state.loadout?.petCode;
    $('[data-pet-refresh]').disabled=busy||Boolean(pending);
    root.querySelectorAll('[data-pet-select]').forEach(button=>button.disabled=locked||!state?.canEquip);
  }
  function render(){
    const row=pet(),current=equipped(),notice=$('[data-pet-notice]');notice.hidden=!state?.reviewOnly;notice.textContent=state?.message||'';
    const currentImage=imagePath(current?.sourceArt||current?.battleSprite);
    $('[data-pet-equipped]').innerHTML=`${currentImage?`<img src="${esc(currentImage)}" alt="">`:'<span class="pe-empty-slot" aria-hidden="true">✧</span>'}<div><small>${state?.reviewOnly?'OWNER 장착 검수':'현재 장착'}</small><strong>${esc(current?.name||'빈 지원 슬롯')}</strong><span>${current?'전투 시작 지원 · 1마리':'동료를 선택해 함께 준비하세요'}</span></div>`;
    const art=imagePath(row?.sourceArt||row?.battleSprite);
    $('[data-pet-art]').innerHTML=art?`<img class="pe-hero" src="${esc(art)}" alt="${esc(row.name)} 펫 일러스트"><span class="pe-art-error" hidden>일러스트를 불러오지 못했습니다.</span>`:`<div class="pe-stage-empty"><span aria-hidden="true">✧</span><p>${state?.available?'함께할 펫을 선택하세요':'새로운 동료를 준비하고 있어요'}</p></div>`;
    $('[data-pet-detail]').innerHTML=row?`<div class="pe-detail-heading"><span class="pe-eyebrow">${esc(row.animal||'동료')} · ${row.reviewOwned?'검수용 보유':'보유'}</span><h2>${esc(row.name)}</h2><p>${esc(row.description||'전투 시작에 등장해 아군을 지원합니다.')}</p></div><div class="pe-buff-title"><span aria-hidden="true">✦</span><h3>전투 시작 버프</h3><span>1회</span></div><ul class="pe-buff-list">${row.buffs?.length?row.buffs.map(buff=>`<li><span>${esc(state.buffTypes?.[buff.type]||buff.type)}</span><b>${buff.percent===null?'미정':`${esc(buff.percent)}%`}</b></li>`).join(''):'<li><span>버프 설정 대기</span><b>미정</b></li>'}</ul><dl class="pe-support-info"><div><dt>적용 대상</dt><dd>${esc(state.buffTargets?.[row.target]||'CMS 설정 대기')}</dd></div><div><dt>사용 모드</dt><dd>${row.modes?.length?row.modes.map(mode=>mode==='PVE'?'PvE':'PvP').join(' · '):'CMS 설정 대기'}</dd></div></dl><p class="pe-help">${row.ready?.length?'SD와 버프 설정을 완료했습니다.':'전투 SD·시작 버프 설정을 준비하고 있습니다.'} ${state.reviewOnly?'현재 선택은 검수용으로 저장됩니다.':''}</p>`:`<div class="pe-detail-empty"><span class="pe-eyebrow">ONE PET / ONE OPENING BUFF</span><h2>${state?.available?'어떤 동료와 함께할까요?':'펫 시스템 준비 중'}</h2><p>${esc(state?.available?'아래 목록에서 펫을 선택하면 일러스트와 시작 버프를 확인할 수 있습니다.':state?.message||'잠시만 기다려 주세요.')}</p><div class="pe-buff-title"><span aria-hidden="true">✦</span><h3>전투 시작 지원</h3><span>1회</span></div><p class="pe-help">일반 카드 5장과 용병 편성은 그대로 유지합니다. 펫은 별도 지원 슬롯에 1마리 장착합니다.</p></div>`;
    $('[data-pet-collection-title]').textContent=state?.reviewOnly?'구구가가 · 장착 검수 목록':'보유 펫';
    $('[data-pet-count]').textContent=`${state?.cards?.length||0}마리`;
    $('[data-pet-grid]').innerHTML=state?.cards?.length?state.cards.map(card=>{
      const source=imagePath(card.sourceArt||card.battleSprite),active=card.code===selected,worn=card.code===state.loadout?.petCode;
      return `<button type="button" class="pe-card ${active?'pe-selected':''}" data-pet-select="${esc(card.code)}" aria-pressed="${active}" aria-label="${esc(card.name)} 선택"><span class="pe-card-art">${source?`<img src="${esc(source)}" alt="" loading="lazy">`:'<span aria-hidden="true">✧</span>'}</span><strong>${esc(card.name)}</strong><small>${worn?'장착 중':card.reviewOwned?'검수용 보유':card.owned?'보유':'미보유'}</small>${worn?'<span class="pe-worn-mark" aria-hidden="true">✓</span>':''}</button>`;
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
    if(button.hasAttribute('data-pet-select')){selected=button.dataset.petSelect;render();root.querySelector(`[data-pet-select="${selected}"]`)?.focus();status(`${pet().name} · 시작 버프를 확인한 뒤 장착하세요.`);}
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
  dialog.innerHTML='<div class="pe-dialog-chrome"><button type="button" class="pe-close" aria-label="펫 장착창 닫기">×</button></div><div data-pet-window></div>';
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
