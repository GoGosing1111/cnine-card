// Presentation only: this module receives a completed, immutable result. It has
// no API, random outcome, inventory or account mutation dependency.
let active = null;
const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const SOUND_KEY = 'cnine.mercenary.breakthrough.sound';
function sealSvg(side) {
  return `<svg viewBox="0 0 400 460" aria-hidden="true"><defs><linearGradient id="metal-${side}" x1="0" y1="0" x2="1" y2="1"><stop stop-color="#61716d"/><stop offset=".17" stop-color="#263940"/><stop offset=".49" stop-color="#101e29"/><stop offset=".72" stop-color="#36494a"/><stop offset="1" stop-color="#0a1723"/></linearGradient><linearGradient id="edge-${side}" x2=".5" y2="1"><stop stop-color="#e4eac6"/><stop offset=".4" stop-color="#607759"/><stop offset=".7" stop-color="#192d30"/><stop offset="1" stop-color="#b2bb88"/></linearGradient><radialGradient id="core-${side}"><stop stop-color="#ebffc9"/><stop offset=".28" stop-color="#b9f76d"/><stop offset=".55" stop-color="#63944a"/><stop offset="1" stop-color="#162c2c"/></radialGradient></defs>
  <path d="M200 12 345 97 379 230 345 363 200 448 55 363 21 230 55 97Z" fill="#06121f" stroke="#0a1019" stroke-width="11"/>
  <path d="M200 6 350 94 385 230 350 366 200 454 50 366 15 230 50 94Z" fill="url(#metal-${side})" stroke="url(#edge-${side})" stroke-width="5"/>
  <path d="M200 27 333 106 364 230 333 354 200 433 67 354 36 230 67 106Z" fill="none" stroke="#8a9d79" stroke-width="1"/>
  <path d="M200 46 314 118 343 230 314 342 200 414 86 342 57 230 86 118Z" fill="#0b1a27" stroke="#556958" stroke-width="3"/>
  <path d="m200 50 104 74 28 106-28 106-104 74L96 336 68 230l28-106Z" fill="url(#metal-${side})" stroke="#1a2d33" stroke-width="6"/>
  <g fill="none" stroke="#9cb077" stroke-width="1"><circle cx="200" cy="230" r="130"/><circle cx="200" cy="230" r="116" stroke-dasharray="2 8"/><path d="M200 80v50m0 200v50M70 230h50m160 0h50M111 141l30 30m118 118 30 30m0-178-30 30M141 289l-30 30"/></g>
  <path d="m200 128 83 102-83 102-83-102Z" fill="#0a1924" stroke="url(#edge-${side})" stroke-width="4"/>
  <path d="m200 147 64 83-64 83-64-83Z" fill="none" stroke="#849d63"/>
  <path d="m200 170 40 60-40 60-40-60Z" fill="url(#core-${side})" stroke="#d2ff92" stroke-width="2"/>
  <path d="M200 179v102m-28-51h56" stroke="#efffc2" stroke-width="2"/>
  <g fill="#93aa68" stroke="#d0d5a2"><path d="m200 24 8 15-8 15-8-15Zm0 382 8 15-8 15-8-15ZM39 230l14-8 14 8-14 8Zm294 0 14-8 14 8-14 8Z"/></g>
  <path d="M74 105 200 31l126 74M73 352l127 75 127-75" fill="none" stroke="#d8e5a1" stroke-width="2" opacity=".7"/>
  </svg>`;
}
export function showBreakthrough({result, card, bonusLabel, preview = false}) {
  if (active) return active.promise;
  if (!result || typeof result.success !== 'boolean' || !result.before || !result.after || !card) return Promise.reject(Error('돌파 결과를 표시하지 못했습니다. 이전 요청 결과를 다시 확인하세요.'));
  const receipt = structuredClone(result), identity = {...card};
  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const restoreFocus = document.activeElement, oldOverflow = document.documentElement.style.overflow;
  let phase = 'charging', charge = 0, pointer = null, startX = 0, startCharge = 0, done = false, audioContext, sound = false, raf = 0;
  let resolve;
  const promise = new Promise(r => resolve = r);
  const timers = new Set(), cleanup = [];
  try { sound = localStorage.getItem(SOUND_KEY) === '1'; } catch {}
  const root = document.createElement('dialog');
  root.className = 'break-reveal'; root.dataset.phase = phase; root.dataset.reduced = String(reduced);
  root.setAttribute('aria-labelledby', 'break-title'); root.setAttribute('aria-describedby', 'break-description');
  root.innerHTML = `<div class="break-room" aria-hidden="true"></div><canvas class="break-particles" aria-hidden="true"></canvas><div class="break-vignette" aria-hidden="true"></div>
    <div class="break-layout"><header class="break-top"><div><span class="break-top-symbol">◇</span><b>한계 돌파</b><span>Lv.${receipt.before.level}</span>${preview ? '<small>검수 예시 · 실제 소모 없음</small>' : ''}</div><button class="break-skip" type="button">바로 결과 보기 <span>↗</span></button></header>
    <div class="break-heading"><p class="break-phase-caption">돌파 에너지 충전</p><h2 id="break-title">봉인을 깨울 시간</h2><p id="break-description">${esc(identity.name)} · Lv.${receipt.before.level} 돌파</p></div>
    <div class="break-arena"><div class="break-column" aria-hidden="true"></div><div class="break-ring ring-a" aria-hidden="true"></div><div class="break-ring ring-b" aria-hidden="true"></div><div class="break-ring ring-c" aria-hidden="true"></div><div class="break-shockwave" aria-hidden="true"></div><div class="break-seal" aria-hidden="true"><div class="seal-half seal-left">${sealSvg('left')}</div><div class="seal-half seal-right">${sealSvg('right')}</div><div class="seal-seam"></div><div class="seal-gleam"></div></div><div class="break-art" aria-hidden="true"><img src="/${esc(identity.sourceArt)}" alt=""><span class="break-art-corner"></span></div><div class="break-plinth" aria-hidden="true"></div></div>
    <div class="break-bottom"><div class="break-interaction"><p class="break-instruction" role="status">에너지가 봉인에 모이고 있습니다.</p><div class="break-slider" role="slider" tabindex="0" aria-label="오른쪽으로 밀어 돌파 결과 공개" aria-valuemin="0" aria-valuemax="100" aria-valuenow="0" aria-valuetext="충전 중" aria-disabled="true"><div class="break-slider-fill"></div><span class="break-slider-label">밀어서 봉인 개방</span><span class="break-slider-chevrons" aria-hidden="true">› › ›</span><span class="break-slider-handle" aria-hidden="true">◇</span></div><p class="break-keyboard-hint">오른쪽으로 끝까지 밀기 · Enter로 개방</p></div><div class="break-result" hidden><div class="break-result-level"></div><div class="break-result-effect"></div><p class="break-result-note"></p><button class="break-continue primary" type="button">성장실로 돌아가기 <span>→</span></button></div></div>
    <footer class="break-footer"><div class="break-steps"><span data-step="charging">01 충전</span><i></i><span data-step="sealed">02 봉인 개방</span><i></i><span data-step="result">03 결과</span></div><button class="break-sound" type="button" aria-pressed="${sound}">사운드 ${sound ? 'ON' : 'OFF'}</button></footer></div>`;
  document.body.append(root); document.documentElement.style.overflow = 'hidden'; root.showModal();
  const $ = s => root.querySelector(s), slider = $('.break-slider');
  active = {promise};
  const listen = (node, event, fn, options) => { node.addEventListener(event, fn, options); cleanup.push(() => node.removeEventListener(event, fn, options)); };
  const later = (fn, ms) => { const id = setTimeout(() => { timers.delete(id); if (!done) fn(); }, ms); timers.add(id); };
  function tone(frequency, duration = .2, delay = 0, volume = .04) {
    if (!sound || done) return;
    try {
      const Audio = window.AudioContext || window.webkitAudioContext;
      if (!Audio) return;
      audioContext ||= new Audio();
      void audioContext.resume().catch(() => {});
      const t = audioContext.currentTime + delay, oscillator = audioContext.createOscillator(), gain = audioContext.createGain();
      oscillator.type = 'sine'; oscillator.frequency.setValueAtTime(frequency, t);
      gain.gain.setValueAtTime(.0001, t); gain.gain.exponentialRampToValueAtTime(volume, t + .02); gain.gain.exponentialRampToValueAtTime(.0001, t + duration);
      oscillator.connect(gain); gain.connect(audioContext.destination); oscillator.start(t); oscillator.stop(t + duration + .02);
      oscillator.onended = () => { oscillator.disconnect(); gain.disconnect(); };
    } catch { /* Optional sound must never interrupt a confirmed receipt. */ }
  }
  function setPhase(value) {
    phase = value; root.dataset.phase = value;
    root.querySelectorAll('[data-step]').forEach(el => el.classList.toggle('active', el.dataset.step === (value === 'opening' ? 'sealed' : value)));
  }
  function setCharge(value) {
    charge = Math.max(0, Math.min(1, value));
    root.style.setProperty('--charge', charge);
    const travel = Math.max(1, slider.clientWidth - 56);
    root.style.setProperty('--handle-x', `${travel * charge}px`);
    slider.setAttribute('aria-valuenow', String(Math.round(charge * 100)));
    slider.setAttribute('aria-valuetext', `${Math.round(charge * 100)}% 개방 준비`);
  }
  function finish(seen) {
    if (done) return;
    done = true; timers.forEach(clearTimeout); timers.clear(); cancelAnimationFrame(raf); cleanup.forEach(fn => fn());
    void audioContext?.close().catch(() => {});
    root.close(); root.remove(); document.documentElement.style.overflow = oldOverflow;
    if (restoreFocus?.isConnected) restoreFocus.focus({preventScroll:true});
    active = null; resolve(seen);
  }
  function showResult() {
    if (done || phase === 'result') return;
    timers.forEach(clearTimeout); timers.clear(); pointer = null;
    setPhase('result'); root.dataset.outcome = receipt.success ? 'success' : 'failure';
    $('.break-heading .break-phase-caption').textContent = receipt.success ? receipt.complete ? '모든 돌파 효과 해금' : '새로운 힘이 깨어납니다' : '다시 도전할 수 있습니다';
    $('#break-title').textContent = receipt.success ? receipt.complete ? '최종 돌파 성공' : '돌파 성공' : '돌파 실패';
    $('#break-description').textContent = identity.name;
    $('.break-skip').hidden = true; $('.break-interaction').hidden = true; $('.break-result').hidden = false;
    $('.break-result-level').innerHTML = receipt.success ? receipt.complete ? `<b>Lv.${receipt.after.level}</b><small>MAX</small>` : `<span>Lv.${receipt.before.level}</span><i>→</i><b>Lv.${receipt.after.level}</b>` : `<b>Lv.${receipt.after.level}</b><small>유지</small><i>·</i><span>경험치 0%</span>`;
    $('.break-result-effect').textContent = receipt.success ? bonusLabel : '기존 돌파 효과 유지';
    $('.break-result-note').textContent = receipt.success ? receipt.complete ? '20레벨 최종 돌파를 완료했습니다.' : '돌파 효과가 해금되었습니다. 다음 성장을 시작하세요.' : '용병은 보존됩니다. 현재 레벨의 경험치를 다시 채워 도전하세요.';
    $('.break-art').setAttribute('aria-hidden', 'false'); $('.break-art img').alt = `${identity.name} 원화`;
    $('.break-continue').focus({preventScroll:true});
    if (receipt.success) [392, 523.25, 659.25, 783.99].forEach((f, i) => tone(f, .8, i * .12, .025));
    else { tone(196, .6); tone(146.8, .7, .15, .025); }
  }
  function openSeal() {
    if (phase !== 'sealed' || done) return;
    pointer = null; setCharge(1); setPhase('opening'); root.dataset.resonance = receipt.success ? 'success' : 'failure'; slider.setAttribute('aria-disabled', 'true');
    $('.break-instruction').textContent = '봉인이 열리고 있습니다.';
    $('.break-heading .break-phase-caption').textContent = '봉인 개방';
    $('#break-title').textContent = '한계를 넘어서';
    tone(98, 1.1, 0, .07); tone(receipt.success ? 392 : 123.5, .8, .25, .025);
    later(showResult, reduced ? 0 : 1550);
  }
  listen($('.break-skip'), 'click', showResult);
  listen($('.break-continue'), 'click', () => finish(true));
  listen($('.break-sound'), 'click', () => {
    sound = !sound; $('.break-sound').textContent = `사운드 ${sound ? 'ON' : 'OFF'}`; $('.break-sound').setAttribute('aria-pressed', String(sound));
    try { localStorage.setItem(SOUND_KEY, sound ? '1' : '0'); } catch {}
    if (!sound) { void audioContext?.close().catch(() => {}); audioContext = undefined; } else tone(440, .15);
  });
  listen(slider, 'pointerdown', e => {
    if (phase !== 'sealed' || pointer !== null || e.button !== 0) return;
    e.preventDefault(); pointer = e.pointerId; startX = e.clientX; startCharge = charge;
    slider.setPointerCapture(pointer); slider.focus({preventScroll:true}); root.classList.add('is-dragging');
  });
  listen(slider, 'pointermove', e => {
    if (e.pointerId !== pointer || phase !== 'sealed') return;
    setCharge(startCharge + (e.clientX - startX) / Math.max(1, slider.clientWidth - 56));
    if (charge >= .97) { root.classList.remove('is-dragging'); openSeal(); }
  });
  const release = e => { if (e.pointerId !== pointer) return; pointer = null; root.classList.remove('is-dragging'); if (phase === 'sealed') setCharge(0); };
  listen(slider, 'pointerup', release); listen(slider, 'pointercancel', release); listen(slider, 'lostpointercapture', release);
  listen(slider, 'keydown', e => {
    if (phase !== 'sealed') return;
    if (['Enter', ' ', 'End'].includes(e.key)) { e.preventDefault(); openSeal(); }
    else if (['ArrowRight', 'ArrowLeft', 'Home'].includes(e.key)) { e.preventDefault(); setCharge(e.key === 'Home' ? 0 : charge + (e.key === 'ArrowRight' ? .1 : -.1)); if (charge >= .97) openSeal(); }
  });
  listen(root, 'cancel', e => { e.preventDefault(); if (phase === 'result') finish(true); else showResult(); });
  listen(root, 'close', () => finish(false));
  listen(window, 'pagehide', () => finish(false));
  listen(window, 'cnine:route-will-change', () => finish(false));
  listen(window, 'resize', () => { if (phase === 'sealed') { pointer = null; root.classList.remove('is-dragging'); setCharge(0); } });
  setPhase('charging'); $('.break-skip').focus({preventScroll:true});
  later(() => {
    setPhase('sealed'); slider.setAttribute('aria-disabled', 'false'); setCharge(0);
    $('.break-heading .break-phase-caption').textContent = '돌파 에너지 충전 완료';
    $('#break-title').textContent = '봉인을 개방하세요';
    $('.break-instruction').textContent = '빛을 오른쪽 끝까지 밀어 봉인을 여세요.';
    slider.focus({preventScroll:true}); tone(261.6, .4, 0, .02);
  }, reduced ? 0 : 1050);

  const canvas = $('.break-particles'), ctx = canvas.getContext('2d');
  if (ctx && !reduced) {
    let width = 0, height = 0, last = 0;
    const motes = Array.from({length:54}, (_, i) => ({angle:i * 2.39996, radius:.2 + (i % 17) / 22, size:.6 + (i % 4) * .35, speed:.1 + (i % 7) * .013}));
    const draw = now => {
      if (done) return;
      raf = requestAnimationFrame(draw); if (now - last < 32 || document.hidden) return; last = now;
      if (width !== innerWidth || height !== innerHeight) { width = innerWidth; height = innerHeight; canvas.width = width * Math.min(devicePixelRatio, 1.5); canvas.height = height * Math.min(devicePixelRatio, 1.5); }
      ctx.setTransform(canvas.width / width, 0, 0, canvas.height / height, 0, 0); ctx.clearRect(0, 0, width, height);
      const time = now / 1000, span = Math.min(width * .46, height * .53), collapse = phase === 'opening' ? .3 : 1 - charge * .25;
      for (const m of motes) {
        const angle = m.angle + time * m.speed, r = span * m.radius * collapse;
        const x = width / 2 + Math.cos(angle) * r, y = height * .46 + Math.sin(angle) * r * .8;
        const alpha = phase === 'result' && !receipt.success ? .12 : .25 + .35 * Math.sin(angle * 2) ** 2;
        ctx.fillStyle = `rgba(215,249,158,${alpha})`; ctx.beginPath(); ctx.arc(x, y, m.size + charge, 0, Math.PI * 2); ctx.fill();
      }
    };
    raf = requestAnimationFrame(draw);
  }
  return promise;
}
