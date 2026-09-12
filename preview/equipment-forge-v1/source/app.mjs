import { ForgeSimulation, EQUIPMENT, DEFAULT_RATES, validateRates, displayedRates, powerAt, costAt } from './model.mjs';
import { ForgeFX, EFFECT_TIMING } from './fx.mjs';

const $ = id => document.getElementById(id);
const icon = name => `<svg aria-hidden="true"><use href="#i-${name}"/></svg>`;
const number = value => new Intl.NumberFormat('ko-KR').format(value);
const pct = value => `${number(value)}%`;
const escape = value => String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);
const date = value => new Intl.DateTimeFormat('ko-KR', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date(value));
const outcomeNames = { success: '강화 성공', maintain: '유지 · 무반응', destroy: '장비 파괴', protected: '장비 보호', restore: '장비 복구' };
const motionQuery = matchMedia('(prefers-reduced-motion: reduce)');
let model = new ForgeSimulation(), mode = 'enhance', filter = 'all', selectedId = EQUIPMENT[0].id;
let recordId = model.records[0].id, protection = false, busy = false, loading = false;
let fx = null, fxAvailable = false, toastTimer, selectionGeneration = 0, pendingAction = null, activeReceipt = null;
let destroyedPage = false;
const getItem = () => mode === 'enhance' ? model.items.find(item => item.id === selectedId) : model.records.find(record => record.id === recordId)?.item;
const getRecord = () => model.records.find(record => record.id === recordId);
const randomUnit = () => crypto.getRandomValues(new Uint32Array(1))[0] / 4294967296;
const requestId = () => crypto.randomUUID();

function toast(message) {
  clearTimeout(toastTimer); $('toast').textContent = message; $('toast').hidden = false;
  toastTimer = setTimeout(() => { $('toast').hidden = true; }, 3800);
}
function updateButtons() {
  const item = getItem(), blocked = busy || loading;
  $('enhance-button').disabled = blocked || !item || item.status !== 'owned' || item.level >= model.rates.length || mode !== 'enhance';
  const record = getRecord();
  $('restore-button').disabled = blocked || !record || !!record.restoredAt || model.wallet.restoration < 1;
  $('protection-toggle').disabled = blocked || model.wallet.protection < 1;
  for (const id of ['settings-button', 'rates-button', 'showcase-button', 'quick-success', 'tab-enhance', 'tab-restore', 'archive-button']) $(id).disabled = blocked;
  document.querySelectorAll('.equipment-row, .filters button').forEach(button => { button.disabled = blocked || button.dataset.unavailable === 'true'; });
  $('confirm-action').disabled = blocked;
}
function renderInventory() {
  $('inventory-heading').textContent = mode === 'enhance' ? '보유 장비' : '파괴 기록';
  $('inventory-count').textContent = String(mode === 'enhance' ? model.items.filter(item => item.status === 'owned').length : model.records.length).padStart(2, '0');
  $('inventory-filters').hidden = mode === 'restore';
  $('record-count').textContent = model.records.filter(record => !record.restoredAt).length;
  $('inventory-note').innerHTML = mode === 'enhance' ? '강화할 장비를 선택하세요.<br>동일 장비도 개별로 기록됩니다.' : '파괴 직전의 장비 상태를 보관합니다.<br>체험 기록은 새로고침 시 초기화됩니다.';
  const items = mode === 'enhance' ? model.items.filter(item => filter === 'all' || item.kind === filter) : model.records;
  $('inventory-list').innerHTML = items.map(row => {
    const item = mode === 'enhance' ? row : row.item;
    const chosen = mode === 'enhance' ? row.id === selectedId : row.id === recordId;
    const unavailable = mode === 'enhance' && item.status !== 'owned';
    const restored = mode === 'restore' && row.restoredAt;
    const note = mode === 'enhance' ? unavailable ? '파괴 기록 보관 중' : item.kindLabel : restored ? '복구 완료' : `${date(row.destroyedAt)}${row.sample ? ' · 예시' : ''}`;
    return `<button class="equipment-row${unavailable ? ' is-destroyed' : ''}${mode === 'restore' ? ' record-row' : ''}${restored ? ' is-restored' : ''}" data-id="${escape(row.id)}" data-grade="${item.grade}" data-unavailable="${unavailable}" aria-pressed="${chosen}" aria-label="${escape(item.name)} +${item.level}, ${escape(note)}" ${unavailable ? 'disabled' : ''}><span class="equipment-thumb"><img src="${escape(item.image)}" alt="" loading="lazy"></span><span class="equipment-copy"><small>${item.grade}</small><b>${escape(item.name)}</b><em>${escape(note)}</em></span><span class="equipment-level">+${item.level}</span></button>`;
  }).join('') || '<p class="empty-inventory">표시할 기록이 없습니다.<br>파괴된 장비는 이곳에 기록됩니다.</p>';
}
function renderRates() {
  const item = getItem(); if (!item) return;
  const max = item.level >= model.rates.length;
  const rates = model.rates[Math.min(item.level, model.rates.length - 1)];
  const protectedAttempt = protection && model.wallet.protection > 0;
  $('success-rate').innerHTML = `${number(rates.success)}<span>%</span>`;
  $('chance-ring').style.strokeDashoffset = String(270.18 * (1 - rates.success / 100));
  $('rate-level').textContent = max ? '시연 최대 단계' : `+${item.level} → +${item.level + 1}`;
  for (const key of ['success', 'maintain', 'destroy']) {
    $('rate-' + key + '-value').textContent = pct(rates[key]);
    $('bar-' + key).style.width = rates[key] + '%'; $('bar-' + key).hidden = rates[key] === 0;
  }
  const effective = displayedRates(rates, protectedAttempt);
  $('effective-rates').hidden = !protectedAttempt;
  $('effective-rates').textContent = `보호 후 결과: 성공 ${pct(effective.success)} · 유지 ${pct(effective.maintain)} · 파괴 0%`;
  $('power-before').textContent = number(powerAt(item));
  $('power-after').textContent = max ? 'MAX' : number(powerAt(item, item.level + 1));
  $('protection-count').textContent = model.wallet.protection;
  $('protection-toggle').checked = protectedAttempt;
  $('stage-protection').hidden = !protectedAttempt || busy || mode !== 'enhance';
  const cost = costAt(item.level);
  $('material-list').innerHTML = [{ label: '강화 결정', icon: 'gem', need: cost.crystals, have: model.wallet.crystals }, { label: '코인', icon: 'coin', need: cost.coins, have: model.wallet.coins }].map(row => `<div class="material-row${row.need > row.have ? ' is-insufficient' : ''}">${icon(row.icon)}<span>${row.label}</span><div><b>${number(row.need)}</b><small>/ ${number(row.have)}</small></div></div>`).join('');
  $('risk-note').classList.toggle('safe', protectedAttempt || rates.destroy === 0);
  $('risk-note').innerHTML = icon(protectedAttempt ? 'shield' : 'info') + `<p>${max ? '시연 최대 단계에 도달했습니다.' : protectedAttempt ? '파괴 판정이 나오면 보호권을 사용하고,<br>장비와 현재 강화 단계를 보존합니다.' : rates.destroy === 0 ? '이 단계는 파괴 확률이 0%입니다.<br>성공 또는 유지로 판정됩니다.' : '파괴 시 장비가 사라지며,<br>복구를 위한 파괴 기록이 남습니다.'}</p>`;
  $('enhance-button').querySelector('span').textContent = item.status === 'destroyed' ? '파괴 기록에서 복구 가능' : max ? '시연 최대 단계 달성' : '강화 시도';
}
function renderRestoration() {
  const record = getRecord(); $('restoration-count').textContent = model.wallet.restoration;
  if (!record) { $('restore-snapshot').textContent = '복구할 파괴 기록이 없습니다.'; return; }
  $('restore-snapshot').innerHTML = `<div class="snapshot-row"><span>파괴된 장비</span><b>${escape(record.item.name)}</b></div><div class="snapshot-row"><span>복구 단계</span><b class="restored-value">+${record.item.level} 그대로 복구</b></div><div class="snapshot-row"><span>파괴 기록</span><b>${date(record.destroyedAt)}</b></div><div class="snapshot-row"><span>상태</span><b class="restored-value">${record.restoredAt ? '복구 완료 · 재사용 불가' : '체험 복구 가능'}</b></div>`;
  $('restore-button').querySelector('span').textContent = record.restoredAt ? '이미 복구한 장비입니다' : model.wallet.restoration < 1 ? '복구 쿠폰이 없습니다' : '이 장비 복구하기';
}
function renderHistory() {
  $('history-list').innerHTML = model.history.slice(0, 6).map(row => `<div class="history-entry"><span class="${row.visual}"></span><div><b>${escape(row.before.name)} +${row.before.level}${row.outcome === 'success' ? ` → +${row.after.level}` : ''}</b><p>${outcomeNames[row.visual]}</p></div><small>${date(row.at)}</small></div>`).join('') || '<p class="empty-history">아직 강화 기록이 없습니다. 첫 번째 강화를 시작해 보세요.</p>';
}
function render() {
  $('wallet-coins').textContent = number(model.wallet.coins);
  $('enhance-options').hidden = mode !== 'enhance'; $('restore-options').hidden = mode !== 'restore';
  renderInventory(); if (mode === 'enhance') renderRates(); else renderRestoration();
  renderHistory(); updateButtons();
}
function clearOutcome() {
  activeReceipt = null; $('stage-outcome').hidden = true;
  const stage = document.querySelector('.forge-stage');
  stage.removeAttribute('data-result'); stage.removeAttribute('data-playing');
  stage.style.setProperty('--scene-dark', '0'); stage.style.setProperty('--result-progress', '1');
  $('cinematic-hud').hidden = true;
  $('stage-item-heading').style.opacity = '1'; $('level-transition').hidden = false;
  $('stage-status').textContent = fxAvailable ? '준비 완료' : '간소화 연출';
  $('stage-rule').textContent = mode === 'enhance' ? '강화 단계는 성공 시에만 상승합니다.' : '파괴 이전의 상태가 기록에 남아 있습니다.';
  document.querySelectorAll('#phase-rail i').forEach(node => node.classList.remove('active'));
  fx?.reset();
}
async function selectCurrent() {
  const generation = ++selectionGeneration; loading = true;
  clearOutcome(); const item = getItem(); render();
  if (!item) { loading = false; updateButtons(); return; }
  $('stage-code').textContent = mode === 'enhance' ? 'UPGRADE SYSTEM / 01' : 'RECOVERY SYSTEM / 02';
  $('stage-grade').textContent = item.grade + ' EQUIPMENT';
  $('stage-item-name').textContent = item.name; $('stage-item-sub').textContent = item.collection + ' · ' + item.kindLabel;
  $('level-before').textContent = mode === 'enhance' ? '+' + item.level : '파괴';
  $('level-after').textContent = '+' + (mode === 'enhance' ? Math.min(item.level + 1, model.rates.length) : item.level);
  document.querySelector('#level-transition .next small').textContent = mode === 'enhance' ? 'NEXT LEVEL' : 'RESTORED';
  $('weapon-fallback').src = item.image; $('weapon-fallback').style.opacity = '1';
  if (fxAvailable) {
    try { await fx.setItem(item); $('weapon-fallback').hidden = true; }
    catch { $('weapon-fallback').hidden = false; $('stage-status').textContent = '장비 이미지 대체 표시'; }
  }
  if (generation === selectionGeneration) { loading = false; updateButtons(); }
}
async function changeMode(next) {
  if (busy || loading || next === mode) return;
  mode = next;
  if (mode === 'enhance' && !model.items.some(item => item.id === selectedId && item.status === 'owned')) selectedId = model.items.find(item => item.status === 'owned')?.id || selectedId;
  if (mode === 'restore' && !model.records.some(record => record.id === recordId)) recordId = model.records[0]?.id;
  for (const tab of document.querySelectorAll('[data-mode]')) { const active = tab.dataset.mode === mode; tab.setAttribute('aria-selected', active); tab.tabIndex = active ? 0 : -1; }
  $('workspace').setAttribute('aria-labelledby', 'tab-' + mode);
  await selectCurrent();
}
function showDialog(id) {
  if (busy || loading) return;
  if (id === 'settings-dialog') renderSettings();
  $(id).showModal();
}
function renderSettings() {
  $('rates-error').textContent = '';
  $('rates-tbody').innerHTML = model.rates.map((row, index) => `<tr><td>+${index} → +${index + 1}</td>${['success', 'maintain', 'destroy'].map(key => `<td><input name="${index}-${key}" aria-label="+${index + 1} ${key === 'success' ? '성공' : key === 'maintain' ? '유지' : '파괴'} 확률" type="number" min="${key === 'success' ? 10 : 0}" max="100" step="0.01" required value="${row[key]}"></td>`).join('')}</tr>`).join('');
}
function confirmEnhance() {
  if (busy || loading) return;
  const item = getItem(); if (!item || mode !== 'enhance') return;
  const rates = model.rates[item.level]; if (!rates || item.status !== 'owned') return;
  pendingAction = { kind: 'enhance', itemId: item.id, protection, requestId: requestId() };
  $('confirm-title').textContent = '강화를 진행할까요?';
  $('confirm-action').textContent = '강화 진행';
  const cost = costAt(item.level), effective = displayedRates(rates, protection);
  $('confirm-content').innerHTML = `<img class="confirm-weapon" src="${escape(item.image)}" alt=""><h3 class="confirm-item">${escape(item.name)}</h3><p class="confirm-level">+${item.level} → +${item.level + 1}</p><p class="confirm-copy">성공 ${pct(effective.success)} · 유지 ${pct(effective.maintain)} · <em>파괴 ${pct(effective.destroy)}</em><br>${protection ? '장비보호권 사용. 파괴 판정을 막았을 때만 1장 소모합니다.' : rates.destroy > 0 ? '파괴되면 장비가 소실됩니다. 복구에는 별도 쿠폰이 필요합니다.' : '이 단계에서는 장비가 파괴되지 않습니다.'}</p><p class="confirm-cost">시연 재료: 강화 결정 ${number(cost.crystals)}개 · ${number(cost.coins)} 코인<br>성공·유지·파괴 모두 강화 재료가 소모됩니다.</p>`;
  showDialog('confirm-dialog');
}
function confirmRestore() {
  if (busy || loading) return;
  const record = getRecord(); if (!record || record.restoredAt || model.wallet.restoration < 1) return;
  pendingAction = { kind: 'restore', recordId: record.id, requestId: requestId() };
  $('confirm-title').textContent = '이 장비를 복구할까요?'; $('confirm-action').textContent = '쿠폰 1장으로 복구';
  $('confirm-content').innerHTML = `<img class="confirm-weapon" src="${escape(record.item.image)}" alt=""><h3 class="confirm-item">${escape(record.item.name)}</h3><p class="confirm-level">+${record.item.level} RESTORED</p><p class="confirm-copy">파괴 직전 장비와 강화 단계가 그대로 돌아옵니다.<br>이 파괴 기록은 <em>한 번만 복구</em>할 수 있습니다.</p><p class="confirm-cost">장비 복구 쿠폰 1장 소모 · 강화에 사용한 재료는 반환되지 않습니다.<br>이 복구 조건은 체험용이며 운영 정책은 미정입니다.</p>`;
  showDialog('confirm-dialog');
}
function showOutcome(receipt, visualOnly = false) {
  const kind = receipt.visual;
  const copy = {
    success: ['UPGRADE COMPLETE', '강화 성공', `${receipt.before.name} · +${receipt.before.level} → +${receipt.after.level}`],
    maintain: ['LEVEL MAINTAINED', '유지 · 무반응', `장비는 +${receipt.before.level} 그대로 유지됩니다.`],
    destroy: ['EQUIPMENT SHATTERED', '장비 파괴', `${receipt.before.name} +${receipt.before.level}의 파괴 기록이 남았습니다.`],
    protected: ['PROTECTION ACTIVATED', '파괴 방지 성공', `파괴를 방지했습니다. 장비는 +${receipt.before.level} 유지됩니다.`],
    restore: ['RECOVERY COMPLETE', '장비 복구 완료', `${receipt.after.name} · +${receipt.after.level} 복구 완료`],
  }[kind];
  $('level-transition').hidden = true; $('stage-protection').hidden = true;
  $('outcome-eyebrow').textContent = copy[0];
  $('outcome-level').textContent = '+' + receipt.after.level;
  $('outcome-title').textContent = copy[1]; $('outcome-description').textContent = visualOnly && kind === 'destroy' ? '장비 파괴 연출 시연입니다. 실제 기록은 변경되지 않습니다.' : copy[2];
  $('stage-outcome').hidden = false;
  $('outcome-continue').innerHTML = (!visualOnly && kind === 'destroy' ? '복구소에서 기록 보기' : '계속하기') + icon('arrow');
  document.querySelector('.forge-stage').dataset.result = kind;
  $('stage-item-heading').style.opacity = '.8';
}
async function animate(receipt, visualOnly = false) {
  busy = true; activeReceipt = { ...receipt, visualOnly }; updateButtons();
  const stage = document.querySelector('.forge-stage'), bounds = stage.getBoundingClientRect();
  stage.dataset.playing = receipt.visual; stage.style.setProperty('--result-progress', '0');
  if (bounds.top < 0 || bounds.bottom > innerHeight) stage.scrollIntoView({ behavior: 'instant', block: innerWidth <= 700 ? 'start' : 'center' });
  $('stage-outcome').hidden = true; $('level-transition').hidden = false; $('stage-protection').hidden = true;
  $('playback').hidden = false; $('pause-button').textContent = '일시정지';
  $('stage-rule').textContent = ''; $('stage-status').textContent = receipt.visual === 'restore' ? '복구 진행 중' : '강화 진행 중';
  $('outcome-continue').disabled = true;
  // The simulation already committed one receipt. Animation never rolls or mutates outcomes.
  let result = { cancelled: false };
  if (fxAvailable) result = await fx.play(receipt.visual);
  else { $('weapon-fallback').style.opacity = receipt.visual === 'destroy' ? '.1' : '1'; }
  if (destroyedPage || result.cancelled) return;
  busy = false; $('playback').hidden = true;
  stage.style.setProperty('--result-progress', '1'); stage.style.setProperty('--scene-dark', '0'); $('cinematic-hud').hidden = true;
  $('stage-status').textContent = visualOnly ? '연출 시연 완료' : '결과 확인';
  $('stage-rule').textContent = visualOnly ? '연출만 재생했습니다. 장비·재료·기록은 그대로입니다.' : receipt.visual === 'protected' ? '보호권 1장 소모 · 장비와 강화 단계 유지' : receipt.visual === 'restore' ? '복구 쿠폰 1장 소모 · 파괴 기록 사용 완료' : '결과가 이번 체험 기록에 저장되었습니다.';
  showOutcome(receipt, visualOnly); $('outcome-continue').disabled = false;
  render(); $('stage-protection').hidden = true;
  $('outcome-continue').focus({ preventScroll: true });
}
async function runPending() {
  if (busy || loading || !pendingAction) return;
  const action = pendingAction; pendingAction = null;
  $('confirm-dialog').close();
  try {
    const receipt = action.kind === 'restore' ? model.restore(action) : model.enhance({ ...action, roll: randomUnit() });
    if (!model.wallet.protection) protection = false;
    await animate(receipt);
  } catch (error) { busy = false; toast(error.message); render(); }
}
async function showcase(kind) {
  if (busy || loading) return;
  const item = structuredClone(getItem() || EQUIPMENT[0]);
  $('showcase-dialog').close(); clearOutcome();
  const after = { ...item, level: kind === 'success' ? Math.min(item.level + 1, DEFAULT_RATES.length) : item.level, status: kind === 'destroy' ? 'destroyed' : 'owned' };
  await animate({ kind: 'showcase', before: item, after, visual: kind }, true);
}

$('inventory-list').addEventListener('click', async event => {
  const button = event.target.closest('[data-id]'); if (!button || button.disabled || busy || loading) return;
  if (mode === 'enhance') selectedId = button.dataset.id; else recordId = button.dataset.id;
  await selectCurrent();
});
document.querySelectorAll('[data-mode]').forEach(button => button.addEventListener('click', () => changeMode(button.dataset.mode)));
document.querySelector('.workspace-tabs').addEventListener('keydown', event => {
  if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key) || busy || loading) return;
  event.preventDefault(); const next = event.key === 'Home' ? 'enhance' : event.key === 'End' ? 'restore' : mode === 'enhance' ? 'restore' : 'enhance';
  changeMode(next); $('tab-' + next).focus();
});
document.querySelectorAll('[data-filter]').forEach(button => button.addEventListener('click', () => {
  if (busy || loading) return; filter = button.dataset.filter;
  document.querySelectorAll('[data-filter]').forEach(node => node.setAttribute('aria-pressed', node.dataset.filter === filter));
  renderInventory(); updateButtons();
}));
$('archive-button').addEventListener('click', async () => { await changeMode('restore'); $('tab-restore').focus({ preventScroll: true }); $('workspace').scrollIntoView({ behavior: motionQuery.matches ? 'instant' : 'smooth', block: 'start' }); });
$('protection-toggle').addEventListener('change', event => { if (busy || loading) return; protection = event.target.checked; renderRates(); });
$('enhance-button').addEventListener('click', confirmEnhance);
$('restore-button').addEventListener('click', confirmRestore);
$('confirm-action').addEventListener('click', runPending);
$('outcome-continue').addEventListener('click', async () => {
  if (busy || loading) return;
  const receipt = activeReceipt;
  if (receipt?.visual === 'destroy' && !receipt.visualOnly) { recordId = receipt.recordId; await changeMode('restore'); }
  else if (receipt?.visual === 'restore' && !receipt.visualOnly) { selectedId = receipt.after.id; await changeMode('enhance'); }
  else await selectCurrent();
});
$('settings-button').addEventListener('click', () => showDialog('settings-dialog'));
$('rates-button').addEventListener('click', () => showDialog('settings-dialog'));
$('rules-button').addEventListener('click', () => showDialog('rules-dialog'));
$('showcase-button').addEventListener('click', () => showDialog('showcase-dialog'));
$('quick-success').addEventListener('click', () => showcase('success'));
document.querySelectorAll('[data-close]').forEach(button => button.addEventListener('click', () => button.closest('dialog').close()));
document.querySelectorAll('dialog').forEach(dialog => {
  dialog.addEventListener('click', event => { if (event.target === dialog) { const r = dialog.getBoundingClientRect(); if (event.clientX < r.left || event.clientX > r.right || event.clientY < r.top || event.clientY > r.bottom) dialog.close(); } });
  dialog.addEventListener('close', () => { if (dialog.id === 'confirm-dialog') pendingAction = null; });
});
document.querySelectorAll('[data-showcase]').forEach(button => button.addEventListener('click', () => showcase(button.dataset.showcase)));
$('rates-form').addEventListener('submit', event => {
  event.preventDefault();
  try {
    const values = new FormData(event.target);
    const rows = DEFAULT_RATES.map((_, index) => {
      try { return validateRates(Object.fromEntries(['success', 'maintain', 'destroy'].map(key => [key, Number(values.get(`${index}-${key}`))]))); }
      catch (error) { throw new Error(`+${index + 1} 단계: ${error.message}`); }
    });
    model.setRates(rows); $('settings-dialog').close(); render(); toast('시연 확률을 적용했습니다.');
  } catch (error) { $('rates-error').textContent = error.message; }
});
$('motion-toggle').checked = motionQuery.matches;
$('motion-toggle').addEventListener('change', event => { if (fx) { fx.reduced = event.target.checked; if (busy && fx.reduced) fx.skip(); } });
motionQuery.addEventListener('change', event => { $('motion-toggle').checked = event.matches; if (fx) { fx.reduced = event.matches; if (busy && event.matches) fx.skip(); } });
$('speed-select').addEventListener('change', event => fx?.setSpeed(Number(event.target.value)));
$('pause-button').addEventListener('click', () => { if (!fx?.running) return; fx.pause(!fx.paused); $('pause-button').textContent = fx.paused ? '계속 재생' : '일시정지'; });
$('skip-button').addEventListener('click', () => fx?.skip());
$('sound-button').addEventListener('click', async () => {
  if (!fxAvailable) { toast('이 브라우저에서는 간소화 연출로 재생됩니다.'); return; }
  const enabled = await fx.sound.enable(!fx.sound.enabled);
  $('sound-button').setAttribute('aria-pressed', enabled); $('sound-button').setAttribute('aria-label', enabled ? '효과음 끄기' : '효과음 켜기');
  $('sound-button').title = enabled ? '효과음 끄기' : '효과음 켜기';
  if (enabled && fx.running && !fx.paused) fx.scheduleAudio();
  toast(enabled ? '효과음이 켜졌습니다.' : '효과음이 꺼졌습니다.');
});
$('reset-button').addEventListener('click', async () => {
  if (busy || loading) return;
  model = new ForgeSimulation(); selectedId = EQUIPMENT[0].id; recordId = model.records[0].id; protection = false;
  $('settings-dialog').close(); await selectCurrent(); toast('체험 장비·재료·기록을 초기화했습니다.');
});
document.addEventListener('visibilitychange', () => { fx?.suspend(document.hidden); if (busy && document.hidden) $('pause-button').textContent = '계속 재생'; });
window.addEventListener('pagehide', () => { destroyedPage = true; clearTimeout(toastTimer); fx?.destroy(); });
window.addEventListener('pageshow', event => { if (event.persisted) location.reload(); });

// Compact read-only diagnostics for browser review; no control or real-account hooks.
globalThis.ForgePreview = Object.freeze({
  inspect: () => ({ previewOnly: true, version: 2, mode, selectedId, recordId, busy, loading, fxAvailable, wallet: { ...model.wallet }, rates: structuredClone(model.rates), items: structuredClone(model.items), records: structuredClone(model.records), history: structuredClone(model.history), fx: fx ? { time: fx.clock.time, kind: fx.kind, paused: fx.paused, running: fx.running, fragments: fx.fragments.length, successAtlasReady: !!fx.success?.ready, successFrame: fx.success?.frame, syncErrorMs: fx.sound.syncErrorMs } : null }),
});

render();
try {
  fx = new ForgeFX($('fx-host'), { onTime(time, kind) {
    const phase = time < 1 ? 0 : time < EFFECT_TIMING.impact ? 1 : time < EFFECT_TIMING.reveal ? 2 : 3;
    document.querySelectorAll('#phase-rail i').forEach((node, index) => node.classList.toggle('active', index <= phase));
    const stage = document.querySelector('.forge-stage');
    const pressure = Math.max(0, Math.min(1, (time - 1.2) / 1.05));
    stage.style.setProperty('--scene-dark', String(kind === 'success' ? pressure * .5 * (1 - Math.max(0, Math.min(1, (time - EFFECT_TIMING.impact) / .28))) : 0));
    const progress = Math.max(0, Math.min(1, (time - EFFECT_TIMING.reveal) / .3));
    stage.style.setProperty('--result-progress', String(1 - (1 - progress) ** 3));
    $('cinematic-hud').hidden = kind !== 'success' || time >= EFFECT_TIMING.impact + .1 || fx?.reduced;
    $('cinematic-label').textContent = time < 1.4 ? 'ENERGY CHARGING' : 'CORE OVERDRIVE';
    $('cinematic-count').textContent = String(Math.round(Math.min(100, time / EFFECT_TIMING.impact * 100))).padStart(2, '0');
    $('cinematic-progress').style.transform = `scaleX(${Math.min(1, time / EFFECT_TIMING.impact)})`;
    if (time >= EFFECT_TIMING.reveal && activeReceipt && $('stage-outcome').hidden) showOutcome(activeReceipt, activeReceipt.visualOnly);
  } });
  await fx.init(); fx.reduced = motionQuery.matches; fxAvailable = true;
} catch (error) {
  console.warn('Forge renderer uses the static fallback:', error.message);
  try { fx?.destroy(); } catch { /* An incomplete WebGL initialization can lack a renderer. */ }
  fx = null;
  $('weapon-fallback').hidden = false; $('stage-status').textContent = '간소화 연출';
}
$('stage-loading').hidden = true;
await selectCurrent();
