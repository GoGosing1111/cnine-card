import {jointAccountRequest} from './joint-account-transport.mjs';
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const date=v=>v?new Date(v).toLocaleString('ko-KR',{timeZone:'Asia/Seoul',year:'numeric',month:'long',day:'numeric',hour:'2-digit',minute:'2-digit'}):'—';
const petImage=value=>{try{const u=new URL('/'+String(value||'').replace(/^\//,''),location.origin);return /^\/(assets|preview)\//.test(u.pathname)?u.href:'';}catch{return '';}};

export function mountServerSupportNavigation({root,getUser,signal,request=jointAccountRequest}){
  const menu=root.getElementById('menu-dialog');if(!menu)return {dispose(){}};
  const doc=menu.ownerDocument,link=doc.createElement('link');link.rel='stylesheet';link.href='/css/server-support-v1.css?v=20261010';root.append(link);
  const footer=doc.createElement('div');footer.className='ss-menu-footer';footer.hidden=true;menu.append(footer);
  let generation=0,menuKey='',dialog=null,data=null,busy=false,pending=null,page='info',opener=null,disposed=false,serverOffset=0;
  const identity=()=>{let token='';try{token=localStorage.getItem('cnine_card_api_token')||sessionStorage.getItem('cnine_card_api_token')||'';}catch{}return String(getUser()?.serverUserId||getUser()?.id||'')+':'+token;};
  let currentIdentity=identity();
  const clearEntry=()=>{footer.replaceChildren();footer.hidden=true;};
  const close=()=>{dialog?.close();dialog?.remove();dialog=null;data=null;opener?.isConnected&&opener.focus({preventScroll:true});};
  const key=()=>`cnine_support_pet_pending_v1:${Number(getUser()?.serverUserId||getUser()?.id||0)}`;
  function render(){
    if(!dialog||!data)return;
    const s=data.subscription,p=data.plan,selected=s.magnetPetCode,active=s.active;
    dialog.innerHTML=`<div class="ss-dialog-head"><span>SOOPKETMON</span><button type="button" data-ss-close aria-label="서버 안내 닫기">×</button></div>${page==='info'?`
      <h2>서버 안내</h2><p class="ss-lead">숲켓몬의 운영과 개발을 함께 이어갑니다.</p><button class="ss-info-link" type="button" data-ss-support><span>서버 운영 후원</span><span aria-hidden="true">→</span></button>`:`
      <button type="button" class="ss-back" data-ss-back>← 서버 안내</button><h2>서버 운영 후원</h2><p class="ss-lead">${esc(data.notice)}</p>
      <section class="ss-plan" aria-label="30일 후원 혜택"><div class="ss-plan-top"><span>30일 이용</span><strong>${p.priceWon.toLocaleString('ko-KR')}<small>원</small></strong></div><div class="ss-benefit"><span class="ss-benefit-icon" aria-hidden="true">01</span><div><h3>자석 잠재력 100%</h3><p>선택한 펫 1마리에 확정 적용 · 30일<br>보유한 다른 펫으로 언제든 변경할 수 있습니다.</p></div></div><div class="ss-benefit"><span class="ss-benefit-icon" aria-hidden="true">02</span><div><h3>군단토벌 매일 추가 3회</h3><p>기본 입장에 3회 추가 · 매일 한국시간 자정 초기화</p></div></div></section>
      <section class="ss-membership"><span class="ss-state ${active?'is-active':''}">${active?'혜택 이용 중':s.revokedAt?'혜택 중지':s.endsAt?'이용 기간 종료':'후원 등록 전'}</span><p>${active?'이용 종료 '+date(s.endsAt):'운영자의 후원 확인 후 30일 혜택이 적용됩니다.'}</p></section>
      ${active?`<section class="ss-pets"><div class="ss-section-heading"><h3>자석을 부여할 펫</h3><span>1마리 선택</span></div><div class="ss-pet-list">${data.pets.map(p=>`<button type="button" data-ss-pet="${esc(p.code)}" aria-pressed="${selected===p.code}" ${busy||pending?'disabled':''}>${petImage(p.sourceArt)?`<img src="${esc(petImage(p.sourceArt))}" alt="">`:''}<span><b>${esc(p.name)}</b><small>${selected===p.code?'기간제 자석 적용 중':p.permanentMagnet?'영구 자석 보유':'선택하면 확정 적용'}</small></span><i aria-hidden="true">${selected===p.code?'✓':'+'}</i></button>`).join('')||'<p class="ss-empty">보유한 펫이 없습니다. 펫을 획득한 뒤 선택할 수 있습니다.</p>'}</div><p class="ss-footnote">기간이 끝나면 기간제 자석만 종료됩니다. 기존 영구 잠재력은 유지되며 물약은 소모하지 않습니다. 적용된 펫을 장착하고 새 토벌에 입장해 주세요.</p>${pending?'<button type="button" class="ss-primary" data-ss-retry>이전 변경 결과 확인</button>':''}</section>`:''}
      ${pending&&!active?'<button type="button" class="ss-primary" data-ss-retry>이전 변경 결과 확인</button>':''}<p class="ss-status" role="status" aria-live="polite"></p>`}`;
  }
  const status=text=>{const el=dialog?.querySelector('.ss-status');if(el)el.textContent=text;};
  async function loadPage(nextPage='info'){
    if(busy||disposed)return;const who=identity(),turn=generation;busy=true;
    try{const value=await request('server-support/info',{signal,timeoutMs:8000});if(disposed||turn!==generation||who!==identity())return;data=value;serverOffset=value.serverNow-Date.now();page=nextPage;
      if(!dialog){dialog=doc.createElement('dialog');dialog.className='ss-dialog';dialog.setAttribute('aria-label','서버 운영 안내');root.append(dialog);
        dialog.addEventListener('cancel',e=>{e.preventDefault();close();});
        dialog.addEventListener('click',e=>{const b=e.target.closest('button');if(!b)return;if(b.hasAttribute('data-ss-close'))close();else if(b.hasAttribute('data-ss-support'))void loadPage('support');else if(b.hasAttribute('data-ss-back')){page='info';render();}else if(b.dataset.ssPet)void selectPet(b.dataset.ssPet);else if(b.hasAttribute('data-ss-retry'))void selectPet();});
      }
      try{pending=JSON.parse(localStorage.getItem(key())||'null');}catch{pending=null;}
      busy=false;render();if(!dialog.open)dialog.showModal();
    }catch(error){if(who!==identity()||disposed)return;if([401,403,404].includes(error.status)){clearEntry();close();}else{status(error.message);if(!dialog){footer.textContent='서버 안내를 불러오지 못했습니다. 메뉴를 다시 열어 주세요.';}}}finally{busy=false;}
  }
  async function selectPet(petCode){
    if(busy||!pending&&!data?.subscription.active)return;
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
      const button=doc.createElement('button');button.type='button';button.textContent='서버 안내';button.className='ss-menu-link';button.onclick=()=>{opener=button;void loadPage();};footer.append(button);footer.hidden=false;
    }catch{}
  }
  const observer=new MutationObserver(()=>void sync());observer.observe(menu,{attributes:true,attributeFilter:['open','data-menu-category']});
  const changed=()=>{if(identity()!==currentIdentity)void sync(true);};
  window.addEventListener('storage',changed);window.addEventListener('cnine:player-updated',changed);
  const timer=setInterval(()=>{if(dialog?.open&&data?.subscription.active&&Date.now()+serverOffset>=data.subscription.endsAt)void loadPage(page);},1000);
  function dispose(){if(disposed)return;disposed=true;generation++;observer.disconnect();clearInterval(timer);window.removeEventListener('storage',changed);window.removeEventListener('cnine:player-updated',changed);close();footer.remove();link.remove();}
  signal?.addEventListener('abort',dispose,{once:true});void sync();return {dispose};
}
