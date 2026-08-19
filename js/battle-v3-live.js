(() => {
  'use strict';

  const root = window;
  const VERSION = '3.2.0-hidden-boot-1.6x';
  const PLAYBACK_SPEED = 1.6;
  const INIT_WATCHDOG_MS = 3000;
  const EVENT_WATCHDOG_MS = 3500;
  const sleep = ms => new Promise(resolve => setTimeout(resolve, Math.max(0, Number(ms || 0))));
  const withTimeout = (promise, ms, message) => new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(message)), Math.max(50, Number(ms || 0)));
    Promise.resolve(promise).then(
      value => { clearTimeout(timer); resolve(value); },
      error => { clearTimeout(timer); reject(error); }
    );
  });
  const esc = value => String(value ?? '').replace(/[&<>"']/g, char => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  })[char]);
  const watchdogMs = (value, fallback) => Math.max(50, Number.isFinite(Number(value)) ? Number(value) : fallback);
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

  function battlefieldMode(mode, data = {}) {
    const raw = String(data?.floor ? 'TOWER' : data?.battlefieldMode || data?.mode || mode || 'HUNT').toUpperCase();
    if (/TOWER|INFINITE/.test(raw)) return 'TOWER';
    if (/PVP|RANK|ARENA/.test(raw)) return 'PVP';
    if (/RAID/.test(raw)) return 'RAID';
    if (/SIEGE|SEAL|TERRITORY/.test(raw)) return 'SIEGE';
    return 'HUNT';
  }

  function prepareLoading({ modal, mode = 'PVE', playerName = 'MEMBER TEAM', opponentName = 'OPPONENT', autoText = '' } = {}) {
    if (!modal) throw new Error('V3 전투 모달을 준비하지 못했습니다.');
    const field = battlefieldMode(mode);
    // Mount Pixi invisibly over the current route. The modal is revealed only
    // after the first authoritative server frame is ready, preventing a black
    // loading battlefield from flashing in front of the player.
    modal.className = `modal show battle-modal battle-v3-modal battle-v3-preparing ${field === 'PVP' ? 'pvp-battle-modal' : ''}`;
    modal.innerHTML = `<div class="modal-panel battle-stage battle-v3-live-shell" data-battle-v3-live="${VERSION}" data-v3-field="${field}">
      <header class="battle-v3-header">
        <div><small>PROJECT V · PIXIJS WEBGL</small><strong>${field === 'TOWER' ? '무한의 탑' : field === 'PVP' ? 'PVP 랭크전' : '몬스터 토벌'}</strong></div>
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
    const initWatchdogMs = watchdogMs(options.initWatchdogMs, INIT_WATCHDOG_MS);
    const eventWatchdogMs = watchdogMs(options.eventWatchdogMs, EVENT_WATCHDOG_MS);
    let destroyed = false;
    let rendererFailure = null;
    let payload = { ...(options.data || {}), mode, battlefieldMode: mode };
    if (options.monster) payload.monster = { ...options.monster, mode };
    if (options.floor) payload = towerPayload({ data: payload, floor: options.floor, cards: options.cards || payload.cards || [] });

    const releaseBlockingLayers = () => {
      document.querySelectorAll('.battle-ultimate-overlay,.boss-ultimate-overlay').forEach(node => node.remove());
      stage.classList.remove('ultimate-playing', 'boss-ultimate-fullscreen');
      host.querySelector('.battle-v3-loader')?.remove();
    };
    const revealBattle = () => modal?.classList.remove('battle-v3-preparing');
    const recoverRenderer = error => {
      rendererFailure = error instanceof Error ? error : new Error(String(error || 'V3 렌더러 복구'));
      try { root.ProjectVPixiBattle.destroy(); } catch {}
      releaseBlockingLayers();
      stage.classList.remove('is-v3-error');
      stage.classList.add('is-v3-ready', 'is-v3-recovered');
      if (phase) phase.textContent = 'RESULT RECOVERY';
      if (status) status.textContent = '전투 판정 완료 · 결과 화면으로 복구했습니다.';
      console.warn('[PROJECT V V3] renderer recovered:', rendererFailure.message);
      return false;
    };
    const init = async () => {
      const initialize = async () => {
        root.ProjectVPixiBattle.destroy();
        if (phase) phase.textContent = 'V3 RENDERER';
        await root.ProjectVPixiBattle.mount(host);
        if (phase) phase.textContent = 'SERVER ASSET SYNC';
        // Live battles must receive the authoritative server payload before the
        // canvas becomes visible. This prevents preview cards/slimes from ever
        // reaching a production frame and guarantees a single DEPLOY event.
        await root.ProjectVPixiBattle.setBattlePayload(payload);
        await root.ProjectVPixiBattle.setBattlefield(mode);
        await root.ProjectVPixiBattle.setVisible(true);
        stage.classList.add('is-v3-ready');
        revealBattle();
        if (phase) phase.textContent = 'V3 READY';
        if (status) status.textContent = '서버 전투 데이터 동기화 완료';
      };
      try {
        await withTimeout(initialize(), initWatchdogMs, 'V3 전장 준비 제한 시간을 초과했습니다.');
      } catch (error) { recoverRenderer(error); }
    };

    await init();
    return {
      async play() {
        if (destroyed) return false;
        if (rendererFailure) return false;
        const timeline = Array.isArray(payload?.battleV2?.result?.timeline) ? payload.battleV2.result.timeline : [];
        if (phase) phase.textContent = 'V3 LIVE BATTLE';
        try {
          await withTimeout(root.ProjectVPixiBattle.playEvents([{ type: 'DEPLOY' }]), eventWatchdogMs, 'V3 전투 배치가 지연되었습니다.');
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
                await withTimeout(root.playBattleUltimate(stage, ultimate, event.damage || payload?.ultimateDamage || payload?.bonusDamage || 0), Math.min(22000, ultimate.durationMs + 2500), '유저 궁극기 연출이 지연되었습니다.');
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
                await withTimeout(root.playBossBattleUltimate(stage, phase, ultimate), Math.min(22000, ultimate.durationMs + 2500), '보스 궁극기 연출이 지연되었습니다.');
              }
            }
            await withTimeout(root.ProjectVPixiBattle.playEvents([event]), eventWatchdogMs, `${event.label || type || '전투'} 연출이 지연되었습니다.`);
          }
        } catch (error) {
          recoverRenderer(error);
          return false;
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
        root.ProjectVPixiBattle.destroy();
      }
    };
  }

  async function playTower(options = {}) {
    const data = towerPayload(options);
    const renderer = await createRenderer({ ...options, data, mode: 'TOWER' });
    options.modal.__battleV2Renderer = renderer;
    await renderer.play();
    await sleep(120);
    return renderer;
  }

  root.ProjectVBattleV3Live = Object.freeze({
    version: VERSION,
    playbackSpeed: PLAYBACK_SPEED,
    ready: () => Boolean(root.ProjectVPixiBattle),
    prepareLoading,
    createRenderer,
    playTower,
    towerPayload
  });
  root.playTowerBattleV3Live = playTower;
})();
