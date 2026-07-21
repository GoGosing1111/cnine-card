/* v1085 LIMITED card server stock dashboard */
(() => {
  'use strict';

  const qs = (selector, root = document) => root.querySelector(selector);
  const escapeHtml = value => String(value ?? '').replace(/[&<>"']/g, char => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  })[char]);
  const number = value => Math.max(0, Number(value || 0));
  const formatNumber = value => number(value).toLocaleString('ko-KR');
  const imageUrl = value => /^https?:\/\//i.test(String(value || ''))
    ? String(value)
    : `/${String(value || '').replace(/^\//, '')}`;
  const fallbackImage = 'data:image/svg+xml;charset=UTF-8,' + encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 320 420"><rect width="320" height="420" fill="#0b1422"/><path d="M80 225l55-62 42 45 28-31 38 48v58H80z" fill="#29415d"/><circle cx="213" cy="126" r="25" fill="#29415d"/><text x="160" y="335" fill="#8298b1" text-anchor="middle" font-size="20" font-family="Arial">NO IMAGE</text></svg>'
  );

  let data = { cards: [], summary: {} };
  let activeFilter = 'ALL';
  let activeQuery = '';
  let loadingPromise = null;
  let loadSequence = 0;

  function ensurePanel() {
    const view = qs('#view-cards');
    if (!view || qs('#limitedStockPanel')) return;
    const panel = document.createElement('details');
    panel.id = 'limitedStockPanel';
    panel.className = 'limitedStockPanel';
    panel.open = true;
    panel.innerHTML = `
      <summary>
        <div class="limitedStockHeading">
          <small>LIMITED SERVER STOCK</small>
          <b>리미티드 카드 서버 재고</b>
          <span>카드별 누적 발급량과 서버에 남은 수량을 확인합니다.</span>
        </div>
        <span id="limitedStockLoadState" class="limitedStockLoadState">재고 확인</span>
      </summary>
      <div class="limitedStockBody">
        <div id="limitedStockSummary" class="limitedStockSummary"></div>
        <div class="limitedStockToolbar">
          <label class="limitedStockSearch">
            <span>카드 검색</span>
            <input id="limitedStockSearch" type="search" placeholder="카드명 또는 멤버명">
          </label>
          <div id="limitedStockFilters" class="limitedStockFilters">
            <button type="button" class="active" data-stock-filter="ALL">전체</button>
            <button type="button" data-stock-filter="AVAILABLE">판매 가능</button>
            <button type="button" data-stock-filter="LOW">재고 부족</button>
            <button type="button" data-stock-filter="SOLD_OUT">품절</button>
            <button type="button" data-stock-filter="INACTIVE">비활성</button>
          </div>
          <button type="button" id="limitedStockRefresh" class="ghost">재고 새로고침</button>
        </div>
        <div id="limitedStockList" class="limitedStockList">
          <div class="limitedStockEmpty">재고 정보를 불러오지 않았습니다.</div>
        </div>
        <div class="limitedStockGuide">
          <b>수량 기준</b>
          <span><strong>서버 잔여</strong> = 전체 한정 수량 - 누적 발급량</span>
          <span><strong>현재 유저 보유</strong>는 현재 계정들에 남아 있는 실제 카드 수량입니다. 계정 초기화나 카드 회수로 누적 발급량과 다를 수 있습니다.</span>
        </div>
      </div>`;
    const anchor = qs('.cardManagerUpgradeNotice', view) || qs('.sectionIntro', view);
    anchor?.insertAdjacentElement('afterend', panel);

    qs('#limitedStockRefresh')?.addEventListener('click', () => loadStock(true));
    qs('#limitedStockSearch')?.addEventListener('input', event => {
      activeQuery = String(event.target.value || '').trim().toLowerCase();
      renderList();
    });
    qs('#limitedStockFilters')?.addEventListener('click', event => {
      const button = event.target.closest('[data-stock-filter]');
      if (!button) return;
      activeFilter = button.dataset.stockFilter || 'ALL';
      qs('#limitedStockFilters')?.querySelectorAll('[data-stock-filter]').forEach(item => {
        item.classList.toggle('active', item === button);
      });
      renderList();
    });
  }

  function cardState(card) {
    const status = String(card.cardStatus || 'PUBLIC').toUpperCase();
    if (card.soldOut) return { key: 'SOLD_OUT', label: '품절' };
    if (!card.isActive || status !== 'PUBLIC') {
      const label = status === 'PENDING' ? '공개 대기' : status === 'RETIRE_PENDING' ? '퇴사 대기' : status === 'RETIRED' ? '퇴사 완료' : '비활성';
      return { key: 'INACTIVE', label };
    }
    const ratio = card.limitedTotal > 0 ? card.remainingCount / card.limitedTotal : 0;
    if (card.remainingCount <= 5 || ratio <= 0.1) return { key: 'LOW', label: '재고 부족' };
    return { key: 'AVAILABLE', label: '판매 가능' };
  }

  function filteredCards() {
    return (data.cards || []).filter(card => {
      const state = cardState(card);
      if (activeFilter !== 'ALL' && state.key !== activeFilter) return false;
      if (!activeQuery) return true;
      return `${card.title || ''} ${card.memberName || ''} ${card.id || ''}`.toLowerCase().includes(activeQuery);
    });
  }

  function renderSummary() {
    const box = qs('#limitedStockSummary');
    if (!box) return;
    const summary = data.summary || {};
    const items = [
      ['LIMITED 카드 종류', summary.cardTypes, `판매 가능 ${formatNumber(summary.availableTypes)}종`],
      ['전체 한정 수량', summary.totalLimit, '모든 LIMITED 카드 합계'],
      ['누적 발급', summary.totalIssued, `현재 유저 보유 ${formatNumber(summary.totalHeld)}장`],
      ['서버 잔여', summary.totalRemaining, `품절 ${formatNumber(summary.soldOutTypes)}종`]
    ];
    box.innerHTML = items.map(([label, value, note], index) => `
      <article class="limitedStockStat ${index === 3 ? 'remaining' : ''}">
        <small>${escapeHtml(label)}</small>
        <b>${formatNumber(value)}</b>
        <span>${escapeHtml(note)}</span>
      </article>`).join('');
  }

  function renderList() {
    const box = qs('#limitedStockList');
    if (!box) return;
    const cards = filteredCards();
    if (!cards.length) {
      box.innerHTML = '<div class="limitedStockEmpty">조건에 맞는 LIMITED 카드가 없습니다.</div>';
      return;
    }
    box.innerHTML = cards.map(card => {
      const state = cardState(card);
      const total = number(card.limitedTotal);
      const issued = number(card.issuedCount);
      const remaining = number(card.remainingCount);
      const issuedPercent = total > 0 ? Math.min(100, Math.max(0, issued / total * 100)) : 0;
      return `
        <article class="limitedStockCard stock-${state.key.toLowerCase()}">
          <div class="limitedStockThumb">
            <img src="${escapeHtml(imageUrl(card.image))}" alt="${escapeHtml(card.title)}" style="object-position:${number(card.focusX)}% ${number(card.focusY)}%">
            <span class="limitedStockStatus">${escapeHtml(state.label)}</span>
          </div>
          <div class="limitedStockInfo">
            <div class="limitedStockTitle">
              <div><small>${escapeHtml(card.memberName)}</small><b>${escapeHtml(card.title)}</b></div>
              <span>LIMITED</span>
            </div>
            <div class="limitedStockRemaining"><small>서버 잔여</small><b>${formatNumber(remaining)}<em>장</em></b></div>
            <div class="limitedStockProgress"><i style="width:${issuedPercent.toFixed(2)}%"></i></div>
            <div class="limitedStockMetrics">
              <span><small>누적 발급</small><b>${formatNumber(issued)} / ${formatNumber(total)}</b></span>
              <span><small>현재 유저 보유</small><b>${formatNumber(card.heldCount)}장</b></span>
              <span><small>보유 계정</small><b>${formatNumber(card.ownerCount)}명</b></span>
            </div>
            <small class="limitedStockId">카드 ID · ${escapeHtml(card.id)}</small>
          </div>
        </article>`;
    }).join('');
    box.querySelectorAll('img').forEach(image => {
      image.addEventListener('error', () => {
        if (image.dataset.fallback === '1') return;
        image.dataset.fallback = '1';
        image.src = fallbackImage;
      }, { once: true });
    });
  }

  function decorateCardEditors() {
    if (typeof state === 'undefined' || !Array.isArray(state.cards)) return;
    const map = new Map((data.cards || []).map(card => [String(card.id), card]));
    document.querySelectorAll('#cards .adminCard[data-id]').forEach(element => {
      const card = map.get(String(element.dataset.id));
      const old = qs('.limitedInlineStock', element);
      if (!card) {
        old?.remove();
        return;
      }
      const stateInfo = cardState(card);
      const markup = `<div class="limitedInlineStock stock-${stateInfo.key.toLowerCase()}"><span>서버 잔여</span><b>${formatNumber(card.remainingCount)}장</b><small>누적 ${formatNumber(card.issuedCount)} / ${formatNumber(card.limitedTotal)}</small></div>`;
      if (old) old.outerHTML = markup;
      else qs('.limitInfo', element)?.insertAdjacentHTML('afterend', markup);
    });
  }

  function setLoadState(text, stateName = '') {
    const element = qs('#limitedStockLoadState');
    if (!element) return;
    element.textContent = text;
    element.dataset.state = stateName;
  }

  async function loadStock(force = false) {
    ensurePanel();
    if (loadingPromise && !force) return loadingPromise;
    const sequence = ++loadSequence;
    setLoadState('조회 중', 'loading');
    loadingPromise = (async () => {
      try {
        if (typeof api !== 'function') throw new Error('CMS API 함수를 찾지 못했습니다.');
        const response = await api('admin/limited-stock');
        if (sequence !== loadSequence) return;
        data = {
          cards: Array.isArray(response.cards) ? response.cards : [],
          summary: response.summary || {}
        };
        renderSummary();
        renderList();
        decorateCardEditors();
        const now = new Date(response.generatedAt || Date.now());
        setLoadState(`확인 ${now.toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' })}`, 'ok');
      } catch (error) {
        if (sequence !== loadSequence) return;
        setLoadState('조회 실패', 'error');
        const list = qs('#limitedStockList');
        if (list) list.innerHTML = `<div class="limitedStockEmpty error"><b>재고 조회 실패</b><span>${escapeHtml(error?.message || '알 수 없는 오류')}</span></div>`;
      } finally {
        if (sequence === loadSequence) loadingPromise = null;
      }
    })();
    return loadingPromise;
  }

  function hookShow() {
    if (typeof window.show !== 'function' || window.show.__limitedStockV1085) return;
    const original = window.show;
    window.show = function(view, prefetched) {
      const result = original(view, prefetched);
      if (view === 'cards') setTimeout(() => loadStock(false), 0);
      return result;
    };
    window.show.__limitedStockV1085 = true;
  }

  document.addEventListener('click', event => {
    if (event.target.closest?.('#nav [data-view="cards"]')) setTimeout(() => loadStock(false), 50);
    if (event.target.closest?.('#saveAllCardsBtn, #cards .save, #pendingPublishBtn, #pendingDisableBtn')) {
      setTimeout(() => loadStock(true), 800);
    }
  }, true);

  const observer = new MutationObserver(mutations => {
    let shouldDecorate = false;
    for (const mutation of mutations) {
      if ([...mutation.addedNodes].some(node => node.nodeType === 1 && (node.matches?.('.adminCard') || node.querySelector?.('.adminCard')))) {
        shouldDecorate = true;
        break;
      }
    }
    if (shouldDecorate) requestAnimationFrame(decorateCardEditors);
  });

  function init() {
    ensurePanel();
    hookShow();
    const cards = qs('#cards');
    if (cards) observer.observe(cards, { childList: true, subtree: true });
    if (typeof state !== 'undefined' && state.view === 'cards') loadStock(false);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init, { once: true });
  else init();
})();
