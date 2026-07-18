/* V1049: keep legacy battle settings loader independent from the standalone monster studio. */
(() => {
  const ensureLegacyMonsterSink = () => {
    let sink = document.querySelector('#monsterAdminList');
    if (sink) return sink;

    const battleView = document.querySelector('#view-battle');
    if (!battleView) return null;

    sink = document.createElement('div');
    sink.id = 'monsterAdminList';
    sink.hidden = true;
    sink.setAttribute('aria-hidden', 'true');
    sink.dataset.compatibilitySink = 'v1049';
    battleView.appendChild(sink);
    return sink;
  };

  const originalRenderMonsterAdmin = window.renderMonsterAdmin;
  if (typeof originalRenderMonsterAdmin === 'function') {
    window.renderMonsterAdmin = function (...args) {
      const sink = ensureLegacyMonsterSink();
      if (!sink) return;
      return originalRenderMonsterAdmin.apply(this, args);
    };
  }

  const originalLoadBattleAdmin = window.loadBattleAdmin;
  if (typeof originalLoadBattleAdmin === 'function') {
    window.loadBattleAdmin = async function (...args) {
      ensureLegacyMonsterSink();
      return originalLoadBattleAdmin.apply(this, args);
    };
  }

  // The monster studio replaces its mount contents, removing the old list node.
  // Recreate only a hidden compatibility sink when the battle settings page is opened.
  document.addEventListener('click', event => {
    const button = event.target.closest?.('#nav button[data-view="battle"]');
    if (button) ensureLegacyMonsterSink();
  }, true);
})();
