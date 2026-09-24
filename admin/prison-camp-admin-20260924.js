(() => {
  'use strict';
  const originalOpenUser = window.openUser;
  if (typeof originalOpenUser !== 'function' || typeof api !== 'function') return;
  const $camp = id => document.getElementById(id);
  let selected = 0, revision = 0, current = null, busy = false;
  const attempts = new Map();
  const time = value => new Date(value.replace(' ', 'T') + 'Z').toLocaleString('ko-KR', { timeZone: 'Asia/Seoul', hour12: false });
  const escape = value => String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));

  function mount() {
    if ($camp('campAdminBlock')) return;
    const anchor = $camp('prisonAdminBlock') || document.querySelector('#userDialog .actionBlock');
    if (!anchor) return;
    anchor.insertAdjacentHTML('beforebegin', `<section class="actionBlock campAdminBlock" id="campAdminBlock">
      <div class="campAdminHeading"><div><small>DETENTION CONTROL</small><h3>포로수용소</h3></div><span>OWNER 전용</span></div>
      <p class="muted">행정부 감옥과 별도인 공동 수용소로 보냅니다. 수감 중에는 일반 게임 이용이 제한됩니다.</p>
      <div id="campAdminState" class="campAdminState" role="status" aria-live="polite"></div>
      <div class="two"><label class="field"><span>수감 시간 (분)</span><input id="campAdminMinutes" type="number" min="1" max="10080" step="1" value="120"></label>
      <label class="field"><span>수감·석방 사유</span><input id="campAdminReason" maxlength="200" placeholder="처리 사유를 입력하세요"></label></div>
      <p class="muted campAdminHelp">1분~7일 · 형기 종료 시 자동 석방 · 이미 수감 중이면 중복 수감 불가</p>
      <div class="two"><button type="button" class="danger" id="campAdminJail">포로수용소 수감</button><button type="button" id="campAdminRefresh">상태 새로고침</button></div>
      <p id="campAdminMessage" class="campAdminMessage" role="status" aria-live="polite"></p>
    </section>`);
    $camp('campAdminJail').onclick = () => submit('JAIL');
    $camp('campAdminRefresh').onclick = () => refresh();
    $camp('campAdminState').onclick = event => {
      const button = event.target.closest('[data-camp-release]');
      if (button) void submit('RELEASE', button.dataset.campRelease);
    };
  }

  function controls() {
    $camp('campAdminJail').disabled = busy || !current || current.user.status !== 'ACTIVE' || !!current.prison || current.camps.length > 0;
    $camp('campAdminRefresh').disabled = busy;
    for (const node of document.querySelectorAll('#campAdminBlock input, #campAdminBlock [data-camp-release]')) node.disabled = busy;
  }

  function render() {
    const panel = $camp('campAdminState');
    panel.classList.toggle('is-active', !!current?.camps.length || !!current?.prison);
    if (!current) panel.innerHTML = '<b>상태를 확인할 수 없습니다.</b><span>새로고침 후 다시 시도하세요.</span>';
    else {
      const identity = `<b>${escape(current.user.nickname)} <small>#${current.user.id}</small></b>`;
      const prison = current.prison ? `<div class="campAdminEntry"><strong>행정부 감옥 수감 중</strong><span>${escape(current.prison.reason)} · ${escape(time(current.prison.jailed_until))} 종료</span></div>` : '';
      const camps = current.camps.map(camp => `<div class="campAdminEntry"><strong>${camp.canRelease ? 'CMS 수동 수감' : escape(camp.title)}</strong>
        <span>${escape(camp.reason)}</span><span>${Math.ceil(camp.remainingSeconds / 60).toLocaleString()}분 남음 · ${escape(time(camp.jailedUntil))} 자동 석방</span>
        ${camp.canRelease ? `<button type="button" data-camp-release="${escape(camp.eventId)}">이 수감 건 석방</button>` : '<small>클랜전·쿠데타·사망 제한은 이 화면에서 해제하지 않습니다.</small>'}</div>`).join('');
      panel.innerHTML = identity + prison + camps + (!prison && !camps ? `<span>${current.user.status === 'ACTIVE' ? '현재 수감 기록 없음 · 수감 가능' : '이용정지 상태 · 수감 불가'}</span>` : '');
    }
    controls();
  }

  async function refresh() {
    const version = ++revision, userId = selected;
    current = null; controls();
    $camp('campAdminState').textContent = '수감 기록 확인 중…';
    try {
      const data = await api(`admin/prison-camp/status?userId=${userId}`);
      if (version !== revision || selected !== userId) return;
      current = data; render();
    } catch (error) {
      if (version !== revision || selected !== userId) return;
      render(); $camp('campAdminMessage').textContent = error.message || '수감 기록 조회에 실패했습니다.';
    }
  }

  async function submit(action, eventId = '') {
    if (busy || !current || Number(current.user.id) !== selected) return;
    const reason = $camp('campAdminReason').value.trim(), durationMinutes = Number($camp('campAdminMinutes').value);
    if (!reason) { $camp('campAdminMessage').textContent = '처리 사유를 입력하세요.'; $camp('campAdminReason').focus(); return; }
    if (action === 'JAIL' && (!Number.isInteger(durationMinutes) || durationMinutes < current.limits.minMinutes || durationMinutes > current.limits.maxMinutes)) {
      $camp('campAdminMessage').textContent = '수감 시간은 1~10,080분 사이의 정수로 입력하세요.'; return;
    }
    const userId = selected, nickname = current.user.nickname;
    const body = { action, userId, expectedNickname: nickname, reason, ...(action === 'JAIL' ? { durationMinutes } : { eventId }) };
    const signature = JSON.stringify([state.admin?.id, body]);
    if (!confirm(`${nickname} (#${userId})\n${action === 'JAIL' ? `포로수용소에 ${durationMinutes.toLocaleString()}분 수감합니다. 일반 게임 이용이 제한됩니다.` : '선택한 CMS 수감 기록만 석방합니다. 다른 수감·사망 제한은 유지됩니다.'}\n사유: ${reason}\n진행할까요?`)) return;
    // Keep the same request ID after ambiguous network errors, including a page reload.
    let requestId = attempts.get(signature);
    if (!requestId) { try { const saved = JSON.parse(sessionStorage.getItem('cnine_camp_admin_pending') || 'null'); if (saved?.signature === signature) requestId = saved.requestId; } catch {} }
    if (!requestId) requestId = crypto.randomUUID();
    attempts.set(signature, requestId);
    try { sessionStorage.setItem('cnine_camp_admin_pending', JSON.stringify({ signature, requestId })); } catch {}
    busy = true; controls();
    const version = ++revision;
    $camp('campAdminMessage').textContent = '처리 중…';
    try {
      const data = await api('admin/prison-camp/action', { method: 'POST', body: JSON.stringify({ ...body, requestId }) });
      attempts.delete(signature);
      try { const saved = JSON.parse(sessionStorage.getItem('cnine_camp_admin_pending') || 'null'); if (saved?.requestId === requestId) sessionStorage.removeItem('cnine_camp_admin_pending'); } catch {}
      if (selected !== userId || version !== revision) return;
      current = data.state; render();
      $camp('campAdminMessage').textContent = action === 'JAIL' ? `수감 완료 · ${time(data.result.jailedUntil)} 자동 석방` : '선택한 수감 기록을 석방했습니다.';
    } catch (error) {
      if (selected !== userId || version !== revision) return;
      await refresh();
      if (selected === userId) $camp('campAdminMessage').textContent = `${error.message || '응답을 확인하지 못했습니다.'} 같은 내용으로 다시 시도해도 중복 적용되지 않습니다.`;
    } finally { busy = false; if ($camp('campAdminBlock')) controls(); }
  }

  window.openUser = function (id) {
    originalOpenUser.apply(this, arguments); mount();
    const block = $camp('campAdminBlock'); if (!block) return;
    block.hidden = state.role !== 'OWNER'; if (block.hidden) return;
    selected = Number(id); current = null;
    $camp('campAdminReason').value = ''; $camp('campAdminMinutes').value = '120';
    $camp('campAdminMessage').textContent = '';
    void refresh();
  };
})();
