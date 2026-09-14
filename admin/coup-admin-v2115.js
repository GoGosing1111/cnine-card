(function () {
  'use strict';
  const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  let section, button, state, busy = false;
  async function api(path = '', body) {
    const token = localStorage.getItem('cnine_admin_token') || sessionStorage.getItem('cnine_admin_token') || '';
    const res = await fetch('/api/admin/coup' + path, { method: body ? 'POST' : 'GET', cache: 'no-store',
      headers: { authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, ...(body ? { body: JSON.stringify(body) } : {}) });
    const data = await res.json(); if (!res.ok) throw new Error(data.error || '요청에 실패했습니다.'); return data;
  }
  function message(text, error = false) { const n = section.querySelector('[data-coup-admin-message]'); n.textContent = text; n.style.color = error ? '#ef9898' : '#bcd897'; }
  function render() {
    const r = state.round, t = state.trial, cfg = state.settings;
    section.querySelector('[data-coup-admin-round]').innerHTML = `<h3>쿠데타 운영</h3><p>${r ? `${esc(r.chiefName)} · ${esc(({ RECRUITING:'참가 모집 중',ACTIVE:'전투 중',SETTLING:'정산 중',FINISHED:'종료',CANCELLED:'취소' })[r.status])}` : '개설된 쿠데타가 없습니다.'}</p>
      <p>족장팀 ${state.members.filter(m => m.side === 'CHIEF').length}명 · 반란군 ${state.members.filter(m => m.side === 'REBEL').length}명</p>
      ${r?.status === 'ACTIVE' ? `<p>전투 종료 ${new Date(r.endsAt).toLocaleString('ko-KR')}<br>이번 회차: 전투 ${r.settings.battleMinutes}분 · 재판 ${r.settings.trialMinutes}분</p>` : ''}
      <div class="coup-admin-actions">${!r || ['FINISHED','CANCELLED'].includes(r.status) ? `<button data-coup-admin="open" ${t?.status === 'OPEN' ? 'disabled' : ''}>새 참가 모집 개설</button>` : r.status === 'RECRUITING' ? '<button data-coup-admin="start">전투 시작</button><button class="ghost" data-coup-admin="cancel">모집 취소</button>' : ''}<button class="ghost" data-coup-admin="reload">현황 새로고침</button></div>
      <small>양 진영에 최소 1명씩 참가해야 시작할 수 있습니다. 시작된 전투를 강제 취소하거나 승자를 지정할 수 없습니다.</small>`;
    section.querySelector('[data-coup-nuclear]').checked = state.skillSettings?.nuclearEnabled === true;
    section.querySelector('[data-coup-nuclear-state]').textContent = state.skillSettings?.nuclearEnabled === true ? 'ON · 족장 발동 가능' : 'OFF · 잠금';
    for (const [key, value] of Object.entries(cfg)) { const n = section.querySelector(`[name="${key}"]`); if (n) n.value = value; }
    section.querySelector('[data-coup-admin-trial]').innerHTML = `<h3>국민 재판 현황</h3>${t ? `<p>${esc(t.defendantName)} · ${t.status === 'OPEN' ? '투표 진행 중 · 직무정지' : t.status === 'REMOVED' ? '파면 확정' : '복직 판결'}</p><p>복직 <b>${t.reinstate}</b>표 · 파면 <b>${t.remove}</b>표 / 유권자 ${t.electorate}명</p><p>마감 ${new Date(t.endsAt).toLocaleString('ko-KR')}</p>` : '<p>재판 기록이 없습니다.</p>'}<small>유저 투표로만 판결합니다. 마감 시 파면 표가 더 많으면 파면, 동률·무투표는 복직합니다. 복직 시 임기를 연장하지 않습니다.</small>`;
  }
  async function load() { try { state = await api(); render(); message('현황을 확인했습니다.'); } catch (e) { message(e.message, true); } }
  async function action(name) {
    if (busy) return;
    if (name === 'reload') return load();
    const labels = { open:'새 쿠데타 참가 모집을 개설', start:'쿠데타 전투를 시작', cancel:'참가 모집을 취소' };
    if (!confirm(`${labels[name]}할까요?${name === 'start' ? '\n확정된 전투 결과에 따라 코인 차감·수감·재판이 자동 적용됩니다.' : ''}`)) return;
    busy = true; section.querySelectorAll('[data-coup-admin]').forEach(b => { b.disabled = true; });
    try { state = await api('/' + name, { roundId: state.round?.id }); render(); message('운영 설정을 반영했습니다.'); }
    catch (e) { message(e.message, true); render(); } finally { busy = false; }
  }
  function install() {
    const nav = document.getElementById('nav'), main = document.querySelector('main'); if (!nav || !main || document.getElementById('view-coup')) return;
    button = document.createElement('button'); button.type = 'button'; button.dataset.view = 'coup'; button.textContent = '쿠데타 · 재판'; nav.querySelector('[data-view="chief"]')?.insertAdjacentElement('afterend', button); if (!button.isConnected) nav.append(button);
    section = document.createElement('section'); section.className = 'view'; section.id = 'view-coup'; section.hidden = true;
    section.innerHTML = `<div class="sectionIntro"><div><small>IMPERIAL PALACE</small><h2>쿠데타 · 국민 재판</h2><p>황궁 영토전과 유저 투표에 의한 족장 복직·파면</p></div></div><div class="coup-admin-grid"><div class="panel" data-coup-admin-round>현황 확인 중</div><form class="panel" data-coup-admin-settings><h3>별도 운영 시간</h3><p>저장한 값은 다음 모집부터 적용됩니다. 기존 영토전 시간은 변경하지 않습니다.</p><div class="coup-admin-fields"><label>전투 시간 (분)<input type="number" name="battleMinutes" min="1" max="10080" required></label><label>재판 투표 시간 (분)<input type="number" name="trialMinutes" min="1" max="10080" required></label><label>출격 대기 (초)<input type="number" name="attackCooldownSeconds" min="5" max="300" required></label><label>거점별 진영 체력<input type="number" name="siegeHp" min="1000" max="100000000" required></label></div><button type="submit">다음 회차 설정 저장</button></form><div class="panel" data-coup-admin-trial></div><div class="panel"><h3>패배 정산 규칙</h3><p>족장팀: 족장과 참가자 전원 포로수용소 8시간 수감. 족장 직무정지 및 재판 개시.</p><p>반란군: 양수 코인 20% 차감(1코인 미만 버림). 0코인은 -30억, 기존 음수는 30억 추가 차감.</p><p>재판 개시 당시 활성 USER·OWNER 계정 1표. 수감 중 투표 가능. 형기와 재판 결과는 별도로 적용됩니다.</p></div></div><p data-coup-admin-message role="status"></p>`;
    section.querySelector('.coup-admin-grid').insertAdjacentHTML('beforeend', '<div class="panel"><h3>족장 전용 스킬</h3><p>야포단 포격: 최대 전선 HP 30% · 30분<br>결사대 결집: 행동력 50 · 1시간</p><label><input type="checkbox" data-coup-nuclear> 원자폭탄 사용 ON</label><p data-coup-nuclear-state>OFF · 잠금</p><p>기본 OFF. OWNER가 직접 저장해야 발동할 수 있습니다. ON/OFF는 현재 회차에도 즉시 적용됩니다.</p><button type="button" data-coup-save-nuclear>원자폭탄 설정 저장</button></div>');
    section.querySelector('[data-coup-save-nuclear]').onclick = async () => {
      if (busy) return;
      const enabled = section.querySelector('[data-coup-nuclear]').checked;
      if (!confirm('원자폭탄을 ' + (enabled ? 'ON으로 개방' : 'OFF로 잠금') + '할까요?')) return;
      busy = true;
      try { state = await api('/skills', { nuclearEnabled: enabled }); render(); message('원자폭탄 설정을 저장했습니다.'); } catch(e) { message(e.message, true); } finally { busy = false; }
    };
    main.append(section);
    button.addEventListener('click', e => { e.stopPropagation(); document.querySelectorAll('.view').forEach(v => { v.hidden = v !== section; }); nav.querySelectorAll('[data-view]').forEach(b => b.classList.toggle('active', b === button)); const title = document.getElementById('pageTitle'); if (title) title.textContent = '쿠데타 · 재판'; void load(); });
    section.addEventListener('click', e => { const b = e.target.closest('[data-coup-admin]'); if (b) void action(b.dataset.coupAdmin); });
    section.querySelector('form').onsubmit = async e => { e.preventDefault(); if (busy) return; busy = true; const submit = e.target.querySelector('[type=submit]'); submit.disabled = true;
      const body = Object.fromEntries([...new FormData(e.target)].map(([key, value]) => [key, Number(value)]));
      try { state = await api('/settings', body); render(); message('다음 모집부터 적용할 설정을 저장했습니다.'); } catch (err) { message(err.message, true); } finally { busy = false; submit.disabled = false; } };
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', install, { once:true }); else install();
})();
