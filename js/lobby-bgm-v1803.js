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
  let unlockPromise = null;
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
    audio.muted = isMuted();
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
    el.muted = false;
    // 곡이 하나뿐이면 ended 를 기다리지 말고 태그 반복에 맡긴다(끊김이 없다).
    el.loop = total === 1 && settings.loopPlaylist !== false;
    el.volume = volume();
    if (el.getAttribute('src') !== track.url) {
      el.setAttribute('src', track.url);
      try { el.load() } catch { /* 무시 */ }
    }
    const started = el.play();
    if (started && typeof started.catch === 'function') {
      started.then(() => { unlocked = true; pendingPlay = null }).catch(() => {
        // 아직 사용자 조작이 없어 막힌 경우다. 다음 조작 때 이어서 재생한다.
        pendingPlay = () => play(trackIndex);
      });
    }
  }

  function requestPlay(index) {
    if (unlocked) { play(index); return }
    pendingPlay = () => play(index);
    // 이미 조작이 있었던 탭이라면 그냥 재생된다. 막히면 play() 가 다시 미뤄 둔다.
    play(index);
  }

  function unlock() {
    const el = media();
    if (unlocked) {
      el.muted = isMuted();
      if (!isMuted() && pendingPlay) { const run = pendingPlay; pendingPlay = null; run() }
      return Promise.resolve(true);
    }
    if (unlockPromise) return unlockPromise;
    const priorSrc = el.getAttribute('src') || '';
    const priorTime = el.currentTime || 0;
    el.setAttribute('src', SILENT);
    // 무음 파일 자체에는 muted 를 걸지 않아 iOS가 현재 조작을 오디오 잠금 해제로 인정하게 한다.
    el.muted = false;
    el.volume = 0.001;
    unlockPromise = Promise.resolve(el.play()).then(() => {
      unlocked = true;
      el.pause();
      if (priorSrc) { el.setAttribute('src', priorSrc); try { el.currentTime = priorTime } catch { /* 무시 */ } }
      el.volume = volume();
      el.muted = isMuted();
      if (isMuted()) { pendingPlay = null; return true }
      if (pendingPlay) { const run = pendingPlay; pendingPlay = null; run() }
      else if (active && playable()) play(trackIndex);
      return true;
    }).catch(() => false).finally(() => { unlockPromise = null });
    return unlockPromise;
  }

  // ── 음소거 버튼 ───────────────────────────────────────────
  function injectStyle() {
    if (document.getElementById(STYLE_ID)) return;
    const style = document.createElement('style');
    style.id = STYLE_ID;
    style.textContent = `
.lobby-bgm-toggle{display:inline-flex;align-items:center;gap:6px;padding:6px 11px;border:1px solid rgba(160,200,255,.34);
  border-radius:999px;background:rgba(10,16,30,.62);color:#cfe2ff;font-size:11px;font-weight:700;letter-spacing:.04em;
  line-height:1;cursor:pointer;pointer-events:auto;backdrop-filter:blur(6px);transition:border-color .18s,color .18s,background .18s}
.lobby-bgm-toggle:hover{border-color:rgba(160,200,255,.62);color:#eaf3ff;background:rgba(14,22,42,.78)}
.lobby-bgm-toggle i{font-style:normal;font-size:13px;line-height:1}
.lobby-bgm-toggle em{font-style:normal}
.lobby-bgm-toggle.is-muted{color:#8b9ab4;border-color:rgba(120,140,170,.3)}
.lobby-bgm-toggle.is-floating{position:fixed;z-index:60;right:14px;top:calc(14px + env(safe-area-inset-top,0px))}
.pc-lobby-brand>.lobby-bgm-toggle{position:absolute;left:296px;top:8px;z-index:20;min-height:34px;white-space:nowrap}
.mobile-lobby-brand>.lobby-bgm-toggle{justify-self:start;margin-top:5px;white-space:nowrap}
@media (max-width:759px){.lobby-bgm-toggle{padding:5px 9px;font-size:10px}.mobile-lobby-brand>.lobby-bgm-toggle em{display:inline}}
@media (prefers-reduced-motion: reduce){.lobby-bgm-toggle{transition:none}}`;
    document.head.appendChild(style);
  }

  function visibleHost(selector) {
    const node = document.querySelector(selector);
    if (!node) return null;
    const style = getComputedStyle(node);
    const rect = node.getBoundingClientRect();
    return style.display !== 'none' && style.visibility !== 'hidden' && rect.width > 0 && rect.height > 0 ? node : null;
  }

  function buttonHost() {
    return visibleHost('.pc-lobby-brand')
      || visibleHost('.mobile-lobby-brand')
      || visibleHost('.mobile-command-nav header')
      || document.body;
  }

  function syncButton(button) {
    const off = isMuted();
    button.classList.toggle('is-muted', off);
    button.setAttribute('aria-pressed', off ? 'true' : 'false');
    button.setAttribute('aria-label', off ? '로비 배경음 켜기' : '로비 배경음 끄기');
    button.title = off ? 'BGM 켜기' : 'BGM 음소거';
    button.innerHTML = `<i>${off ? '🔇' : '🎵'}</i><em>${off ? 'BGM OFF' : 'BGM ON'}</em>`;
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
    const el = media();
    el.muted = next;
    if (next) { pendingPlay = null; el.pause() }
    else {
      consecutiveErrors = 0;
      if (unlocked) play(trackIndex);
      else { pendingPlay = () => play(trackIndex); unlock() }
    }
    const button = document.getElementById(BUTTON_ID);
    if (button) syncButton(button);
  }

  // ── 수명주기 ──────────────────────────────────────────────
  // V21 어댑터는 로비를 그릴 때 내부적으로 renderShell('buy') 를 부른다.
  // (exactRenderShell: requested==='home' 이면 nativeRenderShell(this,'buy'))
  // 그래서 renderShell 의 tab 값으로는 로비인지 알 수 없다.
  // 실제로 그려진 화면과 어댑터가 들고 있는 라우트를 함께 본다.
  function inLobby() {
    if (document.querySelector('.pc-lobby-scene, .mobile-command-lobby')) return true;
    try { return String(window.SoopketmonV21ExactShell?.currentRoute || '') === 'home' } catch { return false }
  }

  function syncRoute() {
    const lobby = inLobby();
    if (lobby === active) { if (active) mountButton(); return }
    if (lobby) start(); else stop();
  }

  function start() {
    active = true;
    consecutiveErrors = 0;
    mountButton();
    // 로비 화면을 다시 그려 버튼이 사라져도 스스로 복구한다.
    if (guardTimer) clearInterval(guardTimer);
    guardTimer = setInterval(mountButton, 2000);
    if (!playable() || isMuted()) return;
    // 잠금 상태를 미리 판단하지 않고 일단 시도한다.
    // 막히면 play() 가 알아서 pendingPlay 로 미뤄 다음 조작에 이어 붙인다.
    requestPlay(trackIndex);
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
    requestPlay(0);
  }

  // ── 이벤트 ────────────────────────────────────────────────
  // 앱 어디서든 첫 조작에 오디오 잠금을 풀어 둔다.
  // 로비에 있을 때만 풀면, 로비 버튼을 누른 그 조작은 아직 로비가 아니라서 놓치고
  // 로비에 도착한 뒤 아무 것도 누르지 않으면 영영 소리가 나지 않는다.
  ['pointerdown', 'touchend', 'keydown'].forEach(type => {
    document.addEventListener(type, () => { unlock() }, { capture: true, passive: true });
  });
  // 탭을 숨기면 소리를 멈추고, 돌아오면 로비일 때만 다시 잇는다.
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) { if (audio) audio.pause(); return }
    if (active && playable() && !isMuted()) play(trackIndex);
  });

  // 화면 전환은 어댑터가 여러 경로로 일으킨다. 훅 하나에 의존하지 않고 스스로 확인한다.
  setInterval(syncRoute, 1000);
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', syncRoute, { once: true });
  else syncRoute();

  window.lobbyBgm = {
    start, stop, syncRoute, applySettings,
    isMuted, toggleMute,
    get settings() { return settings },
    get active() { return active }
  };
})();
