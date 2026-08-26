(() => {
  'use strict';

  const $ = selector => document.querySelector(selector);
  const esc = value => String(value ?? '').replace(/[&<>'"]/g, char => ({ '&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;' }[char]));
  const EFFECT_LABELS={BATTLE_POWER_PERCENT:'전투력 상승 (%)',SCRAPYARD_FREE_ENTRY:'폐차장 입장권 무료',RAID_EXTRA_ENTRY:'레이드 추가 횟수',COIN_GAIN_PERCENT:'코인 습득률 (%)'};
  const ACQUISITION_LABELS={UNSET:'미설정',COIN:'코인 판매',DROP:'콘텐츠 드랍',EVENT:'이벤트/운영 지급'};
  let state=null;

  async function api(path,options={}){
    const token=localStorage.getItem('cnine_admin_token')||sessionStorage.getItem('cnine_admin_token')||'';
    const response=await fetch(`../api/${path}${path.includes('?')?'&':'?'}_=${Date.now()}`,{...options,cache:'no-store',headers:{'Content-Type':'application/json',authorization:`Bearer ${token}`,...(options.headers||{})}});
    const data=await response.json().catch(()=>({}));if(!response.ok)throw new Error(data.error||'요청에 실패했습니다.');return data;
  }

  function show(button,section){document.querySelectorAll('.view').forEach(view=>{view.hidden=view!==section});document.querySelectorAll('#nav [data-view]').forEach(item=>item.classList.toggle('active',item===button));if($('#pageTitle'))$('#pageTitle').textContent='아바타 관리';load()}

  function install(){
    const nav=$('#nav'),main=$('main');if(!nav||!main)return;
    let button=nav.querySelector('[data-view="avatars"]');
    if(!button){button=document.createElement('button');button.type='button';button.dataset.view='avatars';button.innerHTML='아바타 관리 <span class="buildBadge">OFF</span>';nav.insertBefore(button,nav.querySelector('[data-view="settings"]')||null)}
    let section=$('#view-avatars');
    if(!section){section=document.createElement('section');section.id='view-avatars';section.className='view avatar-admin-view';section.hidden=true;section.innerHTML=`<div class="sectionIntro"><div><small>AVATAR ARCHIVE CONTROL</small><h2>아바타 카탈로그·공개 설정</h2><p>등록 데이터와 판매 조건을 확정한 뒤 OFF → TEST → ON 순서로 공개합니다.</p></div><button class="ghost" id="avatarAdminReload" type="button">새로고침</button></div><div id="avatarAdminRoot" class="avatar-admin-root">불러오는 중...</div>`;main.appendChild(section)}
    button.onclick=()=>show(button,section);$('#avatarAdminReload').onclick=load;
  }

  function modeOptions(current){return ['OFF','TEST','ON'].map(mode=>`<option value="${mode}" ${mode===current?'selected':''}>${mode}${mode==='OFF'?' · 완전 비공개':mode==='TEST'?' · OWNER만':' · 전체 공개'}</option>`).join('')}
  function acquisitionOptions(current){return Object.entries(ACQUISITION_LABELS).map(([value,label])=>`<option value="${value}" ${value===current?'selected':''}>${label}</option>`).join('')}
  function effectOptions(current){return Object.entries(EFFECT_LABELS).map(([value,label])=>`<option value="${value}" ${value===current?'selected':''}>${label}</option>`).join('')}
  function effectMax(type){return type==='COIN_GAIN_PERCENT'?50:type==='RAID_EXTRA_ENTRY'?20:type==='SCRAPYARD_FREE_ENTRY'?1:100}
  function itemEffects(item){return Array.isArray(item.effects)&&item.effects.length?item.effects:[item.effect||{type:'BATTLE_POWER_PERCENT',value:1}]}
  function effectRow(effect,index){const type=effect?.type||'BATTLE_POWER_PERCENT';return `<div class="avatar-admin-effect-row" data-effect-row><i>${String(index+1).padStart(2,'0')}</i><label><span>효과 유형</span><select data-effect-type>${effectOptions(type)}</select></label><label><span>효과 수치</span><input data-effect-value type="number" min="1" max="${effectMax(type)}" step="1" value="${Math.max(1,Number(effect?.value||1))}"></label><button type="button" data-effect-remove aria-label="효과 삭제">삭제</button></div>`}

  function avatarCard(item){
    const image=String(item.lobbyMobileImage||item.lobbyImage||'');
    const effects=itemEffects(item);
    return `<article class="avatar-admin-card" data-avatar-code="${esc(item.code)}" data-version="${Number(item.version||1)}" style="--avatar-accent:${esc(item.accent||'#82c7d7')}">
      <header><div class="avatar-admin-thumb"><img src="../${esc(image)}" alt="${esc(item.name)}" loading="lazy" decoding="async"></div><div><small>${esc(item.serial)} · ${esc(item.callSign)}</small><h3>${esc(item.name)}</h3><p>${esc(item.role)}</p></div><span class="avatar-admin-state ${item.public?'is-public':item.active?'is-test':'is-off'}">${item.public?'PUBLIC':item.active?'READY':'OFF'}</span></header>
      <div class="avatar-admin-effect"><span>고유 효과</span><b>${effects.length}개 옵션 · 장착 시 모두 적용</b></div>
      <div class="avatar-admin-fields">
        <label><span>획득 방식</span><select data-field="acquisitionType">${acquisitionOptions(item.acquisitionType)}</select></label>
        <label><span>코인 가격</span><input data-field="coinPrice" type="number" inputmode="numeric" min="0" step="1" value="${item.coinPrice==null?'':esc(item.coinPrice)}" placeholder="미설정"></label>
        <label class="avatar-admin-wide"><span>획득처 표시명</span><input data-field="sourceLabel" maxlength="80" value="${esc(item.sourceLabel||'')}" placeholder="예: 영토전 최종 보상"></label>
        <label class="avatar-admin-wide"><span>획득 상세 안내</span><textarea data-field="sourceDetail" maxlength="500" rows="2" placeholder="유저에게 표시할 획득 조건">${esc(item.sourceDetail||'')}</textarea></label>
        <label><span>정렬 순서</span><input data-field="sortOrder" type="number" min="0" max="9999" step="1" value="${Number(item.sortOrder||0)}"></label>
      </div>
      <section class="avatar-admin-effects"><header><div><small>MULTI EFFECT OPTIONS</small><b>최대 4개 · 중복 유형 불가</b></div><button type="button" data-effect-add ${effects.length>=4?'disabled':''}>+ 옵션 추가</button></header><div data-effect-list>${effects.map(effectRow).join('')}</div></section>
      <div class="avatar-admin-switches">
        <label><input data-field="active" type="checkbox" ${item.active?'checked':''}><span>데이터 사용 ON</span></label>
        <label><input data-field="public" type="checkbox" ${item.public?'checked':''}><span>유저 공개</span></label>
        <label><input data-field="saleEnabled" type="checkbox" ${item.saleEnabled?'checked':''}><span>상점 판매</span></label>
      </div>
      <footer><small>코드 ${esc(item.code)} · v${Number(item.version||1)}</small><button type="button" data-avatar-save>이 아바타 저장</button></footer>
    </article>`;
  }

  function render(){
    const root=$('#avatarAdminRoot');if(!root||!state)return;const settings=state.settings||{};
    root.innerHTML=`<section class="avatar-admin-gate is-${esc(String(settings.mode||'OFF').toLowerCase())}">
      <div><small>LIVE RELEASE GATE</small><h3>현재 상태 <b>${esc(settings.mode||'OFF')}</b></h3><p>OFF에서는 라이브 메뉴·장비창 진입·직접 API 호출이 모두 차단됩니다.</p></div>
      <label><span>공개 단계</span><select id="avatarSystemMode">${modeOptions(settings.mode||'OFF')}</select></label>
      <label class="avatar-shop-switch"><input id="avatarShopEnabled" type="checkbox" ${settings.shopEnabled?'checked':''}><span>아바타 상점 판매 기능</span></label>
      <button type="button" id="avatarConfigSave">전체 공개 설정 저장</button>
    </section>
    <div class="avatar-admin-warning"><b>안전 초기값</b><span>10종 모두 가격 미설정 · 판매 OFF · 공개 OFF로 등록됩니다. 가격과 획득처를 확정하기 전에는 ON으로 바꾸지 마세요.</span></div>
    <section class="avatar-admin-grid">${(state.avatars||[]).map(avatarCard).join('')}</section>`;
    bind();
  }

  function field(card,name){const input=card.querySelector(`[data-field="${name}"]`);return input?.type==='checkbox'?Boolean(input.checked):input?.value??''}
  function syncCard(card){const acquisition=field(card,'acquisitionType'),price=card.querySelector('[data-field="coinPrice"]'),sale=card.querySelector('[data-field="saleEnabled"]');if(price)price.disabled=acquisition!=='COIN';if(sale&&acquisition!=='COIN')sale.checked=false}
  function syncEffects(card){const rows=[...card.querySelectorAll('[data-effect-row]')],selected=rows.map(row=>row.querySelector('[data-effect-type]').value);rows.forEach((row,index)=>{row.querySelector('i').textContent=String(index+1).padStart(2,'0');const select=row.querySelector('[data-effect-type]'),type=select.value,input=row.querySelector('[data-effect-value]');[...select.options].forEach(option=>{option.disabled=option.value!==type&&selected.includes(option.value)});input.max=effectMax(type);input.min=1;if(Number(input.value)>Number(input.max))input.value=input.max;if(Number(input.value)<1)input.value=1;if(type==='SCRAPYARD_FREE_ENTRY')input.value=1;row.querySelector('[data-effect-remove]').disabled=rows.length<=1});const add=card.querySelector('[data-effect-add]');if(add)add.disabled=rows.length>=4}
  function readEffects(card){return[...card.querySelectorAll('[data-effect-row]')].map(row=>({type:row.querySelector('[data-effect-type]').value,value:Number(row.querySelector('[data-effect-value]').value)}))}

  function bind(){
    $('#avatarConfigSave').onclick=saveConfig;
    document.querySelectorAll('.avatar-admin-card').forEach(card=>{
      syncCard(card);syncEffects(card);card.querySelector('[data-field="acquisitionType"]')?.addEventListener('change',()=>syncCard(card));card.querySelector('[data-avatar-save]')?.addEventListener('click',()=>saveAvatar(card));
      card.querySelector('[data-effect-add]')?.addEventListener('click',()=>{const used=new Set(readEffects(card).map(effect=>effect.type)),type=Object.keys(EFFECT_LABELS).find(value=>!used.has(value));if(!type)return;card.querySelector('[data-effect-list]').insertAdjacentHTML('beforeend',effectRow({type,value:1},card.querySelectorAll('[data-effect-row]').length));syncEffects(card)});
      card.addEventListener('click',event=>{const remove=event.target.closest('[data-effect-remove]');if(remove&&!remove.disabled){remove.closest('[data-effect-row]').remove();syncEffects(card)}});
      card.addEventListener('change',event=>{if(event.target.matches('[data-effect-type]'))syncEffects(card)});
    });
  }

  async function saveConfig(){
    const mode=$('#avatarSystemMode').value,shopEnabled=$('#avatarShopEnabled').checked;
    if(mode==='ON'&&!confirm('아바타 시스템을 전체 유저에게 공개하시겠습니까? 공개 데이터와 판매 조건을 다시 확인하세요.'))return;
    const button=$('#avatarConfigSave');button.disabled=true;
    try{await api('admin/avatars',{method:'POST',body:JSON.stringify({action:'SAVE_CONFIG',mode,shopEnabled})});await load();alert('아바타 공개 설정을 저장했습니다.')}catch(error){alert(error.message);button.disabled=false}
  }

  async function saveAvatar(card){
    const payload={action:'SAVE_AVATAR',code:card.dataset.avatarCode,version:Number(card.dataset.version),acquisitionType:field(card,'acquisitionType'),coinPrice:field(card,'coinPrice'),sourceLabel:field(card,'sourceLabel'),sourceDetail:field(card,'sourceDetail'),effects:readEffects(card),sortOrder:Number(field(card,'sortOrder')),active:field(card,'active'),public:field(card,'public'),saleEnabled:field(card,'saleEnabled')};
    const button=card.querySelector('[data-avatar-save]');button.disabled=true;
    try{const result=await api('admin/avatars',{method:'POST',body:JSON.stringify(payload)}),index=state.avatars.findIndex(item=>item.code===payload.code);if(index>=0)state.avatars[index]=result.avatar;render();alert(`${result.avatar.name} 설정을 저장했습니다.`)}catch(error){alert(error.message);button.disabled=false}
  }

  async function load(){
    const root=$('#avatarAdminRoot');if(!root)return;root.innerHTML='<div class="avatar-admin-loading">아바타 카탈로그를 불러오는 중...</div>';
    try{state=await api('admin/avatars');render();const badge=document.querySelector('#nav [data-view="avatars"] .buildBadge');if(badge)badge.textContent=state.settings?.mode||'OFF'}catch(error){root.innerHTML=`<div class="inlineNotice error">${esc(error.message)}</div>`}
  }

  const boot=()=>{install();setTimeout(install,250);setTimeout(install,1000)};
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});else boot();
})();
