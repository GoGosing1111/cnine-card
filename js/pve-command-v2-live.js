(() => {
  'use strict';

  if (typeof battleView !== 'function' || typeof renderBattleBuilder !== 'function') return;

  const esc = (value = '') => typeof escapeHtml === 'function' ? escapeHtml(String(value)) : String(value);
  const number = (value = 0) => Number(value || 0).toLocaleString('ko-KR');
  const legacySwitchPveMode = switchPveMode;
  const legacyRaidRenderer = typeof renderRaidView === 'function' ? renderRaidView : null;
  const legacyEvolutionView = window.evolutionView;
  const legacyEvolutionBinder = window.bindEvolutionView;

  const NAV_META = Object.freeze({
    deck: ['덱 편성', 'DEPLOY DECK', '<rect x="4" y="5" width="11" height="14"/><path d="M9 2h11v14"/>'],
    hunt: ['몬스터 토벌', 'HUNT ZONE', '<path d="m5 19 5-5m4-4 5-5M8 4l12 12M4 8l12 12"/><path d="m4 4 4 1-3 3zM20 20l-4-1 3-3z"/>'],
    raid: ['월드 레이드', 'RAID LIVE', '<path d="M4 20V9h4v11M10 20V4h4v16M16 20V7h4v13M2 20h20"/>'],
    escort: ['호송작전', 'ESCORT', '<path d="M3 7h12v10H3zM15 10h4l2 3v4h-6z"/><path d="M6 20v-3m12 3v-3"/>'],
    siege: ['몬스터 공성전', 'SIEGE', '<path d="M4 20V8h4V4h3v4h3V4h3v4h3v12zM9 20v-6h6v6"/>'],
    seal: ['봉인전', 'SEAL BATTLE', '<rect x="5" y="10" width="14" height="10"/><path d="M8 10V7a4 4 0 0 1 8 0v3M12 14v3"/>'],
    idle: ['방치형 원정', 'IDLE MISSION', '<path d="M7 3h10M7 21h10M8 3c0 5 8 5 8 9s-8 4-8 9M16 3c0 5-8 5-8 9s8 4 8 9"/>'],
    tower: ['무한의 탑', 'INFINITE TOWER', '<path d="M6 21V7h12v14M9 7V3h6v4M9 11h2m2 0h2m-6 4h2m2 0h2"/>']
  });

  function navKey(button) {
    if (button.dataset.monsterSiegeEntry) return 'siege';
    if (button.dataset.sealBattleMode) return 'seal';
    return String(button.dataset.pveMode || '').toLowerCase();
  }

  function decorateModeButton(button) {
    const key = navKey(button), meta = NAV_META[key];
    if (!meta) return;
    button.dataset.pveV2Key = key;
    if (button.dataset.pveV2Decorated !== '1') {
      button.dataset.pveV2Decorated = '1';
      button.innerHTML = `<svg viewBox="0 0 24 24" aria-hidden="true">${meta[2]}</svg><span><b>${meta[0]}</b><small>${meta[1]}</small></span>${key === 'raid' ? '<em>LIVE</em>' : ''}`;
    }
    button.setAttribute('aria-selected', button.classList.contains('active') ? 'true' : 'false');
  }

  function syncModeNavigation() {
    const nav = document.querySelector('.pve-mode-tabs');
    if (!nav) return;
    nav.classList.add('pvev2-mode-nav');
    nav.querySelectorAll('.pve-mode-btn').forEach(decorateModeButton);
    const root = document.getElementById('pveCommandV2');
    if (root && nav.dataset.pveV2Observer !== '1') {
      nav.dataset.pveV2Observer = '1';
      const observer = new MutationObserver(() => nav.querySelectorAll('.pve-mode-btn').forEach(decorateModeButton));
      observer.observe(nav, { childList: true, subtree: false });
      window.CNineRuntime?.registerCleanup?.(() => observer.disconnect());
    }
  }

  function battleEnergySnapshot() {
    const energy = battleState.energy;
    if (!energy) return { text: '- / -', fill: 0, timer: '전투 횟수 확인 중' };
    if (energy.unlimited) return { text: '무제한', fill: 100, timer: '무제한 적용' };
    const current = Math.max(0, Number(energy.energy || 0));
    const maximum = Math.max(1, Number(energy.maxEnergy || 1));
    return { text: `${current} / ${maximum}`, fill: Math.min(100, current / maximum * 100), timer: current >= maximum ? '충전 완료' : '자동 충전 적용' };
  }

  function battleToolbar() {
    const energy = battleEnergySnapshot();
    return `<div class="pvev2-live-toolbar">
      <div class="pvev2-server"><span></span><b>PROJECT V3</b><small>SERVER READY</small></div>
      <div class="pvev2-energy"><small>PVE ACTION</small><b id="battleEnergyCount">${esc(energy.text)}</b><span><i id="battleEnergyFill" style="width:${energy.fill}%"></i></span><em id="battleEnergyTimer">${esc(energy.timer)}</em></div>
      <button class="pvev2-evolution-entry" id="pveV2EvolutionEntry" type="button"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7h10M4 12h16M10 17h10"/><path d="m11 4 3 3-3 3m2 4-3 3 3 3"/></svg><span><small>CARD EVOLUTION</small><b>카드 진화</b></span><em>진입</em></button>
    </div>`;
  }

  function modeButton(key, active = false) {
    const meta = NAV_META[key];
    return `<button type="button" class="pve-mode-btn${key === 'escort' ? ' pve-escort-tab' : ''}${active ? ' active' : ''}" ${key === 'escort' ? 'id="pveEscortTab"' : ''} data-pve-mode="${key}" aria-selected="${active ? 'true' : 'false'}"><svg viewBox="0 0 24 24" aria-hidden="true">${meta[2]}</svg><span><b>${meta[0]}</b><small>${meta[1]}</small></span>${key === 'raid' ? '<em>LIVE</em>' : ''}</button>`;
  }

  function liveBattleView(user) {
    return `${summaryBar(user)}<div id="pveCommandV2" class="pvev2-root pvev2-live-root" data-screen="deck">
      ${battleToolbar()}
      <nav class="pve-mode-tabs pvev2-mode-nav" aria-label="PVE 콘텐츠">${modeButton('deck', true)}${modeButton('hunt')}${modeButton('raid')}${modeButton('escort')}</nav>
      <main class="pvev2-viewport" id="pveV2LiveViewport">
        <div id="pveHuntView" class="pve-hunt-redesign pve-hunt-v1179"><div class="pvev2-loading"><i></i><b>라이브 PVE 데이터 연결 중</b><span>SOOPKETMON DATABASE</span></div></div>
        <div id="pveRiftView" class="pve-rift-view" hidden><div class="rift-loading"><i></i><b>차원의 균열을 확인하는 중...</b></div></div>
        <div id="pveRaidView" class="pve-raid-view" hidden></div>
        <div id="pveEscortView" class="pve-escort-view" hidden><div class="escort-operation-loading"><i></i><b>호송 경로를 불러오는 중입니다.</b></div></div>
      </main>
    </div>`;
  }

  function screenHead(kicker, title, description, side = '') {
    return `<header class="pvev2-section-head"><div><span class="pvev2-kicker">${esc(kicker)}</span><h1>${esc(title)}</h1><p>${esc(description)}</p></div>${side}</header>`;
  }

  function deckScreenMarkup({ deckCount, energyText, totalPower, ready, cardPower, equipment, garage, title }) {
    return `<section class="pvev2-screen pvev2-deck-screen"><div class="pvev2-backdrop deck"></div><div class="pvev2-content">
      ${screenHead('PVE / DEPLOYMENT CONTROL', '출전 편성실', '카드 5장을 하나의 전술 단위로 구성합니다. 라이브 카드 프레임과 강화 상태를 그대로 유지합니다.', `<div class="pvev2-operation-rail"><article><small>편성 카드</small><b id="battleDeckCount">${deckCount} / 5</b></article><article><small>잔여 행동력</small><b>${esc(energyText)}</b></article><article><small>출전 전투력</small><b id="battleDeckPower">${number(totalPower)}</b></article><article class="${ready ? 'ready' : ''}"><small>DEPLOY STATUS</small><b id="battleDeckReady">${ready ? 'READY' : '편성 중'}</b></article></div>`)}
      <section class="pvev2-deck-console"><header class="pvev2-console-head"><div><small>ACTIVE PVE FORMATION</small><b>저장된 출전 덱</b></div><div class="pvev2-console-actions"><button class="pvev2-btn" type="button" id="clearBattleDeck">편성 초기화</button><button class="pvev2-btn primary" type="button" id="saveBattleDeck" ${ready ? '' : 'disabled'}>덱 저장</button></div></header>
        <div id="battleDeck" class="pvev2-roster pvev2-live-roster"></div>
        <footer class="pvev2-roster-foot"><article><small>CARD POWER</small><b>${number(cardPower)}</b></article><article><small>EQUIPMENT</small><b>${number(equipment)}</b></article><article><small>VEHICLE</small><b>${number(garage)}</b></article><article class="total"><small>TOTAL COMBAT</small><b>${number(totalPower)}</b></article><div class="pvev2-console-actions"><button class="pvev2-btn primary" type="button" id="pveV2GoHunt" ${ready ? '' : 'disabled'}>토벌 목표 선택</button></div></footer>
      </section>
      <section class="pvev2-inventory"><header class="pvev2-console-head"><div><small>OWNED CARD CATALOG</small><b>보유 카드 편성</b></div><span class="pvev2-status-line"><i></i>LIVE DB CATALOG · <b id="pveDeckResultCount">0장</b></span></header>
        <div class="pvev2-inventory-tools"><label class="pvev2-field"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 6h16M7 12h10M10 18h4"/></svg><input id="pveDeckSearch" type="search" autocomplete="off" placeholder="카드명 또는 멤버 검색"></label><label class="pvev2-field"><select id="pveDeckGrade"><option value="ALL">전체 등급</option>${['SUPERSTAR','ZENITH','FUR','PRESTIGE','LIMITED','MA','SSR','UR','HR','SR','R','U','C'].map(grade => `<option value="${grade}">${grade}</option>`).join('')}</select></label><label class="pvev2-field"><select id="pveDeckType"><option value="ALL">전체 유형</option><option value="ATTACK">공격형</option><option value="DEFENSE">방어형</option><option value="SPEED">속도형</option><option value="HP">HP형</option><option value="NONE">기본형</option></select></label><label class="pvev2-field"><select id="pveDeckSort"><option value="POWER_DESC">전투력 높은순</option><option value="GRADE_DESC">등급 높은순</option><option value="NAME_ASC">이름순</option></select></label><button class="pvev2-btn" type="button" id="pveDeckFilterReset">필터 초기화</button></div>
        <div id="battleCards" class="battle-card-picker pve-builder-list pvp-card-picker grouped pvev2-live-card-catalog"><div class="empty-recent">보유 카드를 불러오는 중입니다.</div></div>
      </section>
      <span id="battleDeckStatusText" class="pvev2-live-deck-contract">카드 ${number(cardPower)} + 장비 ${number(equipment)} + 이동수단 ${number(garage)} + 칭호 ${number(title)}</span>
    </div></section>`;
  }

  function emptyDeckSlot(index) {
    return `<div class="pvev2-live-card-slot empty"><span>${String(index + 1).padStart(2, '0')}</span><b>빈 슬롯</b><small>카드를 선택하세요</small></div>`;
  }

  function renderPveMonsterBrowserV2() {
    const root = document.getElementById('battleMonsters');
    if (!root) return;
    const saved = pveMonsterFilterState();
    const legacyTabMap = { ALL: 'NORMAL', GENERAL: 'NORMAL', ELITE: 'HARD', BOSS: 'HELL', EVENT: 'HELL' };
    const state = { tab: 'NORMAL', sort: 'POWER_ASC', query: '', ...saved };
    state.tab = legacyTabMap[String(state.tab || 'NORMAL').toUpperCase()] || String(state.tab || 'NORMAL').toUpperCase();
    if (!PVE_MONSTER_TABS.includes(state.tab)) state.tab = 'NORMAL';
    const resolveTab = monster => {
      const raw = String(monster.pveTab || monster.category || (monster.isBoss ? 'HELL' : 'NORMAL')).toUpperCase();
      return ({ GENERAL: 'NORMAL', ELITE: 'HARD', BOSS: 'HELL', EVENT: 'HELL' })[raw] || raw;
    };
    const rows = (battleState.monsters || []).filter(monster => resolveTab(monster) === state.tab);
    let selected = (battleState.monsters || []).find(monster => Number(monster.id) === Number(battleState.selectedMonster) && resolveTab(monster) === state.tab) || rows[0] || null;
    if (selected && Number(battleState.selectedMonster) !== Number(selected.id)) {
      battleState.selectedMonster = Number(selected.id);
      saveLastPveMonsterId(battleState.selectedMonster);
    }
    const user = loadUser(), bonus = battleState.characterBonus || {};
    const cardPower = battleState.deck.reduce((sum, id) => {
      const card = cards.find(item => String(item.id) === String(id));
      return sum + (card ? battleCardPower(card, user, battleState.config) : 0);
    }, 0);
    const myPower = cardPower + Number(bonus.pve || 0), noEnergy = battleState.energy && !battleState.energy.unlimited && battleState.energy.energy < battleState.energy.costPerBattle;
    const image = selected?.image ? `<img class="pvev2-hunt-monster-image" src="${esc(selected.image)}" alt="${esc(selected.name)}" loading="eager">` : '<div class="pvev2-monster-image-missing"><b>IMAGE CHECK</b><span>CMS 몬스터 원본 이미지가 필요합니다.</span></div>';
    root.innerHTML = `<section class="pvev2-hunt-hero"><div class="pvev2-hunt-visual monster-art"><span class="pvev2-target-code"><small>CMS TARGET</small><b>H-${String(selected?.id || 0).padStart(3, '0')}</b></span>${image}<span class="pvev2-monster-source"><small>MONSTER ART</small><b>CMS ORIGINAL</b></span></div><div class="pvev2-hunt-copy"><span class="pvev2-kicker">${esc(state.tab)} THREAT · H-${String(selected?.id || 0).padStart(3, '0')}</span><h1>${esc(selected?.name || '토벌 대상 선택')}</h1><p>${Number(selected?.isBoss) ? 'CMS에 등록된 보스 토벌 대상입니다. 저장된 PVE 덱으로 도전할 수 있습니다.' : 'CMS에 등록된 일반 토벌 대상입니다. 저장된 PVE 덱으로 바로 진입할 수 있습니다.'}</p><div class="pvev2-hunt-stats"><article><small>REQUIRED POWER</small><b>${number(selected?.battlePower)}</b></article><article><small>MY COMBAT</small><b>${number(myPower)}</b></article><article><small>VICTORY REWARD</small><b>${number(selected?.rewardCoin)} COIN</b></article></div><div class="pvev2-hunt-actions"><label class="pvev2-auto"><input type="checkbox" id="battleAuto"><span><b>잔여 행동력 자동 전투</b><small>현재 선택 목표를 행동력 소진까지 반복합니다.</small></span></label><button class="pvev2-btn primary" type="button" id="battleStart" data-pve-start-button="1" ${battleState.deck.length !== 5 || !selected || noEnergy ? 'disabled' : ''}>${noEnergy ? '전투 횟수 부족' : '전투 시작'}</button></div></div></section>
      <section class="pvev2-hunt-list"><nav class="pvev2-difficulty">${PVE_MONSTER_TABS.map(tab => `<button type="button" class="${state.tab === tab ? 'active' : ''}" data-monster-tab="${tab}">${monsterCategoryLabel(tab)}</button>`).join('')}</nav><div class="pvev2-monster-grid">${rows.map(monster => `<button type="button" class="pvev2-monster ${Number(monster.id) === Number(selected?.id) ? 'active' : ''}" data-monster="${Number(monster.id)}">${monster.image ? `<img src="${esc(monster.image)}" alt="${esc(monster.name)}" loading="lazy">` : '<span class="pvev2-monster-thumb-missing">IMAGE</span>'}<span><small>${esc(resolveTab(monster))} TARGET · H-${String(monster.id).padStart(3, '0')}</small><b>${esc(monster.name)}</b><em>전투력 ${number(monster.battlePower)}</em><strong>보상 ${number(monster.rewardCoin)} COIN</strong></span></button>`).join('') || '<div class="empty-recent">이 난이도에 공개된 몬스터가 없습니다.</div>'}</div></section>`;
    root.querySelectorAll('[data-monster-tab]').forEach(button => button.onclick = () => {
      state.tab = button.dataset.monsterTab;
      const visible = (battleState.monsters || []).filter(monster => resolveTab(monster) === state.tab);
      battleState.selectedMonster = visible[0]?.id || null;
      savePveMonsterFilterState(state);
      if (battleState.selectedMonster) saveLastPveMonsterId(battleState.selectedMonster);
      renderBattleBuilder();
    });
    root.querySelectorAll('[data-monster]').forEach(button => button.onclick = () => {
      battleState.selectedMonster = Number(button.dataset.monster);
      saveLastPveMonsterId(battleState.selectedMonster);
      battleState.restoreMonsterCursor = false;
      renderBattleBuilder();
    });
  }

  function liveRenderBattleBuilder() {
    void warmBattleArtAssets().catch(error => console.warn('전투 스프라이트 사전 로딩 실패:', error));
    const root = document.getElementById('pveHuntView');
    if (!root) return;
    const viewMode = getPveViewMode(), user = loadUser(), ownedSet = ownedIds(user);
    const owned = cards.filter(card => ownedSet.has(card.id)).sort((a, b) => (gradeOrder[b.grade] || 0) - (gradeOrder[a.grade] || 0) || battleCardPower(b, user, battleState.config) - battleCardPower(a, user, battleState.config));
    const bonus = battleState.characterBonus || {}, cardPower = battleState.deck.reduce((sum, id) => {
      const card = cards.find(item => String(item.id) === String(id));
      return sum + (card ? battleCardPower(card, user, battleState.config) : 0);
    }, 0);
    const totalPower = cardPower + Number(bonus.pve || 0), ready = battleState.deck.length === 5, energy = battleEnergySnapshot();
    document.getElementById('pveCommandV2')?.setAttribute('data-screen', viewMode);
    root.classList.toggle('pve-view-deck', viewMode === 'deck');
    root.classList.toggle('pve-view-hunt', viewMode === 'hunt');
    if (viewMode === 'deck') {
      root.innerHTML = deckScreenMarkup({ deckCount: battleState.deck.length, energyText: energy.text, totalPower, ready, cardPower, equipment: Number(bonus.equipmentPve || 0), garage: Number(bonus.garagePve || 0), title: Number(bonus.titlePve || 0) });
      const deckRoot = document.getElementById('battleDeck');
      if (deckRoot) deckRoot.innerHTML = Array.from({ length: 5 }, (_, index) => {
        const card = cards.find(item => String(item.id) === String(battleState.deck[index]));
        return card ? `<button type="button" class="pvev2-live-card-slot filled" data-remove="${esc(card.id)}" title="클릭해서 덱에서 제외">${pveDeckCardMini(card, user)}<span class="pvev2-live-remove">덱에서 빼기</span></button>` : emptyDeckSlot(index);
      }).join('');
      renderPveDeckCardList(owned, user);
      bindPveDeckFilters(owned, user);
      root.querySelectorAll('[data-remove]').forEach(button => button.onclick = () => { battleState.deck = battleState.deck.filter(id => String(id) !== String(button.dataset.remove)); renderBattleBuilder(); });
      const save = document.getElementById('saveBattleDeck'); if (save) save.onclick = saveBattleDeck;
      const reset = document.getElementById('clearBattleDeck'); if (reset) reset.onclick = resetBattleDeck;
      const hunt = document.getElementById('pveV2GoHunt'); if (hunt) hunt.onclick = () => switchPveMode('hunt');
    } else {
      activeVirtualCardLists.get('pve')?.destroy?.();
      root.innerHTML = `<section class="pvev2-screen pvev2-hunt-screen"><div class="pvev2-backdrop hunt"></div><div class="pvev2-content">${screenHead('PVE / TARGET ACQUISITION', '몬스터 토벌', 'CMS에 등록된 몬스터 이름·원본 이미지·전투 데이터를 그대로 표시합니다.', '<span class="pvev2-status-line"><i></i>CMS MONSTER DATA · LIVE CONTRACT</span>')}<div id="battleMonsters"></div></div></section>`;
      renderPveMonsterBrowserV2();
    }
    renderBattleEnergy();
    syncModeNavigation();
    document.getElementById('pveV2EvolutionEntry')?.addEventListener('click', () => renderShell('evolution'));
    window.CNineRuntime?.observe?.(root);
  }

  function liveRenderBattleSnapshot() {
    if (!(battleState.monsters || []).length) return false;
    renderBattleBuilder();
    startBattleEnergyTimer();
    return true;
  }

  function decorateRaid() {
    const box = document.getElementById('pveRaidView');
    if (!box) return;
    box.classList.add('pvev2-screen', 'pvev2-live-raid');
    if (!box.querySelector(':scope > .pvev2-backdrop')) box.insertAdjacentHTML('afterbegin', '<div class="pvev2-backdrop raid" aria-hidden="true"></div>');
    const content = [...box.children].find(child => child.matches?.('section'));
    content?.classList.add('pvev2-live-raid-content');
    syncModeNavigation();
  }

  function decorateEvolution() {
    const page = document.querySelector('.evolution-page');
    if (!page) return;
    page.classList.add('pvev2-evolution-live');
    if (!page.querySelector(':scope > .pvev2-backdrop')) page.insertAdjacentHTML('afterbegin', '<div class="pvev2-backdrop evolution" aria-hidden="true"></div>');
  }

  battleView = liveBattleView;
  renderBattleBuilder = liveRenderBattleBuilder;
  renderPveMonsterBrowser = renderPveMonsterBrowserV2;
  renderBattleSnapshot = liveRenderBattleSnapshot;
  switchPveMode = function pveCommandV2Switch(mode) {
    const result = legacySwitchPveMode(mode);
    requestAnimationFrame(syncModeNavigation);
    return result;
  };
  if (legacyRaidRenderer) renderRaidView = function pveCommandV2Raid(data) { legacyRaidRenderer(data); decorateRaid(); };
  if (typeof legacyEvolutionView === 'function') window.evolutionView = user => legacyEvolutionView(user).replace('class="evolution-page"', 'class="evolution-page pvev2-evolution-live"');
  if (typeof legacyEvolutionBinder === 'function') window.bindEvolutionView = function pveCommandV2EvolutionBind(...args) {
    const result = legacyEvolutionBinder(...args);
    decorateEvolution();
    const page = document.querySelector('.evolution-page');
    if (page) {
      const observer = new MutationObserver(decorateEvolution);
      observer.observe(page, { childList: true, subtree: true });
      window.CNineRuntime?.registerCleanup?.(() => observer.disconnect());
    }
    Promise.resolve(result).finally(decorateEvolution);
    return result;
  };

  window.battleView = battleView;
  window.PveCommandV2Live = Object.freeze({ syncModeNavigation, decorateRaid, decorateEvolution });
})();
