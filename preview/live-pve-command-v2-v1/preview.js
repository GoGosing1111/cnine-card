(() => {
  'use strict';

  const PROD = 'https://cnine-card.pages.dev/';
  const root = document.getElementById('pveCommandV2');
  const viewport = document.getElementById('pvev2Viewport');
  const toast = document.getElementById('pvev2Toast');
  const fallbackCardImage = `data:image/svg+xml;charset=UTF-8,${encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 360 520"><rect width="360" height="520" fill="#08121a"/><rect x="24" y="24" width="312" height="472" fill="none" stroke="#294653" stroke-width="2"/><path d="M54 176h252M54 260h252M54 344h252" stroke="#17313d" stroke-width="2"/><rect x="72" y="211" width="216" height="98" fill="#0c1b24" stroke="#4b7788" stroke-width="2"/><text x="180" y="254" fill="#79d9e8" font-family="Arial,sans-serif" font-size="22" font-weight="700" text-anchor="middle">SOOP</text><text x="180" y="282" fill="#8196a0" font-family="Arial,sans-serif" font-size="13" text-anchor="middle">IMAGE CHECK REQUIRED</text></svg>')}`;
  const state = { screen: 'deck', catalog: [], deck: [], inventory: [], grade: 'ALL', search: '', difficulty: 'NORMAL', monsterId: 1, evolutionType: 'ZENITH_ASCENSION', candidateId: '' };
  const gradeWeight = { SUPERSTAR: 13, ZENITH: 12, FUR: 11, PRESTIGE: 10, LIMITED: 9, MA: 8, SSR: 7, UR: 6, HR: 5, SR: 4, R: 3, U: 2, C: 1 };
  const gradePower = { SUPERSTAR: 120000, ZENITH: 96000, FUR: 78000, PRESTIGE: 72000, LIMITED: 58000, MA: 44000, SSR: 33000, UR: 24000, HR: 18000, SR: 13000, R: 9000, U: 6000, C: 3500 };
  const fakerChampionshipCardId = 'CN-0B48C6FF8F9B4AC5';
  let monsters = [];
  const raidRanks = [
    ['핑크빛유두', 184230400, 100, true], ['moo우에디아', 163821900, 89], ['라네트', 151090200, 82], ['족메시', 128334000, 70], ['키친876', 118772300, 64], ['폭군#', 96311000, 52], ['RUNEBlRUN', 87650200, 47], ['채리♡', 74218900, 40]
  ];

  const cleanPath = (value = '') => String(value).replaceAll('\\', '/').replace(/^\/+/, '');
  const imageUrl = (value = '') => {
    const raw = String(value || '').trim();
    if (!raw) return '';
    if (/^https?:\/\//i.test(raw)) return raw;
    return PROD + cleanPath(raw);
  };
  const esc = (value = '') => String(value).replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
  const num = (value) => Number(value || 0).toLocaleString('ko-KR');
  const role = (card = {}) => ({ TOP: '방어형', HIGH: '공격형', FIXED: '균형형', CUSTOM: '전술형', NORMAL: '기본형' }[String(card.powerType || '').toUpperCase()] || '기본형');
  const power = (card = {}) => Math.max(Number(card.basePower || 0) * 24, gradePower[String(card.grade || '').toUpperCase()] || 3500);
  const notify = (message) => { toast.textContent = message; toast.classList.add('show'); clearTimeout(notify.timer); notify.timer = setTimeout(() => toast.classList.remove('show'), 1800); };

  function originalFrameHtml(card, grade) {
    const cardId = String(card?.id || '').toUpperCase();
    if (cardId === fakerChampionshipCardId) return '<img class="pvev2-original-frame faker" src="../../assets/ui/card-frames/faker-t1-championship-frame-v2.png" alt="" aria-hidden="true">';
    if (grade === 'SUPERSTAR') return '<img class="pvev2-original-frame superstar" src="../../assets/ui/card-frames/superstar-championship-frame-v1.webp" alt="" aria-hidden="true">';
    if (grade === 'ZENITH') return '<img class="pvev2-original-frame zenith" src="../../assets/ui/card-frames/zenith-frame-concept-v2.png" alt="" aria-hidden="true">';
    if (grade === 'FUR') return '<img class="pvev2-original-frame fur" src="../../assets/ui/card-frames/fur-tier-frame-13.png" alt="" aria-hidden="true">';
    return '';
  }

  function cardHtml(card, { index = '', compact = false } = {}) {
    if (!card) return '<article class="pvev2-card empty"><span><b>+</b><small>카드 선택</small></span></article>';
    const grade = String(card.grade || 'C').toUpperCase();
    const frame = originalFrameHtml(card, grade);
    return `<article class="pvev2-card${compact ? ' compact' : ''}${frame ? ' has-original-frame' : ''}" data-grade="${esc(grade)}" data-frame="${String(card.id || '').toUpperCase() === fakerChampionshipCardId ? 'faker' : grade.toLowerCase()}">
      <img class="pvev2-card-art" src="${esc(imageUrl(card.image))}" alt="${esc(card.title || card.name || '카드')}" style="object-position:${Number(card.focusX ?? 50)}% ${Number(card.focusY ?? 50)}%" loading="lazy">
      <span class="pvev2-card-shade"></span>${index ? `<i class="pvev2-card-index">SLOT ${esc(index)}</i>` : ''}
      <b class="pvev2-card-grade">${esc(grade)}</b><strong class="pvev2-card-level">+${grade === 'ZENITH' ? 10 : 13}</strong>
      <span class="pvev2-card-copy"><small>${esc(card.name || '')}</small><b>${esc(card.title || card.name || '')}</b><em>${role(card)} · ${num(power(card))}</em></span>
      ${frame}
    </article>`;
  }

  function screenHead(kicker, title, description, side = '') {
    return `<header class="pvev2-section-head"><div><span class="pvev2-kicker">${esc(kicker)}</span><h1>${esc(title)}</h1><p>${esc(description)}</p></div>${side}</header>`;
  }

  function renderDeck() {
    const total = state.deck.reduce((sum, card) => sum + power(card), 0) + 283500 + 90000 + 15000;
    const gradeOptions = ['ALL', 'SUPERSTAR', 'ZENITH', 'FUR', 'PRESTIGE', 'LIMITED', 'MA', 'SSR', 'UR'];
    const filtered = state.inventory.filter((card) => (state.grade === 'ALL' || card.grade === state.grade) && `${card.title} ${card.name}`.toLowerCase().includes(state.search.toLowerCase()));
    viewport.innerHTML = `<section class="pvev2-screen pvev2-deck-screen"><div class="pvev2-backdrop deck"></div><div class="pvev2-content">
      ${screenHead('PVE / DEPLOYMENT CONTROL', '출전 편성실', '카드 5장을 하나의 전술 단위로 구성합니다. 카드와 슬롯을 크게 유지하고 저장·전투 준비 상태를 한 화면에서 확인합니다.', `<div class="pvev2-operation-rail"><article><small>편성 카드</small><b>${state.deck.length} / 5</b></article><article><small>잔여 행동력</small><b>15 / 15</b></article><article><small>출전 전투력</small><b>${num(total)}</b></article><article class="ready"><small>DEPLOY STATUS</small><b>READY</b></article></div>`)}
      <section class="pvev2-deck-console"><header class="pvev2-console-head"><div><small>ACTIVE PVE FORMATION</small><b>저장된 출전 덱</b></div><div class="pvev2-console-actions"><button class="pvev2-btn" type="button" data-preview-action="reset">편성 초기화</button><button class="pvev2-btn primary" type="button" data-preview-action="save">덱 저장</button></div></header>
        <div class="pvev2-roster">${Array.from({ length: 5 }, (_, index) => cardHtml(state.deck[index], { index: String(index + 1).padStart(2, '0') })).join('')}</div>
        <footer class="pvev2-roster-foot"><article><small>CARD POWER</small><b>${num(state.deck.reduce((s, c) => s + power(c), 0))}</b></article><article><small>EQUIPMENT</small><b>283,500</b></article><article><small>VEHICLE</small><b>90,000</b></article><article class="total"><small>TOTAL COMBAT</small><b>${num(total)}</b></article><div class="pvev2-console-actions"><button class="pvev2-btn primary" type="button" data-screen-target="hunt">토벌 목표 선택</button></div></footer>
      </section>
      <section class="pvev2-inventory"><header class="pvev2-console-head"><div><small>OWNED CARD CATALOG</small><b>보유 카드 편성</b></div><span class="pvev2-status-line"><i></i>LIVE DB CATALOG · ${filtered.length}장</span></header>
        <div class="pvev2-inventory-tools"><label class="pvev2-field"><svg viewBox="0 0 24 24"><path d="M4 6h16M7 12h10M10 18h4"/></svg><input id="pvev2Search" type="search" value="${esc(state.search)}" placeholder="카드명 또는 멤버 검색"></label><label class="pvev2-field"><select id="pvev2Grade">${gradeOptions.map((grade) => `<option value="${grade}" ${state.grade === grade ? 'selected' : ''}>${grade === 'ALL' ? '전체 등급' : grade}</option>`).join('')}</select></label><label class="pvev2-field"><select><option>전투력 높은순</option><option>등급 높은순</option><option>이름순</option></select></label><span class="pvev2-result-count">선택하면 가장 낮은 슬롯과 교체</span></div>
        <div class="pvev2-card-grid">${filtered.slice(0, 40).map((card) => `<button class="pvev2-card-pick" type="button" data-card-pick="${esc(card.id)}">${cardHtml(card)}</button>`).join('')}</div>
      </section>
    </div></section>`;
  }

  function renderHunt() {
    const selected = monsters.find((monster) => monster.id === state.monsterId) || monsters[0];
    if (!selected) {
      viewport.innerHTML = `<section class="pvev2-screen"><div class="pvev2-backdrop hunt"></div><div class="pvev2-content">${screenHead('PVE / TARGET ACQUISITION', '몬스터 토벌', 'CMS 몬스터 정보를 불러오는 중입니다.')}</div></section>`;
      return;
    }
    const rows = monsters.filter((monster) => monster.tab === state.difficulty);
    viewport.innerHTML = `<section class="pvev2-screen"><div class="pvev2-backdrop hunt"></div><div class="pvev2-content">
      ${screenHead('PVE / TARGET ACQUISITION', '몬스터 토벌', 'CMS에 등록된 토벌 몬스터 이름·원본 이미지·전투 데이터를 그대로 표시합니다.', '<span class="pvev2-status-line"><i></i>CMS MONSTER DATA · LIVE CONTRACT</span>')}
      <section class="pvev2-hunt-hero"><div class="pvev2-hunt-visual monster-art"><span class="pvev2-target-code"><small>CMS TARGET</small><b>${esc(selected.code)}</b></span><img class="pvev2-hunt-monster-image" src="${esc(imageUrl(selected.image))}" alt="${esc(selected.name)}" loading="eager"><span class="pvev2-monster-source"><small>MONSTER ART</small><b>CMS ORIGINAL</b></span></div><div class="pvev2-hunt-copy"><span class="pvev2-kicker">${selected.tab} THREAT · ${selected.code}</span><h1>${esc(selected.name)}</h1><p>${esc(selected.copy)}</p><div class="pvev2-hunt-stats"><article><small>REQUIRED POWER</small><b>${num(selected.power)}</b></article><article><small>MY COMBAT</small><b>500,950</b></article><article><small>VICTORY REWARD</small><b>${num(selected.reward)} COIN</b></article></div><div class="pvev2-hunt-actions"><label class="pvev2-auto"><input type="checkbox"><span><b>잔여 행동력 자동 전투</b><small>현재 선택 목표를 행동력 소진까지 반복합니다.</small></span></label><button class="pvev2-btn primary" type="button" data-preview-action="battle">전투 시작</button></div></div></section>
      <section class="pvev2-hunt-list"><nav class="pvev2-difficulty">${['NORMAL', 'HARD', 'HELL', 'NIGHTMARE'].map((tab) => `<button type="button" class="${state.difficulty === tab ? 'active' : ''}" data-difficulty="${tab}">${({ NORMAL: '노말', HARD: '하드', HELL: '헬', NIGHTMARE: '나이트메어' })[tab]}</button>`).join('')}</nav><div class="pvev2-monster-grid">${rows.map((monster) => `<button type="button" class="pvev2-monster ${monster.id === selected.id ? 'active' : ''}" data-monster-id="${monster.id}"><img src="${esc(imageUrl(monster.image))}" alt="${esc(monster.name)}" loading="lazy"><span><small>${monster.tab} TARGET · ${monster.code}</small><b>${esc(monster.name)}</b><em>전투력 ${num(monster.power)}</em><strong>보상 ${num(monster.reward)} COIN</strong></span></button>`).join('')}</div></section>
    </div></section>`;
  }

  function renderRaid() {
    const boss = [...monsters].reverse().find((monster) => monster.isBoss) || monsters[monsters.length - 1] || { image: '', name: '레이드 보스' };
    viewport.innerHTML = `<section class="pvev2-screen"><div class="pvev2-backdrop raid"></div><div class="pvev2-content">
      ${screenHead('WORLD RAID / ACTIVE INSTANCE', '차원 붕괴전', '월드레이드의 전투·파티 생존·누적 기여도를 한 화면에 통합한 신규 전장 인터페이스입니다.', '<span class="pvev2-status-line"><i></i>RAID INSTANCE 07 · 18 / 30</span>')}
      <div class="pvev2-raid-shell"><section class="pvev2-raid-stage"><header class="pvev2-raid-top"><div><span class="pvev2-kicker">OBSIDIAN BREACH</span><h1>해적왕 · 종말 단계</h1></div><div class="pvev2-raid-timer"><small>TIME REMAINING</small><b>01:42</b></div></header><div class="pvev2-boss-hp"><header><div><small>BOSS INTEGRITY</small><b>해적왕</b></div><strong>684,220,430 / 1,200,000,000</strong></header><span><i style="width:57%"></i></span></div><div class="pvev2-boss-figure"><img src="${boss.image}" alt="해적왕"></div><div class="pvev2-raid-readout"><article><small>PHASE</small><b>03</b><span>최종 패턴 진입</span></article><article><small>PARTY SURVIVAL</small><b>16 / 18</b><span>2명 전투 불능</span></article><article><small>SERVER DPS</small><b>24.8M</b><span>최근 10초 평균</span></article><article><small>MY POSITION</small><b>1위</b><span>기여도 12.4%</span></article></div><div class="pvev2-raid-deck"><span class="pvev2-raid-deck-head"><small>MY RAID DECK</small><b>출전 전투력 500,950</b></span>${state.deck.map((card) => cardHtml(card, { compact: true })).join('')}<button class="pvev2-btn primary" type="button" data-preview-action="raid">내 V3 전투 시작</button></div></section>
      <aside class="pvev2-raid-side"><header class="pvev2-raid-side-head"><small>LIVE DAMAGE LEDGER</small><h2>실시간 기여도</h2></header><div class="pvev2-rank-list">${raidRanks.map(([name, damage, pct, me], index) => `<article class="pvev2-rank ${me ? 'me' : ''}"><i>${String(index + 1).padStart(2, '0')}</i><span><b>${esc(name)}${me ? ' · ME' : ''}</b><small><i style="width:${pct}%"></i></small></span><strong>${num(damage)}</strong></article>`).join('')}</div><div class="pvev2-raid-my"><article><small>MY DAMAGE</small><b>184.2M</b></article><article><small>MY HP</small><b>82%</b></article></div><p class="pvev2-raid-log">보스 강제 공격 4.2초 후 · 방어형 효과 전개 중<br>파티 합산은 서버 기준으로 동기화됩니다.</p></aside></div>
    </div></section>`;
  }

  function candidatePool() {
    const source = state.evolutionType === 'ZENITH_ASCENSION' ? 'LIMITED' : state.evolutionType === 'PRESTIGE_ASCENSION' ? 'MA' : 'SSR';
    return state.catalog.filter((card) => card.grade === source).slice(0, 12);
  }

  function renderEvolution() {
    const pool = candidatePool();
    if (!pool.some((card) => card.id === state.candidateId)) state.candidateId = pool[0]?.id || '';
    const selected = pool.find((card) => card.id === state.candidateId) || pool[0];
    const config = state.evolutionType === 'ZENITH_ASCENSION'
      ? { label: 'ZENITH ASCENSION', route: 'LIMITED +13 → ZENITH', material: '마스터의 별 30개', coin: '5,000,000 코인', rate: '25%', pity: '6 / 7', result: 'ZENITH' }
      : state.evolutionType === 'PRESTIGE_ASCENSION'
        ? { label: 'PRESTIGE ASCENSION', route: 'MA +13 → PRESTIGE', material: '마스터의 별 20개', coin: '원본 카드 성공 시 소모', rate: '35%', pity: '2 / 4', result: 'PRESTIGE' }
        : { label: 'STANDARD EVOLUTION', route: 'SSR +10 → MA', material: '카드조각 4,800개', coin: '1,500,000 코인', rate: '40%', pity: '1 / 5', result: 'MA' };
    viewport.innerHTML = `<section class="pvev2-screen"><div class="pvev2-backdrop evolution"></div><div class="pvev2-content"><header class="pvev2-evo-head"><div><span class="pvev2-kicker">CARD EVOLUTION / LINE CONTROL</span><h1>카드 진화 공정</h1><p>재료 선택부터 결과 풀 확인까지 한 방향으로 읽히는 선형 공정 화면입니다.</p></div><div class="pvev2-resource-box"><article><small>MASTER RESOURCE</small><b>158개</b></article><article><small>AVAILABLE COIN</small><b>3.73B</b></article></div></header>
      <nav class="pvev2-evo-types">${[
        ['STANDARD_EVOLUTION', 'STANDARD EVOLUTION', 'SSR +10 → MA', '확률·천장 방식'],
        ['PRESTIGE_ASCENSION', 'PRESTIGE ASCENSION', 'MA +13 → PRESTIGE', '미보유 결과 우선'],
        ['ZENITH_ASCENSION', 'ZENITH ASCENSION', 'LIMITED +13 → ZENITH', '25% · 7회 확정']
      ].map(([id, small, title, text]) => `<button type="button" class="${state.evolutionType === id ? 'active' : ''}" data-evolution-type="${id}"><small>${small}</small><b>${title}</b><span>${text}</span></button>`).join('')}</nav>
      <div class="pvev2-evo-layout"><aside class="pvev2-evo-candidates"><header><small>ELIGIBLE MATERIAL</small><b>진화 대상 카드 · ${pool.length}장</b></header><div class="pvev2-evo-list">${pool.map((card) => `<button type="button" class="pvev2-evo-candidate ${card.id === selected?.id ? 'active' : ''}" data-candidate-id="${esc(card.id)}"><img src="${esc(imageUrl(card.image))}" alt="${esc(card.title)}"><span><small>${esc(card.grade)} +13 · 보유 2장</small><b>${esc(card.title)}</b><em>진화 가능</em></span></button>`).join('')}</div></aside>
        <section><div class="pvev2-evo-process"><article class="pvev2-evo-module"><header class="pvev2-module-head"><small>01 / SOURCE CARD</small><b>선택 완료</b></header><div class="pvev2-evo-card">${cardHtml(selected)}</div><div class="pvev2-evo-module-copy"><small>INPUT MATERIAL</small><b>${esc(selected?.title || '카드 선택')}</b><span>성공 시 원본 1장이 소모됩니다. 실패 시 강화 단계는 유지됩니다.</span></div></article>
          <article class="pvev2-evo-module process"><header class="pvev2-module-head"><small>02 / CONVERSION</small><b>${config.label}</b></header><div class="pvev2-conversion-stack"><article><i class="pvev2-material-mark">MS</i><span><small>PRIMARY MATERIAL</small><b>${config.material}</b></span><em>충족</em></article><article><i class="pvev2-material-mark">COIN</i><span><small>PROCESS COST</small><b>${config.coin}</b></span><em>충족</em></article></div><div class="pvev2-rate-panel"><small>SUCCESS RATE</small><b>${config.rate}</b><span>천장 진행 ${config.pity}</span></div><div class="pvev2-process-bar"><i></i></div><div class="pvev2-evo-module-copy"><small>PROCESS RULE</small><b>${config.route}</b><span>서버가 재료·성공 확률·결과 풀을 다시 검증한 뒤 최종 처리합니다.</span></div></article>
          <article class="pvev2-evo-module result"><header class="pvev2-module-head"><small>03 / RESULT POOL</small><b>랜덤 1장</b></header><div class="pvev2-mystery-card"><b>?</b><small>${config.result} RESULT</small></div><div class="pvev2-evo-module-copy"><small>OUTPUT</small><b>공개 ${config.result} 카드</b><span>현재 CMS에 공개된 결과 카드 중 동일 확률로 결정됩니다.</span></div></article></div>
          <footer class="pvev2-evo-action"><div class="pvev2-evo-warning"><b>최종 확인 후 되돌릴 수 없습니다.</b><span>실패 시에도 설정된 재료가 소모되며, 성공 시 결과 카드는 도감에 즉시 등록됩니다.</span></div><button class="pvev2-btn primary" type="button" data-preview-action="evolution">${esc(selected?.title || '카드')} 진화 도전</button></footer>
        </section></div>
    </div></section>`;
  }

  function renderUnavailable() {
    viewport.innerHTML = `<section class="pvev2-screen"><div class="pvev2-backdrop deck"></div><div class="pvev2-content">${screenHead('EXISTING LIVE CONTENT', '기존 콘텐츠 진입 계약', '이 메뉴는 이번 상세 리뉴얼 범위 밖이며, 승인 후 라이브의 기존 화면과 기능을 그대로 연결합니다.')}</div></section>`;
  }

  function render() {
    root.dataset.screen = state.screen;
    document.querySelectorAll('[data-screen-target]').forEach((button) => button.setAttribute('aria-selected', String(button.dataset.screenTarget === state.screen)));
    if (state.screen === 'deck') renderDeck();
    else if (state.screen === 'hunt') renderHunt();
    else if (state.screen === 'raid') renderRaid();
    else if (state.screen === 'evolution') renderEvolution();
    else renderUnavailable();
    const url = new URL(location.href); url.searchParams.set('tab', state.screen); history.replaceState(null, '', url);
  }

  function bind() {
    document.addEventListener('error', (event) => {
      const image = event.target;
      if (!(image instanceof HTMLImageElement) || image.dataset.fallbackApplied) return;
      image.dataset.fallbackApplied = 'true';
      image.removeAttribute('srcset');
      image.src = fallbackCardImage;
    }, true);
    document.addEventListener('click', (event) => {
      const target = event.target.closest('[data-screen-target]');
      if (target) { state.screen = target.dataset.screenTarget; render(); window.scrollTo({ top: 0, behavior: 'smooth' }); return; }
      const pick = event.target.closest('[data-card-pick]');
      if (pick) { const card = state.catalog.find((item) => String(item.id) === pick.dataset.cardPick); if (card) { const slot = state.deck.findIndex((item) => power(item) === Math.min(...state.deck.map(power))); if (slot >= 0) state.deck.splice(slot, 1, card); else if (state.deck.length < 5) state.deck.push(card); renderDeck(); } return; }
      const monster = event.target.closest('[data-monster-id]');
      if (monster) { state.monsterId = Number(monster.dataset.monsterId); renderHunt(); return; }
      const difficulty = event.target.closest('[data-difficulty]');
      if (difficulty) { state.difficulty = difficulty.dataset.difficulty; state.monsterId = monsters.find((item) => item.tab === state.difficulty)?.id || 1; renderHunt(); return; }
      const evolutionType = event.target.closest('[data-evolution-type]');
      if (evolutionType) { state.evolutionType = evolutionType.dataset.evolutionType; state.candidateId = ''; renderEvolution(); return; }
      const candidate = event.target.closest('[data-candidate-id]');
      if (candidate) { state.candidateId = candidate.dataset.candidateId; renderEvolution(); return; }
      const action = event.target.closest('[data-preview-action]')?.dataset.previewAction;
      if (action === 'reset') { state.deck = []; renderDeck(); }
      else if (action) notify('프리뷰 확인용 · 라이브에서는 기존 서버 검증 API가 실행됩니다.');
    });
    document.addEventListener('input', (event) => { if (event.target.id === 'pvev2Search') { state.search = event.target.value; renderDeck(); document.getElementById('pvev2Search')?.focus(); } });
    document.addEventListener('change', (event) => { if (event.target.id === 'pvev2Grade') { state.grade = event.target.value; renderDeck(); } });
  }

  async function loadMonsterCatalog() {
    const normalize = (row, index = 0, fallbackTab = '') => {
      const rawTab = String(row.pveTab || row.tab || fallbackTab || (Number(row.isBoss) ? 'HELL' : 'NORMAL')).toUpperCase();
      const tab = ['NORMAL', 'HARD', 'HELL', 'NIGHTMARE'].includes(rawTab) ? rawTab : (Number(row.isBoss) ? 'HELL' : 'NORMAL');
      const id = Number(row.id || row.monsterId || index + 1);
      const isBoss = Boolean(Number(row.isBoss ?? row.is_boss ?? 0));
      return {
        id,
        tab,
        code: `H-${String(id).padStart(3, '0')}`,
        name: String(row.name || `토벌 대상 ${id}`),
        power: Math.max(1, Number(row.battlePower || row.battle_power || 80000 + index * 42000)),
        reward: Math.max(0, Number(row.rewardCoin || row.reward_coin || 180000 + index * 90000)),
        image: String(row.image || row.imageUrl || row.image_url || row.sourceArt || ''),
        isBoss,
        copy: isBoss ? 'CMS에 등록된 보스 토벌 대상입니다. 저장된 PVE 덱으로 도전할 수 있습니다.' : 'CMS에 등록된 일반 토벌 대상입니다. 저장된 PVE 덱으로 바로 진입할 수 있습니다.'
      };
    };
    for (const source of ['../../api/battle/config', `${PROD}api/battle/config`]) {
      try {
        const response = await fetch(source, { cache: 'no-store', credentials: 'include' });
        if (!response.ok) continue;
        const data = await response.json();
        const rows = Array.isArray(data?.monsters) ? data.monsters : [];
        const liveRows = rows.filter((row) => row && row.image && row.pveEnabled !== 0 && row.pveEnabled !== false && row.towerOnly !== 1 && row.towerOnly !== true).map(normalize);
        if (liveRows.length) { monsters = liveRows; break; }
      } catch (_) {}
    }
    if (!monsters.length) {
      try {
        const response = await fetch('../../assets/ui/project-v/monsters/hunt-tower/manifest-v1.json', { cache: 'no-store' });
        const manifest = response.ok ? await response.json() : null;
        const rows = (manifest?.sprites || []).filter((row) => (row.mode === 'HUNT' || row.modes?.includes('HUNT')) && row.sourceArt && !String(row.sourceArt).startsWith('LIVE_DB:'));
        const groupSize = Math.max(1, Math.ceil(rows.length / 4));
        monsters = rows.map((row, index) => normalize(row, index, ['NORMAL', 'HARD', 'HELL', 'NIGHTMARE'][Math.min(3, Math.floor(index / groupSize))]));
      } catch (_) { monsters = []; }
    }
    const availableTabs = ['NORMAL', 'HARD', 'HELL', 'NIGHTMARE'].filter((tab) => monsters.some((monster) => monster.tab === tab));
    if (!availableTabs.includes(state.difficulty)) state.difficulty = availableTabs[0] || 'NORMAL';
    state.monsterId = monsters.find((monster) => monster.tab === state.difficulty)?.id || monsters[0]?.id || 0;
  }

  async function loadCatalog() {
    const sources = [`${PROD}api/cards`, '../../data/cards.json'];
    let rows = [];
    for (const source of sources) {
      try { const response = await fetch(source, { cache: 'no-store' }); if (!response.ok) continue; const data = await response.json(); rows = Array.isArray(data) ? data : data.cards; if (Array.isArray(rows) && rows.length) break; } catch (_) {}
    }
    state.catalog = (rows || []).map((card) => ({ ...card, id: String(card.id || ''), grade: String(card.grade || card.rarity || 'C').toUpperCase(), focusX: Number(card.focusX ?? card.focus_x ?? 50), focusY: Number(card.focusY ?? card.focus_y ?? 50) })).filter((card) => card.id && card.image && card.retirementStatus !== 'RETIRED');
    state.catalog.sort((a, b) => (gradeWeight[b.grade] || 0) - (gradeWeight[a.grade] || 0) || power(b) - power(a));
    const selected = [];
    for (const grade of ['PRESTIGE', 'FUR', 'FUR', 'PRESTIGE', 'ZENITH']) {
      const card = state.catalog.find((item) => item.grade === grade && !selected.includes(item)); if (card) selected.push(card);
    }
    state.deck = selected.length === 5 ? selected : state.catalog.slice(0, 5);
    state.inventory = state.catalog.filter((card) => !state.deck.some((item) => item.id === card.id));
    await loadMonsterCatalog();
    state.screen = new URL(location.href).searchParams.get('tab') || 'deck';
    if (!['deck', 'hunt', 'raid', 'evolution', 'escort', 'siege', 'seal', 'idle', 'tower'].includes(state.screen)) state.screen = 'deck';
    render();
  }

  bind();
  loadCatalog();
})();
