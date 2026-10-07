/* =============================================================
   V1803 · 메인 로비·카드상점 BGM
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

   로비와 카드상점은 한 오디오와 음소거 설정을 공유한다.
   두 화면 사이에서는 곡을 이어 재생하고 다른 화면으로 이동하면 멈춘다.
   ============================================================= */
(() => {
  'use strict';

  const MUTE_KEY = 'soop-lobby-bgm-muted-v1';
  const CACHE_KEY = 'soop-lobby-bgm-settings-v1';
  const TRACK_KEY = 'soop-lobby-bgm-track-v1';
  const VOLUME_KEY = 'soop-lobby-bgm-volume-v1';
  const BUTTON_ID = 'lobbyBgmToggleV1803';
  const SHOP_BUTTON_ID = 'cardShopBgmToggleV1803';
  const CONTROLS_ID = 'lobbyBgmControlsV1';
  const PLAYLIST_ID = 'lobbyBgmPlaylistV1';
  const DIALOG_ID = 'lobbyBgmPlayerV1';
  const STYLE_ID = 'lobbyBgmStyleV1803';
  // 1프레임짜리 무음 WAV. 오토플레이 잠금 해제 전용이다.
  const SILENT = 'data:audio/wav;base64,UklGRigAAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQQAAACAgICA';

  const DEFAULTS = { enabled: false, volumePercent: 15, loopPlaylist: true, tracks: [] };

  let settings = readCachedSettings();
  let audio = null;
  let gainContext = null;
  let volumeGain = null;
  let unlocked = false;
  let unlockPromise = null;
  let pendingPlay = null;
  let active = false;
  let trackIndex = restoredTrackIndex(settings);
  let consecutiveErrors = 0;
  let routeTimer = null;
  let playSequence = 0;
  let playbackError = '';
  let playlistOpener = null;
  let preferredVolume = readPreferredVolume();

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
  function restoredTrackIndex(value) {
    let url = '';
    try { url = localStorage.getItem(TRACK_KEY) || '' } catch { /* 무시 */ }
    return Math.max(0, value.tracks.findIndex(track => track.url === url));
  }
  function rememberTrack() {
    try { localStorage.setItem(TRACK_KEY, settings.tracks[trackIndex]?.url || '') } catch { /* 무시 */ }
  }
  function readPreferredVolume() {
    try {
      const raw = localStorage.getItem(VOLUME_KEY);
      if (raw === null || !Number.isFinite(Number(raw))) return null;
      return Math.max(0, Math.min(100, Math.round(Number(raw))));
    } catch { return null }
  }
  function volumePercent() { return preferredVolume ?? settings.volumePercent }
  function setVolume(value) {
    if (value !== null && !Number.isFinite(Number(value))) return;
    preferredVolume = value === null ? null : Math.max(0, Math.min(100, Math.round(Number(value))));
    try {
      if (preferredVolume === null) localStorage.removeItem(VOLUME_KEY);
      else localStorage.setItem(VOLUME_KEY, String(preferredVolume));
    } catch { /* 무시 */ }
    applyVolume();
    syncPlayer();
  }

  function normalize(raw) {
    const list = Array.isArray(raw?.tracks) ? raw.tracks : [];
    const tracks = [];
    for (const item of list) {
      const url = String(item?.url || '').trim();
      if (!url || tracks.length >= 20) continue;
      tracks.push({ title: String(item?.title || '').trim() || `숲켓몬 OST${tracks.length + 1}`, url });
    }
    return {
      enabled: raw?.enabled === true && tracks.length > 0,
      volumePercent: Math.max(0, Math.min(100, Number(raw?.volumePercent ?? DEFAULTS.volumePercent) || 0)),
      loopPlaylist: raw?.loopPlaylist !== false,
      tracks
    };
  }

  function playable() { return settings.enabled && settings.tracks.length > 0 }
  function volume() { return Math.max(0, Math.min(1, Number(volumePercent() || 0) / 100)) }
  function applyVolume() {
    if (volumeGain) volumeGain.gain.value = volume();
    if (audio) audio.volume = volumeGain ? 1 : volume();
  }
  function resumeVolumeContext() {
    if (gainContext && gainContext.state !== 'running') gainContext.resume().catch(() => {});
  }

  // ── 오디오 ────────────────────────────────────────────────
  function media() {
    if (audio) return audio;
    audio = new Audio();
    audio.preload = 'auto';
    audio.playsInline = true;
    audio.muted = isMuted();
    audio.setAttribute('playsinline', '');
    audio.setAttribute('webkit-playsinline', '');
    // iOS can ignore HTMLMediaElement.volume. Keep the same player and use
    // a gain node on those devices; the soundtrack is served from this origin.
    audio.volume = .5;
    const Context = window.AudioContext || window.webkitAudioContext;
    if (audio.volume !== .5 && Context) {
      try {
        audio.crossOrigin = 'anonymous';
        gainContext = new Context();
        volumeGain = gainContext.createGain();
        volumeGain.gain.value = volume();
        gainContext.createMediaElementSource(audio).connect(volumeGain);
        volumeGain.connect(gainContext.destination);
      } catch { volumeGain = null; gainContext = null }
    }
    applyVolume();
    audio.addEventListener('ended', () => { consecutiveErrors = 0; advance(); syncPlayer() });
    for (const type of ['playing', 'pause', 'loadedmetadata', 'timeupdate']) audio.addEventListener(type, syncPlayer);
    // 곡 하나가 404 여도 목록 전체가 멈추면 안 된다. 다만 전부 실패하면 조용히 포기한다.
    audio.addEventListener('error', () => {
      if (!active || isMuted()) return;
      consecutiveErrors += 1;
      pendingPlay = null;
      playbackError = '음원을 재생할 수 없습니다. 다른 곡을 선택해 주세요.';
      if (consecutiveErrors >= Math.max(1, settings.tracks.length)) { syncPlayer(); return }
      advance();
      syncPlayer();
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
    if (!active || !playable() || isMuted() || document.hidden) return;
    const sequence = ++playSequence;
    const total = settings.tracks.length;
    trackIndex = ((Number(index) || 0) % total + total) % total;
    rememberTrack();
    playbackError = '';
    const track = settings.tracks[trackIndex];
    if (!track?.url) return;
    const el = media();
    el.muted = false;
    // 곡이 하나뿐이면 ended 를 기다리지 말고 태그 반복에 맡긴다(끊김이 없다).
    el.loop = total === 1 && settings.loopPlaylist !== false;
    applyVolume();
    resumeVolumeContext();
    if (el.getAttribute('src') !== track.url) {
      el.setAttribute('src', track.url);
      try { el.load() } catch { /* 무시 */ }
    }
    const started = el.play();
    syncPlayer();
    if (started && typeof started.catch === 'function') {
      started.then(() => {
        if (sequence !== playSequence) return;
        unlocked = true; pendingPlay = null; syncPlayer();
      }).catch(error => {
        if (sequence !== playSequence || !active || isMuted()) return;
        // 아직 사용자 조작이 없어 막힌 경우다. 다음 조작 때 이어서 재생한다.
        if (error?.name === 'NotAllowedError') pendingPlay = () => play(trackIndex);
        syncPlayer();
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
    resumeVolumeContext();
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
      applyVolume();
      el.muted = isMuted();
      if (isMuted()) { pendingPlay = null; return true }
      if (pendingPlay) { const run = pendingPlay; pendingPlay = null; run() }
      else if (active && playable()) play(trackIndex);
      return true;
    }).catch(() => false).finally(() => { unlockPromise = null });
    return unlockPromise;
  }

  function selectTrack(index) {
    if (!active || !playable() || !Number.isInteger(index) || index < 0 || index >= settings.tracks.length) return;
    trackIndex = index;
    rememberTrack();
    consecutiveErrors = 0;
    playbackError = '';
    pendingPlay = null;
    if (!isMuted()) requestPlay(index);
    syncPlayer();
  }

  // ── 음소거·플레이리스트 ────────────────────────────────────
  function injectStyle() {
    if (document.getElementById(STYLE_ID)) return;
    const style = document.createElement('style');
    style.id = STYLE_ID;
    style.textContent = `
.lobby-bgm-toggle{display:inline-flex;align-items:center;gap:6px;padding:6px 11px;border:1px solid rgba(160,200,255,.34);
  border-radius:999px;background:rgba(10,16,30,.62);color:#cfe2ff;font-size:11px;font-weight:700;letter-spacing:.04em;
  line-height:1;cursor:pointer;pointer-events:auto;backdrop-filter:blur(6px);transition:border-color .18s,color .18s,background .18s}
.lobby-bgm-toggle:hover{border-color:rgba(160,200,255,.62);color:#eaf3ff;background:rgba(14,22,42,.78)}
.lobby-bgm-toggle:focus-visible{outline:2px solid #a4d6ff;outline-offset:3px}
.lobby-bgm-toggle i{font-style:normal;font-size:13px;line-height:1}
.lobby-bgm-toggle em{font-style:normal}
.lobby-bgm-toggle.is-muted{color:#8b9ab4;border-color:rgba(120,140,170,.3)}
.lobby-bgm-controls{display:flex;align-items:center;gap:6px;pointer-events:auto;min-width:0;font-family:'Noto Sans KR','Malgun Gothic',sans-serif}
.lobby-bgm-controls>.lobby-bgm-toggle{min-height:44px;margin:0;white-space:nowrap}
.lobby-bgm-controls.is-floating{position:fixed;z-index:60;right:14px;top:calc(94px + env(safe-area-inset-top,0px))}
.lobby-bgm-playlist{border-color:#556b3b;color:#d8f3b0;background:#1a261a}
.lobby-bgm-playlist b{font-family:'Barlow Condensed',sans-serif;font-size:14px}
.pc-lobby-brand>.lobby-bgm-controls{position:absolute;left:296px;top:8px;z-index:20}
.mobile-lobby-brand>.lobby-bgm-controls{justify-self:start;margin-top:5px}
.pack-selector-head>.card-shop-bgm-heading{display:grid;grid-template-columns:minmax(0,1fr) auto;align-items:center;column-gap:16px}
.card-shop-bgm-heading>.eyebrow{grid-column:1/-1}
.card-shop-bgm-heading>h2{grid-column:1;grid-row:2}
.card-shop-bgm-heading>.lobby-bgm-controls{grid-column:2;grid-row:2}
.card-shop-bgm-heading .lobby-bgm-toggle{padding:10px 12px;background:#152b43;border-color:#709ecb;color:#dfedff}
.card-shop-bgm-heading .lobby-bgm-toggle.is-muted{background:#15202c;border-color:#607286;color:#b9c8d8}
.card-shop-bgm-heading .lobby-bgm-playlist{background:#1a261a;border-color:#556b3b;color:#d8f3b0}
.bgm-player{box-sizing:border-box;width:min(460px,calc(100vw - 28px));max-height:calc(100dvh - 28px);margin:auto;padding:0;overflow:auto;color:#f3f5ff;background:linear-gradient(145deg,#172132,#080c17 65%);border:1px solid #405034;border-radius:18px;box-shadow:0 24px 90px #000b;font-family:'Noto Sans KR','Malgun Gothic',sans-serif}
.bgm-player::backdrop{background:#020610c9;backdrop-filter:blur(7px)}
.bgm-player *{box-sizing:border-box}
.bgm-player button{font:inherit;cursor:pointer;color:inherit}
.bgm-player button:focus-visible{outline:2px solid #c8ff6b;outline-offset:3px}
.bgm-player-head{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:18px 20px 14px;border-bottom:1px solid #28324a}
.bgm-player-head h2{margin:0;font-size:16px;font-weight:800;letter-spacing:-.03em}
.bgm-player-head p{margin:4px 0 0;color:#9ba9bf;font-size:11px}
.bgm-player-close{width:44px;height:44px;flex-shrink:0;border:1px solid #344159;border-radius:12px;background:#111828;font-size:24px!important}
.bgm-now{display:flex;align-items:center;gap:18px;padding:23px 24px 18px}
.bgm-cover{width:76px;height:76px;flex-shrink:0;display:flex;align-items:center;justify-content:center;gap:4px;border:1px solid #94ba553d;border-radius:16px;background:radial-gradient(circle at 30% 20%,#c8ff6b22,transparent 65%),#141f20;box-shadow:inset 0 0 20px #b8ff6208}
.bgm-cover i{width:4px;height:14px;border-radius:5px;background:#c8ff6b}
.bgm-cover i:nth-child(2),.bgm-cover i:nth-child(4){height:30px}
.bgm-cover i:nth-child(3){height:42px}
.bgm-player[data-playing=true] .bgm-cover i{animation:bgm-wave 1s ease-in-out infinite alternate}
.bgm-player[data-playing=true] .bgm-cover i:nth-child(2n){animation-delay:-.4s}
.bgm-player[data-playing=true] .bgm-cover i:nth-child(3){animation-delay:-.7s}
@keyframes bgm-wave{to{transform:scaleY(.4);opacity:.65}}
.bgm-now-copy{min-width:0}
.bgm-now-copy small{display:block;color:#c8ff6b;font:600 12px 'Barlow Condensed',sans-serif;letter-spacing:.18em}
.bgm-now-copy h3{font-size:22px;letter-spacing:-.05em;margin:6px 0;overflow-wrap:anywhere}
.bgm-now-copy p{font-size:11px;color:#9ba9bf;margin:0;line-height:1.6}
.bgm-progress{padding:0 24px}
.bgm-progress progress{display:block;width:100%;height:3px;border:0;appearance:none;border-radius:4px;overflow:hidden;background:#28324a;accent-color:#c8ff6b}
.bgm-progress progress::-webkit-progress-bar{background:#28324a}.bgm-progress progress::-webkit-progress-value{background:#c8ff6b}.bgm-progress progress::-moz-progress-bar{background:#c8ff6b}
.bgm-time{display:flex;justify-content:space-between;margin-top:7px;color:#8b97b0;font:500 13px 'Barlow Condensed',sans-serif;font-variant-numeric:tabular-nums}
.bgm-transport{display:flex;align-items:center;justify-content:center;gap:12px;padding:16px 24px 20px}
.bgm-step{width:46px;height:46px;border:1px solid #344159;border-radius:50%;background:#111828;display:grid;place-items:center}
.bgm-step svg{width:18px;height:18px;fill:currentColor}
.bgm-step:disabled{opacity:.35;cursor:default}
.bgm-power{min-width:130px;min-height:46px;padding:10px 20px;border:1px solid #c8ff6b;border-radius:999px;background:#c8ff6b;color:#111b10!important;font-size:13px!important;font-weight:800!important}
.bgm-volume{display:grid;grid-template-columns:auto minmax(0,1fr) 34px auto;align-items:center;gap:10px;padding:0 24px 14px;color:#9ba9bf;font-size:11px}
.bgm-volume input[type=range]{appearance:auto;min-width:0;width:100%;height:44px;padding:0;margin:0;border:0;background:transparent;box-shadow:none;accent-color:#c8ff6b;cursor:pointer}
.bgm-volume input:focus-visible{outline:2px solid #c8ff6b;outline-offset:2px;border-radius:6px}
.bgm-volume output{color:#d8e0ee;text-align:right;font:600 14px 'Barlow Condensed',sans-serif;font-variant-numeric:tabular-nums}
.bgm-volume button{min-width:44px;min-height:44px;padding:6px;border:1px solid #344159;border-radius:9px;background:#111828;font-size:10px}
.bgm-track-heading{display:flex;justify-content:space-between;gap:12px;padding:14px 22px 10px;border-top:1px solid #28324a;color:#8b97b0;font-size:11px}
.bgm-track-heading strong{color:#d1d9e8;font-weight:600}
.bgm-track-list{list-style:none;max-height:320px;overflow:auto;overscroll-behavior:contain;margin:0;padding:0 12px 8px;scrollbar-width:thin;scrollbar-color:#425037 #111828}
.bgm-track{display:flex;align-items:center;gap:12px;width:100%;min-height:58px;padding:10px 12px;margin:2px 0;border:1px solid transparent;border-radius:10px;background:transparent;text-align:left}
.bgm-track:hover{background:#ffffff08}
.bgm-track[aria-current=true]{background:#c8ff6b0d;border-color:#c8ff6b45}
.bgm-track-no{width:24px;color:#718199;font:600 18px 'Barlow Condensed',sans-serif}
.bgm-track-name{flex:1;min-width:0;font-size:13px;font-weight:650;overflow-wrap:anywhere}
.bgm-track-state{font-size:10px;color:#8b97b0;white-space:nowrap}
.bgm-track[aria-current=true] .bgm-track-no,.bgm-track[aria-current=true] .bgm-track-state{color:#c8ff6b}
.bgm-player-note{margin:0;padding:12px 22px 18px;color:#8390a7;font-size:10px;line-height:1.6}
@media (max-width:420px){.card-shop-bgm-heading{column-gap:8px!important}.card-shop-bgm-heading .lobby-bgm-toggle{padding:8px;font-size:10px}.bgm-now{padding:20px;gap:14px}.bgm-now-copy h3{font-size:20px}}
@media (max-width:759px){.lobby-bgm-toggle{padding:5px 9px;font-size:10px}.mobile-lobby-brand>.lobby-bgm-toggle em{display:inline}}
@media (prefers-reduced-motion: reduce){.lobby-bgm-toggle{transition:none}.bgm-player .bgm-cover i{animation:none!important}}`;
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
    return visibleHost('[data-lobby-bgm-host]')
      || visibleHost('.pc-lobby-brand')
      || visibleHost('.mobile-lobby-brand')
      || visibleHost('.mobile-command-nav header')
      || document.body;
  }

  function syncButton(button) {
    const off = isMuted();
    if (button.dataset.bgmMuted === String(off)) return;
    button.dataset.bgmMuted = String(off);
    button.classList.toggle('is-muted', off);
    button.setAttribute('aria-pressed', off ? 'true' : 'false');
    const place = button.id === SHOP_BUTTON_ID ? '카드상점' : '로비';
    button.setAttribute('aria-label', `${place} 배경음 ${off ? '켜기' : '끄기'}`);
    button.title = off ? 'BGM 켜기' : 'BGM 음소거';
    button.innerHTML = `<i>${off ? '🔇' : '🎵'}</i><em>${off ? 'BGM OFF' : 'BGM ON'}</em>`;
  }

  function mountButton() {
    const shop = inCardShop(), id = shop ? SHOP_BUTTON_ID : BUTTON_ID;
    const existing = document.getElementById(id);
    const controls = document.getElementById(CONTROLS_ID);
    if (!active || !playable()) { controls?.remove(); closePlaylist(false); return }
    injectStyle();
    const host = shop ? visibleHost('.pack-selector-head > div') : buttonHost();
    if (!host) { controls?.remove(); return }
    if (shop && host.matches('.pack-selector-head > div')) host.classList.add('card-shop-bgm-heading');
    if (existing && controls?.parentElement === host) { syncButton(existing); syncPlayer(); return }
    controls?.remove();
    const group = document.createElement('div');
    group.id = CONTROLS_ID;
    group.className = 'lobby-bgm-controls' + (host === document.body ? ' is-floating' : '');
    const button = document.createElement('button');
    button.id = id;
    button.type = 'button';
    button.className = 'lobby-bgm-toggle';
    button.addEventListener('click', event => { event.preventDefault(); event.stopPropagation(); toggleMute() });
    const playlist = document.createElement('button');
    playlist.id = PLAYLIST_ID;
    playlist.type = 'button';
    playlist.className = 'lobby-bgm-toggle lobby-bgm-playlist';
    playlist.setAttribute('aria-label', 'BGM 플레이리스트 열기');
    playlist.setAttribute('aria-haspopup', 'dialog');
    playlist.setAttribute('aria-controls', DIALOG_ID);
    playlist.addEventListener('click', () => openPlaylist(playlist));
    group.append(button, playlist);
    host.appendChild(group);
    syncButton(button);
    syncPlayer();
  }

  const escapeHtml = value => String(value).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const timeLabel = value => { const seconds = Math.max(0, Math.floor(Number(value) || 0)); return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}` };
  function closePlaylist(restoreFocus = true) {
    const dialog = document.getElementById(DIALOG_ID);
    const opener = playlistOpener;
    playlistOpener = null;
    dialog?.close();
    dialog?.remove();
    document.getElementById(PLAYLIST_ID)?.setAttribute('aria-expanded', 'false');
    if (restoreFocus && opener?.isConnected) opener.focus();
  }
  function openPlaylist(opener) {
    if (!active || !playable()) return;
    closePlaylist(false);
    playlistOpener = opener;
    const dialog = document.createElement('dialog');
    dialog.id = DIALOG_ID;
    dialog.className = 'bgm-player';
    dialog.setAttribute('aria-labelledby', 'bgmPlayerHeading');
    const arrow = reverse => `<svg viewBox="0 0 24 24" aria-hidden="true"${reverse ? ' style="transform:rotate(180deg)"' : ''}><path d="M5 5v14l10-7zM17 5h2v14h-2z"/></svg>`;
    dialog.innerHTML = `<header class="bgm-player-head"><div><h2 id="bgmPlayerHeading">플레이리스트</h2><p>숲켓몬 오리지널 사운드트랙</p></div><button type="button" class="bgm-player-close" aria-label="플레이리스트 닫기">×</button></header>
      <section class="bgm-now"><div class="bgm-cover" aria-hidden="true"><i></i><i></i><i></i><i></i><i></i></div><div class="bgm-now-copy"><small>SOOPKETMON OST</small><h3 data-bgm-now-title></h3><p data-bgm-status role="status"></p></div></section>
      <div class="bgm-progress"><progress max="1" value="0" aria-label="현재 곡 재생 진행"></progress><div class="bgm-time"><span data-bgm-elapsed>0:00</span><span data-bgm-duration>0:00</span></div></div>
      <div class="bgm-transport"><button type="button" class="bgm-step" data-bgm-prev aria-label="이전 곡">${arrow(true)}</button><button type="button" class="bgm-power" data-bgm-power></button><button type="button" class="bgm-step" data-bgm-next aria-label="다음 곡">${arrow(false)}</button></div>
      <div class="bgm-volume"><label for="bgmPlayerVolume">음량</label><input id="bgmPlayerVolume" type="range" min="0" max="100" step="1" aria-label="BGM 음량"><output for="bgmPlayerVolume"></output><button type="button" data-bgm-volume-reset aria-label="기본 음량으로 되돌리기">기본</button></div>
      <div class="bgm-track-heading"><strong data-bgm-count></strong><span data-bgm-loop></span></div><ol class="bgm-track-list" aria-label="BGM 곡 목록"></ol>
      <p class="bgm-player-note">곡 선택·음량·음소거 설정은 이 기기에 저장됩니다.</p>`;
    dialog.querySelector('.bgm-player-close').onclick = () => closePlaylist();
    dialog.addEventListener('cancel', event => { event.preventDefault(); closePlaylist() });
    dialog.querySelector('[data-bgm-prev]').onclick = () => selectTrack((trackIndex - 1 + settings.tracks.length) % settings.tracks.length);
    dialog.querySelector('[data-bgm-next]').onclick = () => selectTrack((trackIndex + 1) % settings.tracks.length);
    dialog.querySelector('[data-bgm-power]').onclick = () => {
      if (!isMuted() && audio?.ended) requestPlay(trackIndex); else toggleMute();
    };
    dialog.querySelector('#bgmPlayerVolume').oninput = event => setVolume(event.target.value);
    dialog.querySelector('[data-bgm-volume-reset]').onclick = () => setVolume(null);
    dialog.querySelector('.bgm-track-list').onclick = event => {
      const button = event.target.closest('[data-bgm-track]');
      if (button) selectTrack(Number(button.dataset.bgmTrack));
    };
    document.body.appendChild(dialog);
    syncPlayer();
    dialog.showModal();
    opener.setAttribute('aria-expanded', 'true');
    dialog.querySelector('[aria-current="true"]')?.focus({preventScroll:true});
  }
  function syncPlayer() {
    const trigger = document.getElementById(PLAYLIST_ID);
    if (trigger && trigger.dataset.count !== String(settings.tracks.length)) {
      trigger.dataset.count = String(settings.tracks.length);
      trigger.innerHTML = `<span>곡 선택</span><b>${settings.tracks.length}</b>`;
    }
    const dialog = document.getElementById(DIALOG_ID);
    if (trigger) {
      const expanded = String(Boolean(dialog?.open));
      if (trigger.getAttribute('aria-expanded') !== expanded) trigger.setAttribute('aria-expanded', expanded);
    }
    if (!dialog) return;
    const track = settings.tracks[trackIndex];
    const loaded = audio?.getAttribute('src') === track?.url;
    const playing = Boolean(loaded && !audio.paused && !audio.ended && !isMuted());
    dialog.dataset.playing = String(playing);
    const text = (selector, value) => { const node = dialog.querySelector(selector); if (node.textContent !== value) node.textContent = value };
    text('[data-bgm-now-title]', track?.title || '곡을 선택하세요');
    text('[data-bgm-status]', playbackError || (isMuted() ? '음소거 중 · BGM을 켜면 선택한 곡이 재생됩니다.' : playing ? '재생 중' : audio?.ended && loaded ? '재생 완료' : '재생 준비 중'));
    text('[data-bgm-power]', isMuted() ? 'BGM 켜기' : loaded && audio?.ended ? '다시 재생' : 'BGM 끄기');
    text('[data-bgm-count]', `전체 ${settings.tracks.length}곡`);
    text('[data-bgm-loop]', settings.loopPlaylist ? '순서대로 · 전체 반복' : '순서대로 재생');
    const slider = dialog.querySelector('#bgmPlayerVolume'), percent = String(volumePercent());
    if (slider.value !== percent) slider.value = percent;
    slider.setAttribute('aria-valuetext', `${percent}%`);
    text('.bgm-volume output', `${percent}%`);
    dialog.querySelector('[data-bgm-volume-reset]').title = `기본 ${settings.volumePercent}%로 되돌리기`;
    const duration = loaded && Number.isFinite(audio.duration) ? audio.duration : 0;
    const elapsed = loaded ? audio.currentTime || 0 : 0;
    text('[data-bgm-elapsed]', timeLabel(elapsed));
    text('[data-bgm-duration]', timeLabel(duration));
    const progress = dialog.querySelector('progress');
    progress.value = duration > 0 ? Math.min(1, elapsed / duration) : 0;
    for (const button of dialog.querySelectorAll('.bgm-step')) button.disabled = settings.tracks.length < 2;
    const list = dialog.querySelector('.bgm-track-list'), signature = JSON.stringify(settings.tracks);
    if (list.dataset.tracks !== signature) {
      list.dataset.tracks = signature;
      list.innerHTML = settings.tracks.map((item, index) => `<li><button type="button" class="bgm-track" data-bgm-track="${index}"><span class="bgm-track-no">${String(index + 1).padStart(2, '0')}</span><span class="bgm-track-name">${escapeHtml(item.title)}</span><span class="bgm-track-state"></span></button></li>`).join('');
    }
    for (const button of list.querySelectorAll('[data-bgm-track]')) {
      const selected = Number(button.dataset.bgmTrack) === trackIndex;
      button.setAttribute('aria-current', String(selected));
      const state = button.querySelector('.bgm-track-state'), label = selected ? playing ? '재생 중' : '선택됨' : '';
      if (state.textContent !== label) state.textContent = label;
    }
  }

  function toggleMute() {
    const next = !isMuted();
    setMuted(next);
    const el = media();
    el.muted = next;
    if (next) { ++playSequence; pendingPlay = null; el.pause() }
    else {
      consecutiveErrors = 0;
      if (unlocked) play(trackIndex);
      else { pendingPlay = () => play(trackIndex); unlock() }
    }
    [BUTTON_ID, SHOP_BUTTON_ID].forEach(id => { const button = document.getElementById(id); if (button) syncButton(button); });
    syncPlayer();
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

  function inCardShop() {
    // The same native buy screen also bootstraps the lobby. Honor the final
    // adapter route so a temporary/hidden store never starts a second player.
    const route = window.SoopketmonV21ExactShell?.currentRoute;
    // Native rerenders briefly hide the heading. The settled router state,
    // rather than layout geometry, keeps the current track alive during that gap.
    if (route) return route === 'buy' && Boolean(document.querySelector('#app main.page'));
    return Boolean(visibleHost('.pack-selector-head'));
  }

  function syncRoute() {
    const supported = inLobby() || inCardShop();
    if (supported === active) { if (active) mountButton(); return }
    if (supported) start(); else stop();
  }

  function start() {
    active = true;
    consecutiveErrors = 0;
    mountButton();
    if (!playable() || isMuted()) return;
    // 잠금 상태를 미리 판단하지 않고 일단 시도한다.
    // 막히면 play() 가 알아서 pendingPlay 로 미뤄 다음 조작에 이어 붙인다.
    requestPlay(trackIndex);
  }

  function stop() {
    active = false;
    ++playSequence;
    pendingPlay = null;
    closePlaylist(false);
    document.getElementById(CONTROLS_ID)?.remove();
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
    const selectedUrl = settings.tracks[trackIndex]?.url;
    settings = next;
    const preservedIndex = settings.tracks.findIndex(track => track.url === selectedUrl);
    trackIndex = preservedIndex >= 0 ? preservedIndex : restoredTrackIndex(settings);
    cacheSettings(next);
    if (volumeChanged) applyVolume();
    if (!listChanged) { if (active) mountButton(); return }
    consecutiveErrors = 0;
    if (!playable()) {
      if (audio) { audio.pause(); try { audio.removeAttribute('src'); audio.load() } catch { /* 무시 */ } }
      ++playSequence;
      pendingPlay = null;
      closePlaylist(false);
      document.getElementById(CONTROLS_ID)?.remove();
      return;
    }
    if (!active) return;
    mountButton();
    if (isMuted()) return;
    requestPlay(trackIndex);
  }

  // ── 이벤트 ────────────────────────────────────────────────
  // 앱 어디서든 첫 조작에 오디오 잠금을 풀어 둔다.
  // 로비에 있을 때만 풀면, 로비 버튼을 누른 그 조작은 아직 로비가 아니라서 놓치고
  // 로비에 도착한 뒤 아무 것도 누르지 않으면 영영 소리가 나지 않는다.
  ['pointerdown', 'touchend', 'keydown'].forEach(type => {
    document.addEventListener(type, () => { unlock() }, { capture: true, passive: true });
  });
  // 탭을 숨기면 소리를 멈추고, 돌아오면 로비·카드상점에서 다시 잇는다.
  document.addEventListener('visibilitychange', () => {
    syncRouteWatch();
    if (document.hidden) { if (audio) audio.pause(); return }
    if (active && playable() && !isMuted()) play(trackIndex);
  });

  // Keep one repair watch while this window is in use. Background audio keeps
  // its existing policy; only redundant DOM/geometry checks stop on blur.
  function syncRouteWatch() {
    if (routeTimer) { clearInterval(routeTimer); routeTimer = null; }
    if (document.hidden || !document.hasFocus()) return;
    syncRoute();
    routeTimer = setInterval(syncRoute, 1000);
  }
  window.addEventListener('focus', syncRouteWatch);
  window.addEventListener('blur', syncRouteWatch);
  window.addEventListener('pagehide', () => { if (routeTimer) clearInterval(routeTimer); routeTimer = null; });
  window.addEventListener('pageshow', syncRouteWatch);
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', syncRouteWatch, { once: true });
  else syncRouteWatch();

  window.lobbyBgm = {
    start, stop, syncRoute, applySettings,
    isMuted, toggleMute,
    selectTrack, setVolume,
    get currentTrack() { return settings.tracks[trackIndex] || null },
    get settings() { return settings },
    get active() { return active }
  };
})();
