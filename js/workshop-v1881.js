(() => {
  'use strict';

  const esc = value => String(value ?? '').replace(/[&<>"']/g, char => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[char]));
  const fmt = value => Number(value || 0).toLocaleString('ko-KR');
  const asset = value => {
    const raw = String(value || '').trim().replace(/\\/g, '/');
    if (!raw) return '';
    if (/^(?:https?:|data:|blob:)/i.test(raw)) return raw;
    return `/${raw.replace(/^\/+/, '').replace(/#/g, '%23').replace(/ /g, '%20')}`;
  };
  const normalizeImages = root => root?.querySelectorAll?.('img[src]')?.forEach(image => {
    const normalized = asset(image.getAttribute('src'));
    if (normalized && normalized !== image.getAttribute('src')) image.setAttribute('src', normalized);
  });
  const api = (path, options = {}) => window.apiRequest(path, options, { ttl: 0, timeoutMs: 45000 });
  const rid = prefix => `${prefix}-${Date.now()}-${crypto.randomUUID?.() || Math.random().toString(36).slice(2)}`;
  const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
  const sessionIdentity = () => {
    try {
      return String(localStorage.getItem('cnine_card_api_token') || sessionStorage.getItem('cnine_card_api_token') || '');
    } catch (_) {
      return '';
    }
  };

  const PARTS = [
    ['VEHICLE_PART_TIRE', '타이어', 'assets/ui/workshop/vehicle-part-tire-v1668.png'],
    ['VEHICLE_PART_FRAME', '프레임', 'assets/ui/workshop/vehicle-part-frame-v1668.png'],
    ['VEHICLE_PART_ENGINE', '엔진', 'assets/ui/workshop/vehicle-part-engine-v1668.png']
  ];
  const MYSTIC_ENERGY_CODE = 'STARLIGHT_ARMOR_CORE';
  const MYSTIC_ENERGY_IMAGE = 'assets/items/starlight-armor-core-v1749.png';
  const MATERIAL_PAYMENT_MODE = 'COIN_AND_CARD_SHARD';
  const materialCardShardCost = recipe => Number(recipe?.card_shard_cost ?? recipe?.cardShardCost ?? 0);

  let workshopState = null;
  let scrapyardState = null;
  let workshopSection = 'VEHICLE';
  let synthesisMode = 'READY';
  let selectedVehicleRecipe = 0;
  let selectedSynthesisRecipe = 0;
  let payment = 'COIN';
  let workshopBusy = false;
  let scrapyardBusy = false;
  let activeScrapRun = '';
  let scrapyardSyncVersion = 0;
  let routeEpoch = 0;
  let workshopLoadVersion = 0;
  let scrapyardLoadVersion = 0;
  let workshopActionVersion = 0;
  let scrapyardActionVersion = 0;
  let pendingVehicleRequest = null;
  let pendingSynthesisRequest = null;
  let pendingMaterialRequest = null;
  let pendingScrapyardRequest = null;
  let pendingRequestsLoaded = false;

  const PENDING_REQUESTS_KEY = 'cnine_pending_workshop_requests_v1881';
  const mutationSession = () => {
    const raw = sessionIdentity();
    let hash = 5381;
    for (let index = 0; index < raw.length; index += 1) hash = ((hash << 5) + hash) ^ raw.charCodeAt(index);
    return `${raw.length}:${hash >>> 0}`;
  };
  function mutationSlot(kind, value) {
    if (arguments.length > 1) {
      if (kind === 'vehicle') pendingVehicleRequest = value;
      else if (kind === 'synthesis') pendingSynthesisRequest = value;
      else if (kind === 'material') pendingMaterialRequest = value;
      else if (kind === 'scrapyard') pendingScrapyardRequest = value;
    }
    if (kind === 'vehicle') return pendingVehicleRequest;
    if (kind === 'synthesis') return pendingSynthesisRequest;
    if (kind === 'material') return pendingMaterialRequest;
    if (kind === 'scrapyard') return pendingScrapyardRequest;
    return null;
  }
  function persistPendingRequests() {
    try {
      sessionStorage.setItem(PENDING_REQUESTS_KEY, JSON.stringify({ vehicle: pendingVehicleRequest, synthesis: pendingSynthesisRequest, material: pendingMaterialRequest, scrapyard: pendingScrapyardRequest }));
    } catch (_) {}
  }
  function loadPendingRequests() {
    if (pendingRequestsLoaded) return;
    pendingRequestsLoaded = true;
    try {
      const saved = JSON.parse(sessionStorage.getItem(PENDING_REQUESTS_KEY) || '{}');
      pendingVehicleRequest = saved.vehicle || null;
      pendingSynthesisRequest = saved.synthesis || null;
      pendingMaterialRequest = saved.material || null;
      pendingScrapyardRequest = saved.scrapyard || null;
    } catch (_) {}
  }
  function prepareMutationRequest(kind, target, prefix) {
    const current = currentMutationRequest(kind);
    const normalizedTarget = String(target);
    if (current && current.target !== normalizedTarget) return { blocked: true, current };
    if (current) return { ...current, reused: true };
    const next = { requestId: rid(prefix), target: normalizedTarget, session: mutationSession(), createdAt: Date.now() };
    mutationSlot(kind, next);
    persistPendingRequests();
    return next;
  }
  function currentMutationRequest(kind) {
    loadPendingRequests();
    const session = mutationSession();
    let current = mutationSlot(kind);
    if (current && (current.session !== session || Date.now() - Number(current.createdAt || 0) > 86400000)) {
      mutationSlot(kind, null);
      current = null;
      persistPendingRequests();
    }
    return current;
  }
  function clearMutationRequest(kind, requestId) {
    loadPendingRequests();
    const current = mutationSlot(kind);
    if (!current || current.requestId !== requestId) return;
    mutationSlot(kind, null);
    persistPendingRequests();
  }
  const mutationStillProcessing = error => /같은 .*처리 중|처리 중입니다/i.test(String(error?.message || ''));
  const mutationTransportUncertain = error => !Number(error?.status) || mutationStillProcessing(error);
  const mutationRetryMessage = label => `${label} 결과 응답을 아직 확인하지 못했습니다.\n재료·재화가 다시 소모되지 않도록 요청번호를 보존했습니다. 잠시 후 같은 버튼을 누르면 동일 요청을 안전하게 재확인합니다.`;

  const workshopMounted = () => Boolean(document.getElementById('workshopRootV1881'));
  const scrapyardMounted = () => Boolean(document.getElementById('scrapyardRootV1881'));

  window.addEventListener('cnine:route-will-change', () => {
    routeEpoch += 1;
    workshopLoadVersion += 1;
    scrapyardLoadVersion += 1;
    scrapyardSyncVersion += 1;
  });

  function workshopView() {
    return `<section class="ws76 ws81-workshop"><div id="workshopRootV1881" class="ws76-root ws81-root"><div class="ws76-loading"><i></i><b>MASTER WORKS</b><span>차량·장비·재료 제작 설비를 가동하고 있습니다.</span></div></div></section>`;
  }

  function scrapyardView() {
    return `<section class="ws76 ws81-scrapyard"><div id="scrapyardRootV1881" class="ws76-root ws81-root"><div class="ws76-loading"><i></i><b>SALVAGE OPERATION</b><span>폐차장 원정 정보를 동기화하고 있습니다.</span></div></div></section>`;
  }

  function workshopHeader() {
    return `<header class="ws76-header ws81-header">
      <div class="ws81-header-code" aria-hidden="true"><span>MW</span><i>1881</i></div>
      <div><small>SOOPKETMON · MASTER WORKS</small><h1>제작소</h1><p>차량 제작·장비 합성·재료 제작 설비를 독립 운용합니다.</p></div>
      <aside>
        <span><small>COIN</small><b>${fmt(workshopState?.wallet?.coin)}</b></span>
        <span><small>CARD SHARD</small><b>${fmt(workshopState?.wallet?.cardShards)}</b></span>
        <span><small>MASTER STAR</small><b>${fmt(workshopState?.wallet?.masterStars)}</b></span>
      </aside>
    </header>`;
  }

  function scrapyardHeader() {
    const access = scrapyardState?.access || {};
    const ticket = scrapyardState?.ticket || {};
    const ticketQuantity = Number(access.ticketQuantity ?? ticket.quantity ?? 0);
    return `<header class="ws76-header ws81-header ws81-scrapyard-header">
      <div class="ws81-header-code" aria-hidden="true"><span>SV</span><i>WAVE</i></div>
      <div><small>PVE · SALVAGE OPERATION</small><h1>폐차장 원정</h1><p>저장된 PVE 덱으로 웨이브를 돌파하고 차량 부품을 회수합니다.</p></div>
      <aside>
        <span><small>출입 허가증</small><b>${fmt(ticketQuantity)}장</b></span>
        <span><small>오늘 남은 입장</small><b>${fmt(access.remainingRuns)}</b></span>
      </aside>
    </header>`;
  }

  function workshopNav() {
    return `<nav class="ws76-nav ws81-nav" aria-label="제작소 설비 선택">
      <button type="button" data-ws-section="VEHICLE" class="${workshopSection === 'VEHICLE' ? 'active' : ''}"><i>01</i><span><b>차량 제작</b><small>타이어 · 프레임 · 엔진 조립</small></span></button>
      <button type="button" data-ws-section="SYNTHESIS" class="${workshopSection === 'SYNTHESIS' ? 'active' : ''}"><i>02</i><span><b>장비 합성</b><small>활성 계보 · 전체 합성 계보</small></span></button>
      <button type="button" data-ws-section="MATERIAL_CRAFT" class="${workshopSection === 'MATERIAL_CRAFT' ? 'active' : ''}"><i>03</i><span><b>재료 제작</b><small>고급 제작 에너지 변환</small></span></button>
    </nav>`;
  }

  function vehiclePartsBank() {
    return `<section class="ws81-parts-bank" aria-label="차량 제작 부품 보유량">
      <header><div><small>VEHICLE COMPONENT STORAGE</small><h2>차량 제작 부품</h2></div><p>차량 제작 설비에서만 조회되는 전용 재료입니다.</p></header>
      <div>${PARTS.map(([code, fallbackName, fallbackImage]) => {
        const item = workshopState?.inventory?.[code] || {};
        return `<article data-part-code="${code}"><img src="${esc(asset(item.image_url || fallbackImage))}" alt=""><span><small>보유 부품</small><b>${esc(item.name || fallbackName)}</b></span><strong>${fmt(item.quantity)}</strong></article>`;
      }).join('')}</div>
    </section>`;
  }

  function vehiclePanel() {
    const recipes = (workshopState?.recipes || []).filter(row => row.category === 'VEHICLE');
    const pending = currentMutationRequest('vehicle');
    const [pendingRecipeId, pendingPayment] = String(pending?.target || '').split(':');
    if (pending && ['COIN', 'MASTER_STAR'].includes(pendingPayment)) payment = pendingPayment;
    const recipe = recipes.find(row => Number(row.id) === Number(pendingRecipeId)) || recipes.find(row => Number(row.id) === Number(selectedVehicleRecipe)) || recipes[0];
    if (!recipe) return `${vehiclePartsBank()}<div class="ws76-panel ws81-empty-panel">등록된 차량 제작 레시피가 없습니다.</div>`;
    selectedVehicleRecipe = Number(recipe.id);
    const owned = code => Number(workshopState?.inventory?.[code]?.quantity || 0);
    const materialsReady = (recipe.materials || []).every(material => owned(material.item_code) >= Number(material.quantity));
    const currencyReady = payment === 'COIN'
      ? Number(workshopState?.wallet?.coin || 0) >= Number(recipe.coin_cost || 0)
      : Number(workshopState?.wallet?.masterStars || 0) >= Number(recipe.master_star_cost || 0);
    const recovering = pending?.target === `${recipe.id}:${payment}`;
    const ready = recovering || (!recipe.owned && materialsReady && currencyReady);
    return `${vehiclePartsBank()}<div class="ws76-craft-layout ws81-craft-layout">
      <aside class="ws76-blueprints">
        <small>VEHICLE BLUEPRINTS</small><h2>차량 설계도</h2>
        ${recipes.map(row => `<button type="button" data-recipe="${row.id}" class="${Number(row.id) === Number(recipe.id) ? 'active' : ''}"><img src="${esc(asset(row.output_image))}" alt=""><span><b>${esc(row.name)}</b><small>${esc(row.output_rarity)}</small></span></button>`).join('')}
      </aside>
      <section class="ws76-vehicle-stage">
        <header><div><small>ASSEMBLY BLUEPRINT</small><h2>${esc(recipe.name)}</h2><p>${esc(recipe.description)}</p></div><em>${Number(recipe.success_rate)}% SUCCESS</em></header>
        <div class="ws76-vehicle-preview"><i></i><img src="${esc(asset(recipe.output_image))}" alt=""><span>${esc(recipe.output_name)} · PVE +${fmt(recipe.output_pve)}</span></div>
        <div class="ws76-material-grid">${(recipe.materials || []).map(material => `<article class="${owned(material.item_code) >= Number(material.quantity) ? 'ok' : 'short'}"><img src="${esc(asset(material.image_url || workshopState?.inventory?.[material.item_code]?.image_url))}" alt=""><span><b>${esc(material.item_name)}</b><small>${fmt(owned(material.item_code))} / ${fmt(material.quantity)}</small></span></article>`).join('')}</div>
        <div class="ws76-pay"><button type="button" data-pay="COIN" class="${payment === 'COIN' ? 'active' : ''}">COIN ${fmt(recipe.coin_cost)}</button><button type="button" data-pay="MASTER_STAR" class="${payment === 'MASTER_STAR' ? 'active' : ''}">MASTER STAR ${fmt(recipe.master_star_cost)}</button></div>
        <button type="button" id="wsVehicleCraft" class="ws76-primary" ${ready && !workshopBusy ? '' : 'disabled'}>${workshopBusy ? '조립 공정 진행 중' : recovering ? '이전 차량 제작 결과 확인' : recipe.owned ? '이미 보유한 차량' : '차량 조립 시작'}</button>
      </section>
    </div>`;
  }

  const synthRequired = recipe => Math.max(1, Number(recipe?.input_quantity || 3));
  const canSynthesize = recipe => Number(recipe?.quantity || 0) >= synthRequired(recipe);

  function synthesisRows() {
    const all = workshopState?.synthesis || [];
    const pendingId = Number(currentMutationRequest('synthesis')?.target || 0);
    return synthesisMode === 'READY' ? all.filter(row => canSynthesize(row) || Number(row.recipe_id) === pendingId) : all;
  }

  function lineageItem(recipe) {
    const required = synthRequired(recipe);
    const available = canSynthesize(recipe);
    return `<button type="button" data-synth="${recipe.recipe_id}" class="ws81-lineage-item ${Number(recipe.recipe_id) === Number(selectedSynthesisRecipe) ? 'active' : ''} ${available ? 'ready' : 'locked'}">
      <span class="ws81-lineage-gear"><img src="${esc(asset(recipe.image_url))}" alt=""><i>${esc(recipe.rarity)}</i><b>${esc(recipe.name)}</b><small>보유 ${fmt(recipe.quantity)} / 필요 ${fmt(required)}</small></span>
      <span class="ws81-lineage-link" aria-hidden="true"><i></i><b>${available ? '합성 가능' : `${Math.max(0, required - Number(recipe.quantity || 0))}개 부족`}</b></span>
      <span class="ws81-lineage-gear output"><img src="${esc(asset(recipe.output_image))}" alt=""><i>${esc(recipe.output_rarity)}</i><b>${esc(recipe.output_name)}</b><small>PVE +${fmt(recipe.output_pve_power)}</small></span>
    </button>`;
  }

  function synthesisDetail(recipe) {
    const required = synthRequired(recipe);
    const available = canSynthesize(recipe);
    const recovering = currentMutationRequest('synthesis')?.target === String(recipe.recipe_id);
    return `<section class="ws78-synth-stage ws81-synth-detail">
      <header><div><small>SELECTED LINEAGE</small><h3>${esc(recipe.name)} 합성 계보</h3></div><span class="${available ? 'ready' : 'locked'}">${available ? '즉시 합성 가능' : `재료 ${Math.max(0, required - Number(recipe.quantity || 0))}개 부족`}</span></header>
      <div class="ws78-fusion-board ws81-fusion-board">
        <div class="ws78-input-zone"><small>투입 장비 · 보유 ${fmt(recipe.quantity)}개</small><div style="--required:${required}">${Array.from({ length: required }, (_, index) => `<figure class="${Number(recipe.quantity || 0) > index ? 'filled' : 'empty'}"><span>${Number(recipe.quantity || 0) > index ? esc(recipe.rarity) : 'EMPTY'}</span>${Number(recipe.quantity || 0) > index ? `<img src="${esc(asset(recipe.image_url))}" alt="">` : '<b>+</b>'}<figcaption>${Number(recipe.quantity || 0) > index ? esc(recipe.name) : '장비 필요'}</figcaption></figure>`).join('')}</div></div>
        <div class="ws78-fusion-core"><i></i><b>LINEAGE</b><strong>→</strong><em>${Number(recipe.success_rate ?? 100)}%</em></div>
        <div class="ws78-output-zone"><small>성공 시 결과</small><figure><span>${esc(recipe.output_rarity)}</span><img src="${esc(asset(recipe.output_image))}" alt=""><figcaption><b>${esc(recipe.output_name)}</b><em>PVE +${fmt(recipe.output_pve_power)} · PVP +${fmt(recipe.output_pvp_power)}</em></figcaption></figure></div>
      </div>
      <div class="ws78-synth-summary"><div><small>선택 장비</small><b>${esc(recipe.name)} × ${fmt(required)}</b></div><div><small>진화 결과</small><b>${esc(recipe.output_name)} × 1</b></div><div><small>합성 성공 확률</small><b>${Number(recipe.success_rate ?? 100)}%</b></div></div>
      <p class="ws78-risk">실패해도 투입한 ${esc(recipe.name)} ${fmt(required)}개는 영구 소모됩니다.</p>
      <button type="button" id="wsSynthStart" class="ws76-primary" ${workshopBusy || (!available && !recovering) ? 'disabled' : ''}>${workshopBusy ? '계보 재검증 중' : recovering ? '이전 장비 합성 결과 확인' : available ? `${Number(recipe.success_rate ?? 100)}% 확률로 합성 시작` : `동일 장비 ${fmt(required)}개 필요`}</button>
    </section>`;
  }

  function synthesisPanel() {
    const all = workshopState?.synthesis || [];
    const readyCount = all.filter(canSynthesize).length;
    const visible = synthesisRows();
    let recipe = visible.find(row => Number(row.recipe_id) === Number(selectedSynthesisRecipe)) || visible[0];
    if (recipe) selectedSynthesisRecipe = Number(recipe.recipe_id);
    return `<div class="ws76-synth ws81-synth">
      <header class="ws81-synth-command">
        <div><small>EQUIPMENT SYNTHESIS ARCHIVE</small><h2>장비 합성 계보</h2><p>보유 수량은 장착 중인 장비를 제외하고 계산하며, 실행 직전에 서버가 다시 검증합니다.</p></div>
        <div class="ws81-synth-modes" role="tablist" aria-label="합성 계보 보기 방식">
          <button type="button" role="tab" data-synth-mode="READY" aria-selected="${synthesisMode === 'READY'}" class="${synthesisMode === 'READY' ? 'active' : ''}"><span>활성화</span><b>${fmt(readyCount)}</b><small>지금 합성 가능</small></button>
          <button type="button" role="tab" data-synth-mode="ALL" aria-selected="${synthesisMode === 'ALL'}" class="${synthesisMode === 'ALL' ? 'active' : ''}"><span>전체보기</span><b>${fmt(all.length)}</b><small>공개 계보 전체</small></button>
        </div>
      </header>
      ${visible.length ? `<section class="ws81-lineage-browser"><header><div><small>${synthesisMode === 'READY' ? 'ACTIVE LINEAGES' : 'FULL LINEAGE ARCHIVE'}</small><h3>${synthesisMode === 'READY' ? '현재 합성 가능한 계보' : '전체 장비 합성 계보'}</h3></div><span>${fmt(visible.length)}개 계보</span></header><div class="ws81-lineage-list">${visible.map(lineageItem).join('')}</div></section>${synthesisDetail(recipe)}` : `<section class="ws81-no-ready"><span>ACTIVE LINEAGE 0</span><h3>현재 바로 합성 가능한 장비가 없습니다.</h3><p>장착 중인 장비는 재료 수량에서 제외됩니다. 전체 계보에서 필요한 장비와 부족 수량을 확인할 수 있습니다.</p><button type="button" data-synth-show-all>전체 계보 보기</button></section>`}
    </div>`;
  }

  function materialCraftPanel() {
    const recipes = (workshopState?.recipes || []).filter(row => row.category === 'MATERIAL_CRAFT');
    const pending = currentMutationRequest('material');
    const recipe = recipes.find(row => String(row.id) === String(pending?.target || ''))
      || recipes.find(row => String(row.output_ref || '').toUpperCase() === MYSTIC_ENERGY_CODE)
      || recipes[0];
    if (!recipe) {
      return `<section class="ws81-material-empty"><span>MATERIAL FABRICATION · 03</span><h2>재료 제작 설비 준비 중</h2><p>현재 공개된 재료 제작 레시피가 없습니다.</p></section>`;
    }
    const outputCode = String(recipe.output_ref || MYSTIC_ENERGY_CODE).toUpperCase();
    const outputItem = workshopState?.inventory?.[outputCode] || {};
    const coinOwned = Number(workshopState?.wallet?.coin || 0);
    const shardOwned = Number(workshopState?.wallet?.cardShards || 0);
    const coinCost = Number(recipe.coin_cost || 0);
    const shardCost = materialCardShardCost(recipe);
    const coinReady = coinOwned >= coinCost;
    const shardReady = shardOwned >= shardCost;
    const recovering = pending?.target === String(recipe.id);
    const ready = recovering || (coinReady && shardReady);
    const outputName = recipe.output_name || outputItem.name || '미스틱 에너지';
    const outputImage = recipe.output_image || outputItem.image_url || MYSTIC_ENERGY_IMAGE;
    const outputQuantity = Math.max(1, Number(recipe.output_quantity || 1));
    return `<section class="ws81-material-craft" aria-label="재료 제작">
      <header class="ws81-material-command"><div><small>MATERIAL FABRICATION · FACILITY 03</small><h2>${esc(outputName)} 제작</h2><p>${esc(recipe.description || '코인과 카드 조각을 고밀도 제작 에너지로 변환합니다.')}</p></div><span>${Number(recipe.success_rate ?? 100)}% 성공 확률</span></header>
      <div class="ws81-material-layout">
        <figure class="ws81-material-output">
          <div class="ws81-material-energy" aria-hidden="true"><i></i><i></i></div>
          <img src="${esc(asset(outputImage))}" alt="${esc(outputName)}">
          <figcaption><small>CRAFT OUTPUT · ${esc(recipe.output_rarity || outputItem.rarity || 'MYTHIC')}</small><b>${esc(outputName)} × ${fmt(outputQuantity)}</b><span>현재 보유 ${fmt(outputItem.quantity)}개</span></figcaption>
        </figure>
        <section class="ws81-material-requirements">
          <header><div><small>REQUIRED RESOURCES</small><h3>필요 제작 재화</h3></div><em>${coinReady && shardReady ? '제작 준비 완료' : '보유 재화 부족'}</em></header>
          <div class="ws81-material-costs">
            <article class="${coinReady ? 'ready' : 'short'}"><span><small>COIN</small><b>코인</b></span><strong>${fmt(coinCost)}</strong><em>보유 ${fmt(coinOwned)}</em></article>
            <article class="${shardReady ? 'ready' : 'short'}"><span><small>CARD SHARD</small><b>카드 조각</b></span><strong>${fmt(shardCost)}</strong><em>보유 ${fmt(shardOwned)}</em></article>
          </div>
          <div class="ws81-material-summary"><span><small>제작 결과</small><b>${esc(outputName)} × ${fmt(outputQuantity)}</b></span><span><small>성공 확률</small><b>${Number(recipe.success_rate ?? 100)}%</b></span></div>
          <p>제작 버튼을 누르면 서버가 코인과 카드 조각 잔액을 다시 확인합니다. 완료된 재료는 인벤토리에 즉시 지급됩니다.</p>
          <button type="button" id="wsMaterialCraft" class="ws76-primary" ${ready && !workshopBusy ? '' : 'disabled'}>${workshopBusy ? '재료 변환 공정 진행 중' : recovering ? '이전 재료 제작 결과 확인' : ready ? `${esc(outputName)} 제작` : '코인 또는 카드 조각 부족'}</button>
        </section>
      </div>
    </section>`;
  }

  function scrapyardPanel() {
    const scrap = scrapyardState;
    if (!scrap) return '<div class="ws76-panel ws76-loading"><i></i><b>폐차장 정보를 불러오는 중</b></div>';
    const access = scrap.access || {};
    const ticket = scrap.ticket || {};
    const ticketQuantity = Number(access.ticketQuantity ?? ticket.quantity ?? 0);
    const difficulties = scrap.settings?.difficulties || [];
    return `<section class="ws76-scrap ws81-scrap-panel">
      <div class="ws76-scrap-hero"><div><small>WAVE SALVAGE OPERATION</small><h2>망각의 기계 폐차장</h2><p>저장된 PVE 덱으로 전 웨이브를 완주하면 코인은 확정 지급됩니다. 차량 부품은 완주 후 1회 랜덤 판정되어 아무 부품도 나오지 않을 수 있습니다.</p><div class="ws80-ticket-pass ${ticketQuantity > 0 ? 'ready' : 'empty'}"><img src="${esc(asset(ticket.image_url || 'assets/ui/scrapyard/scrapyard-entry-ticket-v1680.png'))}" alt="폐차장 출입 허가증"><span><small>SALVAGE ACCESS PASS · 입장 시 1장 차감</small><b>${esc(ticket.name || '폐차장 출입 허가증')}</b><em>보유 ${fmt(ticketQuantity)}장</em></span></div><div class="ws76-runmeta"><span><small>PVE 전투력</small><b>${fmt(scrap.deckPower)}</b></span><span><small>오늘 입장</small><b>${fmt(access.usedRuns)} / ${fmt(access.dailyRuns)}</b></span><span><small>남은 입장</small><b>${fmt(access.remainingRuns)}</b></span></div></div><div class="ws76-deck">${(scrap.deckCards || []).map((card, index) => `<figure style="--i:${index}"><img src="${esc(asset(card.image))}" alt=""><figcaption><em>${esc(card.rarity)}</em><b>${esc(card.title)}</b></figcaption></figure>`).join('')}</div></div>
      <div class="ws76-difficulties">${difficulties.map((difficulty, index) => {
        const recommended = Number(scrap.deckPower) >= Number(difficulty.requiredPowerStart);
        const ticketReady = ticketQuantity > 0;
        const locked = !access.allowed;
        const recovering = currentMutationRequest('scrapyard')?.target === String(difficulty.id);
        const disabled = scrapyardBusy || (!recovering && !locked && (Number(access.remainingRuns) <= 0 || !ticketReady));
        const starting = scrapyardBusy && activeScrapRun === difficulty.id;
        return `<article style="--accent:${esc(difficulty.accent)}" class="${recommended ? 'ready' : 'danger'} ${ticketReady ? 'ticket-ready' : 'ticket-locked'} ${locked ? 'access-locked' : ''}"><header><i>0${index + 1}</i><span><small>${index === 2 ? 'FURNACE DEPTH' : index === 1 ? 'COMPRESSION CORE' : 'OUTER YARD'}</small><h3>${esc(difficulty.name)}</h3></span></header><div><span><small>WAVES</small><b>${fmt(difficulty.waves)}</b></span><span><small>요구 전투력</small><b>${fmt(difficulty.requiredPowerStart)} ~ ${fmt(difficulty.requiredPowerEnd)}</b></span><span><small>완주 확정 코인</small><b>${fmt(difficulty.clearCoin)} COIN</b></span><span><small>최고 기록</small><b>${fmt(scrap.best?.[difficulty.id])} WAVE</b></span></div><button type="button" data-scrap-run="${difficulty.id}" class="${starting ? 'is-starting' : ''}" ${locked && !recovering ? 'data-scrap-locked="1"' : ''} ${disabled ? 'disabled' : ''}><b>${starting ? '전투 연결 중' : recovering ? '이전 원정 결과 확인' : locked ? '현재 입장 불가' : !ticketReady ? '출입 허가증 필요' : recommended ? '원정 시작' : '위험 원정 시작'}</b><small>${starting ? '입장권 확인 · PVE 덱 동기화 중' : recovering ? '동일 요청번호로 중복 소모 없이 재확인합니다' : locked ? '폐차장 점검·테스트가 진행 중입니다.' : !ticketReady ? '통합 드랍에서 입장권을 획득하세요' : recommended ? '입장권 1장 · 완주 보상 판정' : '입장권 1장 · 전멸 위험이 높습니다'}</small></button></article>`;
      }).join('')}</div>
      <footer class="ws76-rule"><b>입장·보상 원칙</b><span>원정 시작 시 출입 허가증 1장을 차감합니다. 완주 코인은 100% 지급하고 차량 부품은 통합 드랍풀에서 한 번만 판정합니다. 전멸 시에도 사용한 입장권은 반환되지 않습니다.</span></footer>
    </section>`;
  }

  function renderWorkshop() {
    const root = document.getElementById('workshopRootV1881');
    if (!root || !workshopState) return;
    const panel = workshopSection === 'SYNTHESIS'
      ? synthesisPanel()
      : workshopSection === 'MATERIAL_CRAFT'
        ? materialCraftPanel()
        : vehiclePanel();
    root.innerHTML = workshopHeader() + workshopNav() + panel;
    normalizeImages(root);
    bindWorkshopControls(root);
  }

  function renderScrapyard() {
    const root = document.getElementById('scrapyardRootV1881');
    if (!root || !scrapyardState) return;
    root.innerHTML = scrapyardHeader() + scrapyardPanel();
    normalizeImages(root);
    bindScrapyardControls(root);
  }

  function bindWorkshopControls(root) {
    root.querySelectorAll('[data-ws-section]').forEach(button => button.onclick = () => {
      workshopSection = button.dataset.wsSection;
      renderWorkshop();
    });
    root.querySelectorAll('[data-recipe]').forEach(button => button.onclick = () => {
      selectedVehicleRecipe = Number(button.dataset.recipe);
      renderWorkshop();
    });
    root.querySelectorAll('[data-pay]').forEach(button => button.onclick = () => {
      payment = button.dataset.pay;
      renderWorkshop();
    });
    root.querySelectorAll('[data-synth-mode]').forEach(button => button.onclick = () => {
      synthesisMode = button.dataset.synthMode;
      const visibleIds = new Set(synthesisRows().map(row => Number(row.recipe_id)));
      if (!visibleIds.has(Number(selectedSynthesisRecipe))) selectedSynthesisRecipe = 0;
      renderWorkshop();
    });
    root.querySelectorAll('[data-synth]').forEach(button => button.onclick = () => {
      selectedSynthesisRecipe = Number(button.dataset.synth);
      renderWorkshop();
      document.querySelector('.ws81-synth-detail')?.scrollIntoView?.({ behavior: 'smooth', block: 'start' });
    });
    root.querySelector('[data-synth-show-all]')?.addEventListener('click', () => {
      synthesisMode = 'ALL';
      selectedSynthesisRecipe = 0;
      renderWorkshop();
    });
    root.querySelector('#wsVehicleCraft')?.addEventListener('click', craftVehicle);
    root.querySelector('#wsSynthStart')?.addEventListener('click', synthesizeEquipment);
    root.querySelector('#wsMaterialCraft')?.addEventListener('click', craftMaterial);
  }

  function bindScrapyardControls(root) {
    root.querySelectorAll('[data-scrap-run]').forEach(button => button.onclick = () => {
      if (button.dataset.scrapLocked === '1') return alert('폐차장은 현재 점검·테스트 중으로 입장할 수 없습니다.');
      runScrapyard(button.dataset.scrapRun);
    });
  }

  async function bindWorkshopView() {
    const root = document.getElementById('workshopRootV1881');
    if (!root) return;
    const loadVersion = ++workshopLoadVersion;
    const epoch = routeEpoch;
    try {
      const nextState = await api('workshop');
      if (loadVersion !== workshopLoadVersion || epoch !== routeEpoch || !workshopMounted()) return;
      workshopState = nextState;
      renderWorkshop();
    } catch (error) {
      if (loadVersion !== workshopLoadVersion || epoch !== routeEpoch || !workshopMounted()) return;
      root.innerHTML = `<div class="ws76-error"><b>제작소 연결 실패</b><span>${esc(error.message)}</span><button type="button">다시 시도</button></div>`;
      root.querySelector('button')?.addEventListener('click', bindWorkshopView);
    }
  }

  async function bindScrapyardView() {
    const root = document.getElementById('scrapyardRootV1881');
    if (!root) return;
    const loadVersion = ++scrapyardLoadVersion;
    const syncVersion = ++scrapyardSyncVersion;
    const epoch = routeEpoch;
    try {
      const nextState = await api('scrapyard/status');
      if (loadVersion !== scrapyardLoadVersion || syncVersion !== scrapyardSyncVersion || epoch !== routeEpoch || !scrapyardMounted()) return;
      scrapyardState = nextState;
      renderScrapyard();
    } catch (error) {
      if (loadVersion !== scrapyardLoadVersion || syncVersion !== scrapyardSyncVersion || epoch !== routeEpoch || !scrapyardMounted()) return;
      root.innerHTML = `<div class="ws76-error"><b>폐차장 연결 실패</b><span>${esc(error.message)}</span><button type="button">다시 시도</button></div>`;
      root.querySelector('button')?.addEventListener('click', bindScrapyardView);
    }
  }

  async function craftVehicle() {
    const recipe = (workshopState?.recipes || []).find(row => Number(row.id) === Number(selectedVehicleRecipe));
    if (!recipe || workshopBusy) return;
    const successRate = Number(recipe.success_rate ?? 100);
    if (!confirm(`${recipe.name}\n제작 성공 확률 ${successRate}% · 실패 시 투입한 재료와 재화는 반환되지 않습니다.\n동일한 제작 요청은 중복 지급되지 않습니다. 제작하시겠습니까?`)) return;
    const ticket = prepareMutationRequest('vehicle', `${recipe.id}:${payment}`, 'WORKSHOP');
    if (ticket.blocked) return alert('이전 차량 제작 결과를 먼저 확인해야 합니다. 이전에 선택한 차량과 결제 방식으로 다시 시도해 주세요.');
    const actionVersion = ++workshopActionVersion;
    const epoch = routeEpoch;
    const session = sessionIdentity();
    const ownsAction = () => actionVersion === workshopActionVersion;
    const sameSession = () => session === sessionIdentity();
    const canPresent = () => ownsAction() && sameSession() && epoch === routeEpoch && workshopMounted();
    workshopBusy = true;
    renderWorkshop();
    let reconcile = false;
    try {
      const data = await api('workshop/craft', { method: 'POST', body: JSON.stringify({ recipeId: recipe.id, paymentType: payment, requestId: ticket.requestId }) });
      clearMutationRequest('vehicle', ticket.requestId);
      if (!ownsAction()) return;
      if (canPresent()) {
        workshopLoadVersion += 1;
        workshopState = data.state;
        showVehicleResult(data);
      }
    } catch (error) {
      const uncertain = mutationTransportUncertain(error);
      if (uncertain) reconcile = true;
      else clearMutationRequest('vehicle', ticket.requestId);
      if (canPresent()) alert(uncertain ? mutationRetryMessage('차량 제작') : error.message);
    } finally {
      if (ownsAction()) {
        workshopBusy = false;
        if (workshopMounted()) {
          if (reconcile) void bindWorkshopView();
          else if (canPresent()) renderWorkshop();
          else void bindWorkshopView();
        }
      }
    }
  }

  function showVehicleResult(data) {
    const modal = document.getElementById('modal');
    if (!modal) return;
    const success = data?.success === true && data?.output;
    const recipeName = data?.output?.name || data?.recipeName || '차량 제작';
    modal.className = `modal show ws76-simple-result ${success ? 'is-success' : 'is-failed'}`;
    modal.innerHTML = success
      ? `<section><small>ASSEMBLY COMPLETE</small><h2>차량 제작 완료</h2><img src="${esc(asset(data.output.image))}" alt="${esc(recipeName)}"><b>${esc(recipeName)}</b><p>제작 차량이 차고에 정상 지급되었습니다.</p><button type="button">확인</button></section>`
      : `<section><small>ASSEMBLY FAILED</small><h2>차량 제작 실패</h2><div class="ws76-result-failure-mark" aria-hidden="true"><i></i><b>FAILED</b></div><b>${esc(recipeName)}</b><p>제작 판정에 실패했습니다. 투입한 재료와 재화는 반환되지 않습니다.</p><button type="button">확인</button></section>`;
    normalizeImages(modal);
    modal.querySelector('button').onclick = () => { modal.className = 'modal'; modal.innerHTML = ''; };
  }

  async function craftMaterial() {
    const recipe = (workshopState?.recipes || []).find(row => row.category === 'MATERIAL_CRAFT' && String(row.output_ref || '').toUpperCase() === MYSTIC_ENERGY_CODE)
      || (workshopState?.recipes || []).find(row => row.category === 'MATERIAL_CRAFT');
    if (!recipe || workshopBusy) return;
    const pending = currentMutationRequest('material');
    const recovering = pending?.target === String(recipe.id);
    const coinCost = Number(recipe.coin_cost || 0);
    const shardCost = materialCardShardCost(recipe);
    if (!recovering && (Number(workshopState?.wallet?.coin || 0) < coinCost || Number(workshopState?.wallet?.cardShards || 0) < shardCost)) {
      return alert('재료 제작에 필요한 코인 또는 카드 조각이 부족합니다.');
    }
    const outputName = recipe.output_name || '미스틱 에너지';
    const prompt = recovering
      ? `${outputName} 제작 결과를 동일 요청번호로 안전하게 재확인합니다.`
      : `${outputName} × ${fmt(recipe.output_quantity || 1)}\n성공 확률 ${Number(recipe.success_rate ?? 100)}% · 코인 ${fmt(coinCost)} + 카드 조각 ${fmt(shardCost)}를 사용합니다.\n실패 시 투입 재화는 반환되지 않으며, 동일한 제작 요청은 중복 차감되지 않습니다. 제작하시겠습니까?`;
    if (!confirm(prompt)) return;
    const ticket = prepareMutationRequest('material', recipe.id, 'WORKSHOP-MATERIAL');
    if (ticket.blocked) return alert('이전 재료 제작 결과를 먼저 확인해야 합니다. 이전에 선택한 재료 제작으로 다시 시도해 주세요.');
    const actionVersion = ++workshopActionVersion;
    const epoch = routeEpoch;
    const session = sessionIdentity();
    const ownsAction = () => actionVersion === workshopActionVersion;
    const sameSession = () => session === sessionIdentity();
    const canPresent = () => ownsAction() && sameSession() && epoch === routeEpoch && workshopMounted();
    workshopBusy = true;
    renderWorkshop();
    let reconcile = false;
    try {
      const data = await api('workshop/craft', { method: 'POST', body: JSON.stringify({ recipeId: recipe.id, paymentType: MATERIAL_PAYMENT_MODE, requestId: ticket.requestId }) });
      clearMutationRequest('material', ticket.requestId);
      if (!ownsAction()) return;
      if (canPresent()) {
        workshopLoadVersion += 1;
        workshopState = data.state;
        syncWorkshopBalances(data);
        showMaterialResult(data);
      }
    } catch (error) {
      const uncertain = mutationTransportUncertain(error);
      if (uncertain) reconcile = true;
      else clearMutationRequest('material', ticket.requestId);
      if (canPresent()) alert(uncertain ? mutationRetryMessage('재료 제작') : error.message);
    } finally {
      if (ownsAction()) {
        workshopBusy = false;
        if (workshopMounted()) {
          if (reconcile) void bindWorkshopView();
          else if (canPresent()) renderWorkshop();
          else void bindWorkshopView();
        }
      }
    }
  }

  function syncWorkshopBalances(data) {
    try {
      const wallet = data?.state?.wallet;
      const user = window.loadUser?.();
      if (wallet && user) {
        user.coin = Number(wallet.coin ?? user.coin ?? 0);
        user.cardShards = Number(wallet.cardShards ?? user.cardShards ?? 0);
        window.saveUser?.(user);
      }
      window.clearApiCache?.('inventory');
      window.clearApiCache?.('shell/summary');
      window.clearApiCache?.('me/summary');
      window.dispatchEvent(new CustomEvent('cnine:workshop-crafted', { detail: data }));
    } catch (_) {}
  }

  function showMaterialResult(data) {
    const modal = document.getElementById('modal');
    if (!modal) return;
    const success = data?.success === true && data?.output;
    const output = data?.output || {};
    const outputName = output.name || data?.recipeName || '미스틱 에너지';
    modal.className = `modal show ws76-simple-result ws81-material-result ${success ? 'is-success' : 'is-failed'}`;
    modal.innerHTML = success
      ? `<section><small>MATERIAL FABRICATION COMPLETE</small><h2>재료 제작 완료</h2><img src="${esc(asset(output.image || MYSTIC_ENERGY_IMAGE))}" alt="${esc(outputName)}"><b>${esc(outputName)} × ${fmt(output.quantity || 1)}</b><p>제작된 미스틱 에너지가 인벤토리에 정상 지급되었습니다.</p><button type="button">확인</button></section>`
      : `<section><small>MATERIAL FABRICATION FAILED</small><h2>재료 제작 실패</h2><div class="ws76-result-failure-mark" aria-hidden="true"><i></i><b>FAILED</b></div><b>${esc(outputName)}</b><p>제작 판정에 실패했습니다. 투입된 재화는 반환되지 않습니다.</p><button type="button">확인</button></section>`;
    normalizeImages(modal);
    modal.querySelector('button').onclick = () => { modal.className = 'modal'; modal.innerHTML = ''; renderWorkshop(); };
  }

  async function synthesizeEquipment() {
    if (workshopBusy) return;
    let ticket = null;
    let reconcile = false;
    const actionVersion = ++workshopActionVersion;
    const epoch = routeEpoch;
    const session = sessionIdentity();
    const ownsAction = () => actionVersion === workshopActionVersion;
    const sameSession = () => session === sessionIdentity();
    const canPresent = () => ownsAction() && sameSession() && epoch === routeEpoch && workshopMounted();
    workshopBusy = true;
    renderWorkshop();
    try {
      const nextState = await api('workshop');
      if (!ownsAction()) return;
      if (!canPresent()) return;
      workshopState = nextState;
      const recipe = (workshopState?.synthesis || []).find(row => Number(row.recipe_id) === Number(selectedSynthesisRecipe));
      renderWorkshop();
      if (!recipe) return alert('현재 공개된 합성 레시피가 아닙니다.');
      const required = synthRequired(recipe);
      const recovering = currentMutationRequest('synthesis')?.target === String(recipe.recipe_id);
      if (!canSynthesize(recipe) && !recovering) return alert(`${recipe.name} 장비가 ${fmt(required)}개 필요합니다.`);
      if (!confirm(recovering ? `${recipe.name} 합성 결과를 동일 요청번호로 안전하게 재확인합니다.` : `${recipe.name} ${fmt(required)}개를 투입해 ${recipe.output_name} 합성을 시도합니다.\nCMS 최신 성공 확률 ${Number(recipe.success_rate ?? 100)}% · 실패해도 투입 장비는 소모됩니다.`)) return;
      ticket = prepareMutationRequest('synthesis', recipe.recipe_id, 'SYNTH');
      if (ticket.blocked) return alert('이전 장비 합성 결과를 먼저 확인해야 합니다. 이전에 선택한 합성 계보로 다시 시도해 주세요.');
      const data = await api('workshop/synthesis', { method: 'POST', body: JSON.stringify({ recipeId: recipe.recipe_id, requestId: ticket.requestId }) });
      clearMutationRequest('synthesis', ticket.requestId);
      if (!ownsAction()) return;
      if (canPresent()) {
        workshopLoadVersion += 1;
        workshopState = data.state;
        await showSynthesisReveal(data, required, canPresent);
      }
    } catch (error) {
      const uncertain = ticket && mutationTransportUncertain(error);
      if (uncertain) reconcile = true;
      else if (ticket) clearMutationRequest('synthesis', ticket.requestId);
      if (canPresent()) alert(uncertain ? mutationRetryMessage('장비 합성') : error.message);
    } finally {
      if (ownsAction()) {
        workshopBusy = false;
        if (workshopMounted()) {
          if (reconcile) void bindWorkshopView();
          else if (canPresent()) renderWorkshop();
          else void bindWorkshopView();
        }
      }
    }
  }

  async function showSynthesisReveal(data, required, isCurrent = () => true) {
    const modal = document.getElementById('modal');
    if (!modal || !isCurrent()) return;
    const input = data.input || {};
    const output = data.output || {};
    const success = data.success !== false;
    modal.className = 'modal show ws76-reveal-modal ws77-modal';
    modal.innerHTML = `<section class="ws77-reveal ws81-reveal" style="--slide:0;--open:0"><header><div><small>LINEAGE FUSION · ${Number(data.successRate ?? 100)}% PROTOCOL</small><h2>${esc(data.recipeName || '장비 계보 합성')}</h2></div><span id="ws81Phase">투입 장비 동기화 중</span></header><div class="ws77-chamber"><div class="ws77-scanlines"></div><div class="ws77-inputs">${Array.from({ length: Math.min(required, 5) }, (_, index) => `<figure style="--i:${index}"><span>${esc(input.rarity || 'EQUIPMENT')}</span><img src="${esc(asset(input.image))}" alt=""><figcaption>${esc(input.name || '투입 장비')}</figcaption></figure>`).join('')}</div><div class="ws77-reactor"><i></i><b id="ws81Charge">0%</b><small>CORE CHARGE</small></div><div class="ws77-output"><figure><span>${esc(output.rarity || 'EQUIPMENT')}</span><img src="${esc(asset(output.image))}" alt=""><figcaption><small>LINEAGE RESULT</small><b>${esc(output.name)}</b><em>PVE +${fmt(output.pvePower)} · PVP +${fmt(output.pvpPower)}</em></figcaption></figure></div><div class="ws77-failure"><strong>FUSION FAILED</strong><span>투입 장비 ${fmt(required)}개가 소멸했습니다.</span></div><div class="ws77-shutter left"></div><div class="ws77-shutter right"></div><div class="ws77-flash"></div></div><div class="ws77-progress"><i></i><span id="ws81ProgressText">계보 데이터 결속 0%</span></div><div class="ws77-slider locked"><span id="ws81Instruction">합성로 충전이 완료될 때까지 기다려 주세요</span><div id="ws81Track" tabindex="0" role="slider" aria-label="합성 결과 공개" aria-valuemin="0" aria-valuemax="100" aria-valuenow="0"><i id="ws81Handle">➜</i><b>밀어서 결과 개방</b></div></div><button id="ws81Close" disabled>합성 결과 확인 완료</button></section>`;
    normalizeImages(modal);
    const panel = modal.querySelector('.ws81-reveal');
    const phase = modal.querySelector('#ws81Phase');
    const charge = modal.querySelector('#ws81Charge');
    const progress = modal.querySelector('.ws77-progress i');
    const progressText = modal.querySelector('#ws81ProgressText');
    const slider = modal.querySelector('.ws77-slider');
    const instruction = modal.querySelector('#ws81Instruction');
    const track = modal.querySelector('#ws81Track');
    const handle = modal.querySelector('#ws81Handle');
    const close = modal.querySelector('#ws81Close');
    let ready = false;
    let dragging = false;
    let revealed = false;
    for (const step of [{ p: 18, t: '장비 서명 분석', d: 220 }, { p: 46, t: '동일 장비 분해', d: 280 }, { p: 72, t: '계보 코어 결속', d: 320 }, { p: 100, t: '합성 판정 봉인', d: 380 }]) {
      await wait(step.d);
      if (!isCurrent() || !panel?.isConnected) return;
      charge.textContent = `${step.p}%`;
      progress.style.width = `${step.p}%`;
      progressText.textContent = `${step.t} ${step.p}%`;
      phase.textContent = step.t;
      if (step.p >= 46) panel.classList.add('consume');
      if (step.p >= 72) panel.classList.add('critical');
    }
    ready = true;
    panel.classList.add('charged');
    slider.classList.remove('locked');
    instruction.textContent = '손잡이를 끝까지 밀어 합성 판정을 확인하세요';
    phase.textContent = 'RESULT SEALED';
    const move = clientX => {
      if (!ready || revealed) return;
      const box = track.getBoundingClientRect();
      const usable = Math.max(1, box.width - handle.offsetWidth - 12);
      const percent = Math.max(0, Math.min(100, (clientX - box.left - handle.offsetWidth / 2 - 6) / usable * 100));
      panel.style.setProperty('--slide', percent);
      track.setAttribute('aria-valuenow', String(Math.round(percent)));
      if (percent < 94) return;
      revealed = true;
      panel.style.setProperty('--slide', 100);
      panel.style.setProperty('--open', 1);
      panel.classList.add('revealed', success ? 'succeeded' : 'failed');
      phase.textContent = success ? 'SYNTHESIS COMPLETE' : 'SYNTHESIS FAILED';
      instruction.textContent = success ? `${output.name} 획득` : `합성 실패 · 투입 장비 ${fmt(required)}개 소모`;
      close.disabled = false;
      navigator.vibrate?.(success ? [45, 30, 45, 30, 120] : [120, 55, 180]);
    };
    handle.onpointerdown = event => { if (ready) { dragging = true; handle.setPointerCapture(event.pointerId); move(event.clientX); } };
    handle.onpointermove = event => { if (dragging) move(event.clientX); };
    handle.onpointerup = handle.onpointercancel = () => { dragging = false; };
    track.onpointerdown = event => { if (event.target !== handle) move(event.clientX); };
    track.onkeydown = event => { if (ready && ['ArrowRight', 'Enter', ' '].includes(event.key)) { event.preventDefault(); move(track.getBoundingClientRect().right); } };
    close.onclick = () => { modal.className = 'modal'; modal.innerHTML = ''; renderWorkshop(); };
  }

  function applyScrapyardResult(result) {
    const scrap = scrapyardState;
    if (!scrap || !result) return;
    const remainingTicket = Math.max(0, Number(result.entryTicket?.remaining ?? scrap.access?.ticketQuantity ?? scrap.ticket?.quantity ?? 0));
    const access = { ...(scrap.access || {}) };
    const best = { ...(scrap.best || {}) };
    access.usedRuns = Number(access.usedRuns || 0) + 1;
    access.remainingRuns = Math.max(0, Number(access.remainingRuns || 0) - 1);
    access.ticketQuantity = remainingTicket;
    best[result.difficulty?.id] = Math.max(Number(best[result.difficulty?.id] || 0), Number(result.wavesCleared || 0));
    const rewardMap = new Map((result.rewards || []).map(reward => [String(reward.rewardRef || reward.itemCode || ''), Number(reward.quantity || 0)]));
    const parts = (scrap.parts || []).map(item => rewardMap.has(String(item.code)) ? { ...item, quantity: Number(item.quantity || 0) + rewardMap.get(String(item.code)) } : item);
    scrapyardState = { ...scrap, access, best, parts, ticket: { ...(scrap.ticket || {}), quantity: remainingTicket }, deckPower: Number(result.baseDeckPower ?? scrap.deckPower ?? 0), deckCards: result.deckCards || scrap.deckCards };
  }

  function showScrapyardConnecting(difficultyId) {
    const modal = document.getElementById('modal');
    const difficulty = (scrapyardState?.settings?.difficulties || []).find(row => row.id === difficultyId);
    if (!modal) return;
    modal.className = 'modal show ws76-battle-modal ws98-battle-modal ws98-entry-connecting';
    modal.innerHTML = `<section class="ws76-battle ws98-battle"><header><div><small>SCRAPYARD · FAST COMBAT LINK</small><h2>${esc(difficulty?.name || '폐차장')} 진입</h2></div><div class="ws98-header-state"><span>ENTRY SYNC</span></div></header><div class="ws98-combat-hud"><span><small>활성 전투력</small><b>${fmt(scrapyardState?.deckPower)}</b></span><span><small>전투 구역</small><b>${esc(difficulty?.name || '폐차장')}</b></span><span><small>입장권 확인</small><b>진행 중</b></span></div><div class="ws76-battlefield"><div class="ws76-party">${(scrapyardState?.deckCards || []).map((card, index) => `<div class="ws98-fighter-slot" style="--i:${index}"><article class="ws98-fallback-card"><em>${esc(card.rarity || card.grade || 'C')}</em><img src="${esc(asset(card.image))}" alt=""><b>${esc(card.title || '카드')}</b></article></div>`).join('')}</div><div class="ws76-monster battle-enemy-card enter" id="wsMonster"><div><small>SERVER VERIFIED ENTRY</small><b>전투 데이터 동기화</b><span><i style="width:42%"></i></span></div><i class="ws98-monster-core"></i></div></div><footer><span>입장권 예약과 전투 결과를 안전하게 확정하고 있습니다.</span></footer></section>`;
    normalizeImages(modal);
  }

  function closeScrapyardConnecting() {
    const modal = document.getElementById('modal');
    if (modal?.classList.contains('ws98-entry-connecting')) { modal.className = 'modal'; modal.innerHTML = ''; }
  }

  async function refreshScrapyard(version) {
    const epoch = routeEpoch;
    try {
      const next = await api('scrapyard/status');
      if (version !== scrapyardSyncVersion || epoch !== routeEpoch || !scrapyardMounted()) return;
      scrapyardState = next;
      if (!scrapyardBusy && document.getElementById('scrapyardRootV1881')) renderScrapyard();
    } catch (error) {
      console.warn('[scrapyard] background refresh failed', error);
    }
  }

  async function runScrapyard(difficulty) {
    if (scrapyardBusy) return;
    const ticket = prepareMutationRequest('scrapyard', difficulty, 'SCRAP');
    if (ticket.blocked) return alert('이전 폐차장 원정 결과를 먼저 확인해야 합니다. 이전에 선택한 난이도로 다시 시도해 주세요.');
    const actionVersion = ++scrapyardActionVersion;
    const epoch = routeEpoch;
    const session = sessionIdentity();
    const ownsAction = () => actionVersion === scrapyardActionVersion;
    const sameSession = () => session === sessionIdentity();
    const canPresent = () => ownsAction() && sameSession() && epoch === routeEpoch && scrapyardMounted();
    scrapyardBusy = true;
    activeScrapRun = difficulty;
    renderScrapyard();
    showScrapyardConnecting(difficulty);
    let reconcile = false;
    try {
      const result = await api('scrapyard/run', { method: 'POST', body: JSON.stringify({ difficulty, requestId: ticket.requestId }) });
      clearMutationRequest('scrapyard', ticket.requestId);
      if (!ownsAction()) return;
      if (canPresent()) {
        scrapyardLoadVersion += 1;
        applyScrapyardResult(result);
        scrapyardBusy = false;
        activeScrapRun = '';
        renderScrapyard();
        const syncVersion = ++scrapyardSyncVersion;
        const refreshPromise = refreshScrapyard(syncVersion);
        if (typeof window.playScrapyardBattleV1698 === 'function') {
          await window.playScrapyardBattleV1698(result, { asset, esc, fmt, normalizeImages, wait, isActive: canPresent, showResult: (modal, battleResult) => { if (canPresent()) showScrapResult(modal, battleResult); } });
        } else {
          showScrapResult(document.getElementById('modal'), result);
        }
        void refreshPromise;
      }
    } catch (error) {
      const uncertain = mutationTransportUncertain(error);
      if (uncertain) reconcile = true;
      else clearMutationRequest('scrapyard', ticket.requestId);
      if (canPresent()) {
        closeScrapyardConnecting();
        alert(uncertain ? mutationRetryMessage('폐차장 원정') : error.message);
      }
    } finally {
      if (ownsAction()) {
        scrapyardBusy = false;
        activeScrapRun = '';
        if (scrapyardMounted()) {
          if (reconcile) void bindScrapyardView();
          else if (canPresent()) renderScrapyard();
          else void bindScrapyardView();
        }
      }
    }
  }

  function showScrapResult(modal, result) {
    if (!modal) return;
    const rewards = result.rewards || [];
    const partRewards = rewards.filter(reward => reward.rewardType !== 'COIN');
    modal.className = 'modal show ws76-battle-modal';
    modal.innerHTML = `<section class="ws76-operation-result ${result.success ? 'success' : 'failed'}"><small>${result.success ? 'OPERATION COMPLETE' : 'OPERATION FAILED'}</small><h2>${result.success ? '폐차장 완주 성공' : '원정대 전멸'}</h2><p>${fmt(result.wavesCleared)} / ${fmt(result.difficulty?.waves)} 웨이브 클리어</p><div><article class="ticket-spent"><b>폐차장 출입 허가증</b><strong>-1 · ${fmt(result.entryTicket?.remaining)}장 남음</strong></article>${rewards.map(reward => `<article><b>${esc(reward.rewardName || reward.rewardRef || reward.rewardType)}${reward.guaranteed ? ' · 확정' : ''}</b><strong>+${fmt(reward.quantity)}</strong></article>`).join('')}${result.success && !partRewards.length ? '<article><b>랜덤 차량 부품</b><strong>미획득</strong></article>' : ''}${!result.success ? '<article><b>완주 실패</b><strong>보상 없음</strong></article>' : ''}</div><button type="button">폐차장으로 돌아가기</button></section>`;
    modal.querySelector('button').onclick = () => { modal.className = 'modal'; modal.innerHTML = ''; };
  }

  window.workshopView = workshopView;
  window.bindWorkshopView = bindWorkshopView;
  window.scrapyardView = scrapyardView;
  window.bindScrapyardView = bindScrapyardView;
})();
