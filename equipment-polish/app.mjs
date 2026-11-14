import {jointAccountRequest} from '/js/joint-account-transport.mjs';
import {POLISH_OPTIONS, polishRates} from '/shared/equipment-polish-v1.mjs?v=20261114';
import {createPolishRequest} from '/js/equipment-polish-request-v1.mjs';

const $ = selector => document.querySelector(selector);
const escape = value => String(value ?? '').replace(/[&<>"']/g, char => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
}[char]));
const icons = ['attack', 'critical-chance', 'critical-damage', 'boss-damage', 'penetration'];
const icon = name => '<span class="ep-icon" data-icon="' + name + '" aria-hidden="true"></span>';
const params = new URLSearchParams(location.search);
const credential = params.has('cms') ? 'admin' : 'player';
const controller = new AbortController();
const api = (action, options = {}) => jointAccountRequest('character/equipment/polish/' + action, {
  ...options, credential, signal: controller.signal
});
const reduced = matchMedia('(prefers-reduced-motion: reduce)');
let data, items = [], selected, intent, receipt;
let busy = false, closed = false, animation = null;
let levels = [0, 0, 0, 0, 0], values = [0, 0, 0, 0, 0];
const resultKey = () => 'cnine_polish_reveal_v1:' + data.userId;
const count = () => levels.reduce((sum, n) => sum + n, 0);
const effect = (index, value) => '+' + Number(value.toFixed(2)) + POLISH_OPTIONS[index].unit;

function amount(raw) {
  const n = BigInt(raw ?? 0);
  for (const [unit, label] of [[10000000000000000n, '경'], [1000000000000n, '조'], [100000000n, '억'], [10000n, '만']]) {
    if (n >= unit) {
      const decimal = n % unit * 100n / unit;
      return (n / unit).toLocaleString('ko-KR') + (decimal ? '.' + String(decimal).padStart(2, '0').replace(/0$/, '') : '') + label;
    }
  }
  return n.toLocaleString('ko-KR');
}

function cost() {
  return data.settings.costs[Math.min(count(), data.settings.costs.length - 1)];
}

function affordable() {
  const price = cost();
  return ['coins', 'masterStars', 'stones'].every(key => BigInt(data.wallet[key]) >= BigInt(price[key]));
}

function setBusy(on) {
  busy = on;
  const pending = !!intent?.pending;
  $('#equipment-select').disabled = on || pending;
  $('#equipment-more').disabled = on || pending;
  $('#refresh').disabled = on;
  const complete = count() >= data.settings.maxAttempts;
  const allowed = selected?.polishEligible && (data.canPolish || data.ownerReview);
  $('#start').disabled = on || (!pending && (!allowed || complete || (data.canPolish && !affordable())));
  $('#start-label').textContent = on ? '연마 중' : pending ? '이전 연마 결과 확인' : complete ? '옵션 성장 완료'
    : data.canPolish ? receipt ? '한 번 더 연마' : '연마 시작' : data.ownerReview ? '연출 검수' : '연마 준비 중';
}

function renderPanel(selectedIndex = -1) {
  const settings = data.settings;
  const rates = polishRates(settings, levels);
  $('#success-rate').textContent = settings.successRate + '%';
  $('#miss-rate').textContent = Number((100 - settings.successRate).toFixed(2)) + '%';
  $('#growth-count').textContent = '성장 ' + count() + ' / ' + settings.maxAttempts;
  $('#options').innerHTML = POLISH_OPTIONS.map((option, i) => {
    const policy = settings.options[i];
    const chance = !policy.enabled ? '제외' : levels[i] >= policy.maxLevel ? 'MAX' : Number(rates[i].toFixed(2)) + '%';
    return '<div class="option-row' + (i === selectedIndex ? ' is-selected' : '') + '">' + icon(icons[i]) +
      '<div><strong>' + option.name + '</strong><small>Lv.' + levels[i] + ' / ' + policy.maxLevel +
      ' · 회당 +' + policy.increment + option.unit + '</small></div><div class="option-value"><b>' +
      effect(i, values[i]) + '</b><small>' + chance + '</small></div></div>';
  }).join('');
  const price = cost();
  $('#costs').innerHTML = [
    ['coins', 'coin', '코인'], ['masterStars', 'master-star', '마스터의 별'], ['stones', 'polish-stone', settings.material.name]
  ].map(([key, image, name]) => {
    const short = BigInt(data.wallet[key]) < BigInt(price[key]);
    return '<div class="cost' + (short ? ' is-short' : '') + '">' + icon(image) +
      '<div><small>' + escape(name) + '</small><b>' + amount(price[key]) + '</b><em>보유 ' +
      amount(data.wallet[key]) + (short ? ' · 부족' : '') + '</em></div></div>';
  }).join('');
}

function renderPicker(id = selected?.instanceId) {
  $('#equipment-select').innerHTML = items.length ? items.map(item =>
    '<option value="' + escape(item.instanceId) + '">' + escape(item.name) + ' · +' +
    (item.enhancement?.level || 0) + ' · #' + escape(item.instanceId) + '</option>'
  ).join('') : '<option value="">보유 장비 없음</option>';
  if (items.some(item => item.instanceId === id)) $('#equipment-select').value = id;
  $('#equipment-more').hidden = !data.nextCursor;
}

function reelMarkup() {
  // Symbols identify possible outcomes. The server's published weighted draw determines the result.
  const sequence = [0, -1, 2, 1, -1, 3, -1, 4, -1];
  $('#reel-track').innerHTML = Array.from({length: 88}, (_, index) => {
    const symbol = sequence[index % sequence.length];
    return '<div class="reel-tile" data-symbol="' + symbol + '">' +
      icon(symbol < 0 ? 'miss' : icons[symbol]) + '<p>' +
      (symbol < 0 ? '꽝' : POLISH_OPTIONS[symbol].name) + '</p></div>';
  }).join('');
}

function reelOffset(index) {
  const width = $('#reel-track').firstElementChild.getBoundingClientRect().width;
  return $('#reel-window').clientWidth / 2 - width * (index + .5);
}

function stopAnimation() {
  animation?.cancel();
  animation = null;
}

function idle() {
  stopAnimation();
  $('#result').hidden = true;
  $('#phase').classList.remove('is-result');
  $('#reel-window').hidden = false;
  $('.reel-marker').hidden = false;
  reelMarkup();
  $('#reel-track').style.transform = 'translateX(' + reelOffset(4) + 'px)';
  $('#phase').textContent = '연마를 시작하면 룰렛이 돌아갑니다.';
}

function choose() {
  selected = items.find(item => item.instanceId === $('#equipment-select').value);
  levels = [...(selected?.polish.levels || [0, 0, 0, 0, 0])];
  values = [...(selected?.polish.values || [0, 0, 0, 0, 0])];
  receipt = null;
  $('#equipment-detail').textContent = selected ? '#' + selected.instanceId +
    ' · 강화 +' + (selected.enhancement?.level || 0) + (selected.equipped ? ' · 장착 중' : ' · 보관 중') : '';
  const image = $('#equipment-image');
  image.hidden = !selected?.image;
  if (selected?.image) image.src = selected.image;
  $('#live-message').textContent = !selected ? '연마할 수 있는 보유 장비가 없습니다.'
    : !selected.polishEligible ? '이 부위는 연마 대상에서 제외되어 있습니다.' : '';
  idle();
  renderPanel();
  setBusy(false);
}

function startReel() {
  idle();
  $('#phase').textContent = '장비의 잠재력을 연마하고 있습니다.';
  const track = $('#reel-track');
  animation = reduced.matches
    ? track.animate([{opacity: .65}, {opacity: 1}, {opacity: .65}], {duration: 1400, iterations: Infinity})
    : track.animate([
      {transform: 'translateX(' + reelOffset(4) + 'px)'},
      {transform: 'translateX(' + reelOffset(22) + 'px)'}
    ], {duration: 850, iterations: Infinity, easing: 'linear'});
}

async function reveal(result) {
  receipt = result;
  const success = result.success ?? result.selected >= 0;
  const chosen = success ? result.selected : -1;
  const track = $('#reel-track');
  const currentTransform = getComputedStyle(track).transform;
  stopAnimation();
  track.style.transform = currentTransform;
  const target = track.children[80];
  target.innerHTML = icon(success ? icons[chosen] : 'miss') + '<p>' +
    (success ? POLISH_OPTIONS[chosen].name : '꽝') + '</p>';
  animation = reduced.matches
    ? target.animate([{opacity: .5}, {opacity: 1}], {duration: 1400, fill: 'forwards'})
    : track.animate([{transform: currentTransform}, {transform: 'translateX(' + reelOffset(80) + 'px)'}], {
      duration: 4600, easing: 'cubic-bezier(.12,.7,.12,1)', fill: 'forwards'
    });
  if (document.hidden) animation.pause();
  try { await animation.finished; } catch { return; }
  if (closed) return;
  stopAnimation();
  track.style.transform = 'translateX(' + reelOffset(80) + 'px)';
  levels = [...result.levels];
  values = result.values || levels.map((level, i) =>
    i === chosen ? Number((values[i] + data.settings.options[i].increment).toFixed(2)) : values[i]);
  $('#reel-window').hidden = true;
  $('.reel-marker').hidden = true;
  $('#result').hidden = false;
  $('#result').classList.toggle('is-miss', !success);
  $('#result-icon').dataset.icon = success ? icons[chosen] : 'miss';
  $('#result-title').textContent = success ? POLISH_OPTIONS[chosen].name + ' 상승' : '꽝';
  $('#result-detail').textContent = success
    ? effect(chosen, result.beforeValues?.[chosen] ?? values[chosen] - data.settings.options[chosen].increment) +
      ' → ' + effect(chosen, values[chosen]) : '옵션 변화 없음';
  $('#phase').textContent = result.previewOnly
    ? '연출 검수 결과 · 실제 장비와 재화 차감 없음'
    : success ? POLISH_OPTIONS[chosen].name + ' ' + $('#result-detail').textContent + ' 상승' : '꽝, 옵션 변화 없음';
  $('#phase').classList.add('is-result');
  renderPanel(chosen);
  if (!reduced.matches) {
    animation = $('#result-icon').animate(
      [{transform: 'scale(.86)', opacity: .3}, {transform: 'scale(1)', opacity: 1}],
      {duration: 420, easing: 'cubic-bezier(.16,1,.3,1)'}
    );
    try { await animation.finished; } catch { return; }
    stopAnimation();
  }
  try { localStorage.removeItem(resultKey()); } catch {}
}

function applyReceipt(result) {
  if (result.previewOnly) return;
  const owned = items.find(item => item.instanceId === result.instanceId);
  if (owned && (owned.polish.rolls ?? owned.polish.attempts) < (result.state.rolls ?? result.state.attempts)) {
    for (const key of ['coins', 'masterStars', 'stones']) {
      data.wallet[key] = (BigInt(data.wallet[key]) - BigInt(result.cost[key])).toString();
    }
    owned.polish = result.state;
  }
  try { localStorage.setItem(resultKey(), result.requestId); } catch {}
}

async function begin() {
  if (busy || !selected) return;
  setBusy(true);
  $('#live-message').textContent = '';
  startReel();
  try {
    const result = data.canPolish || intent.pending ? await intent.execute({
      instanceId: selected.instanceId, revision: data.settings.revision, expectedAttempts: selected.polish.attempts
    }) : await api('preview', {method: 'POST', body: {
      instanceId: selected.instanceId, levels, revision: data.settings.revision
    }});
    if (closed) return;
    applyReceipt(result);
    await reveal(result);
  } catch (error) {
    if (closed) return;
    idle();
    $('#live-message').textContent = error.message;
    $('#phase').textContent = intent.pending ? '이전 요청을 보관했습니다. 결과 확인을 다시 눌러주세요.' : '최신 장비 상태를 새로고침해 주세요.';
  } finally {
    if (!closed) setBusy(false);
  }
}

async function load() {
  if (busy) return;
  $('#retry-access').hidden = true;
  $('#start').disabled = true;
  $('#workbench').hidden = true;
  $('#access-gate').hidden = false;
  try {
    data = await api('state');
    if (closed) return;
    intent = createPolishRequest({request: api, storage: localStorage, userId: data.userId});
    let recovered = await intent.recover();
    if (!recovered) {
      let saved;
      try { saved = localStorage.getItem(resultKey()); } catch {}
      if (saved) recovered = (await api('receipt?requestId=' + encodeURIComponent(saved))).receipt;
    }
    if (recovered) data = await api('state');
    items = data.items;
    const focus = recovered?.instanceId || intent.pending?.instanceId || selected?.instanceId || params.get('instanceId');
    if (focus && !items.some(item => item.instanceId === focus)) {
      const extra = await api('state?instanceId=' + encodeURIComponent(focus));
      items.push(...extra.items);
    }
    if (closed) return;
    $('#access-gate').hidden = true;
    $('#workbench').hidden = false;
    $('#polish-cms-link').hidden = !data.ownerReview;
    $('#live-note').textContent = data.canPolish
      ? '용병 장비는 PvE·PvP, 일반 장비는 PvE 전투에 연마 효과가 적용됩니다. 꽝은 성장 횟수를 올리지 않습니다.'
      : data.ownerReview ? '운영자 연출 검수 중입니다. 실제 연마는 닫혀 있습니다.' : data.notice;
    renderPicker(focus);
    choose();
    if (recovered && recovered.revision !== data.settings.revision) {
      try { localStorage.removeItem(resultKey()); } catch {}
      $('#live-message').textContent = '새 연마 설정이 적용됐습니다. 현재 장비의 성장 수치를 확인해 주세요.';
      recovered = null;
    }
    if (recovered && !items.some(item => item.instanceId === recovered.instanceId)) {
      try { localStorage.removeItem(resultKey()); } catch {}
      $('#live-message').textContent = '이전 장비의 연마 결과가 저장되어 있습니다. 현재 보유 장비를 선택해 주세요.';
      recovered = null;
    }
    if (recovered) {
      setBusy(true);
      startReel();
      await reveal(recovered);
      if (!closed) setBusy(false);
    }
  } catch (error) {
    if (closed) return;
    $('#access-message').textContent = error.message;
    $('#retry-access').hidden = false;
  }
}

$('#equipment-select').addEventListener('change', choose);
$('#equipment-image').addEventListener('error', () => { $('#equipment-image').hidden = true; });
$('#start').addEventListener('click', () => void begin());
$('#refresh').addEventListener('click', () => void load());
$('#retry-access').addEventListener('click', () => void load());
$('#equipment-more').addEventListener('click', async () => {
  if (busy || !data.nextCursor) return;
  setBusy(true);
  try {
    const next = await api('state?beforeId=' + encodeURIComponent(data.nextCursor));
    if (closed) return;
    data.nextCursor = next.nextCursor;
    items.push(...next.items.filter(item => !items.some(old => old.instanceId === item.instanceId)));
    renderPicker();
  } catch (error) { if (!closed) $('#live-message').textContent = error.message; }
  finally { if (!closed) setBusy(false); }
});
const resize = new ResizeObserver(() => {
  if (!busy && $('#reel-track').firstElementChild) {
    $('#reel-track').style.transform = 'translateX(' + reelOffset(4) + 'px)';
  }
});
resize.observe($('#reel-window'));
document.addEventListener('visibilitychange', () => {
  if (!animation) return;
  if (document.hidden) animation.pause();
  else animation.play();
});
window.addEventListener('pagehide', () => {
  closed = true;
  controller.abort();
  stopAnimation();
  resize.disconnect();
});
window.addEventListener('pageshow', event => { if (event.persisted) location.reload(); });
window.addEventListener('storage', event => {
  if (event.key === (credential === 'admin' ? 'cnine_admin_token' : 'cnine_card_api_token')) location.reload();
});
await load();
