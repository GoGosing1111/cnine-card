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
    deck: ['덱 편성', '출전 카드 배치'],
    hunt: ['몬스터 토벌', '난이도별 사냥'],
    defense: ['몬스터 디펜스', '거점 방어'],
    coop: ['격전지(협동)', '3인 협동 전투'],
    raid: ['월드 레이드', '레이드 보스'],
    escort: ['호송작전', '호송대 방어'],
    scrapyard: ['폐차장 원정', '구역 탐색'],
    legion: ['군단토벌', '잊혀진 섬'],
    citadel: ['군단토벌 파티', '불타는 성채 · 2인'],
    seal: ['봉인전', '봉인 던전'],
    tower: ['무한의 탑', '층별 도전'],
    'cow-room': ['카우방', '포탈 입장', 'magic']
  });

  const lobbyIcon = key => window.SoopTacticalIcons?.html(key) || '';

  function navKey(button) {
    if (button.hasAttribute('data-v3-cow-entry')) return 'cow-room';
    if (button.hasAttribute('data-legion-hunt-entry')) return 'legion';
    if (button.hasAttribute('data-legion-citadel')) return 'citadel';
    if (button.dataset.sealBattleMode) return 'seal';
    return button.dataset.pveMode || button.dataset.v21Route || button.dataset.pveV2Key;
  }

  function modeContent(key) {
    const [title, detail, icon = key] = NAV_META[key];
    return `${lobbyIcon(icon)}<span><b>${title}</b><small>${detail}</small></span>`;
  }

  function decorateModeButton(button) {
    const key = navKey(button);
    if (!NAV_META[key]) return;
    // Seal, cow portal and tower can join after their access checks finish.
    if (button.dataset.pveV2Decorated !== '1') {
      button.innerHTML = modeContent(key);
      button.dataset.pveV2Decorated = '1';
      button.dataset.pveV2Key = key;
    }
    if (button.matches('button')) {
      const active = button.classList.contains('active') ? 'true' : 'false';
      if (button.getAttribute('aria-selected') !== active) button.setAttribute('aria-selected', active);
    }
  }

  function syncModeNavigation() {
    const nav = document.querySelector('#pveCommandV2 > .pve-mode-tabs');
    if (!nav) return;
    nav.querySelectorAll('.pve-mode-btn').forEach(decorateModeButton);
    window.syncLegionHuntNavigation?.(nav);
    if (nav.dataset.pveV2Observer === '1') return;
    nav.dataset.pveV2Observer = '1';
    const observer = new MutationObserver(records => {
      for (const record of records) {
        for (const node of record.addedNodes) {
          if (node.matches?.('.pve-mode-btn')) decorateModeButton(node);
        }
      }
    });
    observer.observe(nav, { childList: true });
    window.CNineRuntime?.registerCleanup?.(() => observer.disconnect());
  }

  function battleEnergySnapshot(apocalypse = false) {
    const source = apocalypse ? normalizeApocalypseEnergyClient(battleState.apocalypseEnergy) : battleState.energy;
    const label = apocalypse ? '아포칼립스 행동력' : '토벌 잔여 횟수';
    if (!source) return { apocalypse, label, state: null, unavailable: true, text: '- / -', fill: 0, timer: apocalypse ? '아포칼립스 행동력 확인 중' : '전투 횟수 확인 중' };
    const maximum = Math.max(1, Number(source.maxEnergy || 1));
    const current = Math.max(0, Math.min(maximum, Number(source.energy || 0)));
    const state = apocalypse ? { ...source, mode: 'APOCALYPSE', energy: current, maxEnergy: maximum, costPerBattle: 1, rechargeMinutes: source.rechargeMinutes } : source;
    const eventName=source.burningMode==='EXTREME'?'익스트림 버닝':source.burningMode==='MIRACLE'?'미라클 버닝':'버닝 미적용';
    if (state.unlimited) return { apocalypse, label, state, unavailable: false, text: '무제한', fill: 100, timer: apocalypse ? (eventName+' · 무제한 계정') : '무제한 적용' };
    return { apocalypse, label, state, unavailable: state.unavailable === true, text: `${current} / ${maximum}`, fill: Math.min(100, current / maximum * 100), timer: apocalypse ? (eventName+' · '+(current>=maximum?'최대 '+maximum+'회 · 충전 완료':source.rechargeMinutes+'분마다 1회 충전')) : (current >= maximum ? '충전 완료' : '자동 충전 적용') };
  }

  function battleToolbar() {
    const apocalypse = typeof selectedPveIsApocalypse === 'function' && selectedPveIsApocalypse();
    const energy = battleEnergySnapshot(apocalypse);
    return `<div class="pvev2-live-toolbar">
      <h2 id="pveDestinationsTitle">${lobbyIcon('battle')}전장 선택</h2>
      <div class="pvev2-energy${apocalypse ? ' apocalypse-energy' : ''}" id="battleEnergyCard" data-energy-kind="${apocalypse ? 'APOCALYPSE' : 'STANDARD'}" aria-label="${esc(energy.label)}"><small id="battleEnergyLabel">${esc(energy.label)}</small><b id="battleEnergyCount">${esc(energy.text)}</b><span><i id="battleEnergyFill" style="width:${energy.fill}%"></i></span><em id="battleEnergyTimer">${esc(energy.timer)}</em></div>
      <button class="pvev2-evolution-entry" id="pveV2EvolutionEntry" type="button" aria-label="카드 진화로 이동">${lobbyIcon('evolution')}<b>카드 진화</b></button>
    </div>`;
  }

  function modeButton(key, attributes, active = false) {
    const metadata = `data-pve-v2-key="${key}" data-pve-v2-decorated="1"`;
    if (key === 'defense') {
      const href = window.SoopketmonV21RuntimeRouter?.routeContract?.defense?.href || '/defense/';
      return `<a class="pve-mode-btn" ${metadata} href="${esc(href)}" aria-label="몬스터 디펜스">${modeContent(key)}</a>`;
    }
    return `<button type="button" class="pve-mode-btn${key === 'escort' ? ' pve-escort-tab' : ''}${active ? ' active' : ''}" ${metadata} ${attributes} aria-selected="${active}">${modeContent(key)}</button>`;
  }

  function liveBattleView(user) {
    return `${summaryBar(user)}<div id="pveCommandV2" class="pvev2-root pvev2-live-root" data-screen="deck">
      ${battleToolbar()}
      <nav class="pve-mode-tabs pvev2-mode-nav" aria-labelledby="pveDestinationsTitle">
        ${modeButton('deck', 'data-pve-mode="deck"', true)}
        ${modeButton('hunt', 'data-pve-mode="hunt"')}
        ${modeButton('defense')}
        ${modeButton('coop', 'id="pveCoopTab" data-pve-mode="coop" hidden')}
        ${modeButton('raid', 'data-pve-mode="raid"')}
        ${modeButton('escort', 'id="pveEscortTab" data-pve-mode="escort"')}
        ${modeButton('scrapyard', 'data-v21-route="scrapyard"')}
        ${modeButton('legion', 'data-legion-hunt-entry hidden')}
        ${modeButton('citadel', 'data-legion-citadel hidden')}
      </nav>
      <main class="pvev2-viewport" id="pveV2LiveViewport">
        <div id="pveHuntView" class="pve-hunt-redesign pve-hunt-v1179"><div class="pvev2-loading"><i></i><b>라이브 PVE 데이터 연결 중</b><span>REVERSE CALL DATABASE</span></div></div>
        <div id="pveRiftView" class="pve-rift-view" hidden><div class="rift-loading"><i></i><b>차원의 균열을 확인하는 중...</b></div></div>
        <div id="pveCoopView" hidden></div>
        <div id="pveRaidHubView" class="pve-raid-hub-view" hidden>
          <nav class="raid-content-tabs" aria-label="레이드 콘텐츠">
            <button type="button" class="active" data-raid-content="world" aria-selected="true"><small>LEGACY WORLD RAID</small><b>월드 레이드</b></button>
            <button type="button" id="coreRaidTab" data-raid-content="core" aria-selected="false" aria-hidden="true" hidden><small>TEST · CORE PROTOCOL</small><b>붕괴 코어</b></button>
          </nav>
          <div id="pveRaidView" class="pve-raid-view"><div class="pvev2-loading raid-entry-loading"><i></i><b>월드 레이드 전황 연결 중</b><span>REVERSE CALL RAID SERVER</span></div></div>
          <div id="pveCoreRaidView" class="pve-core-raid-view" hidden><div class="core-raid-loading"><i></i><b>붕괴 코어 접근 권한 확인 중</b></div></div>
        </div>
        <div id="pveEscortView" class="pve-escort-view" hidden><div class="escort-operation-loading"><i></i><b>호송 경로를 불러오는 중입니다.</b></div></div>
      </main>
    </div>`;
  }

  function screenHead(kicker, title, description, side = '') {
    return `<header class="pvev2-section-head"><div><span class="pvev2-kicker">${esc(kicker)}</span><h1>${esc(title)}</h1><p>${esc(description)}</p></div>${side}</header>`;
  }

  function pveDeckRules() {
    const fallback = {
      gradeLimits: { PRESTIGE: 2, FUR: 2, ZENITH: 2, SUPERSTAR: 1, ICON: 2 },
      healerPenalties: { 2: 60, 3: 75, 4: 85, 5: 90 },
      formation: { frontSlots: 2, backSlots: 3 },
      healerSurviveDisabledAt: 2
    };
    if (typeof normalizeDeckRules === 'function') return normalizeDeckRules(battleState.deckRules || fallback);
    const source = battleState.deckRules || {};
    return {
      ...fallback,
      ...source,
      gradeLimits: { ...fallback.gradeLimits, ...(source.gradeLimits || {}), SUPERSTAR: 1, ICON: 2 },
      healerPenalties: { ...fallback.healerPenalties, ...(source.healerPenalties || source.healerDuplicatePenalty || {}) },
      formation: { ...fallback.formation, ...(source.formation || {}) }
    };
  }

  function pveCardGrade(card) {
    return String(card?.grade || card?.rarity || '').trim().toUpperCase();
  }

  function pveDeckLimitViolation() {
    const rules = pveDeckRules();
    if (typeof deckGradeLimitViolation === 'function') return deckGradeLimitViolation(battleState.deck, rules);
    const counts = battleState.deck.reduce((result, id) => {
      const grade = pveCardGrade(cards.find(card => String(card.id) === String(id)));
      if (grade) result[grade] = Number(result[grade] || 0) + 1;
      return result;
    }, {});
    return Object.entries(rules.gradeLimits || {}).map(([grade, limit]) => ({ grade, limit: Number(limit || 0), count: Number(counts[grade] || 0) })).find(item => item.limit > 0 && item.count > item.limit) || null;
  }

  function pveGradeLimitLabel(grade) {
    if (typeof deckGradeRuleLabel === 'function') return deckGradeRuleLabel(grade);
    return `${grade} 등급`;
  }

  function pveHealerPenaltyState() {
    const selected = battleState.deck.map(id => cards.find(card => String(card.id) === String(id))).filter(Boolean);
    const isHealer = card => typeof pvpCardIsHealer === 'function'
      ? pvpCardIsHealer(card)
      : String(card?.powerType || card?.power_type || '').toUpperCase() === 'HP';
    const count = selected.filter(isHealer).length;
    const rules = pveDeckRules();
    return { count, rules, reduction: Number(rules.healerPenalties?.[Math.min(5, count)] || 0) };
  }

  function pveDeckRuleChips() {
    const rules = pveDeckRules();
    const grades = ['PRESTIGE', 'FUR', 'ZENITH', 'SUPERSTAR', 'ICON'];
    return `<div class="pvev2-deck-rule-chips" aria-label="PVE 덱 등급 편성 제한">${grades.map(grade => {
      const limit = Number(rules.gradeLimits?.[grade] || 0);
      const count = battleState.deck.filter(id => pveCardGrade(cards.find(card => String(card.id) === String(id))) === grade).length;
      return `<span class="${limit && count > limit ? 'is-over' : ''}"><b>${esc(grade)}</b><em>${count} / ${limit || '-'}</em></span>`;
    }).join('')}</div>`;
  }

  function pveFormationStrip() {
    const formation = pveDeckRules().formation || {};
    const front = Number(formation.front ?? formation.frontSlots ?? 2), back = Number(formation.back ?? formation.backSlots ?? 3);
    return `<div class="pvev2-formation-strip"><b>전열 ${front}장 <span aria-hidden="true">/</span> 후열 ${back}장</b><button class="pvev2-btn pvev2-rule-open" type="button" id="pveDeckRulesOpen">편성 규칙</button></div>`;
  }

  function pveHealerWarning() {
    const state = pveHealerPenaltyState(), penalties = state.rules.healerPenalties || {};
    if (!state.reduction) return '';
    return `<section class="pvev2-healer-rule ${state.reduction ? 'is-active' : ''}" aria-live="polite"><div><b>힐러 ${state.count}장${state.reduction ? ` · 회복량 ${state.reduction}% 감소` : ''}</b></div><p>힐러를 2장 이상 편성하면 HP형 불굴의 생존 효과가 비활성화됩니다.</p><span>2장 -${Number(penalties[2] || 0)}% · 3장 -${Number(penalties[3] || 0)}% · 4장 -${Number(penalties[4] || 0)}% · 5장 -${Number(penalties[5] || 0)}%</span></section>`;
  }

  function pveDeckRulesDialog() {
    const rules = pveDeckRules(), formation = rules.formation || {}, penalties = rules.healerPenalties || {};
    return `<div class="pvev2-rule-dialog" id="pveDeckRulesDialog" role="dialog" aria-modal="true" aria-labelledby="pveDeckRulesTitle"><section><header><div><small>PVE DECK RULES</small><h2 id="pveDeckRulesTitle">출전 편성 규칙</h2></div><button class="pvev2-btn" type="button" data-pve-rule-close>닫기</button></header><div class="pvev2-rule-dialog-grid"><article><small>등급별 최대 편성</small><p>${['PRESTIGE', 'FUR', 'ZENITH', 'SUPERSTAR', 'ICON'].map(grade => `<b>${esc(grade)} <em>최대 ${Number(rules.gradeLimits?.[grade] || 0)}장</em></b>`).join('')}</p></article><article><small>전투 배치</small><p><b>전열 ${Number(formation.front ?? formation.frontSlots ?? 2)}명</b><b>후열 ${Number(formation.back ?? formation.backSlots ?? 3)}명</b></p></article><article><small>힐러 중복 페널티</small><p><b>2장 -${Number(penalties[2] || 0)}%</b><b>3장 -${Number(penalties[3] || 0)}%</b><b>4장 -${Number(penalties[4] || 0)}%</b><b>5장 -${Number(penalties[5] || 0)}%</b></p><span>2장 이상: HP형 불굴의 생존 효과 비활성</span></article></div><footer>표시된 규칙은 서버 설정을 기준으로 적용됩니다. 저장과 전투 시작 시 서버가 최종 검증합니다.</footer></section></div>`;
  }

  function bindPveDeckRulesDialog(root) {
    const opener = root.querySelector('#pveDeckRulesOpen');
    if (!opener) return;
    opener.onclick = () => {
      document.body.insertAdjacentHTML('beforeend', pveDeckRulesDialog());
      const dialog = document.getElementById('pveDeckRulesDialog');
      const close = () => { dialog?.remove(); opener.focus({preventScroll:true}); };
      dialog?.addEventListener('keydown', event => {
        if (event.key === 'Escape') close();
        if (event.key === 'Tab') { event.preventDefault(); dialog.querySelector('[data-pve-rule-close]').focus(); }
      });
      dialog?.querySelector('[data-pve-rule-close]')?.addEventListener('click', close, { once: true });
      dialog?.addEventListener('click', event => { if (event.target === dialog) close(); });
      dialog?.querySelector('[data-pve-rule-close]')?.focus();
    };
  }

  function enforcePveDeckRuleControls(root) {
    const violation = pveDeckLimitViolation();
    if (!violation) return;
    root.querySelectorAll('#saveBattleDeck,#pveV2GoHunt,#battleStart').forEach(button => {
      if (!button.disabled) button.disabled = true;
      if (button.getAttribute('aria-disabled') !== 'true') button.setAttribute('aria-disabled', 'true');
      if (button.id === 'saveBattleDeck' && button.textContent !== '규칙 확인 필요') button.textContent = '규칙 확인 필요';
      if (button.id === 'battleStart' && button.textContent !== '편성 규칙 확인') button.textContent = '편성 규칙 확인';
    });
  }

  function installPveDeckRuleGuard(root) {
    enforcePveDeckRuleControls(root);
    if (root.dataset.pveRuleGuard === '1') return;
    root.dataset.pveRuleGuard = '1';
    const observer = new MutationObserver(() => enforcePveDeckRuleControls(root));
    observer.observe(root, { subtree: true, attributes: true, attributeFilter: ['disabled'] });
    window.CNineRuntime?.registerCleanup?.(() => observer.disconnect());
  }

  function deckScreenMarkup({ deckCount, totalPower, ready, violation, cardPower, equipment, battleSuit, garage, title }) {
    const readyLabel = violation ? '규칙 확인' : (ready ? '출전 준비' : '편성 중');
    return `<section class="pvev2-screen pvev2-deck-screen"><div class="pvev2-backdrop deck"></div><div class="pvev2-content">
      ${screenHead('PVE / DEPLOYMENT CONTROL', 'PVE 덱 편성실', '보유 카드에서 출전할 5장을 선택하세요.', `<div class="pvev2-operation-rail"><article><small>편성 카드</small><b id="battleDeckCount">${deckCount} / 5</b></article><article><small>출전 전투력</small><b id="battleDeckPower">${number(totalPower)}</b></article><article class="${ready ? 'ready' : ''}${violation ? ' blocked' : ''}"><small>편성 상태</small><b id="battleDeckReady">${readyLabel}</b></article></div>`)}
      <section class="pvev2-deck-console ${violation ? 'has-rule-violation' : ''}"><header class="pvev2-console-head"><div class="pvev2-panel-title">${lobbyIcon('deck')}<h2>출전 덱</h2></div><div class="pvev2-console-actions"><button class="pvev2-btn" type="button" id="clearBattleDeck">편성 초기화</button><button class="pvev2-btn primary" type="button" id="saveBattleDeck" ${ready ? '' : 'disabled'}>${violation ? '규칙 확인 필요' : '덱 저장'}</button></div></header>
        ${pveFormationStrip()}
        <div id="battleDeck" class="pvev2-roster pvev2-live-roster"></div>
        ${pveHealerWarning()}
        <div class="pvev2-deck-next"><details class="pvev2-deck-details"${violation ? ' open' : ''}><summary>편성 상세</summary>
          ${pveDeckRuleChips()}<div class="pvev2-roster-foot"><article><small>카드</small><b>${number(cardPower)}</b></article><article><small>장비</small><b>${number(equipment)}</b></article><article class="battle-suit"><small>배틀슈트 · PVE 전용</small><b>${number(battleSuit)}</b></article><article><small>이동수단</small><b>${number(garage)}</b></article><article><small>칭호</small><b>${number(title)}</b></article></div>
        </details><button class="pvev2-btn primary" type="button" id="pveV2GoHunt" ${ready ? '' : 'disabled'}>토벌 목표 선택</button></div>
      </section>
      <section class="pvev2-inventory"><header class="pvev2-console-head"><div class="pvev2-panel-title">${lobbyIcon('cards')}<h2 id="pveOwnedCardsTitle" tabindex="-1">보유 카드</h2></div><span class="pvev2-status-line">검색 결과 <b id="pveDeckResultCount">…</b></span></header>
        <div class="pvev2-inventory-tools"><label class="pvev2-field">${lobbyIcon('search')}<input id="pveDeckSearch" type="search" autocomplete="off" aria-label="카드명 또는 멤버 검색" placeholder="카드명 또는 멤버 검색"></label><label class="pvev2-field"><select id="pveDeckGrade" aria-label="카드 등급"><option value="ALL">전체 등급</option>${['ICON','SUPERSTAR','ZENITH','FUR','PRESTIGE','LIMITED','MA','SSR','UR','HR','SR','R','U','C'].map(grade => `<option value="${grade}">${grade}</option>`).join('')}</select></label><label class="pvev2-field"><select id="pveDeckType" aria-label="카드 유형"><option value="ALL">전체 유형</option><option value="ATTACK">공격형</option><option value="DEFENSE">방어형</option><option value="SPEED">속도형</option><option value="HP">HP형</option><option value="NONE">기본형</option></select></label><label class="pvev2-field"><select id="pveDeckSort" aria-label="카드 정렬"><option value="POWER_DESC">전투력 높은순</option><option value="GRADE_DESC">등급 높은순</option><option value="NAME_ASC">이름순</option></select></label><button class="pvev2-btn" type="button" id="pveDeckFilterReset">필터 초기화</button></div>
        <div id="battleCards" class="battle-card-picker pve-builder-list pvp-card-picker grouped pvev2-live-card-catalog"><div class="empty-recent pvev2-catalog-loading">보유 카드를 불러오는 중입니다.</div></div>
      </section>
      <span id="battleDeckStatusText" class="pvev2-live-deck-contract">카드 ${number(cardPower)} + 일반 장비 ${number(equipment)} + 배틀슈트 ${number(battleSuit)} (PVE 전용) + 이동수단 ${number(garage)} + 칭호 ${number(title)}</span>
    </div></section>`;
  }

  function emptyDeckSlot(index, position) {
    return `<div class="pvev2-live-card-slot empty ${battleState.deckEditSlot===index?'is-edit-target':''}" data-pve-empty="${index}" role="button" tabindex="0" aria-label="${position}에 카드 편성"><span class="pvev2-slot-position">${position}</span><b>빈 슬롯</b><small>${battleState.deckEditSlot===index?'이 자리에 카드 선택':'카드를 선택하세요'}</small></div>`;
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
    const difficultyButtons = PVE_MONSTER_TABS.map(tab =>
      `<button type="button" class="${state.tab === tab ? 'active' : ''}" aria-pressed="${state.tab === tab}" data-monster-tab="${tab}">${monsterCategoryLabel(tab)}</button>`
    ).join('');
    const targets = rows.map(monster => {
      const active = Number(monster.id) === Number(selected?.id);
      const thumb = monster.image ? `<img src="${esc(monster.image)}" alt="" loading="lazy" decoding="async">` : lobbyIcon('hunt');
      return `<button type="button" class="pvev2-monster${active ? ' active' : ''}" aria-pressed="${active}" data-monster="${Number(monster.id)}">
        ${thumb}<span><b>${esc(monster.name)}</b><em>전투력 ${number(monster.battlePower)}</em></span></button>`;
    }).join('');
    const options = rows.map(monster =>
      `<option value="${Number(monster.id)}"${monster === selected ? ' selected' : ''}>${esc(monster.name)}</option>`
    ).join('');
    root.innerHTML = `<nav class="pvev2-difficulty" aria-label="토벌 난이도">${difficultyButtons}</nav>
      ${selected ? `<section class="pvev2-hunt-list" aria-labelledby="pveTargetLabel">
        <header><h2 id="pveTargetLabel">토벌 대상</h2><span>${rows.length}종</span></header>
        <select class="pvev2-target-select" aria-labelledby="pveTargetLabel">${options}</select>
        <div class="pvev2-monster-grid">${targets}</div></section>
        <section class="pvev2-hunt-hero" aria-labelledby="pveTargetName"></section>`
        : '<p class="pvev2-no-targets">이 난이도에 공개된 몬스터가 없습니다. 다른 난이도를 선택하세요.</p>'}`;

    const user = loadUser(), bonus = battleState.characterBonus || {};
    const cardPower = battleState.deck.reduce((sum, id) => {
      const card = cards.find(item => String(item.id) === String(id));
      return sum + (card ? battleCardPower(card, user, battleState.config) : 0);
    }, 0);
    const myPower = cardPower + Number(bonus.pve || 0) + Number(globalThis.MercenaryDeckSlot?.power?.('PVE') || 0);
    function renderTarget() {
      const hero = root.querySelector('.pvev2-hunt-hero');
      if (!hero || !selected) return;
      const requiredPower = Math.max(0, Number(selected.recommendedPower ?? selected.battlePower ?? 0));
      const powerDelta = myPower - requiredPower, powerReady = powerDelta >= 0;
      const apocalypse = state.tab === 'APOCALYPSE', huntEnergy = battleEnergySnapshot(apocalypse), energyState = huntEnergy.state;
      const noEnergy = !energyState || huntEnergy.unavailable || (!energyState.unlimited && energyState.energy < energyState.costPerBattle);
      const ruleViolation = pveDeckLimitViolation(), deckReady = deckCardCount(battleState.deck) === 5;
      const remainingBattles = energyState?.unlimited ? 0 : Math.floor(Number(energyState?.energy || 0) / Math.max(1, Number(energyState?.costPerBattle || 1)));
      const sweepControl = apocalypse
        ? '<div class="pvev2-sweep-unavailable" data-pve-sweep-policy="APOCALYPSE_EXCLUDED"><i>!</i><span><b>아포칼립스 소탕 제외</b><small>전용 기믹 전투는 매회 직접 진행합니다.</small></span></div>'
        : `<label class="pvev2-auto pvev2-sweep${remainingBattles < 2 || energyState?.unlimited ? ' is-disabled' : ''}" data-pve-sweep-policy="STANDARD_ONLY"><input type="checkbox" id="battleAuto" ${remainingBattles < 2 || energyState?.unlimited ? 'disabled' : ''}><span><b>전투 소탕</b><small>첫 1회는 V3 연출 · 이후 ${Math.max(0, remainingBattles - 1)}회 일괄 판정</small></span><em>${remainingBattles >= 2 && !energyState?.unlimited ? `총 ${remainingBattles}회` : '2회부터'}</em></label>`;
      const skipControl = battleState.battleEngine?.active ? '' : `<label class="pvev2-auto pvev2-ultimate-skip"><input type="checkbox" id="battleSkipPlayerUltimate" ${localStorage.getItem('cnine_skip_player_ultimate') === 'ON' ? 'checked' : ''}><span><b>내 궁극기 연출 스킵</b><small>보스 궁극기는 정상 재생합니다.</small></span></label>`;
      const minions = Number(selected.apocalypse?.skill?.minionCount || 0);
      const suitDefense = Number(selected.apocalypse?.battleSuitSkillDefensePercent || 0);
      const art = selected.image
        ? `<img class="pvev2-hunt-monster-image" src="${esc(selected.image)}" alt="${esc(selected.name)}" decoding="async">`
        : '<span class="pvev2-monster-image-missing">등록된 몬스터 이미지가 없습니다.</span>';
      hero.innerHTML = `<div class="pvev2-hunt-visual monster-art">${art}</div>
        <div class="pvev2-hunt-copy">
          <h2 id="pveTargetName">${esc(selected.name)}</h2>
          ${minions ? `<p>보스 1마리와 쫄몹 ${minions}마리를 모두 처치하세요. 봉인·회복 불가·궁극기에 대비하세요.${suitDefense > 0 ? ` 배틀슈트 스킬 피해 ${number(suitDefense)}% 감소.` : ''}</p>` : ''}
          <dl class="pvev2-target-facts">
            <div><dt>권장 전투력</dt><dd>${number(requiredPower)}</dd></div>
            <div><dt>내 전투력</dt><dd>${number(myPower)}</dd></div>
            <div class="pvev2-target-reward"><dt>승리 보상</dt><dd>${number(selected.rewardCoin)} <span>코인</span></dd></div>
          </dl>
          <details class="pvev2-power-guide"><summary>권장 대비 ${powerReady ? '+' : ''}${number(powerDelta)}${requiredPower ? ` (${powerReady ? '+' : ''}${(powerDelta / requiredPower * 100).toFixed(1)}%)` : ''}</summary>
            <p>${selected.recommendedPowerSource === 'ENGINE_ESTIMATE' ? '아포칼립스 권장 전투력은 전투 엔진의 승률 50% 추정치입니다.' : '권장 전투력에 미달해도 도전할 수 있습니다.'}</p></details>
          <div class="pvev2-hunt-attempts${apocalypse ? ' apocalypse-energy' : ''}" data-energy-kind="${apocalypse ? 'APOCALYPSE' : 'STANDARD'}"><span><small>${esc(huntEnergy.label)}</small><b>${esc(huntEnergy.text)}</b></span><em>${esc(huntEnergy.timer)}</em></div>
          ${ruleViolation ? `<div class="pvev2-hunt-rule-block">${esc(pveGradeLimitLabel(ruleViolation.grade))} ${ruleViolation.count}장 편성 · 최대 ${ruleViolation.limit}장까지 편성할 수 있습니다.</div>` : ''}
          ${!deckReady ? '<p>덱 편성에서 출전 카드 5장을 저장하세요.</p>' : ''}
          <div class="pvev2-hunt-actions"><div class="pvev2-battle-options">${sweepControl}${skipControl}</div>
            <button class="pvev2-btn primary" type="button" id="battleStart" data-pve-start-button="1" ${!deckReady || noEnergy || ruleViolation ? 'disabled' : ''}>${ruleViolation ? '편성 규칙 확인' : noEnergy ? (apocalypse ? '아포칼립스 행동력 부족' : '전투 횟수 부족') : '전투 시작'}</button>
          </div>
        </div>`;
      const autoToggle = hero.querySelector('#battleAuto');
      if (autoToggle) autoToggle.onchange = renderBattleEnergy;
      const skipToggle = hero.querySelector('#battleSkipPlayerUltimate');
      if (skipToggle) skipToggle.onchange = () => localStorage.setItem('cnine_skip_player_ultimate', skipToggle.checked ? 'ON' : 'OFF');
    }
    function selectTarget(id) {
      const target = rows.find(monster => Number(monster.id) === Number(id));
      if (!target || target === selected) return;
      const mark = (monster, active) => {
        const button = root.querySelector(`[data-monster="${Number(monster.id)}"]`);
        button.classList.toggle('active', active);
        button.setAttribute('aria-pressed', String(active));
      };
      mark(selected, false);
      selected = target;
      mark(selected, true);
      battleState.selectedMonster = Number(selected.id);
      battleState.restoreMonsterCursor = false;
      saveLastPveMonsterId(battleState.selectedMonster);
      root.querySelector('.pvev2-target-select').value = String(selected.id);
      renderTarget();
      renderBattleEnergy();
      void warmBattleArtAssets().catch(error => console.warn('토벌 원화 로딩 실패:', error));
    }
    renderTarget();
    root.querySelectorAll('[data-monster-tab]').forEach(button => button.onclick = () => {
      if (state.tab === button.dataset.monsterTab) return;
      state.tab = button.dataset.monsterTab;
      const next = (battleState.monsters || []).find(monster => resolveTab(monster) === state.tab);
      battleState.selectedMonster = next?.id || null;
      savePveMonsterFilterState(state);
      if (next) saveLastPveMonsterId(next.id);
      renderBattleBuilder();
      document.querySelector(`#battleMonsters [data-monster-tab="${state.tab}"]`)?.focus({preventScroll:true});
    });
    root.querySelectorAll('[data-monster]').forEach(button => button.onclick = () => selectTarget(button.dataset.monster));
    const select = root.querySelector('.pvev2-target-select');
    if (select) select.onchange = () => selectTarget(select.value);
  }

  let cancelCatalogMount;
  function mountDeckCatalog(owned, user, alreadyVisible) {
    if (alreadyVisible || !('IntersectionObserver' in window)) {
      renderPveDeckCardList(owned, user);
      return;
    }
    // The deck and its controls can paint before the inventory needs its card frames.
    const catalog = document.getElementById('battleCards');
    const observer = new IntersectionObserver(entries => {
      if (!entries.some(entry => entry.isIntersecting)) return;
      cancel();
      if (catalog.isConnected && catalog.querySelector('.pvev2-catalog-loading')) renderPveDeckCardList(owned, user);
    });
    const cancel = () => {
      observer.disconnect();
      unregister?.();
      if (cancelCatalogMount === cancel) cancelCatalogMount = null;
    };
    const unregister = window.CNineRuntime?.registerCleanup?.(cancel);
    cancelCatalogMount = cancel;
    observer.observe(catalog);
  }

  function liveRenderBattleBuilder() {
    cancelCatalogMount?.();
    const root = document.getElementById('pveHuntView');
    if (!root) return;
    const viewMode = getPveViewMode(), user = loadUser();
    const bonus = battleState.characterBonus || {}, cardPower = battleState.deck.reduce((sum, id) => {
      const card = cards.find(item => String(item.id) === String(id));
      return sum + (card ? battleCardPower(card, user, battleState.config) : 0);
    }, 0);
    const totalPower = cardPower + Number(bonus.pve || 0) + Number(globalThis.MercenaryDeckSlot?.power?.('PVE') || 0), violation = pveDeckLimitViolation(), ready = deckCardCount(battleState.deck) === 5 && !violation;
    document.getElementById('pveCommandV2')?.setAttribute('data-screen', viewMode);
    root.classList.toggle('pve-view-deck', viewMode === 'deck');
    root.classList.toggle('pve-view-hunt', viewMode === 'hunt');
    if (viewMode === 'deck') {
      const ownedSet = ownedIds(user), visibilityPolicy = globalThis.CNineCardVisibilityV1908;
      const visibleCatalog = typeof visibilityPolicy?.filterCollectionCards === 'function' ? visibilityPolicy.filterCollectionCards(cards, user) : collectionSurfaceCards(cards, user);
      const owned = visibleCatalog.filter(card => ownedSet.has(card.id));
      const catalogWasRendered = !!root.querySelector('#battleCards .virtual-card-chunk, #battleCards .deck-filter-empty');
      root.innerHTML = deckScreenMarkup({ deckCount: deckCardCount(battleState.deck), totalPower, ready, violation, cardPower, equipment: Number(bonus.equipmentPve || 0), battleSuit: Number(bonus.battleSuitPve || 0), garage: Number(bonus.garagePve || 0), title: Number(bonus.titlePve || 0) });
      const deckRoot = document.getElementById('battleDeck');
      const formation = pveDeckRules().formation;
      const front = Number(formation.front ?? formation.frontSlots ?? 2);
      if (deckRoot) deckRoot.innerHTML = Array.from({ length: 5 }, (_, index) => {
        const card = cards.find(item => String(item.id) === String(battleState.deck[index]));
        const position = index < front ? `전열 ${index + 1}` : `후열 ${index - front + 1}`;
        return card ? `<button type="button" class="pvev2-live-card-slot filled" data-remove="${esc(card.id)}" aria-label="${position} ${esc(card.title || card.name)} 제외"><span class="pvev2-slot-position">${position}</span>${pveDeckCardMini(card, user)}<span class="pvev2-live-remove">덱에서 빼기</span></button>` : emptyDeckSlot(index, position);
      }).join('');
      mountDeckCatalog(owned, user, catalogWasRendered);
      bindPveDeckFilters(owned, user);
      root.querySelectorAll('[data-remove]').forEach(button => button.onclick = () => { clearDeckSlot(battleState,button.dataset.remove); renderBattleBuilder(); });
      root.querySelectorAll('[data-pve-empty]').forEach(button => {
        const selectSlot = () => {
          selectEmptyDeckSlot(battleState, Number(button.dataset.pveEmpty));
          renderBattleBuilder();
          const heading = document.getElementById('pveOwnedCardsTitle');
          heading?.focus({preventScroll:true});
          heading?.scrollIntoView({block:'nearest'});
        };
        button.onclick = selectSlot;
        button.onkeydown = event => {
          if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); selectSlot(); }
        };
      });
      const save = document.getElementById('saveBattleDeck'); if (save) save.onclick = saveBattleDeck;
      const reset = document.getElementById('clearBattleDeck'); if (reset) reset.onclick = resetBattleDeck;
      const hunt = document.getElementById('pveV2GoHunt'); if (hunt) hunt.onclick = () => switchPveMode('hunt');
      bindPveDeckRulesDialog(root);
    } else {
      activeVirtualCardLists.get('pve')?.destroy?.();
      root.innerHTML = `<section class="pvev2-screen pvev2-hunt-screen"><div class="pvev2-backdrop hunt"></div><div class="pvev2-content">${screenHead('PVE / TARGET ACQUISITION', '몬스터 토벌', '난이도와 보상을 확인하고 토벌 대상을 선택하세요.')}<div id="battleMonsters"></div></div></section>`;
      warmFeatureForTab('battle');
      renderPveMonsterBrowserV2();
    }
    const autoToggle = root.querySelector('#battleAuto');
    if (autoToggle) autoToggle.onchange = renderBattleEnergy;
    renderBattleEnergy();
    installPveDeckRuleGuard(root);
    syncModeNavigation();
    const evolutionEntry = document.getElementById('pveV2EvolutionEntry');
    if (evolutionEntry) evolutionEntry.onclick = () => renderShell('evolution');
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
