import { NEW_HYPERDRIVE_PACK as pack, newHyperdriveBudgetQuote } from '../shared/new-hyperdrive-pack-v1.mjs';

const format = value => BigInt(value ?? 0).toLocaleString('ko-KR');
const escape = value => String(value ?? '').replace(/[&<>"']/g, char => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
})[char]);
const packImage = (sizes, width = 320) => `<img src="${pack.assetRoot}/pack-${width}.webp"
  srcset="${pack.assetRoot}/pack-320.webp 320w, ${pack.assetRoot}/pack-768.webp 768w"
  sizes="${sizes}" width="320" height="529" alt="" decoding="async">`;
const terminalCodes = new Set(['INVALID_DRAW', 'PACK_CHANGED', 'PACK_CLOSED', 'POOL_EMPTY', 'INSUFFICIENT_COINS', 'REQUEST_MISMATCH', 'REWARD_CAPACITY']);
const budgetName = budget => `${format(BigInt(budget) / 1000000000000n)}조`;
const drawQuote = (unitPrice, count, budget) => budget
  ? newHyperdriveBudgetQuote(unitPrice, budget) : {count, cost: unitPrice * count, unused: 0};

function oddsMarkup(entries) {
  if (!entries.length) return '';
  const total = entries.reduce((sum, row) => sum + row.drawWeight, 0);
  const rows = entries.map(row => {
    const odds = (100 * row.drawWeight / total).toLocaleString('ko-KR', {maximumFractionDigits: 6});
    return `<li><span>${escape(row.name)}</span><b>${odds}%</b></li>`;
  }).join('');
  const avatarNote = entries.some(row => row.rewardType === 'AVATAR')
    ? '<p>보유 중인 아바타는 추첨 대상에서 제외됩니다.</p>' : '';
  return `<details class="nhd-odds"><summary>등장 목록 · 확률</summary>${avatarNote}<ul>${rows}</ul></details>`;
}

function resultMarkup(result) {
  const rewards = result.aggregated.map(row => {
    const image = row.image ? `<img src="${escape(row.image.startsWith('assets/') ? '/' + row.image : row.image)}" alt="" width="72" height="48">` : '';
    const tier = row.presentation?.enabled ? escape(row.presentation.tier) : 'STANDARD';
    return `<li data-tier="${tier}">${image}<div><small>${escape(row.rarity)}</small><strong>${escape(row.name)}</strong>
      <span>${row.newCount ? `신규 ${format(row.newCount)} · ` : ''}획득 ${format(row.count)}${row.duplicateCount ? ` · 중복 ${format(row.duplicateCount)}` : ''}</span></div></li>`;
  }).join('');
  return `<h3 tabindex="-1">${format(result.count)}회 개봉 완료</h3>
    <p>${format(result.totalPrice)} 코인 사용 · 잔액 ${format(result.coin)} 코인</p>
    <ul class="nhd-rewards">${rewards}</ul>
    <p>카드 조각 ${format(result.shardsGained)}개 · 마스터의 별 ${format(result.masterStarsGained)}개</p>`;
}

export function mountNewHyperdriveShop({root, api, accountId, onResult, loadPrimeReveal}) {
  const storageKey = `cnine:new-hyperdrive:pending:${accountId}`;
  let config = null;
  let pending = null;
  let busy = false;
  let confirmation = null;
  try {
    const saved = JSON.parse(sessionStorage.getItem(storageKey));
    if (Number.isSafeInteger(saved?.expectedUnitPrice) && saved.expectedUnitPrice > 0 &&
      typeof saved.requestId === 'string' && typeof saved.expectedRevision === 'string') {
      const valid = saved.budget
        ? pack.budgets.includes(saved.budget) && drawQuote(saved.expectedUnitPrice, 0, saved.budget).count === saved.count
        : pack.counts.includes(saved.count);
      if (valid) pending = saved;
    }
  } catch {}

  root.innerHTML = `
    <section class="nhd-hero" aria-labelledby="nhd-title">
      <div class="nhd-copy">
        <p class="nhd-brand">REVERSE CALL · ${pack.subtitle}</p>
        <h2 id="nhd-title">${pack.name}</h2>
        <p class="nhd-state" data-nhd-state role="status">판매 준비 중</p>
        <button type="button" class="nhd-primary nhd-enter" data-nhd-enter>개봉실 미리보기</button>
        <p class="nhd-prices" data-nhd-prices></p>
        <button type="button" class="nhd-link" data-nhd-refresh hidden>판매 정보 다시 확인</button>
      </div>
      <div class="nhd-art">${packImage('(max-width: 600px) 130px, 260px', 768)}</div>
    </section>
    <dialog class="nhd-room" aria-labelledby="nhd-room-title">
      <header class="nhd-room-head"><h2 id="nhd-room-title">${pack.name}</h2>
        <button type="button" data-nhd-close>닫기</button></header>
      <div class="nhd-room-body">
        <div class="nhd-room-art">${packImage('170px')}</div>
        <div class="nhd-room-panel">
          <div data-nhd-content></div>
          <p class="nhd-message" data-nhd-message role="status"></p>
        </div>
      </div>
    </dialog>`;

  const dialog = root.querySelector('dialog');
  const content = root.querySelector('[data-nhd-content]');
  const message = root.querySelector('[data-nhd-message]');
  const enter = root.querySelector('[data-nhd-enter]');
  const refresh = root.querySelector('[data-nhd-refresh]');
  const stateLabel = root.querySelector('[data-nhd-state]');
  const prices = root.querySelector('[data-nhd-prices]');
  const price = () => config?.shop?.unitPrice ?? pack.unitPrice;
  const available = () => config?.openEnabled === true && config?.shop?.enabled === true;
  const enoughCoins = cost => BigInt(config?.coin ?? 0) >= BigInt(cost);

  function savePending(value) {
    pending = value;
    try {
      if (value) sessionStorage.setItem(storageKey, JSON.stringify(value));
      else sessionStorage.removeItem(storageKey);
    } catch {}
  }

  function updateShop() {
    stateLabel.textContent = available() ? '판매 중' : '판매 준비 중';
    enter.textContent = available() ? `${pack.name} 개봉` : '개봉실 미리보기';
    prices.innerHTML = pack.counts.map(count => `<span>${count}회 ${format(price() * count)} 코인</span>`).join('')
      + `<span class="nhd-bulk-price">일괄 개봉 ${pack.budgets.map(budgetName).join(' · ')}</span>`;
  }

  function drawButtons() {
    const disabled = cost => available() && enoughCoins(cost) ? '' : 'disabled';
    const standard = pack.counts.map(count => `<button type="button" class="nhd-primary" data-nhd-count="${count}" ${disabled(price() * count)}>
      <b>${count}회 개봉</b><small>${format(price() * count)} 코인</small></button>`);
    const batch = pack.budgets.map(budget => {
      const {count, cost} = drawQuote(price(), 0, budget);
      return `<button type="button" class="nhd-primary nhd-bulk" data-nhd-budget="${budget}" ${disabled(cost)}>
        <b>${budgetName(budget)} 일괄 개봉</b><small>${format(count)}회</small></button>`;
    });
    return `<div class="nhd-options">${[...standard, ...batch].join('')}</div>`;
  }

  function showChoices() {
    confirmation = null;
    content.innerHTML = `<h3>개봉 횟수 선택</h3>${config ? `<p>보유 코인 ${format(config.coin)}</p>` : ''}
      ${drawButtons()}${oddsMarkup(config?.pool?.entries ?? [])}`;
    if (available()) message.textContent = enoughCoins(price()) ? '' : '코인이 부족합니다.';
    else message.textContent = '판매가 시작되면 개봉할 수 있습니다.';
  }

  function showPending() {
    const quote = drawQuote(pending.expectedUnitPrice, pending.count, pending.budget);
    content.innerHTML = `<h3>이전 개봉 결과 확인</h3><p>${format(quote.count)}회 · ${format(quote.cost)} 코인</p>
      <div class="nhd-options">
        <button type="button" class="nhd-primary" data-nhd-receipt ${busy ? 'disabled' : ''}>결과 확인</button>
        <button type="button" data-nhd-retry ${busy ? 'disabled' : ''}>같은 요청 재시도</button>
      </div>`;
  }

  async function playSpecial(result) {
    if (!result.specialQueue?.length || !loadPrimeReveal || !dialog.open || !root.isConnected) return;
    const stage = document.createElement('div');
    const skip = document.createElement('button');
    skip.type = 'button';
    skip.className = 'nhd-reveal-skip';
    skip.textContent = '연출 건너뛰기';
    dialog.classList.add('nhd-playing');
    dialog.append(stage, skip);
    let cancelled = false;
    let runtime;
    let finish;
    const interrupted = new Promise(resolve => { finish = resolve; });
    const stop = () => {
      cancelled = true;
      runtime?.destroy();
      finish();
    };
    const onCancel = event => { event.preventDefault(); stop(); };
    const observer = new MutationObserver(() => { if (!root.isConnected) stop(); });
    observer.observe(document.body, {childList: true, subtree: true});
    skip.addEventListener('click', stop, {once: true});
    dialog.addEventListener('cancel', onCancel);
    dialog.addEventListener('close', stop, {once: true});
    skip.focus();
    try {
      const play = async () => {
        const reveal = await loadPrimeReveal();
        if (cancelled || !root.isConnected || !dialog.open) return;
        runtime = reveal;
        await runtime?.play({
          modal: stage, kind: 'vehicle',
          product: {name: pack.name, subtitle: pack.subtitle, image: pack.assetRoot + '/pack-768.webp'},
          result
        });
      };
      await Promise.race([play(), interrupted]);
    } catch {
      runtime?.destroy();
    } finally {
      observer.disconnect();
      dialog.removeEventListener('cancel', onCancel);
      dialog.removeEventListener('close', stop);
      stage.remove();
      skip.remove();
      dialog.classList.remove('nhd-playing');
    }
  }

  async function showResult(result) {
    await playSpecial(result);
    if (!root.isConnected || !dialog.open) {
      onResult(result);
      return;
    }
    const markup = resultMarkup(result);
    if (config) config.coin = result.coin;
    content.innerHTML = `${markup}${drawButtons()}`;
    savePending(null);
    confirmation = null;
    dialog.classList.add('nhd-revealed');
    message.textContent = '';
    content.querySelector('h3').focus();
    onResult(result);
  }

  async function readConfig() {
    if (!api) return;
    refresh.hidden = true;
    try {
      const next = await api(`${pack.apiPath}/config`);
      if (!root.isConnected) return;
      config = next;
      updateShop();
      if (dialog.open && !pending && !confirmation && !busy && !dialog.classList.contains('nhd-revealed')) showChoices();
    } catch {
      if (!root.isConnected) return;
      config = null;
      stateLabel.textContent = '판매 정보를 확인할 수 없습니다.';
      enter.textContent = '개봉실 미리보기';
      refresh.hidden = false;
    }
  }

  async function lookup() {
    if (busy || !pending || !api) return;
    busy = true;
    showPending();
    message.textContent = '이전 개봉 결과를 확인하고 있습니다.';
    try {
      const result = await api(`${pack.apiPath}/receipt?requestId=${encodeURIComponent(pending.requestId)}`);
      await showResult(result);
    } catch (error) {
      message.textContent = error.code === 'RECEIPT_MISSING'
        ? '완료된 결과가 없습니다. 같은 요청으로 다시 시도할 수 있습니다.' : error.message;
    } finally {
      busy = false;
      if (pending) showPending();
    }
  }

  async function openPack() {
    if (busy || !pending || !api) return;
    busy = true;
    content.innerHTML = `<h3>${format(pending.count)}회 개봉 중</h3>`;
    dialog.classList.remove('nhd-revealed');
    dialog.classList.add('nhd-opening');
    message.textContent = '코인 차감과 보상을 확인하고 있습니다.';
    try {
      const result = await api(`${pack.apiPath}/open`, {method: 'POST', body: JSON.stringify(pending)});
      await showResult(result);
    } catch (error) {
      if (terminalCodes.has(error.code)) {
        savePending(null);
        confirmation = null;
        if (['PACK_CHANGED', 'PACK_CLOSED', 'POOL_EMPTY', 'INSUFFICIENT_COINS'].includes(error.code)) {
          config = null;
          await readConfig();
        }
        showChoices();
      }
      message.textContent = error.message || '개봉 응답을 확인할 수 없습니다.';
    } finally {
      busy = false;
      dialog.classList.remove('nhd-opening');
      if (pending) showPending();
    }
  }

  function choose(count, budget) {
    if (busy || pending || !available()) return;
    const quote = drawQuote(price(), count, budget);
    if (!quote.count || !enoughCoins(quote.cost)) return;
    confirmation = {count: quote.count, expectedUnitPrice: price(), expectedRevision: config.settings.revision, ...(budget ? {budget} : {})};
    dialog.classList.remove('nhd-revealed');
    content.innerHTML = `<h3>${format(quote.count)}회 개봉할까요?</h3>
      <p>${budget ? `${budgetName(budget)} 예산 · ` : ''}사용 코인 <b>${format(quote.cost)}</b></p>
      ${quote.unused ? `<p>남는 예산 ${format(quote.unused)} 코인</p>` : ''}
      <p>개봉 후 잔액 ${format(BigInt(config.coin) - BigInt(quote.cost))} 코인</p>
      <div class="nhd-options"><button type="button" data-nhd-back>돌아가기</button>
      <button type="button" class="nhd-primary" data-nhd-confirm>개봉하기</button></div>`;
    message.textContent = '';
    content.querySelector('[data-nhd-back]').focus();
  }

  updateShop();
  void readConfig();
  refresh.addEventListener('click', readConfig);
  enter.addEventListener('click', () => {
    if (dialog.open) return;
    dialog.classList.remove('nhd-revealed');
    if (!pending) showChoices();
    else showPending();
    dialog.showModal();
    if (pending && !busy) void lookup();
  });
  dialog.addEventListener('close', () => enter.focus());
  dialog.addEventListener('click', event => {
    const button = event.target.closest('button');
    if (!button || button.disabled) return;
    if (button.hasAttribute('data-nhd-close')) dialog.close();
    else if (button.hasAttribute('data-nhd-count')) choose(Number(button.dataset.nhdCount));
    else if (button.hasAttribute('data-nhd-budget')) choose(0, button.dataset.nhdBudget);
    else if (button.hasAttribute('data-nhd-back')) showChoices();
    else if (button.hasAttribute('data-nhd-receipt')) void lookup();
    else if (button.hasAttribute('data-nhd-retry')) void openPack();
    else if (button.hasAttribute('data-nhd-confirm') && confirmation && !pending && !busy) {
      savePending({...confirmation, requestId: crypto.randomUUID()});
      void openPack();
    }
  });
}
