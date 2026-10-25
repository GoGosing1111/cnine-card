import {MERCENARY_LEVEL_RULES as RULES, LEVEL_BONUS_TYPES, mercenaryLevelRequiredXp, levelProgress, planMercenaryTraining, planMercenaryBreakthrough} from '../../shared/mercenary-level-v1.mjs?v=20261025-cap21-v1';
import {mercenaryBreakthroughPity,mercenaryPityResultLabel} from '../../shared/mercenary-breakthrough-pity-v1.mjs';
import {jointAccountRequest} from '../../js/joint-account-transport.mjs';
import {createLevelClient} from './client.mjs?v=20261025-transfer-v1';
import {levelDemo} from './demo.mjs?v=20261025-cap21-v1';
import {showBreakthrough} from './breakthrough.mjs?v=20261025-transfer-v1';
import {presentLevelReceipt} from './receipt-presentation.mjs?v=20261016-growth-live-v1';
import {renderGrowthAnalysis, growthSummary, growthLabel, resultBonusLabel} from './growth-view.mjs?v=20261025-cap21-v1';

const entryParams = new URL(location.href).searchParams;
const localReview = ['localhost', '127.0.0.1', '[::1]'].includes(location.hostname);
const preview = localReview && (document.body.dataset.growthReview === 'true' || entryParams.get('preview') === '1');
const app = document.querySelector('#app');
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const fmt = n => n === null || n === undefined ? '미정' : Number(n).toLocaleString('ko-KR');
let account, selected, quantities = {}, notice = '', isError = false, busy = false, client;
let allowOverflow = false, qaResult = 'success', pending = false, qaOpen = false, search = '', reviewLevel = RULES.maxLevel, lastReveal = null;
const target = () => account.cards.find(c => c.code === selected);
const progress = () => levelProgress(account.policy, target().growth, target());
const materials = () => Object.entries(quantities).filter(([, n]) => n !== 0).map(([code, quantity]) => ({code, quantity}));
function training() {
  if (!materials().length) return null;
  try { return planMercenaryTraining({policy:account.policy, state:target().growth, target:target(), materials:materials(), owned:account.cards, catalog:account.cards}); }
  catch (e) { return {error:e.message}; }
}
function effect(m) {
  if (account?.policy?.growth) return growthLabel(account.policy.growth.milestones.find(row => row.level === m.level));
  return m.bonus.type && m.bonus.value !== null ? `${LEVEL_BONUS_TYPES[m.bonus.type]} ${fmt(m.bonus.value)}${m.bonus.type === 'SKILL_COOLDOWN_TURNS' ? '턴' : '%'}` : '효과 미정';
}
function chance(m) { return m.successChancePpm === null ? '미정' : `${fmt(m.successChancePpm / 10000)}%`; }
function render() {
  app.setAttribute('aria-busy', String(busy));
  document.querySelector('#mode').textContent = preview ? '검수 모드' : account?.enabled ? '성장실' : '레벨업 준비 중';
  if (!account?.cards.length) {
    app.innerHTML = `<section class="empty-state"><div></div><h2>${isError ? '성장실을 불러오지 못했습니다' : '함께 성장할 용병을 기다립니다'}</h2><p class="empty" role="status">${esc(notice || '보유한 용병이 없습니다. 용병 도감에서 보유 카드를 확인하세요.')}</p><a class="primary" href="/mercenary-codex/">용병 도감으로</a></section>`;
    return;
  }
  if (!target()) selected = account.cards[0].code;
  const c = target(), s = progress(), p = account.policy, blocked = busy || pending;
  const next = p.milestones.find((m, i) => !(s.breakthroughMask & (1 << i)));
  const pity = c.breakthroughPity ?? (preview && next ? mercenaryBreakthroughPity(next.level) : null);
  const status = !account.enabled ? '레벨업 준비 중' : s.complete ? '최종 돌파 완료' : s.breakthroughReady ? '돌파 준비 완료' : '성장 진행 중';
  app.innerHTML = `
    ${!preview?`<aside class="cn-command-ui transfer-entry"><a class="cn-ui-button primary" href="./transfer.html?code=${selected}">경험치 50% 이전 물약</a><p>${c.transfer?.used?'이 용병: 물약 1회 사용 완료':'받는 용병당 1회 · 일반 SSS / SSS 리미티드 분리'}${c.transfer?.bankedXp?` · 보관 경험치 ${fmt(c.transfer.bankedXp)} EXP (돌파 시 자동 적용)`:''}</p></aside>`:''}
    <div class="growth-intro"><div><p>MERCENARY ASCENSION</p><h2>경험을 전수하고,<br><em>한계를 넘어서.</em></h2></div><span>함께 싸운 용병의 가능성을 깨우는 성장실.<br><b>레벨 1—21 · 네 번의 돌파</b></span></div>
    <div class="mode-strip"><span class="status-dot"></span><b>${preview ? '검수 전용 · 실제 소모 없음' : account.enabled ? '용병의 다음 경지를 준비하세요' : '용병 성장 선공개 · 레벨업 준비 중'}</b><span>${preview ? '동일 용병 경험치 ×3 · 리미티드 요구 경험치 ×5 · 성장 후보안 검수' : account.enabled ? '같은 등급의 용병 카드를 경험치로 전수합니다.' : '보유 용병과 성장 화면을 확인할 수 있습니다. 경험치 전수·레벨업·돌파는 아직 이용할 수 없습니다.'}</span>${preview ? `<button id="demo-break" ${blocked ? 'disabled' : ''}>돌파 연출 보기 <span>↗</span></button>` : ''}</div>
    <div class="growth-workspace" id="workbench" tabindex="-1">
      <aside class="roster-panel panel" aria-label="성장 대상 선택">
        <div class="panel-title"><h2>보유 용병</h2><span>${account.cards.length}</span></div>
        <label class="roster-search"><span aria-hidden="true">⌕</span><input id="search" type="search" value="${esc(search)}" placeholder="용병 검색" aria-label="용병 이름 검색"></label>
        <div class="roster-list">${account.cards.map(t => `<button class="roster-row" data-target="${t.code}" aria-pressed="${t.code === c.code}" ${blocked ? 'disabled' : ''} ${t.name.includes(search) ? '' : 'hidden'}><span class="roster-image"><img src="/${esc(t.sourceArt)}" alt="" loading="lazy"></span><span class="roster-info"><small>${esc(t.rank)}${preview ? ' · 예시' : ''}</small><b>${esc(t.name)}</b><span>Lv.<strong>${t.growth.level}</strong> <i>중복 ${fmt(t.duplicates)}</i></span></span><span class="selected-mark" aria-hidden="true">✓</span></button>`).join('')}</div>
        <p class="search-empty" ${account.cards.some(t => t.name.includes(search)) ? 'hidden' : ''}>검색 결과가 없습니다.</p>
        <div class="roster-foot"><span>용병마다 기본 <b>1장 보호</b><small>중복 카드만 재료로 사용합니다.</small></span></div>
      </aside>
      <section class="growth-stage" data-ready="${s.breakthroughReady}" data-complete="${s.complete}" aria-label="선택 용병과 성장 현황">
        <div class="stage-ambience" aria-hidden="true"></div>
        <div class="stage-top"><span class="stage-code">${esc(c.code)} <i>/</i> ${esc(c.rank)}${preview ? ' · 예시' : ''}</span><span class="stage-status">${status}</span></div>
        <div class="stage-identity"><p>${next ? `다음 돌파 Lv.${next.level}` : '네 번의 돌파를 모두 완료했습니다'}</p><h2>${esc(c.name)}</h2></div>
        <div class="portrait-area"><figure class="hero-card"><img src="/${esc(c.sourceArt)}" alt="${esc(c.name)} 승인 원화"></figure></div>
        <div class="stage-progress"><div class="level-display"><span>현재 레벨</span><strong><small>Lv.</small>${s.level}</strong><i>/ ${RULES.maxLevel}</i></div><div class="xp-display"><div><span>${s.complete ? '성장 완료' : s.requiredXpMultiplier === 5 ? '리미티드 경험치 · 요구량 ×5' : '레벨 경험치'}</span><b>${s.percent === null ? '미정' : s.percent.toFixed(1) + '%'}</b></div><div class="xp-track" role="progressbar" aria-label="현재 레벨 경험치" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${s.percent ?? 0}"><span style="width:${s.percent ?? 0}%"></span><i id="xp-forecast"></i></div><p>${s.complete ? '모든 돌파 효과 해금' : `${fmt(s.experience)} <span>/ ${fmt(s.requiredXp)} EXP</span>`}</p></div></div>
        <div class="milestone-path" aria-label="돌파 단계">${p.milestones.map((m, i) => `<div class="milestone ${s.breakthroughMask & (1 << i) ? 'unlocked' : next?.level === m.level ? 'current' : ''}"><b>Lv.${m.level}</b><small>${s.breakthroughMask & (1 << i) ? '해금 완료' : next?.level === m.level ? '다음 돌파' : '잠김'}</small></div>`).join('')}</div>
      </section>
      <section class="control-panel panel" aria-label="성장 재료와 돌파 조작">
        <div class="control-heading"><div><h2>${s.complete ? '성장 완료' : s.breakthroughReady ? '한계 돌파' : '경험치 전수'}</h2><p>${s.complete ? '최대 21레벨에 도달했습니다.' : s.breakthroughReady ? `Lv.${s.level}의 봉인을 개방합니다.` : '중복 카드에 담긴 경험을 전수하세요.'}</p></div></div>
        <div class="next-bonus"><div><span>${s.complete ? '최종 돌파 효과' : `Lv.${next.level} 돌파 효과`}</span><b>${esc(effect(next || p.milestones[3]))}</b></div><span></span></div>
        ${pity ? `<p class="stat-caption" data-breakthrough-pity aria-live="polite"><b>Lv.${pity.level} 실패 누적 ${fmt(pity.failures)} / ${pity.threshold}회</b><br>${pity.guaranteed ? '<strong>천장 달성 · 다음 돌파 확정 성공</strong>'+(s.breakthroughReady?'':'<br>경험치를 100% 채운 뒤 돌파할 수 있습니다.') : `${pity.threshold}회 실패 후 다음 돌파 확정 성공`}<br>과거 실패 포함 · 용병·단계별 집계</p>` : ''}
        <div class="material-section" ${s.breakthroughReady || s.complete ? 'hidden' : ''}>
          <div class="section-title"><h3>재료 선택</h3><span>${esc(c.rank)} 등급 용병</span></div>
          <div class="materials">${account.cards.filter(m => m.rank === c.rank).map(m => `<article class="material ${m.code === c.code ? 'same' : ''}"><img src="/${esc(m.sourceArt)}" alt="" loading="lazy"><div class="material-info"><div><b>${esc(m.name)}</b><span class="multiplier">${m.code === c.code ? `×${p.sameCardMultiplier ?? '미정'}` : '기본'}</span></div><small>${m.code === c.code ? '동일 용병 경험치 배수' : '같은 등급의 용병'}</small><div class="material-bottom"><span>중복 <b>${fmt(m.duplicates)}</b>장</span><div class="quantity"><button data-adjust="${m.code}" data-delta="-1" aria-label="${esc(m.name)} 재료 1장 줄이기" ${blocked || !account.enabled ? 'disabled' : ''}>−</button><input aria-label="${esc(m.name)} 소모 수량" data-quantity="${m.code}" type="number" inputmode="numeric" min="0" max="${Math.min(100, m.duplicates)}" step="1" value="${quantities[m.code] || 0}" ${blocked || !account.enabled ? 'disabled' : ''}><button data-adjust="${m.code}" data-delta="1" aria-label="${esc(m.name)} 재료 1장 추가" ${blocked || !account.enabled ? 'disabled' : ''}>+</button></div></div></div></article>`).join('')}</div>
        </div>
        <div class="breakthrough-brief" ${s.breakthroughReady || s.complete ? '' : 'hidden'}><h3>${s.complete ? '모든 한계를 넘었습니다' : '돌파 준비가 끝났습니다'}</h3><p>${s.complete ? '해금한 돌파 효과가 모두 유지됩니다.' : '경험치가 가득 찼습니다.<br>봉인을 열어 새로운 힘을 확인하세요.'}</p>${!s.complete ? `<dl><div><dt>돌파 성공 확률</dt><dd>${pity?.guaranteed?'100% · 천장':chance(next)}</dd></div><div><dt>추가 소모</dt><dd>없음</dd></div></dl><div class="failure-note">실패 시 <b>Lv.${s.level} 유지 · 경험치 0%</b><br>이미 해금한 돌파 효과는 유지됩니다.</div>` : `<div class="complete-effects">${p.milestones.map(m => `<p><span>Lv.${m.level}</span>${esc(effect(m))}<b>✓</b></p>`).join('')}</div>`}</div>
        <div id="calculation"></div>
        <div class="action-block"><button id="train" class="primary" ${s.breakthroughReady || s.complete ? 'hidden' : ''}>${!account.enabled ? '경험치 전수 준비 중' : busy ? '전수 결과 확인 중…' : '경험치 전수'} <span>→</span></button><button id="breakthrough" class="primary breakthrough-button" ${s.breakthroughReady || s.complete ? '' : 'hidden'}>${!account.enabled ? '돌파 준비 중' : s.complete ? '최종 돌파 완료' : busy ? '돌파 결과 확인 중…' : `Lv.${s.level} ${pity?.guaranteed?'확정 ':''}돌파 시작`} </button><p>${s.breakthroughReady ? '실패해도 용병과 기존 효과는 보존됩니다.' : '코인 · 마스터의 별 추가 소모 없음'}</p></div>
        ${lastReveal ? `<button id="replay-reveal" class="receipt-repeat" ${blocked ? 'disabled' : ''}>최근 ${esc(lastReveal.card.name)} 돌파 결과 · 추가 소모 없음</button>` : ''}
        ${pending ? `<button id="recover" class="recover" ${busy ? 'disabled' : ''}>이전 요청 결과 확인</button>` : ''}
        <div id="notice" class="notice ${isError ? 'error' : ''}" role="status" aria-live="polite">${esc(notice)}</div>
      </section>
    </div>
    <div id="growth-analysis">${renderGrowthAnalysis({card:c,policy:p,reviewLevel,preview})}</div>
    <section class="growth-guide"><details class="rules"><summary>성장 · 돌파 규칙 <span>＋</span></summary><div class="rule-grid"><p><b>같은 등급의 용병 카드</b>일반 멤버 카드는 사용할 수 없습니다. 용병마다 기본 1장은 보호합니다.</p><p><b>Lv.5 · 10 · 15 · 20 돌파</b>해당 레벨의 경험치가 100%가 되면 돌파합니다. 초과 경험치는 동의 후 소멸합니다.</p><p><b>실패 누적 천장 · 과거 기록 포함</b>Lv.5·10·15는 10회 실패 후 다음 시도, Lv.20은 20회 실패 후 다음 시도에 확정 성공합니다. 용병·단계별로 집계하며 성공 시 초기화합니다. 실패하면 현재 경험치만 0%가 됩니다.</p><p><b>성공하면 효과 해금</b>다음 레벨로 이동합니다. 최종 돌파에 성공하면 Lv.21 MAX가 됩니다. 이후 경험치 전수와 돌파는 종료되며, 효과는 종류별로 합산합니다.</p></div></details>
    ${preview ? `<details class="qa" ${qaOpen ? 'open' : ''}><summary>화면 검수 도구 <span>＋</span></summary><div><p>아래 설정은 이 화면에서만 적용됩니다. 운영 등급·경험치·배수·확률·효과와 무관합니다.</p><div class="qa-tools">${[5, 10, 15, 20].map(l => `<button data-jump="${l}" ${blocked ? 'disabled' : ''}>Lv.${l} 준비</button>`).join('')}<label>돌파 결과 <select id="qa-result" ${blocked ? 'disabled' : ''}><option value="success" ${qaResult === 'success' ? 'selected' : ''}>성공 예시</option><option value="failure" ${qaResult === 'failure' ? 'selected' : ''}>실패 예시</option></select></label><button id="reset" ${blocked ? 'disabled' : ''}>초기화</button></div></div></details>` : ''}</section>`;
  document.querySelectorAll('[data-target]').forEach(el => el.onclick = () => {
    selected = el.dataset.target; quantities = {}; allowOverflow = false; notice = ''; isError = false; render();
    document.querySelector(`[data-target="${selected}"]`)?.focus({preventScroll:true});
  });
  document.querySelector('#search').oninput = e => {
    search = e.target.value.trim();
    document.querySelectorAll('[data-target]').forEach(el => el.hidden = !account.cards.find(t => t.code === el.dataset.target).name.includes(search));
    document.querySelector('.search-empty').hidden = account.cards.some(t => t.name.includes(search));
  };
  document.querySelectorAll('[data-quantity]').forEach(el => el.oninput = () => {
    quantities[el.dataset.quantity] = Number(el.value); allowOverflow = false; renderCalculation();
  });
  document.querySelectorAll('[data-adjust]').forEach(el => el.onclick = () => {
    const code = el.dataset.adjust, input = document.querySelector(`[data-quantity="${code}"]`);
    input.value = Math.max(0, Math.min(Number(input.max), Math.trunc(Number(input.value) || 0) + Number(el.dataset.delta)));
    input.dispatchEvent(new Event('input'));
  });
  document.querySelector('#train').onclick = () => void act('TRAIN');
  document.querySelector('#breakthrough').onclick = () => void act('BREAKTHROUGH');
  document.querySelector('#replay-reveal')?.addEventListener('click', async () => { if (busy || !lastReveal) return; busy = true; render(); try { await showBreakthrough(structuredClone(lastReveal)); } finally { busy = false; render(); } });
  mountAnalysis();
  document.querySelector('#recover')?.addEventListener('click', () => void recover());
  document.querySelectorAll('[data-jump]').forEach(el => el.onclick = () => jump(Number(el.dataset.jump)));
  document.querySelector('#demo-break')?.addEventListener('click', () => { jump(5); void act('BREAKTHROUGH'); });
  document.querySelector('#qa-result')?.addEventListener('change', e => qaResult = e.target.value);
  document.querySelector('.qa')?.addEventListener('toggle', e => qaOpen = e.target.open);
  document.querySelector('#reset')?.addEventListener('click', () => {
    account = levelDemo(); selected = account.cards[0].code; quantities = {}; allowOverflow = false; lastReveal = null;
    notice = '검수 상태를 초기화했습니다.'; isError = false; render();
  });
  renderCalculation();
}
function mountAnalysis() {
  document.querySelectorAll('[data-inspect-level]').forEach(el => el.onclick = () => { reviewLevel = Number(el.dataset.inspectLevel); document.querySelector('#growth-analysis').innerHTML = renderGrowthAnalysis({card:target(),policy:account.policy,reviewLevel,preview}); mountAnalysis(); document.querySelector(`[data-inspect-level="${reviewLevel}"]`)?.focus({preventScroll:true}); });
}
function jump(level) {
  if (!preview || busy || pending) return;
  target().growth = {level, experience:mercenaryLevelRequiredXp(account.policy, level, target()), breakthroughMask:(1 << RULES.milestones.indexOf(level)) - 1, revision:target().growth.revision + 1};
  target().breakthroughPity = mercenaryBreakthroughPity(level);
  quantities = {}; allowOverflow = false; isError = false; notice = `Lv.${level} 돌파 준비 상태입니다.`; render();
}
function renderCalculation() {
  const plan = training(), s = progress(), blocked = busy || pending || !account.enabled;
  const count = materials().reduce((n, m) => n + m.quantity, 0);
  document.querySelector('#calculation').innerHTML = s.breakthroughReady || s.complete ? '' : `<div class="calculation"><div><span>획득 예정 경험치</span><strong>${plan && !plan.error ? '+' + fmt(plan.xp) : '0'} <small>EXP</small></strong></div><p>${plan?.error ? `<span class="calc-error">${esc(plan.error)}</span>` : plan ? `카드 ${fmt(count)}장 전수 <b>Lv.${plan.before.level} <i>→</i> Lv.${plan.after.level}</b>` : '전수할 중복 카드 수량을 선택하세요.'}</p>${plan?.breakthroughReady ? '<span class="calc-ready">전수 후 돌파 가능</span>' : ''}${plan?.overflowXp ? `<label class="overflow-note"><input id="overflow" type="checkbox" ${allowOverflow ? 'checked' : ''} ${blocked ? 'disabled' : ''}><span>초과 <b>${fmt(plan.overflowXp)} EXP 소멸</b>에 동의합니다.<small>재료 수량을 줄일 수도 있습니다.</small></span></label>` : ''}</div>`;
  document.querySelector('#overflow')?.addEventListener('change', e => { allowOverflow = e.target.checked; renderCalculation(); });
  document.querySelector('#train').disabled = blocked || !plan || Boolean(plan.error) || Boolean(plan.overflowXp && !allowOverflow) || s.complete || s.breakthroughReady;
  document.querySelector('#breakthrough').disabled = blocked || !s.breakthroughReady;
  document.querySelector('#growth-analysis').innerHTML = renderGrowthAnalysis({card:target(),policy:account.policy,reviewLevel,preview,plannedState:plan && !plan.error ? plan.after : null}); mountAnalysis();
  const forecast = document.querySelector('#xp-forecast');
  forecast.style.width = `${plan && !plan.error ? plan.after.level > s.level ? 100 : levelProgress(account.policy, plan.after, target()).percent : 0}%`;
}
function describe(result, action) {
  if(action==='EXTRACT')return `경험치 물약 추출 완료 · ${fmt(result.xp)} EXP · 원래 용병 Lv.1·EXP 0·돌파 초기화`;
  if(action==='INFUSE')return `물약 사용 완료 · ${fmt(result.appliedXp)} EXP 적용 · ${fmt(result.bankedXp)} EXP 보관 · 이 용병은 재사용 불가`;
  const description = action === 'TRAIN' ? `경험치 전수 완료 · +${fmt(result.appliedXp)} EXP · Lv.${result.after.level}${result.overflowXp ? ` · 초과 ${fmt(result.overflowXp)} EXP 소멸` : ''}` : result.success ? `Lv.${result.before.level} 돌파 성공 · ${resultBonusLabel(result,effect(result.milestone))} 해금${result.complete ? ' · 최종 돌파 완료' : ` · Lv.${result.after.level}`}` : `돌파 실패 · Lv.${result.before.level} 유지 · 경험치 0%로 재시작합니다. 기존 효과는 유지됩니다.`;
  return description+(result.pity?' · '+mercenaryPityResultLabel(result):'')+(result.transfer?` · 보관 경험치 ${fmt(result.transfer.appliedXp)} EXP 자동 적용 · 남은 ${fmt(result.transfer.bankedAfter)} EXP`: '');
}
async function present(result, action, card) {
  if (action !== 'BREAKTHROUGH') return true;
  lastReveal = structuredClone({result,card,bonusLabel:resultBonusLabel(result,effect(result.milestone)),preview});
  return showBreakthrough(structuredClone(lastReveal));
}
async function applyReceipt(r) {
  const outcome = await presentLevelReceipt({receipt:r, client, account, present});
  pending = outcome.pending;
  if (!outcome.completed) { notice = '이전 요청의 처리를 확인하고 있습니다.'; return; }
  account = outcome.account; selected = outcome.selected; notice = describe(r.result, r.action);
  quantities = {}; allowOverflow = false;
}
async function recover() {
  if (busy) return;
  busy = true; isError = false; render();
  try { await applyReceipt(await client.run(null, null, {submit:account.enabled})); }
  catch (e) { notice = e.message; isError = true; pending = Boolean(client.pending()); }
  finally { busy = false; render(); }
}
async function act(action) {
  if (busy || !account.enabled || pending) return;
  const body = {mercenaryCode:selected, revision:target().growth.revision, ...(action === 'TRAIN' ? {materials:materials(), allowOverflow} : {})};
  if (action === 'TRAIN' && document.querySelector('#train').disabled || action === 'BREAKTHROUGH' && !progress().breakthroughReady) return;
  busy = true; isError = false; render();
  try {
    if (preview) {
      const card = target();
      const result = action === 'TRAIN' ? planMercenaryTraining({policy:account.policy, state:card.growth, target:card, materials:body.materials, owned:account.cards, catalog:account.cards}) : planMercenaryBreakthrough({policy:account.policy, state:card.growth, target:card, roll:qaResult === 'success' ? 0 : 999999, pityFailures:card.breakthroughPity?.failures??0});
      if (account.policy.growth) result.growth = {version:account.policy.growth.version,policyRevision:account.policy.revision,before:growthSummary(account.policy,result.before),after:growthSummary(account.policy,result.after)};
      card.growth = result.after;
      const nextLevel = RULES.milestones.find((_,i)=>!(card.growth.breakthroughMask&(1<<i)));
      card.breakthroughPity = nextLevel ? mercenaryBreakthroughPity(nextLevel,result.pity?.failuresAfter??card.breakthroughPity?.failures??0) : null;
      for (const m of result.consumed || []) { const row = account.cards.find(c => c.code === m.code); row.totalCopies -= m.quantity; row.duplicates -= m.quantity; }
      await present(result, action, card);
      quantities = {}; allowOverflow = false; notice = describe(result, action);
    } else await applyReceipt(await client.run(action === 'TRAIN' ? 'train' : 'breakthrough', body));
  } catch (e) { notice = e.message; isError = true; if (client) pending = Boolean(client.pending()); }
  finally {
    busy = false; render();
    if (!isError) document.querySelector('.growth-stage')?.classList.add(action === 'TRAIN' ? 'just-trained' : 'just-revealed');
    document.querySelector(action === 'BREAKTHROUGH' && !progress().breakthroughReady ? '[data-target][aria-pressed="true"]' : action === 'TRAIN' && progress().breakthroughReady ? '#breakthrough' : '#train')?.focus({preventScroll:true});
  }
}
async function start() {
  try {
    account = preview ? levelDemo() : await jointAccountRequest('mercenaries/v3/leveling/state');
    selected = account.cards.find(card => card.code === entryParams.get('code'))?.code || account.cards[0]?.code;
    if (!preview) {
      client = createLevelClient({accountId:account.userId}); pending = Boolean(client.pending());
      if (pending) { busy = true; render(); await applyReceipt(await client.run(null, null, {submit:false})); busy = false; }
    }
    render();
  } catch (e) { busy = false; notice = e.message; isError = true; render(); }
}
void start();
