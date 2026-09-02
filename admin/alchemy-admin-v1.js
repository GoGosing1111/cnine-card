(() => {
  'use strict';

  const $ = selector => document.querySelector(selector);
  const esc = value => String(value ?? '').replace(/[&<>'"]/g, char => ({ '&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;' }[char]));
  const TYPE_LABEL = { CARD:'카드', EQUIPMENT:'장비', ITEM:'아이템' };
  let state = null;

  async function api(options = {}) {
    const token = localStorage.getItem('cnine_admin_token') || sessionStorage.getItem('cnine_admin_token') || '';
    const response = await fetch(`../api/admin/alchemy?_=${Date.now()}`, {
      ...options,
      cache: 'no-store',
      headers: { 'Content-Type':'application/json', authorization:`Bearer ${token}`, ...(options.headers || {}) }
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || '연금술 CMS 요청에 실패했습니다.');
    return data;
  }

  function show(button, section) {
    document.querySelectorAll('.view').forEach(view => { view.hidden = view !== section; });
    document.querySelectorAll('#nav [data-view]').forEach(item => item.classList.toggle('active', item === button));
    if ($('#pageTitle')) $('#pageTitle').textContent = '연금술 관리';
    void load();
  }

  function install() {
    const nav = $('#nav'), main = $('main');
    if (!nav || !main) return;
    let button = nav.querySelector('[data-view="alchemy"]');
    if (!button) {
      button = document.createElement('button');
      button.type = 'button';
      button.dataset.view = 'alchemy';
      button.innerHTML = '연금술 <span class="buildBadge">OWNER</span>';
      nav.insertBefore(button, nav.querySelector('[data-view="settings"]') || null);
    }
    let section = $('#view-alchemy');
    if (!section) {
      section = document.createElement('section');
      section.id = 'view-alchemy';
      section.className = 'view alchemy-admin-view';
      section.hidden = true;
      section.innerHTML = `<div class="sectionIntro"><div><small>ALCHEMY REACTOR CONTROL</small><h2>연금술 <span class="buildBadge">v1</span></h2><p>공개 단계, 재료 허용 목록, 보상 가중치와 미완료 영수증을 한곳에서 관리합니다.</p></div><button type="button" class="ghost" id="alchemyAdminReload">새로고침</button></div><div id="alchemyAdminRoot" class="alchemy-admin-root">불러오는 중...</div>`;
      main.appendChild(section);
    }
    button.onclick = () => show(button, section);
    $('#alchemyAdminReload').onclick = load;
  }

  const option = (value, label, current) => `<option value="${esc(value)}" ${String(value) === String(current) ? 'selected' : ''}>${esc(label)}</option>`;
  function modeOptions(current) {
    return [
      ['OFF','OFF · 전체 차단'], ['OWNER_TEST','OWNER TEST · 운영자만'], ['PUBLIC','PUBLIC · 전체 공개']
    ].map(row => option(row[0], row[1], current)).join('');
  }
  function catalogOptions(type, current = '') {
    return (state?.catalog?.[type] || []).map(row => option(row.id, `${row.name} · ${row.rarity || '등급 없음'} · ${row.id}`, current)).join('');
  }
  function tierOptions(current) {
    return (state?.settings?.tiers || []).map(row => option(row.code, `${row.name} · ${Number(row.minValue).toLocaleString()}+`, current)).join('');
  }

  function probabilityRows() {
    const active = (state.rewardPool || []).filter(row => row.active && row.valid && Number(row.weight) > 0);
    const probability = (row, mode) => {
      if (row.mode !== 'ANY' && row.mode !== mode) return 0;
      const total = active.filter(candidate => candidate.tierCode === row.tierCode && (candidate.mode === 'ANY' || candidate.mode === mode)).reduce((sum, candidate) => sum + Number(candidate.weight), 0);
      return total ? Number(row.weight) / total * 100 : 0;
    };
    return (state.rewardPool || []).map(row => {
      const modes = row.mode === 'ANY' ? [['혼돈','CHAOS'],['정밀','PRECISION']] : [[row.mode === 'CHAOS' ? '혼돈' : '정밀', row.mode]];
      const odds = row.active && row.valid ? modes.map(([label, mode]) => `${label} ${probability(row, mode).toFixed(2)}%`).join(' · ') : '0.00%';
      return `<tr data-reward-id="${esc(row.rewardId)}"><td><b>${esc(row.rewardId)}</b><small>${esc(row.tierCode)} · ${esc(row.mode)}</small></td><td>${esc(TYPE_LABEL[row.type] || row.type)}<small>${esc(row.rarity || '-')}</small></td><td><b>${esc(row.name)}</b><small>${esc(row.id)} × ${Number(row.quantity || 1)}</small></td><td>${Number(row.weight).toLocaleString()}</td><td><b>${odds}</b><small>${row.valid ? (row.active ? 'ACTIVE' : 'OFF') : 'INVALID'}</small></td><td><button type="button" data-reward-edit>편집</button><button type="button" class="danger" data-reward-delete>삭제</button></td></tr>`;
    }).join('');
  }

  function inputRows() {
    return (state.inputItems || []).map(row => `<article class="alchemy-admin-input" data-input-code="${esc(row.item_code)}"><div><b>${esc(row.name || row.item_code)}</b><small>${esc(row.item_code)} · ${esc(row.rarity || '-')} · ${esc(row.category || '-')}</small></div><label><span>가치</span><input data-input-value type="number" min="1" max="1000000" value="${Number(row.alchemy_value || 1)}"></label><label><span>희귀도</span><input data-input-rank type="number" min="0" max="20" value="${Number(row.rarity_rank || 0)}"></label><label class="alchemy-admin-check"><input data-input-enabled type="checkbox" ${Number(row.is_enabled) ? 'checked' : ''}><span>허용</span></label><button type="button" data-input-save>저장</button></article>`).join('');
  }

  function recentRows() {
    return (state.recentRuns || []).map(row => `<tr><td>${esc(row.nickname || `#${row.user_id}`)}</td><td>${esc(row.alchemy_mode)}</td><td>${Number(row.total_value || 0).toLocaleString()}</td><td>${esc(row.tier_code)}</td><td><b class="is-${esc(String(row.status || '').toLowerCase())}">${esc(row.status)}</b></td><td>${esc(row.updated_at || row.created_at || '')}</td></tr>`).join('') || '<tr><td colspan="6">아직 연금 기록이 없습니다.</td></tr>';
  }

  function render() {
    const root = $('#alchemyAdminRoot');
    if (!root || !state) return;
    const settings = state.settings || {}, rules = settings.requirements || {};
    root.innerHTML = `<section class="alchemy-admin-gate mode-${esc(String(settings.mode || 'OFF').toLowerCase())}"><div><small>LIVE RELEASE GATE</small><h3>현재 공개 상태 <b>${esc(settings.mode || 'OFF')}</b></h3><p>OWNER TEST에서는 전체메뉴와 API가 OWNER 계정에만 열립니다.</p></div><label><span>공개 단계</span><select id="alchemyMode">${modeOptions(settings.mode || 'OFF')}</select></label><label><span>최소 슬롯</span><input id="alchemyMinSlots" type="number" min="3" max="5" value="${Number(rules.minSlots || 3)}"></label><label><span>최대 슬롯</span><input id="alchemyMaxSlots" type="number" min="3" max="5" value="${Number(rules.maxSlots || 5)}"></label><label><span>희귀 이상 최소</span><input id="alchemyMinRare" type="number" min="0" max="5" value="${Number(rules.minRare || 2)}"></label><label><span>안정도 보장</span><input id="alchemyStabilityMax" type="number" min="1" max="100" value="${Number(settings.stabilityMax || 10)}"></label><button type="button" id="alchemySettingsSave">운영 설정 저장</button></section>
      <div class="alchemy-admin-warning"><b>고정 안전 규칙</b><span>차량·배틀슈트·SUPERSTAR·마지막 카드 1장·장착/잠금 자산은 서버에서 차단됩니다. 결과 카드는 MA 이하만 허용됩니다.</span></div>
      <section class="alchemy-admin-columns"><article class="panel"><header class="alchemy-admin-heading"><div><small>MATERIAL ALLOWLIST</small><h3>일반 아이템 재료 허용</h3></div></header><div class="alchemy-admin-add-input"><select id="alchemyInputCatalog">${catalogOptions('ITEM')}</select><input id="alchemyInputValue" type="number" min="1" value="50" aria-label="연금 가치"><input id="alchemyInputRank" type="number" min="0" max="20" value="2" aria-label="희귀도"><button type="button" id="alchemyInputAdd">추가</button></div><div class="alchemy-admin-input-list">${inputRows()}</div></article>
      <article class="panel"><header class="alchemy-admin-heading"><div><small>REWARD POOL</small><h3>보상·가중치 편집</h3></div></header><div class="alchemy-admin-reward-form"><label><span>보상 ID</span><input id="alchemyRewardId" placeholder="비우면 자동 생성"></label><label><span>유형</span><select id="alchemyRewardType">${Object.keys(TYPE_LABEL).map(type => option(type, TYPE_LABEL[type], 'ITEM')).join('')}</select></label><label class="wide"><span>대상</span><select id="alchemyRewardRef">${catalogOptions('ITEM')}</select></label><label><span>단계</span><select id="alchemyRewardTier">${tierOptions(settings.tiers?.[0]?.code)}</select></label><label><span>연성 방식</span><select id="alchemyRewardMode">${option('ANY','공통','ANY')}${option('CHAOS','혼돈','ANY')}${option('PRECISION','정밀','ANY')}</select></label><label><span>수량</span><input id="alchemyRewardQuantity" type="number" min="1" max="20" value="1"></label><label><span>가중치</span><input id="alchemyRewardWeight" type="number" min="0.001" step="0.001" value="10"></label><label><span>정렬</span><input id="alchemyRewardSort" type="number" value="0"></label><label class="alchemy-admin-check"><input id="alchemyRewardActive" type="checkbox" checked><span>활성</span></label><button type="button" id="alchemyRewardSave">보상 저장</button><button type="button" class="ghost" id="alchemyRewardReset">새 보상</button></div></article></section>
      <section class="panel"><header class="alchemy-admin-heading"><div><small>NORMALIZED ODDS</small><h3>보상 풀 확률 검산</h3></div><small>동일 단계·모드 가중치 합계 기준</small></header><div class="alchemy-admin-table"><table><thead><tr><th>보상 ID</th><th>유형</th><th>결과</th><th>가중치</th><th>정규화 확률</th><th>관리</th></tr></thead><tbody>${probabilityRows()}</tbody></table></div></section>
      <section class="panel"><header class="alchemy-admin-heading"><div><small>RECEIPT CONTROL</small><h3>최근 연금 처리</h3></div><button type="button" class="warn" id="alchemyRecoverPending">10분 초과 PENDING 복구</button></header><div class="alchemy-admin-table"><table><thead><tr><th>계정</th><th>방식</th><th>가치</th><th>단계</th><th>상태</th><th>갱신</th></tr></thead><tbody>${recentRows()}</tbody></table></div></section>`;
    bind();
  }

  function body(action, extra = {}) { return { method:'POST', body:JSON.stringify({ action, ...extra }) }; }
  async function mutate(action, extra, button, message) {
    if (button) button.disabled = true;
    try { const result = await api(body(action, extra)); state = result.snapshot || state; render(); if (message) alert(message); }
    catch (error) { alert(error.message); if (button?.isConnected) button.disabled = false; }
  }

  function rewardForm(row = null) {
    const type = row?.type || 'ITEM';
    $('#alchemyRewardId').value = row?.rewardId || '';
    $('#alchemyRewardType').value = type;
    $('#alchemyRewardRef').innerHTML = catalogOptions(type, row?.id || '');
    $('#alchemyRewardTier').value = row?.tierCode || state.settings?.tiers?.[0]?.code || '';
    $('#alchemyRewardMode').value = row?.mode || 'ANY';
    $('#alchemyRewardQuantity').value = Number(row?.quantity || 1);
    $('#alchemyRewardWeight').value = Number(row?.weight || 10);
    $('#alchemyRewardSort').value = Number(row?.sortOrder || 0);
    $('#alchemyRewardActive').checked = row ? Boolean(row.active) : true;
  }

  function bind() {
    $('#alchemySettingsSave').onclick = event => {
      const mode = $('#alchemyMode').value;
      if (mode === 'PUBLIC' && !confirm('연금술을 전체 유저에게 공개하시겠습니까? 보상 가중치와 지급 대상을 최종 확인하세요.')) return;
      void mutate('SAVE_SETTINGS', { settings:{ mode, requirements:{ minSlots:Number($('#alchemyMinSlots').value), maxSlots:Number($('#alchemyMaxSlots').value), minRare:Number($('#alchemyMinRare').value) }, stabilityMax:Number($('#alchemyStabilityMax').value) } }, event.currentTarget, '연금술 운영 설정을 저장했습니다.');
    };
    $('#alchemyInputAdd').onclick = event => void mutate('SAVE_INPUT', { itemCode:$('#alchemyInputCatalog').value, value:Number($('#alchemyInputValue').value), rank:Number($('#alchemyInputRank').value), enabled:true }, event.currentTarget, '재료 허용 목록에 추가했습니다.');
    document.querySelectorAll('[data-input-save]').forEach(button => button.onclick = event => { const row = event.currentTarget.closest('[data-input-code]'); void mutate('SAVE_INPUT', { itemCode:row.dataset.inputCode, value:Number(row.querySelector('[data-input-value]').value), rank:Number(row.querySelector('[data-input-rank]').value), enabled:row.querySelector('[data-input-enabled]').checked }, event.currentTarget, '재료 설정을 저장했습니다.'); });
    $('#alchemyRewardType').onchange = event => { $('#alchemyRewardRef').innerHTML = catalogOptions(event.target.value); };
    $('#alchemyRewardReset').onclick = () => rewardForm();
    $('#alchemyRewardSave').onclick = event => void mutate('SAVE_REWARD', { reward:{ rewardId:$('#alchemyRewardId').value, type:$('#alchemyRewardType').value, id:$('#alchemyRewardRef').value, tierCode:$('#alchemyRewardTier').value, mode:$('#alchemyRewardMode').value, quantity:Number($('#alchemyRewardQuantity').value), weight:Number($('#alchemyRewardWeight').value), sortOrder:Number($('#alchemyRewardSort').value), active:$('#alchemyRewardActive').checked } }, event.currentTarget, '연금 보상을 저장했습니다.');
    document.querySelectorAll('[data-reward-edit]').forEach(button => button.onclick = event => { const id = event.currentTarget.closest('[data-reward-id]').dataset.rewardId; rewardForm(state.rewardPool.find(row => row.rewardId === id)); $('#alchemyRewardId').scrollIntoView({ behavior:'smooth', block:'center' }); });
    document.querySelectorAll('[data-reward-delete]').forEach(button => button.onclick = event => { const id = event.currentTarget.closest('[data-reward-id]').dataset.rewardId; if (confirm(`${id} 보상을 삭제하시겠습니까?`)) void mutate('DELETE_REWARD', { rewardId:id }, event.currentTarget, '보상을 삭제했습니다.'); });
    $('#alchemyRecoverPending').onclick = event => { if (confirm('10분 이상 멈춘 연금 요청을 FAILED로 전환하시겠습니까? 이미 지급 완료된 요청은 변경하지 않습니다.')) void mutate('RECOVER_PENDING', {}, event.currentTarget, '미완료 요청 복구를 마쳤습니다.'); };
  }

  async function load() {
    const root = $('#alchemyAdminRoot');
    if (!root) return;
    root.innerHTML = '<div class="alchemy-admin-loading">연금술 운영 데이터와 보상 풀을 불러오는 중...</div>';
    try {
      state = await api();
      render();
      const badge = document.querySelector('#nav [data-view="alchemy"] .buildBadge');
      if (badge) badge.textContent = state.settings?.mode || 'OFF';
    } catch (error) { root.innerHTML = `<div class="inlineNotice error">${esc(error.message)}</div>`; }
  }

  const boot = () => { install(); setTimeout(install, 250); setTimeout(install, 1000); };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot, { once:true }); else boot();
})();
