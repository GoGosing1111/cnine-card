(() => {
  'use strict';

  const root = window;
  const VERSION = '3.9.0-async-raid';
  const PLAYBACK_SPEED = 1.3;
  const SEAL_ORB_ID = 'SEAL_CORE:CRYSTAL_ORB';
  const SEAL_ORB_IMAGE = '/assets/responsive/project-v/monsters/seal-crystal-orb-sd-v1-768.webp?v=550486A8E35C9935';
  const SEAL_ORB_PNG = '/assets/ui/project-v/monsters/seal-crystal-orb-sd-v1.png?v=550486A8E35C9935';
  const sleep = ms => new Promise(resolve => setTimeout(resolve, Math.max(0, Number(ms || 0))));
  const withTimeout = (promise, ms, message, options = {}) => new Promise(resolve => {
    let settled = false;
    const fallback = options.fallback ?? false;
    const finish = value => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve(value);
    };
    const recover = error => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      console.warn(`[PROJECT V V3] ${message}`, error);
      Promise.resolve(options.onFailure?.(error)).catch(recoveryError => {
        console.warn('[PROJECT V V3] 타임아웃 복구 처리 실패', recoveryError);
      }).finally(() => resolve(fallback));
    };
    const timer = setTimeout(() => recover(new Error(message)), Math.max(50, Number(ms || 0)));
    Promise.resolve(promise).then(finish, recover);
  });
  const esc = value => String(value ?? '').replace(/[&<>"']/g, char => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  })[char]);
  const nextPaint = () => new Promise(resolve => requestAnimationFrame(() => resolve()));
  const acceleratedUltimate = (ultimate, fallbackDuration = 3000) => {
    const source = ultimate && typeof ultimate === 'object' ? ultimate : {};
    const baseRate = Math.max(.5, Math.min(3, Number(source.playbackRate || 1)));
    const baseDuration = Math.max(500, Math.min(30000, Number(source.durationMs || fallbackDuration)));
    return {
      ...source,
      playbackRate: Math.max(.5, Math.min(3, baseRate * PLAYBACK_SPEED)),
      durationMs: Math.max(320, Math.round(baseDuration / PLAYBACK_SPEED))
    };
  };
  const ultimateGuardMs = (ultimate, fallbackDuration = 3000) => {
    void ultimate;
    void fallbackDuration;
    return 35000;
  };

  function battlefieldMode(mode, data = {}) {
    const raw = String(data?.floor ? 'TOWER' : data?.battlefieldMode || data?.mode || mode || 'HUNT').toUpperCase();
    if (/TOWER|INFINITE/.test(raw)) return 'TOWER';
    if (/PVP|RANK|ARENA/.test(raw)) return 'PVP';
    if (/RAID/.test(raw)) return 'RAID';
    if (/SEAL/.test(raw)) return 'SEAL';
    if (/SIEGE|TERRITORY/.test(raw)) return 'SIEGE';
    return 'HUNT';
  }

  function prepareLoading({ modal, mode = 'PVE', playerName = 'MEMBER TEAM', opponentName = 'OPPONENT', autoText = '' } = {}) {
    if (!modal) throw new Error('V3 전투 모달을 준비하지 못했습니다.');
    const field = battlefieldMode(mode);
    // Show the selected battlefield immediately. The lightweight loader stays
    // over that scene only until Pixi commits its first authoritative frame.
    modal.className = `modal show battle-modal battle-v3-modal battle-v3-preparing ${field === 'PVP' ? 'pvp-battle-modal' : ''}`;
    modal.innerHTML = `<div class="modal-panel battle-stage battle-v3-live-shell" data-battle-v3-live="${VERSION}" data-v3-field="${field}">
      <header class="battle-v3-header">
        <div><small>PROJECT V · PIXIJS WEBGL</small><strong>${field === 'TOWER' ? '무한의 탑' : field === 'PVP' ? 'PVP 랭크전' : field === 'RAID' ? '월드 레이드 개인전' : field === 'SEAL' ? '봉인전' : '몬스터 토벌'}</strong></div>
        <div class="battle-v3-versus"><span>${esc(playerName)}</span><i>VS</i><span>${esc(opponentName)}</span></div>
        <b id="battlePhase">V3 LOADING</b>
      </header>
      <div class="battle-v3-canvas-host pv-pixi-battle" id="pvPixiBattle">
        <div class="battle-v3-loader"><i></i><b>V3 WebGL 전장 구성 중</b><span>${esc(autoText || 'SD 전투 자산과 서버 타임라인을 동기화하고 있습니다.')}</span></div>
      </div>
      <div class="battle-v3-status pv-battle-status" id="pvBattleStatus" role="status" aria-live="polite">PixiJS 렌더러 준비 중</div>
      <span id="towerBattleCountdown" hidden></span>
      <div id="battleMessage" class="battle-message battle-v3-result"><span>V3 전투 준비 중...</span></div>
      <div id="towerBattleMessage" class="battle-message battle-v3-result tower-v3-result" hidden><span>V3 전투 준비 중...</span></div>
    </div>`;
    const stage = modal.querySelector('.battle-v3-live-shell');
    return {
      stage,
      phase: stage.querySelector('#battlePhase'),
      msg: stage.querySelector('#battleMessage'),
      towerMsg: stage.querySelector('#towerBattleMessage'),
      host: stage.querySelector('#pvPixiBattle'),
      mode: field
    };
  }

  function cardId(card, index, side) {
    return String(card?.cardId || card?.id || `${side}-${index + 1}`);
  }

  function normalizeTowerCard(card, index) {
    return {
      ...card,
      cardId: cardId(card, index, 'A'),
      id: cardId(card, index, 'A'),
      title: card?.title || card?.name || `CARD ${index + 1}`,
      name: card?.name || card?.title || `CARD ${index + 1}`,
      grade: String(card?.grade || card?.rarity || 'C').toUpperCase(),
      rarity: String(card?.rarity || card?.grade || 'C').toUpperCase(),
      image: card?.image || card?.image_url || '',
      image_url: card?.image_url || card?.image || '',
      hp: 100,
      maxHp: 100
    };
  }

  function towerPayload({ data = {}, floor = {}, cards = [] } = {}) {
    const allies = cards.map(normalizeTowerCard);
    const monsterId = String(floor.monsterId || floor.id || 0);
    const monster = {
      id: monsterId,
      monsterId,
      cardId: `MONSTER:${monsterId}`,
      name: floor.monsterName || floor.name || 'TOWER MONSTER',
      title: floor.monsterName || floor.name || 'TOWER MONSTER',
      image: floor.monsterImage || floor.image || '',
      grade: 'MONSTER',
      isBoss: Boolean(floor.isBoss),
      mode: 'TOWER',
      hp: 100,
      maxHp: 100
    };
    const win = data.result === 'WIN';
    const enemySteps = win ? [14, 17, 19, 22, 28] : [7, 9, 11, 13, 15];
    let enemyHp = 100;
    const timeline = [];
    allies.forEach((card, index) => {
      enemyHp = Math.max(win && index < allies.length - 1 ? 4 : win ? 0 : 24, enemyHp - enemySteps[index]);
      timeline.push({ type: index === 2 ? 'SKILL' : 'TURN', actorId: card.cardId, targetId: monster.cardId, damage: Math.max(100, Math.round(Number(data.monsterPower || 1000) * enemySteps[index] / 100)), targetHpAfter: enemyHp, critical: index === 2 });
      if ((index === 1 || index === 3) && !win) timeline.push({ type: 'COUNTER', actorId: monster.cardId, targetId: allies[index]?.cardId, damage: Math.max(100, Math.round(Number(data.playerPower || 1000) * .16)), targetHpAfter: Math.max(1, 72 - index * 12) });
    });
    if (win) timeline.push({ type: 'KO', targetId: monster.cardId });
    timeline.push({ type: 'RESULT', winner: win ? 'A' : 'B', actions: timeline.length });
    return {
      ...data,
      mode: 'TOWER',
      battlefieldMode: 'TOWER',
      floor,
      monster,
      battleV2: {
        teams: { A: { cards: allies }, B: { cards: [monster] } },
        result: { timeline, winner: win ? 'A' : 'B', actions: timeline.length }
      }
    };
  }

  function sealPayload({ data = {}, roleKey = 'ATTACK', roleLabel = '파괴 봉인' } = {}) {
    const allies = (Array.isArray(data.cards) ? data.cards : []).slice(0, 5).map(normalizeTowerCard);
    const monster = {
      id: SEAL_ORB_ID,
      monsterId: SEAL_ORB_ID,
      cardId: `MONSTER:${SEAL_ORB_ID}`,
      name: '봉인 수정구',
      title: '봉인 수정구',
      image: SEAL_ORB_IMAGE,
      image_url: SEAL_ORB_IMAGE,
      grade: 'BOSS',
      isBoss: true,
      mode: 'SEAL',
      hp: 100,
      maxHp: 100,
      projectVMonsterArt: {
        scope: 'BATTLE_ENGINE_ONLY',
        kind: 'SEAL_CRYSTAL_ORB_SD',
        primaryUrl: SEAL_ORB_IMAGE,
        pngFallbackUrl: SEAL_ORB_PNG,
        footAnchor: { x: .5, y: .94 },
        objectFit: 'contain',
        objectPosition: '50% 100%',
        scaleMultiplier: 1.04,
        approved: true,
        technicalPass: true
      }
    };
    const win = String(data.result || '').toUpperCase() === 'WIN';
    const steps = win ? [16, 18, 19, 21, 26] : [8, 10, 12, 14, 16];
    let enemyHp = 100;
    const timeline = [];
    allies.forEach((card, index) => {
      const damagePercent = steps[Math.min(index, steps.length - 1)];
      enemyHp = Math.max(win && index === allies.length - 1 ? 0 : win ? 3 : 26, enemyHp - damagePercent);
      timeline.push({
        type: index === 2 || index === 4 ? 'SKILL' : 'TURN',
        actorId: card.cardId,
        targetId: monster.cardId,
        damage: Math.max(1, Math.round(Number(data.totalBattleDamage || data.playerPower || 1000) * damagePercent / 100)),
        targetHpAfter: enemyHp,
        critical: index === 2 || index === 4,
        label: `${roleLabel} 타격`
      });
      if (enemyHp > 0 && (win ? index === 1 || index === 3 : true)) {
        const allyHp = win ? Math.max(24, 78 - index * 14) : 0;
        timeline.push({
          type: 'COUNTER',
          actorId: monster.cardId,
          targetId: card.cardId,
          damage: Math.max(1, Math.round(Number(data.bossPower || 1000) * (win ? .13 : .24))),
          targetHpAfter: allyHp,
          critical: !win,
          label: '봉인 역류'
        });
        if (!win) timeline.push({ type: 'KO', targetId: card.cardId });
      }
    });
    if (win) timeline.push({ type: 'KO', targetId: monster.cardId });
    timeline.push({ type: 'RESULT', winner: win ? 'A' : 'B', actions: timeline.length });
    return {
      ...data,
      mode: 'SEAL',
      battlefieldMode: 'SEAL',
      roleKey,
      roleLabel,
      monster,
      playUltimateCinematics: false,
      battleV2: {
        teams: { A: { cards: allies }, B: { cards: [monster] } },
        result: { timeline, winner: win ? 'A' : 'B', actions: timeline.length }
      }
    };
  }

  function raidPayload({ data = {}, participant = {}, current = {} } = {}) {
    const allies = (Array.isArray(participant.cards) ? participant.cards : []).slice(0, 5).map(normalizeTowerCard);
    const bossId = String(current.bossId || current.id || 'WORLD');
    const boss = {
      id: bossId,
      monsterId: bossId,
      cardId: `MONSTER:RAID:${bossId}`,
      name: current.bossName || 'WORLD RAID BOSS',
      title: current.bossName || 'WORLD RAID BOSS',
      image: current.bossImage || '',
      image_url: current.bossImage || '',
      grade: 'BOSS',
      isBoss: true,
      mode: 'RAID',
      hp: 100,
      maxHp: 100
    };
    const bossPct = Math.max(2, Math.min(100, Math.round(Number(current.currentHp || 0) / Math.max(1, Number(current.maxHp || 1)) * 100)));
    const personalDamage = Math.max(1, Number(participant.shownDamage || participant.totalDamage || participant.totalPower || 1));
    const steps = [10, 12, 14, 16, 18];
    let enemyHp = Math.max(bossPct, 70), allyHp = 100;
    const timeline = [];
    allies.forEach((card, index) => {
      const step = steps[index] || 12;
      enemyHp = Math.max(bossPct, enemyHp - step);
      timeline.push({
        type: index === 2 || index === 4 ? 'SKILL' : 'TURN',
        actorId: card.cardId,
        targetId: boss.cardId,
        damage: Math.max(1, Math.round(personalDamage * step / 70)),
        targetHpAfter: enemyHp,
        critical: index === 2 || index === 4,
        label: '개인 공헌 타격'
      });
      if (index === 1 || index === 3) {
        allyHp = Math.max(18, allyHp - 26);
        timeline.push({
          type: 'COUNTER', actorId: boss.cardId, targetId: card.cardId,
          damage: Math.max(1, Math.round(Number(current.maxHp || 1000) * .0025)),
          targetHpAfter: allyHp, label: '레이드 보스 반격'
        });
      }
    });
    timeline.push({ type: 'RESULT', winner: 'A', actions: timeline.length, label: '개인 전투 완료' });
    return {
      ...data,
      mode: 'RAID',
      battlefieldMode: 'RAID',
      monster: boss,
      raidParticipant: participant,
      playUltimateCinematics: true,
      battleV2: {
        teams: { A: { cards: allies }, B: { cards: [boss] } },
        result: { timeline, winner: 'A', actions: timeline.length }
      }
    };
  }

  async function createRenderer(options = {}) {
    if (!root.ProjectVPixiBattle) throw new Error('V3 PixiJS 번들이 로드되지 않았습니다.');
    const stage = options.stage || options.modal?.querySelector('.battle-v3-live-shell');
    const host = options.host || stage?.querySelector('#pvPixiBattle');
    if (!stage || !host) throw new Error('V3 WebGL 렌더링 영역이 없습니다.');
    const phase = options.phase || stage.querySelector('#battlePhase');
    const status = stage.querySelector('#pvBattleStatus');
    const mode = battlefieldMode(options.mode, options.data);
    const playUltimateCinematics = options.playUltimateCinematics !== false;
    const modal = options.modal || stage.closest?.('.modal') || null;
    let destroyed = false;
    let payload = { ...(options.data || {}), mode, battlefieldMode: mode };
    if (options.monster) payload.monster = { ...options.monster, mode };
    if (options.floor) payload = towerPayload({ data: payload, floor: options.floor, cards: options.cards || payload.cards || [] });

    const releaseBlockingLayers = () => {
      document.querySelectorAll('.battle-ultimate-overlay,.boss-ultimate-overlay').forEach(node => node.remove());
      stage.classList.remove('ultimate-playing', 'boss-ultimate-fullscreen');
      host.querySelector('.battle-v3-loader')?.remove();
    };
    const recoverPlayback = async message => {
      releaseBlockingLayers();
      if (status) status.textContent = `${message} · 다음 연출로 계속 진행합니다.`;
      try { await root.ProjectVPixiBattle.setVisible(false); } catch {}
      try { await root.ProjectVPixiBattle.setVisible(true); } catch {}
    };
    const safePlayEvents = (events, message) => withTimeout(
      Promise.resolve(root.ProjectVPixiBattle.playEvents(events)).then(() => true),
      2000,
      message,
      { fallback: false, onFailure: () => recoverPlayback(message) }
    );
    const revealBattle = () => modal?.classList.remove('battle-v3-preparing');
    const assertFirstFrame = async () => {
      await nextPaint();
      await nextPaint();
      const canvas = host.querySelector('canvas');
      if (!canvas || canvas.width < 2 || canvas.height < 2) throw new Error('V3 첫 프레임이 생성되지 않았습니다.');
      const context = canvas.getContext('webgl2') || canvas.getContext('webgl');
      if (!context || context.isContextLost?.()) throw new Error('WebGL 컨텍스트를 사용할 수 없습니다.');
    };
    const init = async () => {
      const initialize = async () => {
        if (phase) phase.textContent = 'V3 RENDERER';
        const diagnostics = root.ProjectVPixiBattle.diagnostics?.();
        if (root.__V3_PIXI_MOUNTED && diagnostics?.mounted === false) {
          root.__V3_PIXI_MOUNTED = false;
          root.__V3_PIXI_CANVAS = null;
          root.__V3_PIXI_INIT_PROMISE = null;
        }
        if (!root.__V3_PIXI_MOUNTED) {
          if (!root.__V3_PIXI_INIT_PROMISE) {
            root.__V3_PIXI_INIT_PROMISE = (async () => {
              if (typeof root.ProjectVPixiBattle.mountForBattle === 'function') {
                await root.ProjectVPixiBattle.mountForBattle(payload, host);
              } else {
                await root.ProjectVPixiBattle.mount(host);
                await root.ProjectVPixiBattle.setBattlePayload(payload);
              }
              root.__V3_PIXI_MOUNTED = true;
              root.__V3_PIXI_CANVAS = host.querySelector('canvas');
            })().catch(error => {
              root.__V3_PIXI_MOUNTED = false;
              root.__V3_PIXI_CANVAS = null;
              root.__V3_PIXI_INIT_PROMISE = null;
              throw error;
            });
          }
          await root.__V3_PIXI_INIT_PROMISE;
        } else {
          const canvas = root.__V3_PIXI_CANVAS;
          if (canvas && canvas.parentNode !== host) host.appendChild(canvas);
          await root.ProjectVPixiBattle.setVisible(false);
          if (phase) phase.textContent = 'SERVER ASSET SYNC';
          if (typeof root.ProjectVPixiBattle.resetSession === 'function') {
            await root.ProjectVPixiBattle.resetSession(payload, host);
          } else {
            await root.ProjectVPixiBattle.setBattlePayload(payload);
          }
        }
        await root.ProjectVPixiBattle.setBattlefield(mode);
        await root.ProjectVPixiBattle.setVisible(true);
        root.__V3_PIXI_CANVAS = host.querySelector('canvas') || root.__V3_PIXI_CANVAS;
        await assertFirstFrame();
        stage.classList.add('is-v3-ready');
        revealBattle();
        if (phase) phase.textContent = 'V3 READY';
        if (status) status.textContent = '서버 전투 데이터 동기화 완료';
      };
      let lastError = null;
      for (let attempt = 0; attempt < 2; attempt += 1) {
        try {
          await initialize();
          return;
        } catch (error) {
          lastError = error;
          try { await root.ProjectVPixiBattle.setVisible(false); } catch {}
          if (attempt === 0) {
            if (phase) phase.textContent = 'V3 RENDER RETRY';
            if (status) status.textContent = 'WebGL 전장을 즉시 다시 구성하고 있습니다.';
            await nextPaint();
          }
        }
      }
      releaseBlockingLayers();
      stage.classList.add('is-v3-error');
      revealBattle();
      throw lastError || new Error('V3 전장을 구성하지 못했습니다.');
    };

    await init();
    return {
      async play() {
        if (destroyed) return false;
        const timeline = Array.isArray(payload?.battleV2?.result?.timeline) ? payload.battleV2.result.timeline : [];
        if (phase) phase.textContent = 'V3 LIVE BATTLE';
        try {
          await safePlayEvents([{ type: 'DEPLOY' }], 'V3 배치 연출이 지연되어 생략되었습니다.');
          let playerUltimateShown = false;
          let bossUltimateShown = false;
          for (const sourceEvent of timeline) {
            if (destroyed) return false;
            const type = String(sourceEvent?.type || '').toUpperCase();
            let event = { ...sourceEvent };
            if (type === 'PVE_ULTIMATE') {
              const sourceCard = payload?.ultimateSourceCard || null;
              event = {
                ...event,
                actorId: event.actorId || sourceCard?.id || sourceCard?.cardId || '',
                label: payload?.activatedUltimate?.name || event.label || '궁극기'
              };
              if (!playerUltimateShown && playUltimateCinematics && payload?.activatedUltimate && typeof root.playBattleUltimate === 'function') {
                playerUltimateShown = true;
                const ultimate = acceleratedUltimate(payload.activatedUltimate, 3000);
                await withTimeout(
                  root.playBattleUltimate(stage, ultimate, event.damage || payload?.ultimateDamage || payload?.bonusDamage || 0),
                  ultimateGuardMs(ultimate, 3000),
                  '유저 궁극기 연출이 지연되어 생략되었습니다.',
                  { fallback: false, onFailure: releaseBlockingLayers }
                );
              }
            } else if (type === 'BOSS_ULTIMATE') {
              const monsterCard = payload?.battleV2?.teams?.B?.cards?.find?.(card => /^MONSTER:/i.test(String(card?.cardId || '')) || ['MONSTER', 'BOSS'].includes(String(card?.grade || '').toUpperCase()));
              event = {
                ...event,
                actorId: event.actorId || monsterCard?.id || monsterCard?.cardId || payload?.monster?.cardId || '',
                label: payload?.bossUltimate?.name || event.label || '보스 궁극기'
              };
              if (!bossUltimateShown && playUltimateCinematics && payload?.bossUltimate && typeof root.playBossBattleUltimate === 'function') {
                bossUltimateShown = true;
                const ultimate = acceleratedUltimate(payload.bossUltimate, 2400);
                await withTimeout(
                  root.playBossBattleUltimate(stage, phase, ultimate),
                  ultimateGuardMs(ultimate, 2400),
                  '보스 궁극기 연출이 지연되어 생략되었습니다.',
                  { fallback: false, onFailure: releaseBlockingLayers }
                );
              }
            }
            await safePlayEvents([event], `${event.label || type || '전투'} 연출이 지연되어 다음 행동으로 이동했습니다.`);
          }
          const finalState = payload?.battleV2?.result?.final || {};
          const knockoutEvents = ['A', 'B'].flatMap(side => (Array.isArray(finalState?.[side]) ? finalState[side] : []))
            .filter(card => Number(card?.hp || 0) <= 0)
            .map(card => ({ type: 'KO', targetId: card.id || card.cardId }));
          if (knockoutEvents.length) await safePlayEvents(knockoutEvents, '서버 최종 생존 상태를 즉시 동기화했습니다.');
        } catch (error) {
          releaseBlockingLayers();
          stage.classList.add('is-v3-error');
          revealBattle();
          throw new Error(`V3 전투 연출을 완료하지 못했습니다: ${error?.message || error}`);
        }
        if (phase) phase.textContent = 'BATTLE COMPLETE';
        return true;
      },
      showResult() {
        releaseBlockingLayers();
        stage.classList.add('is-v3-ready', 'is-result-visible');
        stage.querySelectorAll('.battle-v3-result').forEach(node => node.classList.add('is-visible'));
        revealBattle();
      },
      destroy() {
        if (destroyed) return;
        destroyed = true;
        root.ProjectVPixiBattle.setVisible(false).catch?.(() => {});
      }
    };
  }

  async function playTower(options = {}) {
    const data = towerPayload(options);
    const renderer = await createRenderer({ ...options, data, mode: 'TOWER' });
    options.modal.__battleV2Renderer = renderer;
    const played = await renderer.play();
    if (!played) throw new Error('V3 무한의 탑 전투가 완료되지 않았습니다.');
    await sleep(120);
    return renderer;
  }

  async function playSeal(options = {}) {
    const data = sealPayload(options);
    const renderer = await createRenderer({ ...options, data, mode: 'SEAL', playUltimateCinematics: false });
    if (options.modal) options.modal.__battleV2Renderer = renderer;
    const played = await renderer.play();
    if (!played) throw new Error('V3 봉인전 전투가 완료되지 않았습니다.');
    renderer.showResult();
    return renderer;
  }

  async function playRaid(options = {}) {
    const data = raidPayload(options);
    const renderer = await createRenderer({ ...options, data, mode: 'RAID' });
    if (options.modal) options.modal.__battleV2Renderer = renderer;
    const played = await renderer.play();
    if (!played) throw new Error('V3 레이드 개인 전투가 완료되지 않았습니다.');
    return renderer;
  }

  root.ProjectVBattleV3Live = Object.freeze({
    version: VERSION,
    playbackSpeed: PLAYBACK_SPEED,
    ready: () => Boolean(root.ProjectVPixiBattle),
    prepareLoading,
    createRenderer,
    playTower,
    towerPayload,
    playSeal,
    sealPayload,
    playRaid,
    raidPayload
  });
  root.playTowerBattleV3Live = playTower;
  root.playSealBattleV3Live = playSeal;
  root.playRaidBattleV3Live = playRaid;
})();
