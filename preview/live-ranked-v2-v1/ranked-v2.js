(() => {
  'use strict';

  const shell = document.getElementById('rankedApp');
  const content = document.getElementById('pvpContent');
  const tabs = [...document.querySelectorAll('[data-pvp]')];
  const views = [...document.querySelectorAll('[data-view]')];
  const tabBar = document.querySelector('.pvp-tabs');
  const matchButton = document.getElementById('rankedMatchStart');
  const queueState = document.getElementById('queueState');
  const radarCoreState = document.querySelector('.radar-core small');
  const tabOrder = ['match', 'deck', 'history', 'ranking', 'reward'];
  const deckPresets = {
    1: { count: 5, total: '152,800', card: '112,450', equipment: '31,500', vehicle: '8,850' },
    2: { count: 5, total: '148,260', card: '109,410', equipment: '30,200', vehicle: '8,650' },
    3: { count: 0, total: '0', card: '0', equipment: '0', vehicle: '0' }
  };
  let selectedDeckPreset = 1;
  let activeDeckPreset = 1;
  let deckDirty = false;
  let deckCleared = false;
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
    shell.classList.remove('is-match-found');
    matchButton.disabled = true;
    matchButton.setAttribute('aria-busy', 'true');
    queueState.textContent = 'SEARCHING 01';
    radarCoreState.textContent = 'SEARCHING';
    setMatchButton('searching');
    window.clearTimeout(matchTimer);
    matchTimer = window.setTimeout(() => {
      matching = false;
      matchFound = true;
      shell.classList.remove('is-matching');
      shell.classList.add('is-match-found');
      matchButton.disabled = false;
      matchButton.removeAttribute('aria-busy');
      queueState.textContent = 'MATCH FOUND';
      radarCoreState.textContent = 'FOUND';
      setMatchButton('found');
    }, 1350);
  });

  const deckPresetButtons = [...document.querySelectorAll('[data-deck-preset]')];
  const deckRoster = document.getElementById('renewedDeckRoster');
  const deckSyncState = document.getElementById('deckSyncState');
  const deckRestoreAction = document.getElementById('deckRestoreAction');
  const deckClearAction = document.getElementById('deckClearAction');
  const deckSaveAction = document.getElementById('deckSaveAction');

  const renderDeckPreset = () => {
    const saved = deckPresets[selectedDeckPreset];
    const cleared = deckCleared || saved.count === 0;
    const count = cleared ? 0 : saved.count;
    const ready = count === 5;

    deckPresetButtons.forEach((button) => {
      const no = Number(button.dataset.deckPreset);
      const preset = deckPresets[no];
      const selected = no === selectedDeckPreset;
      const active = no === activeDeckPreset;
      button.classList.toggle('is-selected', selected);
      button.classList.toggle('is-active-use', active);
      button.classList.toggle('is-empty', preset.count === 0);
      button.setAttribute('aria-selected', selected ? 'true' : 'false');
      const state = button.querySelector('small');
      if (state) state.textContent = active ? '공격 사용 중' : (no === 1 ? '방어 기본 · 저장됨' : (preset.count ? '저장됨' : '비어 있음'));
    });

    deckRoster.classList.toggle('is-cleared', cleared);
    deckRoster.setAttribute('aria-label', `프리셋 ${selectedDeckPreset} 카드 편성`);
    document.getElementById('formationConsoleTitle').textContent = `프리셋 ${selectedDeckPreset} 전투 진형`;
    const formationState = document.getElementById('deckFormationState');
    formationState.textContent = ready ? '5 / 5 READY' : `${count} / 5 NOT READY`;
    formationState.classList.toggle('is-ready', ready);
    document.getElementById('deckCardPower').textContent = cleared ? '0' : saved.card;
    document.getElementById('deckEquipmentPower').textContent = cleared ? '0' : saved.equipment;
    document.getElementById('deckVehiclePower').textContent = cleared ? '0' : saved.vehicle;
    document.getElementById('deckTotalPower').textContent = cleared ? '0' : saved.total;

    deckSyncState.classList.toggle('is-dirty', deckDirty);
    deckSyncState.innerHTML = `<i></i>${deckDirty ? '저장되지 않은 변경 사항' : '서버 저장본과 일치'}`;
    deckRestoreAction.disabled = !deckDirty;
    deckClearAction.disabled = cleared;
    const canSave = ready && (deckDirty || selectedDeckPreset !== activeDeckPreset);
    deckSaveAction.disabled = !canSave;
    deckSaveAction.textContent = canSave ? `프리셋 ${selectedDeckPreset} 저장 · 적용` : (ready ? '서버 저장 완료' : `카드 ${count} / 5 편성`);
  };

  deckPresetButtons.forEach((button) => {
    button.addEventListener('click', () => {
      const nextPreset = Number(button.dataset.deckPreset);
      if (nextPreset === selectedDeckPreset) return;
      if (deckDirty && !window.confirm('저장하지 않은 편성을 버리고 다른 프리셋을 불러올까요?')) return;
      selectedDeckPreset = nextPreset;
      deckDirty = false;
      deckCleared = false;
      renderDeckPreset();
      showToast(`프리셋 ${selectedDeckPreset} 저장본을 불러왔습니다.`);
    });
  });

  deckClearAction.addEventListener('click', () => {
    deckCleared = true;
    deckDirty = true;
    renderDeckPreset();
    showToast('현재 프리셋을 비웠습니다. 저장 전에는 서버에 반영되지 않습니다.');
  });

  deckRestoreAction.addEventListener('click', () => {
    deckCleared = false;
    deckDirty = false;
    renderDeckPreset();
    showToast(`프리셋 ${selectedDeckPreset} 서버 저장본을 복원했습니다.`);
  });

  deckSaveAction.addEventListener('click', () => {
    if (deckSaveAction.disabled) return;
    activeDeckPreset = selectedDeckPreset;
    deckDirty = false;
    renderDeckPreset();
    showToast(`프리셋 ${selectedDeckPreset} 저장 및 공격 덱 적용을 완료했습니다.`);
  });

  const deckPowerToggle = document.getElementById('deckPowerToggle');
  const deckPowerDetails = document.getElementById('deckPowerDetails');
  deckPowerToggle.addEventListener('click', () => {
    const expanded = deckPowerToggle.getAttribute('aria-expanded') === 'true';
    deckPowerToggle.setAttribute('aria-expanded', expanded ? 'false' : 'true');
    deckPowerDetails.hidden = expanded;
    deckPowerToggle.textContent = expanded ? '상세 보기' : '상세 닫기';
  });

  const filterRankedCatalog = () => {
    const keyword = document.getElementById('rankedCatalogSearch').value.trim().toLowerCase();
    const grade = document.getElementById('rankedCatalogGrade').value;
    const role = document.getElementById('rankedCatalogRole').value;
    let visible = 0;
    document.querySelectorAll('.ranked-catalog-card').forEach((card) => {
      const matchesKeyword = !keyword || card.dataset.search.toLowerCase().includes(keyword);
      const matchesGrade = grade === 'all' || card.dataset.grade === grade;
      const matchesRole = role === 'all' || card.dataset.role === role;
      const matches = matchesKeyword && matchesGrade && matchesRole;
      card.hidden = !matches;
      if (matches) visible += 1;
    });
    document.getElementById('catalogResultCount').textContent = `${visible}장 표시`;
  };

  document.getElementById('rankedCatalogSearch').addEventListener('input', filterRankedCatalog);
  document.getElementById('rankedCatalogGrade').addEventListener('change', filterRankedCatalog);
  document.getElementById('rankedCatalogRole').addEventListener('change', filterRankedCatalog);
  document.querySelectorAll('.ranked-catalog-card').forEach((button) => {
    button.addEventListener('click', () => showToast(button.classList.contains('is-in-deck') ? '이미 현재 프리셋에 편성된 카드입니다.' : '빈 슬롯에 카드를 배치하는 연결 지점입니다.'));
  });

  document.querySelectorAll('.segmented button').forEach((button) => {
    button.addEventListener('click', () => {
      document.querySelectorAll('.segmented button').forEach((item) => item.classList.toggle('active', item === button));
    });
  });

  document.querySelectorAll('.log-row button').forEach((button) => {
    button.addEventListener('click', () => showToast('전투 기록 상세 화면 연결 지점입니다.'));
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
  renderDeckPreset();
  activateTab(tabOrder.includes(requestedTab) ? requestedTab : 'match');
  updateSeasonClock();
  const clockTimer = window.setInterval(updateSeasonClock, 1000);
  window.addEventListener('pagehide', () => {
    window.clearInterval(clockTimer);
    window.clearTimeout(matchTimer);
  }, { once: true });
})();
