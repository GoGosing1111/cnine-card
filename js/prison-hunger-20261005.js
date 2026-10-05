(function () {
  'use strict';
  let current = null, pendingMeal = null, busy = false, death = null, clock = null;
  const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' }[c]));
  const remaining = hunger => Math.max(0, Math.ceil((Number(hunger?.deadlineAt || 0) - Date.now() - Number(current?.serverOffsetMs || 0)) / 1000));
  const duration = seconds => `${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`;
  const foodIcon = '<svg viewBox="0 0 64 64" aria-hidden="true"><path d="M9 36h46l-5 15H14L9 36Zm7-5h32M20 22c-6-7 6-8 0-15m12 15c-6-7 6-8 0-15m12 15c-6-7 6-8 0-15M8 56h48"/></svg>';

  function panel(inmate, state) {
    current = state;
    const h = inmate?.hunger;
    if (!h) return '<section class="prison-ration" id="prisonHungerPanel"><div class="prison-ration-icon" aria-hidden="true">' + foodIcon + '</div><div class="prison-ration-copy"><small>OUTSIDE MEAL</small><h2>사식 반입 대기</h2><p>일반 감옥 수감자에게 방문객이 식사를 전달할 수 있습니다.</p></div></section>';
    const secs = remaining(h), starved = h.starved || secs === 0, ratio = Math.min(100, secs / 1800 * 100);
    const mine = Number(inmate.userId) === Number(state.viewer?.id || loadUser()?.serverUserId || 0);
    const allowed = state.canSendMeal === true && !mine;
    return `<section class="prison-ration ${starved ? 'is-starved' : secs <= 300 ? 'is-critical' : ''}" id="prisonHungerPanel">
      <div class="prison-ration-icon" aria-hidden="true">${foodIcon}</div>
      <div class="prison-ration-copy"><small>OUTSIDE MEAL / 30 MIN</small><h2>${esc(inmate.nickname)} <span>사식</span></h2><p>${h.lastSender ? `마지막 전달 · ${esc(h.lastSender)}` : '방문객의 사식을 기다리고 있습니다.'}</p></div>
      <div class="prison-ration-clock"><small>${starved ? '굶주림 상태' : '굶주림까지'}</small><strong data-prison-meal-clock>${starved ? '사망' : duration(secs)}</strong></div>
      <div class="prison-ration-meter"><i style="width:${ratio}%" data-prison-meal-meter></i></div>
      <p class="prison-ration-rule">30분 동안 사식을 받지 못하면 사망 화면이 표시됩니다.<br>사망 후에도 형기는 유지됩니다.</p>
      <button type="button" class="prison-ration-send" data-prison-meal ${!allowed || busy ? 'disabled' : ''}><span>${busy ? '전달 확인 중' : allowed ? '사식 1회 보내기' : '방문객만 전달 가능'}</span><b>100억 코인 <i aria-hidden="true">↗</i></b></button>
      <p class="prison-ration-note">받은 시점부터 30분 · 시간 중첩 없음 · 포로수용소 제외</p>
      <p id="prisonMealNotice" class="prison-meal-notice" role="status"></p>
    </section>`;
  }

  function paint(state) {
    current = state;
    const target = document.getElementById('prisonHungerPanel');
    const inmate = state.inmates?.find(row => Number(row.userId) === Number(state.selectedInmateId)) || state.inmates?.[0];
    if (target) target.outerHTML = panel(inmate, state);
    if (state.incarcerated && state.facility === 'PRISON' && state.hunger?.deathPending) showDeath(state.hunger);
    else if (!state.incarcerated || state.facility !== 'PRISON') closeDeath();
  }

  function tick() {
    if (!document.getElementById('prisonView')) return;
    const inmate = current?.inmates?.find(row => Number(row.userId) === Number(current.selectedInmateId)) || current?.inmates?.[0], h = inmate?.hunger;
    if (!h) return;
    const secs = remaining(h), label = document.querySelector('[data-prison-meal-clock]'), meter = document.querySelector('[data-prison-meal-meter]');
    // Countdown is presentation only. The death screen waits for the server's persisted event.
    if (label) label.textContent = h.starved ? '사망' : secs ? duration(secs) : '확인 중';
    if (meter) meter.style.width = `${Math.min(100, secs / 1800 * 100)}%`;
    document.getElementById('prisonHungerPanel')?.classList.toggle('is-critical', !h.starved && secs <= 300);
  }

  function notice(message) { const node = document.getElementById('prisonMealNotice'); if (node) node.textContent = message; }
  function showDeath(hunger) {
    const key = `${hunger.caseId}:${hunger.diedAt}`;
    if (death?.key === key && death.element.isConnected) return;
    closeDeath();
    const previousFocus = document.activeElement, overlay = document.createElement('div');
    overlay.className = 'prison-starvation-overlay';
    overlay.setAttribute('role', 'dialog'); overlay.setAttribute('aria-modal', 'true'); overlay.setAttribute('aria-labelledby', 'prisonStarvationTitle');
    overlay.innerHTML = window.PrisonDeathGame?.starvationView?.() || '<section class="death-game-lock"><h1 id="prisonStarvationTitle">사망하였습니다</h1><p>사식을 받지 못했습니다. 기존 수감은 유지됩니다.</p><button data-starvation-ack>감옥으로 돌아가기</button><p data-starvation-notice role="status"></p></section>';
    document.body.append(overlay);
    const prison = document.getElementById('prisonView'); if (prison) prison.inert = true;
    death = { key, element: overlay, previousFocus, prison, pending: false };
    const button = overlay.querySelector('[data-starvation-ack]');
    button.addEventListener('click', async () => {
      if (!death || death.pending) return;
      const entry = death; entry.pending = true; button.disabled = true;
      try {
        const data = await apiRequest('prison/hunger/ack', { method: 'POST', body: JSON.stringify({ caseId: hunger.caseId, diedAt: hunger.diedAt }) });
        if (death !== entry) return;
        closeDeath(); applyPrisonStatus(data.state?.prison || {}, data.state || {});
        if (!isPrisonLocked()) { stopPrisonWatch(); renderShell('buy'); } else syncPrisonDom();
      } catch (error) { if (death === entry) overlay.querySelector('[data-starvation-notice]').textContent = error.message || '다시 확인해 주세요.'; }
      finally { entry.pending = false; button.disabled = false; }
    });
    overlay.addEventListener('keydown', event => { if (event.key === 'Tab') { event.preventDefault(); button.focus(); } if (event.key === 'Escape') { event.preventDefault(); button.click(); } });
    button.focus();
  }

  function closeDeath() {
    if (!death) return;
    const previous = death; death = null; previous.element.remove(); if (previous.prison) previous.prison.inert = false;
    if (previous.previousFocus?.isConnected) previous.previousFocus.focus({ preventScroll: true });
  }

  async function send(inmate, state) {
    if (busy || !inmate?.hunger || !state.canSendMeal) return;
    const h = inmate.hunger, key = `${inmate.userId}:${h.caseId}:${h.mealVersion}`;
    // Keep the same receipt for uncertain responses. A second click cannot purchase a second meal.
    if (!pendingMeal || pendingMeal.key !== key) {
      if (!confirm(`${inmate.nickname}에게 사식을 보내시겠습니까?\n100억 코인이 차감되며, 받은 시점부터 30분을 다시 계산합니다.\n남은 식사 시간은 중첩되지 않습니다.`)) return;
      pendingMeal = { key, body: { inmateUserId: Number(inmate.userId), caseId: h.caseId, deadlineAt: h.deadlineAt, mealVersion: h.mealVersion, requestId: prisonRequestId('PRISON_MEAL') } };
    }
    busy = true; paint(state);
    try {
      const data = await apiRequest('prison/meal', { method: 'POST', body: JSON.stringify(pendingMeal.body) });
      pendingMeal = null; applyPrisonStatus(data.state?.prison || {}, data.state || {}); syncPrisonDom();
      notice(data.replayed ? '전달 완료된 사식입니다. 추가 차감되지 않았습니다.' : '사식을 전달했습니다. 다음 식사까지 30분입니다.');
    } catch (error) { notice(error.message || '전달 결과를 다시 확인해 주세요.'); }
    finally { busy = false; const button = document.querySelector('[data-prison-meal]'); if (button) { button.disabled = !current?.canSendMeal; button.querySelector('span').textContent = current?.canSendMeal ? '사식 1회 보내기' : '방문객만 전달 가능'; } }
  }

  function stop() { clearInterval(clock); clock = null; current = null; closeDeath(); }
  function bind(state) { clearInterval(clock); current = state; clock = setInterval(tick, 1000); paint(state); }
  window.PrisonHunger = Object.freeze({ panel, paint, bind, send, stop });
})();
