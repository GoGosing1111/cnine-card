(() => {
  'use strict';

  const $ = selector => document.querySelector(selector);
  const esc = value => String(value ?? '').replace(/[&<>'"]/g, char => ({ '&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;' }[char]));
  const TYPE_LABEL = { CARD:'카드', EQUIPMENT:'장비', ITEM:'아이템', VEHICLE:'이동수단' };
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
      section.innerHTML = `<div class="sectionIntro"><div><small>ALCHEMY REACTOR CONTROL</small><h2>연금술 <span class="buildBadge">v3</span></h2><p>단일 연금술의 재료 가치 곡선과 카드·장비·이동수단 최종 등장확률을 관리합니다.</p></div><button type="button" class="ghost" id="alchemyAdminReload">새로고침</button></div><div id="alchemyAdminRoot" class="alchemy-admin-root">불러오는 중...</div>`;
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
    const rows = state?.catalog?.[type] || [];
    if (!rows.length) return '<option value="">등록 가능한 대상 없음</option>';
    return rows.map(row => {
      const metric = type === 'CARD' ? `기본 ${Number(row.basePower || 0).toLocaleString()} · 고유 ${Number(row.uniqueEffectScore || 0).toLocaleString()}` : (type === 'EQUIPMENT' || type === 'VEHICLE') ? `전투력 ${Number(row.totalPower || row.total_power || 0).toLocaleString()}` : (row.category || '아이템');
      return option(row.id, `${row.name} · ${row.rarity || '등급 없음'} · ${metric}`, current);
    }).join('');
  }
  function tierOptions(current) {
    return (state?.settings?.tiers || []).map(row => option(row.code, `${row.name} · ${Number(row.minValue).toLocaleString()}+`, current)).join('');
  }

  const effectiveWeight = row => Number(row.effectiveWeight ?? row.weight ?? 0);
  const formatProbability = value => Number(value || 0).toFixed(value >= 10 ? 2 : value >= 1 ? 3 : value >= .01 ? 4 : 6);
  const oneInLabel = value => {
    const probability = Number(value || 0);
    if (probability <= 0) return '등장하지 않음';
    const attempts = 100 / probability;
    if (attempts <= 1.01) return '매회 등장';
    return `약 ${attempts < 10 ? attempts.toFixed(1) : Math.round(attempts).toLocaleString()}회당 1회`;
  };
  const probabilityLevel = value => value >= 10 ? 'common' : value >= 1 ? 'uncommon' : value >= .1 ? 'rare' : 'ultra';
  function probabilityModel() {
    const tiers = state.settings?.tiers || [], tierOrder = new Map(tiers.map((tier, index) => [tier.code, index]));
    const active = (state.rewardPool || []).filter(row => row.active && row.valid && effectiveWeight(row) > 0);
    const totals = new Map();
    for (const row of active) totals.set(row.tierCode, Number(totals.get(row.tierCode) || 0) + effectiveWeight(row));
    const rows = (state.rewardPool || []).map(row => ({
      ...row,
      finalProbability: row.active && row.valid && Number(totals.get(row.tierCode) || 0) > 0 ? effectiveWeight(row) / Number(totals.get(row.tierCode)) * 100 : 0
    })).sort((a, b) => Number(tierOrder.get(a.tierCode) ?? 999) - Number(tierOrder.get(b.tierCode) ?? 999) || b.finalProbability - a.finalProbability || Number(a.sortOrder || 0) - Number(b.sortOrder || 0));
    const groups = tiers.map(tier => {
      const entries = rows.filter(row => row.tierCode === tier.code && row.finalProbability > 0);
      return { ...tier, count:entries.length, highest:entries[0]?.finalProbability || 0, lowest:entries.at(-1)?.finalProbability || 0 };
    });
    return { rows, groups };
  }
  function probabilitySummary(groups) {
    return groups.map(group => `<article style="--tier-color:${esc(group.color || '#5ed9ce')}"><small>${esc(group.name)} 단계</small><strong>${Number(group.count || 0).toLocaleString()}개 보상</strong><span>최고 ${formatProbability(group.highest)}%</span><em>최저 ${formatProbability(group.lowest)}%</em></article>`).join('');
  }
  function probabilityRows(rows) {
    return rows.map(row => {
      const probability = Number(row.finalProbability || 0), level = probabilityLevel(probability);
      const strength = row.type === 'CARD' ? `기본 ${Number(row.basePower || 0).toLocaleString()} · 고유 ${Number(row.uniqueEffectScore || 0).toLocaleString()}` : row.type === 'ITEM' ? `품질 ${Number(row.strengthScore || 0).toLocaleString()}` : `전투력 ${Number(row.totalPower || 0).toLocaleString()}`;
      return `<tr data-reward-id="${esc(row.rewardId)}" class="probability-${level}"><td><b>${esc((state.settings?.tiers || []).find(tier => tier.code === row.tierCode)?.name || row.tierCode)}</b><small>${esc(row.rewardId)}</small></td><td>${esc(TYPE_LABEL[row.type] || row.type)}<small>${esc(row.rarity || '-')}</small></td><td><b>${esc(row.name)}</b><small>${esc(row.id)} × ${Number(row.quantity || 1)}</small></td><td><b>${esc(strength)}</b><small>보상 강도 지수 ${Number(row.strengthPercent || 0).toFixed(1)} / 100</small></td><td>${Number(row.manualWeight ?? row.weight ?? 0).toLocaleString()}<small>자동 × ${Number(row.autoFactor || 0).toFixed(4)} = ${effectiveWeight(row).toFixed(4)}</small></td><td><div class="alchemy-final-probability"><strong>${formatProbability(probability)}<i>%</i></strong><span><i style="width:${Math.max(0, Math.min(100, probability))}%"></i></span><small>${oneInLabel(probability)} · ${row.valid ? (row.active ? 'ACTIVE' : 'OFF') : 'INVALID'}</small></div></td><td><button type="button" data-reward-edit>편집</button><button type="button" class="danger" data-reward-delete>삭제</button></td></tr>`;
    }).join('') || '<tr><td colspan="7">등록된 보상이 없습니다.</td></tr>';
  }

  function recentRows() {
    return (state.recentRuns || []).map(row => `<tr><td>${esc(row.nickname || `#${row.user_id}`)}</td><td>연금술</td><td>${Number(row.total_value || 0).toLocaleString()}</td><td>${esc(row.tier_code)}</td><td><b class="is-${esc(String(row.status || '').toLowerCase())}">${esc(row.status)}</b></td><td>${esc(row.updated_at || row.created_at || '')}</td></tr>`).join('') || '<tr><td colspan="6">아직 연금 기록이 없습니다.</td></tr>';
  }

  function render() {
    const root = $('#alchemyAdminRoot');
    if (!root || !state) return;
    const settings = state.settings || {}, rules = settings.requirements || {}, scoring = state.scoring || {}, bonuses = scoring.cardGradeBonus || {}, bounds = scoring.equipmentPowerBounds || {}, probability = probabilityModel();
    root.innerHTML = `<section class="alchemy-admin-gate mode-${esc(String(settings.mode || 'OFF').toLowerCase())}"><div><small>LIVE RELEASE GATE</small><h3>현재 공개 상태 <b>${esc(settings.mode || 'OFF')}</b></h3><p>OWNER TEST에서는 전체메뉴와 API가 OWNER 계정에만 열립니다.</p></div><label><span>공개 단계</span><select id="alchemyMode">${modeOptions(settings.mode || 'OFF')}</select></label><label><span>최소 슬롯</span><input id="alchemyMinSlots" type="number" min="3" max="5" value="${Number(rules.minSlots || 3)}"></label><label><span>최대 슬롯</span><input id="alchemyMaxSlots" type="number" min="3" max="5" value="${Number(rules.maxSlots || 5)}"></label><label><span>안정도 보장</span><input id="alchemyStabilityMax" type="number" min="1" max="100" value="${Number(settings.stabilityMax || 10)}"></label><button type="button" id="alchemySettingsSave">운영 설정 저장</button></section>
      <div class="alchemy-admin-warning"><b>고정 안전 규칙</b><span>재료는 미장착 장비와 LIMITED·PRESTIGE·FUR·ZENITH 중복 카드만 허용합니다. 마지막 카드 1장·장착/잠금·배틀슈트·일반 아이템 재료는 서버에서 차단합니다. 이동수단은 보상 전용이며 중복 지급되지 않습니다.</span></div>
      <section class="alchemy-admin-columns"><article class="panel alchemy-admin-formula"><header class="alchemy-admin-heading"><div><small>MATERIAL QUALITY CURVE</small><h3>재료 가치 공식</h3></div><b>SERVER AUTHORITATIVE</b></header><p>장비는 실제 전투력 ${Number(bounds.min || 0).toLocaleString()} ~ ${Number(bounds.max || 0).toLocaleString()} 범위를 로그 정규화해 재료당 ${Number(scoring.equipmentScoreRange?.min || 25)} ~ ${Number(scoring.equipmentScoreRange?.max || 250)}점으로 환산합니다.</p><div class="alchemy-admin-bonus-grid">${['LIMITED','PRESTIGE','FUR','ZENITH'].map(grade => `<span><small>${esc(grade)}</small><b>+${Number(bonuses[grade] || 0).toLocaleString()}</b></span>`).join('')}</div><div class="alchemy-admin-tier-grid">${(settings.tiers || []).map(tier => `<span style="--tier-color:${esc(tier.color)}"><small>${esc(tier.name)}</small><b>${Number(tier.minValue || 0).toLocaleString()}+</b></span>`).join('')}</div><p class="alchemy-admin-formula-note">낮은 전투력 장비는 하위 단계, 높은 전투력 장비와 상위 등급 카드는 상위 단계에 진입합니다. 일반 아이템은 재료로 등록할 수 없습니다.</p></article>
      <article class="panel"><header class="alchemy-admin-heading"><div><small>REWARD POOL</small><h3>보상·가중치 편집</h3></div></header><div class="alchemy-admin-reward-form"><label><span>보상 ID</span><input id="alchemyRewardId" placeholder="비우면 자동 생성"></label><label><span>유형</span><select id="alchemyRewardType">${Object.keys(TYPE_LABEL).map(type => option(type, TYPE_LABEL[type], 'ITEM')).join('')}</select></label><label class="wide"><span>대상</span><select id="alchemyRewardRef">${catalogOptions('ITEM')}</select></label><label><span>단계</span><select id="alchemyRewardTier">${tierOptions(settings.tiers?.[0]?.code)}</select></label><label><span>수량</span><input id="alchemyRewardQuantity" type="number" min="1" max="20" value="1"></label><label><span>CMS 기준 가중치</span><input id="alchemyRewardWeight" type="number" min="0.001" step="0.001" value="10"></label><label><span>정렬</span><input id="alchemyRewardSort" type="number" value="0"></label><label class="alchemy-admin-check"><input id="alchemyRewardActive" type="checkbox" checked><span>활성</span></label><button type="button" id="alchemyRewardSave">보상 저장</button><button type="button" class="ghost" id="alchemyRewardReset">새 보상</button></div></article></section>
      <section class="panel"><header class="alchemy-admin-heading"><div><small>BLACK MIRACLE INVERSE CURVE</small><h3>보상 풀 최종 등장확률</h3></div><small>확률 높은 순 정렬 · 동일 단계 전체 보상 합계 기준</small></header><div class="alchemy-probability-summary">${probabilitySummary(probability.groups)}</div><div class="alchemy-admin-table"><table><thead><tr><th>단계/보상 ID</th><th>유형</th><th>결과</th><th>전투력/효과</th><th>CMS × 자동</th><th>최종 등장확률</th><th>관리</th></tr></thead><tbody>${probabilityRows(probability.rows)}</tbody></table></div></section>
      <section class="panel"><header class="alchemy-admin-heading"><div><small>RECEIPT CONTROL</small><h3>최근 연금 처리</h3></div><button type="button" class="warn" id="alchemyRecoverPending">10분 초과 PENDING 복구</button></header><div class="alchemy-admin-table"><table><thead><tr><th>계정</th><th>구분</th><th>가치</th><th>단계</th><th>상태</th><th>갱신</th></tr></thead><tbody>${recentRows()}</tbody></table></div></section>`;
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
    $('#alchemyRewardQuantity').value = Number(row?.quantity || 1);
    $('#alchemyRewardQuantity').disabled = type === 'VEHICLE';
    $('#alchemyRewardWeight').value = Number(row?.manualWeight ?? row?.weight ?? 10);
    $('#alchemyRewardSort').value = Number(row?.sortOrder || 0);
    $('#alchemyRewardActive').checked = row ? Boolean(row.active) : true;
  }

  function bind() {
    $('#alchemySettingsSave').onclick = event => {
      const mode = $('#alchemyMode').value;
      if (mode === 'PUBLIC' && !confirm('연금술을 전체 유저에게 공개하시겠습니까? 보상 가중치와 지급 대상을 최종 확인하세요.')) return;
      void mutate('SAVE_SETTINGS', { settings:{ mode, requirements:{ minSlots:Number($('#alchemyMinSlots').value), maxSlots:Number($('#alchemyMaxSlots').value), minRare:0 }, stabilityMax:Number($('#alchemyStabilityMax').value) } }, event.currentTarget, '연금술 운영 설정을 저장했습니다.');
    };
    $('#alchemyRewardType').onchange = event => { const vehicle = event.target.value === 'VEHICLE'; $('#alchemyRewardRef').innerHTML = catalogOptions(event.target.value); $('#alchemyRewardQuantity').value = vehicle ? 1 : $('#alchemyRewardQuantity').value; $('#alchemyRewardQuantity').disabled = vehicle; };
    $('#alchemyRewardReset').onclick = () => rewardForm();
    $('#alchemyRewardSave').onclick = event => void mutate('SAVE_REWARD', { reward:{ rewardId:$('#alchemyRewardId').value, type:$('#alchemyRewardType').value, id:$('#alchemyRewardRef').value, tierCode:$('#alchemyRewardTier').value, quantity:Number($('#alchemyRewardQuantity').value), weight:Number($('#alchemyRewardWeight').value), sortOrder:Number($('#alchemyRewardSort').value), active:$('#alchemyRewardActive').checked } }, event.currentTarget, '연금 보상을 저장했습니다.');
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
