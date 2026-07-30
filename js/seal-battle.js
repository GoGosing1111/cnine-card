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
    if (event.status === 'FAILED') return ['봉인 실패', '제한 시간 안에 세 봉인을 완성하지 못해 보스가 봉인진을 돌파했습니다.'];
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
      <footer><span>${role.completed ? '봉인 완료' : `${role.percent.toFixed(2)}%`}</span><small>보스 전투력 ${number(role.battlePower)} · 공헌 ${Number(role.multiplier || 100)}%</small></footer>
      <button type="button" class="seal-action-button" data-seal-role="${roleKey}" ${canAct ? '' : 'disabled'}>${role.completed ? '완료된 봉인' : `${meta.label} 보스 전투`}</button>
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
          <div class="seal-boss-status"><span>${esc(badge)}</span><b>${number(data.stats?.participants)}명 참여</b><small>총 ${number(data.stats?.attempts)}회 전투</small></div>
        </div>
      </section>

      <section class="seal-personal-bar">
        <article><small>내 PvE 전투 덱</small><b>${data.deck?.ready ? number(data.deck.power) : '편성 필요'}</b><span>${data.deck?.ready ? '카드 5장 · 장비·시너지 포함' : esc(data.deck?.error || 'PvE 덱 5장을 저장해주세요.')}</span></article>
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

      ${event.status === 'FAILED' ? `<section class="seal-failure-panel"><div><small>SEAL BREACH</small><h2>봉인 실패 · 보스 탈출</h2><p>제한 시간 안에 ${event.failureRoleKeys.map(key => ROLE[key]?.label).filter(Boolean).join(' · ') || '미완성 봉인'}을 완성하지 못했습니다. 진행도는 동결되며 완료 보상은 지급되지 않습니다.</p></div><div class="seal-failure-runes">${event.failureRoleKeys.map(key => `<span class="role-${key.toLowerCase()}">${ROLE[key]?.icon}<b>${ROLE[key]?.label}</b><em>${Number(event.roles[key]?.percent || 0).toFixed(1)}%</em></span>`).join('')}</div></section>` : `<section class="seal-clear-panel ${event.status === 'CLEARED' ? 'ready' : ''}">
        <div><small>SERVER CLEAR REWARD</small><h2>${event.status === 'CLEARED' ? '봉인 완료 보상' : '세 개의 봉인을 모두 완성하세요'}</h2><p>이번 봉인전에 1회 이상 참여한 유저만 완료 보상을 받을 수 있습니다.</p></div>
        <div class="seal-clear-reward"><span>코인 <b>${number(event.clearReward?.coin)}</b></span><span>카드 조각 <b>${number(event.clearReward?.shards)}</b></span></div>
        <button type="button" id="sealClearClaim" ${canClaim ? '' : 'disabled'}>${clear.claimed ? '보상 수령 완료' : clear.processing ? '보상 처리 중' : event.status === 'CLEARED' ? (clear.eligible ? '봉인 완료 보상 받기' : '참여 기록 없음') : '봉인 완료 후 수령'}</button>
      </section>`}

      <section class="seal-guide">
        <div><b>1</b><span><strong>역할 보스 전투</strong><small>저장된 PvE 덱으로 실제 전투하며 승패가 판정됩니다.</small></span></div>
        <div><b>2</b><span><strong>승패별 공동 공헌</strong><small>승리는 정상 공헌, 패배는 ${Number(event.defeatContributionPercent || 0)}%만 인정됩니다.</small></span></div>
        <div><b>3</b><span><strong>제한 시간 봉인</strong><small>종료 전 세 봉인을 못 채우면 실패 처리되고 완료 보상이 소멸합니다.</small></span></div>
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

  const battleSleepSafe = ms => typeof globalThis.battleSleep === 'function'
    ? globalThis.battleSleep(ms)
    : new Promise(resolve => setTimeout(resolve, ms));

  function fighterHtml(card, index) {
    if (typeof globalThis.battleFighterHtml === 'function') return globalThis.battleFighterHtml(card, index);
    const image = source(card?.image);
    return `<div class="battle-card-fighter" data-fighter="${index}" style="--i:${index}"><div class="fighter-aura"></div><div class="seal-fallback-fighter">${image ? `<img src="${esc(image)}">` : '<span>◆</span>'}<b>${esc(card?.title || '카드')}</b><small>${esc(card?.grade || card?.rarity || 'C')}</small></div></div>`;
  }

  function sealCombatModal(roleKey) {
    const modal = document.getElementById('modal');
    if (!modal) return null;
    const meta = ROLE[roleKey];
    const event = latest?.event || {};
    const role = event.roles?.[roleKey] || {};
    const previewCards = latest?.deck?.cards || [];
    const bossImage = source(event.bossImage);
    modal.className = `modal show battle-modal seal-combat-modal role-${roleKey.toLowerCase()}`;
    modal.innerHTML = `<div class="modal-panel battle-stage seal-battle-stage intro">
      <div class="battle-backdrop"></div><div class="battle-fx-layer"></div>
      <div class="battle-topline"><span>SOOPKETMON SEAL BATTLE</span><b id="battlePhase">SEAL ENCOUNTER</b></div>
      <div class="seal-combat-role-chip"><span>${meta.icon}</span><b>${meta.label}</b><small>패배 시 공헌 ${Number(event.defeatContributionPercent || 0)}%</small></div>
      <div class="battle-hud">
        <div class="battle-hp battle-hp-team"><div class="battle-hp-head"><b>PVE SEAL TEAM</b><span data-hp-text="team">100 / 100 · 100%</span></div><div class="battle-hp-track"><u data-hp-trail="team"></u><i data-hp-fill="team"></i><em>K.O.</em></div><small>전투력 ${number(latest?.deck?.power)}</small></div>
        <div class="battle-hp battle-hp-enemy"><div class="battle-hp-head"><b>${esc(event.bossName || '봉인 보스')}</b><span data-hp-text="enemy">100 / 100 · 100%</span></div><div class="battle-hp-track"><u data-hp-trail="enemy"></u><i data-hp-fill="enemy"></i><em>SEALED</em></div><small>역할 전투력 ${number(role.battlePower)}</small></div>
      </div>
      <div class="battle-arena">
        <div class="battle-side player-side"><div class="battle-team">${previewCards.map(fighterHtml).join('') || '<div class="seal-team-linking">PvE 덱 연결 중...</div>'}</div><small>MEMBER SEAL TEAM</small></div>
        <div class="battle-center"><strong class="battle-vs-mark">VS</strong><span id="battleCountdown"></span></div>
        <div class="battle-side enemy-side"><div class="battle-enemy-card boss seal-role-boss"><div class="enemy-card-badge">${meta.label}</div><div class="battle-enemy-visual">${bossImage ? `<img src="${esc(bossImage)}" alt="${esc(event.bossName || '')}">` : '<div class="monster-placeholder">封</div>'}</div><div class="battle-enemy-title">${esc(event.bossName || '봉인 보스')}</div><div class="enemy-card-power">POWER ${number(role.battlePower)}</div></div></div>
      </div>
      <div class="battle-impact"><i></i><i></i><i></i></div>
      <div id="battleMessage" class="battle-message"><span>PvE 덱과 봉인진을 연결하는 중...</span></div>
    </div>`;
    const stage = modal.querySelector('.battle-stage');
    if (typeof globalThis.ensureBattleSoundButton === 'function') globalThis.ensureBattleSoundButton(stage);
    return modal;
  }

  function setHp(stage, target, value) {
    if (typeof globalThis.battleSetHp === 'function') return globalThis.battleSetHp(stage, target, value);
    const fill = stage.querySelector(`[data-hp-fill="${target}"]`);
    const label = stage.querySelector(`[data-hp-text="${target}"]`);
    if (fill) fill.style.width = `${Math.max(0, Math.min(100, value))}%`;
    if (label) label.textContent = `${Math.ceil(value)} / 100 · ${Math.ceil(value)}%`;
  }

  function burst(stage, target = 'enemy', critical = false, text = '') {
    const x = target === 'enemy' ? '74%' : '27%';
    if (typeof globalThis.battleBurst === 'function') globalThis.battleBurst(stage, x, '43%', critical ? 46 : 22);
    if (typeof globalThis.battleDamage === 'function') globalThis.battleDamage(stage, text || (critical ? 'SEAL BREAK!' : 'HIT'), target, critical);
  }

  async function animateSealCombat(modal, roleKey, result) {
    if (!modal) return;
    const meta = ROLE[roleKey];
    const stage = modal.querySelector('.battle-stage');
    const phase = stage.querySelector('#battlePhase');
    const message = stage.querySelector('#battleMessage');
    const cards = Array.isArray(result.cards) && result.cards.length ? result.cards : (latest?.deck?.cards || []);
    const team = stage.querySelector('.player-side .battle-team');
    if (team && cards.length) team.innerHTML = cards.map(fighterHtml).join('');
    const teamPowerLabel = stage.querySelector('.battle-hp-team small');
    const bossPowerLabel = stage.querySelector('.battle-hp-enemy small');
    if (teamPowerLabel) teamPowerLabel.textContent = `전투력 ${number(result.playerPower || result.deckPower)}`;
    if (bossPowerLabel) bossPowerLabel.textContent = `역할 전투력 ${number(result.bossPower)}`;

    if (result.replayed) {
      stage.classList.add(result.result === 'WIN' ? 'battle-win-v863' : 'battle-lose-v863');
      phase.textContent = 'RESULT RESTORED';
      message.innerHTML = `<strong>처리 완료된 전투</strong><span>중복 요청이 차단되어 기존 결과만 불러왔습니다.</span><div class="battle-reward-pop"><small>공헌도</small><b>+${number(result.contribution)}</b></div><button type="button" class="seal-battle-return">봉인전으로 돌아가기</button>`;
      message.querySelector('.seal-battle-return').onclick = () => { modal.className = 'modal'; modal.innerHTML = ''; };
      return;
    }

    if (result.uniqueAbility?.battleEffects?.events?.length && typeof globalThis.playUniqueBattleEventSequence === 'function') {
      await globalThis.playUniqueBattleEventSequence(stage, phase, message, result.uniqueAbility, cards, false);
      phase.textContent = 'UNIQUE ABILITY READY';
      await battleSleepSafe(180);
    }

    let enemyHp = 100;
    let teamHp = 100;
    const win = result.result === 'WIN';
    const bossPower = Math.max(1, Number(result.bossPower || 1));
    const ultimateDamage = Math.max(0, Number(result.ultimateDamage || 0));

    if (result.activatedUltimate) {
      phase.textContent = 'ULTIMATE READY';
      if (typeof globalThis.playBattleUltimate === 'function') await globalThis.playBattleUltimate(stage, result.activatedUltimate, ultimateDamage);
      const ultimatePct = Math.min(72, ultimateDamage / bossPower * 100);
      if (ultimatePct > 0) {
        enemyHp = Math.max(0, enemyHp - ultimatePct);
        setHp(stage, 'enemy', enemyHp);
        burst(stage, 'enemy', true, `-${number(ultimateDamage)}`);
        await battleSleepSafe(760);
      }
    }

    const cardPowerTotal = Math.max(1, cards.reduce((sum, card) => sum + Math.max(1, Number(card.power || 0)), 0));
    const desiredCardDamage = win
      ? Math.max(0, enemyHp)
      : Math.max(8, Math.min(enemyHp - 8, Number(result.playerPower || 0) / bossPower * 78));
    const counterIndices = win ? new Set([1, 3]) : new Set([0, 2, 4]);
    const loseHits = [24, 31, 45];
    let loseHitIndex = 0;

    for (let index = 0; index < cards.length && enemyHp > 0 && teamHp > 0; index++) {
      const card = cards[index];
      if (typeof globalThis.battleActivateCard === 'function') globalThis.battleActivateCard(stage, index, card.grade || card.rarity);
      phase.textContent = `${meta.label} · ${String(card.grade || card.rarity || 'CARD').toUpperCase()} STRIKE`;
      stage.classList.remove('member-strike', 'member-skill');
      void stage.offsetWidth;
      stage.classList.add(index >= 3 ? 'member-skill' : 'member-strike');
      const share = index === cards.length - 1
        ? Math.max(0, desiredCardDamage - (100 - enemyHp - (ultimateDamage / bossPower * 100)))
        : desiredCardDamage * Math.max(1, Number(card.power || 0)) / cardPowerTotal;
      const hpDamage = Math.max(4, Math.min(36, share));
      enemyHp = Math.max(win ? (index < cards.length - 1 ? 3 : 0) : 8, enemyHp - hpDamage);
      setHp(stage, 'enemy', enemyHp);
      burst(stage, 'enemy', index >= 3, `-${number(Math.max(1, Math.floor(bossPower * hpDamage / 100)))}`);
      if (typeof globalThis.battleTone === 'function') globalThis.battleTone(180 + index * 34, .12, index >= 3 ? 'sawtooth' : 'square', .055);
      await battleSleepSafe(index >= 3 ? 720 : 560);

      if (enemyHp <= 0) break;
      if (counterIndices.has(index)) {
        stage.classList.remove('member-strike', 'member-skill');
        stage.classList.add('monster-heavy-attack');
        phase.textContent = win ? 'BOSS COUNTER' : 'SEAL BREACH ATTACK';
        const hit = win ? (index === 1 ? 14 : 18) : (loseHits[loseHitIndex++] || 40);
        teamHp = Math.max(win ? 18 : 0, teamHp - hit);
        setHp(stage, 'team', teamHp);
        burst(stage, 'player', !win, win ? 'BOSS HIT' : 'BREACH!');
        if (typeof globalThis.battleTone === 'function') globalThis.battleTone(win ? 62 : 42, .28, 'sawtooth', .085);
        await battleSleepSafe(820);
        stage.classList.remove('monster-heavy-attack');
      }
    }

    stage.querySelectorAll('.battle-card-fighter').forEach(element => element.classList.remove('active-attacker'));
    if (win) {
      setHp(stage, 'enemy', 0);
      stage.classList.add('final-strike-v863');
      phase.textContent = 'ROLE BOSS DEFEATED';
      burst(stage, 'enemy', true, 'SEAL HIT!');
      await battleSleepSafe(900);
      stage.classList.add('battle-win-v863');
      phase.textContent = 'SEAL BATTLE VICTORY';
      if (typeof globalThis.battleSfx === 'function') globalThis.battleSfx('victory');
    } else {
      setHp(stage, 'team', 0);
      stage.classList.add('final-fail-v863');
      phase.textContent = 'SEAL TEAM DEFEATED';
      burst(stage, 'player', true, 'K.O.');
      await battleSleepSafe(900);
      stage.classList.add('battle-lose-v863');
      phase.textContent = 'SEAL BATTLE DEFEAT';
      if (typeof globalThis.battleSfx === 'function') globalThis.battleSfx('defeat');
    }

    const lossLine = win ? '전투 승리로 정상 공헌도가 적용되었습니다.' : `전투 패배로 공헌도의 ${Number(result.defeatContributionPercent || 0)}%만 적용되었습니다.`;
    message.innerHTML = `<strong>${win ? 'BATTLE VICTORY' : 'BATTLE DEFEAT'}</strong><span>${number(result.totalBattleDamage || result.playerPower)} VS ${number(result.bossPower)} · ${esc(lossLine)}</span><div class="battle-reward-pop"><small>${meta.label} 공헌</small><b>+${number(result.contribution)}</b><small>참여 보상</small><b>◈ ${number(result.reward?.coin)} · 조각 ${number(result.reward?.shards)}</b>${Number(result.bonusPercent || 0) > 0 ? `<em>부족 역할 지원 +${Number(result.bonusPercent)}%</em>` : ''}</div><button type="button" class="seal-battle-return">봉인전으로 돌아가기</button>`;
    const close = () => { modal.onclick = null; modal.className = 'modal'; modal.innerHTML = ''; };
    message.querySelector('.seal-battle-return').onclick = event => { event.stopPropagation(); close(); };
    setTimeout(() => { modal.onclick = close; }, 450);
  }

  async function participate(roleKey, button) {
    if (loading) return;
    const meta = ROLE[roleKey];
    const role = latest?.event?.roles?.[roleKey];
    if (!confirm(`${meta.label} 보스와 전투합니다.\n오늘의 참여 횟수 1회가 사용되며 패배해도 횟수는 복구되지 않습니다.\n\n전투를 시작할까요?`)) return;
    loading = true;
    button.disabled = true;
    const modal = sealCombatModal(roleKey);
    const stage = modal?.querySelector('.battle-stage');
    const phase = stage?.querySelector('#battlePhase');
    const count = stage?.querySelector('#battleCountdown');
    const message = stage?.querySelector('#battleMessage');
    try {
      if (typeof globalThis.battleTone === 'function') globalThis.battleTone(80, .18, 'sawtooth', .04);
      await battleSleepSafe(380);
      stage?.classList.add('cards-enter');
      if (phase) phase.textContent = 'PVE TEAM DEPLOY';
      await battleSleepSafe(720);
      stage?.classList.add('enemy-enter');
      if (phase) phase.textContent = `${meta.label} BOSS APPEARS`;
      await battleSleepSafe(760);
      if (count) count.textContent = 'READY';
      await battleSleepSafe(520);
      if (count) count.textContent = 'FIGHT';
      stage?.classList.add('fight');
      const fightPromise = api('seal-battle/participate', {
        method: 'POST',
        body: JSON.stringify({ requestId: requestId(), role: roleKey })
      });
      await battleSleepSafe(420);
      if (count) count.textContent = '';
      if (message) message.innerHTML = `<span>${esc(role?.label || meta.label)} 보스와 전투 중...</span>`;
      const result = await fightPromise;
      updateBalances(result.balances);
      latest = result.state || latest;
      render(latest);
      await animateSealCombat(modal, roleKey, result);
    } catch (error) {
      if (stage && message) {
        phase.textContent = 'BATTLE ERROR';
        message.innerHTML = `<strong>전투 처리 실패</strong><span>${esc(error.message)}</span><button type="button" class="seal-battle-return">봉인전으로 돌아가기</button>`;
        message.querySelector('.seal-battle-return').onclick = () => { modal.className = 'modal'; modal.innerHTML = ''; };
      } else {
        if (modal) { modal.className = 'modal'; modal.innerHTML = ''; }
        alert(error.message);
      }
      loading = false;
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
