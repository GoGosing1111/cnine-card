(() => {
  'use strict';

  const $ = selector => document.querySelector(selector);
  const esc = value => String(value ?? '').replace(/[&<>'"]/g, char => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;'
  })[char]);

  async function api(path, options = {}) {
    const token = localStorage.getItem('cnine_admin_token') || sessionStorage.getItem('cnine_admin_token') || '';
    const response = await fetch(`../api/${path}${path.includes('?')?'&':'?'}_=${Date.now()}`, {
      ...options,
      cache: 'no-store',
      headers: {
        'Content-Type': 'application/json',
        authorization: `Bearer ${token}`,
        ...(options.headers || {})
      }
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || '요청에 실패했습니다.');
    return data;
  }

  function showChiefView(button, section) {
    document.querySelectorAll('.view').forEach(view => { view.hidden = view !== section; });
    document.querySelectorAll('#nav [data-view]').forEach(item => item.classList.toggle('active', item === button));
    const title = $('#pageTitle');
    if (title) title.textContent = '족장 관리';
    load();
  }

  function install() {
    const nav = $('#nav');
    const main = $('main');
    if (!nav || !main) return;

    nav.querySelector('[data-view="riftsettings"]')?.remove();

    let button = nav.querySelector('[data-view="chief"]');
    if (!button) {
      button = document.createElement('button');
      button.type = 'button';
      button.dataset.view = 'chief';
      button.innerHTML = '족장 관리 <span class="buildBadge">COUNCIL</span>';
      const settingsButton = nav.querySelector('[data-view="settings"]');
      nav.insertBefore(button, settingsButton || null);
    }

    let section = $('#view-chief');
    if (!section) {
      section = document.createElement('section');
      section.id = 'view-chief';
      section.className = 'view';
      section.hidden = true;
      section.innerHTML = `
        <div class="sectionIntro">
          <div>
            <small>FOREST GRAND COUNCIL</small>
            <h2>족장 선출·임기 관리</h2>
            <p>PLAY DK 투표 결과를 반영해 7일 임기의 족장을 지정합니다.</p>
          </div>
          <button class="ghost" id="chiefAdminReload" type="button">새로고침</button>
        </div>
        <div id="chiefAdminRoot" class="panel">불러오는 중...</div>`;
      main.appendChild(section);
    }

    button.onclick = () => showChiefView(button, section);
    const reload = $('#chiefAdminReload');
    if (reload) reload.onclick = load;
  }

  async function load() {
    const root = $('#chiefAdminRoot');
    if (!root) return;
    try {
      const data = await api('admin/chief');
      const chief = data.chief || {};
      const users = data.users || [];
      root.innerHTML = `
        <div class="chief-admin-layout">
          <div class="chief-admin-current">
            <img src="../assets/chief-council-election-v1.png" alt="대의회 족장 선출">
            <div>
              <small>${chief.active && chief.ordinal ? `제${Number(chief.ordinal)}대 · ` : ''}CURRENT CHIEF</small>
              <h3>${chief.active ? esc(chief.nickname) : '공석'}</h3>
              <p>${chief.active ? `${new Date(chief.endsAt).toLocaleString('ko-KR')}까지 · ${Math.ceil(chief.remainingMs / 3600000)}시간 남음${chief.ordinal?'':' · 대수 미등록'}` : '현재 부임 중인 족장이 없습니다.'}</p>
              ${chief.active ? `<div class="chief-admin-usage">
                <span>오늘 버닝 ${chief.usage.burningToday}/2</span>
                <span>오늘 하이퍼 ${chief.usage.hyperToday}/1</span>
                <span>탑 초기화 ${chief.usage.towerResetCount||0}/2</span>
              </div>` : ''}
            </div>
          </div>
          <div class="chief-admin-appoint">
            <h3>PLAY DK 투표 결과 반영</h3>
            <p>지정 즉시 새 7일 임기가 시작되고 첫 선출 팝업이 전체 유저에게 공개됩니다.</p>
            <label class="field chief-ordinal-field">
              <span>족장 대수</span>
              <input id="chiefOrdinal" type="number" inputmode="numeric" min="1" max="9999" step="1" placeholder="공식 대수 입력" autocomplete="off">
              <small>임명 시각과 분리된 공식 대수입니다. 입력한 정수가 그대로 공개됩니다.</small>
            </label>
            <label class="field">
              <span>족장 유저 선택</span>
              <input id="chiefUserSearch" autocomplete="off" placeholder="닉네임·유저 ID·OWNER 검색">
              <input id="chiefSelectedUserId" type="hidden">
            </label>
            <div id="chiefUserResults" class="chief-user-results"></div>
            <div id="chiefSelectedUser" class="chief-selected-user">족장 후보를 선택하세요.</div>
            <button type="button" class="ghost chief-ordinal-only" id="chiefOrdinalOnlyBtn" ${chief.active?'':'disabled'}>현재 임기 대수만 수정</button>
            <button type="button" id="chiefAppointBtn" disabled>7일 임기 족장으로 임명</button>
          </div>
        </div>`;
      bindUserSearch(users,chief);
      $('#chiefAppointBtn').onclick = () => appoint(users);
      $('#chiefOrdinalOnlyBtn').onclick = () => updateCurrentOrdinal(chief);
    } catch (error) {
      root.innerHTML = `<div class="inlineNotice error">${esc(error.message)}</div>`;
    }
  }

  function bindUserSearch(users,currentChief) {
    const input=$('#chiefUserSearch'),ordinalInput=$('#chiefOrdinal'),results=$('#chiefUserResults'),selected=$('#chiefSelectedUser'),hidden=$('#chiefSelectedUserId'),button=$('#chiefAppointBtn'),ordinalOnlyButton=$('#chiefOrdinalOnlyBtn');
    let requestSeq=0,timer=0;
    const validOrdinal=()=>Number.isSafeInteger(Number(ordinalInput?.value))&&Number(ordinalInput.value)>=1&&Number(ordinalInput.value)<=9999;
    const syncButton=()=>{button.disabled=!Number(hidden.value)||!validOrdinal();if(ordinalOnlyButton)ordinalOnlyButton.disabled=!currentChief?.active||!validOrdinal()};
    const normalize=user=>({...user,id:Number(user.id),role:String(user.role||'USER').toUpperCase(),search:`${user.nickname} ${user.id} #${user.id} ${user.role||'USER'}`.toLocaleLowerCase('ko-KR')});
    const normalized=users.map(normalize);
    const choose=user=>{const index=users.findIndex(item=>Number(item.id)===Number(user.id));if(index>=0)users[index]=user;else users.push(user);hidden.value=String(user.id);input.value=user.nickname;selected.innerHTML=`<b>${esc(user.nickname)}</b><span>#${user.id} · ${esc(user.role)}${user.role==='OWNER'?' · 테스트 가능':''}</span>`;syncButton();results.hidden=true};
    const draw=matches=>{results.innerHTML=matches.length?matches.map(user=>`<button type="button" class="chief-user-result" data-chief-user-id="${user.id}"><span><b>${esc(user.nickname)}</b><small>#${user.id}</small></span><em class="role-${esc(user.role)}">${esc(user.role)}${user.role==='OWNER'?' · TEST':''}</em></button>`).join(''):'<div class="chief-user-empty">검색 결과가 없습니다.</div>';results.hidden=false;results.querySelectorAll('[data-chief-user-id]').forEach(row=>row.onclick=()=>choose(normalized.find(user=>user.id===Number(row.dataset.chiefUserId))))};
    const remote=async(query,seq)=>{try{const data=await api(`admin/chief?q=${encodeURIComponent(query)}`);if(seq!==requestSeq||input.value.trim()!==query)return;const matches=(data.users||[]).map(normalize);for(const user of matches){const index=normalized.findIndex(item=>item.id===user.id);if(index>=0)normalized[index]=user;else normalized.push(user)}draw(matches)}catch(error){if(seq===requestSeq)results.innerHTML=`<div class="chief-user-empty">${esc(error.message)}</div>`}};
    const render=()=>{const raw=input.value.trim(),query=raw.toLocaleLowerCase('ko-KR');hidden.value='';selected.textContent='족장 후보를 선택하세요.';syncButton();draw(normalized.filter(user=>!query||user.search.includes(query)).slice(0,50));clearTimeout(timer);const seq=++requestSeq;if(raw)timer=setTimeout(()=>remote(raw,seq),180)};
    input.addEventListener('input',render);input.addEventListener('focus',render);ordinalInput?.addEventListener('input',syncButton);render();
  }

  async function updateCurrentOrdinal(chief) {
    const ordinal=Number($('#chiefOrdinal')?.value||0);
    if(!chief?.active)return alert('대수를 수정할 현재 임기의 족장이 없습니다.');
    if(!Number.isSafeInteger(ordinal)||ordinal<1||ordinal>9999)return alert('족장 대수는 1~9999 범위의 정수로 입력하세요.');
    if(!confirm(`${chief.nickname} 님의 현재 임기와 권한 사용량은 유지하고 공식 대수만 제${ordinal}대로 수정할까요?`))return;
    const button=$('#chiefOrdinalOnlyBtn');button.disabled=true;
    try{await api('admin/chief',{method:'PATCH',body:JSON.stringify({ordinal})});alert(`현재 임기의 공식 대수를 제${ordinal}대로 수정했습니다.`);await load()}catch(error){alert(error.message);button.disabled=false}
  }

  async function appoint(users) {
    const selectedId=Number($('#chiefSelectedUserId')?.value||0);
    const ordinal=Number($('#chiefOrdinal')?.value||0);
    const user = users.find(item => Number(item.id)===selectedId);
    if (!user) return alert('목록에서 유저를 선택하세요.');
    if (!Number.isSafeInteger(ordinal)||ordinal<1||ordinal>9999) return alert('족장 대수는 1~9999 범위의 정수로 입력하세요.');
    if (!confirm(`${user.nickname} 님을 제${ordinal}대 족장으로 지금부터 7일간 임명할까요?`)) return;
    const button = $('#chiefAppointBtn');
    button.disabled = true;
    try {
      await api('admin/chief', { method: 'POST', body: JSON.stringify({ userId: user.id, ordinal }) });
      alert(`제${ordinal}대 족장 임명이 완료되었습니다.`);
      await load();
    } catch (error) {
      alert(error.message);
      button.disabled = false;
    }
  }

  const boot = () => {
    install();
    setTimeout(install, 250);
    setTimeout(install, 1000);
  };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot, { once: true });
  else boot();
})();
