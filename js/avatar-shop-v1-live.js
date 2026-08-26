/* SOOPKETMON AVATAR SHOP V1 — production mount adapter.
 * The approved preview and live game use avatar-shop-v1.js verbatim. This
 * adapter only connects it to the authenticated app request and shell routes.
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
    const isCatalog = String(path) === 'avatar/catalog' && String(init.method || 'GET').toUpperCase() === 'GET';
    return window.apiRequest(path, init, isCatalog ? { ttl: 10000, timeoutMs: 12000 } : { timeoutMs: 20000 });
  }

  function profile() {
    try { return typeof window.loadUser === 'function' ? window.loadUser() : null; }
    catch (_) { return null; }
  }

  function view() {
    return '<section id="avatarShopV1" class="avatar-shop-v1-root"><div class="avs1-loading"><span></span><strong>아바타 아카이브 연결 중</strong><small>보유 정보와 운영 설정을 확인합니다.</small></div></section>';
  }

  function bind() {
    const root = document.getElementById('avatarShopV1');
    if (!root || !window.SoopketmonAvatarShopV1?.create) return;
    destroy();
    controller = window.SoopketmonAvatarShopV1.create(root, {
      request,
      profile: profile() || { nickname: '플레이어' },
      onChange(_data, response) {
        if (response?.equippedAvatarCode && typeof window.clearApiCache === 'function') {
          window.clearApiCache('character/loadout');
          window.clearApiCache('chief/status');
        }
      },
      onBack() { if (typeof window.renderShell === 'function') window.renderShell('character'); }
    });
  }

  window.addEventListener('cnine:route-will-change', event => {
    if (String(event?.detail?.from || '') === 'avatar') destroy();
  });

  window.avatarShopView = view;
  window.bindAvatarShopView = bind;
  window.AvatarShopV1Live = { bind, destroy };
})();
