/* =============================================================
   V1803 · 메인 로비 BGM 운영 패널
   -------------------------------------------------------------
   설정 화면(#view-settings)에 스스로 붙는다. 저장하면 app_meta 에 들어가고
   user/runtime-command 응답(45초 주기)을 타고 접속자 전원에게 퍼진다.
   재배포 없이 곡을 바꿀 수 있다.

   음원 주소는 서버에서 /assets/... 상대경로와 https:// 만 허용한다.
   ============================================================= */
(() => {
  'use strict';
  const $ = s => document.querySelector(s);
  const PANEL_ID = 'lobbyBgmAdminPanelV1803';
  const token = () => localStorage.getItem('cnine_admin_token') || sessionStorage.getItem('cnine_admin_token') || '';
  const esc = s => String(s ?? '').replace(/[&<>"']/g, m => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[m]));

  async function api(path, opt = {}) {
    const r = await fetch('../api/' + path, {
      ...opt,
      headers: { 'content-type': 'application/json', authorization: 'Bearer ' + token(), ...(opt.headers || {}) },
      cache: 'no-store'
    });
    const d = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(d.error || `요청 실패 (${r.status})`);
    return d;
  }

  // 서버 cleanLobbyBgmTrackUrl 과 같은 규칙. 공백·한글 파일명을 그대로 두면 요청이 깨진다.
  function encodeTrackUrl(value) {
    const raw = String(value || '').trim().replace(/\\/g, '/');
    const encodePath = path => String(path || '').split('/').map(seg => {
      if (!seg) return seg;
      if (/%[0-9a-fA-F]{2}/.test(seg)) return seg;
      try { return encodeURIComponent(decodeURIComponent(seg)) } catch { return encodeURIComponent(seg) }
    }).join('/');
    if (/^https:\/\//i.test(raw)) {
      try { const u = new URL(raw); u.pathname = encodePath(u.pathname); return u.toString() } catch { return raw }
    }
    const absolute = raw.startsWith('/') ? raw : `/${raw}`;
    const [pathPart, queryPart] = absolute.split(/([?#].*)$/);
    return encodePath(pathPart) + (queryPart || '');
  }

  let state = { enabled: false, volumePercent: 35, loopPlaylist: true, tracks: [] };

  function panel() {
    let box = document.getElementById(PANEL_ID);
    if (box) return box;
    const host = $('#view-settings');
    if (!host) return null;
    box = document.createElement('div');
    box.id = PANEL_ID;
    box.className = 'panel';
    host.appendChild(box);
    return box;
  }

  function trackRow(track, index, total) {
    return `<div class="row" data-bgm-row="${index}" style="align-items:center;gap:8px;flex-wrap:wrap">
      <span style="min-width:26px;font-weight:800;opacity:.7">${index + 1}</span>
      <input data-bgm-title="${index}" value="${esc(track.title || '')}" placeholder="곡 제목 (선택)" maxlength="60" style="flex:0 0 180px">
      <input data-bgm-url="${index}" value="${esc(track.url || '')}" placeholder="/assets/bgm/lobby-01.mp3 또는 https://..." maxlength="500" style="flex:1 1 320px">
      <button type="button" class="btn ghost" data-bgm-up="${index}" ${index === 0 ? 'disabled' : ''} title="위로">▲</button>
      <button type="button" class="btn ghost" data-bgm-down="${index}" ${index === total - 1 ? 'disabled' : ''} title="아래로">▼</button>
      <button type="button" class="btn ghost" data-bgm-play="${index}" title="미리듣기">▶</button>
      <button type="button" class="btn danger" data-bgm-remove="${index}" title="삭제">✕</button>
    </div>`;
  }

  function render() {
    const box = panel();
    if (!box) return;
    const tracks = state.tracks || [];
    const warn = state.enabled && !tracks.length
      ? '<p style="color:#ff9b6b;font-weight:800">⚠ 곡이 없으면 켤 수 없습니다. 아래에서 한 개 이상 등록하세요.</p>' : '';
    box.innerHTML = `<div class="maintenanceHead"><div><small>MAIN LOBBY BGM</small><h2>메인 로비 배경음</h2>
        <p>로비 화면에서만 재생되고, 다른 화면으로 넘어가면 즉시 끊깁니다. 유저는 로비의 음악 버튼으로 끌 수 있고 그 선택은 기기에 기억됩니다.</p>
        <p style="opacity:.75">저장하면 재배포 없이 최대 45초 안에 접속자 전원에게 반영됩니다. 음원 주소는 <b>/assets/...</b> 상대경로 또는 <b>https://</b> 만 허용합니다.</p>
        <p style="opacity:.75">음원 파일 자체는 <b>git push → 배포가 끝난 뒤</b>에 재생됩니다. 공백·한글 파일명은 자동으로 인코딩되지만, <b>영문·숫자·하이픈</b> 이름을 권합니다. 용량 때문에 <b>.wav 보다 .mp3</b> 를 쓰세요(같은 곡이 10분의 1 이하).</p>${warn}</div></div>
      <div class="enhancementRows" style="margin-top:0">
        <div class="enhancementRow" style="grid-template-columns:repeat(auto-fit,minmax(180px,1fr));align-items:end">
          <div><small>운영 상태</small>
            <select id="lobbyBgmEnabled"><option value="1"${state.enabled ? ' selected' : ''}>켜짐</option><option value="0"${state.enabled ? '' : ' selected'}>꺼짐</option></select></div>
          <div><small>기본 볼륨 (%)</small>
            <input id="lobbyBgmVolume" type="number" min="0" max="100" step="1" value="${Number(state.volumePercent || 0)}"></div>
          <div><small>목록 끝에서</small>
            <select id="lobbyBgmLoop"><option value="1"${state.loopPlaylist !== false ? ' selected' : ''}>처음으로 돌아가 반복</option><option value="0"${state.loopPlaylist === false ? ' selected' : ''}>재생 종료</option></select></div>
          <div><small>등록된 곡</small><b>${tracks.length}곡 / 최대 20곡</b></div>
        </div>
      </div>
      <div id="lobbyBgmTracks" style="display:flex;flex-direction:column;gap:6px;margin-top:10px">
        ${tracks.length ? tracks.map((t, i) => trackRow(t, i, tracks.length)).join('') : '<p style="opacity:.7">등록된 곡이 없습니다. 아래 “곡 추가”로 시작하세요.</p>'}
      </div>
      <div style="display:flex;gap:8px;margin-top:12px;flex-wrap:wrap">
        <button type="button" class="btn secondary" id="lobbyBgmAdd" ${tracks.length >= 20 ? 'disabled' : ''}>곡 추가</button>
        <button type="button" class="btn" id="lobbyBgmSave">저장</button>
        <button type="button" class="btn ghost" id="lobbyBgmReload">되돌리기</button>
        <audio id="lobbyBgmPreview" style="display:none"></audio>
      </div>`;
    bind(box);
  }

  function readInputs() {
    const box = document.getElementById(PANEL_ID);
    if (!box) return;
    state.enabled = box.querySelector('#lobbyBgmEnabled')?.value === '1';
    state.volumePercent = Math.max(0, Math.min(100, Number(box.querySelector('#lobbyBgmVolume')?.value) || 0));
    state.loopPlaylist = box.querySelector('#lobbyBgmLoop')?.value !== '0';
    state.tracks = (state.tracks || []).map((t, i) => ({
      title: box.querySelector(`[data-bgm-title="${i}"]`)?.value?.trim() || '',
      url: box.querySelector(`[data-bgm-url="${i}"]`)?.value?.trim() || ''
    }));
  }

  function bind(box) {
    box.querySelector('#lobbyBgmAdd')?.addEventListener('click', () => {
      readInputs();
      if (state.tracks.length >= 20) return;
      state.tracks.push({ title: '', url: '' });
      render();
    });
    box.querySelector('#lobbyBgmReload')?.addEventListener('click', () => { void load() });
    box.querySelector('#lobbyBgmSave')?.addEventListener('click', save);
    box.querySelectorAll('[data-bgm-remove]').forEach(button => button.addEventListener('click', () => {
      readInputs();
      state.tracks.splice(Number(button.dataset.bgmRemove), 1);
      render();
    }));
    box.querySelectorAll('[data-bgm-up]').forEach(button => button.addEventListener('click', () => {
      readInputs();
      const i = Number(button.dataset.bgmUp);
      if (i <= 0) return;
      [state.tracks[i - 1], state.tracks[i]] = [state.tracks[i], state.tracks[i - 1]];
      render();
    }));
    box.querySelectorAll('[data-bgm-down]').forEach(button => button.addEventListener('click', () => {
      readInputs();
      const i = Number(button.dataset.bgmDown);
      if (i >= state.tracks.length - 1) return;
      [state.tracks[i + 1], state.tracks[i]] = [state.tracks[i], state.tracks[i + 1]];
      render();
    }));
    box.querySelectorAll('[data-bgm-play]').forEach(button => button.addEventListener('click', () => {
      readInputs();
      const track = state.tracks[Number(button.dataset.bgmPlay)];
      const player = box.querySelector('#lobbyBgmPreview');
      if (!player) return;
      if (!track?.url) return alert('먼저 음원 주소를 입력하세요.');
      if (!player.paused && player.getAttribute('src') === track.url) { player.pause(); button.textContent = '▶'; return }
      const src = encodeTrackUrl(track.url);
      player.setAttribute('src', src);
      player.volume = Math.max(0, Math.min(1, Number(state.volumePercent || 0) / 100));
      player.play().then(() => {
        box.querySelectorAll('[data-bgm-play]').forEach(other => { other.textContent = '▶' });
        button.textContent = '❚❚';
      }).catch(async () => {
        // 파일이 아직 배포되지 않은 경우와 형식 문제를 구분해서 알려준다.
        let hint = '';
        try {
          const head = await fetch(src, { method: 'HEAD', cache: 'no-store' });
          hint = head.ok
            ? `파일은 있지만 브라우저가 재생하지 못했습니다. (Content-Type: ${head.headers.get('content-type') || '알 수 없음'})\n확장자가 .wav 라면 .mp3 로 변환해보세요.`
            : `이 주소에 파일이 없습니다 (HTTP ${head.status}).\n아직 배포하지 않았다면 git push 후 배포가 끝난 뒤 다시 시도하세요.`;
        } catch { hint = '주소에 접근할 수 없습니다. 배포 여부와 경로를 확인하세요.' }
        alert(`재생할 수 없습니다.\n${src}\n\n${hint}`);
      });
    }));
  }

  async function load() {
    const box = panel();
    if (!box) return;
    try {
      const d = await api('admin/lobby-bgm');
      state = {
        enabled: d.settings?.enabled === true,
        volumePercent: Number(d.settings?.volumePercent ?? 35),
        loopPlaylist: d.settings?.loopPlaylist !== false,
        tracks: Array.isArray(d.settings?.tracks) ? d.settings.tracks.map(t => ({ title: String(t?.title || ''), url: String(t?.url || '') })) : []
      };
      render();
    } catch (error) {
      box.innerHTML = `<div class="maintenanceHead"><div><small>MAIN LOBBY BGM</small><h2>메인 로비 배경음</h2>
        <p style="color:#ff9b6b">설정을 불러오지 못했습니다: ${esc(error.message || '')}</p></div></div>`;
    }
  }

  async function save() {
    readInputs();
    const button = document.getElementById('lobbyBgmSave');
    const empty = state.tracks.filter(t => !t.url).length;
    if (empty) return alert(`음원 주소가 비어 있는 줄이 ${empty}개 있습니다. 채우거나 삭제해주세요.`);
    if (state.enabled && !state.tracks.length) return alert('곡을 한 개 이상 등록해야 켤 수 있습니다.');
    if (button) { button.disabled = true; button.textContent = '저장 중...' }
    try {
      const d = await api('admin/lobby-bgm', { method: 'PATCH', body: JSON.stringify({ settings: state }) });
      state = {
        enabled: d.settings?.enabled === true,
        volumePercent: Number(d.settings?.volumePercent ?? 35),
        loopPlaylist: d.settings?.loopPlaylist !== false,
        tracks: Array.isArray(d.settings?.tracks) ? d.settings.tracks : []
      };
      render();
      alert(state.enabled
        ? `로비 BGM 저장 완료 — ${state.tracks.length}곡, 볼륨 ${state.volumePercent}%\n접속자에게는 최대 45초 안에 반영됩니다.`
        : '로비 BGM 을 꺼진 상태로 저장했습니다.');
    } catch (error) {
      alert(`저장하지 못했습니다.\n${error.message || ''}`);
      if (button) { button.disabled = false; button.textContent = '저장' }
    }
  }

  document.addEventListener('DOMContentLoaded', () => {
    const view = document.getElementById('view-settings');
    if (!view) return;
    let loaded = false;
    const ensure = () => { if (loaded || view.hidden) return; loaded = true; void load() };
    // 관리자 화면은 show(view) 가 .view 요소의 hidden 속성만 토글한다.
    // 그 변화를 직접 지켜보면 진입 경로(내비 클릭·딥링크)에 상관없이 한 번만 불러온다.
    new MutationObserver(ensure).observe(view, { attributes: true, attributeFilter: ['hidden'] });
    ensure();
  });

  window.loadLobbyBgmAdmin = load;
})();
