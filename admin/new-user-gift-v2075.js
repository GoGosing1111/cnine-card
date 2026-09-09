(() => {
  const $ = selector => document.querySelector(selector);
  const token = () => localStorage.getItem('cnine_admin_token') || sessionStorage.getItem('cnine_admin_token') || '';
  const date = value => value ? new Date(/Z|[+]\d\d:\d\d$/.test(value) ? value : value.replace(' ', 'T') + 'Z').toLocaleString('ko-KR', { timeZone: 'Asia/Seoul', hour12: false }) : '확인 불가';
  let serial = 0, currentUser = 0, state = null, busy = false;
  async function api(userId, body) {
    const response = await fetch(`/api/admin/users/new-user-gift${body ? '' : '?userId=' + userId}`, {
      method: body ? 'POST' : 'GET', cache: 'no-store', headers: { authorization: 'Bearer ' + token(), 'content-type': 'application/json' },
      ...(body ? { body: JSON.stringify({ ...body, userId }) } : {}), signal: AbortSignal.timeout(25000),
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || '기프트 박스 정보를 확인하지 못했습니다.');
    return data;
  }
  function activeUser() { return Number($('#selectedUserId')?.value || 0); }
  async function refresh(force = false) {
    const userId = activeUser();
    if (!$('#userDialog')?.open || !userId || busy || (!force && currentUser === userId)) return;
    currentUser = userId; state = null;
    const run = ++serial, button = $('#newGiftIssue'); button.disabled = true;
    $('#newGiftState').textContent = '가입일·2차 인증·1회 지급 이력을 확인 중입니다.';
    $('#newGiftRewards').innerHTML = ''; $('#newGiftDates').textContent = ''; $('#newGiftError').textContent = '';
    try {
      const data = await api(userId);
      if (run !== serial || activeUser() !== userId) return;
      state = data;
      $('#newGiftState').classList.toggle('blocked', !data.canIssue);
      $('#newGiftState').textContent = data.catalogError || (!data.available ? '기프트 박스 지급이 중지되어 있습니다.' : data.eligibility.message);
      $('#newGiftDates').textContent = `숲켓몬 가입: ${date(data.eligibility.joinedAt)} · 지급 가능 기한: ${date(data.eligibility.deadline)} (KST)${data.receipt ? ' · 지급: ' + date(data.receipt.issuedAt) : ''}`;
      $('#newGiftRewards').innerHTML = window.NewUserGiftV2075.rewardsHtml(data.rewards);
      button.disabled = !data.canIssue;
      button.textContent = data.receipt ? (data.receipt.status === 'OPENED' ? '개봉 완료 · 재지급 불가' : '지급 완료 · 재지급 불가') : '기프트 박스 1개 지급';
    } catch (error) { if (run === serial && activeUser() === userId) $('#newGiftError').textContent = error.message; }
  }
  async function issue() {
    if (busy || !state?.canIssue || activeUser() !== currentUser) return;
    const userId = currentUser, reason = $('#newGiftReason').value.trim();
    if (!reason) { $('#newGiftError').textContent = '지급 사유를 입력하세요.'; return; }
    if (!confirm(`${state.user.nickname} 계정에 신규유저 기프트 박스를 1개 지급할까요?\n계정 및 2차 인증 계정당 평생 1회입니다.\n기존 덱·장비 장착은 유지됩니다.`)) return;
    busy = true; $('#newGiftIssue').disabled = true; $('#newGiftError').textContent = '';
    let errorMessage = '';
    try {
      const result = await api(userId, { requestId: crypto.randomUUID(), reason });
      if (activeUser() === userId) $('#newGiftState').textContent = result.replayed ? '이미 지급한 계정입니다. 추가 지급하지 않았습니다.' : '박스 1개 지급 완료. 유저가 인벤토리에서 개봉하면 보상 전체를 받습니다.';
    } catch (error) { errorMessage = error.message; }
    finally { busy = false; currentUser = 0; await refresh(true); if (errorMessage && activeUser() === userId) $('#newGiftError').textContent = errorMessage; }
  }
  function mount() {
    const detail = $('#userDetail'), dialog = $('#userDialog');
    if (!detail || !dialog || $('#newGiftBlock')) return;
    detail.insertAdjacentHTML('afterend', '<section id="newGiftBlock" class="actionBlock new-gift-panel"><p class="new-gift-kicker">VERIFIED NEW PLAYER · ONE TIME</p><h3>신규유저 기프트 박스</h3><p>숲켓몬 가입 후 7일 이내 + 2차 인증(WAGO / PLAY DK) 완료 필수.<br>계정 초기화·인증 해제·재가입으로 수령 횟수가 초기화되지 않습니다.</p><div id="newGiftState" class="new-gift-state" role="status">유저를 선택하세요.</div><small id="newGiftDates"></small><div id="newGiftRewards"></div><label>지급 사유<input id="newGiftReason" maxlength="160" value="신규유저 7일 기프트 박스" aria-label="기프트 박스 지급 사유"></label><button id="newGiftIssue" class="new-gift-primary" type="button" disabled>기프트 박스 1개 지급</button><button id="newGiftRefresh" class="new-gift-secondary" type="button">조건 다시 확인</button><p id="newGiftError" class="new-gift-error" role="alert"></p><small>지급 시점의 공개·활성 보상 목록을 저장합니다. 개봉 기한은 없으며, 지급 당시의 2차 인증을 유지해야 합니다. 더 높은 기존 강화와 덱·장착 상태는 보존합니다.</small></section>');
    $('#newGiftIssue').onclick = issue;
    $('#newGiftRefresh').onclick = () => refresh(true);
    new MutationObserver(() => refresh()).observe(detail, { childList: true, subtree: true });
    new MutationObserver(() => { if (dialog.open) refresh(true); else { ++serial; currentUser = 0; state = null; } }).observe(dialog, { attributes: true, attributeFilter: ['open'] });
    refresh();
  }
  if (document.readyState === 'loading') addEventListener('DOMContentLoaded', mount, { once: true }); else mount();
})();
