(() => {
  const $ = selector => document.querySelector(selector);
  const esc = value => String(value ?? '').replace(/[&<>"']/g, char => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[char]));
  const num = value => Math.max(0, Number(value || 0)).toLocaleString();
  let installed = false;
  let current = null;
  let loadSequence = 0;
  let formDirty = false;
  let savingSettings = false;
  const roleImage = key => `<img src="/assets/ui/seal-battle/orbs-20261022/${key}.webp" width="56" height="56" alt="">`;

  const defaults = {
    format:'SEALS_BOSS',bossStage:{name:'봉인룡 네르가온',hp:null,battlePower:null},
    mode: 'OFF', title: '봉인전', bossName: '심연에 봉인된 군주', bossImage: '',
    description: '저장된 PvE 덱으로 역할별 봉인 보스와 전투하고, 서버 전체가 파괴·수호·정화 세 봉인을 완성하는 공동 보스 콘텐츠입니다.',
    startsAt: null, endsAt: null, dailyAttempts: 5, rechargeMinutes: 60, minRewardAttempts: 25,
    targets: { attack: 20000000, guard: 16000000, purify: 14000000 },
    multipliers: { attack: 100, guard: 90, purify: 85 },
    battlePowers: { attack: 12000, guard: 11000, purify: 10000 },
    lowestRoleBonusPercent: 20, defeatContributionPercent: 10,
    attemptReward: { coin: 100, shards: 1 },
    clearReward: { coin: 2000, shards: 50, masterStar: 0 },
    rankRewards: { enabled: false, rewardOnFailure: false, tiers: [] },
    receiptRetentionDays: 14, progressRetentionDays: 90
  };

  function toInputDate(value) {
    if (!value) return '';
    const time = Date.parse(value);
    if (!Number.isFinite(time)) return '';
    const date = new Date(time + 9 * 3600000);
    const pad = number => String(number).padStart(2, '0');
    return `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())}T${pad(date.getUTCHours())}:${pad(date.getUTCMinutes())}`;
  }

  function fromInputDate(value) {
    const text = String(value || '').trim();
    if (!text) return null;
    const time = Date.parse(`${text}:00+09:00`);
    return Number.isFinite(time) ? new Date(time).toISOString() : null;
  }

  function formatDate(value) {
    if (!value) return '-';
    const time = Date.parse(value);
    if (!Number.isFinite(time)) return esc(value);
    return new Intl.DateTimeFormat('ko-KR', {
      month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit',
      hour12: false, timeZone: 'Asia/Seoul'
    }).format(new Date(time));
  }

  function statusText(value) {
    return ({ ACTIVE: '진행 중', CLEARED: '봉인 완료', FAILED: '봉인 실패', ENDED: '종료' })[String(value || '').toUpperCase()] || String(value || '-');
  }

  function apiCall(path, options = {}) {
    if (typeof window.api === 'function') return window.api(path, options);
    throw new Error('CMS API 함수를 찾을 수 없습니다.');
  }

  function ensure() {
    const nav = $('#nav');
    const cms = $('#cms');
    if (!nav || !cms) return false;
    if (!nav.querySelector('[data-view="sealbattle"]')) {
      const button = document.createElement('button');
      button.type = 'button';
      button.dataset.view = 'sealbattle';
      button.textContent = '봉인전 관리';
      const captain = nav.querySelector('[data-view="captain"]');
      if (captain?.nextSibling) nav.insertBefore(button, captain.nextSibling);
      else nav.appendChild(button);
      button.addEventListener('click', () => show('sealbattle'));
    }
    if (!$('#view-sealbattle')) {
      const view = document.createElement('section');
      view.className = 'view seal-admin-view';
      view.id = 'view-sealbattle';
      view.hidden = true;
      view.innerHTML = `<section class="seal-admin-hero">
        <div><small>SERVER COOPERATIVE BOSS</small><h2>봉인전 운영 센터</h2><p>세 봉인 해제 → 용 보스 본체전 → 공동 완료 보상. 현재 회차의 규칙과 새 회차 설정을 관리합니다.</p></div>
        <div class="seal-admin-actions"><span id="sealAdminModeBadge">운영 중지</span><button type="button" id="sealAdminRefresh" class="ghost">새로고침</button><button type="button" id="sealAdminEnd" class="warn">현재 봉인전 종료</button></div>
      </section>

      <section class="seal-admin-status-card">
        <div id="sealAdminEventSummary" class="seal-admin-event-summary"><div class="seal-admin-loading">현재 봉인전 정보를 불러오는 중...</div></div>
        <div id="sealAdminStats" class="seal-admin-stats"></div>
        <div id="sealAdminProgress" class="seal-admin-progress-grid"></div>
      </section>

      <section class="seal-admin-settings">
        <header><div><small>봉인전 기본 설정</small><h3>운영 및 목표 설정</h3><p>새 회차부터 용 보스전이 적용됩니다. 본체 체력·전투력·보상·최소 공격 횟수는 시작 시 고정됩니다.</p></div><button type="button" id="sealAdminSave" class="primary">설정 저장</button></header>
        <div class="seal-admin-form-grid">
          <label><span>운영 모드</span><select id="sealMode"><option value="OFF">OFF · 중지</option><option value="TEST">TEST · 관리자만 참여</option><option value="ON">ON · 전체 공개</option></select></label>
          <label><span>콘텐츠명</span><input id="sealTitle" maxlength="60"></label>
          <label><span>기존 방식 보스 이름</span><input id="sealBossName" maxlength="80"></label>
          <label class="wide"><span>기존 방식 이미지 경로</span><input id="sealBossImage" maxlength="1000" placeholder="용 보스전에는 전용 원화가 적용됩니다."></label>
          <label class="wide"><span>설명</span><textarea id="sealDescription" maxlength="300" rows="3"></textarea></label>
          <label><span>시작 시각 · KST</span><input id="sealStartsAt" type="datetime-local"></label>
          <label><span>종료 시각 · KST</span><input id="sealEndsAt" type="datetime-local"></label>
          <label><span>최대 보유 도전 횟수</span><input id="sealDailyAttempts" type="number" min="1" max="30"></label>
          <label><span>1회 충전 시간</span><div class="input-unit"><input id="sealRechargeMinutes" type="number" min="1" max="1440"><em>분</em></div></label>
          <label><span>보상 최소 공격 횟수</span><div class="input-unit"><input id="sealMinRewardAttempts" type="number" min="1" max="1000000" step="1"><em>회</em></div></label>
          <label><span>패배 공헌 반영</span><div class="input-unit"><input id="sealDefeatContribution" type="number" min="0" max="100"><em>%</em></div></label>
          <label><span>부족 역할 지원 보너스</span><div class="input-unit"><input id="sealLowestBonus" type="number" min="0" max="500"><em>%</em></div></label>
          <div class="seal-admin-combat-rule"><b>전투 고정 규칙</b><span>최대 횟수까지 자동 충전 · 승리 100% 공헌 · 패배 설정 비율 공헌 · 유저/보스 궁극기 사용 불가</span></div>
        </div>

        <div class="seal-admin-section-title"><div><small>GLOBAL TARGETS</small><h4>역할별 공동 목표</h4></div></div>
        <div class="seal-admin-role-settings">
          <article class="attack"><header>${roleImage('attack')}<b>파괴 봉인</b></header><label><span>보스 전투력</span><input id="sealAttackBattlePower" type="number" min="1"></label><label><span>목표 공헌도</span><input id="sealAttackTarget" type="number" min="1" step="1" title="봉인 체력 설정 상한 없음"></label><label><span>역할 배율</span><div class="input-unit"><input id="sealAttackMultiplier" type="number" min="1" max="1000"><em>%</em></div></label></article>
          <article class="guard"><header>${roleImage('guard')}<b>수호 봉인</b></header><label><span>보스 전투력</span><input id="sealGuardBattlePower" type="number" min="1"></label><label><span>목표 공헌도</span><input id="sealGuardTarget" type="number" min="1" step="1" title="봉인 체력 설정 상한 없음"></label><label><span>역할 배율</span><div class="input-unit"><input id="sealGuardMultiplier" type="number" min="1" max="1000"><em>%</em></div></label></article>
          <article class="purify"><header>${roleImage('purify')}<b>정화 봉인</b></header><label><span>보스 전투력</span><input id="sealPurifyBattlePower" type="number" min="1"></label><label><span>목표 공헌도</span><input id="sealPurifyTarget" type="number" min="1" step="1" title="봉인 체력 설정 상한 없음"></label><label><span>역할 배율</span><div class="input-unit"><input id="sealPurifyMultiplier" type="number" min="1" max="1000"><em>%</em></div></label></article>
        </div>

        <section class="seal-admin-dragon">
          <img src="/assets/ui/seal-battle/dragon-20261022/portrait.webp" alt="봉인룡 네르가온" width="768" height="512">
          <div><small>SECOND PHASE · 새 회차부터 적용</small><h4>용 보스 본체전</h4><p>세 봉인을 모두 해제하면 본체 HP가 열립니다. 처치해야 공동 완료 보상이 열리며 두 단계의 공격 횟수를 합산합니다.</p>
          <div class="seal-admin-form-grid"><label><span>용 보스 이름</span><input id="sealDragonName" maxlength="80"></label><label><span>서버 공동 본체 체력</span><input id="sealDragonHp" type="number" min="1" step="1" placeholder="미입력 시 새 회차 시작 잠금"></label><label><span>본체 전투력</span><input id="sealDragonPower" type="number" min="1" max="2000000000" step="1" placeholder="미입력 시 새 회차 시작 잠금"></label></div></div>
        </section>
        <div class="seal-admin-reward-grid">
          <article><header><small>PER ATTEMPT</small><h4>참여 1회 보상</h4></header><label><span>코인 · 한도 없음</span><input id="sealAttemptCoin" type="number" min="0" step="1"></label><label><span>카드 조각</span><input id="sealAttemptShards" type="number" min="0"></label></article>
          <article><header><small>SERVER CLEAR</small><h4>봉인 완료 참여자 보상</h4></header><label><span>코인 · 한도 없음</span><input id="sealClearCoin" type="number" min="0" step="1"></label><label><span>카드 조각</span><input id="sealClearShards" type="number" min="0"></label><label><span>마스터의 별 · 봉인 성공 시</span><div class="input-unit"><input id="sealClearMasterStar" type="number" min="0" max="1000000" step="1"><em>개</em></div></label></article>
          <article><header><small>STORAGE LIMIT</small><h4>소형 기록 보존</h4></header><label><span>요청 영수증</span><div class="input-unit"><input id="sealReceiptDays" type="number" min="1" max="90"><em>일</em></div></label><label><span>종료 이벤트 개인 집계</span><div class="input-unit"><input id="sealProgressDays" type="number" min="7" max="365"><em>일</em></div></label></article>
        </div>
        <div class="seal-rank-reward-note"><b>보상 지급 조건</b><span>이번 회차의 파괴·수호·정화 전투를 합산해 최소 공격 횟수 이상이어야 완료 보상을 받습니다. 승패와 관계없이 처리 완료된 전투만 집계하며, 참여 1회 보상은 그대로 지급됩니다. 클리어 코인 100억(10,000,000,000) 설정·지급을 지원합니다.</span></div>

        <div class="seal-admin-retired-note">공헌도 순위 보상은 종료되었습니다. 참여 보상과 공동 완료 보상만 운영합니다.</div>

        <div class="seal-admin-start-box"><div><small>NEW EVENT</small><h3>새 봉인전 시작</h3><p>기존 활성 봉인전은 종료 처리되고 위 설정으로 새로운 서버 공동 진행도가 시작됩니다.</p></div><button type="button" id="sealAdminSaveStart">설정 저장 후 새 봉인전 시작</button></div>
      </section>

      <section class="seal-admin-history"><header><div><small>RECENT EVENTS</small><h3>최근 봉인전 기록</h3></div></header><div id="sealAdminHistory"></div></section>`;
      cms.appendChild(view);
    }
    bind();
    return true;
  }

  function setView() {
    if (typeof state !== 'undefined') state.view = 'sealbattle';
    document.querySelectorAll('.view').forEach(view => { view.hidden = view.id !== 'view-sealbattle'; });
    document.querySelectorAll('#nav button').forEach(button => button.classList.toggle('active', button.dataset.view === 'sealbattle'));
    const title = $('#pageTitle');
    if (title) title.textContent = '봉인전 관리';
  }

  function roleProgress(role, label, icon) {
    if (!role) return '';
    const pct = Math.max(0, Math.min(100, Number(role.percent || 0)));
    return `<article><header><span>${icon}</span><div><small>${label} · 보스 ${num(role.battlePower)}</small><b>${pct.toFixed(2)}%</b></div></header><div><i style="width:${pct}%"></i></div><footer><span>${num(role.progress)}</span><em>/ ${num(role.target)}</em></footer></article>`;
  }

  function renderOverview(data, { applySettings = true } = {}) {
    current = data;
    const settings = { ...defaults, ...(data.settings || {}) };
    const event = data.event;
    const badge = $('#sealAdminModeBadge');
    if (badge) {
      badge.textContent = settings.mode === 'ON' ? '전체 운영' : settings.mode === 'TEST' ? '테스트 운영' : '운영 중지';
      badge.className = settings.mode.toLowerCase();
    }
    $('#sealAdminEventSummary').innerHTML = event ? `<div><small>현재 이벤트 #${event.id}</small><h3>${esc(event.title)} · ${esc(event.bossName)}</h3><p>${esc(event.description || '')}</p><p>현재 회차 보상 조건 · ${num(event.minRewardAttempts || 1)}회 이상 공격 / 완료 코인 ${num(event.clearReward?.coin)}${Number(event.clearReward?.masterStar)>0?` · 마스터의 별 ${num(event.clearReward.masterStar)}개`:""}</p></div><div><span class="status-${String(event.status).toLowerCase()}">${esc(statusText(event.status))}</span><b>${formatDate(event.startsAt)} ~ ${formatDate(event.endsAt)}</b></div>` : '<div><small>NO ACTIVE EVENT</small><h3>시작된 봉인전이 없습니다.</h3><p>아래 설정을 저장한 뒤 새 봉인전을 시작하세요.</p></div>';
    const stats = data.stats || {};
    $('#sealAdminStats').innerHTML = [
      ['참여 유저', num(stats.participants), '명'], ['총 참여', num(stats.attempts), '회'],
      ['누적 공헌도', num(stats.totalContribution), ''], ['완료 보상 수령', num(stats.clearClaims), '명'],
      ['과거 순위 보상 수령', num(stats.rankClaims), '명']
    ].map(([label, value, unit]) => `<article><small>${label}</small><b>${value}<em>${unit}</em></b></article>`).join('');
    $('#sealAdminProgress').innerHTML = event ? [
      roleProgress(event.roles?.ATTACK, '파괴 봉인', roleImage('attack')),
      roleProgress(event.roles?.GUARD, '수호 봉인', roleImage('guard')),
      roleProgress(event.roles?.PURIFY, '정화 봉인', roleImage('purify')),
      event.bossStage?roleProgress({percent:(1-event.bossStage.hp/event.bossStage.maxHp)*100,progress:event.bossStage.maxHp-event.bossStage.hp,target:event.bossStage.maxHp,battlePower:event.bossStage.battlePower},event.phase==='SEALS'?'본체 · 봉인 해제 대기':'용 보스 · 누적 피해','<img src="/assets/ui/seal-battle/dragon-20261022/portrait.webp" width="56" height="56" alt="">'):''
    ].join('') : '';
    if (applySettings) {
      fill(settings);
      formDirty = false;
    }
    $('#sealAdminHistory').innerHTML = (data.history || []).map(row => {
      const attack = Math.min(100, Number(row.attack_progress || 0) / Math.max(1, Number(row.attack_target || 1)) * 100);
      const guard = Math.min(100, Number(row.guard_progress || 0) / Math.max(1, Number(row.guard_target || 1)) * 100);
      const purify = Math.min(100, Number(row.purify_progress || 0) / Math.max(1, Number(row.purify_target || 1)) * 100);
      return `<article><span class="status-${String(row.status).toLowerCase()}">${esc(statusText(row.status))}</span><div><b>${esc(row.title)} · ${esc(row.boss_name)}</b><small>${formatDate(row.created_at)} · 파괴 ${attack.toFixed(1)}% · 수호 ${guard.toFixed(1)}% · 정화 ${purify.toFixed(1)}%</small></div></article>`;
    }).join('') || '<div class="seal-admin-empty">봉인전 이력이 없습니다.</div>';
  }

  function fill(settings) {
    $('#sealMode').value = settings.mode || 'OFF';
    $('#sealTitle').value = settings.title || '';
    $('#sealBossName').value = settings.bossName || '';
    $('#sealBossImage').value = settings.bossImage || '';
    $('#sealDragonName').value = settings.bossStage?.name || defaults.bossStage.name;
    $('#sealDragonHp').value = settings.bossStage?.hp ?? '';
    $('#sealDragonPower').value = settings.bossStage?.battlePower ?? '';
    $('#sealDescription').value = settings.description || '';
    $('#sealStartsAt').value = toInputDate(settings.startsAt);
    $('#sealEndsAt').value = toInputDate(settings.endsAt);
    $('#sealDailyAttempts').value = Number(settings.dailyAttempts || 5);
    $('#sealRechargeMinutes').value = Number(settings.rechargeMinutes || 60);
    $('#sealMinRewardAttempts').value = Number(settings.minRewardAttempts ?? defaults.minRewardAttempts);
    $('#sealLowestBonus').value = Number(settings.lowestRoleBonusPercent || 0);
    if ($('#sealDefeatContribution')) $('#sealDefeatContribution').value = Number(settings.defeatContributionPercent ?? 10);
    $('#sealAttackBattlePower').value = Number(settings.battlePowers?.attack || 1);
    $('#sealGuardBattlePower').value = Number(settings.battlePowers?.guard || 1);
    $('#sealPurifyBattlePower').value = Number(settings.battlePowers?.purify || 1);
    $('#sealAttackTarget').value = Number(settings.targets?.attack || 1);
    $('#sealGuardTarget').value = Number(settings.targets?.guard || 1);
    $('#sealPurifyTarget').value = Number(settings.targets?.purify || 1);
    $('#sealAttackMultiplier').value = Number(settings.multipliers?.attack || 100);
    $('#sealGuardMultiplier').value = Number(settings.multipliers?.guard || 90);
    $('#sealPurifyMultiplier').value = Number(settings.multipliers?.purify || 85);
    $('#sealAttemptCoin').value = Number(settings.attemptReward?.coin || 0);
    $('#sealAttemptShards').value = Number(settings.attemptReward?.shards || 0);
    $('#sealClearCoin').value = Number(settings.clearReward?.coin || 0);
    $('#sealClearShards').value = Number(settings.clearReward?.shards || 0);
    $('#sealClearMasterStar').value = Number(settings.clearReward?.masterStar || 0);
    $('#sealReceiptDays').value = Number(settings.receiptRetentionDays || 14);
    $('#sealProgressDays').value = Number(settings.progressRetentionDays || 90);
  }

  function integer(id, fallback = 0) {
    const value = Number($(id)?.value);
    return Number.isFinite(value) ? Math.floor(value) : fallback;
  }

  function collect() {
    return {
      format:'SEALS_BOSS',
      bossStage:{name:$('#sealDragonName').value.trim(),hp:$('#sealDragonHp').value===''?null:Number($('#sealDragonHp').value),battlePower:$('#sealDragonPower').value===''?null:Number($('#sealDragonPower').value)},
      mode: $('#sealMode').value,
      title: $('#sealTitle').value.trim(),
      bossName: $('#sealBossName').value.trim(),
      bossImage: $('#sealBossImage').value.trim(),
      description: $('#sealDescription').value.trim(),
      startsAt: fromInputDate($('#sealStartsAt').value),
      endsAt: fromInputDate($('#sealEndsAt').value),
      dailyAttempts: integer('#sealDailyAttempts', 5),
      rechargeMinutes: integer('#sealRechargeMinutes', 60),
      minRewardAttempts: Number($('#sealMinRewardAttempts').value),
      targets: {
        attack: Number($('#sealAttackTarget').value), guard: Number($('#sealGuardTarget').value), purify: Number($('#sealPurifyTarget').value)
      },
      multipliers: {
        attack: integer('#sealAttackMultiplier', 100), guard: integer('#sealGuardMultiplier', 90), purify: integer('#sealPurifyMultiplier', 85)
      },
      battlePowers: {
        attack: integer('#sealAttackBattlePower', 12000), guard: integer('#sealGuardBattlePower', 11000), purify: integer('#sealPurifyBattlePower', 10000)
      },
      lowestRoleBonusPercent: integer('#sealLowestBonus', 20),
      defeatContributionPercent: integer('#sealDefeatContribution', 10),
      attemptReward: { coin: integer('#sealAttemptCoin'), shards: integer('#sealAttemptShards') },
      clearReward: { coin: integer('#sealClearCoin'), shards: integer('#sealClearShards'), masterStar: Number($('#sealClearMasterStar').value) },
      rankRewards: { enabled: false, rewardOnFailure: false, tiers: [] },
      receiptRetentionDays: integer('#sealReceiptDays', 14),
      progressRetentionDays: integer('#sealProgressDays', 90)
    };
  }

  function validate(settings) {
    for(const [value,max] of [[settings.bossStage.hp,Number.MAX_SAFE_INTEGER],[settings.bossStage.battlePower,2000000000]])if(value!==null&&(!Number.isSafeInteger(value)||value<1||value>max))return '본체 체력과 전투력은 허용 범위의 양의 정수로 입력하세요.';
    if (!settings.title || !settings.bossName) return '콘텐츠명과 보스 이름을 입력하세요.';
    if (settings.endsAt && settings.startsAt && Date.parse(settings.endsAt) <= Date.parse(settings.startsAt)) return '종료 시각은 시작 시각보다 뒤여야 합니다.';
    if (settings.dailyAttempts < 1 || settings.dailyAttempts > 30) return '최대 보유 도전 횟수는 1~30회로 입력하세요.';
    if (settings.rechargeMinutes < 1 || settings.rechargeMinutes > 1440) return '충전 시간은 1~1,440분으로 입력하세요.';
    if (!Number.isSafeInteger(settings.minRewardAttempts) || settings.minRewardAttempts < 1 || settings.minRewardAttempts > 1000000) return '보상 최소 공격 횟수는 1~1,000,000회 정수로 입력하세요.';
    if (settings.defeatContributionPercent < 0 || settings.defeatContributionPercent > 100) return '패배 공헌 반영률은 0~100%로 입력하세요.';
    if (Object.values(settings.targets).some(value => !Number.isSafeInteger(value) || value < 1)) return '역할별 봉인 체력(목표 공헌도)은 1 이상의 안전한 정수로 입력하세요.';
    if (Object.values(settings.multipliers).some(value => value < 1 || value > 1000)) return '역할 배율은 1~1,000%로 입력하세요.';
    if (Object.values(settings.battlePowers).some(value => value < 1)) return '역할별 보스 전투력은 1 이상이어야 합니다.';
    const coinRewards = [settings.attemptReward.coin, settings.clearReward.coin];
    if (coinRewards.some(value => !Number.isSafeInteger(value) || value < 0)) return '코인 보상은 0 이상의 안전한 정수로 입력하세요.';
    const masterStar = settings.clearReward.masterStar ?? 0;
    if (!Number.isSafeInteger(masterStar) || masterStar < 0 || masterStar > 1000000) return '완료 보상 마스터의 별은 0~1,000,000개 정수로 입력하세요.';
    return '';
  }

  async function saveSettings({ silent = false } = {}) {
    const settings = collect();
    const error = validate(settings);
    if (error) throw new Error(error);

    // 저장 전에 시작된 overview 응답이 뒤늦게 도착해 과거 값으로 폼을 덮지 못하게 무효화한다.
    loadSequence += 1;
    savingSettings = true;
    try {
      const result = await apiCall('admin/seal-battle/settings', {
        method: 'PATCH',
        body: JSON.stringify({ settings })
      });
      const saved = result.settings || settings;

      // 서버가 실제로 저장했다고 반환한 정규화 값을 즉시 화면의 기준값으로 확정한다.
      fill(saved);
      formDirty = false;
      if (result.overview) renderOverview(result.overview, { applySettings: false });

      if (!silent) alert('봉인전 기본 설정을 저장했습니다.');
      return saved;
    } finally {
      savingSettings = false;
    }
  }

  async function load({ forceSettings = false } = {}) {
    const sequence = ++loadSequence;
    $('#sealAdminEventSummary').innerHTML = '<div class="seal-admin-loading">봉인전 운영 현황을 불러오는 중...</div>';
    const data = await apiCall('admin/seal-battle/overview');

    // 더 최근 조회/저장 작업이 있으면 이 응답은 폐기한다.
    if (sequence !== loadSequence) return null;
    const applySettings = forceSettings || (!formDirty && !savingSettings);
    renderOverview(data, { applySettings });
    return data;
  }

  function bind() {
    if ($('#view-sealbattle')?.dataset.bound === '1') return;
    $('#view-sealbattle').dataset.bound = '1';
    $('#view-sealbattle').addEventListener('input', event => {
      if (event.target.matches('input,select,textarea')) formDirty = true;
    });
    $('#view-sealbattle').addEventListener('change', event => {
      if (event.target.matches('input,select,textarea')) formDirty = true;
    });
    $('#sealAdminRefresh').onclick = () => load({ forceSettings: !formDirty }).catch(error => alert(error.message));
    $('#sealAdminSave').onclick = async event => {
      const button = event.currentTarget;
      button.disabled = true;
      try { await saveSettings(); } catch (error) { alert(error.message); }
      finally { button.disabled = false; }
    };
    $('#sealAdminSaveStart').onclick = async event => {
      if(!collect().bossStage.hp||!collect().bossStage.battlePower){alert('본체 체력과 전투력을 입력한 뒤 시작하세요.');return;}
      if (!confirm('현재 활성 봉인전을 종료하고 새 용 보스전을 시작할까요?\n기존 회차의 최종 목표를 완료하지 않았다면 실패로 확정됩니다.')) return;
      const button = event.currentTarget;
      button.disabled = true;
      try {
        await saveSettings({ silent: true });
        const result = await apiCall('admin/seal-battle/event', { method: 'POST', body: JSON.stringify({ action: 'START' }) });
        if (result.overview) renderOverview(result.overview, { applySettings: false });
        else await load();
        alert('새 봉인전을 시작했습니다.');
      } catch (error) { alert(error.message); }
      finally { button.disabled = false; }
    };
    $('#sealAdminEnd').onclick = async event => {
      if (!confirm('현재 활성 봉인전을 종료할까요?\n용 보스전은 본체 처치까지 완료해야 성공입니다. 미완료 회차는 실패로 확정됩니다.')) return;
      const button = event.currentTarget;
      button.disabled = true;
      try {
        const result = await apiCall('admin/seal-battle/event', { method: 'POST', body: JSON.stringify({ action: 'END' }) });
        if (result.overview) renderOverview(result.overview, { applySettings: false });
        else await load();
      }
      catch (error) { alert(error.message); }
      finally { button.disabled = false; }
    };
  }

  function patchGlobals() {
    if (installed || typeof show !== 'function') return;
    installed = true;
    const originalShow = show;
    show = function(view, prefetched) {
      if (view === 'sealbattle') {
        ensure();
        if (String(state?.role || '').toUpperCase() !== 'OWNER') {
          alert('봉인전 관리는 OWNER 전용입니다.');
          return originalShow('dashboard');
        }
        setView();
        load().catch(error => alert(error.message));
        return;
      }
      return originalShow(view, prefetched);
    };
    if (typeof renderIdentity === 'function') {
      const originalRenderIdentity = renderIdentity;
      renderIdentity = function() {
        originalRenderIdentity();
        const button = $('#nav button[data-view="sealbattle"]');
        if (button) button.hidden = String(state?.role || '').toUpperCase() !== 'OWNER';
      };
    }
  }

  function boot() {
    if (!ensure()) return;
    patchGlobals();
    const button = $('#nav button[data-view="sealbattle"]');
    if (button && typeof state !== 'undefined') button.hidden = String(state?.role || '').toUpperCase() !== 'OWNER';
  }

  new MutationObserver(boot).observe(document.documentElement, { childList: true, subtree: true });
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot, { once: true });
  else boot();
})();
