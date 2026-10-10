import {jointAccountRequest} from './joint-account-transport.mjs';
import {mountSeasonPass} from './supporter-season-pass-v1.mjs?v=20261010-pass-art1';
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const date=v=>v?new Date(v).toLocaleString('ko-KR',{timeZone:'Asia/Seoul',year:'numeric',month:'long',day:'numeric',hour:'2-digit',minute:'2-digit'}):'—';
const petImage=value=>{try{const u=new URL('/'+String(value||'').replace(/^\//,''),location.origin);return /^\/(assets|preview)\//.test(u.pathname)?u.href:'';}catch{return '';}};
const icon=name=>`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${{
  leaf:'<path d="M20 4C11 3 4 7 5 14c1 6 8 7 12 2 3-4 3-8 3-12Z"/><path d="m4 21 11-12M9 16v-5m0 5h5"/>',
  arrow:'<path d="M5 12h14m-6-6 6 6-6 6"/>',
  close:'<path d="m6 6 12 12M18 6 6 18"/>',
  magnet:'<path d="M5 4v10a7 7 0 0 0 14 0V4h-5v10a2 2 0 0 1-4 0V4H5Zm0 5h5m4 0h5"/><path d="m3 1-1 2m20-2 1 2"/>',
  shield:'<path d="m12 2 8 3v7c0 5-8 10-8 10S4 17 4 12V5l8-3Z"/><path d="m8 8 8 8m0-8-8 8M8 8v3m0-3h3m5 0v3m0-3h-3"/>',
  mail:'<path d="M3 7v12h18V7M3 7l9 7 9-7M3 7h6m9 0h3"/><path d="M13 3h6m-3-3v6"/>',
  check:'<path d="m5 12 4 4L19 6"/>',
  clock:'<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>'
}[name]||''}</svg>`;
const crest=`<svg class="ss-crest" viewBox="0 0 160 180" fill="none" aria-hidden="true"><path class="ss-crest-halo" d="m80 7 62 36v66l-62 64-62-64V43Z"/><path d="m80 19 51 30v55l-51 53-51-53V49Z"/><path d="m80 30 41 24v46l-41 43-41-43V54Z" opacity=".35"/><path class="ss-crest-tree" d="M80 117V57m0 25c-16 0-23-8-23-20 15 0 23 6 23 20Zm0 16c-22 0-32-10-32-25 21 0 32 9 32 25Zm0-16c16 0 23-8 23-20-15 0-23 6-23 20Zm0 16c22 0 32-10 32-25-21 0-32 9-32 25Z"/><path d="m80 40 4 6-4 6-4-6Zm-42 79 7 7m-3-17 11 4m69 6-7 7m3-17-11 4M65 126h30"/><circle cx="18" cy="43" r="3"/><circle cx="142" cy="43" r="3"/><circle cx="80" cy="173" r="3"/></svg>`;

export function mountServerSupportNavigation({root,getUser,signal,request=jointAccountRequest}){
  const menu=root.getElementById('menu-dialog');if(!menu)return {dispose(){}};
  const doc=menu.ownerDocument,link=doc.createElement('link');link.rel='stylesheet';link.href='/css/server-support-v1.css?v=20261010-pass-art1';root.append(link);
  const passStyle=doc.createElement('link');passStyle.rel='stylesheet';passStyle.href='/css/supporter-season-pass-v1.css?v=20261010-pass-art1';root.append(passStyle);
  let passView=null;
  const footer=doc.createElement('div');footer.className='ss-menu-footer';footer.hidden=true;menu.append(footer);
  let generation=0,menuKey='',dialog=null,data=null,busy=false,pending=null,page='info',opener=null,disposed=false,serverOffset=0;
  const identity=()=>{let token='';try{token=localStorage.getItem('cnine_card_api_token')||sessionStorage.getItem('cnine_card_api_token')||'';}catch{}return String(getUser()?.serverUserId||getUser()?.id||'')+':'+token;};
  let currentIdentity=identity();
  const clearEntry=()=>{footer.replaceChildren();footer.hidden=true;};
  const close=()=>{passView?.dispose();passView=null;dialog?.close();dialog?.remove();dialog=null;data=null;opener?.isConnected&&opener.focus({preventScroll:true});};
  const key=()=>`cnine_support_pet_pending_v1:${Number(getUser()?.serverUserId||getUser()?.id||0)}`;
  function render(){
    if(!dialog||!data)return;
    passView?.dispose();passView=null;
    const s=data.subscription,p=data.plan,selected=s.magnetPetCode,active=s.active;
    const scrollTop=dialog.scrollTop,focusPet=root.activeElement?.dataset?.ssPet;
    dialog.dataset.ssPage=page;
    dialog.innerHTML=`<header class="ss-dialog-head"><span class="ss-brand">${icon('leaf')}<span>SOOPKETMON<small>숲켓몬 · 서버 안내</small></span></span><div class="ss-header-actions">${page!=='info'?'<button type="button" class="ss-back" data-ss-back>← 서버 안내</button>':''}<button type="button" class="ss-close" data-ss-close aria-label="서버 안내 닫기">${icon('close')}</button></div></header><div class="ss-dialog-body">${page==='pass'?'<div data-season-pass></div>':page==='info'?`
      <section class="ss-info-intro"><div><p class="ss-eyebrow">함께 이어가는 숲켓몬</p><h2>서버 안내</h2><p class="ss-lead">더 오래 즐길 수 있는 숲켓몬을 위해.<br>여러분의 마음을 운영과 개발에 담습니다.</p></div><div class="ss-info-seal">${crest}</div></section>
      <div class="ss-purpose" aria-label="후원금 사용처"><span><small>01</small>안정적인 서버 운영</span><span><small>02</small>서비스 유지·보수</span><span><small>03</small>새로운 콘텐츠 개발</span></div>
      <button class="ss-info-link" type="button" data-ss-support aria-label="서버 운영 후원"><span class="ss-info-link-icon">${icon('leaf')}</span><span class="ss-info-link-copy"><small>숲켓몬을 응원하는 또 하나의 방법</small><strong>서버 운영 후원</strong><span>30일 혜택과 이용 안내 확인하기</span></span><span class="ss-link-arrow">${icon('arrow')}</span></button><p class="ss-info-note">${icon('clock')}${data.seasonPass?.enabled?'시즌패스 일일 보상 이용 가능':'시즌패스 보상표 준비 중'}</p>`:`
      ${data.previewOnly?'<p class="ss-preview"><b>운영자 미리보기</b><span>일반 유저는 가입 3일 경과·2차 인증 완료 후 볼 수 있습니다.</span></p>':''}
      <section class="ss-hero" aria-label="서버 운영 후원 안내"><div class="ss-hero-copy"><p class="ss-eyebrow">숲켓몬의 다음 이야기를 함께</p><h2>서버 운영 <em>후원</em></h2><p class="ss-lead">${esc(data.notice)}</p><div class="ss-launch">${icon('clock')}<span>${data.seasonPass?.enabled?'시즌패스 일일 보상 이용 가능':'시즌패스 보상표 준비 중'}</span></div></div><div class="ss-pass"><div class="ss-pass-top"><span>SOOPKETMON</span><span>${p.durationDays} DAYS</span></div><div class="ss-pass-art">${crest}<span>함께하는 마음,<br><b>더 깊어지는 모험.</b></span></div><div class="ss-pass-price"><span>${p.durationDays}일 후원</span><strong>${p.priceWon.toLocaleString('ko-KR')}<small>원</small></strong></div></div></section>
      <section class="ss-benefits" aria-label="30일 후원 혜택"><div class="ss-section-heading"><h3>후원자 혜택</h3><span>함께해 주시는 분들을 위해</span></div><div class="ss-benefit-list"><article class="ss-benefit"><div class="ss-benefit-top">${icon('magnet')}<span>01</span></div><h4>펫 자석 잠재력</h4><div class="ss-benefit-value"><strong>${p.magnetSuccessPercent}<small>%</small></strong><span>${p.durationDays}일</span></div><p>선택한 펫 1마리에 확정 적용. <br>원하는 보유 펫으로 언제든 변경할 수 있습니다.</p></article><article class="ss-benefit"><div class="ss-benefit-top">${icon('shield')}<span>02</span></div><h4>군단토벌 추가 입장</h4><div class="ss-benefit-value"><strong>+${p.extraLegionEntries}<small>회</small></strong><span>매일</span></div><p>기본 입장 횟수에 매일 3회 추가. <br>한국시간 자정에 초기화됩니다.</p></article><article class="ss-benefit"><div class="ss-benefit-top">${icon('mail')}<span>03</span></div><h4>후원자 전용</h4><div class="ss-benefit-value ss-benefit-message"><strong>푸시 메시지</strong><span>별도 지급</span></div><p>후원자를 위한 별도의 <br>푸시 메시지가 지급됩니다.</p></article></div></section>
      <section class="ss-membership" aria-label="나의 후원 상태"><div class="ss-membership-label">${icon('clock')}<span>나의 후원 상태</span><span class="ss-state ${active?'is-active':''}">${active?'혜택 이용 중':s.revokedAt?'혜택 중지':s.endsAt?'이용 기간 종료':'후원 등록 전'}</span></div><p>${active?'<span>이용 종료</span><time datetime="'+esc(new Date(s.endsAt).toISOString())+'">'+date(s.endsAt)+'</time>':'운영자의 후원 확인 후 30일 혜택이 적용됩니다.'}</p></section>
      ${active?`<section class="ss-pets"><div class="ss-section-heading"><div><h3>자석을 부여할 펫</h3><p>함께할 펫을 선택하세요. 언제든 바꿀 수 있습니다.</p></div><span class="ss-choice-count">1마리 선택</span></div><div class="ss-pet-list">${data.pets.map(p=>`<button type="button" data-ss-pet="${esc(p.code)}" aria-pressed="${selected===p.code}" ${busy||pending||data.previewOnly?'disabled':''}><span class="ss-pet-art">${petImage(p.sourceArt)?`<img src="${esc(petImage(p.sourceArt))}" alt="" loading="lazy">`:icon('magnet')}</span><span class="ss-pet-copy"><b>${esc(p.name)}</b><small>${selected===p.code?'기간제 자석 적용 중':p.permanentMagnet?'영구 자석 보유':'선택하면 확정 적용'}</small></span><span class="ss-pet-check" aria-hidden="true">${selected===p.code?icon('check'):'+'}</span></button>`).join('')||'<p class="ss-empty">보유한 펫이 없습니다. 펫을 획득한 뒤 선택할 수 있습니다.</p>'}</div><p class="ss-footnote">기간이 끝나면 기간제 자석만 종료됩니다. 기존 영구 잠재력은 유지되며 물약은 소모하지 않습니다. 적용된 펫을 장착하고 새 토벌에 입장해 주세요.</p>${pending&&!data.previewOnly?'<button type="button" class="ss-primary" data-ss-retry>이전 변경 결과 확인</button>':''}</section>`:''}
      ${pending&&!active&&!data.previewOnly?'<button type="button" class="ss-primary" data-ss-retry>이전 변경 결과 확인</button>':''}<p class="ss-status" role="status" aria-live="polite"></p><footer class="ss-thanks">${icon('leaf')}<span>숲켓몬과 함께해 주셔서 감사합니다.</span></footer>`}</div>`;
    dialog.scrollTop=scrollTop;
    if(page==='pass')passView=mountSeasonPass(dialog.querySelector('[data-season-pass]'),{data:data.seasonPass,userId:Number(getUser()?.serverUserId||getUser()?.id),previewOnly:data.previewOnly,request,signal,onRefresh:info=>{data=info;}});
    else{const button=doc.createElement('button');button.type='button';button.className='sp-entry';button.dataset.ssSeasonPass='';button.innerHTML='<img class="sp-entry-crest" src="/assets/ui/season-pass-v1/supporter-crest.webp" alt=""><span><small>후원자를 위한 매일의 선물</small><b>30일 시즌패스</b></span><strong>보상 달력 보기 →</strong>';dialog.querySelector(page==='info'?'.ss-info-note':'.ss-benefits')?.before(button);}
    if(focusPet)Array.from(dialog.querySelectorAll('[data-ss-pet]')).find(button=>button.dataset.ssPet===focusPet&&!button.disabled)?.focus({preventScroll:true});
  }
  const status=text=>{const el=dialog?.querySelector('.ss-status');if(el)el.textContent=text;};
  async function loadPage(nextPage='info'){
    if(busy||disposed)return;const who=identity(),turn=generation;busy=true;
    try{const value=await request('server-support/info',{signal,timeoutMs:8000});if(disposed||turn!==generation||who!==identity())return;data=value;serverOffset=value.serverNow-Date.now();page=nextPage;
      if(!dialog){dialog=doc.createElement('dialog');dialog.className='ss-dialog';dialog.setAttribute('aria-label','서버 운영 안내');root.append(dialog);
        dialog.addEventListener('cancel',e=>{e.preventDefault();close();});
        dialog.addEventListener('click',e=>{const b=e.target.closest('button');if(!b)return;if(b.hasAttribute('data-ss-close'))close();else if(b.hasAttribute('data-ss-support'))void loadPage('support');else if(b.hasAttribute('data-ss-season-pass'))void loadPage('pass');else if(b.hasAttribute('data-ss-back')){page='info';render();dialog.scrollTop=0;}else if(b.dataset.ssPet)void selectPet(b.dataset.ssPet);else if(b.hasAttribute('data-ss-retry'))void selectPet();});
      }
      try{pending=JSON.parse(localStorage.getItem(key())||'null');}catch{pending=null;}
      busy=false;render();if(!dialog.open)dialog.showModal();
    }catch(error){if(who!==identity()||disposed)return;if([401,403,404].includes(error.status)){clearEntry();close();}else{status(error.message);if(!dialog){footer.textContent='서버 안내를 불러오지 못했습니다. 메뉴를 다시 열어 주세요.';}}}finally{busy=false;}
  }
  async function selectPet(petCode){
    if(busy||data?.previewOnly||!pending&&!data?.subscription.active)return;
    if(!pending){if(data.subscription.magnetPetCode===petCode)return;pending={petCode,expectedRevision:data.subscription.revision,requestId:crypto.randomUUID()};try{localStorage.setItem(key(),JSON.stringify(pending));}catch{pending=null;status('변경 요청을 저장하지 못했습니다. 브라우저 저장 공간을 확인하세요.');return;}}
    const who=identity();busy=true;render();status('선택한 펫에 자석을 적용하고 있습니다.');
    try{const result=await request('server-support/pet',{method:'POST',body:pending,signal});if(disposed||who!==identity())return;localStorage.removeItem(key());pending=null;data.subscription=result.subscription;busy=false;render();status('선택한 펫에 자석 잠재력이 적용되었습니다.');}
    catch(error){if(disposed||who!==identity())return;if(!error.retryable&&error.status&&error.status<500&&![408,429].includes(error.status)){localStorage.removeItem(key());pending=null;if([401,404].includes(error.status)){clearEntry();close();return;}}busy=false;render();status(error.message);if(error.status===409||error.code==='SUPPORT_EXPIRED')void loadPage('support');}finally{busy=false;}
  }
  async function sync(force=false){
    if(disposed)return;const who=identity();if(who!==currentIdentity){currentIdentity=who;generation++;close();pending=null;busy=false;force=true;}
    const next=String(menu.open)+':'+menu.dataset.menuCategory;
    if(!force&&next===menuKey)return;menuKey=next;const turn=++generation;clearEntry();
    if(!menu.open||menu.dataset.menuCategory!=='all')return;
    try{const result=await request('server-support/status',{signal,timeoutMs:8000});if(disposed||turn!==generation||who!==identity()||!result.visible)return;
      const button=doc.createElement('button');button.type='button';button.setAttribute('aria-label','서버 안내');button.innerHTML=`${icon('leaf')}<span>서버 안내</span>${icon('arrow')}`;button.className='ss-menu-link';button.onclick=()=>{opener=button;void loadPage();};
      const passButton=doc.createElement('button');passButton.type='button';passButton.dataset.ssMenuPass='';passButton.setAttribute('aria-label','시즌패스');passButton.className='ss-menu-link sp-menu-link';passButton.innerHTML=`<img class="sp-menu-crest" src="/assets/ui/season-pass-v1/supporter-crest.webp" alt=""><span>시즌패스</span>${icon('arrow')}`;passButton.onclick=()=>{opener=passButton;void loadPage('pass');};footer.append(passButton,button);footer.hidden=false;
    }catch{}
  }
  const observer=new MutationObserver(()=>void sync());observer.observe(menu,{attributes:true,attributeFilter:['open','data-menu-category']});
  const changed=()=>{if(identity()!==currentIdentity)void sync(true);};
  window.addEventListener('storage',changed);window.addEventListener('cnine:player-updated',changed);
  const timer=setInterval(()=>{if(dialog?.open&&data?.subscription.active&&Date.now()+serverOffset>=data.subscription.endsAt)void loadPage(page);},1000);
  function dispose(){if(disposed)return;disposed=true;generation++;observer.disconnect();clearInterval(timer);window.removeEventListener('storage',changed);window.removeEventListener('cnine:player-updated',changed);close();footer.remove();link.remove();passStyle.remove();}
  signal?.addEventListener('abort',dispose,{once:true});void sync();return {dispose};
}
