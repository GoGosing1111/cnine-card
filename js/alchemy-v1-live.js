/* SOOPKETMON ALCHEMY V1 — production mount adapter.
 * The standalone review page and authenticated client share alchemy-v1.js.
 * This adapter only supplies the live API, current player and route cleanup.
 */
(() => {
  'use strict';

  let controller = null;

  function destroy() {
    try { controller?.destroy?.(); } catch (_) {}
    controller = null;
  }

  function request(path, init = {}) {
    if (typeof window.apiRequest !== 'function') return Promise.reject(new Error('서버 API 연결을 찾을 수 없습니다.'));
    return window.apiRequest(path, init, { ttl: 0, timeoutMs: String(path) === 'alchemy/transmute' ? 30000 : 15000 });
  }

  function profile() {
    try { return typeof window.loadUser === 'function' ? window.loadUser() : null; }
    catch (_) { return null; }
  }

  function view() {
    return '<section class="alchemy-live-view"><div id="alchemyLiveV1" class="alchemy-v1-root"><div class="alchemy-loading"><i></i><strong>연금 공방 연결 중</strong><span>보유 자산과 운영 연성식을 확인합니다.</span></div></div></section>';
  }

  function bind() {
    const root = document.getElementById('alchemyLiveV1');
    if (!root || !window.SoopketmonAlchemyV1?.create) return;
    destroy();
    const user = profile() || { id: 'guest', nickname: '플레이어' };
    controller = window.SoopketmonAlchemyV1.create(root, {
      request,
      profile: user,
      pendingStorageKey: `cnine_pending_alchemy_v1:${String(user.id || user.key || 'player')}`
    });
  }

  window.addEventListener('cnine:route-will-change', event => {
    if (String(event?.detail?.from || '') === 'alchemy') destroy();
  });

  window.alchemyView = view;
  window.bindAlchemyView = bind;
  window.AlchemyV1Live = { bind, destroy };
})();
