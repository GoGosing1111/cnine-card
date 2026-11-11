(function soopketmonV21RewardsPresentation(global) {
  'use strict';

  const VERSION = '20261111-attendance';
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
    enhanceMessages(root);
    return true;
  }

  function schedule() {
    if (frame || !document.getElementById('claimAllMessages')) return;
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
