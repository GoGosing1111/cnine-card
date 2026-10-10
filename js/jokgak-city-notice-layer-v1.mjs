// Keep city alerts interactive above modal dialogs without making the game modal.
export function mountCityNoticeLayer(element) {
  const doc = element.ownerDocument;
  let disposed = false, dialogs = [];
  const isModal = node => {
    if (!node?.isConnected || !node.open || node.tagName !== 'DIALOG') return false;
    try { return node.matches(':modal'); } catch { return true; }
  };
  const hide = () => {
    try { if (element.matches(':popover-open')) element.hidePopover(); } catch {}
  };
  const sync = (records = []) => {
    if (disposed || doc.hidden) return;
    dialogs = dialogs.filter(isModal);
    for (const node of doc.querySelectorAll('dialog[open]')) {
      if (isModal(node) && !dialogs.includes(node)) dialogs.push(node);
    }
    for (const record of records) {
      if (record.type === 'attributes' && isModal(record.target)) {
        dialogs = dialogs.filter(node => node !== record.target);
        dialogs.push(record.target);
      }
    }
    const focused = doc.activeElement?.closest?.('dialog[open]');
    if (isModal(focused) && !element.contains(doc.activeElement)) {
      dialogs = dialogs.filter(node => node !== focused);
      dialogs.push(focused);
    }
    // A body-level popover is still inert outside an open modal dialog.
    const host = dialogs.at(-1) || doc.fullscreenElement || doc.body;
    element.classList.toggle('is-inline-notice', typeof element.showPopover !== 'function' && host.tagName === 'DIALOG');
    if (element.parentNode !== host) {
      hide();
      host.append(element);
    }
    if (typeof element.showPopover === 'function') {
      element.setAttribute('popover', 'manual');
      try {
        if (!element.matches(':popover-open')) element.showPopover();
      } catch {
        element.removeAttribute('popover');
      }
    }
  };
  const observer = new MutationObserver(records => {
    const relevant = !element.isConnected || records.some(record =>
      record.type === 'attributes' && record.target.tagName === 'DIALOG' ||
      [...record.addedNodes, ...record.removedNodes].some(node =>
        node.nodeType === 1 && (node.tagName === 'DIALOG' || node.querySelector?.('dialog[open]'))));
    if (relevant) sync(records);
  });
  const wake = () => sync();
  sync();
  observer.observe(doc.body, {childList:true, subtree:true, attributes:true, attributeFilter:['open']});
  doc.addEventListener('fullscreenchange', wake);
  doc.addEventListener('visibilitychange', wake);
  return () => {
    disposed = true;
    observer.disconnect();
    doc.removeEventListener('fullscreenchange', wake);
    doc.removeEventListener('visibilitychange', wake);
    hide();
    element.remove();
  };
}
