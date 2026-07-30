(() => {
  const ROLE = {
    ATTACK: { label: '파괴 봉인', icon: '⚔', description: '보스의 외피와 핵을 파괴합니다.' },
    GUARD: { label: '수호 봉인', icon: '◆', description: '보스의 광역 공격을 억제합니다.' },
    PURIFY: { label: '정화 봉인', icon: '✦', description: '오염된 마력을 정화합니다.' }
  };
  const esc = value => String(value ?? '').replace(/[&<>"']/g, char => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[char]));
  const api = (path, options = {}) => window.apiRequest(path, options, { ttl: 0 });
  let active = false;
  let loading = false;
  let latest = null;

  function source(value) {
    const text = String(value || '').trim();
    if (!text) return '';
    if (/^(?:https?:|data:|blob:|\/)/i.test(text)) return text;
    return '/' + text.replace(/^\.\//, '');
  }

  function requestId() {
    let random = Math.random().toString(36).slice(2);
    try { random = crypto.randomUUID(); } catch {}
    return `seal:${Date.now()}:${random}`;
  }

  function number(value) {
    return Math.max(0, Number(value || 0)).toLocaleString();
  }

  function percent(value) {
    return Math.max(0, Math.min(100, Number(value || 0)));
  }

  function formatTime(value) {
    if (!value) return '별도 종료 시각 없음';
    const time = Date.parse(value);
    if (!Number.isFinite(time)) return esc(value);
    return new Intl.DateTimeFormat('ko-KR', {
      month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit',
      hour12: false, timeZone: 'Asia/Seoul'
    }).format(new Date(time));
  }

  function updateBalances(balances) {
    if (!balances || typeof window.loadUser !== 'function' || typeof window.saveUser !== 'function') return;
    const saved = window.loadUser();
    if (!saved) return;
    if (balances.coin != null) saved.coin = Number(balances.coin);
    if (balances.cardShards != null) saved.cardShards = Number(balances.cardShards);
    window.saveUser(saved);
  }

  function statusLabel(data) {
    const event = data?.event;
    if (!event) return ['미운영', '현재 진행 중인 봉인전이 없습니다.'];
    if (event.status === 'CLEARED') return ['봉인 완료', '서버 전체가 세 개의 봉인을 완성했습니다.'];
    if (event.status === 'ENDED') return ['종료', '이번 봉인전은 종료되었습니다.'];
    if (data?.availability?.code === 'NOT_STARTED') return ['시작 대기', data.availability.message];
    if (!data?.availability?.open) return ['운영 중지', data?.availability?.message || '현재 참여할 수 없습니다.'];
    return ['진행 중', '서버 공동 봉인 의식이 진행 중입니다.'];
  }

  function sealCard(roleKey, data) {
    const role = data.event.roles[roleKey];
    const meta = ROLE[roleKey];
    const lowest = (data.lowestRoleKeys || []).includes(roleKey);
    const canAct = data.availability?.open && data.deck?.ready && Number(data.progress?.remainingAttempts || 0) > 0 && !role.completed;
    return `<article class="seal-role-card role-${roleKey.toLowerCase()} ${role.completed ? 'completed' : ''} ${lowest ? 'lowest' : ''}">
      <header><span>${meta.icon}</span><div><small>${role.completed ? 'SEAL COMPLETE' : 'COOPERATIVE ROLE'}</small><h3>${meta.label}</h3></div>${lowest && !role.completed ? `<em>지원 보너스 +${Number(data.event.lowestRoleBonusPercent || 0)}%</em>` : ''}</header>
      <p>${meta.description}</p>
      <div class="seal-progress-numbers"><b>${number(role.progress)}</b><span>/ ${number(role.target)}</span></div>
      <div class="seal-progress-track"><i style="width:${percent(role.percent)}%"></i><u style="left:${percent(role.percent)}%"></u></div>
      <footer><span>${role.completed ? '봉인 완료' : `${role.percent.toFixed(2)}%`}</span><small>역할 배율 ${Number(role.multiplier || 100)}%</small></footer>
      <button type="button" class="seal-action-button" data-seal-role="${roleKey}" ${canAct ? '' : 'disabled'}>${role.completed ? '완료된 봉인' : `${meta.label} 참여`}</button>
    </article>`;
  }

  function emptyView(message, detail = '') {
    return `<section class="seal-empty"><div class="seal-empty-mark">封</div><h2>${esc(message)}</h2>${detail ? `<p>${esc(detail)}</p>` : ''}<button type="button" id="sealRefresh">다시 확인</button></section>`;
  }

  function render(data = latest) {
    const root = document.getElementById('pveSealBattleView');
    if (!root || !active) return;
    latest = data;
    if (!data?.event) {
      root.innerHTML = emptyView('현재 진행 중인 봉인전이 없습니다.', 'CMS에서 봉인전을 시작하면 이곳에 공동 보스가 등장합니다.');
      root.querySelector('#sealRefresh')?.addEventListener('click', load);
      return;
    }

    const event = data.event;
    const [badge, line] = statusLabel(data);
    const bossImage = source(event.bossImage);
    const progress = data.progress || {};
    const clear = data.clearReward || {};
    const canClaim = clear.eligible && !clear.claimed && !clear.processing;
    root.innerHTML = `<section class="seal-battle-shell">
      <section class="seal-hero ${String(event.status || '').toLowerCase()}">
        <div class="seal-hero-copy">
          <div class="seal-kicker"><span>SERVER COOPERATIVE BOSS</span><em>${esc(badge)}</em></div>
          <h1>${esc(event.title || '봉인전')}</h1>
          <h2>${esc(event.bossName || '봉인 보스')}</h2>
          <p>${esc(event.description || '')}</p>
          <div class="seal-live-line"><i></i><span>${esc(line)}</span><small>종료 ${formatTime(event.endsAt)}</small></div>
          <div class="seal-hero-actions"><button type="button" id="sealRefresh" class="ghost">진행도 새로고침</button><button type="button" id="sealRankings" class="ghost">공헌도 현황</button></div>
        </div>
        <div class="seal-boss-stage">
          <div class="seal-rune-ring"><i></i><i></i><i></i></div>
          ${bossImage ? `<img src="${esc(bossImage)}" alt="${esc(event.bossName)}">` : '<div class="seal-boss-placeholder"><span>封</span><small>BOSS IMAGE</small></div>'}
          <div class="seal-boss-status"><span>${esc(badge)}</span><b>${number(data.stats?.participants)}명 참여</b><small>총 ${number(data.stats?.attempts)}회 의식</small></div>
        </div>
      </section>

      <section class="seal-personal-bar">
        <article><small>내 PvE 덱</small><b>${data.deck?.ready ? number(data.deck.power) : '편성 필요'}</b><span>${data.deck?.ready ? '장비·시너지 포함 전투력' : esc(data.deck?.error || 'PvE 덱 5장을 저장해주세요.')}</span></article>
        <article><small>오늘 남은 참여</small><b>${Number(progress.remainingAttempts || 0)}<em>/ ${Number(event.dailyAttempts || 0)}</em></b><span>매일 KST 00시 초기화</span></article>
        <article><small>내 누적 공헌도</small><b>${number(progress.totalContribution)}</b><span>총 ${number(progress.totalAttempts)}회 참여</span></article>
        <article><small>참여 보상</small><b>코인 ${number(event.attemptReward?.coin)}</b><span>카드 조각 ${number(event.attemptReward?.shards)}개</span></article>
      </section>

      ${data.pendingClearReward ? `<section class="seal-pending-reward"><div><small>PREVIOUS CLEAR REWARD</small><h3>${esc(data.pendingClearReward.title)} 완료 보상 미수령</h3><p>${esc(data.pendingClearReward.bossName || '')} 봉인 완료 보상을 지금 받을 수 있습니다.</p></div><div><span>코인 <b>${number(data.pendingClearReward.reward?.coin)}</b></span><span>카드 조각 <b>${number(data.pendingClearReward.reward?.shards)}</b></span><button type="button" data-seal-pending-claim="${Number(data.pendingClearReward.eventId)}" ${data.pendingClearReward.processing ? 'disabled' : ''}>${data.pendingClearReward.processing ? '처리 중' : '지난 봉인전 보상 받기'}</button></div></section>` : ''}

      <section class="seal-role-grid">
        ${sealCard('ATTACK', data)}
        ${sealCard('GUARD', data)}
        ${sealCard('PURIFY', data)}
      </section>

      <section class="seal-clear-panel ${event.status === 'CLEARED' ? 'ready' : ''}">
        <div><small>SERVER CLEAR REWARD</small><h2>${event.status === 'CLEARED' ? '봉인 완료 보상' : '세 개의 봉인을 모두 완성하세요'}</h2><p>이번 봉인전에 1회 이상 참여한 유저만 완료 보상을 받을 수 있습니다.</p></div>
        <div class="seal-clear-reward"><span>코인 <b>${number(event.clearReward?.coin)}</b></span><span>카드 조각 <b>${number(event.clearReward?.shards)}</b></span></div>
        <button type="button" id="sealClearClaim" ${canClaim ? '' : 'disabled'}>${clear.claimed ? '보상 수령 완료' : clear.processing ? '보상 처리 중' : event.status === 'CLEARED' ? (clear.eligible ? '봉인 완료 보상 받기' : '참여 기록 없음') : '봉인 완료 후 수령'}</button>
      </section>

      <section class="seal-guide">
        <div><b>1</b><span><strong>역할 선택</strong><small>현재 가장 부족한 봉인에는 지원 보너스가 적용됩니다.</small></span></div>
        <div><b>2</b><span><strong>서버 공동 누적</strong><small>개인 딜 순위가 아니라 세 역할의 공동 목표 달성이 핵심입니다.</small></span></div>
        <div><b>3</b><span><strong>전원 봉인 완료</strong><small>세 봉인이 모두 완성되면 참여자 전원이 완료 보상을 받을 수 있습니다.</small></span></div>
      </section>
    </section>`;

    root.querySelectorAll('[data-seal-role]').forEach(button => {
      button.addEventListener('click', () => participate(button.dataset.sealRole, button));
    });
    root.querySelector('#sealRefresh')?.addEventListener('click', load);
    root.querySelector('#sealRankings')?.addEventListener('click', showRankings);
    root.querySelector('#sealClearClaim')?.addEventListener('click', claimClearReward);
    root.querySelector('[data-seal-pending-claim]')?.addEventListener('click', claimClearReward);
    root.querySelector('.seal-boss-stage img')?.addEventListener('error', event => {
      event.currentTarget.replaceWith(Object.assign(document.createElement('div'), {
        className: 'seal-boss-placeholder', innerHTML: '<span>封</span><small>IMAGE LOAD FAILED</small>'
      }));
    }, { once: true });
  }

  function ritualModal(roleKey) {
    const modal = document.getElementById('modal');
    if (!modal) return null;
    const meta = ROLE[roleKey];
    modal.className = `modal show seal-ritual-modal role-${roleKey.toLowerCase()}`;
    modal.innerHTML = `<div class="seal-ritual-stage">
      <div class="seal-ritual-circle"><i></i><i></i><i></i><span>${meta.icon}</span></div>
      <small>SEAL RITUAL</small><h2>${meta.label}</h2><p id="sealRitualMessage">PvE 덱의 힘을 봉인진에 연결하는 중...</p>
      <div class="seal-ritual-loader"><i></i></div>
    </div>`;
    return modal;
  }

  function ritualResult(modal, roleKey, result) {
    if (!modal) return;
    const meta = ROLE[roleKey];
    const stage = modal.querySelector('.seal-ritual-stage');
    stage.classList.add('complete');
    stage.innerHTML = `<div class="seal-ritual-success">${meta.icon}</div><small>CONTRIBUTION COMPLETE</small><h2>${meta.label} 공헌 완료</h2>
      <strong>+${number(result.contribution)}</strong>
      <p>덱 전투력 ${number(result.deckPower)}${Number(result.bonusPercent || 0) > 0 ? ` · 부족 역할 지원 +${Number(result.bonusPercent)}%` : ''}</p>
      <div class="seal-result-reward"><span>코인 +${number(result.reward?.coin)}</span><span>카드 조각 +${number(result.reward?.shards)}</span></div>
      <button type="button" id="sealRitualClose">봉인전으로 돌아가기</button>`;
    stage.querySelector('#sealRitualClose').onclick = () => {
      modal.className = 'modal';
      modal.innerHTML = '';
    };
  }

  async function participate(roleKey, button) {
    if (loading) return;
    const meta = ROLE[roleKey];
    if (!confirm(`${meta.label} 역할로 오늘의 참여 횟수 1회를 사용할까요?`)) return;
    loading = true;
    button.disabled = true;
    const modal = ritualModal(roleKey);
    try {
      const result = await api('seal-battle/participate', {
        method: 'POST',
        body: JSON.stringify({ requestId: requestId(), role: roleKey })
      });
      updateBalances(result.balances);
      latest = result.state || latest;
      render(latest);
      ritualResult(modal, roleKey, result);
    } catch (error) {
      if (modal) { modal.className = 'modal'; modal.innerHTML = ''; }
      alert(error.message);
      await load();
    } finally {
      loading = false;
    }
  }

  async function claimClearReward(event) {
    const button = event.currentTarget;
    if (!confirm('봉인 완료 보상을 수령할까요?')) return;
    button.disabled = true;
    try {
      const eventId = Number(button.dataset.sealPendingClaim || 0);
      const result = await api('seal-battle/clear-reward', { method: 'POST', body: JSON.stringify(eventId ? { eventId } : {}) });
      updateBalances(result.balances);
      alert(`봉인 완료 보상을 수령했습니다.\n코인 ${number(result.reward?.coin)} · 카드 조각 ${number(result.reward?.shards)}`);
      await load();
    } catch (error) {
      alert(error.message);
      button.disabled = false;
    }
  }

  function rankingRows(rows, valueKey = 'total_contribution') {
    return (rows || []).map((row, index) => `<div class="seal-ranking-row"><b>${index + 1}</b><span>${esc(row.nickname || '-')}<small>${number(row.total_attempts)}회 참여</small></span><strong>${number(row[valueKey])}</strong></div>`).join('') || '<div class="seal-ranking-empty">아직 공헌 기록이 없습니다.</div>';
  }

  async function showRankings() {
    const modal = document.getElementById('modal');
    if (!modal) return;
    modal.className = 'modal show seal-ranking-modal';
    modal.innerHTML = '<div class="seal-ranking-panel"><div class="seal-ranking-loading"><i></i><b>공헌도 현황을 불러오는 중...</b></div></div>';
    try {
      const data = await api('seal-battle/rankings');
      const panel = modal.querySelector('.seal-ranking-panel');
      panel.innerHTML = `<header><div><small>COOPERATIVE CONTRIBUTION</small><h2>봉인전 공헌도 현황</h2><p>순위는 현황 확인용이며 봉인 완료 보상은 참여자 모두에게 동일하게 지급됩니다.</p></div><button type="button" id="sealRankingClose">×</button></header>
        <nav class="seal-ranking-tabs"><button class="active" data-rank-tab="overall">전체</button><button data-rank-tab="ATTACK">파괴</button><button data-rank-tab="GUARD">수호</button><button data-rank-tab="PURIFY">정화</button></nav>
        <div id="sealRankingList">${rankingRows(data.overall)}</div>`;
      panel.querySelector('#sealRankingClose').onclick = () => { modal.className = 'modal'; modal.innerHTML = ''; };
      panel.querySelectorAll('[data-rank-tab]').forEach(button => {
        button.onclick = () => {
          panel.querySelectorAll('[data-rank-tab]').forEach(item => item.classList.toggle('active', item === button));
          const key = button.dataset.rankTab;
          panel.querySelector('#sealRankingList').innerHTML = key === 'overall'
            ? rankingRows(data.overall)
            : rankingRows(data.roles?.[key], 'contribution');
        };
      });
    } catch (error) {
      modal.className = 'modal';
      modal.innerHTML = '';
      alert(error.message);
    }
  }

  async function load() {
    const root = document.getElementById('pveSealBattleView');
    if (!root || !active || loading) return;
    loading = true;
    root.innerHTML = '<section class="seal-loading"><div class="seal-loading-rune">封</div><h2>봉인진을 동기화하는 중...</h2><p>서버 공동 진행도와 내 참여 기록을 확인합니다.</p></section>';
    try {
      latest = await api('seal-battle/status');
      render(latest);
    } catch (error) {
      root.innerHTML = emptyView('봉인전 정보를 불러오지 못했습니다.', error.message);
      root.querySelector('#sealRefresh')?.addEventListener('click', load);
    } finally {
      loading = false;
    }
  }

  function deactivate() {
    active = false;
    const view = document.getElementById('pveSealBattleView');
    if (view) view.hidden = true;
  }

  function activate(button) {
    active = true;
    const hunt = document.getElementById('pveHuntView');
    const raid = document.getElementById('pveRaidView');
    const rift = document.getElementById('pveRiftView');
    const view = document.getElementById('pveSealBattleView');
    if (hunt) hunt.hidden = true;
    if (raid) raid.hidden = true;
    if (rift) rift.hidden = true;
    if (view) view.hidden = false;
    document.querySelectorAll('.pve-mode-btn').forEach(item => item.classList.toggle('active', item === button));
    load();
  }

  function install() {
    const tabs = document.querySelector('.pve-mode-tabs');
    const raidView = document.getElementById('pveRaidView');
    if (!tabs || !raidView) return;
    let view = document.getElementById('pveSealBattleView');
    if (!view) {
      view = document.createElement('div');
      view.id = 'pveSealBattleView';
      view.className = 'pve-seal-battle-view';
      view.hidden = true;
      raidView.insertAdjacentElement('afterend', view);
    }
    if (!tabs.querySelector('[data-seal-battle-mode]')) {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'pve-mode-btn seal-battle-tab';
      button.dataset.sealBattleMode = '1';
      button.innerHTML = '<span>封</span> 봉인전';
      button.onclick = () => activate(button);
      tabs.appendChild(button);
    }
    tabs.querySelectorAll('.pve-mode-btn:not([data-seal-battle-mode])').forEach(button => {
      if (button.dataset.sealDeactivateBound === '1') return;
      button.dataset.sealDeactivateBound = '1';
      button.addEventListener('click', deactivate, { capture: true });
    });
  }

  window.addEventListener('cnine:force-main', deactivate);
  new MutationObserver(install).observe(document.documentElement, { childList: true, subtree: true });
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', install, { once: true });
  else install();
})();
