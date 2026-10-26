export function handleGameBack() {
  'use strict';
  // Called only by the Android Back button in the trusted game WebView.
  // Reuse the game's own close/navigation handlers, including their busy and
  // unsaved-deck guards. Never remove a modal or finalize a battle ourselves.
  if (location.origin !== 'https://cnine-card.pages.dev') return 'page';
  const visible = element => element && !element.hidden && element.getClientRects().length > 0 && getComputedStyle(element).visibility !== 'hidden';
  const roots = [document];
  for (const host of document.querySelectorAll('soop-adventure-lobby')) {
    if (host.shadowRoot) roots.push(host.shadowRoot);
  }
  for (const root of roots.slice().reverse()) {
    const dialog = [...root.querySelectorAll('dialog[open]')].reverse().find(visible);
    if (!dialog) continue;
    // Native Escape first dispatches a cancel event. Respect preventDefault.
    if (dialog.dispatchEvent(new Event('cancel', { cancelable: true }))) dialog.close();
    return 'handled';
  }
  const overlays = [...document.querySelectorAll('#modal.show, #modal.open, .modal.show, .modal.open, [role="dialog"][aria-modal="true"]')];
  const overlay = overlays.reverse().find(visible);
  if (overlay) {
    const close = [...overlay.querySelectorAll('button, [role="button"]')].find(button => {
      if (!visible(button)) return false;
      const label = button.getAttribute('aria-label') || button.getAttribute('title') || button.textContent.trim();
      return button.matches('[data-v21-close], #closeDetail, .icon-close') || /^(닫기|창 닫기|close|×|✕|✖|x)$/i.test(label);
    });
    if (close && !close.disabled && close.getAttribute('aria-disabled') !== 'true') close.click();
    // A busy or non-dismissible operation must not fall through to app exit.
    return 'handled';
  }
  const shell = window.SoopketmonV21ExactShell;
  if (shell && typeof shell.navigate === 'function' && document.querySelector('#app main.page')) {
    if (shell.currentRoute !== 'home') {
      Promise.resolve(shell.navigate('home')).catch(() => {});
      return 'handled';
    }
    return 'home';
  }
  return 'page';
}