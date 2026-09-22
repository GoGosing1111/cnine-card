/* Magic card workbench. No economic policy lives here: costs/rates come from the server. */
(() => {
  'use strict';
  const empty = () => [0, 0, 0, 0, 0];
  const slots = value => Array.from({ length: 5 }, (_, i) => Number(value?.[i] || 0));
  const same = (a, b) => JSON.stringify(slots(a)) === JSON.stringify(slots(b));
  const fmt = n => Number(n || 0).toLocaleString('ko-KR');
  const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
  const groups = { OPENING_ATTACK: '공격', PUNISH_TRAP: '공격', ARCANE_COUNTER: '공격', DOOM_MARK: '공격', CHAIN_ECHO: '공격', GUARD_BARRIER: '생존', LIFE_AMPLIFY: '생존', CRISIS_HEAL: '생존', PHOENIX_REVIVE: '생존', PURIFY_LIGHT: '생존', SHIELD_SIPHON: '제어', FOLLOWUP_HASTE: '제어', ARCANE_SEAL: '제어', TIME_DISTORTION: '제어' };
  const labels = { OPENING_ATTACK: '공격 강화', GUARD_BARRIER: '수호 결계', LIFE_AMPLIFY: '생명 증폭', CRISIS_HEAL: '위기 회복', PUNISH_TRAP: '응징 함정', ARCANE_COUNTER: '마력 반격', FOLLOWUP_HASTE: '속행 가속', ARCANE_SEAL: '마법 봉인', DOOM_MARK: '파멸 낙인', SHIELD_SIPHON: '보호막 강탈', TIME_DISTORTION: '행동 교란', PHOENIX_REVIVE: '전투 부활', PURIFY_LIGHT: '약화 정화', CHAIN_ECHO: '연쇄 추가타' };
  const ui = { section: 'collection', type: 'PVE', preset: 1, slot: 0, selected: 0, query: '', filter: 'owned', group: 'all', key: '', draft: empty(), saved: empty(), busy: false, notice: '', error: false, account: null };
  let host, data, bridge;
  function art(card, extra = '') {
    const url = String(card?.imageUrl || '').trim();
    // Only same-origin assets or explicit HTTP(S) card images; never executable URLs.
    const safe = /^(?:https?:\/\/|\/?assets\/)/i.test(url);
    return safe ? `<img class="${extra}" src="${esc(url.replace(/-768-(v\d+)\.webp$/, '-384-$1.webp'))}" alt="${esc(card.name)}" width="384" height="576" loading="lazy" decoding="async">` : '<span class="mw-art-empty" aria-hidden="true">M</span>';
  }
  function baseline(d = data) {
    if (ui.type === 'PVP') return slots(d?.pvp?.magicPresets?.[ui.preset]);
    const out = empty();
    for (const row of d?.loadouts || []) if (row.deckType === 'PVE' && row.slotNo >= 1 && row.slotNo <= 5) out[row.slotNo - 1] = Number(row.magicCardId || 0);
    return out;
  }
  function dirty() { return !same(ui.draft, ui.saved); }
  function canLeave() {
    if (ui.busy) return false;
    if (dirty() && !confirm('저장하지 않은 마법카드 편성이 있습니다. 변경사항을 버리고 이동할까요?')) return false;
    ui.key = ''; ui.notice = ''; ui.detailOpen = false; return true;
  }
  function eligible(card) { return Number(card?.quantity) > 0 && card?.scopes?.[ui.type.toLowerCase()] !== false && card?.isActive !== false; }
  function enhanceReady(card) { const level = Number(card?.enhancementLevel || 0); return Number(card?.quantity) > 1 && level < 9 && Number(data?.cardShards || 0) >= Number(data?.settings?.enhancement?.shardCosts?.[level] || 0); }
  function contextLabel() { return ui.type === 'PVE' ? 'PVE 덱' : `PVP 프리셋 ${ui.preset}`; }
  function message(text, error = false) { ui.notice = text; ui.error = error; render(host, data, bridge); }
  function view() {
    return '<section id="magicSystemRoot" class="mw-root" aria-label="마법카드"><div class="mw-empty" role="status">마법카드를 불러오는 중입니다.</div></section>';
  }
  function render(root, status, adapter) {
    host = root; data = status; bridge = adapter;
    const account = adapter.accountId;
    if (ui.account !== account) { Object.assign(ui, { account, key: '', selected: 0, query: '', type: 'PVE', draft: empty(), saved: empty(), notice: '', detailOpen: false }); }
    root.className = `mw-root${ui.detailOpen ? ' is-inspecting' : ''}`;
    if (!status.visible) { root.innerHTML = '<div class="mw-empty"><h2>마법카드 준비 중</h2><p>현재 마법카드가 공개되지 않았습니다.</p></div>'; return; }
    const key = `${account}:${ui.type}:${ui.preset}`;
    if (ui.key !== key || !dirty()) { ui.draft = baseline(); ui.saved = [...ui.draft]; ui.key = key; }
    root.classList.toggle('has-changes', dirty() || ui.busy);
    const detailTag = matchMedia('(max-width: 760px)').matches ? 'dialog' : 'aside';
    const cards = status.cards || [], card = cards.find(c => Number(c.id) === ui.selected) || cards.find(c => eligible(c)) || cards[0];
    if (card) ui.selected = Number(card.id);
    const focused = root.contains(document.activeElement) ? document.activeElement.id : '', caret = document.activeElement?.selectionStart;
    root.innerHTML = `<header class="mw-heading"><div><span class="mw-kicker">카드 · 용병 / 마법카드</span><h2>마법카드</h2><p>덱마다 다른 전략, 마법카드까지 한 번에.</p></div><dl class="mw-wallet"><div><dt>마법 결정</dt><dd>${fmt(status.magicCrystals)}</dd></div><div><dt>카드 조각</dt><dd>${fmt(status.cardShards)}</dd></div><div><dt>코인</dt><dd>${fmt(status.coin)}</dd></div></dl></header>
      <nav class="mw-tabs" aria-label="마법카드 메뉴"><button type="button" data-mw-section="collection" aria-pressed="${ui.section === 'collection'}">편성 · 강화 <small>${cards.filter(c => Number(c.quantity) > 0).length}종 보유</small></button><button type="button" data-mw-section="draw" aria-pressed="${ui.section === 'draw'}">소환</button><span>일반 카드 5장 · 마법 슬롯 5개</span></nav>
      <div class="mw-notice ${ui.error ? 'is-error' : ''}" role="${ui.error ? 'alert' : 'status'}" ${ui.notice ? '' : 'hidden'}>${esc(ui.notice)}</div>
      ${ui.section === 'draw' ? drawMarkup(status) : `<section class="mw-loadout" aria-label="마법카드 편성"><div class="mw-context"><div class="mw-scope" aria-label="편성할 덱 선택">${[['PVE', 1, 'PVE'], ['PVP', 1, 'PVP 1'], ['PVP', 2, 'PVP 2'], ['PVP', 3, 'PVP 3']].map(([type, no, label]) => `<button type="button" data-mw-type="${type}" data-mw-preset="${no}" aria-pressed="${ui.type === type && (type === 'PVE' || ui.preset === no)}" ${ui.busy ? 'disabled' : ''}><b>${label}</b><small>${type === 'PVE' ? '토벌용' : no === 1 ? '방어덱' : '공격덱'}${type === 'PVP' && no === Number(status.pvp?.activePreset || 1) ? ' · 출전 중' : ''}</small></button>`).join('')}</div><p>${ui.type === 'PVP' ? '프리셋마다 별도 저장됩니다. 공격덱 전환은 랭크전 덱 편성에서 합니다.' : '마법 슬롯 번호는 전투 카드의 편성 순서와 같습니다.'}</p></div>
      <div class="mw-slots" aria-label="마법카드 슬롯">${ui.draft.map((id, i) => { const c = cards.find(c => Number(c.id) === id); return `<button type="button" data-mw-slot="${i}" class="${id ? 'is-filled' : ''}" aria-pressed="${ui.slot === i}" aria-label="${i + 1}번 슬롯 ${esc(c?.name || (id ? '사용 불가 카드' : '비어 있음'))}" ${ui.busy ? 'disabled' : ''}><span class="mw-slot-number">0${i + 1}</span>${c ? art(c) : '<span class="mw-slot-plus">+</span>'}<span><b>${esc(c?.name || (id ? '사용 불가 카드' : '빈 슬롯'))}</b><small>${c ? `+${Number(c.enhancementLevel || 0)} · 발동 ${Number(c.effectiveTriggerChance || 0)}%` : '카드를 선택하세요'}</small></span></button>`; }).join('')}</div></section>
      <div class="mw-workspace"><section class="mw-collection" aria-label="마법카드 목록"><header><h3>내 마법카드</h3><span id="mwResultCount"></span></header><div class="mw-filters"><label class="mw-search"><span class="mw-sr">이름 · 효과 검색</span><input id="mwSearch" type="search" autocomplete="off" value="${esc(ui.query)}" placeholder="이름 · 효과 검색"></label><label><span class="mw-sr">효과 유형</span><select id="mwGroup"><option value="all">모든 효과</option>${['공격', '생존', '제어'].map(g => `<option ${ui.group === g ? 'selected' : ''}>${g}</option>`).join('')}</select></label></div><div class="mw-filter-tabs" aria-label="보유 상태">${[['owned', '보유'], ['all', '전체 도감'], ['enhance', '강화 가능']].map(([id, label]) => `<button type="button" data-mw-filter="${id}" aria-pressed="${ui.filter === id}">${label}</button>`).join('')}</div><div id="mwCards" class="mw-card-grid"></div></section>
      <button type="button" class="mw-detail-backdrop" aria-label="카드 상세 닫기" tabindex="-1"></button><${detailTag} class="mw-detail" aria-label="선택한 마법카드">${detailMarkup(card)}</${detailTag}></div>
      <footer class="mw-savebar"><div><b>${contextLabel()} <span>${ui.draft.filter(Boolean).length}/5</span></b><small>${ui.busy ? '요청을 처리하고 있습니다.' : dirty() ? '변경사항이 있습니다. 저장해야 전투에 적용됩니다.' : '서버 저장본과 같습니다.'}</small></div><div><button type="button" id="mwRestore" ${!dirty() || ui.busy ? 'disabled' : ''}>되돌리기</button><button type="button" id="mwSave" class="mw-primary" ${!dirty() || ui.busy ? 'disabled' : ''}>${ui.busy ? '처리 중…' : '마법 편성 저장'}</button></div></footer>`}`;
    root.querySelectorAll('[data-mw-section]').forEach(b => b.onclick = () => { if (ui.busy) return; ui.section = b.dataset.mwSection; ui.notice = ''; render(root, data, bridge); });
    root.querySelectorAll('[data-mw-type]').forEach(b => b.onclick = () => { if (!canLeave()) return; ui.type = b.dataset.mwType; ui.preset = Number(b.dataset.mwPreset); ui.slot = 0; render(root, data, bridge); });
    root.querySelectorAll('[data-mw-slot]').forEach(b => b.onclick = () => { ui.slot = Number(b.dataset.mwSlot); if (ui.draft[ui.slot]) { ui.selected = ui.draft[ui.slot]; ui.detailOpen = true; } render(root, data, bridge); });
    root.querySelectorAll('#mwDetailClose,.mw-detail-backdrop').forEach(b => b.onclick = () => { if(ui.busy)return; ui.detailOpen=false; render(root,data,bridge); root.querySelector(`[data-mw-card="${ui.selected}"]`)?.focus({preventScroll:true}); });
    root.querySelectorAll('[data-mw-filter]').forEach(b => b.onclick = () => { ui.filter = b.dataset.mwFilter; render(root, data, bridge); });
    const search = root.querySelector('#mwSearch'), group = root.querySelector('#mwGroup');
    if (search) search.oninput = () => { ui.query = search.value; renderCards(); };
    if (group) group.onchange = () => { ui.group = group.value; renderCards(); };
    root.querySelector('#mwEquip')?.addEventListener('click', () => {
      if (ui.busy || !eligible(card)) return;
      // Moving a card between slots is one draft operation, never a duplicate.
      ui.draft = ui.draft.map(id => id === Number(card.id) ? 0 : id); ui.draft[ui.slot] = Number(card.id); ui.notice = ''; ui.detailOpen=false; render(root, data, bridge);
    });
    root.querySelector('#mwUnequip')?.addEventListener('click', () => { if (ui.busy) return; ui.draft[ui.slot] = 0; ui.notice = ''; render(root, data, bridge); });
    root.querySelector('#mwRestore')?.addEventListener('click', () => { ui.draft = [...ui.saved]; ui.notice = '저장된 편성을 불러왔습니다.'; ui.error = false; render(root, data, bridge); });
    root.querySelector('#mwSave')?.addEventListener('click', save);
    root.querySelector('#mwEnhance')?.addEventListener('click', () => perform(() => bridge.enhance(Number(card.id))));
    root.querySelector('#magicDrawBtn')?.addEventListener('click', () => perform(() => bridge.draw(1)));
    root.querySelector('#magicDraw10Btn')?.addEventListener('click', () => perform(() => bridge.draw(10)));
    renderCards();
    const detail = root.querySelector('.mw-detail'), mobileDialog = detail && ui.detailOpen && matchMedia('(max-width: 760px)').matches;
    if (mobileDialog) {
      detail.setAttribute('aria-modal', 'true');
      detail.showModal();
      detail.addEventListener('cancel', event => { event.preventDefault(); root.querySelector('#mwDetailClose')?.click(); });
    }
    root.onkeydown = event => {
      if (!mobileDialog) return;
      if (event.key === 'Escape') { event.preventDefault(); root.querySelector('#mwDetailClose')?.click(); return; }
      if (event.key !== 'Tab') return;
      const buttons = [...detail.querySelectorAll('button:not(:disabled),select:not(:disabled),input:not(:disabled),[tabindex="0"]')].filter(b => b.getClientRects().length);
      const first = buttons[0], last = buttons[buttons.length - 1];
      if (event.shiftKey && (document.activeElement === first || !detail.contains(document.activeElement))) { event.preventDefault(); last?.focus(); }
      else if (!event.shiftKey && (document.activeElement === last || !detail.contains(document.activeElement))) { event.preventDefault(); first?.focus(); }
    };
    if (focused) { const next = document.getElementById(focused); next?.focus({ preventScroll: true }); if (next?.type === 'search' && caret != null) next.setSelectionRange(caret, caret); }
    if (mobileDialog && !detail.contains(document.activeElement)) root.querySelector('#mwDetailClose')?.focus({ preventScroll: true });
  }
  function renderCards() {
    const grid = host?.querySelector('#mwCards'); if (!grid) return;
    const rows = (data.cards || []).filter(c => (ui.filter !== 'owned' || Number(c.quantity) > 0) && (ui.filter !== 'enhance' || enhanceReady(c)) && (ui.group === 'all' || groups[c.effectType] === ui.group) && `${c.name} ${c.description} ${labels[c.effectType] || ''}`.toLowerCase().includes(ui.query.trim().toLowerCase()));
    host.querySelector('#mwResultCount').textContent = `${rows.length}종`;
    grid.innerHTML = rows.length ? rows.map(c => { const equipped = ui.draft.indexOf(Number(c.id)), owned = Number(c.quantity) > 0; return `<button type="button" class="mw-card ${owned ? '' : 'is-unowned'}" data-mw-card="${Number(c.id)}" aria-pressed="${ui.selected === Number(c.id)}" aria-label="${esc(c.name)} 강화 ${Number(c.enhancementLevel || 0)}, ${owned ? `보유 ${Number(c.quantity)}장` : '미보유'}"><span class="mw-card-art">${art(c)}<span class="mw-level">+${Number(c.enhancementLevel || 0)}</span>${equipped >= 0 ? `<span class="mw-equipped">${equipped + 1}번 장착</span>` : ''}${!owned ? '<span class="mw-locked">미보유</span>' : ''}</span><strong>${esc(c.name)}</strong><span class="mw-card-effect">${esc(labels[c.effectType] || '마법 효과')}</span><span class="mw-card-meta"><b>발동 ${Number(c.effectiveTriggerChance || 0)}%</b><small>${owned ? `${fmt(c.quantity)}장` : '미보유'}</small></span></button>`; }).join('') : '<div class="mw-empty"><b>조건에 맞는 카드가 없습니다.</b><p>검색어나 필터를 바꾸거나 전체 도감을 확인하세요.</p><button type="button" id="mwResetFilters">전체 카드 보기</button></div>';
    grid.querySelectorAll('[data-mw-card]').forEach(b => b.onclick = () => { if (ui.busy) return; ui.selected = Number(b.dataset.mwCard); ui.detailOpen=true; render(host, data, bridge); if (matchMedia('(max-width: 760px)').matches) host.querySelector('#mwDetailClose')?.focus({preventScroll:true}); });
    grid.querySelector('#mwResetFilters')?.addEventListener('click', () => { ui.query = ''; ui.filter = 'all'; ui.group = 'all'; render(host, data, bridge); });
  }
  function detailMarkup(card) {
    if (!card) return '<div class="mw-empty">등록된 마법카드가 없습니다.</div>';
    const level = Number(card.enhancementLevel || 0), chance = Number(card.effectiveTriggerChance || 0), material = Math.max(0, Number(card.quantity || 0) - 1), config = data.settings?.enhancement || {}, cost = Number(config.shardCosts?.[level] || 0), next = Number(config.triggerRates?.[level + 1] || 0), rate = Number(config.successRates?.[level] || 0), equip = eligible(card), placed = ui.draft.indexOf(Number(card.id));
    return `<header><span>선택한 마법카드</span><b>${esc(groups[card.effectType] || '마법')}</b><button type="button" id="mwDetailClose" class="mw-mobile-close">닫기 ×</button></header><div class="mw-detail-intro"><div class="mw-detail-art">${art(card)}</div><div><small>강화 +${level}</small><h3>${esc(card.name)}</h3><p>${esc(labels[card.effectType] || card.effectType)}</p><span class="mw-ownership">${Number(card.quantity) > 0 ? `보유 ${fmt(card.quantity)}장 · 재료 ${fmt(material)}장` : '미보유 카드'}</span></div></div><p class="mw-description">${esc(card.description || '등록된 효과 설명이 없습니다.')}</p><dl class="mw-stats"><div><dt>발동 확률</dt><dd>${chance}<small>%</small></dd></div><div><dt>최대 발동</dt><dd>${Number(card.maxActivations || 1)}<small>회</small></dd></div></dl>${chance === 0 ? '<p class="mw-hint">현재 발동률이 0%입니다. 강화하면 발동률이 올라갑니다.</p>' : ''}<div class="mw-equip-actions"><button type="button" id="mwEquip" class="mw-primary" ${!equip || placed === ui.slot || ui.busy ? 'disabled' : ''}>${!Number(card.quantity) ? '획득 후 장착 가능' : !equip ? `${ui.type} 사용 불가` : placed === ui.slot ? `${ui.slot + 1}번에 선택됨` : `${ui.slot + 1}번 슬롯에 ${placed >= 0 ? '이동' : '장착'}`}</button><button type="button" id="mwUnequip" ${!ui.draft[ui.slot] || ui.busy ? 'disabled' : ''}>${ui.slot + 1}번 해제</button></div><section class="mw-enhance"><header><h4>카드 강화</h4><span>${level >= 9 ? '최고 단계' : `+${level} → +${level + 1}`}</span></header>${level >= 9 ? '<p>최대 강화 단계에 도달했습니다.</p>' : `<div class="mw-enhance-rate"><span>발동률 <b>${chance}% → ${next}%</b></span><span>성공 확률 <b>${rate}%</b></span></div><dl><div><dt>동일 카드</dt><dd class="${material < 1 ? 'is-short' : ''}">${fmt(material)} / 1장</dd></div><div><dt>카드 조각</dt><dd class="${Number(data.cardShards) < cost ? 'is-short' : ''}">${fmt(data.cardShards)} / ${fmt(cost)}</dd></div></dl><p>실패해도 강화 단계는 유지됩니다. 재료 카드와 조각은 소모됩니다.</p><button type="button" id="mwEnhance" ${!enhanceReady(card) || ui.busy ? 'disabled' : ''}>${!Number(card.quantity) ? '카드 획득 필요' : material < 1 ? '동일 카드 재료 부족' : Number(data.cardShards) < cost ? '카드 조각 부족' : '강화하기'}</button>`}</section>`;
  }
  function drawMarkup(d) {
    const s = d.settings || {}, pool = s.packRewards || {}, rows = [['마법카드', Number(pool.magicCardWeight || 0)], ['마법 결정', Number(pool.magicCrystalWeight || 0)], ['카드 조각', Number(pool.cardShardWeight || 0)]], total = rows.reduce((sum, r) => sum + r[1], 0), available = n => s.drawEnabled && Number(d.coin) >= Number(s.drawCoinCost) * n && Number(d.magicCrystals) >= Number(s.drawCost) * n && !ui.busy;
    return `<section class="mw-summon"><div class="mw-summon-art"><img src="assets/cards/magic-card-pack-v2-384.jpg" alt="아르카나 마법카드팩" width="384" height="688"><span>아르카나 혼합 소환</span></div><div class="mw-summon-info"><span class="mw-kicker">소환</span><h3>새로운 전략을 여세요</h3><p>마법카드 · 마법 결정 · 카드 조각 중 하나를 획득합니다.<br>중복 마법카드는 강화 재료로 사용할 수 있습니다.</p><dl class="mw-pool">${rows.map(([name, weight]) => `<div><dt>${name}</dt><dd>${total ? Math.round(weight / total * 1000) / 10 : 0}%</dd></div>`).join('')}</dl><div class="mw-draw-options">${[1, 10].map(n => `<article><h4>${n}회 소환</h4><p>코인 <b>${fmt(Number(s.drawCoinCost) * n)}</b></p><p>마법 결정 <b>${fmt(Number(s.drawCost) * n)}</b></p><button type="button" id="${n === 1 ? 'magicDrawBtn' : 'magicDraw10Btn'}" class="${n === 1 ? 'mw-primary' : ''}" ${available(n) ? '' : 'disabled'}>${ui.busy ? '처리 중…' : !s.drawEnabled ? '소환 준비 중' : !available(n) ? '재화 부족' : `${n}회 소환하기`}</button></article>`).join('')}</div><p class="mw-hint">${esc(s.acquisitionNotice || '마법 결정은 인게임 플레이로 획득합니다.')}</p></div></section>`;
  }
  async function perform(action) {
    if (ui.busy) return;
    ui.busy = true; render(host, data, bridge);
    try { await action(); } catch (e) { ui.notice = e.message || '요청에 실패했습니다.'; ui.error = true; }
    finally { ui.busy = false; if (host?.isConnected) render(host, data, bridge); }
  }
  async function save() {
    if (ui.busy || !dirty()) return;
    const payload = { deckType: ui.type, presetNo: ui.preset, magicCardIds: [...ui.draft] };
    ui.busy = true; ui.notice = ''; render(host, data, bridge);
    try {
      const result = await bridge.request('magic/loadout', { method: 'POST', body: JSON.stringify(payload) });
      bridge.accept(result.status); data = result.status; ui.draft = [...payload.magicCardIds]; ui.saved = [...payload.magicCardIds];
      ui.notice = `${contextLabel()}의 마법카드를 저장했습니다.${ui.type === 'PVP' ? ' 다른 프리셋은 유지됩니다.' : ''}`; ui.error = false;
    } catch (e) { ui.notice = e.message || '저장하지 못했습니다. 선택한 편성은 유지됩니다.'; ui.error = true; }
    finally { ui.busy = false; if (host?.isConnected) render(host, data, bridge); }
  }
  function rankedMarkup(state, status) {
    const choices = status.cards || [], draft = slots(state.magicDraft), saved = slots(state.magicPresets?.[state.selectedPreset]);
    return `<section class="mw-ranked"><header><div><h3>마법카드 프리셋</h3><p>일반 덱과 함께 저장됩니다. 방어전은 항상 1번 프리셋을 사용합니다.</p></div><b>${draft.filter(Boolean).length}/5</b></header><div class="mw-ranked-slots">${draft.map((id, index) => { const c = choices.find(c => Number(c.id) === id); return `<label><span>${index + 1}번 카드의 마법</span><span class="mw-ranked-art">${c ? art(c) : '<span class="mw-art-empty">+</span>'}</span><select data-ranked-magic="${index}" aria-label="${index + 1}번 마법카드" ${state.saving || status.visible === false ? 'disabled' : ''}><option value="0">장착하지 않음</option>${id && !c ? `<option value="${id}" selected>사용 불가 · 해제 필요</option>` : ''}${choices.filter(c => Number(c.quantity) > 0 && c.scopes?.pvp !== false || Number(c.id) === id).map(c => `<option value="${Number(c.id)}" ${Number(c.id) === id ? 'selected' : ''} ${draft.includes(Number(c.id)) && Number(c.id) !== id ? 'disabled' : ''}>${esc(c.name)} +${Number(c.enhancementLevel || 0)}</option>`).join('')}</select><small>${c ? `발동 ${Number(c.effectiveTriggerChance || 0)}%` : '빈 슬롯'}</small></label>`; }).join('')}</div><p class="mw-hint">${same(draft, saved) ? '프리셋을 선택하면 마법카드도 함께 불러옵니다.' : '마법카드 변경사항이 있습니다. 위의 ‘저장 및 적용’을 눌러주세요.'}</p></section>`;
  }
  addEventListener('beforeunload', event => { if (host?.isConnected && (dirty() || ui.busy)) { event.preventDefault(); event.returnValue = ''; } });
  window.MagicWorkbench = { view, render, canLeave, rankedMarkup, slots, same, reset: () => { ui.key = ''; } };
})();
