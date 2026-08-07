(() => {
  'use strict';

  const $ = selector => document.querySelector(selector);
  const esc = value => String(value ?? '').replace(/[&<>'"]/g, char => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;'
  })[char]);

  async function api(path, options = {}) {
    const token = localStorage.getItem('cnine_admin_token') || sessionStorage.getItem('cnine_admin_token') || '';
    const response = await fetch(`../api/${path}?_=${Date.now()}`, {
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
            <p>와이고수 투표 결과를 반영해 7일 임기의 족장을 지정합니다.</p>
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
              <small>CURRENT CHIEF</small>
              <h3>${chief.active ? esc(chief.nickname) : '공석'}</h3>
              <p>${chief.active ? `${new Date(chief.endsAt).toLocaleString('ko-KR')}까지 · ${Math.ceil(chief.remainingMs / 3600000)}시간 남음` : '현재 부임 중인 족장이 없습니다.'}</p>
              ${chief.active ? `<div class="chief-admin-usage">
                <span>오늘 버닝 ${chief.usage.burningToday}/1</span>
                <span>오늘 하이퍼 ${chief.usage.hyperToday}/1</span>
                <span>주간 할인 ${chief.usage.discountThisWeek}/2</span>
                <span>탑 초기화 ${chief.usage.towerResetUsed ? '사용' : '미사용'}</span>
              </div>` : ''}
            </div>
          </div>
          <div class="chief-admin-appoint">
            <h3>와이고수 투표 결과 반영</h3>
            <p>지정 즉시 새 7일 임기가 시작되고 첫 선출 팝업이 전체 유저에게 공개됩니다.</p>
            <label class="field">
              <span>족장 유저 선택</span>
              <input id="chiefUserSearch" list="chiefUserList" placeholder="닉네임 또는 유저 ID">
              <datalist id="chiefUserList">${users.map(user => `<option value="${esc(user.nickname)} · #${user.id}"></option>`).join('')}</datalist>
            </label>
            <button type="button" id="chiefAppointBtn">7일 임기 족장으로 임명</button>
          </div>
        </div>`;
      $('#chiefAppointBtn').onclick = () => appoint(users);
    } catch (error) {
      root.innerHTML = `<div class="inlineNotice error">${esc(error.message)}</div>`;
    }
  }

  async function appoint(users) {
    const value = $('#chiefUserSearch')?.value || '';
    const user = users.find(item => value === `${item.nickname} · #${item.id}`)
      || users.find(item => String(item.id) === value.trim() || item.nickname === value.trim());
    if (!user) return alert('목록에서 유저를 선택하세요.');
    if (!confirm(`${user.nickname} 님을 지금부터 7일간 족장으로 임명할까요?`)) return;
    const button = $('#chiefAppointBtn');
    button.disabled = true;
    try {
      await api('admin/chief', { method: 'POST', body: JSON.stringify({ userId: user.id }) });
      alert('족장 임명이 완료되었습니다.');
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
