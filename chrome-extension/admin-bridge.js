(() => {
  const readToken = () =>
    localStorage.getItem('cnine_admin_token') ||
    sessionStorage.getItem('cnine_admin_token') ||
    '';

  function sync() {
    const token = String(readToken()).trim();
    if (!token) return;
    chrome.runtime.sendMessage({ type: 'CNINE_SAVE_ADMIN_TOKEN', token }, () => {
      void chrome.runtime.lastError;
    });
  }

  sync();
  window.addEventListener('storage', sync);
  window.addEventListener('focus', sync);
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) sync();
  });
  setInterval(sync, 2000);
})();
