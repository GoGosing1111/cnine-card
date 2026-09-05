import { STREAMER_LIMIT, validateStreamerSettings, profileImageUrl, stationUrl } from '../js/streamer-lounge-model-v2036.js?v=2036';
const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
let settings = null, revision = '', busy = false, loaded = false, panel = null, notice = '';
async function api(options = {}) {
  const token = localStorage.getItem('cnine_admin_token') || sessionStorage.getItem('cnine_admin_token') || '';
  const controller = new AbortController(), timer = setTimeout(() => controller.abort(), 15000);
  try {
    const response = await fetch('../api/admin/streamer-profiles', { ...options, signal: controller.signal, cache: 'no-store', headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` } });
    const payload = await response.json();
    if (!response.ok) throw new Error(payload.error || `요청 실패 (${response.status})`);
    return payload;
  } finally { clearTimeout(timer); }
}
function rowHtml(row, index) {
  const image = profileImageUrl(row.imageUrl), station = stationUrl(row.stationUrl);
  return `<article class="sl36-admin-row" data-sl36-row="${index}"><header><b>${String(index + 1).padStart(2, '0')}</b><span class="sl36-admin-avatar">${image ? `<img src="${esc(image)}" alt="${esc(row.name)} 프로필" width="42" height="42" referrerpolicy="no-referrer">` : esc(Array.from(row.name || '?')[0])}</span><strong>${esc(row.name || '새 스트리머')}</strong><label class="sl36-admin-visible"><input type="checkbox" data-field="visible" ${row.visible ? 'checked' : ''}> 로비 노출</label><div class="sl36-admin-order"><button type="button" data-move="${index}:up" ${index === 0 ? 'disabled' : ''} aria-label="${esc(row.name)} 위로">↑</button><button type="button" data-move="${index}:down" ${index === settings.profiles.length - 1 ? 'disabled' : ''} aria-label="${esc(row.name)} 아래로">↓</button><button type="button" data-remove="${index}" aria-label="${esc(row.name)} 등록 삭제">삭제</button></div></header>
    <div class="sl36-admin-fields"><label>표시 이름<input data-field="name" maxlength="30" value="${esc(row.name)}" required></label><label>SOOP 방송국 주소<input data-field="stationUrl" type="url" maxlength="200" placeholder="https://www.sooplive.com/station/아이디" value="${esc(row.stationUrl)}" required></label><label class="sl36-admin-wide">프로필 이미지 주소<input data-field="imageUrl" maxlength="500" placeholder="/assets/... 또는 https://... (비우면 이름 첫 글자 표시)" value="${esc(row.imageUrl)}"></label><label class="sl36-admin-wide">짧은 소개<textarea data-field="description" maxlength="160" rows="2" placeholder="비워 두면 기본 소개가 표시됩니다.">${esc(row.description)}</textarea></label></div>
    <footer><span>등록 ID · ${esc(row.id)}</span>${station ? `<a href="${esc(station)}" target="_blank" rel="noopener noreferrer">방송국 확인 ↗</a>` : '<span>방송국 주소를 입력하세요.</span>'}</footer></article>`;
}
function readInputs() {
  if (!settings) return;
  settings.enabled = panel.querySelector('[data-sl36-enabled]')?.checked === true;
  panel.querySelectorAll('[data-sl36-row]').forEach(node => {
    const row = settings.profiles[Number(node.dataset.sl36Row)];
    for (const input of node.querySelectorAll('[data-field]')) row[input.dataset.field] = input.type === 'checkbox' ? input.checked : input.value.trim();
  });
}
function render() {
  if (!panel) return;
  panel.innerHTML = `<header class="sl36-admin-head"><div><small>LOBBY / STREAMER LOUNGE</small><h2>스트리머 라운지</h2><p>로비의 전용 진입 카드와 라운지 프로필을 관리합니다. 저장하면 재배포 없이 로비 재진입 또는 약 1분 내에 반영됩니다.</p></div><span>최대 ${STREAMER_LIMIT}명</span></header>
    <p class="sl36-admin-notice" role="status">${esc(notice || '실제 방송 여부는 연동하지 않습니다. LIVE 표시는 사용하지 않습니다.')}</p>
    ${settings ? `<form data-sl36-form><fieldset ${busy ? 'disabled' : ''}><div class="sl36-admin-toolbar"><label><input type="checkbox" data-sl36-enabled ${settings.enabled ? 'checked' : ''}> 라운지 사용</label><b>${settings.profiles.filter(row => row.visible).length}명 노출 / ${settings.profiles.length}명 등록</b></div><div class="sl36-admin-list">${settings.profiles.map(rowHtml).join('') || '<p>등록된 스트리머가 없습니다. 아래 버튼으로 추가하세요.</p>'}</div><div class="sl36-admin-actions"><button type="button" data-sl36-add ${settings.profiles.length >= STREAMER_LIMIT ? 'disabled' : ''}>＋ 스트리머 추가</button><button type="button" class="ghost" data-sl36-reload>다시 불러오기</button><button type="submit" data-sl36-save>${busy ? '저장 중…' : '라운지 설정 저장'}</button></div></fieldset></form>` : `<button type="button" data-sl36-reload ${busy ? 'disabled' : ''}>${busy ? '불러오는 중…' : '다시 확인'}</button>`}`;
  panel.querySelector('[data-sl36-form]')?.addEventListener('submit', save);
  panel.querySelector('[data-sl36-reload]')?.addEventListener('click', () => { if (!settings || confirm('저장하지 않은 변경을 버리고 다시 불러올까요?')) void load(); });
  panel.querySelector('[data-sl36-add]')?.addEventListener('click', () => {
    readInputs(); if (settings.profiles.length >= STREAMER_LIMIT) return;
    settings.profiles.push({ id: `streamer-${crypto.randomUUID()}`, name: '', stationUrl: '', imageUrl: '', description: '', visible: true });
    notice = '새 스트리머의 이름과 방송국 주소를 입력한 뒤 저장하세요.'; render();
    panel.querySelector('[data-sl36-row]:last-child input[data-field="name"]')?.focus();
  });
  panel.querySelectorAll('[data-move]').forEach(button => button.addEventListener('click', () => {
    readInputs(); const [rawIndex, direction] = button.dataset.move.split(':'), index = Number(rawIndex), other = index + (direction === 'up' ? -1 : 1);
    if (other < 0 || other >= settings.profiles.length) return;
    [settings.profiles[index], settings.profiles[other]] = [settings.profiles[other], settings.profiles[index]];
    notice = '노출 순서를 변경했습니다. 저장 버튼을 눌러 반영하세요.'; render();
  }));
  panel.querySelectorAll('[data-remove]').forEach(button => button.addEventListener('click', () => {
    readInputs(); const index = Number(button.dataset.remove);
    if (!confirm(`${settings.profiles[index].name || '새 스트리머'} 등록을 삭제할까요? 저장하기 전까지는 게임에 반영되지 않습니다.`)) return;
    settings.profiles.splice(index, 1); notice = '목록에서 제거했습니다. 저장 버튼을 눌러 반영하세요.'; render();
  }));
  panel.querySelectorAll('img').forEach(img => { img.addEventListener('error', () => img.replaceWith(document.createTextNode('사진 없음')), { once: true }); });
}
async function load() {
  if (busy) return; busy = true; notice = '설정을 불러오고 있습니다.'; render();
  try { const result = await api(); settings = validateStreamerSettings(result.settings); revision = result.revision; loaded = true; notice = '현재 설정을 불러왔습니다. 사진·소개·순서·노출 여부를 수정할 수 있습니다.'; }
  catch (error) { notice = error.name === 'AbortError' ? '설정 확인이 지연되고 있습니다. 다시 확인해 주세요.' : error.message; }
  finally { busy = false; render(); }
}
async function save(event) {
  event.preventDefault(); if (busy) return;
  readInputs();
  try { settings = validateStreamerSettings(settings); }
  catch (error) { notice = error.message; render(); return; }
  busy = true; notice = '설정을 저장하고 있습니다.'; render();
  try {
    const result = await api({ method: 'PATCH', body: JSON.stringify({ settings, expectedRevision: revision }) });
    settings = validateStreamerSettings(result.settings); revision = result.revision;
    notice = `저장 완료 · ${settings.enabled ? `${settings.profiles.filter(row => row.visible).length}명 노출` : '라운지 숨김'} · 로비 재진입 또는 약 1분 내에 반영됩니다.`;
  } catch (error) { notice = error.name === 'AbortError' ? '저장 결과 확인이 지연됩니다. 다시 불러와 반영 여부를 확인하세요.' : error.message; }
  finally { busy = false; render(); }
}
function start() {
  const view = document.getElementById('view-settings'); if (!view) return;
  panel = document.createElement('section'); panel.id = 'streamerLoungeAdminV2036'; panel.className = 'panel sl36-admin'; view.prepend(panel);
  render();
  const ensure = () => { if (!view.hidden && !loaded && !busy) void load(); };
  new MutationObserver(ensure).observe(view, { attributes: true, attributeFilter: ['hidden'] }); ensure();
}
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start, { once: true }); else start();
