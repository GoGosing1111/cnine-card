/* v1036 CMS cleanup: standalone Monster menu. Existing API and DB structure are reused. */
(() => {
  const originalShow = window.show;

  function moveMonsterControls() {
    if (window.__V1045_MONSTER_STUDIO__) return;
    const mount = document.querySelector('#monsterManagementMount');
    if (!mount) return;
    const form = document.querySelector('#monsterName')?.closest('.panel');
    const list = document.querySelector('#monsterAdminList');
    if (form && form.parentElement !== mount) mount.appendChild(form);
    if (list && list.parentElement !== mount) mount.appendChild(list);
  }

  function loadMonsterMenu() {
    if (window.__V1045_MONSTER_STUDIO__ && typeof window.loadExpandedMonsterAdmin === 'function') {
      return Promise.resolve(window.loadExpandedMonsterAdmin());
    }
    return Promise.resolve(window.loadBattleAdmin()).then(() => moveMonsterControls());
  }

  window.show = function(view, prefetched) {
    if (view !== 'monsters') return originalShow(view, prefetched);
    state.view = view;
    document.querySelectorAll('.view').forEach(x => x.hidden = x.id !== `view-${view}`);
    document.querySelectorAll('#nav button').forEach(x => x.classList.toggle('active', x.dataset.view === view));
    document.querySelector('#pageTitle').textContent = '몬스터 관리';
    const loader = loadMonsterMenu;
    loader().catch(e => alert(e.message));
  };

  const observer = new MutationObserver(() => {
    moveMonsterControls();
  });
  observer.observe(document.body, { childList: true, subtree: true });
  moveMonsterControls();
})();
