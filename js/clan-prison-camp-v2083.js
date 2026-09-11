(function () {
  'use strict';
  let room = null, root = null, epoch = 0, poll = null, clock = null, pending = false, sending = false, releasing = false, locked = false, offset = 0, releaseTarget = null;
  const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[c]));
  const stamp = value => Date.parse(String(value || '').includes('T') ? value : String(value || '').replace(' ', 'T') + 'Z');
  const duration = value => {
    const seconds = Math.max(0, Math.ceil((stamp(value) - Date.now() - offset) / 1000)) || 0;
    return [Math.floor(seconds / 3600), Math.floor(seconds % 3600 / 60), seconds % 60].map(v => String(v).padStart(2, '0')).join(':');
  };
  const date = value => new Intl.DateTimeFormat('ko-KR', {timeZone:'Asia/Seoul',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hour12:false}).format(new Date(stamp(value)));
  const request = (path, options = {}) => apiRequest('prison-camp/' + path, options, {ttl:0,timeoutMs:12000,replaceInflight:true});
  const activeRoot = () => root?.isConnected;

  function view(user, isLocked = false) {
    return `<section class="clan-camp ${isLocked ? 'is-locked' : ''}" id="clanCampView" aria-label="행정부 포로수용소">
      <header class="camp-header"><div class="camp-authority"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 21V3h16v18M8 3v18m4-18v18m4-18v18M4 8h16M4 17h16"/></svg><span>행정부 <i>/</i> 포로 관리국</span><b>외부 출입 통제</b></div>
        <div class="camp-actions">${isLocked ? '' : '<button type="button" data-camp-exit><span aria-hidden="true">←</span> 로비로 돌아가기</button>'}<button type="button" data-camp-logout>로그아웃</button></div></header>
      <div class="camp-layout"><div class="camp-main">
        <section class="camp-scene" aria-label="철창으로 봉쇄된 수용동">
          <div class="camp-scene-top"><span><i></i> DETENTION CAMP</span><span class="camp-seal">격리 시설</span></div>
          <div class="camp-title"><span class="camp-eyebrow">시즌의 끝. 철문이 닫힌다.</span><h1>포로수용소</h1><p>최하위 클랜 전원 격리</p></div>
          <div class="camp-gate-state"><i></i><b id="campGateLabel">수용 기록 조회 중</b></div>
          <div class="camp-iron" aria-hidden="true"></div><div class="camp-red-light" aria-hidden="true"></div>
          <div class="camp-scene-floor"><div class="camp-scene-copy" id="campSceneCopy"><span class="camp-scene-tag">수용동 기록</span><h2>입소 기록 확인 중</h2><p>잠시만 기다려 주세요.</p></div>
            <div class="camp-scene-stats"><div><small>현재 수감 인원</small><strong><span id="campOccupancy">—</span><em>명</em></strong></div><div class="camp-timer"><small id="campTimerLabel">남은 형기</small><strong id="campCountdown">--:--:--</strong><span>기본 형기 08시간</span></div></div></div>
        </section>
        <section class="camp-roster"><header><div><span class="camp-roster-mark" aria-hidden="true">≡</span><h2>수감자 명부</h2><small>INMATE REGISTER</small></div><span>정산 당시 전원</span></header><div id="campReleaseAll" class="camp-release-all"></div><div class="camp-inmates" id="campInmates"><p class="camp-empty">수용 기록을 불러오는 중입니다.</p></div></section>
        <div class="camp-warning"><svg viewBox="0 0 24 24" aria-hidden="true"><rect x="5" y="10" width="14" height="11" rx="1"/><path d="M8 10V7a4 4 0 0 1 8 0v3m-4 4v3"/></svg><p>수감 중에는 <b>수용소 채팅만</b> 이용할 수 있습니다.<span>형기 종료 또는 운영자 석방 후 모든 콘텐츠가 다시 열립니다.</span></p></div>
      </div><aside class="camp-chat"><header><div class="camp-chat-heading"><span class="camp-intercom" aria-hidden="true"><i></i><i></i><i></i><i></i></span><div><small>VISITATION ROOM</small><h2>면회 통신</h2></div></div><span class="camp-channel"><i></i> 공개 채팅</span></header>
        <div class="camp-chat-notice"><span>수용소 공개 채팅</span><b>포로 · 방문객</b></div>
        <div class="camp-chat-log" id="campChatLog" role="log" aria-label="수용소 채팅" aria-live="polite" aria-relevant="additions"><div class="camp-chat-empty"><span>···</span><p>채널 연결 중</p></div></div>
        <form id="campChatForm"><label for="campChatInput">수용소에 메시지 남기기</label><div><input id="campChatInput" autocomplete="off" maxlength="400" placeholder="채널 연결 중" disabled><button type="submit" disabled>전송 <span aria-hidden="true">↗</span></button></div><small><span>최대 200자 · 2초 간격</span><span>ENTER ↵</span></small></form>
        <div class="camp-chat-base" aria-hidden="true"><i></i><span>행정부 감시 채널</span><i></i></div>
      </aside></div>
      <div class="camp-status" role="status"><span id="campConnection">수용소에 연결하고 있습니다.</span><button type="button" data-camp-refresh>다시 확인</button></div>
      <footer class="camp-footer"><span>SOOPKETMON <i>/</i> ADMINISTRATION</span><p>8시간 후 자동 석방 · 운영자 조기 석방 가능</p></footer>
    </section>`;
  }

  function notice(message, error = false) {
    const node = root?.querySelector('#campConnection');
    if (node) { node.textContent = message; node.parentElement.classList.toggle('is-error', error); }
  }

  function paint({ bottom = false } = {}) {
    if (!activeRoot() || !room) return;
    const inmates = room.inmates || [], mine = inmates.find(row => row.userId === room.viewerId), selected = mine || inmates[0];
    root.querySelector('#campGateLabel').textContent = inmates.length ? '수용동 봉쇄 중' : '수감자 없음';
    root.querySelector('#campOccupancy').textContent = String(inmates.length);
    root.querySelector('#campTimerLabel').textContent = mine ? '내 남은 형기' : '다음 자동 석방까지';
    root.querySelector('#campSceneCopy').innerHTML = selected ? `<span class="camp-scene-tag">SEASON ${String(selected.seasonNo).padStart(2,'0')} <i>/</i> 최종 ${selected.finalRank}위</span><h2>${esc(selected.clanName)} <em>수감 중</em></h2><p>${locked ? '당신은 현재 이 수용동에 갇혀 있습니다.' : '시즌 정산 당시 클랜장과 클랜원 전원 수감'}</p>` : '<span class="camp-scene-tag">수용 대기</span><h2>비어 있는 수용동</h2><p>시즌 종료 후 최하위 클랜이 입소합니다.</p>';
    const groups = [...new Map(inmates.map(row => [row.seasonId, row])).values()];
    root.querySelector('#campReleaseAll').innerHTML = room.canRelease ? groups.map(row => `<button type="button" data-camp-release-all="${row.seasonId}" ${releasing ? 'disabled' : ''}>시즌 ${row.seasonNo} · ${esc(row.clanName)} 전원 석방</button>`).join('') : '';
    root.querySelector('#campInmates').innerHTML = inmates.length ? inmates.map((row, index) => `<article class="camp-inmate ${row.userId === room.viewerId ? 'is-self' : ''}"><span class="camp-number">${String(index + 1).padStart(2, '0')}</span><div><b>${esc(row.nickname)}${row.userId === room.viewerId ? '<em>나</em>' : ''}</b><small>${esc(row.clanName)} · ${row.memberRole === 'MASTER' ? '클랜장' : '클랜원'} · ${esc(date(row.jailedUntil))} 석방</small></div>${room.canRelease ? `<button type="button" data-camp-release="${row.userId}" data-season="${row.seasonId}" ${releasing ? 'disabled' : ''}>석방</button>` : '<span class="camp-inmate-state">수감</span>'}</article>`).join('') : '<p class="camp-empty">현재 수용된 클랜이 없습니다.<br><span>다음 시즌 정산 후 수감 명단이 기록됩니다.</span></p>';
    const log = root.querySelector('#campChatLog'), messages = room.messages || [], signature = JSON.stringify(messages);
    if (log.dataset.signature !== signature) {
      const follow = bottom || log.scrollHeight - log.clientHeight - log.scrollTop < 70;
      log.innerHTML = messages.length ? messages.map(row => `<article class="camp-message ${row.userId === room.viewerId ? 'is-mine' : ''}"><header><span class="${row.senderWasCaptive ? 'is-captive' : 'is-visitor'}">${row.senderWasCaptive ? '포로' : '방문객'}</span><b>${esc(row.nickname)}</b><time>${esc(date(row.createdAt).split(' ').slice(-1).join(' '))}</time></header><p>${esc(row.body)}</p></article>`).join('') : `<div class="camp-chat-empty"><span>···</span><p>${inmates.length ? '철창 너머로 말을 건네보세요.' : '수감자가 있을 때 채널이 열립니다.'}</p></div>`;
      log.dataset.signature = signature;
      if (follow) log.scrollTop = log.scrollHeight;
    }
    const input = root.querySelector('#campChatInput');
    input.disabled = !room.chatEnabled;
    input.placeholder = room.chatEnabled ? '메시지를 입력하세요' : '현재 수감자가 없습니다';
    root.querySelector('#campChatForm button').disabled = !room.chatEnabled || sending;
    tick();
  }

  function tick() {
    if (!activeRoot() || !room) return;
    const inmates = room.inmates || [], mine = inmates.find(row => row.userId === room.viewerId);
    const until = mine?.jailedUntil || inmates.map(row => row.jailedUntil).sort()[0];
    root.querySelector('#campCountdown').textContent = until ? duration(until) : '--:--:--';
  }

  function apply(next) {
    room = next;
    offset = Date.parse(next.serverNow) - Date.now();
    applyPrisonStatus(next.prison || {}, {serverNow:next.serverNow});
    if (locked && !next.prison?.incarcerated) { stop(); renderShell('buy'); return false; }
    if ((next.prison?.incarcerated && next.prison?.facility !== 'CLAN_CAMP') || (!locked && next.prison?.incarcerated)) {
      stop(); renderLockedPrison(next.prison); return false;
    }
    paint(); return true;
  }

  async function refresh() {
    if (!activeRoot() || pending) return;
    const version = epoch; pending = true;
    try {
      const next = await request('status');
      if (version !== epoch || !activeRoot()) return;
      if (apply(next)) notice('수용 기록 확인 · ' + new Intl.DateTimeFormat('ko-KR', {hour:'2-digit',minute:'2-digit',second:'2-digit'}).format(new Date()));
    } catch (error) { if (version === epoch) notice(error.message || '연결이 끊겼습니다. 다시 확인해 주세요.', true); }
    finally { if (version === epoch) { pending = false; clearTimeout(poll); if (activeRoot()) poll = setTimeout(refresh, 5000); } }
  }

  function closeReleaseDialog() {
    root?.querySelector('.camp-release-dialog')?.remove();releaseTarget = null;
    root?.querySelector('[data-camp-release-all]')?.focus();
  }

  async function release(seasonId, userId, confirmed = false) {
    if (releasing || !room?.canRelease) return;
    const version = epoch, person = room.inmates.find(row => row.seasonId === seasonId && row.userId === userId);
    if (!confirmed) {
      const group = room.inmates.filter(row => row.seasonId === seasonId), name = userId ? person?.nickname : `${group[0]?.clanName || ''} 전원`;
      if (!group.length || (userId && !person)) return;
      releaseTarget = {seasonId,userId};root.querySelector('.camp-release-dialog')?.remove();
      root.insertAdjacentHTML('beforeend', `<div class="camp-release-dialog" role="dialog" aria-modal="true" aria-labelledby="campReleaseTitle"><div class="camp-release-sheet"><small>RELEASE AUTHORIZATION</small><h2 id="campReleaseTitle">석방 명령</h2><p><b>${esc(name)}</b><span>시즌 ${group[0].seasonNo} · ${userId ? 1 : group.length}명 조기 석방</span></p><div>남은 형기와 관계없이 지금 석방합니다.<br>운영자와 석방 시각이 기록됩니다.</div><footer><button type="button" data-camp-cancel>취소</button><button type="button" data-camp-confirm>석방 확정</button></footer></div></div>`);
      root.querySelector('[data-camp-cancel]').focus();return;
    }
    closeReleaseDialog();
    releasing = true; paint();
    try {
      const result = await request('release', {method:'POST',body:JSON.stringify({seasonId, ...(userId ? {userId} : {})})});
      if (version !== epoch) return;
      if (apply(result.state)) notice(`${result.releasedCount}명 석방 완료`);
    } catch (error) { if (version === epoch) notice(error.message, true); }
    finally { if (version === epoch) { releasing = false; paint(); } }
  }

  function stop() {
    epoch++; clearTimeout(poll); clearInterval(clock); poll = clock = null; root = null;
    pending = sending = releasing = false;releaseTarget = null;
  }

  function bind(user, isLocked = false) {
    stop(); root = document.getElementById('clanCampView'); locked = isLocked; room = null;
    if (!root) return;
    const version = epoch;
    root.addEventListener('click', event => {
      const button = event.target.closest('button'); if (!button) return;
      if (button.hasAttribute('data-camp-exit')) renderShell('buy');
      else if (button.hasAttribute('data-camp-logout')) void prisonLogout();
      else if (button.hasAttribute('data-camp-refresh')) void refresh();
      else if (button.hasAttribute('data-camp-cancel')) closeReleaseDialog();
      else if (button.hasAttribute('data-camp-confirm') && releaseTarget) void release(releaseTarget.seasonId, releaseTarget.userId, true);
      else if (button.hasAttribute('data-camp-release-all')) void release(Number(button.dataset.campReleaseAll));
      else if (button.hasAttribute('data-camp-release')) void release(Number(button.dataset.season), Number(button.dataset.campRelease));
    });
    root.addEventListener('keydown', event => {
      if (!releaseTarget) return;
      if (event.key === 'Escape') { event.preventDefault(); closeReleaseDialog(); }
      if (event.key === 'Tab') {
        const buttons = root.querySelectorAll('.camp-release-dialog button'), first = buttons[0], last = buttons[buttons.length - 1];
        if (event.shiftKey && document.activeElement === first) {event.preventDefault();last.focus();}
        else if (!event.shiftKey && document.activeElement === last) {event.preventDefault();first.focus();}
      }
    });
    root.querySelector('#campChatForm').addEventListener('submit', async event => {
      event.preventDefault(); if (sending || !room?.chatEnabled) return;
      const input = root.querySelector('#campChatInput'), body = input.value.trim();
      if (!body || Array.from(body).length > 200) { notice('메시지는 1~200자로 입력해 주세요.', true); return; }
      sending = true; paint();
      try {
        const next = await request('chat', {method:'POST',body:JSON.stringify({body})});
        if (version !== epoch) return;
        input.value = ''; if (apply(next)) { paint({bottom:true}); notice('메시지를 보냈습니다.'); input.focus(); }
      } catch (error) { if (version === epoch) notice(error.message, true); }
      finally { if (version === epoch) { sending = false; paint(); } }
    });
    clock = setInterval(tick, 1000); void refresh();
  }
  window.ClanPrisonCamp = Object.freeze({view,bind,stop});
})();
