/* SOOPKETMON CHARACTER LOADOUT V2 — production mount adapter.
 * The preview and live game share character-loadout-v2.js verbatim. This file
 * only connects that renderer to the existing shell and apiRequest contract.
 */
(() => {
  'use strict';

  let controller = null;
  let titleSyncTimer = 0;

  function destroyController() {
    window.clearTimeout(titleSyncTimer);
    titleSyncTimer = 0;
    try { controller?.destroy?.(); } catch (_) {}
    controller = null;
  }

  function request(path, init = {}) {
    if (typeof window.apiRequest !== 'function') return Promise.reject(new Error('서버 API 연결을 찾을 수 없습니다.'));
    const isLoadout = String(path) === 'character/loadout' && String(init.method || 'GET').toUpperCase() === 'GET';
    const pending = window.apiRequest(path, init, isLoadout
      ? { ttl: 10000, timeoutMs: 12000 }
      : { timeoutMs: 20000 });
    return isLoadout ? pending.then(data => { window.applyAvatarFeatureState?.(data?.avatarFeature); return data; }) : pending;
  }

  function profile() {
    try { return typeof window.loadUser === 'function' ? window.loadUser() : null; }
    catch (_) { return null; }
  }

  function view() {
    return '<section id="characterSystemRoot" class="character-loadout-v2-root"><div class="clv2-loading"><i></i><strong>장비 연결 중</strong><span>보유 장비와 장착 정보를 불러옵니다.</span></div></section>';
  }

  function bind() {
    const root = document.getElementById('characterSystemRoot');
    if (!root || !window.SoopketmonCharacterLoadoutV2?.create) return;
    destroyController();
    controller = window.SoopketmonCharacterLoadoutV2.create(root, {
      profile: profile() || { nickname: '플레이어' },
      request,
      onOpenAvatarShop() {
        if (typeof window.renderShell === 'function') window.renderShell('avatar');
      },
      onChange(data, response) {
        try {
          window.dispatchEvent(new CustomEvent('cnine:character-power-changed', {
            detail: { bonuses: response?.bonuses || data?.bonuses || {} }
          }));
        } catch (_) {}
      }
    });

    // Preserve the existing collection-title unlock synchronization. It runs
    // once after the first paint and never blocks the loadout screen.
    titleSyncTimer = window.setTimeout(async () => {
      titleSyncTimer = 0;
      if (!controller || !root.isConnected) return;
      try {
        const result = await request('character/title/sync', { method: 'POST', body: '{}' });
        if (Number(result?.granted || 0) > 0 && root.isConnected) await controller.reload();
      } catch (_) {}
    }, 250);
  }

  window.addEventListener('cnine:route-will-change', event => {
    if (String(event?.detail?.from || '') === 'character') destroyController();
  });

  window.characterView = view;
  window.bindCharacterView = bind;
  window.refreshCharacterSystem = () => controller?.reload?.() || bind();
  window.CharacterLoadoutV2Live = { bind, destroy: destroyController };
})();
