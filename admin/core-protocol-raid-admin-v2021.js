(() => {
  'use strict';
  const $ = selector => document.querySelector(selector);
  if (!document.getElementById('coreRaidAdminStyleV2021')) {
    const style = document.createElement('link');
    style.id = 'coreRaidAdminStyleV2021';
    style.rel = 'stylesheet';
    style.href = 'core-protocol-raid-admin-v2021.css?v=2026-core-balance';
    document.head.appendChild(style);
  }
  const token = () => localStorage.getItem('cnine_admin_token') || sessionStorage.getItem('cnine_admin_token') || '';
  const split = value => [...new Set(String(value || '').split(/[\n,]/).map(item => item.trim()).filter(Boolean))];
  let loading = false;
  let loaded = false;

  async function api(options = {}) {
    const auth = token();
    const response = await fetch('/api/admin/raid/core/settings', {
      credentials: 'include',
      cache: 'no-store',
      headers: {
        'content-type': 'application/json',
        ...(auth ? { authorization: 'Bearer ' + auth } : {})
      },
      ...options
    });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(body.error || '붕괴 코어 설정 요청에 실패했습니다.');
    return body;
  }

  function input(id, label, min, max, suffix) {
    return '<label><span>' + label + '</span><div><input id="' + id +
      '" type="number" min="' + min + '" max="' + max + '">' +
      (suffix ? '<em>' + suffix + '</em>' : '') + '</div></label>';
  }

  function panelMarkup() {
    return [
      '<section class="panel coreRaidAdmin" id="coreRaidAdminV2021">',
      '<header class="coreRaidAdminHead"><div><small>CORE PROTOCOL / ROOM EXPEDITION</small>',
      '<h2>신규 레이드 · 붕괴 코어</h2>',
      '<p>공대장이 입장권 1장으로 방을 만들고, 세 코어의 공명 편차를 관리하며 최종 보스를 반복 공략합니다. 기존 월드 레이드는 그대로 유지됩니다.</p>',
      '</div><span id="coreRaidAdminState">설정 확인 전</span></header>',
      '<div class="coreRaidAdminSafety"><b>출시 안전 상태</b><span>TEST · 보상 잠금 · 지정 계정만 공개</span>',
      '<em>ON은 전체 유저에게 즉시 노출됩니다. 공대 생성은 붕괴 코어 입장권 1장을 소모합니다.</em></div>',
      '<div class="coreRaidAdminGrid">',
      '<label><span>공개 단계</span><select id="coreRaidMode"><option value="OFF">OFF · 완전 숨김</option><option value="TEST">TEST · 지정 유저만</option><option value="ON">ON · 전체 공개</option></select></label>',
      '<label><span>보상 지급</span><select id="coreRaidRewardLocked"><option value="1">잠금 · 테스트 기록만</option><option value="0">해제 · 공대 클리어 보상</option></select></label>',
      '<label class="wide"><span>테스트 닉네임</span><textarea id="coreRaidTestUsers" rows="3" placeholder="한 줄에 한 명 또는 쉼표로 구분"></textarea></label>',
      '<label class="wide"><span>테스트 유저 ID (선택)</span><input id="coreRaidTestUserIds" placeholder="예: 12, 47"></label>',
      '<label><span>레이드 제목</span><input id="coreRaidTitle" maxlength="60"></label>',
      '<label><span>영문 부제</span><input id="coreRaidSubtitle" maxlength="80"></label>',
      '<label class="wide"><span>설명</span><textarea id="coreRaidDescription" rows="2" maxlength="240"></textarea></label>',
      '<label><span>보스명</span><input id="coreRaidBossName" maxlength="60"></label>',
      '<label><span>보스 SD 경로</span><input id="coreRaidBossImage" maxlength="420"></label>',
      input('coreRaidLobbyMinutes', '공대 모집 시간', 1, 60, '분'),
      input('coreRaidBattleMinutes', '공략 제한 시간', 5, 120, '분'),
      input('coreRaidMinParticipants', '최소 시작 인원', 1, 30, '명'),
      input('coreRaidMaxParticipants', '최대 참가 인원', 1, 30, '명'),
      input('coreRaidPartyMaxHp', '공대 최대 HP', 100, 100000, ''),
      input('coreRaidFailureDamage', '기믹 실패 HP 피해', 1, 100000, ''),
      input('coreRaidCoreRequired', '코어별 제압 목표', 50, 100000, ''),
      input('coreRaidBalanceTolerance', '코어 허용 편차', 10, 75, '%'),
      input('coreRaidImbalanceDamage', '코어 과충전 HP 피해', 1, 100000, ''),
      input('coreRaidBossMaxHp', '최종 보스 공유 HP', 1000000, 2000000000, ''),
      input('coreRaidCoreCombatPower', '코어 전투력 비율', 20, 300, '%'),
      input('coreRaidBossCombatPower', '보스 전투력 비율', 20, 300, '%'),
      input('coreRaidDamageScale', '성공 피해 배율', 1, 5000, ''),
      input('coreRaidBossHpPercent', '보스 HP 계수', 100, 1000, '%'),
      input('coreRaidBossAttackPercent', '보스 공격 계수', 50, 1000, '%'),
      input('coreRaidBossDefensePercent', '보스 방어 계수', 50, 1000, '%'),
      input('coreRaidBossSpeedPercent', '보스 속도 계수', 50, 1000, '%'),
      input('coreRaidBossShieldPercent', '보스 실드 계수', 0, 500, '%'),
      input('coreRaidBossAttackCount', '보스 연속 공격', 1, 10, '회'),
      input('coreRaidBossForcedAction', '보스 강제 행동 주기', 1, 20, '턴'),
      input('coreRaidBossUltimate', '보스 개막 궁극기 피해', 0, 500, '%'),
      input('coreRaidSequenceLength', '방향 신호 길이', 4, 12, '개'),
      input('coreRaidSequenceWindow', '방향 신호 제한', 3000, 15000, 'ms'),
      input('coreRaidMashTarget', '연타 목표', 10, 80, '회'),
      input('coreRaidMashWindow', '연타 제한', 3000, 15000, 'ms'),
      input('coreRaidRewardCoin', '클리어 보상 코인', 0, 2000000000, ''),
      input('coreRaidRewardShards', '클리어 보상 카드조각', 0, 1000000, ''),
      '</div>',
      '<footer><button type="button" class="ghost" id="refreshCoreRaidSettings">새로고침</button>',
      '<button type="button" id="saveCoreRaidSettings">붕괴 코어 설정 저장</button></footer>',
      '</section>'
    ].join('');
  }

  function ensurePanel() {
    const view = $('#view-raid');
    if (!view) return null;
    let panel = $('#coreRaidAdminV2021');
    if (panel) return panel;
    const holder = document.createElement('div');
    holder.innerHTML = panelMarkup();
    panel = holder.firstElementChild;
    const intro = view.querySelector('.sectionIntro');
    if (intro) intro.after(panel);
    else view.prepend(panel);
    $('#refreshCoreRaidSettings').onclick = () => load(true);
    $('#saveCoreRaidSettings').onclick = save;
    return panel;
  }

  const value = (id, fallback = 0) => Number($(id)?.value ?? fallback);
  const set = (id, value) => {
    const node = $(id);
    if (node) node.value = value ?? '';
  };

  function render(settings = {}) {
    set('#coreRaidMode', settings.mode || 'TEST');
    set('#coreRaidRewardLocked', settings.rewardLocked === false ? '0' : '1');
    set('#coreRaidTestUsers', (settings.testUsers || []).join('\n'));
    set('#coreRaidTestUserIds', (settings.testUserIds || []).join(', '));
    set('#coreRaidTitle', settings.title || '');
    set('#coreRaidSubtitle', settings.subtitle || '');
    set('#coreRaidDescription', settings.description || '');
    set('#coreRaidBossName', settings.bossName || '');
    set('#coreRaidBossImage', settings.bossImage || '');
    set('#coreRaidLobbyMinutes', settings.lobbyMinutes ?? 10);
    set('#coreRaidBattleMinutes', settings.battleMinutes ?? 30);
    set('#coreRaidMinParticipants', settings.minParticipants ?? 1);
    set('#coreRaidMaxParticipants', settings.maxParticipants ?? 12);
    set('#coreRaidPartyMaxHp', settings.partyMaxHp ?? 1000);
    set('#coreRaidFailureDamage', settings.mechanicFailureDamage ?? 125);
    set('#coreRaidCoreRequired', settings.coreRequired ?? 360);
    set('#coreRaidBalanceTolerance', settings.coreBalanceTolerancePercent ?? 34);
    set('#coreRaidImbalanceDamage', settings.coreImbalanceDamage ?? 100);
    set('#coreRaidBossMaxHp', settings.bossMaxHp ?? 900000000);
    set('#coreRaidCoreCombatPower', settings.coreCombatPowerPercent ?? 55);
    set('#coreRaidBossCombatPower', settings.bossCombatPowerPercent ?? 80);
    set('#coreRaidDamageScale', settings.damageScale ?? 130);
    set('#coreRaidBossHpPercent', settings.bossHpPercent ?? 300);
    set('#coreRaidBossAttackPercent', settings.bossAttackPercent ?? 240);
    set('#coreRaidBossDefensePercent', settings.bossDefensePercent ?? 210);
    set('#coreRaidBossSpeedPercent', settings.bossSpeedPercent ?? 170);
    set('#coreRaidBossShieldPercent', settings.bossShieldPercent ?? 45);
    set('#coreRaidBossAttackCount', settings.bossAttackCount ?? 2);
    set('#coreRaidBossForcedAction', settings.bossForcedActionEvery ?? 4);
    set('#coreRaidBossUltimate', settings.bossUltimatePercent ?? 32);
    set('#coreRaidSequenceLength', settings.sequenceLength ?? 6);
    set('#coreRaidSequenceWindow', settings.sequenceWindowMs ?? 5500);
    set('#coreRaidMashTarget', settings.mashTarget ?? 24);
    set('#coreRaidMashWindow', settings.mashWindowMs ?? 5000);
    set('#coreRaidRewardCoin', settings.rewardCoin ?? 0);
    set('#coreRaidRewardShards', settings.rewardShards ?? 0);
  }

  function collect() {
    return {
      mode: $('#coreRaidMode').value,
      rewardLocked: $('#coreRaidRewardLocked').value !== '0',
      testUsers: split($('#coreRaidTestUsers').value),
      testUserIds: split($('#coreRaidTestUserIds').value).map(Number).filter(Number.isInteger).filter(id => id > 0),
      title: $('#coreRaidTitle').value,
      subtitle: $('#coreRaidSubtitle').value,
      description: $('#coreRaidDescription').value,
      bossName: $('#coreRaidBossName').value,
      bossImage: $('#coreRaidBossImage').value,
      lobbyMinutes: value('#coreRaidLobbyMinutes'),
      battleMinutes: value('#coreRaidBattleMinutes'),
      minParticipants: value('#coreRaidMinParticipants'),
      maxParticipants: value('#coreRaidMaxParticipants'),
      partyMaxHp: value('#coreRaidPartyMaxHp'),
      mechanicFailureDamage: value('#coreRaidFailureDamage'),
      coreRequired: value('#coreRaidCoreRequired'),
      coreBalanceTolerancePercent: value('#coreRaidBalanceTolerance'),
      coreImbalanceDamage: value('#coreRaidImbalanceDamage'),
      bossMaxHp: value('#coreRaidBossMaxHp'),
      coreCombatPowerPercent: value('#coreRaidCoreCombatPower'),
      bossCombatPowerPercent: value('#coreRaidBossCombatPower'),
      damageScale: value('#coreRaidDamageScale'),
      bossHpPercent: value('#coreRaidBossHpPercent'),
      bossAttackPercent: value('#coreRaidBossAttackPercent'),
      bossDefensePercent: value('#coreRaidBossDefensePercent'),
      bossSpeedPercent: value('#coreRaidBossSpeedPercent'),
      bossShieldPercent: value('#coreRaidBossShieldPercent'),
      bossAttackCount: value('#coreRaidBossAttackCount'),
      bossForcedActionEvery: value('#coreRaidBossForcedAction'),
      bossUltimatePercent: value('#coreRaidBossUltimate'),
      sequenceLength: value('#coreRaidSequenceLength'),
      sequenceWindowMs: value('#coreRaidSequenceWindow'),
      mashTarget: value('#coreRaidMashTarget'),
      mashWindowMs: value('#coreRaidMashWindow'),
      rewardCoin: value('#coreRaidRewardCoin'),
      rewardShards: value('#coreRaidRewardShards')
    };
  }

  async function load(force = false) {
    if (loading || (!force && loaded) || !ensurePanel() || document.body.classList.contains('auth-guest')) return;
    loading = true;
    const state = $('#coreRaidAdminState');
    state.textContent = '서버 설정 확인 중';
    try {
      const body = await api();
      render(body.settings || {});
      loaded = true;
      state.textContent = (body.settings?.mode || 'TEST') + ' · ' +
        (body.settings?.rewardLocked === false ? '보상 활성' : '보상 잠금');
      state.classList.add('ok');
    } catch (error) {
      state.textContent = '불러오기 실패';
      state.classList.remove('ok');
      console.error('core raid admin load failed', error);
    } finally {
      loading = false;
    }
  }

  async function save() {
    const settings = collect();
    if (settings.minParticipants > settings.maxParticipants) {
      alert('최소 시작 인원은 최대 참가 인원보다 클 수 없습니다.');
      return;
    }
    if (settings.mechanicFailureDamage >= settings.partyMaxHp) {
      if (!confirm('기믹 1회 실패로 공대가 즉시 전멸할 수 있습니다. 그대로 저장할까요?')) return;
    }
    if (settings.coreImbalanceDamage >= settings.partyMaxHp) {
      if (!confirm('코어 과충전 1회로 공대가 즉시 전멸할 수 있습니다. 그대로 저장할까요?')) return;
    }
    if (settings.mode === 'ON' && !confirm('붕괴 코어 탭을 전체 유저에게 공개합니다. 계속할까요?')) return;
    if (
      !settings.rewardLocked &&
      !confirm(
        '공대 클리어 시 코인 ' + settings.rewardCoin.toLocaleString() +
        ' · 카드조각 ' + settings.rewardShards.toLocaleString() + ' 지급을 활성화합니다. 계속할까요?'
      )
    ) return;
    const button = $('#saveCoreRaidSettings');
    const state = $('#coreRaidAdminState');
    button.disabled = true;
    state.textContent = '저장 중';
    try {
      const body = await api({ method: 'PATCH', body: JSON.stringify(settings) });
      render(body.settings || settings);
      loaded = true;
      state.textContent = '저장 완료 · ' + (body.settings?.mode || settings.mode);
      state.classList.add('ok');
      alert('붕괴 코어 방 기반 레이드 설정을 저장했습니다.');
    } catch (error) {
      state.textContent = '저장 실패';
      state.classList.remove('ok');
      alert(error.message || error);
    } finally {
      button.disabled = false;
    }
  }

  function install() {
    const view = $('#view-raid');
    ensurePanel();
    if (view) {
      new MutationObserver(() => {
        if (!view.hidden) load();
      }).observe(view, { attributes: true, attributeFilter: ['hidden'] });
    }
    $('#nav button[data-view="raid"]')?.addEventListener('click', () => setTimeout(() => load(true), 0));
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', install, { once: true });
  else install();
})();
