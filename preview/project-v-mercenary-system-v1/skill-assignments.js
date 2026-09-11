import {MERCENARY_SKILLS, SKILL_STORAGE_KEY, parseSkillDraft} from '../../shared/mercenary-skills-v1.mjs?v=20260911-library';
import {ROLES} from '../../shared/mercenary-position-config-v1.mjs?v=20260911-library';
import {ASSIGNMENT_STORAGE_KEY, MAX_ASSIGNMENT_BYTES, createSkillAssignments, parseSkillAssignments,
  validateSkillAssignments, reviseSkillAssignments} from '../../shared/mercenary-skill-assignments-v1.mjs?v=20260911-library';
import {ROSTER_URL} from '../mercenary-codex-v1/model.js?v=20260911-omega-ranks';

const $ = id => document.getElementById(id);
const esc = value => String(value ?? '').replace(/[&<>"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
const clone = value => JSON.parse(JSON.stringify(value));
const fingerprint = draft => JSON.stringify(draft.assignments.map(row => [row.code, [...row.skillIds].sort()]).sort((a,b)=>a[0].localeCompare(b[0])));
let roster, manifest, draft, saved, expectedRevision = null, selectedCode = 'V-001';
let names = new Map(MERCENARY_SKILLS.map(skill => [skill.id, skill.name]));
const entry = code => draft.assignments.find(row => row.code === code);
const dirty = () => draft && saved && fingerprint(draft) !== fingerprint(saved);
const notice = (message, error = false) => {$('assignmentNotice').textContent = message; $('assignmentNotice').classList.toggle('error', error);};
const readStored = () => {const text = localStorage.getItem(ASSIGNMENT_STORAGE_KEY); return text ? parseSkillAssignments(text, roster) : null;};

function overview() {
  const changed = dirty();
  $('assignedMercenaries').textContent = draft.assignments.filter(row => row.skillIds.length).length;
  $('assignmentCount').textContent = draft.assignments.reduce((sum, row) => sum + row.skillIds.length, 0);
  $('assignmentState').textContent = `배정 수정 ${draft.revision} · ${changed ? '저장 전 변경 있음' : '브라우저 초안'}`;
  $('selectedSkillCount').textContent = `${entry(selectedCode).skillIds.length}개 선택`;
}
function mercenaries() {
  const left = $('mercenaryList').scrollLeft, top = $('mercenaryList').scrollTop;
  const query = $('mercenarySearch').value.trim().toLocaleLowerCase();
  const cards = roster.cards.filter(card => `${card.code} ${card.name} ${card.weapon || ''} ${card.title}`.toLocaleLowerCase().includes(query));
  $('mercenaryCount').textContent = `${cards.length} / ${roster.cards.length}종`;
  $('mercenaryList').innerHTML = cards.map(card => `<button type="button" class="skill-row assignment-row" data-mercenary="${card.code}" aria-pressed="${card.code === selectedCode}"><img loading="lazy" src="/assets/ui/project-v/mercenaries/codex-v1/${card.code.toLowerCase()}-art-320.webp" alt=""><span><strong>${esc(card.name)}</strong><small>${card.code} · ${card.rank || '등급 미정'}</small><em>${entry(card.code).skillIds.length ? `${entry(card.code).skillIds.length}개 선택` : '미배정'}</em></span></button>`).join('') || '<p class="empty">검색 결과가 없습니다.</p>';
  $('mercenaryList').scrollLeft = left; $('mercenaryList').scrollTop = top;
}
function choices() {
  const query = $('assignmentSkillSearch').value.trim().toLocaleLowerCase();
  const selected = new Set(entry(selectedCode).skillIds);
  const skills = MERCENARY_SKILLS.filter(skill => `${skill.id} ${names.get(skill.id)} ${skill.effect} ${ROLES[skill.role].label}`.toLocaleLowerCase().includes(query)).sort((a,b)=>a.id.localeCompare(b.id));
  $('assignmentSkills').innerHTML = skills.map(skill => {
    const frame = manifest.images.find(image => image.skillId === skill.id).frames[4].file;
    return `<article class="skill-choice${selected.has(skill.id) ? ' selected' : ''}"><label><input type="checkbox" data-skill="${skill.id}" ${selected.has(skill.id) ? 'checked' : ''}><img loading="lazy" src="./skill-assets-v2/${frame}" alt=""><span><strong>${esc(names.get(skill.id))}</strong><small>${skill.id} · ${ROLES[skill.role].label} 효과</small></span></label><p>${esc(skill.effect)}</p><a href="./skills.html?skill=${skill.id}" target="_blank" rel="noopener">스킬 시연 보기 ↗</a></article>`;
  }).join('') || '<p class="empty">검색 결과가 없습니다. 전체 스킬을 눌러 목록을 확인하세요.</p>';
}
function detail() {
  const card = roster.cards.find(card => card.code === selectedCode);
  $('selectedCode').textContent = card.code; $('selectedName').textContent = card.name;
  $('selectedInfo').textContent = `${card.rank || '등급 미정'} · ${card.weapon || card.title}`;
  $('selectedArt').src = `/assets/ui/project-v/mercenaries/codex-v1/${card.code.toLowerCase()}-art-320.webp`;
  $('selectedArt').alt = `${card.name} 카드 원화`; $('selectedArt').hidden = false;
  overview(); choices();
}
function render() {mercenaries(); detail();}
function save() {
  try {
    const checked = reviseSkillAssignments(draft, readStored(), expectedRevision, roster);
    localStorage.setItem(ASSIGNMENT_STORAGE_KEY, JSON.stringify(checked));
    draft = checked; saved = clone(checked); expectedRevision = checked.revision; overview();
    notice('직접 선택한 용병·스킬 배정을 이 브라우저에 저장했습니다.');
  } catch (error) {notice(error.message, true);}
}
function load() {
  try {
    const stored = readStored();
    if (!stored) throw new Error('저장된 배정 초안이 없습니다.');
    if (dirty() && !confirm('저장하지 않은 배정 변경을 저장본으로 바꿀까요?')) return;
    draft = stored; saved = clone(stored); expectedRevision = stored.revision; render(); notice('배정 저장본을 불러왔습니다.');
  } catch (error) {notice(error.message, true);}
}
function exportDraft() {
  try {
    const checked = validateSkillAssignments(draft, roster);
    const url = URL.createObjectURL(new Blob([JSON.stringify(checked, null, 2) + '\n'], {type:'application/json'}));
    const anchor = document.createElement('a'); anchor.href = url; anchor.download = `mercenary-skill-assignments-r${checked.revision}.json`; anchor.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000); notice('스킬 검토 의견과 분리된 배정 JSON을 내보냈습니다.');
  } catch (error) {notice(error.message, true);}
}
function bind() {
  $('mercenarySearch').addEventListener('input', mercenaries);
  $('assignmentSkillSearch').addEventListener('input', choices);
  $('clearSkillSearch').addEventListener('click', () => {$('assignmentSkillSearch').value = ''; choices();});
  $('mercenaryList').addEventListener('click', event => {
    const button = event.target.closest('[data-mercenary]'); if (!button) return;
    selectedCode = button.dataset.mercenary;
    const url = new URL(location.href); url.searchParams.set('mercenary', selectedCode); history.replaceState(null, '', url);
    render();
  });
  $('assignmentSkills').addEventListener('change', event => {
    const {skill} = event.target.dataset; if (!skill || event.target.type !== 'checkbox') return;
    const row = entry(selectedCode), ids = new Set(row.skillIds);
    event.target.checked ? ids.add(skill) : ids.delete(skill); row.skillIds = [...ids].sort();
    event.target.closest('.skill-choice').classList.toggle('selected', event.target.checked); overview(); mercenaries();
  });
  $('saveAssignments').addEventListener('click', save); $('reloadAssignments').addEventListener('click', load); $('exportAssignments').addEventListener('click', exportDraft);
  $('importAssignments').addEventListener('change', async event => {
    try {
      const file = event.target.files[0]; if (!file) return;
      if (file.size > MAX_ASSIGNMENT_BYTES) throw new Error('배정 파일은 64 KB 이하여야 합니다.');
      const incoming = parseSkillAssignments(await file.text(), roster);
      if (dirty() && !confirm('저장하지 않은 배정 변경을 가져온 파일로 바꿀까요?')) return;
      draft = {...incoming, revision: saved.revision}; render(); notice('배정 초안을 가져왔습니다. 검토 후 저장하세요.');
    } catch (error) {notice(error.message, true);} finally {event.target.value = '';}
  });
  addEventListener('storage', event => {if (event.key === ASSIGNMENT_STORAGE_KEY || event.key === null) notice('다른 탭에서 배정 저장본이 바뀌었습니다. 현재 초안을 내보낸 뒤 저장본을 불러오세요.', true);});
  addEventListener('beforeunload', event => {if (dirty()) {event.preventDefault(); event.returnValue = '';}});
}
async function boot() {
  try {
    const responses = await Promise.all([fetch(ROSTER_URL, {cache:'no-store'}), fetch('./skill-assets-v2/manifest.json?v=20260911-library', {cache:'no-store'})]);
    if (responses.some(response => !response.ok)) throw new Error('용병 또는 스킬 목록을 불러오지 못했습니다.');
    [roster, manifest] = await Promise.all(responses.map(response => response.json()));
    draft = createSkillAssignments(roster);
    try {const stored = readStored(); if (stored) {draft = stored; expectedRevision = stored.revision;}} catch (error) {notice(`기존 저장본은 보존됩니다. ${error.message}`, true);}
    saved = clone(draft);
    try {const text = localStorage.getItem(SKILL_STORAGE_KEY); if (text) names = new Map(parseSkillDraft(text).skills.map(skill => [skill.id, skill.name]));} catch {notice('스킬 이름 검토본을 읽지 못해 기본 이름으로 표시합니다. 배정 초안과 원본 메모는 보존됩니다.', true);}
    const params = new URL(location.href).searchParams;
    if (roster.cards.some(card => card.code === params.get('mercenary'))) selectedCode = params.get('mercenary');
    if (MERCENARY_SKILLS.some(skill => skill.id === params.get('skill'))) $('assignmentSkillSearch').value = params.get('skill');
    bind(); render(); for (const control of document.querySelectorAll('input:disabled,button:disabled')) control.disabled = false;
    document.body.dataset.ready = 'true';
  } catch (error) {notice(error.message, true); $('assignmentState').textContent = '배정 목록 준비 실패';}
}
boot();
