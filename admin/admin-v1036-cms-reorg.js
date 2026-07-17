/* v1036 CMS cleanup: standalone Monster/Cube menus. Existing API and DB structure are reused. */
(() => {
  const originalShow = window.show;

  function moveMonsterControls() {
    const mount = document.querySelector('#monsterManagementMount');
    if (!mount) return;
    const form = document.querySelector('#monsterName')?.closest('.panel');
    const list = document.querySelector('#monsterAdminList');
    if (form && form.parentElement !== mount) mount.appendChild(form);
    if (list && list.parentElement !== mount) mount.appendChild(list);
  }

  function moveCubeControls() {
    const mount = document.querySelector('#cubeManagementMount');
    const panel = document.querySelector('#cubeSettingsPanel');
    if (!mount || !panel) return false;
    mount.querySelector('.cmsLoadingPanel')?.remove();
    if (panel.parentElement !== mount) mount.appendChild(panel);
    return true;
  }

  function loadMonsterMenu() {
    return Promise.resolve(window.loadBattleAdmin()).then(() => moveMonsterControls());
  }

  function loadCubeMenu() {
    return Promise.resolve(window.loadSettings()).then(() => {
      moveCubeControls();
      setTimeout(moveCubeControls, 0);
    });
  }

  window.show = function(view, prefetched) {
    if (view !== 'monsters' && view !== 'cubes') return originalShow(view, prefetched);
    state.view = view;
    document.querySelectorAll('.view').forEach(x => x.hidden = x.id !== `view-${view}`);
    document.querySelectorAll('#nav button').forEach(x => x.classList.toggle('active', x.dataset.view === view));
    document.querySelector('#pageTitle').textContent = view === 'monsters' ? '몬스터 관리' : '큐브 관리';
    const loader = view === 'monsters' ? loadMonsterMenu : loadCubeMenu;
    loader().catch(e => alert(e.message));
  };

  const observer = new MutationObserver(() => {
    moveMonsterControls();
    moveCubeControls();
  });
  observer.observe(document.body, { childList: true, subtree: true });
  moveMonsterControls();
  moveCubeControls();
})();
