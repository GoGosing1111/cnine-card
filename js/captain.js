(() => {
  const esc = value => String(value ?? '').replace(/[&<>"']/g, char => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[char]));
  const api = (path, options = {}) => window.apiRequest(path, options, { ttl: 0 });
  const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
  let lastStatus = null;
  let energyTimer = null;
  let active = false;
  let bgmAudio = null;
  let bgmConfig = null;
  const bgmPreferenceKey = 'cnine_captain_bgm_enabled';
  const bgmVolumeKey = 'cnine_captain_bgm_volume';

  function userBgmEnabled() {
    const stored = localStorage.getItem(bgmPreferenceKey);
    return stored === null ? true : stored === '1';
  }

  function userBgmVolume(defaultVolume) {
    const stored = Number(localStorage.getItem(bgmVolumeKey));
    return Number.isFinite(stored) && stored >= 0 ? Math.max(0, Math.min(100, stored)) : Math.max(0, Math.min(100, Number(defaultVolume || 0)));
  }

  function normalizeAudioSource(source) {
    const value = String(source || '').trim();
    if (!value) return '';
    if (/^(?:https?:|data:|blob:|\/)/i.test(value)) return value;
    return '/' + value.replace(/^\.\//, '');
  }

  function stopBgm(force = false) {
    if (!bgmAudio) return;
    if (!force && bgmConfig?.stopOnExit === false) return;
    bgmAudio.pause();
    bgmAudio.currentTime = 0;
  }

  async function syncBgm(config, userGesture = false) {
    bgmConfig = config || null;
    const source = normalizeAudioSource(config?.source);
    if (!active || !config?.enabled || !source || !userBgmEnabled()) {
      stopBgm(true);
      return;
    }
    if (!bgmAudio || bgmAudio.dataset.source !== source) {
      bgmAudio?.pause();
      bgmAudio = new Audio(source);
      bgmAudio.dataset.source = source;
      bgmAudio.preload = 'auto';
      bgmAudio.addEventListener('error', () => {
        document.getElementById('captainBgmStatus')?.replaceChildren(document.createTextNode('음원 로드 실패'));
      });
    }
    bgmAudio.loop = config.loop !== false;
    bgmAudio.volume = userBgmVolume(config.volume) / 100;
    try {
      await bgmAudio.play();
      const status = document.getElementById('captainBgmStatus');
      if (status) status.textContent = '재생 중';
    } catch (error) {
      const status = document.getElementById('captainBgmStatus');
      if (status) status.textContent = userGesture ? `재생 실패: ${error.message}` : '재생 버튼을 눌러주세요';
    }
  }

  function mountBgmControl(box, config) {
    box.querySelector('.captain-v3-bgm-control')?.remove();
    if (!config?.enabled || !config?.source) return;
    const enabled = userBgmEnabled();
    const volume = userBgmVolume(config.volume);
    const control = document.createElement('section');
    control.className = 'captain-v3-bgm-control';
    control.innerHTML = `<div><small>CAPTAIN BGM</small><b id="captainBgmStatus">${enabled ? '재생 준비' : '사용자 OFF'}</b></div><button type="button" id="captainBgmToggle">${enabled ? 'BGM ON' : 'BGM OFF'}</button><input id="captainBgmVolume" type="range" min="0" max="100" value="${volume}" aria-label="대장전 배경음 음량"><span id="captainBgmVolumeValue">${volume}</span>`;
    box.prepend(control);
    control.querySelector('#captainBgmToggle').onclick = async event => {
      const next = !userBgmEnabled();
      localStorage.setItem(bgmPreferenceKey, next ? '1' : '0');
      event.currentTarget.textContent = next ? 'BGM ON' : 'BGM OFF';
      control.querySelector('#captainBgmStatus').textContent = next ? '재생 준비' : '사용자 OFF';
      if (next) await syncBgm(config, true); else stopBgm(true);
    };
    control.querySelector('#captainBgmVolume').oninput = event => {
      const value = Math.max(0, Math.min(100, Number(event.currentTarget.value) || 0));
      localStorage.setItem(bgmVolumeKey, String(value));
      control.querySelector('#captainBgmVolumeValue').textContent = String(value);
      if (bgmAudio) bgmAudio.volume = value / 100;
    };
  }

  function tier(member, size = 'small') {
    const data = member?.pvpTier || { id: 'bronze', name: '브론즈', color: '#b87333' };
    if (typeof window.tierEmblem === 'function') return window.tierEmblem(data, size);
    return `<span class="captain-v3-tier-fallback" style="--tier:${esc(data.color || '#b87333')}">◆</span>`;
  }

  function roleClass(position) {
    return ['member', 'lead', 'mid', 'captain'][Number(position)] || 'member';
  }

  function memberCard(member, options = {}) {
    const { compact = false, status = '', index = null } = options;
    const statusText = status === 'active' ? '출전 중' : status === 'down' ? 'DOWN' : status === 'waiting' ? '대기' : '';
    return `<article class="captain-v3-member ${compact ? 'compact' : ''} ${status ? `is-${status}` : ''}" ${index != null ? `data-lineup-index="${index}"` : ''}>
      <div class="captain-v3-member-top">
        <span class="captain-v3-role ${roleClass(member.position)}">${esc(member.role || '팀원')}</span>
        ${statusText ? `<em>${statusText}</em>` : ''}
      </div>
      <div class="captain-v3-identity">
        ${tier(member)}
        <div><b>${esc(member.nickname || '-')}</b><small>${esc(member.pvpTier?.name || '브론즈')} · ${Number(member.pvpScore || 0).toLocaleString()}점</small></div>
      </div>
      <div class="captain-v3-member-power"><span>PVP DECK</span><strong>${Number(member.deck_power ?? member.deckPower ?? 0).toLocaleString()}</strong></div>
    </article>`;
  }

  function energyBox(energy) {
    const nextLabel = energy.current >= energy.max
      ? '최대 충전 완료'
      : `${energy.minutes}분마다 1회 충전`;
    return `<section class="captain-v3-energy" data-next-at="${esc(energy.nextAt || '')}">
      <div class="captain-v3-energy-head"><span>MY ATTACK CHARGE</span><b>${energy.current}<small>/ ${energy.max}</small></b></div>
      <div class="captain-v3-energy-pips">${Array.from({ length: energy.max }, (_, index) => `<i class="${index < energy.current ? 'on' : ''}"></i>`).join('')}</div>
      <p id="captainEnergyClock">${nextLabel}</p>
    </section>`;
  }

  function startEnergyClock(energy) {
    clearInterval(energyTimer);
    const label = document.getElementById('captainEnergyClock');
    if (!label || !energy?.nextAt || energy.current >= energy.max) return;
    const update = () => {
      const remain = Math.max(0, Date.parse(energy.nextAt) - Date.now());
      if (!remain) {
        label.textContent = '충전 반영 중...';
        clearInterval(energyTimer);
        setTimeout(render, 700);
        return;
      }
      const minutes = Math.floor(remain / 60000);
      const seconds = Math.floor((remain % 60000) / 1000);
      label.textContent = `다음 충전 ${minutes}:${String(seconds).padStart(2, '0')}`;
    };
    update();
    energyTimer = setInterval(update, 1000);
  }

  function normalizeCard(card) {
    return {
      ...card,
      id: String(card?.id || card?.card_id || ''),
      title: card?.title || card?.card_title || '카드',
      name: card?.name || '',
      grade: String(card?.grade || card?.rarity || 'C').toUpperCase(),
      rarity: String(card?.rarity || card?.grade || 'C').toUpperCase(),
      image: card?.image || card?.image_url || '',
      image_url: card?.image_url || card?.image || '',
      focusX: Number(card?.focusX ?? card?.focus_x ?? 50),
      focusY: Number(card?.focusY ?? card?.focus_y ?? 50),
      breakthroughLevel: Number(card?.breakthroughLevel ?? card?.breakthrough_level ?? 0)
    };
  }

  function fallbackCombatCard(card, index) {
    const normalized = normalizeCard(card);
    let src = normalized.image;
    if (src && !/^(?:https?:|data:|\/)/i.test(src)) src = '/' + src.replace(/^\.\//, '');
    return `<div class="captain-v3-card-fallback" style="--i:${index}">
      <div class="captain-v3-card-grade">${esc(normalized.grade)}</div>
      <div class="captain-v3-card-art">${src ? `<img src="${esc(src)}" alt="${esc(normalized.title)}">` : ''}<span>${esc(normalized.title.slice(0, 1))}</span></div>
      <b>${esc(normalized.title)}</b>
    </div>`;
  }

  function combatDeck(cards, side) {
    return (cards || []).map((card, index) => {
      const normalized = normalizeCard(card);
      let html;
      if (typeof window.combatCardHtml === 'function') {
        try { html = window.combatCardHtml(normalized, 'captain-v3-combat-card', normalized.breakthroughLevel); }
        catch { html = fallbackCombatCard(normalized, index); }
      } else html = fallbackCombatCard(normalized, index);
      return `<div class="captain-v3-deck-card" data-side="${side}" data-card-index="${index}" style="--i:${index}">${html}</div>`;
    }).join('');
  }

  function bindImageFallbacks(root) {
    root.querySelectorAll('img').forEach(image => {
      image.addEventListener('error', () => {
        const art = image.closest('.captain-v3-card-art,.card-art');
        if (art) art.classList.add('captain-image-failed');
        image.remove();
      }, { once: true });
    });
  }

  function lineupStrip(team, lineup, downSet, activeId, side) {
    return `<div class="captain-v3-lineup ${side}">
      <div class="captain-v3-lineup-name"><small>${side === 'attacker' ? 'MY SQUAD' : 'RIVAL SQUAD'}</small><b>${esc(team.name)}</b></div>
      <div class="captain-v3-lineup-members">${lineup.map((member, index) => {
        const down = downSet.has(Number(member.userId));
        const now = Number(member.userId) === Number(activeId);
        return `<div class="captain-v3-lineup-chip ${down ? 'down' : now ? 'active' : 'standby'}" data-user-id="${Number(member.userId)}">
          <span>${index + 1}</span>${tier(member)}<b>${esc(member.nickname)}</b><em>${down ? 'DOWN' : now ? 'FIGHT' : 'WAIT'}</em>
        </div>`;
      }).join('')}</div>
    </div>`;
  }

  function hpBlock(side, fighter, startPercent) {
    return `<div class="captain-v3-duel-hp ${side}">
      <div><b>${esc(fighter.nickname)}</b><span data-hp-label="${side}">${startPercent}%</span></div>
      <div class="captain-v3-hp-track"><i data-hp-bar="${side}" style="width:${startPercent}%"></i><u data-hp-trail="${side}" style="width:${startPercent}%"></u></div>
      <small>${Number(fighter.deckPower || 0).toLocaleString()} POWER · 궁극기 OFF</small>
    </div>`;
  }

  async function animateDuel(stage, round, data, state) {
    const left = round.left;
    const right = round.right;
    const roundNumber = Number(round.round || 1);
    stage.innerHTML = `
      <div class="captain-v3-battle-bg"></div>
      <header class="captain-v3-battle-header">
        <span>CAPTAIN BATTLE · ROUND ${roundNumber}</span>
        <b>승자는 남고 패자는 DOWN</b>
      </header>
      <div class="captain-v3-battle-lineups">
        ${lineupStrip(data.attackerTeam, data.attackerLineup, state.attackerDown, left.userId, 'attacker')}
        ${lineupStrip(data.defenderTeam, data.defenderLineup, state.defenderDown, right.userId, 'defender')}
      </div>
      <section class="captain-v3-duel-board">
        <article class="captain-v3-fighter-panel attacker" data-fighter-panel="attacker">
          <div class="captain-v3-fighter-title">${tier(left, 'rank')}<div><small>${esc(left.role)}</small><h3>${esc(left.nickname)}</h3></div></div>
          ${hpBlock('attacker', left, left.startHpPercent)}
          <div class="captain-v3-battle-deck">${combatDeck(left.deckSnapshot, 'attacker')}</div>
        </article>
        <div class="captain-v3-duel-center"><small>ROUND</small><strong>${roundNumber}</strong><i>VS</i><span id="captainRoundPhase">READY</span></div>
        <article class="captain-v3-fighter-panel defender" data-fighter-panel="defender">
          <div class="captain-v3-fighter-title">${tier(right, 'rank')}<div><small>${esc(right.role)}</small><h3>${esc(right.nickname)}</h3></div></div>
          ${hpBlock('defender', right, right.startHpPercent)}
          <div class="captain-v3-battle-deck">${combatDeck(right.deckSnapshot, 'defender')}</div>
        </article>
      </section>
      <div class="captain-v3-round-banner" id="captainRoundBanner"><span>RANDOM MATCHUP</span><b>${esc(left.nickname)} <i>VS</i> ${esc(right.nickname)}</b></div>`;
    bindImageFallbacks(stage);

    const phase = stage.querySelector('#captainRoundPhase');
    const banner = stage.querySelector('#captainRoundBanner');
    await sleep(450);
    banner.classList.add('hide');
    phase.textContent = 'FIGHT';
    stage.classList.add('is-fighting');

    const leftBar = stage.querySelector('[data-hp-bar="attacker"]');
    const rightBar = stage.querySelector('[data-hp-bar="defender"]');
    const leftTrail = stage.querySelector('[data-hp-trail="attacker"]');
    const rightTrail = stage.querySelector('[data-hp-trail="defender"]');
    const leftLabel = stage.querySelector('[data-hp-label="attacker"]');
    const rightLabel = stage.querySelector('[data-hp-label="defender"]');

    const startLeft = Number(left.startHpPercent || 100);
    const startRight = Number(right.startHpPercent || 100);
    const endLeft = Number(left.endHpPercent || 0);
    const endRight = Number(right.endHpPercent || 0);

    for (let index = 0; index < 5; index += 1) {
      stage.querySelectorAll('.captain-v3-deck-card').forEach(card => card.classList.remove('strike'));
      const attackerCard = stage.querySelector(`[data-side="attacker"][data-card-index="${index}"]`);
      const defenderCard = stage.querySelector(`[data-side="defender"][data-card-index="${index}"]`);
      if (attackerCard) attackerCard.classList.add('strike');
      stage.querySelector('[data-fighter-panel="defender"]')?.classList.add('hit');
      await sleep(150);
      const progressA = (index + 1) / 5;
      const nextRight = Math.round(startRight + (endRight - startRight) * progressA);
      rightBar.style.width = `${nextRight}%`;
      rightLabel.textContent = `${nextRight}%`;
      await sleep(210);
      stage.querySelector('[data-fighter-panel="defender"]')?.classList.remove('hit');

      if (defenderCard) defenderCard.classList.add('strike');
      stage.querySelector('[data-fighter-panel="attacker"]')?.classList.add('hit');
      await sleep(150);
      const nextLeft = Math.round(startLeft + (endLeft - startLeft) * progressA);
      leftBar.style.width = `${nextLeft}%`;
      leftLabel.textContent = `${nextLeft}%`;
      await sleep(210);
      stage.querySelector('[data-fighter-panel="attacker"]')?.classList.remove('hit');
    }

    setTimeout(() => {
      leftTrail.style.width = `${endLeft}%`;
      rightTrail.style.width = `${endRight}%`;
    }, 120);

    const attackerWon = round.winnerSide === 'ATTACKER';
    const winnerPanel = stage.querySelector(`[data-fighter-panel="${attackerWon ? 'attacker' : 'defender'}"]`);
    const loserPanel = stage.querySelector(`[data-fighter-panel="${attackerWon ? 'defender' : 'attacker'}"]`);
    winnerPanel?.classList.add('winner');
    loserPanel?.classList.add('down');
    phase.textContent = 'K.O.';
    const loser = attackerWon ? right : left;
    const winner = attackerWon ? left : right;
    if (attackerWon) state.defenderDown.add(Number(loser.userId));
    else state.attackerDown.add(Number(loser.userId));

    banner.innerHTML = `<span>ROUND ${roundNumber} RESULT</span><b>${esc(winner.nickname)} 승리 · ${winner.endHpPercent}% HP로 연전</b>`;
    banner.classList.remove('hide');
    banner.classList.add('result');
    await sleep(1150);
  }

  async function playBattle(data) {
    const modal = document.getElementById('modal');
    modal.className = 'modal show captain-v3-battle-modal';
    modal.innerHTML = '<div class="captain-v3-battle-stage"><div class="captain-v3-match-loading"><i></i><small>RANDOM LINEUP</small><h2>출전 순서를 추첨했습니다</h2><p>승자는 남고, 패배 팀에서 다음 선수가 무작위로 출전합니다.</p></div></div>';
    const stage = modal.querySelector('.captain-v3-battle-stage');
    await sleep(850);
    const state = { attackerDown: new Set(), defenderDown: new Set() };
    for (const round of data.rounds || []) await animateDuel(stage, round, data, state);

    const won = data.result === 'WIN';
    const survivor = data.survivor || {};
    stage.innerHTML = `<div class="captain-v3-battle-bg"></div><section class="captain-v3-final ${won ? 'victory' : 'defeat'}">
      <small>CAPTAIN BATTLE · FINAL RESULT</small>
      <div class="captain-v3-final-emblem">${won ? 'WIN' : 'LOSE'}</div>
      <h2>${won ? '우리 팀 승리' : '우리 팀 패배'}</h2>
      <p>최후의 생존자 <b>${esc(survivor.nickname || '-')}</b> · 잔여 HP ${Number(survivor.hpPercent || 0)}%</p>
      <div class="captain-v3-score-change"><span>${Number(data.attackerScoreBefore).toLocaleString()}</span><i>→</i><strong>${Number(data.attackerScoreAfter).toLocaleString()}</strong><em>${Number(data.scoreChange) > 0 ? '+' : ''}${Number(data.scoreChange)}점</em></div>
      <div class="captain-v3-final-actions"><button class="btn" id="captainBattleClose">대장전으로 돌아가기</button><button class="text-btn" id="captainBattleLogs">공격 로그 보기</button></div>
    </section>`;

    return new Promise(resolve => {
      const close = showLogs => {
        modal.onclick = null;
        modal.className = 'modal';
        modal.innerHTML = '';
        resolve(showLogs);
      };
      document.getElementById('captainBattleClose').onclick = () => close(false);
      document.getElementById('captainBattleLogs').onclick = () => close(true);
    });
  }

  async function fight(teamId, button) {
    if (!lastStatus?.energy || lastStatus.energy.current <= 0) {
      alert('공격 횟수가 부족합니다. 15분마다 1회 충전됩니다.');
      return;
    }
    const target = lastStatus.opponents.find(team => Number(team.id) === Number(teamId));
    if (!target) return;
    if (!confirm(`${target.name} 팀과 3:3 연전을 시작할까요?\n출전 순서는 양 팀 모두 무작위로 결정됩니다.`)) return;

    button.disabled = true;
    const modal = document.getElementById('modal');
    modal.className = 'modal show captain-v3-battle-modal';
    modal.innerHTML = '<div class="captain-v3-battle-stage"><div class="captain-v3-match-loading"><i></i><small>MATCH PREPARATION</small><h2>양 팀 출전 순서 추첨 중</h2><p>공격 횟수 1회로 3대3 전체 경기를 진행합니다.</p></div></div>';

    try {
      const result = await api('captain/fight', {
        method: 'POST',
        body: JSON.stringify({
          opponentTeamId: Number(teamId),
          requestId: globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random()}`
        })
      });
      const openLogs = await playBattle(result);
      await render();
      if (openLogs) await history(document.getElementById('pvpContent'));
    } catch (error) {
      modal.className = 'modal';
      modal.innerHTML = '';
      alert(error.message);
      button.disabled = false;
    }
  }

  function historyRow(row, direction, myTeamId) {
    const won = Number(row.winner_team_id) === Number(myTeamId);
    const opponent = direction === 'attack' ? row.defender_team_name : row.attacker_team_name;
    const survivor = row.survivor?.nickname || '-';
    return `<article class="captain-v3-log-row ${won ? 'win' : 'lose'}">
      <div class="captain-v3-log-result"><b>${won ? '승리' : '패배'}</b><span>${Number(row.rounds?.length || 0)}ROUND</span></div>
      <div><h3>${esc(opponent)}</h3><p>${direction === 'attack' ? `공격자 ${esc(row.initiated_by_name || '-')}` : `상대 공격자 ${esc(row.initiated_by_name || '-')}`} · 최후 생존 ${esc(survivor)}</p><small>${esc(row.created_at || '')}</small></div>
      <strong>${direction === 'attack' ? `${Number(row.attacker_score_before)} → ${Number(row.attacker_score_after)}` : `${Number(row.defender_score_before)} → ${Number(row.defender_score_after)}`}</strong>
    </article>`;
  }

  async function history(box) {
    box.innerHTML = '<div class="captain-v3-loading"><i></i><span>전투 기록을 불러오는 중...</span></div>';
    try {
      const data = await api('captain/history');
      const myTeamId = lastStatus?.team?.id;
      box.innerHTML = `<section class="captain-v3-subpage">
        <header class="captain-v3-subhead"><button class="text-btn" id="captainBack">← 대장전</button><div><small>BATTLE ARCHIVE</small><h2>공격·방어 기록</h2><p>한 번의 기록은 3대3 전체 연전 결과입니다.</p></div></header>
        <div class="captain-v3-log-grid">
          <section><h3>공격 기록</h3>${(data.attack || []).map(row => historyRow(row, 'attack', myTeamId)).join('') || '<div class="captain-v3-empty">공격 기록이 없습니다.</div>'}</section>
          <section><h3>방어 기록</h3>${(data.defense || []).map(row => historyRow(row, 'defense', myTeamId)).join('') || '<div class="captain-v3-empty">방어 기록이 없습니다.</div>'}</section>
        </div>
      </section>`;
      document.getElementById('captainBack').onclick = render;
    } catch (error) {
      box.innerHTML = `<div class="captain-v3-empty error">${esc(error.message)}</div>`;
    }
  }

  async function ranking(box) {
    box.innerHTML = '<div class="captain-v3-loading"><i></i><span>랭킹을 불러오는 중...</span></div>';
    try {
      const data = await api('captain/ranking');
      box.innerHTML = `<section class="captain-v3-subpage">
        <header class="captain-v3-subhead"><button class="text-btn" id="captainBack">← 대장전</button><div><small>WEEKLY TEAM RANKING</small><h2>대장전 주간 랭킹</h2></div></header>
        <div class="captain-v3-ranking">${(data.ranking || []).map(team => `<article class="${Number(team.id) === Number(lastStatus?.team?.id) ? 'mine' : ''}">
          <em>${team.rank}</em><div class="captain-v3-rank-team"><b>${esc(team.name)}</b><small>${(team.members || []).map(member => esc(member.nickname)).join(' · ')}</small></div>
          <div class="captain-v3-rank-record"><span>${Number(team.wins || 0)}승 ${Number(team.losses || 0)}패</span><strong>${Number(team.score || 0).toLocaleString()}</strong></div>
        </article>`).join('') || '<div class="captain-v3-empty">편성된 팀이 없습니다.</div>'}</div>
      </section>`;
      document.getElementById('captainBack').onclick = render;
    } catch (error) {
      box.innerHTML = `<div class="captain-v3-empty error">${esc(error.message)}</div>`;
    }
  }

  function renderHero(box, data) {
    box.innerHTML = `<section class="captain-v3-hero">
      <div class="captain-v3-hero-glow"></div>
      <div class="captain-v3-kicker">WEEKLY RANDOM GAUNTLET · 3 VS 3</div>
      <h2>최후의 한 명이 남을 때까지</h2>
      <p>PVP 덱을 등록하면 정체가 공개되지 않은 참가자들과 3인 랜덤 팀이 결성됩니다.</p>
      <div class="captain-v3-rule-flow">
        <article><span>01</span><b>랜덤 출전</b><small>양 팀에서 1명씩 무작위 출전</small></article>
        <i>→</i><article><span>02</span><b>승자 잔류</b><small>남은 HP 그대로 다음 상대와 연전</small></article>
        <i>→</i><article><span>03</span><b>최후 생존</b><small>상대 3명을 모두 DOWN시키면 승리</small></article>
      </div>
      <div class="captain-v3-rule-badges"><span>개인 공격 최대 5회</span><span>15분마다 1회 충전</span><span>궁극기 전면 미사용</span><span>PVP 5장 덱 사용</span></div>
      <button class="btn captain-v3-main-button" id="captainRegister">대장전 참가 등록</button>${data?.operatorTestParticipant ? '<small class="captain-v3-operator-test">운영자 TEST 참가 활성화 · 정규 운영 랭킹과 분리해 테스트하세요.</small>' : ''}
      <small class="captain-v3-warning">대기 중 취소 시 7일간 재등록할 수 없으며, 팀 결성 후에는 탈퇴할 수 없습니다.</small>
    </section>`;
  }

  function renderWaiting(box, data) {
    box.innerHTML = `<section class="captain-v3-waiting">
      <div class="captain-v3-secret-cards"><i>?</i><i class="me">YOU</i><i>?</i></div>
      <small>IDENTITY HIDDEN · RANDOM TEAM</small><h2>팀 결성을 기다리고 있습니다</h2>
      <p>3명이 모일 때까지 다른 참가자의 닉네임과 티어는 공개되지 않습니다.</p>
      <div class="captain-v3-wait-count"><b>${Number(data.waitingCount || 0)}</b><span>현재 매칭 대기</span></div>
      <button class="btn ghost" id="captainCancel">참가 취소 · 7일 등록 제한</button>
    </section>`;
  }

  function opponentCard(team, energy) {
    return `<article class="captain-v3-rival">
      <header><div><small>RIVAL TEAM</small><h3>${esc(team.name)}</h3><p>${Number(team.wins || 0)}승 ${Number(team.losses || 0)}패</p></div><strong>${Number(team.score || 0).toLocaleString()}<small>TEAM SCORE</small></strong></header>
      <div class="captain-v3-rival-power"><span>TEAM DECK POWER</span><b>${Number(team.teamPower || 0).toLocaleString()}</b></div>
      <div class="captain-v3-rival-roster">${(team.members || []).map(member => memberCard(member, { compact: true })).join('')}</div>
      <div class="captain-v3-rival-rule"><i>RANDOM</i><span>출전 순서와 다음 출전자는 경기 시작 후 무작위 결정</span></div>
      <button class="btn captain-v3-fight" data-team-id="${Number(team.id)}" ${energy.current <= 0 ? 'disabled' : ''}>3:3 연전 시작</button>
    </article>`;
  }

  function renderDashboard(box, data) {
    const captain = data.team.members.find(member => Number(member.position) === 3);
    box.innerHTML = `<section class="captain-v3-command">
      <header class="captain-v3-team-header">
        <div><small>MY WEEKLY SQUAD</small><h2>${esc(data.team.name)}</h2><p>대장 ${esc(captain?.nickname || '-')} · ${Number(data.team.wins || 0)}승 ${Number(data.team.losses || 0)}패</p></div>
        <div class="captain-v3-team-score"><span>TEAM SCORE</span><b>${Number(data.team.score || 0).toLocaleString()}</b></div>
      </header>
      <div class="captain-v3-team-roster">${data.team.members.map(member => memberCard(member)).join('')}</div>
      ${data.isCaptain ? `<div class="captain-v3-rename"><div><small>CAPTAIN AUTHORITY</small><b>팀명 변경</b></div><input id="captainTeamName" maxlength="20" value="${esc(data.team.name)}"><button id="captainRename">변경</button></div>` : ''}
      <div class="captain-v3-control-row">
        ${energyBox(data.energy)}
        <div class="captain-v3-shortcuts"><button class="text-btn" id="captainRanking">주간 랭킹</button><button class="text-btn" id="captainHistory">공격·방어 로그</button><button class="text-btn" id="captainReward">참여 보상</button></div>
      </div>
    </section>
    <section class="captain-v3-matchboard">
      <header><div><small>TEAM GAUNTLET</small><h2>상대 팀 선택</h2><p>상대 팀원을 고르는 방식이 아닙니다. 공격 1회로 양 팀 3명이 랜덤 순서로 끝까지 연전합니다.</p></div><div class="captain-v3-format"><b>3</b><i>VS</i><b>3</b></div></header>
      <div class="captain-v3-rivals">${data.opponents.map(team => opponentCard(team, data.energy)).join('') || '<div class="captain-v3-empty">현재 대결 가능한 상대 팀이 없습니다.</div>'}</div>
    </section>`;
    startEnergyClock(data.energy);
  }

  async function render() {
    const box = document.getElementById('pvpContent');
    if (!box || !active) return;
    clearInterval(energyTimer);
    box.innerHTML = '<div class="captain-v3-loading"><i></i><span>대장전 정보를 불러오는 중...</span></div>';
    try {
      const data = await api('captain/status');
      lastStatus = data;
      if (!data.registered) renderHero(box, data);
      else if (!data.team) renderWaiting(box, data);
      else renderDashboard(box, data);
      mountBgmControl(box, data.bgm);
      await syncBgm(data.bgm);

      document.getElementById('captainRegister')?.addEventListener('click', async () => {
        if (!confirm('PVP 덱으로 대장전에 등록할까요? 팀 결성 후에는 탈퇴할 수 없습니다.')) return;
        try { await api('captain/register', { method: 'POST' }); await render(); }
        catch (error) { alert(error.message); }
      });
      document.getElementById('captainCancel')?.addEventListener('click', async () => {
        if (!confirm('참가를 취소하면 7일 동안 다시 등록할 수 없습니다. 계속할까요?')) return;
        try { await api('captain/register', { method: 'DELETE' }); await render(); }
        catch (error) { alert(error.message); }
      });
      document.getElementById('captainRanking')?.addEventListener('click', () => ranking(box));
      document.getElementById('captainHistory')?.addEventListener('click', () => history(box));
      document.getElementById('captainReward')?.addEventListener('click', async () => {
        try { await api('captain/reward/claim', { method: 'POST', body: JSON.stringify({ type: 'PARTICIPATION' }) }); alert('참여 보상을 수령했습니다.'); await render(); }
        catch (error) { alert(error.message); }
      });
      document.getElementById('captainRename')?.addEventListener('click', async event => {
        const button = event.currentTarget;
        button.disabled = true;
        try { await api('captain/team-name', { method: 'PATCH', body: JSON.stringify({ name: document.getElementById('captainTeamName').value }) }); await render(); }
        catch (error) { alert(error.message); button.disabled = false; }
      });
      box.querySelectorAll('.captain-v3-fight').forEach(button => {
        button.onclick = () => fight(Number(button.dataset.teamId), button);
      });
    } catch (error) {
      box.innerHTML = `<section class="captain-v3-empty error"><b>대장전 정보를 불러오지 못했습니다.</b><span>${esc(error.message)}</span><button class="text-btn" id="captainRetry">다시 시도</button></section>`;
      document.getElementById('captainRetry').onclick = render;
    }
  }

  function installTab() {
    const nav = document.querySelector('.pvp-tabs');
    if (!nav || nav.querySelector('[data-captain-v3]')) return;
    const button = document.createElement('button');
    button.type = 'button';
    button.dataset.captainV3 = '1';
    button.innerHTML = '<span>3:3</span> 대장전';
    button.onclick = () => {
      active = true;
      nav.querySelectorAll('button').forEach(item => item.classList.toggle('active', item === button));
      render();
    };
    nav.insertBefore(button, nav.children[1] || null);
    nav.querySelectorAll('button:not([data-captain-v3])').forEach(item => {
      item.addEventListener('click', () => { active = false; clearInterval(energyTimer); stopBgm(); }, { capture: true });
    });
  }

  window.addEventListener('beforeunload', () => stopBgm(true));
  new MutationObserver(installTab).observe(document.documentElement, { childList: true, subtree: true });
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', installTab, { once: true });
  else installTab();
})();
