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
    control.innerHTML = `<div><small>대장전 배경음</small><b id="captainBgmStatus">${enabled ? '재생 준비' : '사용자 끔'}</b></div><button type="button" id="captainBgmToggle">${enabled ? '배경음 켜짐' : '배경음 꺼짐'}</button><input id="captainBgmVolume" type="range" min="0" max="100" value="${volume}" aria-label="대장전 배경음 음량"><span id="captainBgmVolumeValue">${volume}</span>`;
    box.prepend(control);
    control.querySelector('#captainBgmToggle').onclick = async event => {
      const next = !userBgmEnabled();
      localStorage.setItem(bgmPreferenceKey, next ? '1' : '0');
      event.currentTarget.textContent = next ? '배경음 켜짐' : '배경음 꺼짐';
      control.querySelector('#captainBgmStatus').textContent = next ? '재생 준비' : '사용자 끔';
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
    const statusText = status === 'active' ? '출전 중' : status === 'down' ? '탈락' : status === 'waiting' ? '대기' : '';
    return `<article class="captain-v3-member ${compact ? 'compact' : ''} ${status ? `is-${status}` : ''}" ${index != null ? `data-lineup-index="${index}"` : ''}>
      <div class="captain-v3-member-top">
        <span class="captain-v3-role ${roleClass(member.position)}">${esc(member.role || '팀원')}</span>
        ${statusText ? `<em>${statusText}</em>` : ''}
      </div>
      <div class="captain-v3-identity">
        ${tier(member)}
        <div><b>${esc(member.nickname || '-')}</b><small>${esc(member.pvpTier?.name || '브론즈')} · ${Number(member.pvpScore || 0).toLocaleString()}점</small></div>
      </div>
      <div class="captain-v3-member-power"><span>PVP 덱 전투력</span><strong>${Number(member.deck_power ?? member.deckPower ?? 0).toLocaleString()}</strong></div>
    </article>`;
  }

  function energyBox(energy) {
    const nextLabel = energy.current >= energy.max
      ? '최대 충전 완료'
      : `${energy.minutes}분마다 1회 충전`;
    return `<section class="captain-v3-energy" data-next-at="${esc(energy.nextAt || '')}">
      <div class="captain-v3-energy-head"><span>내 공격 횟수</span><b>${energy.current}<small>/ ${energy.max}</small></b></div>
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

  function combatDeck(cardStates, side) {
    return (cardStates || []).map((state, index) => {
      const normalized = normalizeCard(state);
      const maxHp = Math.max(1, Number(state?.maxHp || state?.power || 1));
      const hp = Math.max(0, Number(state?.hp ?? maxHp));
      const hpPercent = Math.round(Math.max(0, Math.min(100, Number(state?.hpPercent ?? (hp / maxHp * 100)))));
      let html;
      if (typeof window.battleFighterHtml === 'function') {
        try { html = window.battleFighterHtml(normalized, index, side === 'defender'); }
        catch { html = fallbackCombatCard(normalized, index); }
      } else if (typeof window.combatCardHtml === 'function') {
        try { html = `<div class="battle-card-fighter">${window.combatCardHtml(normalized, 'battle-fighter-card captain-v4-combat-card', normalized.breakthroughLevel)}</div>`; }
        catch { html = fallbackCombatCard(normalized, index); }
      } else html = fallbackCombatCard(normalized, index);
      return `<div class="captain-v4-card-slot ${hp <= 0 ? 'is-down' : ''}" data-side="${side}" data-card-index="${index}" style="--i:${index}">
        ${html}
        <div class="captain-v4-card-hp"><i style="width:${hpPercent}%"></i></div>
        <div class="captain-v4-card-state"><span>${Number(state?.power || maxHp).toLocaleString()}</span><b>${hp <= 0 ? '탈락' : `${hpPercent}%`}</b></div>
      </div>`;
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
      <div class="captain-v3-lineup-name"><small>${side === 'attacker' ? '우리 팀' : '상대 팀'}</small><b>${esc(team.name)}</b></div>
      <div class="captain-v3-lineup-members">${lineup.map((member, index) => {
        const down = downSet.has(Number(member.userId));
        const now = Number(member.userId) === Number(activeId);
        return `<div class="captain-v3-lineup-chip ${down ? 'down' : now ? 'active' : 'standby'}" data-user-id="${Number(member.userId)}">
          <span>${index + 1}</span>${tier(member)}<b>${esc(member.nickname)}</b><em>${down ? '탈락' : now ? '출전 중' : '대기'}</em>
        </div>`;
      }).join('')}</div>
    </div>`;
  }

  function pvpHud(side, fighter, startPercent) {
    const target = side === 'attacker' ? 'team' : 'enemy';
    return `<div class="battle-hp ${side === 'attacker' ? 'battle-hp-team' : 'battle-hp-enemy'}">
      <div class="battle-hp-head"><b>${esc(fighter.nickname)}</b><span data-hp-text="${target}">${startPercent}%</span></div>
      <div class="battle-hp-track"><u data-hp-trail="${target}" style="width:${startPercent}%"></u><i data-hp-fill="${target}" style="width:${startPercent}%"></i><em>K.O.</em></div>
      <small>${esc(fighter.role)} · PVP 덱 ${Number(fighter.deckPower || 0).toLocaleString()} · 궁극기 미사용</small>
    </div>`;
  }

  function setTeamHp(stage, side, percent) {
    const target = side === 'attacker' ? 'team' : 'enemy';
    const value = Math.max(0, Math.min(100, Math.round(Number(percent || 0))));
    if (typeof window.battleSetHp === 'function') {
      try { window.battleSetHp(stage, target, value); return; } catch {}
    }
    const fill = stage.querySelector(`[data-hp-fill="${target}"]`);
    const trail = stage.querySelector(`[data-hp-trail="${target}"]`);
    const label = stage.querySelector(`[data-hp-text="${target}"]`);
    if (fill) fill.style.width = `${value}%`;
    if (trail) setTimeout(() => { trail.style.width = `${value}%`; }, 100);
    if (label) label.textContent = `${value}%`;
  }

  function updateCardState(stage, side, index, hpPercent, down) {
    const slot = stage.querySelector(`.captain-v4-card-slot[data-side="${side}"][data-card-index="${index}"]`);
    if (!slot) return;
    const value = Math.max(0, Math.min(100, Math.round(Number(hpPercent || 0))));
    slot.querySelector('.captain-v4-card-hp i')?.style.setProperty('width', `${value}%`);
    const label = slot.querySelector('.captain-v4-card-state b');
    if (label) label.textContent = down ? '탈락' : `${value}%`;
    slot.classList.toggle('is-down', Boolean(down));
  }

  function activateCard(stage, side, index) {
    stage.querySelectorAll(`.captain-v4-card-slot[data-side="${side}"]`).forEach((slot, slotIndex) => {
      slot.classList.toggle('is-attacking', slotIndex === Number(index));
    });
  }

  function hitFx(stage, side, damage, critical) {
    const target = side === 'attacker' ? 'player' : 'enemy';
    if (typeof window.battleDamage === 'function') {
      try { window.battleDamage(stage, `-${Number(damage || 0).toLocaleString()}`, target, Boolean(critical)); } catch {}
    }
    const panel = stage.querySelector(`[data-fighter-panel="${side}"]`);
    panel?.classList.remove('hit');
    void panel?.offsetWidth;
    panel?.classList.add('hit');
    setTimeout(() => panel?.classList.remove('hit'), 180);
  }

  async function pause(playback, ms) {
    if (playback.skip) return;
    await sleep(ms);
  }

  async function animateDuel(stage, round, data, state, playback) {
    const left = round.left;
    const right = round.right;
    const roundNumber = Number(round.round || 1);
    const leftCards = left.startDeck || left.deckSnapshot || [];
    const rightCards = right.startDeck || right.deckSnapshot || [];
    stage.className = 'modal-panel battle-stage pvp-battle-stage captain-v4-pvp-stage intro';
    stage.innerHTML = `
      <div class="battle-backdrop"></div><div class="battle-fx-layer"></div>
      <div class="battle-topline"><span>CNINE 대장전 · PVP 연전</span><b id="battlePhase">라운드 ${roundNumber} 출전</b></div>
      <button type="button" class="captain-v4-skip" id="captainBattleSkip">연출 건너뛰기</button>
      <div class="captain-v3-battle-lineups captain-v4-lineups">
        ${lineupStrip(data.attackerTeam, data.attackerLineup, state.attackerDown, left.userId, 'attacker')}
        ${lineupStrip(data.defenderTeam, data.defenderLineup, state.defenderDown, right.userId, 'defender')}
      </div>
      <div class="battle-hud captain-v4-hud">${pvpHud('attacker', left, left.startHpPercent)}${pvpHud('defender', right, right.startHpPercent)}</div>
      <div class="battle-arena pvp-arena captain-v4-arena">
        <div class="battle-side player-side captain-v4-side" data-fighter-panel="attacker">
          <div class="captain-v4-user-title">${tier(left, 'rank')}<div><small>${esc(left.role)}</small><b>${esc(left.nickname)}</b></div></div>
          <div class="battle-team captain-v4-pvp-deck">${combatDeck(leftCards, 'attacker')}</div><small>우리 팀 출전자</small>
        </div>
        <div class="battle-center captain-v4-center"><strong class="battle-vs-mark">VS</strong><span id="battleCountdown">READY</span><em>승자 HP·카드 상태 유지</em></div>
        <div class="battle-side enemy-side captain-v4-side" data-fighter-panel="defender">
          <div class="captain-v4-user-title defender">${tier(right, 'rank')}<div><small>${esc(right.role)}</small><b>${esc(right.nickname)}</b></div></div>
          <div class="battle-team enemy-team captain-v4-pvp-deck">${combatDeck(rightCards, 'defender')}</div><small>상대 팀 출전자</small>
        </div>
      </div>
      <div class="battle-impact"><i></i><i></i><i></i></div>
      <div class="captain-v4-round-notice" id="captainRoundNotice"><small>무작위 출전</small><b>${esc(left.nickname)} <i>VS</i> ${esc(right.nickname)}</b><span>카드 5장 PVP 전투 시작</span></div>`;
    bindImageFallbacks(stage);
    stage.querySelector('#captainBattleSkip').onclick = () => { playback.skip = true; };
    const phase = stage.querySelector('#battlePhase');
    const count = stage.querySelector('#battleCountdown');
    const notice = stage.querySelector('#captainRoundNotice');
    await pause(playback, 500);
    notice?.classList.add('hide');
    stage.classList.add('cards-enter', 'fight');
    if (count) count.textContent = 'FIGHT';
    if (phase) phase.textContent = `라운드 ${roundNumber} · 카드 전투`;
    await pause(playback, 450);
    if (count) count.textContent = '';

    for (const exchange of round.exchanges || []) {
      activateCard(stage, 'attacker', exchange.leftCardIndex);
      stage.classList.add('player-attack');
      await pause(playback, 90);
      updateCardState(stage, 'defender', exchange.rightCardIndex, exchange.rightCardHpPercent, exchange.rightCardDown);
      setTeamHp(stage, 'defender', exchange.rightDeckHpPercent);
      hitFx(stage, 'defender', exchange.rightDamage, exchange.rightCritical);
      await pause(playback, 150);
      stage.classList.remove('player-attack');

      if (Number(exchange.leftDamage || 0) > 0) {
        activateCard(stage, 'defender', exchange.rightCardIndex);
        stage.classList.add('enemy-attack');
        await pause(playback, 90);
        updateCardState(stage, 'attacker', exchange.leftCardIndex, exchange.leftCardHpPercent, exchange.leftCardDown);
        setTeamHp(stage, 'attacker', exchange.leftDeckHpPercent);
        hitFx(stage, 'attacker', exchange.leftDamage, exchange.leftCritical);
        await pause(playback, 150);
        stage.classList.remove('enemy-attack');
      }
    }

    (left.endDeck || []).forEach((card, index) => updateCardState(stage, 'attacker', index, card.hpPercent, card.down));
    (right.endDeck || []).forEach((card, index) => updateCardState(stage, 'defender', index, card.hpPercent, card.down));
    setTeamHp(stage, 'attacker', left.endHpPercent);
    setTeamHp(stage, 'defender', right.endHpPercent);
    const attackerWon = round.winnerSide === 'ATTACKER';
    const loserSide = attackerWon ? 'defender' : 'attacker';
    const winner = attackerWon ? left : right;
    const loser = attackerWon ? right : left;
    stage.querySelector(`[data-fighter-panel="${attackerWon ? 'attacker' : 'defender'}"]`)?.classList.add('captain-v4-winner');
    stage.querySelector(`[data-fighter-panel="${loserSide}"]`)?.classList.add('captain-v4-user-down');
    if (attackerWon) state.defenderDown.add(Number(loser.userId)); else state.attackerDown.add(Number(loser.userId));
    if (phase) phase.textContent = `라운드 ${roundNumber} 종료 · ${winner.nickname} 승리`;
    notice.innerHTML = `<small>라운드 ${roundNumber} 결과</small><b>${esc(winner.nickname)} 승리</b><span>생존 덱 HP ${Number(winner.endHpPercent || 0)}%로 다음 상대와 연전</span>`;
    notice.classList.remove('hide');
    notice.classList.add('result');
    await pause(playback, 1050);
  }

  async function playBattle(data) {
    const modal = document.getElementById('modal');
    modal.className = 'modal show battle-modal pvp-battle-modal captain-v4-battle-modal';
    modal.innerHTML = '<div class="modal-panel battle-stage pvp-battle-stage captain-v4-pvp-stage"><div class="battle-backdrop"></div><div class="captain-v3-match-loading"><i></i><small>PVP 덱 동기화</small><h2>3대3 출전 순서를 추첨했습니다</h2><p>승자는 생존 카드와 남은 HP를 유지한 채 다음 상대와 계속 싸웁니다.</p></div></div>';
    const stage = modal.querySelector('.captain-v4-pvp-stage');
    const playback = { skip: false };
    await sleep(700);
    const state = { attackerDown: new Set(), defenderDown: new Set() };
    for (const round of data.rounds || []) await animateDuel(stage, round, data, state, playback);

    const won = data.result === 'WIN';
    const survivor = data.survivor || {};
    stage.className = `modal-panel battle-stage pvp-battle-stage captain-v4-pvp-stage ${won ? 'battle-win-v863' : 'battle-lose-v863'}`;
    stage.innerHTML = `<div class="battle-backdrop"></div><div class="battle-fx-layer"></div><section class="captain-v3-final ${won ? 'victory' : 'defeat'}">
      <small>대장전 · 최종 결과</small><div class="captain-v3-final-emblem">${won ? '승리' : '패배'}</div>
      <h2>${won ? '우리 팀이 끝까지 살아남았습니다' : '상대 팀이 최후까지 살아남았습니다'}</h2>
      <p>최후 생존자 <b>${esc(survivor.nickname || '-')}</b> · 생존 덱 HP ${Number(survivor.hpPercent || 0)}%</p>
      <div class="captain-v4-survivor-deck">${combatDeck(survivor.deckSnapshot || survivor.deckState || [], won ? 'attacker' : 'defender')}</div>
      <div class="captain-v3-score-change"><span>${Number(data.attackerScoreBefore).toLocaleString()}</span><i>→</i><strong>${Number(data.attackerScoreAfter).toLocaleString()}</strong><em>${Number(data.scoreChange) > 0 ? '+' : ''}${Number(data.scoreChange)}점</em></div>
      ${data.victoryReward ? `<div class="captain-v3-victory-reward"><span>공격 승리 보상</span><b>코인 ${Number(data.victoryReward.coin || 0).toLocaleString()} · 카드 조각 ${Number(data.victoryReward.shards || 0).toLocaleString()}${Number(data.victoryReward.magicCrystals||0)>0?` · 마법 결정 ${Number(data.victoryReward.magicCrystals).toLocaleString()}`:''}</b></div>` : ''}
      ${data.victoryRewardError ? `<div class="captain-v3-victory-reward error"><span>보상 지급 오류</span><b>${esc(data.victoryRewardError)}</b></div>` : ''}
      <div class="captain-v3-final-actions"><button class="btn" id="captainBattleClose">대장전으로 돌아가기</button><button class="text-btn" id="captainBattleLogs">공격 로그 보기</button></div>
    </section>`;
    bindImageFallbacks(stage);

    return new Promise(resolve => {
      const close = showLogs => { modal.onclick = null; modal.className = 'modal'; modal.innerHTML = ''; resolve(showLogs); };
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
    modal.innerHTML = '<div class="captain-v3-battle-stage"><div class="captain-v3-match-loading"><i></i><small>경기 준비</small><h2>양 팀 출전 순서 추첨 중</h2><p>공격 횟수 1회로 3대3 전체 경기를 진행합니다.</p></div></div>';

    try {
      const result = await api('captain/fight', {
        method: 'POST',
        body: JSON.stringify({
          opponentTeamId: Number(teamId),
          requestId: globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random()}`
        })
      });
      if(result.victoryReward?.magicBalance!=null){const saved=loadUser();if(saved){saved.magicCrystals=Number(result.victoryReward.magicBalance);saveUser(saved)}}
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
      <div class="captain-v3-log-result"><b>${won ? '승리' : '패배'}</b><span>${Number(row.rounds?.length || 0)}라운드</span></div>
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
        <header class="captain-v3-subhead"><button class="text-btn" id="captainBack">← 대장전</button><div><small>주간 팀 순위</small><h2>대장전 주간 랭킹</h2></div></header>
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
      <div class="captain-v3-kicker">WEEKLY 무작위 GAUNTLET · 3 VS 3</div>
      <h2>최후의 한 명이 남을 때까지</h2>
      <p>PVP 덱을 등록하면 정체가 공개되지 않은 참가자들과 3인 랜덤 팀이 결성됩니다.</p>
      <div class="captain-v3-rule-flow">
        <article><span>01</span><b>랜덤 출전</b><small>양 팀에서 1명씩 무작위 출전</small></article>
        <i>→</i><article><span>02</span><b>승자 잔류</b><small>남은 HP 그대로 다음 상대와 연전</small></article>
        <i>→</i><article><span>3</span><b>최후 생존</b><small>상대 3명을 모두 탈락시키면 승리</small></article>
      </div>
      <div class="captain-v3-rule-badges"><span>개인 공격 최대 5회</span><span>15분마다 1회 충전</span><span>궁극기 전면 미사용</span><span>PVP 5장 덱 사용</span></div>
      <button class="btn captain-v3-main-button" id="captainRegister">대장전 참가 등록</button>${data?.operatorTestParticipant ? '<small class="captain-v3-operator-test">운영자 테스트 참가 활성화 · 정규 운영 랭킹과 분리해 테스트하세요.</small>' : ''}
      <small class="captain-v3-warning">대기 중 취소 시 7일간 재등록할 수 없으며, 팀 결성 후에는 탈퇴할 수 없습니다.</small>
    </section>`;
  }

  function renderWaiting(box, data) {
    box.innerHTML = `<section class="captain-v3-waiting">
      <div class="captain-v3-secret-cards"><i>?</i><i class="me">본인</i><i>?</i></div>
      <small>팀원 정보 비공개 · 무작위 팀 구성</small><h2>팀 결성을 기다리고 있습니다</h2>
      <p>3명이 모일 때까지 다른 참가자의 닉네임과 티어는 공개되지 않습니다.</p>
      <div class="captain-v3-wait-count"><b>${Number(data.waitingCount || 0)}</b><span>현재 매칭 대기</span></div>
      <button class="btn ghost" id="captainCancel">참가 취소 · 7일 등록 제한</button>
    </section>`;
  }

  function opponentCard(team, energy) {
    return `<article class="captain-v3-rival">
      <header><div><small>상대 팀</small><h3>${esc(team.name)}</h3><p>${Number(team.wins || 0)}승 ${Number(team.losses || 0)}패</p></div><strong>${Number(team.score || 0).toLocaleString()}<small>팀 점수</small></strong></header>
      <div class="captain-v3-rival-power"><span>팀 덱 전투력</span><b>${Number(team.teamPower || 0).toLocaleString()}</b></div>
      <div class="captain-v3-rival-roster">${(team.members || []).map(member => memberCard(member, { compact: true })).join('')}</div>
      <div class="captain-v3-rival-rule"><i>무작위</i><span>출전 순서와 다음 출전자는 경기 시작 후 무작위 결정</span></div>
      <button class="btn captain-v3-fight" data-team-id="${Number(team.id)}" ${energy.current <= 0 ? 'disabled' : ''}>3:3 연전 시작</button>
    </article>`;
  }

  function renderDashboard(box, data) {
    const captain = data.team.members.find(member => Number(member.position) === 3);
    box.innerHTML = `<section class="captain-v3-command">
      <header class="captain-v3-team-header">
        <div><small>우리 팀</small><h2>${esc(data.team.name)}</h2><p>대장 ${esc(captain?.nickname || '-')} · ${Number(data.team.wins || 0)}승 ${Number(data.team.losses || 0)}패</p></div>
        <div class="captain-v3-team-score"><span>팀 점수</span><b>${Number(data.team.score || 0).toLocaleString()}</b></div>
      </header>
      <div class="captain-v3-team-roster">${data.team.members.map(member => memberCard(member)).join('')}</div>
      ${data.isCaptain ? `<div class="captain-v3-rename"><div><small>대장 권한</small><b>팀명 변경</b></div><input id="captainTeamName" maxlength="20" value="${esc(data.team.name)}"><button id="captainRename">변경</button></div>` : ''}
      <div class="captain-v3-control-row">
        ${energyBox(data.energy)}
        <div class="captain-v3-shortcuts"><button class="text-btn" id="captainRanking">주간 랭킹</button><button class="text-btn" id="captainHistory">공격·방어 로그</button><button class="text-btn" id="captainReward">지난 주 정산 보상</button></div>
      </div>
    </section>
    <section class="captain-v3-matchboard">
      <header><div><small>3대3 연전</small><h2>상대 팀 선택</h2><p>상대 팀원을 고르는 방식이 아닙니다. 공격 1회로 양 팀 3명이 랜덤 순서로 끝까지 연전합니다.</p></div><div class="captain-v3-format"><b>3</b><i>VS</i><b>3</b></div></header>
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
      document.getElementById('captainReward')?.addEventListener('click', async event => {
        const button = event.currentTarget;
        button.disabled = true;
        try {
          const status = await api('captain/reward/status');
          if (!status.eligible) throw new Error('지난 주 정산 대상이 아니거나 설정된 보상 구간이 없습니다.');
          if (status.claimed) throw new Error('지난 주 정산 보상을 이미 수령했습니다.');
          if (!confirm(`${status.settlementWeek} 주차 ${status.rank}위 정산 보상을 수령할까요?
코인 ${Number(status.reward?.coin||0).toLocaleString()} · 카드 조각 ${Number(status.reward?.shards||0).toLocaleString()}${Number(status.reward?.magicCrystals||0)>0?` · 마법 결정 ${Number(status.reward.magicCrystals).toLocaleString()}`:''}`)) return;
          const result = await api('captain/reward/claim', { method: 'POST', body: '{}' });
          alert(`정산 보상을 수령했습니다.
코인 ${Number(result.reward?.coin||0).toLocaleString()} · 카드 조각 ${Number(result.reward?.shards||0).toLocaleString()}${Number(result.reward?.magicCrystals||0)>0?` · 마법 결정 ${Number(result.reward.magicCrystals).toLocaleString()}`:''}`);
          if(result.reward?.magicBalance!=null){const saved=loadUser();if(saved){saved.magicCrystals=Number(result.reward.magicBalance);saveUser(saved)}}
          await render();
        } catch (error) { alert(error.message); }
        finally { button.disabled = false; }
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

  window.addEventListener('cnine:force-main', () => { active = false; clearInterval(energyTimer); energyTimer = null; stopBgm(true); });
  window.addEventListener('beforeunload', () => stopBgm(true));
  new MutationObserver(installTab).observe(document.documentElement, { childList: true, subtree: true });
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', installTab, { once: true });
  else installTab();
})();
