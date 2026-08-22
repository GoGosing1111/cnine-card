/* =============================================================
   V1803 · 메인 로비 BGM
   -------------------------------------------------------------
   경매장(js/auction-house-v1553.js)의 오디오 처리 방식을 그대로 따른다.
     · 브라우저는 사용자 조작 없이 소리를 못 낸다. 무음 WAV 데이터URI 를
       한 번 재생해 잠금을 풀고, 그 사이 들어온 재생 요청은 pendingPlay 에
       모아 두었다가 잠금이 풀리는 즉시 실행한다.
     · iOS 는 playsinline 속성이 없으면 전체화면 플레이어를 띄운다.
     · 화면을 벗어나면 pause 로 끝내지 않고 src 까지 비운다.
       그래야 백그라운드 디코딩과 네트워크가 실제로 멈춘다.

   곡 목록·볼륨·on/off 는 CMS 가 단일 출처다. user/runtime-command 응답에
   실려 오므로 이 파일은 요청을 직접 만들지 않는다. 첫 폴링 전에도 소리가
   나도록 마지막 설정을 localStorage 에 캐시해 둔다.

   로비를 벗어나면 재생이 끊긴다 — renderShell(tab) 이 home 이 아닐 때
   stop() 을 부른다.
   ============================================================= */
(() => {
  'use strict';

  const MUTE_KEY = 'soop-lobby-bgm-muted-v1';
  const CACHE_KEY = 'soop-lobby-bgm-settings-v1';
  const BUTTON_ID = 'lobbyBgmToggleV1803';
  const STYLE_ID = 'lobbyBgmStyleV1803';
  // 1프레임짜리 무음 WAV. 오토플레이 잠금 해제 전용이다.
  const SILENT = 'data:audio/wav;base64,UklGRigAAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQQAAACAgICA';

  const DEFAULTS = { enabled: false, volumePercent: 35, loopPlaylist: true, tracks: [] };

  let settings = readCachedSettings();
  let audio = null;
  let unlocked = false;
  let pendingPlay = null;
  let active = false;
  let trackIndex = 0;
  let consecutiveErrors = 0;
  let guardTimer = null;

  // ── 저장소 ────────────────────────────────────────────────
  function isMuted() {
    try { return localStorage.getItem(MUTE_KEY) === '1' } catch { return false }
  }
  function setMuted(value) {
    try { localStorage.setItem(MUTE_KEY, value ? '1' : '0') } catch { /* 사생활 보호 모드 */ }
  }
  function readCachedSettings() {
    try {
      const raw = localStorage.getItem(CACHE_KEY);
      if (!raw) return { ...DEFAULTS };
      return normalize(JSON.parse(raw));
    } catch { return { ...DEFAULTS } }
  }
  function cacheSettings(value) {
    try { localStorage.setItem(CACHE_KEY, JSON.stringify(value)) } catch { /* 무시 */ }
  }

  function normalize(raw) {
    const list = Array.isArray(raw?.tracks) ? raw.tracks : [];
    const tracks = [];
    for (const item of list) {
      const url = String(item?.url || '').trim();
      if (!url || tracks.length >= 20) continue;
      tracks.push({ title: String(item?.title || '').trim() || `TRACK ${tracks.length + 1}`, url });
    }
    return {
      enabled: raw?.enabled === true && tracks.length > 0,
      volumePercent: Math.max(0, Math.min(100, Number(raw?.volumePercent ?? DEFAULTS.volumePercent) || 0)),
      loopPlaylist: raw?.loopPlaylist !== false,
      tracks
    };
  }

  function playable() { return settings.enabled && settings.tracks.length > 0 }
  function volume() { return Math.max(0, Math.min(1, Number(settings.volumePercent || 0) / 100)) }

  // ── 오디오 ────────────────────────────────────────────────
  function media() {
    if (audio) return audio;
    audio = new Audio();
    audio.preload = 'auto';
    audio.playsInline = true;
    audio.setAttribute('playsinline', '');
    audio.setAttribute('webkit-playsinline', '');
    audio.addEventListener('ended', () => { consecutiveErrors = 0; advance() });
    // 곡 하나가 404 여도 목록 전체가 멈추면 안 된다. 다만 전부 실패하면 조용히 포기한다.
    audio.addEventListener('error', () => {
      if (!active) return;
      consecutiveErrors += 1;
      if (consecutiveErrors >= Math.max(1, settings.tracks.length)) return;
      advance();
    });
    return audio;
  }

  function advance() {
    if (!active || !playable() || isMuted()) return;
    const last = trackIndex >= settings.tracks.length - 1;
    if (last && settings.loopPlaylist === false) return;
    play(trackIndex + 1);
  }

  function play(index) {
    if (!active || !playable() || isMuted()) return;
    const total = settings.tracks.length;
    trackIndex = ((Number(index) || 0) % total + total) % total;
    const track = settings.tracks[trackIndex];
    if (!track?.url) return;
    const el = media();
    // 곡이 하나뿐이면 ended 를 기다리지 말고 태그 반복에 맡긴다(끊김이 없다).
    el.loop = total === 1 && settings.loopPlaylist !== false;
    el.volume = volume();
    if (el.getAttribute('src') !== track.url) {
      el.setAttribute('src', track.url);
      try { el.load() } catch { /* 무시 */ }
    }
    const started = el.play();
    if (started && typeof started.catch === 'function') {
      started.catch(() => {
        // 아직 사용자 조작이 없어 막힌 경우다. 다음 조작 때 이어서 재생한다.
        pendingPlay = () => play(trackIndex);
      });
    }
  }

  function unlock() {
    const el = media();
    if (unlocked) {
      if (pendingPlay) { const run = pendingPlay; pendingPlay = null; run() }
      return;
    }
    const priorSrc = el.getAttribute('src') || '';
    const priorTime = el.currentTime || 0;
    el.setAttribute('src', SILENT);
    el.volume = 0.001;
    Promise.resolve(el.play()).then(() => {
      unlocked = true;
      el.pause();
      if (priorSrc) { el.setAttribute('src', priorSrc); try { el.currentTime = priorTime } catch { /* 무시 */ } }
      el.volume = volume();
      if (pendingPlay) { const run = pendingPlay; pendingPlay = null; run() }
      else if (active && playable() && !isMuted()) play(trackIndex);
    }).catch(() => { /* 여전히 막혀 있으면 다음 조작에서 다시 시도한다 */ });
  }

  // ── 음소거 버튼 ───────────────────────────────────────────
  function injectStyle() {
    if (document.getElementById(STYLE_ID)) return;
    const style = document.createElement('style');
    style.id = STYLE_ID;
    style.textContent = `
.lobby-bgm-toggle{display:inline-flex;align-items:center;gap:6px;padding:6px 11px;border:1px solid rgba(160,200,255,.34);
  border-radius:999px;background:rgba(10,16,30,.62);color:#cfe2ff;font-size:11px;font-weight:700;letter-spacing:.04em;
  line-height:1;cursor:pointer;backdrop-filter:blur(6px);transition:border-color .18s,color .18s,background .18s}
.lobby-bgm-toggle:hover{border-color:rgba(160,200,255,.62);color:#eaf3ff;background:rgba(14,22,42,.78)}
.lobby-bgm-toggle i{font-style:normal;font-size:13px;line-height:1}
.lobby-bgm-toggle em{font-style:normal}
.lobby-bgm-toggle.is-muted{color:#8b9ab4;border-color:rgba(120,140,170,.3)}
.lobby-bgm-toggle.is-floating{position:fixed;z-index:60;right:14px;top:calc(14px + env(safe-area-inset-top,0px))}
@media (max-width:759px){.lobby-bgm-toggle{padding:5px 9px;font-size:10px}.lobby-bgm-toggle em{display:none}}
@media (prefers-reduced-motion: reduce){.lobby-bgm-toggle{transition:none}}`;
    document.head.appendChild(style);
  }

  function buttonHost() {
    return document.querySelector('.pc-lobby-brand')
      || document.querySelector('.mobile-command-nav header')
      || document.querySelector('.mobile-lobby-brand')
      || document.body;
  }

  function syncButton(button) {
    const off = isMuted();
    button.classList.toggle('is-muted', off);
    button.setAttribute('aria-pressed', off ? 'false' : 'true');
    button.setAttribute('aria-label', off ? '로비 배경음 켜기' : '로비 배경음 끄기');
    button.innerHTML = `<i>${off ? '🔇' : '🎵'}</i><em>${off ? '음악 꺼짐' : '음악'}</em>`;
  }

  function mountButton() {
    const existing = document.getElementById(BUTTON_ID);
    if (!active || !playable()) { existing?.remove(); return }
    injectStyle();
    const host = buttonHost();
    if (existing && existing.parentElement === host) { syncButton(existing); return }
    existing?.remove();
    const button = document.createElement('button');
    button.id = BUTTON_ID;
    button.type = 'button';
    button.className = 'lobby-bgm-toggle' + (host === document.body ? ' is-floating' : '');
    button.addEventListener('click', event => { event.preventDefault(); event.stopPropagation(); toggleMute() });
    host.appendChild(button);
    syncButton(button);
  }

  function toggleMute() {
    const next = !isMuted();
    setMuted(next);
    if (next) { if (audio) audio.pause() }
    else { consecutiveErrors = 0; unlock(); play(trackIndex) }
    const button = document.getElementById(BUTTON_ID);
    if (button) syncButton(button);
  }

  // ── 수명주기 ──────────────────────────────────────────────
  function start() {
    active = true;
    consecutiveErrors = 0;
    mountButton();
    // 로비 화면을 다시 그려 버튼이 사라져도 스스로 복구한다.
    if (guardTimer) clearInterval(guardTimer);
    guardTimer = setInterval(mountButton, 2000);
    if (!playable() || isMuted()) return;
    if (unlocked) play(trackIndex);
    else pendingPlay = () => play(trackIndex);
  }

  function stop() {
    active = false;
    pendingPlay = null;
    if (guardTimer) { clearInterval(guardTimer); guardTimer = null }
    document.getElementById(BUTTON_ID)?.remove();
    if (audio) {
      audio.pause();
      // pause 만으로는 버퍼링이 계속된다. src 를 비워야 실제로 끊긴다.
      try { audio.removeAttribute('src'); audio.load() } catch { /* 무시 */ }
    }
  }

  function applySettings(incoming) {
    if (!incoming || typeof incoming !== 'object') return;
    const next = normalize(incoming);
    const listChanged = JSON.stringify(next.tracks) !== JSON.stringify(settings.tracks)
      || next.enabled !== settings.enabled
      || next.loopPlaylist !== settings.loopPlaylist;
    const volumeChanged = next.volumePercent !== settings.volumePercent;
    settings = next;
    cacheSettings(next);
    if (volumeChanged && audio) audio.volume = volume();
    if (!listChanged) { if (active) mountButton(); return }
    consecutiveErrors = 0;
    if (!playable()) {
      if (audio) { audio.pause(); try { audio.removeAttribute('src'); audio.load() } catch { /* 무시 */ } }
      document.getElementById(BUTTON_ID)?.remove();
      return;
    }
    if (!active) return;
    trackIndex = 0;
    mountButton();
    if (isMuted()) return;
    if (unlocked) play(0);
    else pendingPlay = () => play(0);
  }

  // ── 이벤트 ────────────────────────────────────────────────
  // 로비에 있는 동안의 첫 조작에서 오디오 잠금을 푼다.
  ['pointerdown', 'touchend', 'keydown'].forEach(type => {
    document.addEventListener(type, () => { if (active) unlock() }, { capture: true, passive: true });
  });
  // 탭을 숨기면 소리를 멈추고, 돌아오면 로비일 때만 다시 잇는다.
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) { if (audio) audio.pause(); return }
    if (active && playable() && !isMuted()) play(trackIndex);
  });

  window.lobbyBgm = {
    start, stop, applySettings,
    isMuted, toggleMute,
    get settings() { return settings }
  };
})();
