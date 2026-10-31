(() => {
  'use strict';
  const VERSION = '20261031-ios-memory1';
  let checkedAt = 0, visible = false, featureRequest = null, controller = null, activeRoot = null, revision = 0;
  const host = () => document.getElementById('pveMadaraRaidView');
  async function refresh() {
    const tab = document.getElementById('madaraRaidTab');
    if (!tab) return false;
    if (featureRequest) return featureRequest;
    if (Date.now() - checkedAt < 15000) { tab.hidden = !visible; return visible; }
    const bridge = globalThis.CNineCoreRaidBridge;
    if (!bridge?.apiRequest) return false;
    featureRequest = (async () => {
      try {
        const result = await bridge.apiRequest('raid/madara/feature', {}, { ttl: 0, microcache: false });
        visible = result.visible === true;
        tab.querySelector('small').textContent = result.mode + ' · VARSEN';
        checkedAt = Date.now();
      } catch { visible = false; }
      finally { tab.hidden = !visible; tab.setAttribute('aria-hidden', String(!visible)); featureRequest = null; }
      return visible;
    })();
    return featureRequest;
  }
  function deactivate() {
    revision++;
    controller?.destroy();
    controller = null;
    const root = activeRoot || host();
    activeRoot = null;
    if (root) { root.hidden = true; root.replaceChildren(); }
  }
  async function open() {
    const root = host();
    if (!root || controller) return;
    activeRoot = root;
    const version = ++revision;
    root.hidden = false;
    root.innerHTML = '<div class="core-raid-loading" role="status"><i></i><b>바르센 레이드를 불러오는 중</b></div>';
    try {
      const { mountInlineRaid } = await import('/raid/madara/inline.mjs?v=' + VERSION);
      const current = () => version === revision && root.isConnected && !root.hidden;
      const mounted = await mountInlineRaid(root, { current });
      if (!current()) { mounted?.destroy(); return; }
      controller = mounted;
    } catch (error) {
      if (version !== revision || !root.isConnected) return;
      root.innerHTML = '<div class="core-raid-loading" role="status"><b>바르센 레이드를 불러오지 못했습니다.</b><button type="button">다시 시도</button></div>';
      root.querySelector('button').onclick = () => void open();
      console.warn('[VARSEN RAID] inline entry failed', error);
    }
  }
  function wire() {
    const hub = document.getElementById('pveRaidHubView');
    const tabs = hub?.querySelector('.raid-content-tabs');
    if (!tabs) { if (controller) deactivate(); return; }
    if (!document.getElementById('madaraRaidTab')) {
      const tab = document.createElement('button');
      tab.type = 'button'; tab.id = 'madaraRaidTab'; tab.hidden = true;
      tab.dataset.raidContent = 'madara';
      tab.setAttribute('aria-selected', 'false'); tab.setAttribute('aria-hidden', 'true');
      tab.innerHTML = '<small>RAID · VARSEN</small><b>바르센 레이드</b>';
      tabs.appendChild(tab);
      const root = document.createElement('div');
      root.id = 'pveMadaraRaidView'; root.hidden = true;
      hub.appendChild(root);
    }
    void refresh();
  }
  const app = document.getElementById('app');
  if (app) new MutationObserver(records => {
    // The shell also replaces only its route children, without replacing #app.
    if (activeRoot && (!activeRoot.isConnected || activeRoot.hidden)) deactivate();
    if (records.some(r => r.target === app || [...r.addedNodes].some(n => n.nodeType === 1 &&
      (n.id === 'pveRaidHubView' || n.querySelector?.('#pveRaidHubView'))))) {
      deactivate(); wire();
    }
  }).observe(app, { childList: true, subtree: true });
  addEventListener('load', wire);
  addEventListener('cnine:account-mutation', () => { checkedAt = 0; void refresh(); });
  addEventListener('pagehide', deactivate);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) { checkedAt = 0; void refresh(); } });
  globalThis.MadaraRaidEntry = Object.freeze({ refresh, open, deactivate, isVisible: () => visible });
  wire();
})();
