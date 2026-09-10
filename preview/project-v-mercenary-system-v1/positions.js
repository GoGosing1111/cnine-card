import {
  POSITIONS, ROLES, TARGETS, DRAFT_STORAGE_KEY, MAX_DRAFT_BYTES,
  cloneDraft, parsePositionDraft, validatePositionDraft, revisePositionDraft,
  summarizePositions, changedAssignments
} from '../../shared/mercenary-position-config-v1.mjs?v=20260911-omega';
import { ROSTER_URL, assetUrl, mediaPath } from '../mercenary-codex-v1/model.js?v=20260911-omega-ranks';
import {MERCENARY_RANKS} from '../../shared/mercenary-ranks-v1.mjs';

const $ = selector => document.querySelector(selector);
const escape = value => String(value ?? '').replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
const state = { roster: null, seed: null, saved: null, draft: null, selected: 'V-021', storageAvailable: true };
const entryFor = code => state.draft.assignments.find(entry => entry.code === code);
const cardFor = code => state.roster.cards.find(card => card.code === code);
const isDirty = () => state.draft && changedAssignments(state.saved, state.draft).length > 0;
const options = (keys, catalog, selected) => keys.map(key => `<option value="${key}"${key === selected ? ' selected' : ''}>${escape(catalog[key].label)}</option>`).join('');

function notice(message, error = false) {
  $('#notice').textContent = message;
  $('#notice').classList.toggle('error', error);
  $('#notice').hidden = !message;
}

function readSaved() {
  const raw = localStorage.getItem(DRAFT_STORAGE_KEY);
  return raw ? parsePositionDraft(raw, state.roster) : cloneDraft(state.seed);
}

function renderState() {
  const changed = changedAssignments(state.saved, state.draft).length;
  const fromSeed = changedAssignments(state.seed, state.draft).length;
  $('#draftState').textContent = `로컬 수정 번호 ${state.saved.revision} · 미저장 ${changed}명 · 기본 제안과 다른 배정 ${fromSeed}명`;
  $('#saveDraft').disabled = !state.storageAvailable || !changed;
}

function renderOverview() {
  const summary = summarizePositions(state.draft);
  $('#rankSummary').innerHTML = [...MERCENARY_RANKS, null].map(rank => `<span><b>${rank || '미정'}</b> ${state.draft.assignments.filter(entry => entry.rank === rank).length}명</span>`).join('');
  $('#positionSummary').innerHTML = Object.entries(POSITIONS).map(([key, value]) => `<button type="button" class="position-item${$('#positionFilter').value === key ? ' active' : ''}" data-position="${key}" aria-pressed="${$('#positionFilter').value === key}"><strong>${summary.positions[key]}</strong><span>${value.label} · ${value.engineRow === 'FRONT' ? '전선 교전' : '전열 뒤 배치'}</span></button>`).join('');
  $('#roleSummary').innerHTML = Object.entries(ROLES).map(([key, value]) => `<button type="button" class="role-card${$('#roleFilter').value === key ? ' active' : ''}" data-role="${key}" aria-pressed="${$('#roleFilter').value === key}"><span class="role-label"><b>${value.label}</b><b class="role-count">${summary.roles[key]}</b></span><small>${value.purpose}</small></button>`).join('');
}

function renderList() {
  const query = $('#search').value.trim().toLocaleLowerCase('ko');
  const position = $('#positionFilter').value;
  const role = $('#roleFilter').value;
  const changed = new Set(changedAssignments(state.seed, state.draft).map(entry => entry.code));
  const rows = state.draft.assignments.filter(entry => {
    const card = cardFor(entry.code);
    return (!position || entry.position === position) && (!role || entry.role === role) &&
      (!query || [card.code, card.name, card.title, card.weapon || '', ROLES[entry.role].label, POSITIONS[entry.position].label, entry.specialty].join(' ').toLocaleLowerCase('ko').includes(query));
  });
  $('#resultCount').textContent = `${rows.length} / ${state.draft.assignments.length}명`;
  $('#rosterList').innerHTML = rows.length ? rows.map(entry => {
    const card = cardFor(entry.code);
    return `<button type="button" class="roster-row" data-code="${entry.code}" aria-pressed="${entry.code === state.selected}" aria-label="${escape(card.code + ' ' + card.name + ' 설정 선택')}"><img class="portrait" src="${assetUrl(mediaPath(card.code))}" alt="" loading="lazy" width="50" height="70"><span><strong class="roster-name">${escape(card.name)}</strong><span class="roster-meta">${card.code} · ${entry.rank ? escape(entry.rank)+(card.rank ? ' 확정' : ' 초안') : '등급 미정'} · ${escape(card.weapon || card.title)}</span></span><span class="assignment-label"><b>${POSITIONS[entry.position].label} / ${ROLES[entry.role].label}</b>${changed.has(entry.code) ? '<span class="changed">기본안에서 변경</span>' : '<span class="roster-meta">제안 배정</span>'}</span></button>`;
  }).join('') : '<p class="empty">조건에 맞는 용병이 없습니다.</p>';
}

function renderDetail() {
  const entry = entryFor(state.selected);
  const card = cardFor(state.selected);
  const role = ROLES[entry.role];
  $('#detail').innerHTML = `<div class="detail-top"><img class="detail-image" src="${assetUrl(mediaPath(card.code, 'art', 320))}" alt="${escape(card.name)} 승인 로스터 원화"><div><span class="eyebrow">${card.code}</span><h3>${escape(card.name)}</h3><p>${escape(card.title)}</p><p>기존 콘셉트: ${escape(card.role)}</p><span class="badge">배정안 검토 중</span></div></div>
    <label>용병 등급${card.rank ? ' · 사용자 확정' : ' · 검토 초안'}<select id="editRank" data-field="rank" ${card.rank ? 'disabled' : ''}><option value=""${entry.rank == null ? ' selected' : ''}>미정</option>${MERCENARY_RANKS.map(rank => `<option value="${rank}"${entry.rank === rank ? ' selected' : ''}>${rank}</option>`).join('')}</select></label>
    <p class="target-help">C → B → A → S → SS → SSS${card.code === 'V-021' ? ' · 오메가-X 최상위 고정' : ' · 저장해도 운영 등급은 바뀌지 않습니다.'}</p>
    ${card.code === 'V-021' ? '<a class="omega-skill-link" href="./skills.html?skill=MS-021">SSS 전용기 · 종언의 사건지평선 검수 →</a>' : ''}
    <div class="field-grid"><label>전투 역할<select id="editRole" data-field="role">${options(Object.keys(ROLES), ROLES, entry.role)}</select></label><label>배치 위치<select id="editPosition" data-field="position">${options(role.positions, POSITIONS, entry.position)}</select></label></div>
    <div class="role-help">${role.purpose}<br>약점: ${role.tradeoff}</div>
    <label>스킬 표적<select id="editTarget" data-field="skillTarget">${options(role.targets, TARGETS, entry.skillTarget)}</select></label><p class="target-help">${TARGETS[entry.skillTarget].description}</p>
    <label>고유 임무 · 스킬 방향<textarea id="editSpecialty" data-field="specialty" maxlength="240" rows="2">${escape(entry.specialty)}</textarea></label>
    <label>명확한 약점<textarea id="editWeakness" data-field="weakness" maxlength="240" rows="2">${escape(entry.weakness)}</textarea></label>
    <label>배정 근거<textarea id="editRationale" data-field="rationale" maxlength="240" rows="3">${escape(entry.rationale)}</textarea></label>
    <button type="button" id="restoreEntry">이 용병의 기본 제안 불러오기</button>
    <div class="fixed-fields"><span>기본 공격: 적 전열 우선</span><span>공식 등급: ${card.rank || '사용자 확정 대기'}</span><span>수치·획득: 미설정</span></div>`;
}

function renderAll() { renderState(); renderOverview(); renderList(); renderDetail(); }

function updateEntry(field, value) {
  const entry = entryFor(state.selected);
  entry[field] = field === 'rank' ? value || null : value;
  if (field === 'role') {
    const role = ROLES[value];
    if (!role.positions.includes(entry.position)) entry.position = role.positions[0];
    if (!role.targets.includes(entry.skillTarget)) entry.skillTarget = role.targets[0];
    notice('역할에 허용된 위치와 스킬 표적을 함께 확인하세요. 고유 임무와 약점 설명도 직접 검토해 주세요.');
  }
  renderState();
  if (field === 'role' || field === 'position' || field === 'rank') { renderOverview(); renderList(); }
  if (['role', 'position', 'skillTarget'].includes(field)) {
    renderDetail();
    $(`#detail [data-field="${field}"]`).focus();
  }
}

function bind() {
  $('#positionFilter').insertAdjacentHTML('beforeend', options(Object.keys(POSITIONS), POSITIONS));
  $('#roleFilter').insertAdjacentHTML('beforeend', options(Object.keys(ROLES), ROLES));
  for (const selector of ['#search', '#positionFilter', '#roleFilter']) $(selector).addEventListener('input', () => { renderList(); renderOverview(); });
  $('#clearFilters').onclick = () => { $('#search').value = ''; $('#positionFilter').value = ''; $('#roleFilter').value = ''; renderList(); renderOverview(); };
  $('#positionSummary').onclick = event => {
    const button = event.target.closest('[data-position]');
    if (!button) return;
    $('#positionFilter').value = $('#positionFilter').value === button.dataset.position ? '' : button.dataset.position;
    renderList(); renderOverview();
    $(`#positionSummary [data-position="${button.dataset.position}"]`).focus();
  };
  $('#roleSummary').onclick = event => {
    const button = event.target.closest('[data-role]');
    if (!button) return;
    $('#roleFilter').value = $('#roleFilter').value === button.dataset.role ? '' : button.dataset.role;
    renderList(); renderOverview();
    $(`#roleSummary [data-role="${button.dataset.role}"]`).focus();
  };
  $('#rosterList').onclick = event => {
    const button = event.target.closest('[data-code]');
    if (!button) return;
    state.selected = button.dataset.code;
    renderList(); renderDetail();
    $(`#rosterList [data-code="${state.selected}"]`).focus({ preventScroll: true });
    if (matchMedia('(max-width:760px)').matches) { $('#detail').scrollIntoView({ behavior: 'smooth', block: 'start' }); $('#editRole').focus({ preventScroll: true }); }
  };
  $('#detail').addEventListener('input', event => {
    const field = event.target.dataset.field;
    if (['specialty', 'weakness', 'rationale'].includes(field)) updateEntry(field, event.target.value);
  });
  $('#detail').addEventListener('change', event => {
    const field = event.target.dataset.field;
    if (['rank', 'position', 'role', 'skillTarget'].includes(field)) updateEntry(field, event.target.value);
  });
  $('#detail').onclick = event => {
    if (!event.target.closest('#restoreEntry')) return;
    Object.assign(entryFor(state.selected), cloneDraft(state.seed.assignments.find(entry => entry.code === state.selected)));
    renderAll(); notice('선택한 용병의 기본 제안을 편집 화면에 불러왔습니다. 저장 전까지 저장본은 유지됩니다.');
    $('#restoreEntry').focus();
  };
  $('#saveDraft').onclick = () => {
    try {
      const current = readSaved();
      const revised = revisePositionDraft(state.draft, current, state.saved.revision, state.roster);
      localStorage.setItem(DRAFT_STORAGE_KEY, JSON.stringify(revised));
      state.saved = revised; state.draft = cloneDraft(revised); renderState();
      notice(`이 브라우저에 초안 ${revised.revision}을 저장했습니다. 운영 서버에는 적용되지 않습니다.`);
    } catch (error) { notice(error.message, true); }
  };
  $('#reloadDraft').onclick = () => {
    if (isDirty() && !window.confirm('저장하지 않은 편집 내용을 버리고 이 브라우저의 저장본을 불러올까요?')) return;
    try { state.saved = readSaved(); state.draft = cloneDraft(state.saved); renderAll(); notice('이 브라우저의 저장본을 불러왔습니다.'); }
    catch (error) { notice(error.message, true); }
  };
  $('#exportDraft').onclick = () => {
    const result = validatePositionDraft(state.draft, state.roster);
    if (!result.ok) { notice(result.errors.map(error => error.message).join('\n'), true); return; }
    const url = URL.createObjectURL(new Blob([JSON.stringify(state.draft, null, 2) + '\n'], { type: 'application/json' }));
    const anchor = document.createElement('a'); anchor.href = url; anchor.download = `mercenary-position-draft-r${state.draft.revision}.json`; anchor.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    notice('현재 편집안을 JSON으로 내보냈습니다. 파일의 수정 번호는 로컬 저장본 기준입니다.');
  };
  $('#importDraft').onchange = async event => {
    const file = event.target.files[0];
    if (!file) return;
    try {
      if (file.size > MAX_DRAFT_BYTES) throw new Error('설정 파일은 128 KB 이하여야 합니다.');
      const imported = parsePositionDraft(await file.text(), state.roster);
      if (isDirty() && !window.confirm('저장하지 않은 편집 내용을 가져온 파일로 바꿀까요?')) return;
      state.draft = { ...imported, revision: state.saved.revision };
      renderAll(); notice('43종 배정안을 가져왔습니다. 검토 후 이 브라우저에 저장하세요.');
    } catch (error) { notice(`가져오기 실패: ${error.message}`, true); }
    finally { event.target.value = ''; }
  };
  addEventListener('storage', event => {
    if (event.key === DRAFT_STORAGE_KEY || event.key === null) notice('다른 탭에서 초안 저장 상태가 변경됐습니다. 현재 편집안을 내보낸 뒤 저장본을 다시 불러오세요.', true);
  });
  addEventListener('beforeunload', event => { if (isDirty()) { event.preventDefault(); event.returnValue = ''; } });
}

async function boot() {
  try {
    const responses = await Promise.all([fetch(ROSTER_URL, { cache: 'no-store' }), fetch(new URL('./position-draft-v1.json', import.meta.url), { cache: 'no-store' })]);
    if (responses.some(response => !response.ok)) throw new Error('기준 로스터 또는 배정안을 불러오지 못했습니다.');
    state.roster = await responses[0].json();
    state.seed = parsePositionDraft(await responses[1].text(), state.roster);
    try { state.saved = readSaved(); }
    catch (error) { state.saved = cloneDraft(state.seed); state.storageAvailable = false; notice(`저장본을 읽지 못해 기본 제안을 표시합니다. 기존 저장본은 보존되며 JSON 내보내기를 사용할 수 있습니다. ${error.message}`, true); }
    state.draft = cloneDraft(state.saved);
    bind();
    for (const selector of ['#reloadDraft', '#exportDraft', '#importDraft']) $(selector).disabled = false;
    renderAll();
    document.body.dataset.ready = 'true';
  } catch (error) { notice(error.message, true); $('#draftState').textContent = '초안을 불러오지 못했습니다.'; }
}
boot();
