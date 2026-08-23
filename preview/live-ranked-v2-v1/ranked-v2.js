(() => {
  'use strict';

  const shell = document.getElementById('rankedApp');
  const content = document.getElementById('pvpContent');
  const tabs = [...document.querySelectorAll('[data-pvp]')];
  const views = [...document.querySelectorAll('[data-view]')];
  const tabBar = document.querySelector('.pvp-tabs');
  const matchButton = document.getElementById('rankedMatchStart');
  const queueState = document.getElementById('queueState');
  const tabOrder = ['match', 'deck', 'history', 'ranking', 'reward'];
  let matching = false;
  let matchFound = false;
  let matchTimer = 0;

  const setMatchButton = (mode) => {
    const states = {
      ready: ['PROJECT V3 / LIVE COMBAT', '랭크전 매칭 시작'],
      searching: ['RANKING NETWORK / SEARCHING', '균형 상대 탐색 중…'],
      found: ['OPPONENT LOCKED / READY', 'V3 전투 입장 준비']
    };
    const [kicker, label] = states[mode] || states.ready;
    matchButton.innerHTML = `<span class="button-kicker">${kicker}</span><strong>${label}</strong><svg viewBox="0 0 24 24" aria-hidden="true"><path d="m9 5 7 7-7 7"></path></svg>`;
  };

  const showToast = (message) => {
    let toast = document.querySelector('.preview-toast');
    if (!toast) {
      toast = document.createElement('div');
      toast.className = 'preview-toast';
      toast.setAttribute('role', 'status');
      document.body.appendChild(toast);
    }
    toast.textContent = message;
    toast.classList.remove('show');
    requestAnimationFrame(() => toast.classList.add('show'));
    window.setTimeout(() => toast.classList.remove('show'), 1900);
  };

  const activateTab = (name, moveFocus = false) => {
    const index = Math.max(0, tabOrder.indexOf(name));
    const tab = tabOrder[index];
    tabs.forEach((button) => {
      const active = button.dataset.pvp === tab;
      button.classList.toggle('active', active);
      button.setAttribute('aria-selected', active ? 'true' : 'false');
      button.tabIndex = active ? 0 : -1;
      if (active && moveFocus) button.focus({ preventScroll: true });
    });
    views.forEach((view) => {
      const active = view.dataset.view === tab;
      view.hidden = !active;
      view.classList.toggle('is-active', active);
    });
    tabBar.style.setProperty('--tab-index', String(index));
    content.scrollTop = 0;
    const url = new URL(window.location.href);
    url.searchParams.set('tab', tab);
    history.replaceState(null, '', url);
  };

  tabs.forEach((button) => {
    button.addEventListener('click', () => activateTab(button.dataset.pvp));
    button.addEventListener('keydown', (event) => {
      if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
      event.preventDefault();
      const current = tabOrder.indexOf(button.dataset.pvp);
      const delta = event.key === 'ArrowRight' ? 1 : -1;
      activateTab(tabOrder[(current + delta + tabOrder.length) % tabOrder.length], true);
    });
  });

  document.querySelectorAll('[data-go-tab]').forEach((button) => {
    button.addEventListener('click', () => activateTab(button.dataset.goTab));
  });

  matchButton.addEventListener('click', () => {
    if (matching) return;
    if (matchFound) {
      showToast('승인용 UI 프리뷰에서는 실제 전투 진입을 생략합니다.');
      return;
    }
    matching = true;
    shell.classList.add('is-matching');
    matchButton.disabled = true;
    matchButton.setAttribute('aria-busy', 'true');
    queueState.textContent = 'SEARCHING 01';
    setMatchButton('searching');
    window.clearTimeout(matchTimer);
    matchTimer = window.setTimeout(() => {
      matching = false;
      matchFound = true;
      shell.classList.remove('is-matching');
      matchButton.disabled = false;
      matchButton.removeAttribute('aria-busy');
      queueState.textContent = 'MATCH FOUND';
      setMatchButton('found');
    }, 1350);
  });

  document.querySelectorAll('.preset-strip button').forEach((button) => {
    button.addEventListener('click', () => {
      document.querySelectorAll('.preset-strip button').forEach((item) => item.classList.toggle('active', item === button));
      showToast(`${button.childNodes[0].textContent.trim()} 편성을 불러왔습니다.`);
    });
  });

  document.querySelectorAll('.segmented button').forEach((button) => {
    button.addEventListener('click', () => {
      document.querySelectorAll('.segmented button').forEach((item) => item.classList.toggle('active', item === button));
    });
  });

  document.querySelectorAll('.save-action, .log-row button').forEach((button) => {
    button.addEventListener('click', () => showToast(button.classList.contains('save-action') ? '편성 저장 동작까지 연결 가능한 구조입니다.' : '전투 기록 상세 화면 연결 지점입니다.'));
  });

  const seasonEnd = Date.parse('2026-08-27T11:01:00Z');
  const seasonClock = document.getElementById('pvpSeasonTime');
  const updateSeasonClock = () => {
    const remain = Math.max(0, seasonEnd - Date.now());
    const days = Math.floor(remain / 86400000);
    const hours = Math.floor(remain / 3600000) % 24;
    const minutes = Math.floor(remain / 60000) % 60;
    const seconds = Math.floor(remain / 1000) % 60;
    seasonClock.textContent = `${String(days).padStart(2, '0')}일 ${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
  };

  const requestedTab = new URL(window.location.href).searchParams.get('tab');
  activateTab(tabOrder.includes(requestedTab) ? requestedTab : 'match');
  updateSeasonClock();
  const clockTimer = window.setInterval(updateSeasonClock, 1000);
  window.addEventListener('pagehide', () => {
    window.clearInterval(clockTimer);
    window.clearTimeout(matchTimer);
  }, { once: true });
})();
