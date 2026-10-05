import {MERCENARY_LEVEL_RULES as RULES, LEVEL_BONUS_TYPES, levelProgress, planMercenaryTraining, planMercenaryBreakthrough} from '../../shared/mercenary-level-v1.mjs?v=20261005';
import {jointAccountRequest} from '../../js/joint-account-transport.mjs';
import {createLevelClient} from './client.mjs?v=20261005';
import {levelDemo} from './demo.mjs?v=20261005';
import {showBreakthrough} from './breakthrough.mjs?v=20261006-growth2';
import {presentLevelReceipt} from './receipt-presentation.mjs?v=20261006-growth2';

const preview = new URL(location.href).searchParams.get('preview') === '1';
const app = document.querySelector('#app');
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const fmt = n => n === null || n === undefined ? '미정' : Number(n).toLocaleString('ko-KR');
const icon = (type = 'diamond') => `<svg viewBox="0 0 32 32" aria-hidden="true">${type === 'shield' ? '<path d="M16 3 27 8v8c0 6-6 10-11 13C11 26 5 22 5 16V8Z"/><path d="m11 16 4 4 7-9"/>' : type === 'spark' ? '<path d="m16 2 4 10 10 4-10 4-4 10-4-10-10-4 10-4Z"/><path d="M16 9v14M9 16h14"/>' : '<path d="m16 2 13 14-13 14L3 16Z"/><path d="m16 8 7 8-7 8-7-8Z"/>'}</svg>`;
let account, selected, quantities = {}, notice = '', isError = false, busy = false, client;
let allowOverflow = false, qaResult = 'success', pending = false, qaOpen = false, search = '';
const target = () => account.cards.find(c => c.code === selected);
const progress = () => levelProgress(account.policy, target().growth);
const materials = () => Object.entries(quantities).filter(([, n]) => n !== 0).map(([code, quantity]) => ({code, quantity}));
function training() {
  if (!materials().length) return null;
  try { return planMercenaryTraining({policy:account.policy, state:target().growth, target:target(), materials:materials(), owned:account.cards, catalog:account.cards}); }
  catch (e) { return {error:e.message}; }
}
function effect(m) {
  return m.bonus.type && m.bonus.value !== null ? `${LEVEL_BONUS_TYPES[m.bonus.type]} ${fmt(m.bonus.value)}${m.bonus.type === 'SKILL_COOLDOWN_TURNS' ? '턴' : '%'}` : '효과 미정';
}
function chance(m) { return m.successChancePpm === null ? '미정' : `${fmt(m.successChancePpm / 10000)}%`; }
function render() {
  app.setAttribute('aria-busy', String(busy));
  document.querySelector('#mode').textContent = preview ? '검수 모드' : account?.enabled ? '성장실' : '활성화 준비 중';
  if (!account?.cards.length) {
    app.innerHTML = `<section class="empty-state"><div>${icon('spark')}</div><h2>${isError ? '성장실을 불러오지 못했습니다' : '함께 성장할 용병을 기다립니다'}</h2><p class="empty" role="status">${esc(notice || '보유한 용병이 없습니다. 용병 도감에서 보유 카드를 확인하세요.')}</p><a class="primary" href="/mercenary-codex/">용병 도감으로</a></section>`;
    return;
  }
  if (!target()) selected = account.cards[0].code;
  const c = target(), s = progress(), p = account.policy, blocked = busy || pending;
  const next = p.milestones.find((m, i) => !(s.breakthroughMask & (1 << i)));
  const status = s.complete ? '최종 돌파 완료' : s.breakthroughReady ? '돌파 준비 완료' : '성장 진행 중';
  app.innerHTML = `
    <div class="mode-strip"><span class="status-dot"></span><b>${preview ? '검수 전용 · 실제 소모 없음' : account.enabled ? '용병의 다음 경지를 준비하세요' : '용병 성장 활성화 준비 중'}</b><span>${preview ? '화면의 등급·경험치·배수·확률·효과는 예시입니다.' : account.enabled ? '같은 등급의 용병 카드를 경험치로 전수합니다.' : '운영 수치 확정 후 공개됩니다.'}</span>${preview ? `<button id="demo-break" ${blocked ? 'disabled' : ''}>돌파 연출 보기 <span>↗</span></button>` : ''}</div>
    <div class="growth-workspace" id="workbench" tabindex="-1">
      <aside class="roster-panel panel" aria-label="성장 대상 선택">
        <div class="panel-title"><h2>보유 용병</h2><span>${account.cards.length}</span></div>
        <label class="roster-search"><span aria-hidden="true">⌕</span><input id="search" type="search" value="${esc(search)}" placeholder="용병 검색" aria-label="용병 이름 검색"></label>
        <div class="roster-list">${account.cards.map(t => `<button class="roster-row" data-target="${t.code}" aria-pressed="${t.code === c.code}" ${blocked ? 'disabled' : ''} ${t.name.includes(search) ? '' : 'hidden'}><span class="roster-image"><img src="/${esc(t.sourceArt)}" alt="" loading="lazy"></span><span class="roster-info"><small>${esc(t.rank)}${preview ? ' · 예시' : ''}</small><b>${esc(t.name)}</b><span>Lv.<strong>${t.growth.level}</strong> <i>중복 ${fmt(t.duplicates)}</i></span></span><span class="selected-mark" aria-hidden="true">✓</span></button>`).join('')}</div>
        <p class="search-empty" ${account.cards.some(t => t.name.includes(search)) ? 'hidden' : ''}>검색 결과가 없습니다.</p>
        <div class="roster-foot">${icon('shield')}<span>용병마다 기본 <b>1장 보호</b><small>중복 카드만 재료로 사용합니다.</small></span></div>
      </aside>
      <section class="growth-stage" data-ready="${s.breakthroughReady}" data-complete="${s.complete}" aria-label="선택 용병과 성장 현황">
        <div class="stage-ambience" aria-hidden="true"></div><div class="stage-beam" aria-hidden="true"></div>
        <div class="stage-top"><span class="stage-code">${esc(c.code)} <i>/</i> ${esc(c.rank)}${preview ? ' · 예시' : ''}</span><span class="stage-status">${status}</span></div>
        <div class="stage-identity"><p>${next ? `다음 돌파 Lv.${next.level}` : '네 번의 돌파를 모두 완료했습니다'}</p><h2>${esc(c.name)}</h2></div>
        <div class="portrait-area"><div class="portrait-orbit orbit-one" aria-hidden="true"></div><div class="portrait-orbit orbit-two" aria-hidden="true"></div><figure class="hero-card"><img src="/${esc(c.sourceArt)}" alt="${esc(c.name)} 승인 원화"><span class="card-corner top-left"></span><span class="card-corner bottom-right"></span></figure><div class="stage-floor" aria-hidden="true"></div></div>
        <div class="stage-progress"><div class="level-display"><span>현재 레벨</span><strong><small>Lv.</small>${s.level}</strong><i>/ 20</i></div><div class="xp-display"><div><span>${s.complete ? '성장 완료' : '레벨 경험치'}</span><b>${s.percent === null ? '미정' : s.percent.toFixed(1) + '%'}</b></div><div class="xp-track" role="progressbar" aria-label="현재 레벨 경험치" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${s.percent ?? 0}"><span style="width:${s.percent ?? 0}%"></span><i id="xp-forecast"></i></div><p>${s.complete ? '모든 돌파 효과 해금' : `${fmt(s.experience)} <span>/ ${fmt(s.requiredXp)} EXP</span>`}</p></div></div>
        <div class="milestone-path" aria-label="돌파 단계">${p.milestones.map((m, i) => `<div class="milestone ${s.breakthroughMask & (1 << i) ? 'unlocked' : next?.level === m.level ? 'current' : ''}"><span class="milestone-symbol">${s.breakthroughMask & (1 << i) ? '✓' : icon()}</span><b>Lv.${m.level}</b><small>${s.breakthroughMask & (1 << i) ? '해금 완료' : next?.level === m.level ? '다음 돌파' : '잠김'}</small></div>`).join('')}</div>
      </section>
      <section class="control-panel panel" aria-label="성장 재료와 돌파 조작">
        <div class="control-heading"><span class="step-icon">${icon(s.breakthroughReady ? 'spark' : 'diamond')}</span><div><h2>${s.complete ? '성장 완료' : s.breakthroughReady ? '한계 돌파' : '경험치 전수'}</h2><p>${s.complete ? '최종 경지에 도달했습니다.' : s.breakthroughReady ? `Lv.${s.level}의 봉인을 개방합니다.` : '중복 카드에 담긴 경험을 전수하세요.'}</p></div></div>
        <div class="next-bonus"><div><span>${s.complete ? '최종 돌파 효과' : `Lv.${next.level} 돌파 효과`}</span><b>${esc(effect(next || p.milestones[3]))}</b></div><span>${icon('spark')}</span></div>
        <div class="material-section" ${s.breakthroughReady || s.complete ? 'hidden' : ''}>
          <div class="section-title"><h3>재료 선택</h3><span>${esc(c.rank)} 등급 용병</span></div>
          <div class="materials">${account.cards.filter(m => m.rank === c.rank).map(m => `<article class="material ${m.code === c.code ? 'same' : ''}"><img src="/${esc(m.sourceArt)}" alt="" loading="lazy"><div class="material-info"><div><b>${esc(m.name)}</b><span class="multiplier">${m.code === c.code ? `×${p.sameCardMultiplier ?? '미정'}` : '기본'}</span></div><small>${m.code === c.code ? '동일 용병 경험치 배수' : '같은 등급의 용병'}</small><div class="material-bottom"><span>중복 <b>${fmt(m.duplicates)}</b>장</span><div class="quantity"><button data-adjust="${m.code}" data-delta="-1" aria-label="${esc(m.name)} 재료 1장 줄이기" ${blocked || !account.enabled ? 'disabled' : ''}>−</button><input aria-label="${esc(m.name)} 소모 수량" data-quantity="${m.code}" type="number" inputmode="numeric" min="0" max="${Math.min(100, m.duplicates)}" step="1" value="${quantities[m.code] || 0}" ${blocked || !account.enabled ? 'disabled' : ''}><button data-adjust="${m.code}" data-delta="1" aria-label="${esc(m.name)} 재료 1장 추가" ${blocked || !account.enabled ? 'disabled' : ''}>+</button></div></div></div></article>`).join('')}</div>
        </div>
        <div class="breakthrough-brief" ${s.breakthroughReady || s.complete ? '' : 'hidden'}><div class="break-symbol">${icon('spark')}</div><h3>${s.complete ? '모든 한계를 넘었습니다' : '돌파 준비가 끝났습니다'}</h3><p>${s.complete ? '해금한 돌파 효과가 모두 유지됩니다.' : '경험치가 가득 찼습니다.<br>봉인을 열어 새로운 힘을 확인하세요.'}</p>${!s.complete ? `<dl><div><dt>돌파 성공 확률</dt><dd>${chance(next)}</dd></div><div><dt>추가 소모</dt><dd>없음</dd></div></dl><div class="failure-note">실패 시 <b>Lv.${s.level} 유지 · 경험치 0%</b><br>이미 해금한 돌파 효과는 유지됩니다.</div>` : `<div class="complete-effects">${p.milestones.map(m => `<p><span>Lv.${m.level}</span>${esc(effect(m))}<b>✓</b></p>`).join('')}</div>`}</div>
        <div id="calculation"></div>
        <div class="action-block"><button id="train" class="primary" ${s.breakthroughReady || s.complete ? 'hidden' : ''}>${busy ? '전수 결과 확인 중…' : '경험치 전수'} <span>→</span></button><button id="breakthrough" class="primary breakthrough-button" ${s.breakthroughReady || s.complete ? '' : 'hidden'}>${s.complete ? '최종 돌파 완료' : busy ? '돌파 결과 확인 중…' : `Lv.${s.level} 돌파 시작`} ${icon('spark')}</button><p>${s.breakthroughReady ? '실패해도 용병과 기존 효과는 보존됩니다.' : '코인 · 마스터의 별 추가 소모 없음'}</p></div>
        ${pending ? `<button id="recover" class="recover" ${busy ? 'disabled' : ''}>이전 요청 결과 확인</button>` : ''}
        <div id="notice" class="notice ${isError ? 'error' : ''}" role="status" aria-live="polite">${esc(notice)}</div>
      </section>
    </div>
    <section class="growth-guide"><details class="rules"><summary>성장 · 돌파 규칙 <span>＋</span></summary><div class="rule-grid"><p><b>같은 등급의 용병 카드</b>일반 멤버 카드는 사용할 수 없습니다. 용병마다 기본 1장은 보호합니다.</p><p><b>Lv.5 · 10 · 15 · 20 돌파</b>해당 레벨의 경험치가 100%가 되면 돌파합니다. 초과 경험치는 동의 후 소멸합니다.</p><p><b>실패해도 현재 레벨 유지</b>해당 레벨의 경험치만 0%로 재시작합니다. 기존 돌파 효과는 유지됩니다.</p><p><b>성공하면 효과 해금</b>다음 레벨로 이동합니다. 최종 돌파 후에도 Lv.20이며, 효과는 종류별로 합산합니다.</p></div></details>
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
  document.querySelector('#recover')?.addEventListener('click', () => void recover());
  document.querySelectorAll('[data-jump]').forEach(el => el.onclick = () => jump(Number(el.dataset.jump)));
  document.querySelector('#demo-break')?.addEventListener('click', () => { jump(5); void act('BREAKTHROUGH'); });
  document.querySelector('#qa-result')?.addEventListener('change', e => qaResult = e.target.value);
  document.querySelector('.qa')?.addEventListener('toggle', e => qaOpen = e.target.open);
  document.querySelector('#reset')?.addEventListener('click', () => {
    account = levelDemo(); selected = account.cards[0].code; quantities = {}; allowOverflow = false;
    notice = '검수 상태를 초기화했습니다.'; isError = false; render();
  });
  renderCalculation();
}
function jump(level) {
  if (!preview || busy || pending) return;
  target().growth = {level, experience:account.policy.levels[level - 1].requiredXp, breakthroughMask:(1 << RULES.milestones.indexOf(level)) - 1, revision:target().growth.revision + 1};
  quantities = {}; allowOverflow = false; isError = false; notice = `Lv.${level} 돌파 준비 상태입니다.`; render();
}
function renderCalculation() {
  const plan = training(), s = progress(), blocked = busy || pending || !account.enabled;
  const count = materials().reduce((n, m) => n + m.quantity, 0);
  document.querySelector('#calculation').innerHTML = s.breakthroughReady || s.complete ? '' : `<div class="calculation"><div><span>획득 예정 경험치</span><strong>${plan && !plan.error ? '+' + fmt(plan.xp) : '0'} <small>EXP</small></strong></div><p>${plan?.error ? `<span class="calc-error">${esc(plan.error)}</span>` : plan ? `카드 ${fmt(count)}장 전수 <b>Lv.${plan.before.level} <i>→</i> Lv.${plan.after.level}</b>` : '전수할 중복 카드 수량을 선택하세요.'}</p>${plan?.breakthroughReady ? '<span class="calc-ready">전수 후 돌파 가능</span>' : ''}${plan?.overflowXp ? `<label class="overflow-note"><input id="overflow" type="checkbox" ${allowOverflow ? 'checked' : ''} ${blocked ? 'disabled' : ''}><span>초과 <b>${fmt(plan.overflowXp)} EXP 소멸</b>에 동의합니다.<small>재료 수량을 줄일 수도 있습니다.</small></span></label>` : ''}</div>`;
  document.querySelector('#overflow')?.addEventListener('change', e => { allowOverflow = e.target.checked; renderCalculation(); });
  document.querySelector('#train').disabled = blocked || !plan || Boolean(plan.error) || Boolean(plan.overflowXp && !allowOverflow) || s.complete || s.breakthroughReady;
  document.querySelector('#breakthrough').disabled = blocked || !s.breakthroughReady;
  const forecast = document.querySelector('#xp-forecast');
  forecast.style.width = `${plan && !plan.error ? plan.after.level > s.level ? 100 : levelProgress(account.policy, plan.after).percent : 0}%`;
}
function describe(result, action) {
  return action === 'TRAIN' ? `경험치 전수 완료 · +${fmt(result.appliedXp)} EXP · Lv.${result.after.level}${result.overflowXp ? ` · 초과 ${fmt(result.overflowXp)} EXP 소멸` : ''}` : result.success ? `Lv.${result.before.level} 돌파 성공 · ${effect(result.milestone)} 해금${result.complete ? ' · 최종 돌파 완료' : ` · Lv.${result.after.level}`}` : `돌파 실패 · Lv.${result.before.level} 유지 · 경험치 0%로 재시작합니다. 기존 효과는 유지됩니다.`;
}
async function present(result, action, card) {
  if (action !== 'BREAKTHROUGH') return true;
  return showBreakthrough({result, card, bonusLabel:effect(result.milestone), preview});
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
      const result = action === 'TRAIN' ? planMercenaryTraining({policy:account.policy, state:card.growth, target:card, materials:body.materials, owned:account.cards, catalog:account.cards}) : planMercenaryBreakthrough({policy:account.policy, state:card.growth, roll:qaResult === 'success' ? 0 : 999999});
      card.growth = result.after;
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
    selected = account.cards[0]?.code;
    if (!preview) {
      client = createLevelClient({accountId:account.userId}); pending = Boolean(client.pending());
      if (pending) { busy = true; render(); await applyReceipt(await client.run(null, null, {submit:false})); busy = false; }
    }
    render();
  } catch (e) { busy = false; notice = e.message; isError = true; render(); }
}
void start();
