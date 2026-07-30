(() => {
  const $ = selector => document.querySelector(selector);
  const esc = value => String(value ?? '').replace(/[&<>"']/g, char => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[char]));
  const num = value => Math.max(0, Number(value || 0)).toLocaleString();
  let installed = false;
  let current = null;

  const defaults = {
    mode: 'OFF', title: '봉인전', bossName: '심연에 봉인된 군주', bossImage: '',
    description: '서버 전체가 파괴·수호·정화 역할을 나누어 세 개의 봉인을 완성하는 공동 보스 콘텐츠입니다.',
    startsAt: null, endsAt: null, dailyAttempts: 3,
    targets: { attack: 20000000, guard: 16000000, purify: 14000000 },
    multipliers: { attack: 100, guard: 90, purify: 85 },
    lowestRoleBonusPercent: 20,
    attemptReward: { coin: 100, shards: 1 },
    clearReward: { coin: 2000, shards: 50 },
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
      button.innerHTML = '봉인전 관리 <span class="buildBadge">NEW</span>';
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
        <div><small>SERVER COOPERATIVE BOSS</small><h2>봉인전 운영 센터</h2><p>파괴·수호·정화 세 역할의 서버 공동 진행도와 보상을 관리합니다. 상세 전투 JSON은 저장하지 않습니다.</p></div>
        <div class="seal-admin-actions"><span id="sealAdminModeBadge">운영 중지</span><button type="button" id="sealAdminRefresh" class="ghost">새로고침</button><button type="button" id="sealAdminEnd" class="warn">현재 봉인전 종료</button></div>
      </section>

      <section class="seal-admin-status-card">
        <div id="sealAdminEventSummary" class="seal-admin-event-summary"><div class="seal-admin-loading">현재 봉인전 정보를 불러오는 중...</div></div>
        <div id="sealAdminStats" class="seal-admin-stats"></div>
        <div id="sealAdminProgress" class="seal-admin-progress-grid"></div>
      </section>

      <section class="seal-admin-settings">
        <header><div><small>다음 봉인전 기본 설정</small><h3>운영 및 목표 설정</h3><p>설정 저장 후 새 봉인전을 시작하면 현재 값이 이벤트에 고정 저장됩니다.</p></div><button type="button" id="sealAdminSave" class="primary">설정 저장</button></header>
        <div class="seal-admin-form-grid">
          <label><span>운영 모드</span><select id="sealMode"><option value="OFF">OFF · 중지</option><option value="TEST">TEST · 관리자만 참여</option><option value="ON">ON · 전체 공개</option></select></label>
          <label><span>콘텐츠명</span><input id="sealTitle" maxlength="60"></label>
          <label><span>보스 이름</span><input id="sealBossName" maxlength="80"></label>
          <label class="wide"><span>보스 이미지 경로</span><input id="sealBossImage" maxlength="1000" placeholder="assets/... 또는 https://..."></label>
          <label class="wide"><span>설명</span><textarea id="sealDescription" maxlength="300" rows="3"></textarea></label>
          <label><span>시작 시각 · KST</span><input id="sealStartsAt" type="datetime-local"></label>
          <label><span>종료 시각 · KST</span><input id="sealEndsAt" type="datetime-local"></label>
          <label><span>일일 참여 횟수</span><input id="sealDailyAttempts" type="number" min="1" max="30"></label>
          <label><span>부족 역할 지원 보너스</span><div class="input-unit"><input id="sealLowestBonus" type="number" min="0" max="500"><em>%</em></div></label>
        </div>

        <div class="seal-admin-section-title"><div><small>GLOBAL TARGETS</small><h4>역할별 공동 목표</h4></div></div>
        <div class="seal-admin-role-settings">
          <article class="attack"><header><i>⚔</i><b>파괴 봉인</b></header><label><span>목표 공헌도</span><input id="sealAttackTarget" type="number" min="1"></label><label><span>역할 배율</span><div class="input-unit"><input id="sealAttackMultiplier" type="number" min="1" max="1000"><em>%</em></div></label></article>
          <article class="guard"><header><i>◆</i><b>수호 봉인</b></header><label><span>목표 공헌도</span><input id="sealGuardTarget" type="number" min="1"></label><label><span>역할 배율</span><div class="input-unit"><input id="sealGuardMultiplier" type="number" min="1" max="1000"><em>%</em></div></label></article>
          <article class="purify"><header><i>✦</i><b>정화 봉인</b></header><label><span>목표 공헌도</span><input id="sealPurifyTarget" type="number" min="1"></label><label><span>역할 배율</span><div class="input-unit"><input id="sealPurifyMultiplier" type="number" min="1" max="1000"><em>%</em></div></label></article>
        </div>

        <div class="seal-admin-reward-grid">
          <article><header><small>PER ATTEMPT</small><h4>참여 1회 보상</h4></header><label><span>코인</span><input id="sealAttemptCoin" type="number" min="0"></label><label><span>카드 조각</span><input id="sealAttemptShards" type="number" min="0"></label></article>
          <article><header><small>SERVER CLEAR</small><h4>봉인 완료 참여자 보상</h4></header><label><span>코인</span><input id="sealClearCoin" type="number" min="0"></label><label><span>카드 조각</span><input id="sealClearShards" type="number" min="0"></label></article>
          <article><header><small>STORAGE LIMIT</small><h4>소형 기록 보존</h4></header><label><span>요청 영수증</span><div class="input-unit"><input id="sealReceiptDays" type="number" min="1" max="90"><em>일</em></div></label><label><span>종료 이벤트 개인 집계</span><div class="input-unit"><input id="sealProgressDays" type="number" min="7" max="365"><em>일</em></div></label></article>
        </div>

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
    return `<article><header><span>${icon}</span><div><small>${label}</small><b>${pct.toFixed(2)}%</b></div></header><div><i style="width:${pct}%"></i></div><footer><span>${num(role.progress)}</span><em>/ ${num(role.target)}</em></footer></article>`;
  }

  function renderOverview(data) {
    current = data;
    const settings = { ...defaults, ...(data.settings || {}) };
    const event = data.event;
    const badge = $('#sealAdminModeBadge');
    if (badge) {
      badge.textContent = settings.mode === 'ON' ? '전체 운영' : settings.mode === 'TEST' ? '테스트 운영' : '운영 중지';
      badge.className = settings.mode.toLowerCase();
    }
    $('#sealAdminEventSummary').innerHTML = event ? `<div><small>현재 이벤트 #${event.id}</small><h3>${esc(event.title)} · ${esc(event.bossName)}</h3><p>${esc(event.description || '')}</p></div><div><span class="status-${String(event.status).toLowerCase()}">${esc(event.status)}</span><b>${formatDate(event.startsAt)} ~ ${formatDate(event.endsAt)}</b></div>` : '<div><small>NO ACTIVE EVENT</small><h3>시작된 봉인전이 없습니다.</h3><p>아래 설정을 저장한 뒤 새 봉인전을 시작하세요.</p></div>';
    const stats = data.stats || {};
    $('#sealAdminStats').innerHTML = [
      ['참여 유저', num(stats.participants), '명'], ['총 참여', num(stats.attempts), '회'],
      ['누적 공헌도', num(stats.totalContribution), ''], ['완료 보상 수령', num(stats.clearClaims), '명']
    ].map(([label, value, unit]) => `<article><small>${label}</small><b>${value}<em>${unit}</em></b></article>`).join('');
    $('#sealAdminProgress').innerHTML = event ? [
      roleProgress(event.roles?.ATTACK, '파괴 봉인', '⚔'),
      roleProgress(event.roles?.GUARD, '수호 봉인', '◆'),
      roleProgress(event.roles?.PURIFY, '정화 봉인', '✦')
    ].join('') : '';
    fill(settings);
    $('#sealAdminHistory').innerHTML = (data.history || []).map(row => {
      const attack = Math.min(100, Number(row.attack_progress || 0) / Math.max(1, Number(row.attack_target || 1)) * 100);
      const guard = Math.min(100, Number(row.guard_progress || 0) / Math.max(1, Number(row.guard_target || 1)) * 100);
      const purify = Math.min(100, Number(row.purify_progress || 0) / Math.max(1, Number(row.purify_target || 1)) * 100);
      return `<article><span class="status-${String(row.status).toLowerCase()}">${esc(row.status)}</span><div><b>${esc(row.title)} · ${esc(row.boss_name)}</b><small>${formatDate(row.created_at)} · 파괴 ${attack.toFixed(1)}% · 수호 ${guard.toFixed(1)}% · 정화 ${purify.toFixed(1)}%</small></div></article>`;
    }).join('') || '<div class="seal-admin-empty">봉인전 이력이 없습니다.</div>';
  }

  function fill(settings) {
    $('#sealMode').value = settings.mode || 'OFF';
    $('#sealTitle').value = settings.title || '';
    $('#sealBossName').value = settings.bossName || '';
    $('#sealBossImage').value = settings.bossImage || '';
    $('#sealDescription').value = settings.description || '';
    $('#sealStartsAt').value = toInputDate(settings.startsAt);
    $('#sealEndsAt').value = toInputDate(settings.endsAt);
    $('#sealDailyAttempts').value = Number(settings.dailyAttempts || 3);
    $('#sealLowestBonus').value = Number(settings.lowestRoleBonusPercent || 0);
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
    $('#sealReceiptDays').value = Number(settings.receiptRetentionDays || 14);
    $('#sealProgressDays').value = Number(settings.progressRetentionDays || 90);
  }

  function integer(id, fallback = 0) {
    const value = Number($(id)?.value);
    return Number.isFinite(value) ? Math.floor(value) : fallback;
  }

  function collect() {
    return {
      mode: $('#sealMode').value,
      title: $('#sealTitle').value.trim(),
      bossName: $('#sealBossName').value.trim(),
      bossImage: $('#sealBossImage').value.trim(),
      description: $('#sealDescription').value.trim(),
      startsAt: fromInputDate($('#sealStartsAt').value),
      endsAt: fromInputDate($('#sealEndsAt').value),
      dailyAttempts: integer('#sealDailyAttempts', 3),
      targets: {
        attack: integer('#sealAttackTarget', 1), guard: integer('#sealGuardTarget', 1), purify: integer('#sealPurifyTarget', 1)
      },
      multipliers: {
        attack: integer('#sealAttackMultiplier', 100), guard: integer('#sealGuardMultiplier', 90), purify: integer('#sealPurifyMultiplier', 85)
      },
      lowestRoleBonusPercent: integer('#sealLowestBonus', 20),
      attemptReward: { coin: integer('#sealAttemptCoin'), shards: integer('#sealAttemptShards') },
      clearReward: { coin: integer('#sealClearCoin'), shards: integer('#sealClearShards') },
      receiptRetentionDays: integer('#sealReceiptDays', 14),
      progressRetentionDays: integer('#sealProgressDays', 90)
    };
  }

  function validate(settings) {
    if (!settings.title || !settings.bossName) return '콘텐츠명과 보스 이름을 입력하세요.';
    if (settings.endsAt && settings.startsAt && Date.parse(settings.endsAt) <= Date.parse(settings.startsAt)) return '종료 시각은 시작 시각보다 뒤여야 합니다.';
    if (settings.dailyAttempts < 1 || settings.dailyAttempts > 30) return '일일 참여 횟수는 1~30회로 입력하세요.';
    if (Object.values(settings.targets).some(value => value < 1)) return '역할별 목표 공헌도는 1 이상이어야 합니다.';
    if (Object.values(settings.multipliers).some(value => value < 1 || value > 1000)) return '역할 배율은 1~1,000%로 입력하세요.';
    return '';
  }

  async function saveSettings({ silent = false } = {}) {
    const settings = collect();
    const error = validate(settings);
    if (error) throw new Error(error);
    const result = await apiCall('admin/seal-battle/settings', { method: 'PATCH', body: JSON.stringify({ settings }) });
    if (!silent) alert('봉인전 기본 설정을 저장했습니다.');
    return result.settings;
  }

  async function load() {
    $('#sealAdminEventSummary').innerHTML = '<div class="seal-admin-loading">봉인전 운영 현황을 불러오는 중...</div>';
    renderOverview(await apiCall('admin/seal-battle/overview'));
  }

  function bind() {
    if ($('#view-sealbattle')?.dataset.bound === '1') return;
    $('#view-sealbattle').dataset.bound = '1';
    $('#sealAdminRefresh').onclick = () => load().catch(error => alert(error.message));
    $('#sealAdminSave').onclick = async event => {
      const button = event.currentTarget;
      button.disabled = true;
      try { await saveSettings(); await load(); } catch (error) { alert(error.message); }
      finally { button.disabled = false; }
    };
    $('#sealAdminSaveStart').onclick = async event => {
      if (!confirm('현재 활성 봉인전을 종료하고 새 봉인전을 시작할까요?\n현재 진행도는 되돌릴 수 없습니다.')) return;
      const button = event.currentTarget;
      button.disabled = true;
      try {
        await saveSettings({ silent: true });
        await apiCall('admin/seal-battle/event', { method: 'POST', body: JSON.stringify({ action: 'START' }) });
        await load();
        alert('새 봉인전을 시작했습니다.');
      } catch (error) { alert(error.message); }
      finally { button.disabled = false; }
    };
    $('#sealAdminEnd').onclick = async event => {
      if (!confirm('현재 활성 봉인전을 종료할까요?')) return;
      const button = event.currentTarget;
      button.disabled = true;
      try { await apiCall('admin/seal-battle/event', { method: 'POST', body: JSON.stringify({ action: 'END' }) }); await load(); }
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
