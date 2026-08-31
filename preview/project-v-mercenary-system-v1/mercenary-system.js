import {
  MERCENARY_FORMATION_RULES,
  buildMercenaryFormation
} from '../../js/project-v-mercenary-loadout-v1.js';
import { createMercenaryBattleArtAdapter } from '../../js/project-v-mercenary-battle-art-adapter-v1.js';

const DATA_URL = '../../assets/ui/project-v/mercenaries/mercenary-system-roster-v1.json';
const FRAME_URL = '../../assets/ui/card-frames/mercenary-contract-frame-premium-v2.png';

const state = {
  roster: null,
  battleArt: null,
  selectedCode: null,
  assignedCode: null,
  filter: 'all'
};

const nodes = {
  grid: document.querySelector('#rosterGrid'),
  detail: document.querySelector('#detailPanel'),
  slot: document.querySelector('#mercenarySlot'),
  count: document.querySelector('#formationCount'),
  filters: document.querySelector('#filters'),
  total: document.querySelector('#totalCount'),
  ready: document.querySelector('#sdReadyCount'),
  pending: document.querySelector('#sdPendingCount')
};

function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function assetUrl(path) {
  return path ? `../../${String(path).replace(/^\/+/, '')}` : '';
}

function selectedCard() {
  return state.roster?.cards.find((card) => card.code === state.selectedCode) || null;
}

function assignedCard() {
  return state.roster?.cards.find((card) => card.code === state.assignedCode) || null;
}

function resolvedBattleArt(card) {
  return state.battleArt?.resolveForConsumer('BATTLE_FIELD', card?.code) || null;
}

function filteredCards() {
  const cards = state.roster?.cards || [];
  if (state.filter === 'sd-ready') return cards.filter((card) => Boolean(card.battleSprite));
  if (state.filter === 'sd-pending') return cards.filter((card) => !card.battleSprite);
  return cards;
}

function sourceStatusLabel(card) {
  if (card.sourceArtStatus === 'APPROVED_SOURCE_ART') return '승인 원화';
  if (card.sourceArtStatus === 'USER_SUPPLIED_SOURCE_ART') return '사용자 지정 원화';
  return '기존 원화 보존';
}

function spriteStatusLabel(card) {
  if (!card.battleSprite) return '전투 SD 제작 대기';
  if (card.battleSpriteStatus.includes('USER_REVIEW_PENDING')) return '전투 SD 기술검수 완료 · 시각검수 대기';
  return '전투 SD 준비 완료';
}

function renderGrid() {
  const cards = filteredCards();
  nodes.grid.innerHTML = cards.map((card) => {
    const selected = card.code === state.selectedCode;
    const assigned = card.code === state.assignedCode;
    return `
      <button class="roster-card${selected ? ' selected' : ''}${assigned ? ' assigned' : ''}" type="button"
        data-code="${escapeHtml(card.code)}" style="--accent:${escapeHtml(card.accent)}">
        <span class="card-visual">
          <img class="card-art" src="${assetUrl(card.sourceArt)}" alt="${escapeHtml(card.title)} ${escapeHtml(card.name)}" loading="lazy">
          <span class="card-shade"></span>
          <img class="card-frame" src="${FRAME_URL}" alt="" loading="lazy">
          <span class="card-code">${escapeHtml(card.code)}</span>
          <span class="rank-pending">등급 미정</span>
          ${assigned ? '<span class="assigned-mark">6번 배치</span>' : ''}
          <span class="card-name"><small>${escapeHtml(card.title)}</small><b>${escapeHtml(card.name)}</b><em>${escapeHtml(card.role)}</em></span>
        </span>
        <span class="asset-state ${card.battleSprite ? 'ready' : 'pending'}"><i></i>${card.battleSprite ? 'SD 준비' : 'SD 대기'}</span>
      </button>`;
  }).join('');

  if (!cards.length) nodes.grid.innerHTML = '<div class="loading-state">조건에 맞는 용병이 없습니다.</div>';
  nodes.grid.querySelectorAll('[data-code]').forEach((button) => {
    button.addEventListener('click', () => {
      state.selectedCode = button.dataset.code;
      renderGrid();
      renderDetail();
    });
  });
}

function renderDetail() {
  const card = selectedCard();
  if (!card) {
    nodes.detail.innerHTML = '<div class="detail-empty">명단에서 용병을 선택하세요.</div>';
    return;
  }
  const isAssigned = state.assignedCode === card.code;
  const battleArt = resolvedBattleArt(card);
  nodes.detail.style.setProperty('--accent', card.accent);
  nodes.detail.innerHTML = `
    <div class="detail-head">
      <span><small>SELECTED CONTRACT</small><b>${escapeHtml(card.code)}</b></span>
      <em>등급 미정 · 사용자 확정 대기</em>
    </div>
    <div class="detail-media">
      <div class="detail-card">
        <img class="detail-art" src="${assetUrl(card.sourceArt)}" alt="${escapeHtml(card.name)} 원화">
        <img class="detail-frame" src="${FRAME_URL}" alt="">
      </div>
      <div class="sprite-stage ${battleArt ? '' : 'empty'}">
        ${battleArt
          ? `<img src="${escapeHtml(battleArt.spriteUrl)}" alt="${escapeHtml(card.name)} 전투 SD">`
          : '<span><i>SD</i><b>제작 대기</b><small>원화를 전투 스프라이트로 대체하지 않음</small></span>'}
      </div>
    </div>
    <div class="detail-copy">
      <small>${escapeHtml(card.title)}</small>
      <h3>${escapeHtml(card.name)}</h3>
      <p>${escapeHtml(card.role)}</p>
    </div>
    <dl class="asset-ledger">
      <div><dt>카드 원화</dt><dd>${sourceStatusLabel(card)}</dd></div>
      <div><dt>전투 리소스</dt><dd>${spriteStatusLabel(card)}</dd></div>
      <div><dt>신규 등급</dt><dd>미정</dd></div>
      <div><dt>편성 위치</dt><dd>일반 덱과 분리된 6번 슬롯</dd></div>
    </dl>
    <div class="detail-actions">
      <button type="button" class="place-button" id="placeMercenary">${isAssigned ? '6번 슬롯 배치 완료' : '6번 용병 슬롯에 배치'}</button>
      <button type="button" class="clear-button" id="clearMercenary" ${state.assignedCode ? '' : 'disabled'}>용병 슬롯 비우기</button>
    </div>`;

  document.querySelector('#placeMercenary').addEventListener('click', () => {
    state.assignedCode = card.code;
    renderAll();
  });
  document.querySelector('#clearMercenary').addEventListener('click', () => {
    state.assignedCode = null;
    renderAll();
  });
}

function renderFormation() {
  const card = assignedCard();
  const regularDemoIds = ['DECK-01', 'DECK-02', 'DECK-03', 'DECK-04', 'DECK-05'];
  const formation = buildMercenaryFormation(regularDemoIds, card?.code || null);
  nodes.count.textContent = `${formation.length} / ${MERCENARY_FORMATION_RULES.maxDeployedUnits}`;

  if (!card) {
    nodes.slot.className = 'formation-slot mercenary empty';
    nodes.slot.innerHTML = '<i>06</i><span><small>용병 전용</small><b>미배치</b><em>덱 슬롯 미사용</em></span>';
    return;
  }
  nodes.slot.className = 'formation-slot mercenary filled';
  nodes.slot.style.setProperty('--accent', card.accent);
  nodes.slot.innerHTML = `
    <img src="${assetUrl(card.sourceArt)}" alt="">
    <i>06</i>
    <span><small>${escapeHtml(card.code)} · 용병 전용</small><b>${escapeHtml(card.name)}</b><em>${escapeHtml(card.role)}</em></span>`;
}

function renderMetrics() {
  const cards = state.roster.cards;
  const ready = cards.filter((card) => Boolean(card.battleSprite)).length;
  nodes.total.textContent = String(cards.length);
  nodes.ready.textContent = String(ready);
  nodes.pending.textContent = String(cards.length - ready);
}

function renderAll() {
  renderMetrics();
  renderGrid();
  renderDetail();
  renderFormation();
}

nodes.filters.addEventListener('click', (event) => {
  const button = event.target.closest('[data-filter]');
  if (!button) return;
  state.filter = button.dataset.filter;
  nodes.filters.querySelectorAll('[data-filter]').forEach((node) => node.classList.toggle('active', node === button));
  renderGrid();
});

fetch(DATA_URL, { cache: 'no-store' })
  .then((response) => {
    if (!response.ok) throw new Error(`ROSTER_${response.status}`);
    return response.json();
  })
  .then((roster) => {
    state.roster = roster;
    state.battleArt = createMercenaryBattleArtAdapter(roster);
    state.selectedCode = roster.cards[0]?.code || null;
    renderAll();
  })
  .catch((error) => {
    console.error(error);
    nodes.grid.innerHTML = '<div class="loading-state error">용병 로스터를 불러오지 못했습니다.</div>';
  });
