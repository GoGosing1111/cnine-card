(function soopketmonV21RewardsPresentation(global) {
  'use strict';

  const VERSION = '21.4.0';
  const ROOT_SELECTOR = '.v21-production-shell[data-soopketmon-v21-shell="approved-v21"]';
  const script = document.currentScript;
  let frame = 0;
  let observer = null;
  let inputGuardInstalled = false;
  let inputViewportFrame = 0;

  function activeRewardInput() {
    const active = document.activeElement;
    return active?.matches?.(`${ROOT_SELECTOR} :is(#couponCode, #verifyWagoName)`) ? active : null;
  }

  function bringRewardInputIntoView(input = activeRewardInput()) {
    if (!input || typeof input.scrollIntoView !== 'function' || inputViewportFrame) return;
    inputViewportFrame = requestAnimationFrame(() => {
      inputViewportFrame = 0;
      if (!input.isConnected) return;
      input.scrollIntoView({ block: 'center', inline: 'nearest', behavior: 'auto' });
    });
  }

  function installInputGuard() {
    if (inputGuardInstalled) return;
    inputGuardInstalled = true;
    document.addEventListener('focusin', event => {
      const input = event.target?.closest?.(`${ROOT_SELECTOR} :is(#couponCode, #verifyWagoName)`);
      if (!input) return;
      input.closest(ROOT_SELECTOR)?.setAttribute('data-v21-input-active', '1');
      bringRewardInputIntoView(input);
    }, true);
    document.addEventListener('focusout', event => {
      const root = event.target?.closest?.(ROOT_SELECTOR);
      if (!root) return;
      global.setTimeout(() => {
        if (!activeRewardInput()) root.removeAttribute('data-v21-input-active');
      }, 120);
    }, true);
    global.visualViewport?.addEventListener('resize', () => bringRewardInputIntoView(), { passive: true });
  }

  function ensureStyle() {
    if (document.getElementById('soopketmonV21MessagesAttendance')) return;
    const link = document.createElement('link');
    link.id = 'soopketmonV21MessagesAttendance';
    link.rel = 'stylesheet';
    link.href = `${script?.src ? new URL('../css/soopketmon-v21-messages-attendance.css', script.src).href : 'css/soopketmon-v21-messages-attendance.css'}?v=${VERSION}`;
    document.head.append(link);
  }

  function numberFrom(text) {
    const match = String(text || '').replace(/,/g, '').match(/\d+/);
    return match ? Math.max(0, Number(match[0]) || 0) : 0;
  }

  function buildAttendanceCycle(panel) {
    if (panel.querySelector('.v21-attendance-cycle')) return;
    const stats = [...panel.querySelectorAll('.attendance-stats span')];
    const streak = numberFrom(stats.find(node => node.textContent.includes('현재 연속'))?.textContent);
    const completedToday = stats.some(node => node.textContent.includes('수령 완료'));
    const nextDay = Math.min(7, Math.max(1, numberFrom(panel.querySelector('.attendance-reward span')?.textContent) || 1));
    const completedThrough = completedToday ? Math.min(7, streak) : Math.min(7, Math.max(0, nextDay - 1));
    const cycle = document.createElement('ol');
    cycle.className = 'v21-attendance-cycle';
    cycle.setAttribute('aria-label', '7일 연속 출석 진행도');
    for (let day = 1; day <= 7; day += 1) {
      const item = document.createElement('li');
      if (day <= completedThrough) item.classList.add('is-complete');
      if (!completedToday && day === nextDay) item.classList.add('is-current');
      item.setAttribute('aria-label', `${day}일차${day <= completedThrough ? ' 완료' : (!completedToday && day === nextDay ? ' 수령 예정' : '')}`);
      const label = document.createElement('span'); label.textContent = 'DAY';
      const value = document.createElement('b'); value.textContent = String(day);
      item.append(label, value); cycle.append(item);
    }
    const claim = panel.querySelector('#claimAttendance');
    if (claim) panel.querySelector('.attendance-copy')?.insertBefore(cycle, claim);
    else panel.querySelector('.attendance-copy')?.append(cycle);
  }

  function enhanceAttendance(root) {
    const panel = root.querySelector('.attendance-panel');
    if (!panel) return;
    panel.dataset.v21RewardUi = 'attendance';
    buildAttendanceCycle(panel);
    const coupon = root.querySelector('.coupon-panel');
    if (coupon) coupon.dataset.v21RewardUi = 'coupon';
    const input = root.querySelector('#couponCode');
    if (input) {
      if (!input.getAttribute('aria-label')) input.setAttribute('aria-label', '쿠폰 코드');
      input.setAttribute('inputmode', 'text');
      input.setAttribute('enterkeyhint', 'done');
      input.setAttribute('autocorrect', 'off');
      input.setAttribute('spellcheck', 'false');
    }
  }

  function enhanceMessages(root) {
    const center = root.querySelector('.message-center');
    if (!center) return;
    center.dataset.v21RewardUi = 'messages';
    const verifyButton = center.querySelector('#openWagoVerify');
    const claimAllButton = center.querySelector('#claimAllMessages');
    const verifyPanel = center.querySelector('#wagoVerifyPanel');
    if (verifyButton && verifyPanel) {
      verifyButton.setAttribute('aria-controls', 'wagoVerifyPanel');
      verifyButton.setAttribute('aria-expanded', String(!verifyPanel.hidden));
    }
    if (claimAllButton) claimAllButton.dataset.v21Operation = 'claim-all';
    center.querySelectorAll('.user-message').forEach(card => {
      const unread = card.classList.contains('unread');
      card.dataset.v21MessageState = unread ? 'unread' : 'read';
      const title = card.querySelector('h3')?.textContent?.trim();
      if (title) card.setAttribute('aria-label', `${unread ? '읽지 않은 메시지' : '읽은 메시지'}: ${title}`);
      if (unread) card.tabIndex = 0;
      else card.removeAttribute('tabindex');
      card.querySelectorAll('[data-claim-message], [data-use-coupon], [data-hide-message]').forEach(button => {
        button.dataset.v21Operation = button.hasAttribute('data-claim-message') ? 'claim' : button.hasAttribute('data-use-coupon') ? 'coupon' : 'delete';
      });
    });
    const verifyName = center.querySelector('#verifyWagoName');
    if (verifyName) {
      if (!verifyName.getAttribute('aria-label')) verifyName.setAttribute('aria-label', 'PLAY DK 닉네임');
      verifyName.setAttribute('autocomplete', 'username');
      verifyName.setAttribute('autocapitalize', 'off');
      verifyName.setAttribute('autocorrect', 'off');
      verifyName.setAttribute('spellcheck', 'false');
      verifyName.setAttribute('inputmode', 'text');
      verifyName.setAttribute('enterkeyhint', 'go');
    }
  }

  function enhance() {
    ensureStyle();
    frame = 0;
    const root = document.querySelector(ROOT_SELECTOR);
    if (!root) return false;
    enhanceAttendance(root);
    enhanceMessages(root);
    return true;
  }

  function schedule() {
    if (frame) return;
    frame = requestAnimationFrame(enhance);
  }

  function start() {
    ensureStyle();
    installInputGuard();
    schedule();
    const app = document.getElementById('app') || document.body;
    observer = new MutationObserver(schedule);
    observer.observe(app, { childList: true, subtree: true });
    document.addEventListener('click', event => {
      if (event.target.closest('#openWagoVerify')) requestAnimationFrame(schedule);
    });
    document.addEventListener('keydown', event => {
      if (event.key !== 'Enter' && event.key !== ' ') return;
      const card = event.target.closest?.(`${ROOT_SELECTOR} .user-message.unread`);
      if (!card || event.target.closest('button, a, input')) return;
      event.preventDefault(); card.click(); requestAnimationFrame(schedule);
    });
  }

  global.SoopketmonV21RewardsPresentation = Object.freeze({ version: VERSION, enhance });
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start, { once: true });
  else start();
})(window);
