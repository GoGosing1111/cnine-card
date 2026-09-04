(() => {
  'use strict';
  sessionStorage.setItem('cnine:raid-content-v1924', 'core');
  const clone = value => JSON.parse(JSON.stringify(value));
  const settings = {
    mode: 'TEST',
    title: '심연 관측소: 붕괴 코어',
    subtitle: 'ABYSS OBSERVATORY / CORE PROTOCOL',
    description: '입장권으로 공대를 만들고 제한 시간 안에 세 코어와 아르케온을 연속 제압하십시오.',
    bossName: '오메가 코어 · 아르케온',
    bossImage: '/assets/responsive/project-v/monsters/hunt-068-omega-09-sd-v1-768.webp',
    lobbyMinutes: 10,
    battleMinutes: 30,
    minParticipants: 1,
    maxParticipants: 12,
    partyMaxHp: 1000,
    mechanicFailureDamage: 125,
    coreRequired: 180,
    bossMaxHp: 180000000,
    rewardLocked: true
  };
  const operations = [
    { key: 'BREAK', name: '파쇄', label: 'BREACH', roles: ['ATTACK', 'SPEED'], description: '공격형·속도형 카드로 붕괴 코어의 외피를 파괴합니다.' },
    { key: 'BLOCK', name: '차단', label: 'INTERCEPT', roles: ['DEFENSE'], description: '방어형 카드로 코어 간 에너지 연결을 차단합니다.' },
    { key: 'STABILIZE', name: '안정화', label: 'STABILIZE', roles: ['HP'], description: 'HP형·회복 카드로 폭주 에너지를 안정화합니다.' }
  ];
  // image는 라이브 카드 원본, battleSprite는 Pixi 전투 전용 SD다.
  const deck = [
    { id: 'CN-02D9DC1E8A8A4209', cardId: 'CN-02D9DC1E8A8A4209', title: '철와대 킴성태', name: '킴성태', grade: 'FUR', power_type: 'ATTACK', power: 62000, image: '/assets/NEWCARD/24.png', battleSprite: '/assets/ui/project-v/characters/fur/fur-cn-02d9dc1e8a8a4209-sd-v1.png' },
    { id: 'CN-0505936A0CBB4E59', cardId: 'CN-0505936A0CBB4E59', title: '구수댕', name: '남수댕', grade: 'ZENITH', power_type: 'DEFENSE', power: 58000, image: '/assets/cards/남수댕/031.webp', battleSprite: '/assets/ui/project-v/characters/zenith/zenith-cn-0505936a0cbb4e59-sd-v1.png' },
    { id: 'CN-25F931CE393D474E', cardId: 'CN-25F931CE393D474E', title: '딤우스', name: '디임', grade: 'ZENITH', power_type: 'SPEED', power: 56000, image: '/assets/cards/976467971.jpg', battleSprite: '/assets/ui/project-v/characters/zenith/zenith-cn-25f931ce393d474e-sd-v1.png' },
    { id: 'CN-23EB4B19986D4818', cardId: 'CN-23EB4B19986D4818', title: 'Lionel Messi', name: 'Lionel Messi', grade: 'SUPERSTAR', power_type: 'HP', power: 60000, image: '/assets/superstar/3.jpg', battleSprite: '/assets/ui/project-v/characters/superstar/superstar-cn-23eb4b19986d4818-sd-v1.png' },
    { id: 'CN-519C181C18DF4B8E', cardId: 'CN-519C181C18DF4B8E', title: '토마토', name: '토마토', grade: 'ZENITH', power_type: 'ATTACK', power: 54000, image: '/assets/cards/ZENITH/1.jpg', battleSprite: '/assets/ui/project-v/characters/zenith/zenith-cn-519c181c18df4b8e-sd-v1.png' }
  ];
  const challengeBase = {
    weaknessCycle: ['ATTACK', 'DEFENSE', 'SPEED', 'HP', 'ATTACK'],
    sequence: ['UP', 'RIGHT', 'DOWN', 'LEFT', 'UP', 'RIGHT'],
    sequenceWindowMs: 5500,
    mashTarget: 24,
    mashWindowMs: 5000
  };
  let state;
  let attemptCounter = 0;
  let pendingBattle = null;
  let pendingPayload = null;

  function member(nickname, id, isMe) {
    return {
      userId: id,
      nickname,
      status: 'ACTIVE',
      lastOperation: '',
      attemptCount: 0,
      successCount: 0,
      failureCount: 0,
      mechanicScore: 0,
      totalDamage: 0,
      totalCoreProgress: 0,
      totalBossDamage: 0,
      rewardStatus: '',
      isMe
    };
  }

  function reset() {
    attemptCounter = 0;
    pendingBattle = null;
    pendingPayload = null;
    state = {
      ok: true,
      settings,
      feature: { visible: true, accessible: true, tester: true, mode: 'TEST', rewardLocked: true },
      current: null,
      me: null,
      participants: [],
      pendingAttempt: null,
      rooms: [
        {
          id: 'CORE-PREVIEW-GUEST',
          code: 'GUEST1',
          hostUserId: 7,
          participantCount: 2,
          maxParticipants: settings.maxParticipants,
          lobbyEndsAt: new Date(Date.now() + 8 * 60000).toISOString()
        }
      ],
      entry: {
        ticketCode: 'CORE_RAID_ENTRY_TICKET',
        ticketName: '붕괴 코어 입장권',
        quantity: 2,
        required: 1
      },
      operations,
      serverNow: new Date().toISOString()
    };
  }

  function makeRoom(host) {
    const me = member('프리뷰 지휘관', 1, true);
    const members = host
      ? [me]
      : [member('선발대 알파', 7, false), member('방벽대 브라보', 8, false), me];
    return {
      id: host ? 'CORE-PREVIEW-HOST' : 'CORE-PREVIEW-GUEST',
      code: host ? 'HOST01' : 'GUEST1',
      hostUserId: host ? 1 : 7,
      isTerminal: false,
      status: 'LOBBY',
      phase: 0,
      phaseLabel: '공대 집결',
      partyHp: settings.partyMaxHp,
      partyMaxHp: settings.partyMaxHp,
      coreScores: { BREAK: 0, BLOCK: 0, STABILIZE: 0 },
      coreTarget: settings.coreRequired,
      coresReady: false,
      bossName: settings.bossName,
      bossImage: settings.bossImage,
      bossHp: settings.bossMaxHp,
      bossMaxHp: settings.bossMaxHp,
      participantCount: members.length,
      minParticipants: settings.minParticipants,
      maxParticipants: settings.maxParticipants,
      lobbyEndsAt: new Date(Date.now() + settings.lobbyMinutes * 60000).toISOString(),
      startsAt: null,
      endsAt: null,
      completedAt: null,
      failureReason: '',
      rewardLocked: true,
      reward: { coin: 0, shards: 0 },
      members
    };
  }

  function syncRoom(room) {
    state.current = room;
    state.participants = room.members;
    state.me = room.members.find(row => row.isMe) || null;
    state.rooms = [];
    state.pendingAttempt = pendingBattle
      ? {
          id: pendingBattle.attemptId,
          stage: pendingBattle.stage,
          operation: pendingBattle.operation,
          createdAt: new Date().toISOString()
        }
      : null;
  }

  function battlePayload(operation) {
    const room = state.current;
    const stage = room.status === 'BOSS' ? 'BOSS' : 'CORE';
    const op = stage === 'BOSS' ? 'FINAL' : operation;
    const attemptId = 'CORE-PREVIEW-TRY-' + (++attemptCounter);
    const challenge = {
      ...challengeBase,
      challengeId: 'QTE-PREVIEW-' + attemptCounter,
      issuedFor: {
        roomId: room.id,
        instanceId: room.id,
        attemptId,
        userId: 1,
        stage,
        operation: op
      }
    };
    const name = stage === 'BOSS'
      ? settings.bossName
      : ({ BREAK: '파쇄', BLOCK: '차단', STABILIZE: '안정화' }[op] || '미확인') + ' 코어';
    const boss = {
      id: 'B:0:MONSTER:CORE',
      cardId: 'MONSTER:CORE',
      monsterId: stage === 'BOSS' ? 'CORE-ARCHEON' : 'CORE-NODE-' + op,
      name,
      title: name,
      image: settings.bossImage,
      image_url: settings.bossImage,
      grade: 'BOSS',
      isBoss: true,
      mode: 'RAID',
      contentType: 'CORE_PROTOCOL',
      hp: 100,
      maxHp: 100,
      projectVMonsterArt: {
        scope: 'BATTLE_ENGINE_ONLY',
        kind: stage === 'BOSS' ? 'CORE_PROTOCOL_BOSS_SD' : 'CORE_PROTOCOL_NODE_SD',
        primaryUrl: settings.bossImage,
        pngFallbackUrl: settings.bossImage,
        footAnchor: { x: 0.5, y: 0.94 },
        objectFit: 'contain',
        objectPosition: '50% 100%',
        scaleMultiplier: stage === 'BOSS' ? 1.15 : 0.98,
        approved: true,
        technicalPass: true
      }
    };
    const timeline = [
      { type: 'RAID_PHASE_CHANGE', phase: stage === 'BOSS' ? 3 : 2, label: stage === 'BOSS' ? '최종 보스 · 멸절 프로토콜' : name + ' 공략' },
      { type: 'BOSS_ULTIMATE', actorId: boss.cardId, label: '멸절 프로토콜 · 개막 발현', hits: deck.map(card => ({ targetId: card.cardId, damage: 6, targetHpAfter: 94 })) }
    ];
    let hp = 94;
    deck.forEach((card, index) => {
      timeline.push({
        type: 'RAID_WEAKNESS_REVEAL',
        weakness: challenge.weaknessCycle[index],
        matched: card.power_type === challenge.weaknessCycle[index],
        actorId: card.cardId,
        label: '약점 ' + challenge.weaknessCycle[index] + ' · 분석'
      });
      hp = Math.max(32, hp - 10);
      timeline.push({
        type: index === 2 || index === 4 ? 'SKILL' : 'TURN',
        actorId: card.cardId,
        targetId: boss.cardId,
        damage: 680000,
        targetHpAfter: hp,
        critical: index === 4,
        label: '약점 공명 타격'
      });
    });
    timeline.push(
      {
        type: 'RAID_QTE_SEQUENCE',
        qteId: 'SEQUENCE',
        title: stage === 'BOSS' ? '멸절 좌표 해독' : '코어 좌표 추적',
        sequence: challenge.sequence,
        windowMs: challenge.sequenceWindowMs,
        label: '화면을 지정 방향으로 밀거나 방향키를 순서대로 입력하십시오.'
      },
      {
        type: 'RAID_QTE_MASH',
        qteId: 'MASH',
        title: stage === 'BOSS' ? '멸절 구속 파쇄' : '코어 구속 파쇄',
        target: challenge.mashTarget,
        windowMs: challenge.mashWindowMs,
        label: '연타하여 즉사 구속을 파괴하십시오.'
      },
      {
        type: stage === 'BOSS' ? 'RAID_STAGGER' : 'RAID_CORE_BREAK',
        operation: op,
        qteCondition: 'ALL_SUCCESS',
        label: stage === 'BOSS' ? '아르케온 그로기' : name + ' 제압 신호'
      },
      {
        type: 'BOSS_ULTIMATE',
        qteCondition: 'ANY_FAILURE',
        actorId: boss.cardId,
        label: '멸절 프로토콜',
        hits: deck.map(card => ({ targetId: card.cardId, damage: 999999, targetHpAfter: 0, critical: true }))
      },
      {
        type: 'RAID_PARTY_DAMAGE',
        qteCondition: 'ANY_FAILURE',
        damage: settings.mechanicFailureDamage,
        label: '기믹 실패 · 공대 HP 감소'
      },
      { type: 'RESULT', qteCondition: 'ALL_SUCCESS', winner: 'A' },
      { type: 'RESULT', qteCondition: 'ANY_FAILURE', winner: 'B' }
    );
    timeline.forEach((event, index) => {
      event.seq = index + 1;
    });
    pendingBattle = {
      attemptId,
      roomId: room.id,
      stage,
      operation: op,
      challenge
    };
    state.pendingAttempt = { id: attemptId, stage, operation: op, createdAt: new Date().toISOString() };
    const response = {
      ok: true,
      roomId: room.id,
      instanceId: room.id,
      attemptId,
      stage,
      operation: op,
      mode: 'RAID',
      battlefieldMode: 'RAID',
      contentType: 'CORE_PROTOCOL',
      presentation: {
        owner: 'PROJECT_V_V3_LIVE',
        characterRenderer: 'PROJECT_V_PIXI_V3',
        rosterRenderer: 'LIVE_V3_ROSTER',
        cardFrameRenderer: 'LIVE_CARD_FRAME',
        preserveCardSourceArt: true
      },
      monster: boss,
      cards: deck,
      challenge,
      coreRaid: {
        stage,
        operation: op,
        challengeId: challenge.challengeId,
        serverWinner: 'A',
        partyFailureDamage: settings.mechanicFailureDamage
      },
      battleV2: {
        teams: { A: { cards: deck }, B: { cards: [boss] } },
        result: { timeline, winner: 'PENDING', actions: timeline.length }
      }
    };
    pendingPayload = clone(response);
    return response;
  }

  async function apiRequest(path, options = {}) {
    await new Promise(resolve => setTimeout(resolve, 100));
    const body = options.body ? JSON.parse(options.body) : {};
    if (path === 'raid/core/feature') {
      return { ok: true, visible: true, accessible: true, tester: true, mode: 'TEST', rewardLocked: true, title: settings.title, subtitle: settings.subtitle };
    }
    if (path.startsWith('raid/core/status')) {
      if (path.includes('browse=1')) {
        return clone({
          ...state,
          current: null,
          me: null,
          participants: [],
          pendingAttempt: null,
          rooms: [
            {
              id: 'CORE-PREVIEW-GUEST',
              code: 'GUEST1',
              hostUserId: 7,
              participantCount: 2,
              maxParticipants: settings.maxParticipants,
              lobbyEndsAt: new Date(Date.now() + 8 * 60000).toISOString()
            }
          ]
        });
      }
      return clone(state);
    }
    if (path === 'raid/core/open') {
      state.entry.quantity--;
      syncRoom(makeRoom(true));
      return clone(state);
    }
    if (path === 'raid/core/join') {
      syncRoom(makeRoom(false));
      return clone(state);
    }
    if (path === 'raid/core/start') {
      state.current.status = 'CORE';
      state.current.phase = 1;
      state.current.phaseLabel = '삼중 코어 공략';
      state.current.startsAt = new Date().toISOString();
      state.current.endsAt = new Date(Date.now() + settings.battleMinutes * 60000).toISOString();
      syncRoom(state.current);
      return clone(state);
    }
    if (path === 'raid/core/battle') {
      if (pendingBattle && pendingPayload) return clone(pendingPayload);
      return battlePayload(body.operation || 'BREAK');
    }
    if (path === 'raid/core/resolve') {
      if (!pendingBattle) throw new Error('프리뷰 공략 기록이 없습니다.');
      const sequenceOk = (body.results?.sequence?.inputs || []).length >= pendingBattle.challenge.sequence.length;
      const mashOk = (body.results?.mash?.presses || []).length >= pendingBattle.challenge.mashTarget;
      const success = sequenceOk && mashOk;
      const outcome = {
        success,
        engineSuccess: true,
        mechanicSuccess: success,
        stage: pendingBattle.stage,
        partyHpDamage: success ? 0 : settings.mechanicFailureDamage,
        coreProgress: success && pendingBattle.stage === 'CORE' ? 110 : 0,
        bossDamage: success && pendingBattle.stage === 'BOSS' ? 70000000 : 0
      };
      const me = state.me;
      me.attemptCount++;
      me.successCount += success ? 1 : 0;
      me.failureCount += success ? 0 : 1;
      me.mechanicScore += success ? 240 : 50;
      me.lastOperation = pendingBattle.operation;
      if (success && pendingBattle.stage === 'CORE') {
        state.current.coreScores[pendingBattle.operation] = Math.min(
          state.current.coreTarget,
          state.current.coreScores[pendingBattle.operation] + outcome.coreProgress
        );
        me.totalCoreProgress += outcome.coreProgress;
      }
      if (success && pendingBattle.stage === 'BOSS') {
        state.current.bossHp = Math.max(0, state.current.bossHp - outcome.bossDamage);
        me.totalBossDamage += outcome.bossDamage;
        me.totalDamage += outcome.bossDamage;
      }
      if (!success) state.current.partyHp = Math.max(0, state.current.partyHp - outcome.partyHpDamage);
      const allCores = Object.values(state.current.coreScores).every(value => value >= state.current.coreTarget);
      if (state.current.status === 'CORE' && allCores) {
        state.current.status = 'BOSS';
        state.current.phase = 2;
        state.current.phaseLabel = '최종 보스 · 멸절 프로토콜';
        state.current.coresReady = true;
      }
      if (state.current.status === 'BOSS' && state.current.bossHp <= 0) {
        state.current.status = 'CLEAR';
        state.current.phase = 3;
        state.current.phaseLabel = '작전 완료';
        state.current.isTerminal = true;
      }
      if (state.current.partyHp <= 0) {
        state.current.status = 'FAILED';
        state.current.phase = 3;
        state.current.phaseLabel = '작전 실패';
        state.current.failureReason = 'PARTY_WIPE';
        state.current.isTerminal = true;
      }
      const verified = {
        sequence: { success: sequenceOk },
        mash: { success: mashOk },
        allSuccess: success,
        perfectCount: 0,
        suppressionScore: (sequenceOk ? 50 : 0) + (mashOk ? 50 : 0)
      };
      pendingBattle = null;
      pendingPayload = null;
      state.pendingAttempt = null;
      syncRoom(state.current);
      return {
        ok: true,
        roomId: state.current.id,
        attemptId: body.attemptId,
        personalResult: success ? 'SUCCESS' : 'FAILED',
        verified,
        outcome,
        contribution: {
          mechanicScore: success ? 240 : 50,
          coreProgress: outcome.coreProgress,
          totalDamage: outcome.bossDamage
        },
        current: clone(state.current)
      };
    }
    if (path === 'raid/core/claim') {
      state.me.rewardStatus = 'COMPLETED';
      return { ok: true, rewardClaimed: true, reward: { coin: 0, shards: 0 } };
    }
    throw new Error('지원하지 않는 프리뷰 경로: ' + path);
  }

  reset();
  globalThis.cnineCardCatalog = () => deck.map(card => ({ ...card }));
  globalThis.CNineCoreRaidBridge = {
    apiRequest,
    loadUser: () => ({ id: 1, nickname: '프리뷰 지휘관' }),
    saveUser: () => {},
    ensureFeatureResources: async () => true,
    escapeHtml: value => String(value),
    activateLegacyRaid() {
      document.getElementById('pveRaidView').hidden = false;
      document.getElementById('pveCoreRaidView').hidden = true;
    },
    stopLegacyRaid() {}
  };
  addEventListener('DOMContentLoaded', () => {
    globalThis.CoreProtocolRaidV1924?.openActive?.();
    document.getElementById('resetPreview')?.addEventListener('click', () => {
      try { document.getElementById('modal').__battleV2Renderer?.destroy?.(); } catch {}
      document.getElementById('modal').className = 'modal';
      document.getElementById('modal').innerHTML = '';
      reset();
      globalThis.CoreProtocolRaidV1924?.activate?.('core');
    });
  });
})();
