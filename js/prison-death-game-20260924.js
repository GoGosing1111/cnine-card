(function () {
  'use strict';
  let root = null, state = null, generation = 0, poll = null, clock = null, biteTimer = null;
  let offset = 0, held = false, reading = false, acting = false, requestKey = null, previousFocus = null, cleanup = [], shotUntil = 0;
  const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#039;' }[c]));
  const now = () => Date.now() + offset;
  const time = ms => { const seconds = Math.max(0, Math.ceil(ms / 1000)); return `${String(Math.floor(seconds / 60)).padStart(2,'0')}:${String(seconds % 60).padStart(2,'0')}`; };
  const request = (path, body, admin = false) => apiRequest(`${admin ? 'admin/' : ''}prison-death-game/${path}`,
    body ? { method:'POST', body:JSON.stringify(body) } : {}, { ttl:0, timeoutMs:8000 });
  const on = (target, type, fn) => { target.addEventListener(type, fn); cleanup.push(() => target.removeEventListener(type, fn)); };
  const notice = message => { const node = root?.querySelector('[data-death-notice]'); if (node) node.textContent = message; };
  const titleFor = phase => ({ CLOSED:'운영자가 모집을 열 때까지 대기', LOBBY:'참가자를 모집하고 있습니다', COUNTDOWN:'경기가 곧 시작됩니다', READING:'감시자가 신문을 읽고 있습니다', WARNING:'시선을 들고 있습니다. 손을 떼세요!', WATCHING:'감시 중 · 움직이지 마세요', FINISHED:'경기가 종료되었습니다', CANCELLED:'운영자가 경기를 종료했습니다' })[phase] || '서버 연결 중';

  function stopEating() {
    held = false; clearTimeout(biteTimer); biteTimer = null;
    root?.classList.remove('is-eating');
    root?.querySelector('[data-death-eat]')?.setAttribute('aria-pressed','false');
  }
  function stop() {
    generation++; stopEating(); clearTimeout(poll); clearInterval(clock); poll = clock = null;
    document.body.classList.remove('death-game-open');
    cleanup.splice(0).forEach(fn => fn());
    if (root?.classList.contains('death-game-overlay')) root.remove();
    root = null; state = null; reading = acting = false; requestKey = null; shotUntil = 0;
  }
  function deathStatus(data) {
    return { incarcerated:true, facility:'DEATH_GAME', reason:'사망하였습니다. 숲켓몬 전체 플레이가 5분간 제한됩니다.',
      jailedAt:new Date(data.me.diedAt).toISOString(), jailedUntil:new Date(data.me.blockedUntil).toISOString(),
      remainingSeconds:Math.max(0, Math.ceil((data.me.blockedUntil - data.serverNow) / 1000)) };
  }
  function apply(data) {
    if (!root?.isConnected) return;
    // A slow status poll must never roll back a newer bite receipt.
    if (state && state.round?.id === data.round?.id && Number(state.me?.lastSeq || 0) > Number(data.me?.lastSeq || 0)) return;
    if (state && state.round?.id === data.round?.id && data.players.some(p => p.status === 'DEAD' && state.players.some(old => old.userId === p.userId && old.status !== 'DEAD'))) shotUntil = Number(data.serverNow) + 1000;
    state = data; offset = Number(data.serverNow) - Date.now();
    if (data.me?.status === 'DEAD' && data.me.blockedUntil > data.serverNow) {
      const prison = deathStatus(data);
      window.PrisonV1.apply(prison, { serverNow:new Date(data.serverNow).toISOString() });
      stop(); window.PrisonV1.renderLocked(prison); return;
    }
    paint();
  }
  function paint() {
    if (!root?.isConnected || !state) return;
    const phase = state.round?.phase.type || 'CLOSED', me = state.me;
    root.dataset.phase = phase;
    root.querySelector('[data-death-heading]').textContent = titleFor(phase);
    root.querySelector('[data-death-count]').textContent = `${state.players.length} / ${state.rules.maxPlayers}명`;
    const mine = Number(me?.bites || 0), target = state.rules.targetBites;
    root.querySelector('[data-death-progress]').textContent = `${mine} / ${target}`;
    root.querySelector('[data-death-fill]').style.width = `${mine / target * 100}%`;
    root.querySelectorAll('.death-pea').forEach((pea, index) => { pea.hidden = index < mine; });
    const canEat = me?.status === 'ALIVE' && ['READING','WARNING','WATCHING'].includes(phase);
    const eat = root.querySelector('[data-death-eat]'); eat.disabled = !canEat;
    eat.querySelector('b').textContent = me?.status === 'FINISHED' ? '식사 완료 · 생존' : '누르고 있으면 먹기';
    root.querySelector('[data-death-help]').textContent = me?.status === 'FINISHED' ? '식사를 마쳤습니다. 다른 참가자의 경기가 끝날 때까지 관전할 수 있습니다.' : !me ? '모집 중 참가 신청을 하면 운영자 시작 후 함께 경기합니다.' : 'PC: 버튼 또는 스페이스를 누르기 · 모바일: 길게 누르기 · 손을 떼면 멈춤';
    if (!canEat) stopEating();
    root.querySelector('[data-death-join]').hidden = phase !== 'LOBBY' || Boolean(me);
    root.querySelector('[data-death-leave]').hidden = phase !== 'LOBBY' || !me;
    root.querySelector('[data-death-consent]').hidden = phase !== 'LOBBY' || Boolean(me);
    root.querySelector('[data-death-operator]').hidden = !state.canOperate;
    root.querySelector('[data-death-command="open"]').disabled = ['LOBBY','RUNNING'].includes(state.round?.status);
    root.querySelector('[data-death-command="start"]').disabled = phase !== 'LOBBY' || state.players.length < 2;
    root.querySelector('[data-death-command="cancel"]').disabled = !['LOBBY','RUNNING'].includes(state.round?.status);
    root.querySelector('[data-death-close]').disabled = Boolean(me && state.round?.status === 'RUNNING' && me.status === 'ALIVE');
    const roster = root.querySelector('[data-death-roster]'), signature = JSON.stringify(state.players);
    if (roster.dataset.signature !== signature) {
      roster.dataset.signature = signature;
      let finishRank = 0;
      roster.innerHTML = state.players.length ? state.players.map(p => {
        const rank = p.status === 'FINISHED' ? ++finishRank : 0;
        const label = p.status === 'DEAD' ? '사망' : rank ? `${rank}위 완주` : p.status === 'WAITING' ? '시작 대기' : '생존';
        return `<li class="death-player ${p.status === 'DEAD' ? 'is-dead' : rank ? 'is-finished' : ''} ${p.userId === me?.userId ? 'is-self' : ''}"><span class="death-player-no">${rank ? String(rank).padStart(2,'0') : '·'}</span><div><b>${esc(p.nickname)}${p.userId === me?.userId ? '<em>나</em>' : ''}</b><span class="death-player-track"><i style="width:${p.bites / target * 100}%"></i></span></div><span class="death-player-result">${label}<small>${p.bites} / ${target}</small></span></li>`;
      }).join('') : '<li class="death-empty">빈 의자가 당신을 기다립니다.<br><span>운영자가 모집을 열면 참가할 수 있습니다.</span></li>';
    }
    tick();
  }
  function tick() {
    if (!root?.isConnected || !state) return;
    const round = state.round, phase = round?.phase;
    root.classList.toggle('is-shooting', now() < shotUntil);
    root.querySelector('[data-death-timer]').textContent = round?.status === 'RUNNING' ? time(round.endsAt - now()) : '--:--';
    const countdown = root.querySelector('[data-death-countdown]');
    countdown.hidden = phase?.type !== 'COUNTDOWN';
    countdown.textContent = phase?.type === 'COUNTDOWN' ? String(Math.max(1,Math.ceil((phase.endsAt - now()) / 1000))) : '';
    // Show the warning promptly, even between polls. Do not infer a safe window.
    if (phase?.type === 'READING' && now() >= phase.endsAt) {
      root.dataset.phase = 'WARNING'; root.querySelector('[data-death-heading]').textContent = titleFor('WARNING');
    }
  }
  async function refresh() {
    if (!root?.isConnected || reading || acting) return schedule();
    const version = generation; reading = true;
    try {
      const data = await request('status');
      if (version !== generation) return;
      apply(data); notice('사망 시 숲켓몬 전체 플레이 5분 제한 · 재화 차감 및 자동 보상 없음');
    } catch (error) { if (version === generation) { stopEating(); notice(`연결 확인 중 · ${error.message}`); } }
    finally { if (version === generation) { reading = false; schedule(); } }
  }
  function schedule() {
    clearTimeout(poll);
    if (root?.isConnected) poll = setTimeout(refresh, state?.round?.status === 'RUNNING' ? 500 : 2500);
  }
  async function bite() {
    if (!held || !root?.isConnected || acting || !state?.me || state.me.status !== 'ALIVE') return;
    const wait = Math.max(0, state.me.nextBiteAt - now());
    if (wait > 0) { biteTimer = setTimeout(bite, wait + 20); return; }
    const version = generation; acting = true;
    const before = state.me.bites;
    try {
      const data = await request('bite', { roundId:state.round.id, seq:state.me.lastSeq + 1 });
      if (version !== generation) return;
      apply(data);
      if (root && data.me?.bites > before) {
        root.classList.remove('did-bite'); void root.offsetWidth; root.classList.add('did-bite');
      }
    } catch (error) {
      if (version === generation) { stopEating(); notice(`식사를 멈췄습니다 · ${error.message}`); }
    } finally {
      if (version === generation) {
        acting = false;
        if (held) biteTimer = setTimeout(bite, Math.max(30, (state?.me?.nextBiteAt || 0) - now() + 20));
        else void refresh();
      }
    }
  }
  function startEating(event) {
    const button = root?.querySelector('[data-death-eat]');
    if (!button || button.disabled || held) return;
    event?.preventDefault(); held = true; button.setAttribute('aria-pressed','true'); root.classList.add('is-eating');
    if (event?.pointerId != null) button.setPointerCapture(event.pointerId);
    void bite();
  }
  async function command(action, admin = false) {
    if (acting) return;
    if (action === 'join' && !root.querySelector('[data-death-consent] input').checked) return notice('전체 플레이 5분 제한 안내에 동의한 후 참가하세요.');
    if (action === 'cancel' && !confirm('현재 모집/경기를 종료합니까? 이미 발생한 사망 제한은 유지됩니다.')) return;
    const version = generation; acting = true;
    const key = `${action}:${state?.round?.id || ''}`;
    if (!requestKey || requestKey.key !== key) requestKey = { key, value:crypto.randomUUID() };
    try {
      const data = await request(action, { roundId:state?.round?.id, requestId:requestKey.value, acceptDeathPenalty:action === 'join' }, admin);
      if (version !== generation) return;
      requestKey = null; apply(data);
      notice(action === 'start' ? '운영자가 경기를 시작했습니다.' : action === 'join' ? '참가 신청 완료 · 운영자 시작을 기다립니다.' : '경기 상태가 반영되었습니다.');
    } catch (error) { if (version === generation) notice(error.message); }
    finally { if (version === generation) { acting = false; schedule(); } }
  }
  function close() {
    if (state?.me?.status === 'ALIVE' && state.round?.status === 'RUNNING') return notice('진행 중에는 경기 화면을 닫을 수 없습니다. 손을 떼면 식사가 멈춥니다.');
    stop(); previousFocus?.focus();
  }
  function open() {
    stop(); previousFocus = document.activeElement;
    const host = document.getElementById('clanCampView'); if (!host) return;
    host.insertAdjacentHTML('beforeend', `<section class="death-game-overlay" role="dialog" aria-modal="true" aria-labelledby="deathGameTitle" data-phase="CLOSED">
      <div class="death-game-window"><header class="death-game-header"><div><small>포로수용소 · 운영자 주최 경기</small><h2 id="deathGameTitle">죽음의 눈치게임</h2></div><button type="button" data-death-close aria-label="수용소로 돌아가기">닫기 ×</button></header>
      <div class="death-game-body"><main class="death-play"><div class="death-stage">
        <div class="death-stage-meta"><span><i></i> 수용소 식당</span><b data-death-timer>--:--</b></div>
        <div class="death-overseer" aria-hidden="true"></div><div class="death-table" aria-hidden="true"></div>
        <div class="death-tray" aria-hidden="true"><div class="death-peas">${Array.from({length:24},(_,i)=>`<i class="death-pea" style="--pea:${i}"></i>`).join('')}</div><div class="death-fork"></div></div>
        <div class="death-countdown" data-death-countdown hidden></div>
        <div class="death-phase"><i></i><strong data-death-heading>서버 연결 중</strong></div>
      </div><div class="death-control"><div class="death-progress-label"><span>내 식사 진행</span><b data-death-progress>0 / 24</b></div><div class="death-progress"><i data-death-fill></i></div>
        <label class="death-consent" data-death-consent hidden><input type="checkbox">사망하면 <b>숲켓몬 전체 플레이가 5분간 제한</b>되는 것에 동의합니다.</label>
        <div class="death-join-actions"><button type="button" data-death-join hidden>경기 참가 신청</button><button type="button" data-death-leave hidden>참가 취소</button></div>
        <button type="button" class="death-eat" data-death-eat aria-pressed="false" disabled><span aria-hidden="true">Ⅱ</span><b>누르고 있으면 먹기</b><small>손을 떼면 멈춤</small></button>
        <p class="death-help" data-death-help>운영자가 시작할 때만 진행됩니다.</p></div></main>
      <aside class="death-roster"><header><h3>참가자</h3><span data-death-count>0명</span></header><ol data-death-roster></ol><div class="death-rules"><b>감시자의 눈을 피하세요.</b><p>신문을 읽는 동안 먹고,<br>시선을 들면 즉시 손을 떼세요.</p><p>먼저 식사를 마친 순서로 순위가 정해집니다. 사망자는 탈락합니다.</p><strong>사망 → 전체 플레이 5분 제한</strong></div></aside></div>
      <footer class="death-game-footer"><p data-death-notice role="status">경기 기록을 불러오고 있습니다.</p><div class="death-operator" data-death-operator hidden><span>OWNER 운영</span><button type="button" data-death-command="open">참가 모집 열기</button><button type="button" data-death-command="start">경기 시작</button><button type="button" data-death-command="cancel">모집/경기 종료</button></div></footer></div></section>`);
    root = host.querySelector('.death-game-overlay');
    document.body.classList.add('death-game-open');
    const eat = root.querySelector('[data-death-eat]');
    on(eat, 'pointerdown', startEating); on(eat, 'pointerup', stopEating); on(eat, 'pointercancel', stopEating); on(eat, 'lostpointercapture', stopEating);
    on(window, 'blur', stopEating); on(document, 'visibilitychange', () => { if (document.hidden) stopEating(); });
    on(root, 'keydown', event => {
      if (event.key === 'Escape') { stopEating(); close(); }
      if (event.code === 'Space' && event.target === eat && !event.repeat) startEating(event);
      if (event.key === 'Tab') {
        const list = [...root.querySelectorAll('button:not(:disabled),input')].filter(n => n.getClientRects().length), first = list[0], last = list.at(-1);
        if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
        else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
      }
    });
    on(root, 'keyup', event => { if (event.code === 'Space') { event.preventDefault(); stopEating(); } });
    on(root, 'click', event => {
      if (event.target.closest('[data-death-close]')) close();
      if (event.target.closest('[data-death-join]')) void command('join');
      if (event.target.closest('[data-death-leave]')) void command('leave');
      const operator = event.target.closest('[data-death-command]'); if (operator) void command(operator.dataset.deathCommand, true);
    });
    root.querySelector('[data-death-close]').focus(); clock = setInterval(tick, 100); void refresh();
  }

  function lockView() {
    return `<section class="death-game-lock" aria-labelledby="deathLockTitle"><div class="death-lock-grain" aria-hidden="true"></div><div class="death-lock-copy"><span class="death-lock-eyebrow">죽음의 눈치게임 · 탈락</span><span class="death-lock-line" aria-hidden="true"></span><h1 id="deathLockTitle">사망하였습니다</h1><p>숲켓몬 전체 플레이가 일시 제한됩니다.</p><div class="death-lock-count"><small>플레이 재개까지</small><strong data-death-lock-timer>05:00</strong></div><p class="death-lock-note">새로고침·재접속해도 남은 제한 시간은 유지됩니다.<br>기존 수용소 형기는 별도로 유지됩니다.</p><p data-death-lock-notice role="status">제한 종료 후 서버에서 자동으로 다시 확인합니다.</p><div class="death-lock-actions"><button type="button" data-death-lock-refresh>상태 다시 확인</button><button type="button" data-death-lock-logout>로그아웃</button></div></div></section>`;
  }
  function bindLock(prison) {
    stop(); root = document.querySelector('.death-game-lock'); if (!root) return;
    const version = generation; offset = Number(prison.serverOffsetMs || 0);
    let until = Date.parse(String(prison.jailedUntil).includes('T') ? prison.jailedUntil : prison.jailedUntil.replace(' ','T') + 'Z');
    let pending = false, retryAt = 0;
    const check = async () => {
      if (pending || version !== generation) return; pending = true;
      try {
        const data = await apiRequest('prison/status', {}, { ttl:0, timeoutMs:10000 });
        if (version !== generation) return;
        if (data.serverNow) offset = Date.parse(data.serverNow) - Date.now();
        window.PrisonV1.apply(data.prison || {}, data);
        if (!data.prison?.incarcerated || data.prison.facility !== 'DEATH_GAME') {
          stop(); if (data.prison?.incarcerated) window.PrisonV1.renderLocked(data.prison); else renderShell('prisoncamp'); return;
        }
        until = Date.parse(data.prison.jailedUntil.replace(' ','T').replace(/Z?$/,'Z'));
      } catch (error) { if (version === generation) root.querySelector('[data-death-lock-notice]').textContent = `서버 확인이 필요합니다 · ${error.message}`; }
      finally { pending = false; retryAt = Date.now() + 5000; }
    };
    const update = () => { if (version !== generation || !root?.isConnected) return; root.querySelector('[data-death-lock-timer]').textContent = time(until - now()); if (now() >= until && Date.now() >= retryAt) void check(); };
    on(root.querySelector('[data-death-lock-refresh]'), 'click', check);
    on(root.querySelector('[data-death-lock-logout]'), 'click', () => { stop(); void prisonLogout(); });
    clock = setInterval(update, 1000); update(); void check();
  }
  window.PrisonDeathGame = Object.freeze({ open, stop, lockView, bindLock });
})();
