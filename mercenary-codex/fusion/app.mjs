import { escapeHtml as esc, asset, thumb, FRAME } from '../model.mjs?v=2098&art=20260915';
import { MATERIAL_COUNT, RANKS, TIMING, nextRank, materialRows, addMaterial, autoMaterials, demoMaterials, demoResult, phaseAt } from './model.mjs?v=20260922';
import { FusionFX } from './fx.mjs?v=20260922';

let vendorPromise;
function loadVendor() {
  if (globalThis.CNineUiFxVendor) return Promise.resolve();
  return vendorPromise ||= new Promise((resolve, reject) => {
    const script = document.createElement('script'); script.src = '/js/ui-fx-vendor-v2045.bundle.js?v=2045';
    script.onload = () => resolve(); script.onerror = () => { vendorPromise = null; script.remove(); reject(Error('연출 엔진을 불러오지 못했습니다. 다시 열어 주세요.')); };
    document.head.append(script);
  });
}
function loadStyles() {
  if (document.getElementById('mercenaryFusionStyles')) return;
  const link = document.createElement('link'); link.id = 'mercenaryFusionStyles'; link.rel = 'stylesheet';
  link.href = '/mercenary-codex/fusion/style.css?v=20260922'; document.head.append(link);
}

const html = `<header class="fusion-head"><div class="fusion-head-main"><div class="fusion-monogram" aria-hidden="true">VIII</div><div><p class="fusion-kicker">THE SANCTUM OF COVENANTS</p><h2 id="fusionTitle">용병 중복 합성</h2><p class="fusion-head-note">여덟 개의 기억, 하나의 새로운 계약.</p></div></div><div class="fusion-head-actions"><span class="fusion-status-tag"><i></i>합성 준비</span><button type="button" data-action="sound" aria-pressed="false">소리 켜기</button><button type="button" data-action="close" class="fusion-close" aria-label="중복 합성 닫기">×</button></div></header>
<div class="fusion-body"><div class="fusion-main"><section class="fusion-stage" aria-label="용병 합성 연출"><div class="fusion-renderer"></div><div class="fusion-stage-top"><span>계약의 성소</span><small>VIII MEMORIES · ONE COVENANT</small></div><div class="fusion-stage-message"><p data-stage-title>봉인 너머, 새로운 운명이 기다립니다</p><small data-stage-subtitle>중복 카드 8장으로 완성하는 하나의 계약</small></div><div class="fusion-stage-vignette"></div><div class="fusion-result"><div class="fusion-result-rank"></div><h3></h3><p></p><small>연출 시연 결과 · 실제 지급 없음</small></div><div class="fusion-loading" role="status">성소를 불러오고 있습니다…</div><div class="fusion-playback" hidden><button type="button" data-action="pause" aria-label="연출 일시정지">일시정지</button><button type="button" data-action="replay" aria-label="연출 처음부터 다시 재생">처음부터</button><input class="fusion-scrub" type="range" min="0" max="8.4" step="0.05" value="0" aria-label="합성 연출 시간 탐색"></div></section>
<section class="fusion-tray" aria-label="합성 재료 8개 슬롯"><div class="fusion-tray-head"><div><b>합성 재료</b><em><span data-selected-count>0</span><small> / 8</small></em></div><button type="button" data-action="clear">선택 해제 ↺</button></div><div class="fusion-slots"></div><p class="fusion-tray-note">기본 보유 1장은 보존하며, 중복 카드만 재료로 선택합니다.</p></section></div>
<aside class="fusion-pool" aria-label="합성 재료 선택"><header class="fusion-pool-heading"><h3>계약의 재료</h3><span>DUPLICATE COLLECTION</span></header><div class="fusion-mode-tabs" role="group" aria-label="합성 재료 목록"><button type="button" data-action="owned" aria-pressed="true">내 중복 카드</button><button type="button" data-action="demo" aria-pressed="false">연출 시연</button></div><div class="fusion-filter"><label><span class="sr-only">재료 등급</span><select data-material-rank aria-label="재료 등급"></select></label><button type="button" data-action="auto">8장 자동 선택</button></div><p class="fusion-pool-note"></p><div class="fusion-materials"></div><div class="fusion-policy"><p><b>합성 1회 · 중복 카드 8장</b></p><p>승급 10% · 추가 비용 없음</p><small>성공: 한 단계 상위 등급 랜덤 1장<br>실패: 재료와 같은 등급 랜덤 1장</small></div></aside></div>
<p class="fusion-error" role="status" aria-live="polite" hidden></p><footer class="fusion-controls"><div class="fusion-controls-note"><b>연출 시연 · 카드 소모 없음</b><p>확정 규칙: 중복 8장 · 승급 10% · 비용 없음</p></div><button type="button" class="fusion-unavailable" disabled>실제 합성 준비 중</button><button type="button" data-action="play" class="fusion-play" disabled>8장 합성 연출 보기</button></footer>`;

export async function openFusion({ catalog, account, onClose } = {}) {
  if (document.querySelector('.fusion-dialog')) return;
  loadStyles();
  const opener = document.activeElement, previousOverflow = document.body.style.overflow;
  const dialog = document.createElement('dialog'); dialog.className = 'fusion-dialog';
  dialog.setAttribute('aria-labelledby', 'fusionTitle'); dialog.innerHTML = html; document.body.append(dialog);
  const $ = selector => dialog.querySelector(selector), controller = new AbortController(), signal = controller.signal;
  let mode = 'owned', selection = [], sampleCards = [], loaded = false, busy = false, closed = false, played = false, refreshId = 0, outcome = 'success';
  const rows = materialRows(catalog, account);
  let rank = rows.find(c => c.rank === 'SS')?.rank || rows[0]?.rank || 'SS';
  let resultRank = nextRank(rank);
  const stage = $('.fusion-stage'), result = $('.fusion-result'), loading = $('.fusion-loading');
  const error = message => { const el = $('.fusion-error'); el.textContent = message || ''; el.hidden = !message; };
  const chosenCards = () => mode === 'demo' ? sampleCards : selection.map(code => rows.find(c => c.code === code)).filter(Boolean);
  const currentResult = () => demoResult(catalog, outcome === 'success' ? resultRank : rank);
  const fx = new FusionFX($('.fusion-renderer'), {
    progress(time) {
      const title = outcome === 'failure' && time >= TIMING.impact ? time < TIMING.reveal ? '봉인의 힘이 잦아듭니다' : '계약이 다시 맺어집니다' : phaseAt(time);
      if ($('[data-stage-title]').textContent !== title) $('[data-stage-title]').textContent = title;
      result.classList.toggle('is-visible', time >= TIMING.reveal + .65); result.setAttribute('aria-hidden', String(time < TIMING.reveal + .65));
      stage.classList.toggle('has-result',time >= TIMING.reveal + .65);
      $('.fusion-scrub').value = String(time);
      const pause = $('[data-action="pause"]'); pause.textContent = fx.paused ? '계속' : '일시정지';
      pause.setAttribute('aria-label', fx.paused ? '연출 계속 재생' : '연출 일시정지'); pause.disabled = time >= TIMING.end;
    },
    complete() { if (closed) return; busy = false; stage.classList.remove('is-playing'); stage.classList.add('has-result'); dialog.classList.remove('is-cinematic'); updateControls(); result.classList.add('is-visible'); result.setAttribute('aria-hidden','false'); },
  });
  function updateControls() {
    $('[data-action="play"]').disabled = !loaded || busy || chosenCards().length !== MATERIAL_COUNT || !currentResult();
    $('[data-action="play"]').textContent = busy ? '계약이 깨어나는 중…' : played ? '합성 연출 다시 보기' : '8장 합성 연출 보기';
    for (const button of dialog.querySelectorAll('[data-action="owned"],[data-action="demo"],[data-action="auto"],[data-action="clear"],[data-material],[data-slot]')) button.disabled = busy;
    $('[data-material-rank]').disabled = busy;
    const rr = $('[data-result-rank]'); if (rr) rr.disabled = busy;
    const ro = $('[data-outcome]'); if (ro) ro.disabled = busy;
  }
  function renderTray() {
    const cards = chosenCards(); $('[data-selected-count]').textContent = String(cards.length);
    $('.fusion-slots').innerHTML = Array.from({ length: MATERIAL_COUNT }, (_, i) => {
      const c = cards[i]; return `<button type="button" class="fusion-slot ${c ? 'is-filled' : ''}" data-slot="${i}" aria-label="${i + 1}번 합성 재료${c ? ' ' + esc(c.name) + ' 제거' : ' 비어 있음'}">${c ? `<img class="slot-art" src="${thumb(c.code)}" alt=""><img class="slot-frame" src="${FRAME}" alt=""><span class="slot-number">${String(i + 1).padStart(2, '0')}</span><span class="slot-name">${esc(c.name)}</span>` : `<span class="empty">${['I','II','III','IV','V','VI','VII','VIII'][i]}</span>`}</button>`;
    }).join('');
    $('.fusion-tray-note').textContent = mode === 'demo' ? '시연용 카드 8장 · 보유 수량과 무관하며 실제 소모되지 않습니다.' : '기본 보유 1장은 보존하며, 중복 카드만 재료로 선택합니다.';
    updateControls();
  }
  function renderPool() {
    $('[data-action="owned"]').setAttribute('aria-pressed', String(mode === 'owned'));
    $('[data-action="demo"]').setAttribute('aria-pressed', String(mode === 'demo'));
    const options = mode === 'demo' ? RANKS.filter(r => nextRank(r) && catalog?.cards.some(c => c.rank === r && !c.artOnly)) : RANKS.filter(nextRank);
    $('[data-material-rank]').innerHTML = options.map(r => `<option value="${r}"${rank === r ? ' selected' : ''}>${r} 등급${mode === 'owned' ? ' · 중복 ' + rows.filter(c => c.rank === r).reduce((n, c) => n + c.duplicates, 0) + '장' : ' 시연 재료'}</option>`).join('');
    if (!options.includes(rank)) rank = options[0] || 'SS';
    $('[data-material-rank]').value = rank;
    const pool = mode === 'owned' ? rows.filter(c => c.rank === rank) : (catalog?.cards || []).filter(c => c.rank === rank && !c.artOnly);
    $('.fusion-pool-note').textContent = mode === 'demo' ? '같은 등급 8장 → 한 단계 상위 등급. 승급 성공 연출을 시연하며, 실제 추첨·지급 없이 선택한 결과만 재생합니다.' : account ? '같은 등급이면 서로 다른 용병도 섞을 수 있습니다. 기본 보유 1장은 보존하며, 성공하면 한 단계 상위 등급을 획득합니다.' : '로그인 후 내 중복 카드를 확인할 수 있습니다. 연출 시연은 바로 이용할 수 있습니다.';
    $('.fusion-materials').innerHTML = pool.length ? pool.map(c => {
      const count = mode === 'demo' ? sampleCards.filter(x => x.code === c.code).length : selection.filter(x => x === c.code).length;
      return `<button type="button" class="fusion-material ${count ? 'is-selected' : ''}" data-material="${c.code}" aria-label="${esc(c.name)} ${mode === 'demo' ? '시연 카드 추가' : '중복 ' + c.duplicates + '장 중 선택 ' + count + '장, 재료 추가'}"><span class="fusion-material-art"><img src="${thumb(c.code)}" alt="" loading="lazy"><img src="${FRAME}" alt=""><span class="fusion-material-rank">${c.rank}</span><span class="fusion-material-count">${mode === 'demo' ? count ? '선택 ' + count : '시연' : count + ' / ' + c.duplicates}</span></span><span class="fusion-material-name">${esc(c.name)}</span>${mode === 'demo' ? '<span class="fusion-demo-marker">DEMO CARD</span>' : ''}</button>`;
    }).join('') : `<p class="fusion-empty">${account ? '이 등급에 합성할 중복 카드가 없습니다.' : '보유 중복 카드를 불러오지 못했습니다.'}<br>연출 시연에서 8장 합성을 미리 보세요.</p>`;
    const existing = $('.fusion-result-choice'); existing?.remove(); $('.fusion-outcome-choice')?.remove();
    const choice = document.createElement('label'); choice.className = 'fusion-filter fusion-result-choice'; choice.style.marginTop = '12px';
    choice.innerHTML = `<span style="font-size:10px;color:#ac9774;white-space:nowrap">승급 도전 등급</span><select data-result-rank aria-label="승급 도전 등급">${['S','SS','SSS'].filter(r => demoResult(catalog, r)).map(r => `<option value="${r}"${r === resultRank ? ' selected' : ''}>${r} · ${r === 'SSS' ? '천공 강림' : r === 'SS' ? '성소 개방' : '금빛 각성'}</option>`).join('')}</select>`;
    if (mode === 'demo') $('.fusion-policy').before(choice);
    const outcomes = document.createElement('label'); outcomes.className = 'fusion-filter fusion-outcome-choice'; outcomes.style.marginTop = '10px';
    outcomes.innerHTML = `<span style="font-size:10px;color:#ac9774;white-space:nowrap">결과 연출</span><select data-outcome aria-label="시연 결과 종류"><option value="success"${outcome === 'success' ? ' selected' : ''}>승급 성공 · 10%</option><option value="failure"${outcome === 'failure' ? ' selected' : ''}>동일 등급 · 90%</option></select>`;
    $('.fusion-policy').before(outcomes);
    updateControls();
  }
  async function syncScene() {
    if (!fx.ready || closed) return;
    const generation = ++refreshId; loaded = false; busy = false; played = false; fx.reset();
    dialog.classList.remove('is-cinematic'); stage.classList.remove('is-playing','has-result'); result.classList.remove('is-visible'); result.setAttribute('aria-hidden','true');
    $('.fusion-playback').hidden = true; error(''); updateControls();
    $('[data-stage-title]').textContent = '봉인 너머, 새로운 운명이 기다립니다';
    $('[data-stage-subtitle]').textContent = '중복 카드 8장으로 완성하는 하나의 계약';
    try {
      const card = currentResult();
      await fx.setCards(chosenCards(), card, {promoted:outcome === 'success'});
      if (closed || generation !== refreshId) return;
      $('.fusion-result-rank').textContent = (card?.rank || '') + (outcome === 'failure' ? ' · 동일 등급' : '');
      result.classList.toggle('is-same-rank',outcome === 'failure');
      $('.fusion-result h3').textContent = card?.name || '';
      $('.fusion-result p').textContent = card?.title || '';
      loaded = true; loading.hidden = true; updateControls();
    } catch { if (closed || generation !== refreshId) return; loading.hidden = true; error('카드 원화를 불러오지 못했습니다. 닫은 뒤 다시 열어 주세요.'); }
  }
  function selectionChanged() { renderPool(); renderTray(); void syncScene(); }
  function play() {
    if (!loaded || busy || chosenCards().length !== MATERIAL_COUNT) return;
    error(''); busy = true; played = true; result.classList.remove('is-visible');
    dialog.classList.add('is-cinematic'); stage.classList.add('is-playing');
    $('[data-stage-subtitle]').textContent = '연출 시연 · 카드 소모 없음';
    $('.fusion-playback').hidden = fx.reduced; $('.fusion-scrub').value = '0'; updateControls();
    $('.fusion-body').scrollTo({top:0,behavior:'instant'});
    if (!fx.play()) { busy = false; dialog.classList.remove('is-cinematic'); stage.classList.remove('is-playing'); error('연출을 준비하고 있습니다. 잠시 후 다시 시도하세요.'); updateControls(); }
  }
  function close() {
    if (closed) return; closed = true; refreshId++; controller.abort(); fx.destroy();
    dialog.close(); dialog.remove(); document.body.style.overflow = previousOverflow;
    opener?.isConnected && opener.focus(); onClose?.();
  }
  dialog.addEventListener('cancel', event => { event.preventDefault(); close(); }, { signal });
  dialog.addEventListener('click', async event => {
    const b = event.target.closest('button'); if (!b) return;
    if (b.dataset.action === 'close') { close(); return; }
    if (b.dataset.action === 'sound') {
      b.disabled = true; const enabled = await fx.sound.enable(!fx.sound.enabled);
      if (closed) return; b.disabled = false; b.setAttribute('aria-pressed', String(enabled)); b.textContent = enabled ? '소리 끄기' : '소리 켜기';
      if (enabled && fx.active) fx.sound.schedule(fx.getClock()); return;
    }
    if (b.dataset.action === 'pause') { fx.pause(); return; }
    if (b.dataset.action === 'replay') { busy = false; play(); return; }
    if (busy) return;
    if (b.dataset.action === 'play') { play(); return; }
    if (b.dataset.action === 'owned' || b.dataset.action === 'demo') {
      mode = b.dataset.action; selection = []; sampleCards = [];
      if (mode === 'demo') sampleCards = demoMaterials(catalog, rank);
      selectionChanged(); return;
    }
    if (b.dataset.action === 'auto') {
      if (mode === 'demo') sampleCards = demoMaterials(catalog, rank); else selection = autoMaterials(rows, rank);
      selectionChanged(); if (chosenCards().length < MATERIAL_COUNT) error('이 등급의 중복 카드가 8장보다 적습니다. 연출 시연은 재료 소모 없이 이용할 수 있습니다.'); return;
    }
    if (b.dataset.action === 'clear') { selection = []; sampleCards = []; selectionChanged(); return; }
    if (b.hasAttribute('data-slot')) {
      const index = Number(b.dataset.slot); mode === 'demo' ? sampleCards.splice(index, 1) : selection.splice(index, 1); selectionChanged(); return;
    }
    if (b.dataset.material) {
      if (mode === 'demo') {
        if (sampleCards.length >= MATERIAL_COUNT) { error('8장이 모두 선택되어 있습니다. 슬롯을 눌러 재료를 빼세요.'); return; }
        const card = catalog.cards.find(c => c.code === b.dataset.material && c.rank === rank && !c.artOnly);
        if (card) sampleCards.push(card);
      } else {
        const next = addMaterial(selection, b.dataset.material, rows);
        if (!next.ok) { error(next.message); return; } selection = next.selection;
      }
      selectionChanged();
    }
  }, { signal });
  dialog.addEventListener('change', event => {
    if (busy) return;
    if (event.target.hasAttribute('data-material-rank')) { rank = event.target.value; resultRank = nextRank(rank); selection = []; sampleCards = mode === 'demo' ? demoMaterials(catalog, rank) : []; selectionChanged(); }
    if (event.target.hasAttribute('data-result-rank')) { resultRank = event.target.value; rank = RANKS[RANKS.indexOf(resultRank) - 1]; sampleCards = demoMaterials(catalog, rank); selectionChanged(); }
    if (event.target.hasAttribute('data-outcome')) { outcome = event.target.value; void syncScene(); }
  }, { signal });
  $('.fusion-scrub').addEventListener('input', event => { fx.seek(Number(event.target.value)); busy = false; dialog.classList.remove('is-cinematic'); updateControls(); }, { signal });
  document.addEventListener('visibilitychange', () => fx.setVisible(!document.hidden), { signal });
  window.addEventListener('pagehide', close, { signal });
  document.body.style.overflow = 'hidden'; dialog.showModal();
  renderPool(); renderTray();
  try {
    await loadVendor(); if (closed) return; await fx.init(); if (closed) return;
    await syncScene();
  } catch (e) { if (!closed) { loading.hidden = true; error(e.message || '연출을 불러오지 못했습니다. 다시 열어 주세요.'); } }
}
