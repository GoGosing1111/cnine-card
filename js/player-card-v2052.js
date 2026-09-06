(function (global) {
  'use strict';
  const doc = global.document;
  const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const num = value => Math.max(0, Number(value) || 0).toLocaleString('ko-KR');
  const date = value => {
    if (!value) return '기록 없음';
    const raw = String(value), d = new Date(/^\d{4}-\d{2}-\d{2}$/.test(raw) ? raw + 'T00:00:00Z' : /(?:Z|[+-]\d\d:\d\d)$/i.test(raw) ? raw : raw.replace(' ', 'T') + 'Z');
    return Number.isNaN(+d) ? '정산 기록' : new Intl.DateTimeFormat('ko-KR', { timeZone: 'Asia/Seoul', year: 'numeric', month: '2-digit', day: '2-digit' }).format(d);
  };
  function asset(value) {
    try {
      const url = new URL(value, global.location.origin);
      return url.origin === global.location.origin && url.pathname.startsWith('/assets/') ? url.pathname + url.search : '';
    } catch { return ''; }
  }
  function nameHtml(nickname, userId, options = {}) {
    const id = Number(userId), target = Number.isSafeInteger(id) && id > 0 ? `data-player-id="${id}"` : `data-player-nickname="${esc(nickname)}"`;
    return `<button type="button" class="player-card-name" ${target} aria-label="${esc(nickname)} 명함 보기">${esc(nickname || '플레이어')}${options.label ? '<small>명함 ↗</small>' : ''}</button>`;
  }
  function tierHtml(ranked) {
    if (!ranked.tier) return `<div class="pc-rank-symbol pc-unranked" aria-hidden="true">—</div>`;
    if (typeof global.tierEmblem === 'function') return global.tierEmblem(ranked.tier, 'rank');
    return ranked.tier.id === 'challenger'
      ? '<img class="pc-rank-symbol" src="/assets/ui/tiers/challenger-v2032.png" alt="챌린저 마크" width="110" height="110">'
      : `<div class="pc-rank-symbol pc-unranked" aria-hidden="true">${esc(ranked.tier.name.slice(0, 1))}</div>`;
  }
  function trophyHtml(t, i) {
    const art = asset(t.art), tone = ['gold', 'blue', 'ruby'].includes(t.tone) ? t.tone : 'gold';
    return `<button type="button" class="pc-trophy ${t.owned ? 'is-owned' : 'is-locked'} pc-tone-${tone}" data-pc-trophy="${i}" aria-pressed="false" aria-label="${esc(t.name)} · ${t.owned ? '획득' : '미획득'} · 상세 보기">
      <span class="pc-trophy-status">${t.owned ? `획득${t.count > 1 ? ' ×' + num(t.count) : ''}` : '미획득'}</span>
      <span class="pc-trophy-stage">${art ? `<img src="${esc(art)}" alt="" width="512" height="512" decoding="async">` : ''}<span class="pc-plinth"></span></span>
      <span class="pc-trophy-name">${esc(t.name)}</span><small>${t.code === 'CLAN_CHAMPION' ? '클랜 시즌 우승' : t.code === 'CHALLENGER_STREAK_3' ? '3시즌 연속 챌린저' : '랭크 시즌 1위'}</small>
      <span class="pc-trophy-foot">${t.owned ? 'VERIFIED HONOR' : `${num(Math.min(t.progress, t.goal))} / ${num(t.goal)}`} <span aria-hidden="true">↗</span></span>
    </button>`;
  }
  function render(profile, { demo = false } = {}) {
    const p = profile.player, r = profile.ranked, trophies = profile.trophies || [], avatar = asset(p.avatar?.image);
    const owned = trophies.filter(t => t.owned).length;
    const title = p.title?.badgeText || p.title?.name;
    return `<article class="pc-card" aria-label="${esc(p.nickname)} 명함">
      <div class="pc-metal-rule"></div><div class="pc-fx" aria-hidden="true"></div>
      <header class="pc-topbar"><span class="pc-wordmark">SOOPKETMON <i>/</i> PLAYER CARD</span><span class="pc-top-caption">${demo ? '디자인 검수 · 예시 기록' : '플레이어 명함'}</span><button type="button" class="pc-close" data-pc-close aria-label="명함 닫기">×</button></header>
      <div class="pc-layout">
        <aside class="pc-identity ${avatar ? '' : 'pc-no-avatar'}">
          ${avatar ? `<img class="pc-portrait" src="${esc(avatar)}" alt="장착 아바타 ${esc(p.avatar.name)}" decoding="async">` : `<div class="pc-monogram" aria-hidden="true">${esc(p.nickname.slice(0, 1))}</div>`}
          <div class="pc-identity-shade"></div><div class="pc-id-content">
            <span class="pc-kicker">THE PLAYER</span>${title ? `<span class="pc-equipped-title">${esc(title)}</span>` : ''}<h2 id="pc-dialog-title">${esc(p.nickname)}</h2>
            <p class="pc-clan">${p.clan ? `<span>${esc(p.clan.name)}</span> <small>${esc(p.clan.role)}</small>` : '<span>자유 소속</span>'}</p>
            <div class="pc-identity-line"></div><div class="pc-frame"><span><small>명함 테두리</small><b>옵시디언 <em>+0</em></b></span><button type="button" disabled>강화 준비 중</button></div>
          </div>
        </aside>
        <div class="pc-main">
          <section class="pc-current" aria-label="현재 랭크 시즌"><div class="pc-rank-art">${tierHtml(r)}</div><div class="pc-current-text"><span class="pc-kicker">${esc(r.season || '현재 시즌')} · 현재 티어</span><h3>${esc(r.tier?.name || (r.state === 'SETTLING' ? '시즌 정산 중' : '미배치'))}</h3><p>${r.rank ? `<b>전체 ${num(r.rank)}위</b><span>${num(r.score)}점</span>` : '공식 순위가 확정되면 표시됩니다.'}</p></div><div class="pc-season-record"><b>${num(r.wins)}<small>승</small> <span>/</span> ${num(r.losses)}<small>패</small></b><small>현재 시즌 전적</small></div></section>
          <dl class="pc-statline"><div><dt>역대 최고 순위</dt><dd>${r.bestRank ? num(r.bestRank) + '<small>위</small>' : '—'}</dd></div><div><dt>최장 연속 챌린저</dt><dd>${num(r.longestStreak)}<small>시즌</small></dd></div><div><dt>보유 트로피</dt><dd>${owned}<small>/ ${trophies.length}</small></dd></div></dl>
          <div class="pc-tabs" role="tablist" aria-label="명함 기록"><button id="pc-honors-tab" type="button" role="tab" aria-selected="true" aria-controls="pc-honors-panel" data-pc-tab="honors">트로피 진열장 <span>${owned}</span></button><button id="pc-history-tab" type="button" role="tab" tabindex="-1" aria-selected="false" aria-controls="pc-history-panel" data-pc-tab="history">시즌 기록</button></div>
          <section id="pc-honors-panel" role="tabpanel" aria-labelledby="pc-honors-tab"><div class="pc-trophies">${trophies.map(trophyHtml).join('')}</div><div class="pc-trophy-detail" id="pc-trophy-detail" aria-live="polite"><span class="pc-detail-icon" aria-hidden="true">✦</span><p><b>기록으로 증명하는 명예</b><span>트로피를 선택하면 획득 조건과 달성 기록을 확인할 수 있습니다.</span></p></div></section>
          <section id="pc-history-panel" role="tabpanel" aria-labelledby="pc-history-tab" hidden><div class="pc-history-scroll"><h4>랭크전 최종 정산</h4>${r.history?.length ? `<ol class="pc-history-list">${r.history.map(h => `<li><span><b>${esc(h.season)}</b><small>${date(h.settledAt)} 정산</small></span><span class="${h.tierId === 'challenger' ? 'pc-blue' : ''}">${esc(h.tier)}</span><strong>${num(h.rank)}<small>위</small></strong></li>`).join('')}</ol>` : '<p class="pc-empty">완료된 랭크 시즌 기록이 없습니다.</p>'}<h4>클랜 시즌 우승</h4>${profile.clanHistory?.length ? `<ol class="pc-history-list">${profile.clanHistory.map(h => `<li><span><b>${esc(h.clan)}</b><small>${date(h.settledAt)} 정산</small></span><span>시즌 ${num(h.season)}</span><strong class="pc-gold">우승</strong></li>`).join('')}</ol>` : '<p class="pc-empty">공식 클랜 시즌 우승 기록이 없습니다.</p>'}<p class="pc-history-note">각 최근 ${num(profile.historyLimit || 12)}개 기록 · 트로피와 최고 기록은 전체 완료 시즌 기준입니다.</p></div></section>
          <footer class="pc-bottom"><span><i aria-hidden="true"></i> 공식 정산 기록 기준</span><span>트로피 효과 · 추후 공개</span></footer>
        </div>
      </div>
    </article>`;
  }
  function detail(t) {
    return `<span class="pc-detail-icon" aria-hidden="true">${t.owned ? '✦' : '○'}</span><p><b>${esc(t.name)} <small>${t.owned ? date(t.acquiredAt) + ' 달성' : '미획득'}</small></b><span>${esc(t.rule)}</span><span class="pc-effect-note">${t.code === 'CHALLENGER_STREAK_3' ? `현재 ${num(t.progress)}시즌 연속 · 미참가 시즌은 연속 기록이 끊깁니다.<br>` : ''}효과 추후 공개 · 현재 능력치에 영향 없음</span></p>`;
  }

  let modal = null, serial = 0, controller = null, fx = null, returnFocus = null, scrollOverflow = '', lastTarget = null, current = null, active = false;
  function cleanup() {
    if (!active) return;
    active = false;
    serial++; controller?.abort(); controller = null; fx?.destroy(); fx = null; current = null;
    doc.body.style.overflow = scrollOverflow;
    if (returnFocus?.isConnected) returnFocus.focus({ preventScroll: true });
  }
  function close() { if (modal?.open) { cleanup(); modal.close(); } }
  function ensureModal() {
    if (modal) return;
    modal = doc.createElement('dialog'); modal.id = 'player-card-dialog'; modal.className = 'pc-dialog'; modal.setAttribute('aria-label', '플레이어 명함');
    doc.body.appendChild(modal); modal.addEventListener('close', () => { if (!modal.open) cleanup(); });
    modal.addEventListener('cancel', e => { e.preventDefault(); close(); });
    modal.addEventListener('click', e => {
      if (e.target === modal || e.target.closest('[data-pc-close]')) { close(); return; }
      if (e.target.closest('[data-pc-retry]')) { open(lastTarget); return; }
      const tab = e.target.closest('[data-pc-tab]');
      if (tab) {
        const key = tab.dataset.pcTab;
        modal.querySelectorAll('[data-pc-tab]').forEach(t => { const on = t === tab; t.setAttribute('aria-selected', String(on)); t.tabIndex = on ? 0 : -1; });
        modal.querySelector('#pc-honors-panel').hidden = key !== 'honors'; modal.querySelector('#pc-history-panel').hidden = key !== 'history'; return;
      }
      const trophy = e.target.closest('[data-pc-trophy]');
      if (trophy && current) {
        modal.querySelectorAll('[data-pc-trophy]').forEach(t => t.setAttribute('aria-pressed', String(t === trophy)));
        modal.querySelector('#pc-trophy-detail').innerHTML = detail(current.trophies[Number(trophy.dataset.pcTrophy)]);
      }
    });
    modal.addEventListener('keydown', e => {
      if (e.target.matches('[role="tab"]') && ['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(e.key)) {
        e.preventDefault(); const tabs = [...modal.querySelectorAll('[role="tab"]')]; const i = tabs.indexOf(e.target);
        const next = tabs[e.key === 'Home' ? 0 : e.key === 'End' ? tabs.length - 1 : (i + (e.key === 'ArrowLeft' ? -1 : 1) + tabs.length) % tabs.length]; next.click(); next.focus();
      }
    });
    modal.addEventListener('error', e => { if (e.target.tagName === 'IMG') { e.target.hidden = true; e.target.closest('.pc-identity')?.classList.add('pc-no-avatar'); } }, true);
  }
  function statusHtml(message, failed) {
    return `<section class="pc-status"><span class="pc-kicker">SOOPKETMON / PLAYER CARD</span><button type="button" class="pc-close" data-pc-close aria-label="명함 닫기">×</button><h2>${failed ? '기록을 불러오지 못했습니다' : '명함을 불러오는 중'}</h2><p role="status">${esc(message)}</p>${failed ? '<button type="button" class="pc-retry" data-pc-retry>다시 확인</button>' : ''}</section>`;
  }
  async function open(target = {}) {
    ensureModal(); lastTarget = target;
    if (!modal.open) { returnFocus = doc.activeElement; scrollOverflow = doc.body.style.overflow; doc.body.style.overflow = 'hidden'; active = true; modal.showModal(); }
    const run = ++serial; controller?.abort(); controller = new AbortController(); fx?.destroy(); fx = null;
    modal.innerHTML = statusHtml('현재 티어와 공식 시즌 기록을 확인하고 있습니다.', false); modal.querySelector('[data-pc-close]').focus();
    try {
      // Fixtures are injected only by the independent preview, never through a production URL switch.
      const data = target.previewData || await global.apiRequest(`player-card?${target.userId ? 'userId=' + encodeURIComponent(target.userId) : 'nickname=' + encodeURIComponent(target.nickname || '')}`, { signal: controller.signal }, { timeoutMs: 12000, replaceInflight: true, ttl: 0 });
      if (run !== serial || !modal.open) return;
      current = data; modal.innerHTML = render(data, { demo: Boolean(target.previewData) }); modal.querySelector('[data-pc-close]').focus();
      const host = modal.querySelector('.pc-fx');
      // Decorative runtime is intentionally non-blocking; the card is usable without WebGL.
      Promise.resolve().then(() => global.PlayerCardFX ? null : global.ensureFeatureResources?.('playerCardFx')).then(async () => {
        if (run !== serial || !modal.open || !global.PlayerCardFX) return;
        const mounted = await global.PlayerCardFX.mount(host, modal.querySelector('.pc-card'), controller.signal);
        if (run !== serial || !modal.open) mounted?.destroy(); else fx = mounted;
      }).catch(() => {});
    } catch (error) {
      if (run !== serial || !modal.open) return;
      modal.innerHTML = statusHtml(error?.message || '잠시 후 다시 확인해 주세요.', true); modal.querySelector('[data-pc-close]').focus();
    }
  }
  if (doc) doc.addEventListener('click', e => {
    const link = e.target.closest?.('[data-player-id],[data-player-nickname]');
    if (!link || e.defaultPrevented) return;
    e.preventDefault(); open({ userId: link.dataset.playerId, nickname: link.dataset.playerNickname });
  });
  global.PlayerCallingCard = Object.freeze({ open, close, nameHtml, render, detail, asset });
  global.playerNameLinkHtml = nameHtml;
})(window);
