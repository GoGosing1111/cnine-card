(() => {
  'use strict';

  const root = window;
  const VERSION = '3.13.0-roster-verdict';
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

  // ---------------------------------------------------------------------
  // V1796: 출전 카드 로스터 + 판정 근거 노출
  //
  // V3 전장은 SD 캐릭터만 그리기 때문에 "지금 어떤 카드가 나가 있는지" 를
  // 화면에서 알 수 없었다(V2 스코어보드가 V3 셸에서 통째로 빠졌다).
  //   - PVE 계열(HUNT/TOWER/SEAL/RAID/SIEGE): 하단 중앙에 내 출전 카드 한 줄
  //   - PVP: 하단 좌(나) / 우(상대) 두 줄로 양쪽 출전 카드
  // 여기에 더해 서버가 이미 계산해서 내려주는 판정 근거(reason)와 생존 수를
  // 결과 화면에 띄운다. "내 카드가 살아있는데 패배가 떴다" 는 제보를 재현 없이
  // 판별하려면 연출된 화면이 아니라 서버가 확정한 값을 보여줘야 한다.
  // ---------------------------------------------------------------------
  const ROSTER_MAX = 5;
  const FALLBACK_ART = '/assets/ui/cninelogo.png';
  const VERDICT_REASON_TEXT = {
    ELIMINATION: '전멸 판정',
    SURVIVOR_COUNT: '시간 종료 · 생존 수 우세',
    HP_RATIO_TIEBREAK: '시간 종료 · 잔여 체력 우세',
    POWER_TIEBREAK: '시간 종료 · 편성 전투력 우세',
    TIME_LIMIT: '제한 시간 초과',
    ACTION_LIMIT: '행동 횟수 초과'
  };

  function encodePathPart(part) {
    if (!part) return '';
    try { return encodeURIComponent(decodeURIComponent(part)); }
    catch { return encodeURIComponent(part); }
  }

  // battle-v2-live.js 의 assetUrl 과 같은 규칙. 저기서 export 하지 않으므로
  // (그리고 V3 는 V2 렌더러 없이도 단독으로 떠야 하므로) 여기에도 둔다.
  function assetUrl(value) {
    let raw = String(value || '').trim();
    if (!raw) return FALLBACK_ART;
    if (/^(?:data:|blob:)/i.test(raw)) return raw;
    raw = raw.replace(/\\/g, '/').replace(/#/g, '%23');
    if (/^https?:\/\//i.test(raw)) {
      try {
        const url = new URL(raw);
        url.pathname = url.pathname.split('/').map(encodePathPart).join('/');
        return url.href;
      } catch { return raw; }
    }
    const queryIndex = raw.indexOf('?');
    const query = queryIndex >= 0 ? raw.slice(queryIndex) : '';
    let path = queryIndex >= 0 ? raw.slice(0, queryIndex) : raw;
    path = path.replace(/^(?:\.\.\/)+/, '').replace(/^\.\//, '').replace(/^\/+/, '');
    return `/${path.split('/').map(encodePathPart).join('/')}${query}`;
  }

  const isMonsterCard = card => /^MONSTER:/i.test(String(card?.cardId || card?.id || ''))
    || ['MONSTER', 'BOSS'].includes(String(card?.grade || '').toUpperCase());

  // 최종 생존 상태(final)는 엔진 fighter 의 id 로 오고, 로스터는 서버 카드의
  // cardId 로 그려질 수도 있다. 둘 다 키로 잡아 둬야 매칭이 어긋나지 않는다.
  const rosterKeys = card => [card?.id, card?.cardId]
    .map(value => String(value ?? '').trim())
    .filter(Boolean);

  function rosterCardHtml(card, index) {
    const grade = (String(card?.grade || card?.rarity || 'C').toUpperCase().replace(/[^A-Z0-9_-]/g, '') || 'C');
    const level = Math.max(0, Math.min(13, Number(card?.breakthroughLevel || 0)));
    const title = String(card?.title || card?.name || `CARD ${index + 1}`);
    const owner = String(card?.memberName || '');
    const row = String(card?.row || '').toUpperCase();
    const key = rosterKeys(card)[0] || `slot-${index + 1}`;
    return `<li class="battle-v3-roster-card grade-${esc(grade)}" data-v3-roster-card="${esc(key)}" data-v3-roster-keys="${esc(rosterKeys(card).join('|'))}">
      <span class="battle-v3-roster-art"><img src="${esc(assetUrl(card?.image || card?.image_url))}" alt="${esc(title)}" loading="lazy" decoding="async" style="object-position:${Number(card?.focusX ?? 50)}% ${Number(card?.focusY ?? 50)}%" onerror="this.onerror=null;this.src='${FALLBACK_ART}'"><i class="battle-v3-roster-ko" aria-hidden="true">KO</i></span>
      <span class="battle-v3-roster-meta"><b>${esc(grade)}</b>${level > 0 ? `<i>★${level}</i>` : ''}${row ? `<em>${row === 'FRONT' ? '전열' : '후열'}</em>` : ''}</span>
      <span class="battle-v3-roster-name">${esc(title)}</span>
      ${owner && owner !== title ? `<small>${esc(owner)}</small>` : ''}
    </li>`;
  }

  function renderRoster(stage, payload, mode) {
    const roster = stage?.querySelector?.('[data-v3-roster]');
    if (!roster) return 0;
    const teams = payload?.battleV2?.teams || {};
    const versus = mode === 'PVP';
    const owners = [...stage.querySelectorAll('.battle-v3-versus span')].map(node => String(node.textContent || '').trim());
    let shown = 0;
    ['A', 'B'].forEach((side, index) => {
      const section = roster.querySelector(`[data-v3-roster-side="${side}"]`);
      if (!section) return;
      const cards = (Array.isArray(teams?.[side]?.cards) ? teams[side].cards : [])
        .filter(card => card && !isMonsterCard(card))
        .slice(0, ROSTER_MAX);
      const visible = (side === 'A' || versus) && cards.length > 0;
      section.hidden = !visible;
      if (!visible) {
        section.querySelector('[data-v3-roster-list]').innerHTML = '';
        return;
      }
      shown += 1;
      const label = section.querySelector('[data-v3-roster-label]');
      const owner = section.querySelector('[data-v3-roster-owner]');
      if (label) label.textContent = side === 'A' ? (versus ? 'MY TEAM' : '출전 카드') : 'OPPONENT';
      if (owner) owner.textContent = owners[index] || '';
      section.querySelector('[data-v3-roster-list]').innerHTML = cards.map(rosterCardHtml).join('');
    });
    roster.hidden = shown === 0;
    stage.classList.toggle('is-roster-visible', shown > 0);
    return shown;
  }

  function markRosterFinalState(stage, finalState) {
    const roster = stage?.querySelector?.('[data-v3-roster]');
    if (!roster || roster.hidden) return;
    const hpByKey = new Map();
    ['A', 'B'].forEach(side => {
      (Array.isArray(finalState?.[side]) ? finalState[side] : []).forEach(card => {
        const hp = Number(card?.hp || 0);
        rosterKeys(card).forEach(key => hpByKey.set(key, hp));
      });
    });
    if (!hpByKey.size) return;
    roster.querySelectorAll('[data-v3-roster-card]').forEach(node => {
      const key = String(node.dataset.v3RosterKeys || node.dataset.v3RosterCard || '')
        .split('|').find(candidate => hpByKey.has(candidate));
      if (key === undefined) return;
      const hp = hpByKey.get(key);
      node.classList.toggle('is-ko', hp <= 0);
      node.classList.toggle('is-alive', hp > 0);
    });
  }

  function survivorCounts(result) {
    const counted = side => (Array.isArray(result?.final?.[side]) ? result.final[side] : [])
      .filter(card => Number(card?.hp || 0) > 0).length;
    const declared = result?.survivorCount || {};
    return {
      A: Number.isFinite(Number(declared.A)) ? Number(declared.A) : counted('A'),
      B: Number.isFinite(Number(declared.B)) ? Number(declared.B) : counted('B')
    };
  }

  // 서버가 확정한 승패 근거. 연출(타임라인)이 타임아웃으로 일부 생략돼도
  // 이 줄은 항상 서버 값을 그대로 보여준다.
  function verdictSummary(payload, mode) {
    const result = payload?.battleV2?.result;
    const winner = String(result?.winner || '').toUpperCase();
    if (winner !== 'A' && winner !== 'B') return '';
    const { A, B } = survivorCounts(result);
    const reason = VERDICT_REASON_TEXT[String(result.reason || '').toUpperCase()] || '판정 완료';
    const verdict = mode === 'PVP'
      ? (winner === 'A' ? '내 팀 승리' : '상대 팀 승리')
      : (winner === 'A' ? '승리' : '패배');
    return `${verdict} · ${reason} · 생존 ${A} : ${B}`;
  }

  function showVerdict(stage, payload, mode) {
    const node = stage?.querySelector?.('[data-v3-verdict]');
    if (!node) return '';
    const text = verdictSummary(payload, mode);
    node.textContent = text;
    node.hidden = !text;
    const winner = String(payload?.battleV2?.result?.winner || '').toUpperCase();
    node.classList.toggle('is-win', winner === 'A');
    node.classList.toggle('is-lose', winner === 'B');
    return text;
  }

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
      <!-- V1796: SD 캐릭터만으로는 어떤 카드가 출전했는지 알 수 없다.
           PVE 계열은 하단 중앙에 내 출전 카드 한 줄,
           PVP 는 좌(나)/우(상대) 두 줄로 양쪽 출전 카드를 보여준다. -->
      <div class="battle-v3-roster${field === 'PVP' ? ' is-versus' : ' is-solo'}" data-v3-roster hidden>
        <section class="battle-v3-roster-side" data-v3-roster-side="A" hidden>
          <header><small data-v3-roster-label>MY TEAM</small><b data-v3-roster-owner></b></header>
          <ol data-v3-roster-list></ol>
        </section>
        <section class="battle-v3-roster-side" data-v3-roster-side="B" hidden>
          <header><small data-v3-roster-label>OPPONENT</small><b data-v3-roster-owner></b></header>
          <ol data-v3-roster-list></ol>
        </section>
      </div>
      <!-- V1796: 서버가 확정한 승패 근거(전멸/생존 수/체력 비율/전투력)와 생존 수.
           연출이 일부 생략돼도 이 줄만은 서버 값을 그대로 보여준다. -->
      <p class="battle-v3-verdict" data-v3-verdict role="status" hidden></p>
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

    // V1796: payload 가 확정된 직후 로스터를 그린다. 자동전투 2판째처럼
    // 셸을 다시 만들지 않는 경로에서도 매 판 새 카드로 덮어써야 하므로
    // prepareLoading 이 아니라 createRenderer 에서 호출한다.
    renderRoster(stage, payload, mode);
    const verdictNode = stage.querySelector('[data-v3-verdict]');
    if (verdictNode) { verdictNode.textContent = ''; verdictNode.hidden = true; verdictNode.classList.remove('is-win', 'is-lose'); }

    const releaseBlockingLayers = () => {
      document.querySelectorAll('.battle-ultimate-overlay,.boss-ultimate-overlay').forEach(node => node.remove());
      stage.classList.remove('ultimate-playing', 'boss-ultimate-fullscreen');
      host.querySelector('.battle-v3-loader')?.remove();
    };
    const recoverPlayback = async message => {
      releaseBlockingLayers();
      if (status) status.textContent = `${message} · 다음 연출로 계속 진행합니다.`;
      // A timeout only settles the wrapper Promise. Explicitly kill the
      // underlying GSAP/SkillTimeline as well so it cannot mutate battle two
      // or race the following authoritative event.
      try { root.ProjectVPixiBattle.cancelActiveAnimations?.(); } catch {}
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
          // V1787: 무한의탑 자동전투 2판째부터 몬스터·SD 캐릭터가 전부 사라지던 버그 수정.
          //
          // syncFinalState 는 "서버가 보낸 최종 생존 상태"를 화면에 강제로 덮어쓰는 함수다.
          // 그런데 TOWER/SEAL/RAID 는 서버 battleV2 를 쓰지 않고 이 파일의
          // towerPayload()/sealPayload()/raidPayload() 가 타임라인을 직접 합성하며,
          // 이때 result 에 final 을 넣지 않는다. 그 상태로 syncFinalState({}) 를 부르면
          // BattleEngine 이 "양 팀 생존 0명"으로 해석해서(화면 하단 '생존 0 : 0')
          // 모든 캐릭터를 visible=false, renderable=false 로 만들어 버린다.
          //
          // 1판째는 전투가 끝난 직후라 결과창에 가려 티가 안 난다. 문제는 2판째다.
          // BattleEngine.resetSession 은 root.visible 만 되돌리고 root.renderable 은
          // 되돌리지 않기 때문에, 한 번 renderable=false 가 된 캐릭터는 다음 판에도
          // 계속 보이지 않는다. 그래서 "첫판 정상, 2판째부터 안 보임" 이 된다.
          //
          // => 서버가 실제로 final 을 보낸 모드(PVE/PVP)에서만 동기화한다.
          //    final 이 없는 모드는 타임라인 연출의 마지막 상태가 곧 최종 상태다.
          const hasServerFinalState = Array.isArray(finalState.A) || Array.isArray(finalState.B);
          if (!hasServerFinalState) {
            if (status) status.textContent = '전투 연출 완료';
          } else if (typeof root.ProjectVPixiBattle.syncFinalState === 'function') {
            await withTimeout(
              root.ProjectVPixiBattle.syncFinalState(finalState),
              1200,
              '서버 최종 생존 상태 동기화가 지연되었습니다.',
              { fallback: false, onFailure: () => recoverPlayback('서버 최종 상태를 다시 연결했습니다.') }
            );
          } else {
            const knockoutEvents = ['A', 'B'].flatMap(side => (Array.isArray(finalState?.[side]) ? finalState[side] : []))
              .filter(card => Number(card?.hp || 0) <= 0)
              .map(card => ({ type: 'KO', targetId: card.id || card.cardId }));
            if (knockoutEvents.length) await safePlayEvents(knockoutEvents, '서버 최종 생존 상태를 즉시 동기화했습니다.');
          }
          // V1796: 연출은 타임아웃으로 생략될 수 있어도 로스터와 판정 줄은
          // 항상 서버가 확정한 값으로 맞춘다.
          if (hasServerFinalState) markRosterFinalState(stage, finalState);
          const verdict = showVerdict(stage, payload, mode);
          if (verdict && status) status.textContent = verdict;
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
        // 연출을 건너뛰고 결과만 띄우는 경로(재시도·즉시 종료)에서도 판정 근거는 남긴다.
        showVerdict(stage, payload, mode);
        markRosterFinalState(stage, payload?.battleV2?.result?.final || {});
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
