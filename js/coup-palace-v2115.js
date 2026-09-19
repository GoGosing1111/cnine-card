(function () {
  'use strict';
  const ART = '/assets/ui/coup/imperial-palace-coup-v2115.png';
  const NODES = [{ name: '황궁 외문', x: 16, y: 72 }, { name: '근위대 뜰', x: 31, y: 43 }, { name: '황궁 광장', x: 54, y: 54 }, { name: '내궁 관문', x: 69, y: 34 }, { name: '황제의 정전', x: 85, y: 18 }];
  const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const num = v => Number(v || 0).toLocaleString('ko-KR');
  const sideName = side => ({ CHIEF: '족장팀', REBEL: '반란군', DRAW: '무승부' }[side] || '—');
  const crest = side => `<svg viewBox="0 0 40 40" aria-hidden="true">${side === 'CHIEF' ? '<path d="M7 13 14 19 20 8 26 19 33 13 30 30H10ZM11 34h18M20 19v7"/>' : '<path d="m12 32 17-21 4-6-7 3L8 29m-2-3 9 9M13 10l6 7m4 8 6 8m-4-3 6-5M10 7l5 1-4 5-1-6Z"/>'}</svg>`;
  const api = (path, body) => apiRequest('coup/' + path, body ? { method: 'POST', body: JSON.stringify(body) } : {}, { ttl: 0, timeoutMs: 35000, replaceInflight: true });
  let root = null, state = null, poll = null, clock = null, busy = false, fetching = false, epoch = 0, offset = 0, selected = 2, battleModal = null, pendingAttack = null;
  let pendingSkill = null, eventRound = null, eventIds = new Set(), skillQueue = [];
  const now = () => Date.now() + offset;
  const countdown = stamp => { const n = Math.max(0, Math.ceil((Number(stamp) - now()) / 1000)); return `${Math.floor(n / 3600).toString().padStart(2, '0')}:${Math.floor(n % 3600 / 60).toString().padStart(2, '0')}:${(n % 60).toString().padStart(2, '0')}`; };
  function view() {
    return `<section class="coup" id="coupPalace" aria-label="황궁 쿠데타"><header class="coup-heading"><div><span class="coup-eyebrow">IMPERIAL PALACE · TERRITORY WAR</span><h1>황궁 쿠데타</h1></div><div><button data-coup-rules>전쟁 규정</button><button data-coup-refresh aria-label="전황 새로고침">↻</button></div></header><div id="coupContent"><div class="coup-connecting"><img src="${ART}" alt="외문에서 정전으로 이어지는 황궁"><span>황궁 전황을 확인하고 있습니다.</span></div></div><p class="coup-notice" role="status" id="coupNotice"></p></section>`;
  }
  function notice(text) { const n = root?.querySelector('#coupNotice'); if (n) n.textContent = text || ''; }
  function currentEnergy() {
    const saved = state?.mine?.energyState; if (!saved) return null;
    const max = state.energyPolicy?.maxEnergy || 10, interval = state.energyPolicy?.recoveryMs || 120000;
    if (saved.blockedUntil > now()) return { ...saved, energy: 0 };
    if (saved.energy >= max || !saved.nextRecoveryAt) return saved;
    const ticks = Math.max(0, Math.floor((now() - saved.nextRecoveryAt) / interval) + 1);
    const energy = Math.min(max, saved.energy + ticks);
    return { ...saved, energy, nextRecoveryAt: energy >= max ? null : saved.nextRecoveryAt + ticks * interval };
  }
  function energyView() {
    const e = currentEnergy(), max = state?.energyPolicy?.maxEnergy || 10;
    const amount = e ? num(e.energy) : state?.mine ? '—' : num(max);
    const label = e || state?.mine ? '내 행동력' : '기본 행동력';
    const status = !e ? state?.mine ? '행동력 확인 중' : '참가 시 10회 충전' : e.blockedUntil > now() ? `회복 차단 <time data-coup-until="${e.blockedUntil}">${countdown(e.blockedUntil)}</time>` : e.nextRecoveryAt ? `다음 +1 <time data-coup-until="${e.nextRecoveryAt}">${countdown(e.nextRecoveryAt)}</time>` : e.energy > max ? '결집 적용 · 자연 충전 정지' : '충전 완료';
    return `<div class="coup-energy ${e?.blockedUntil > now() ? 'is-blocked' : ''}" data-coup-energy><span>${label}</span><b>${amount}<small> / ${e?.energy > max ? '50회 · 결집' : max + '회'}</small></b><i aria-hidden="true"><u style="width:${Math.min(100, (e?.energy ?? (state?.mine ? 0 : max)) / (e?.energy > max ? 50 : max) * 100)}%"></u></i><em>${status}<span>출격 1회 소모 · 2분마다 1회 충전</span></em></div>`;
  }
  function rebelTrial() { return state?.round?.rebelDefeat?.type === 'PRISON' && state.round.rebelDefeat.trialRun; }
  function rebelSentence() { return cooldownLabel(Number(state?.round?.rebelDefeat?.hours || 3) * 3600000); }
  function trialNotice() {
    return rebelTrial() ? `<p class="coup-trial-notice"><b>이번 회차 시범 운영${state.settings?.enabled === false ? ' 종료 · OFF' : ''}</b><span>반란군 패배 시 코인 차감 없이 전원 ${rebelSentence()} 수감</span></p>` : '';
  }
  const commandSkills = () => state?.commandSkills || state?.chiefSkills || [];
  const canCommand = () => state?.canUseCommandSkills ?? state?.canUseChiefSkills;
  const rebelCommand = () => state?.commandSide === 'REBEL';
  const commandLabel = () => rebelCommand() ? '반란군 지휘관' : '족장';
  const cooldownLabel = ms => { const m = Math.ceil(Number(ms) / 60000); return [m >= 60 ? Math.floor(m / 60) + '시간' : '', m % 60 ? m % 60 + '분' : ''].filter(Boolean).join(' '); };
  function skillConsole() {
    const skills = commandSkills(); if (!state?.round || !skills.length || state.settings?.enabled === false) return '';
    const commander = state.commander?.nickname || (rebelCommand() ? '지정 대기' : state.round.chiefName);
    const timing = skills.filter(s => s.code !== 'NUCLEAR').map(s => `${s.code === 'ARTILLERY' ? '포격' : '결집'} ${cooldownLabel(s.cooldownMs)}`).join(' · ');
    return `<section class="coup-chief-arsenal ${rebelCommand() ? 'is-rebel' : ''}"><header><div><span class="coup-eyebrow">${rebelCommand() ? 'REBEL COMMAND' : 'CHIEF’S SUPREME COMMAND'}</span><h2>${rebelCommand() ? '반란군의 결단' : '족장의 결단'}</h2><span class="coup-commander-name">${rebelCommand() ? '임시 지휘관' : '족장'} · ${esc(commander)}</span></div><p>${canCommand() ? '지휘 권한 활성' : commandLabel() + '만 발동 가능'}<b>${timing}</b></p></header><div class="coup-skill-grid">${skills.map((s,i) => `<button class="coup-skill-card ${s.code.toLowerCase()}" data-coup-skill="${s.code}" aria-label="${esc(s.name)} · ${esc(s.effect)} · 상세 보기"><img src="${esc(s.image)}" alt="" loading="lazy"><span class="coup-skill-number">0${i+1}</span><span class="coup-skill-type">${esc(s.label)}</span><span class="coup-skill-copy"><strong>${esc(s.name)}</strong><span>${esc(s.effect)}</span></span><span class="coup-skill-status" data-skill-status="${s.code}">${s.enabled === false ? '잠금 · OFF' : s.nextUseAt > now() ? countdown(s.nextUseAt) : canCommand() ? '발동 준비' : '스킬 정보'}<i>↗</i></span></button>`).join('')}</div></section>`;
  }
  function skillResult(result) {
    const skill = state?.chiefSkills?.find(s => s.code === result.skillCode); if (!skill) return;
    eventIds.add(result.requestId);
    const side = result.commandSide || 'CHIEF', target = result.targetSide || (result.skillCode === 'RALLY' ? side : side === 'CHIEF' ? 'REBEL' : 'CHIEF');
    const mineHit = result.skillCode !== 'ARTILLERY' && result.affectedUserIds?.includes(Number(state.viewerId));
    const message = result.skillCode === 'NUCLEAR' ? `${num(result.affectedCount)}명 행동력 0 · 10분간 회복 차단` : result.skillCode === 'ARTILLERY' ? `${esc(result.nodeName)} · ${sideName(target)} HP −${num(result.damage)}` : `${sideName(target)} ${num(result.affectedCount)}명 · 행동력 50 충전`;
    const d = modal(`<div class="coup-skill-popup ${result.skillCode.toLowerCase()} is-result"><img class="coup-skill-popup-art" src="${esc(skill.image)}" alt="${esc(skill.name)} 발동 일러스트"><div class="coup-skill-popup-copy"><span class="coup-eyebrow">${side === 'REBEL' ? 'REBEL COMMAND' : 'SUPREME COMMAND'} · 발동 완료</span><h2>${esc(skill.name)}</h2><p class="coup-skill-result-chief">${side === 'REBEL' ? '반란군 지휘관' : '족장'} ${esc(result.commanderName || result.chiefName)}의 명령</p><div class="coup-skill-impact">${message}</div>${mineHit ? `<p class="coup-skill-personal">${result.skillCode === 'NUCLEAR' ? '내 부대가 피격되었습니다. 회복 차단 종료까지 ' : '내 행동력이 50으로 충전되었습니다.'}${result.skillCode === 'NUCLEAR' ? `<time data-coup-until="${result.blockedUntil}">${countdown(result.blockedUntil)}</time>` : ''}</p>` : ''}${result.frontMoved ? `<p>${result.winner ? '마지막 거점을 돌파했습니다.' : sideName(target) + ' 방어선 돌파 · 다음 거점으로 진격합니다.'}</p>` : ''}<button class="coup-primary" data-skill-result-close>전황 확인 <span>→</span></button></div></div>`, `${skill.name} 발동`);
    d.classList.add('coup-skill-dialog'); d.querySelector('[data-skill-result-close]').onclick = () => d.close();
  }
  function collectSkillEvents(next) {
    const events = next.skillEvents || [];
    if (eventRound !== next.round?.id) { eventRound = next.round?.id; eventIds = new Set(events.map(e => e.requestId)); skillQueue = []; return; }
    for (const e of [...events].reverse()) if (!eventIds.has(e.requestId)) { eventIds.add(e.requestId); skillQueue.push(e); }
  }
  function openSkill(code) {
    const skills = commandSkills(), s = skills.find(s => s.code === code); if (!s) return;
    const allowed = s.enabled !== false && canCommand() && (pendingSkill?.skillCode === code || s.nextUseAt <= now()) && !busy;
    const d = modal(`<div class="coup-skill-popup ${code.toLowerCase()}"><img class="coup-skill-popup-art" src="${esc(s.image)}" alt="${esc(s.name)} 일러스트"><div class="coup-skill-popup-copy"><span class="coup-eyebrow">${rebelCommand() ? 'REBEL COMMAND' : 'CHIEF’S SUPREME COMMAND'} · 0${skills.indexOf(s)+1}</span><h2>${esc(s.name)}</h2><div class="coup-skill-impact">${esc(s.effect)}</div><p>${esc(s.detail)}</p><dl><div><dt>적용 대상</dt><dd>${esc(s.label)}</dd></div><div><dt>재사용 대기</dt><dd>${cooldownLabel(s.cooldownMs)} · 스킬별 적용</dd></div></dl><button class="coup-primary" data-skill-execute ${allowed ? '' : 'disabled'}>${pendingSkill?.skillCode === code ? '발동 결과 다시 확인' : s.enabled === false ? '원자폭탄 잠금 · 운영자 ON 대기' : !canCommand() ? '현재 ' + commandLabel() + '만 발동할 수 있습니다' : s.nextUseAt > now() ? '재사용 대기 중' : '스킬 발동'} <span>→</span></button><p class="coup-skill-error" data-skill-error role="status"></p></div></div>`, s.name);
    d.classList.add('coup-skill-dialog');
    const button = d.querySelector('[data-skill-execute]');
    button.onclick = async () => {
      if (busy || !canCommand() || s.enabled === false) return;
      if (pendingSkill && pendingSkill.skillCode !== code) { d.querySelector('[data-skill-error]').textContent = '이전에 요청한 스킬의 결과를 먼저 확인하세요.'; return; }
      const version = epoch; pendingSkill ||= { roundId: state.round.id, skillCode: code, requestId: crypto.randomUUID() };
      busy = true; clearTimeout(poll); button.disabled = true; button.textContent = '명령 전달 중…';
      try {
        const result = await api('skill', pendingSkill); pendingSkill = null;
        if (version !== epoch) return;
        eventIds.add(result.requestId); collectSkillEvents(result.state); state = result.state; offset = state.serverNow - Date.now();
        d.close(); render(); skillResult(result);
      } catch (e) {
        if (version !== epoch) return;
        d.querySelector('[data-skill-error]').textContent = e.message;
        if ([400,403,409,429].includes(Number(e.status))) pendingSkill = null;
        button.disabled = false; button.textContent = pendingSkill ? '동일 요청 결과 다시 확인' : '다시 확인';
      } finally { if (version === epoch) { busy = false; void refresh(); } }
    };
  }
  function hp(side, r) {
    const value = side === 'CHIEF' ? r?.chiefHp : r?.rebelHp, amount = r ? Math.max(0, Math.min(100, Number(value) / Number(r.maxHp) * 100)) : 0;
    const members = (state.members || []).filter(m => m.side === side).length;
    const recruiting = r?.status === 'RECRUITING';
    return `<div class="coup-faction ${side.toLowerCase()}">${crest(side)}<div class="coup-faction-info"><div><strong>${sideName(side)}</strong><span>${recruiting ? '개전 후 공개' : members + '명'}${state.mine?.side === side ? '<em class="coup-my-side">내 진영</em>' : ''}</span></div><div class="coup-hp" role="meter" aria-label="${sideName(side)} 진영 체력" aria-valuemin="0" aria-valuemax="${r?.maxHp || 1}" aria-valuenow="${value || 0}"><i style="width:${amount}%"></i></div><small>${r ? `${num(value)} <em>/ ${num(r.maxHp)}</em>` : '참가 모집 대기'}</small></div></div>`;
  }
  function trialPreview(t) {
    if (!t) return '';
    return `<section class="coup-court-ribbon"><span class="coup-court-symbol" aria-hidden="true">⚖</span><div><small>${t.status === 'OPEN' ? '족장 직무정지 · 국민 재판' : '국민 재판 · 판결 확정'}</small><b>${esc(t.defendantName)} <span>${t.status === 'OPEN' ? '복직·파면 투표' : t.status === 'REMOVED' ? '파면' : '복직'}</span></b></div>${t.status === 'OPEN' ? `<time data-coup-until="${t.endsAt}">${countdown(t.endsAt)}</time>` : ''}<button data-coup-trial>${t.status === 'OPEN' ? t.myVote ? '투표 현황' : '재판 투표' : '판결 보기'} <span>↗</span></button></section>`;
  }
  function render() {
    if (!root?.isConnected || !state) return;
    const r = state.round, nodes = state.nodes || NODES, phase = r?.status || 'WAITING', active = phase === 'ACTIVE' && state.settings?.enabled !== false;
    const labels = { WAITING: '개전 대기', RECRUITING: '참가 모집 중', ACTIVE: '교전 중', SETTLING: '결과 정산 중', FINISHED: '전쟁 종료', CANCELLED: '모집 취소' };
    const mine = state.mine, front = r?.front ?? 2, n = nodes[selected] || nodes[front], own = selected < front ? 'REBEL' : selected > front ? 'CHIEF' : null;
    const action = state.settings?.enabled === false && phase !== 'FINISHED' ? '<div class="coup-enlisted"><b>쿠데타 운영 종료 · OFF</b><span>현재 참가·출격·스킬 발동을 이용할 수 없습니다.</span></div>' : phase === 'RECRUITING' ? mine ? `<div class="coup-enlisted"><b>${sideName(mine.side)} 참가 확정</b><span>최신 PVP 덱 자동 반영 · 개전 대기 중</span></div>` : `<div class="coup-enlist"><button class="chief" data-coup-join="CHIEF">${crest('CHIEF')}<span>족장팀 참가<small>황궁을 지킨다</small></span>→</button><button class="rebel" data-coup-join="REBEL" ${r.chiefId === state.viewerId ? 'disabled' : ''}>${crest('REBEL')}<span>반란군 참가<small>정전을 함락한다</small></span>→</button></div>` : active ? `<div class="coup-sortie"><div><small>${mine ? `${sideName(mine.side)} · 내 출격 ${num(mine.attacks)}회` : '관전 중'}</small><b>${nodes[front].name}</b><span>${mine ? '현재 전선에서 상대 진영과 교전합니다.' : '개전 후에는 새로 참가할 수 없습니다.'}</span></div>${mine ? `<button class="coup-primary" data-coup-attack ${busy || Number(mine.next_attack_at) > now() ? 'disabled' : ''}>${busy ? '출격 준비 중' : pendingAttack ? '전투 결과 다시 확인' : '전선 출격'} <span>→</span></button>` : ''}</div>` : `<div class="coup-enlisted"><b>${phase === 'FINISHED' ? `${sideName(r.winner)}${r.winner === 'DRAW' ? '' : ' 승리'}` : phase === 'SETTLING' ? '전쟁 결과를 정산하고 있습니다.' : '다음 쿠데타를 기다리고 있습니다.'}</b><span>${phase === 'FINISHED' ? r.winner === 'REBEL' ? '족장팀 수감 · 족장 재판 개시' : r.winner === 'CHIEF' ? rebelTrial() ? `반란군 전원 ${rebelSentence()} 수감 · 코인 차감 없음` : '반란군 패배 정산 완료' : '동률 종료 · 양 진영 불이익 없음' : '운영자가 모집을 개설하면 진영을 선택할 수 있습니다.'}</span></div>`;
    root.querySelector('#coupContent').innerHTML = `${trialNotice()}<div class="coup-warboard">${energyView()}<div class="coup-score">${hp('REBEL', r)}<div class="coup-war-clock"><span class="${active ? 'is-live' : ''}">${state.settings?.enabled === false ? '운영 종료 · OFF' : labels[phase]}</span><time ${active ? `data-coup-until="${r.endsAt}"` : ''}>${active ? countdown(r.endsAt) : phase === 'RECRUITING' ? `${r.settings.battleMinutes}분 전투` : 'PALACE'}</time></div>${hp('CHIEF', r)}</div>
      <div class="coup-map"><img class="coup-palace-art" src="${ART}" alt="황궁 외문, 근위대 뜰, 황궁 광장, 내궁 관문과 황제의 정전"><div class="coup-map-shade"></div><div class="coup-map-caption"><span>수도 방위선</span><b>${r ? `족장 ${esc(r.chiefName)}` : '황궁 전역'}</b></div><span class="coup-compass" aria-hidden="true">N<br>↑</span>
      <svg class="coup-paths" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true"><path d="M16 72 31 43 54 54 69 34 85 18"/><path class="coup-front-path" d="M${nodes[Math.max(0, front - 1)].x} ${nodes[Math.max(0, front - 1)].y} ${nodes[front].x} ${nodes[front].y}"/></svg>
      ${nodes.map((node, i) => `<button class="coup-node ${i === front ? 'contested' : i < front ? 'rebel' : 'chief'} ${selected === i ? 'selected' : ''}" style="--x:${node.x}%;--y:${node.y}%" data-coup-node="${i}" aria-label="${node.name} · ${i === front ? '현재 전선' : sideName(i < front ? 'REBEL' : 'CHIEF') + ' 점령'}" aria-pressed="${selected === i}"><span class="coup-node-ring">${String(i + 1).padStart(2, '0')}</span><strong>${node.name}</strong>${i === front ? '<em>현재 전선</em>' : ''}</button>`).join('')}
      <div class="coup-node-detail"><span>${String(selected + 1).padStart(2, '0')}</span><div><small>${selected === front ? '양 진영 교전 거점' : `${sideName(own)} 점령지`}</small><b>${n.name}</b></div><p>${selected === front ? '상대 진영 체력을 소진시키면 전선이 이동합니다.' : selected === 0 ? '족장팀이 이 거점을 함락하면 반란이 진압됩니다.' : selected === 4 ? '반란군이 정전을 함락하면 쿠데타가 성공합니다.' : '현재 전선을 돌파하면 이 거점으로 진격합니다.'}</p></div></div>
      <div class="coup-command">${action}<p class="coup-sortie-policy">최신 PVP 덱·장비·용병 자동 반영 <span>승리·무승부 2,000만 · 패배 1,000만 코인</span></p></div></div>${skillConsole()}
      ${state.penalty ? `<p class="coup-loss-receipt">패배 정산 <b>−${num(state.penalty.debit)} 코인</b><span>정산 직후 잔액 ${num(state.penalty.after_coin)} 코인</span></p>` : ''}${trialPreview(state.trial)}
      <div class="coup-details"><section><header><h2>전황 기록</h2><small>최근 교전</small></header>${state.events?.length ? `<ol class="coup-war-log">${state.events.map(e => `<li><time>${new Date(Number(e.created_at)).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit', hour12: false })}</time><span><b>${esc(e.nickname)}</b> · ${esc(e.node_name)}<small>${sideName(e.winner)}${e.winner === 'DRAW' ? '' : ' 승리'} · 진영 피해 ${num(e.damage)}</small></span></li>`).join('')}</ol>` : '<p class="coup-empty">아직 교전 기록이 없습니다.</p>'}</section><section><header><h2>내 진영</h2><small>${mine ? sideName(mine.side) : '참가 현황'}</small></header>${phase === 'RECRUITING' ? '<p class="coup-empty coup-roster-hidden"><b>개전 후 공개</b><br>모집 중에는 진영별 인원과 참가자 명단을 공개하지 않습니다.</p>' : state.members?.length ? `<ul class="coup-roster">${state.members.filter(m => !mine || m.side === mine.side).slice(0, 40).map(m => `<li><i class="${m.side.toLowerCase()}"></i><b>${esc(m.nickname)}</b>${Number(m.user_id) === state.viewerId ? '<em>나</em>' : ''}<span>${num(m.attacks)}회 출격</span></li>`).join('')}</ul>` : '<p class="coup-empty">모집이 열리면 진영을 선택하세요.</p>'}</section></div>`;
    tick();
  }
  function tick() {
    const energy = root?.querySelector('[data-coup-energy]'); if (energy) energy.outerHTML = energyView();
    document.querySelectorAll('[data-coup-until]').forEach(n => { n.textContent = countdown(n.dataset.coupUntil); });
    const b = root?.querySelector('[data-coup-attack]');
    if (b && !busy) { const e = currentEnergy(), wait = Math.ceil((Number(state?.mine?.next_attack_at || 0) - now()) / 1000), empty = !e || e.energy < 1; b.disabled = !pendingAttack && (empty || wait > 0 || now() >= Number(state?.round?.endsAt)); b.innerHTML = pendingAttack ? '전투 결과 다시 확인' : empty ? !e ? '행동력 확인 중' : e.blockedUntil > now() ? '피격 · 회복 차단 중' : '행동력 회복 대기' : wait > 0 ? `다음 출격 ${wait}초` : '전선 출격 <span>→</span>'; }
    root?.querySelectorAll('[data-skill-status]').forEach(el => { const s = commandSkills().find(s => s.code === el.dataset.skillStatus); if (s) el.innerHTML = `${s.enabled === false ? '잠금 · OFF' : s.nextUseAt > now() ? countdown(s.nextUseAt) : canCommand() ? '발동 준비' : '스킬 정보'}<i>↗</i>`; });
    if (root?.isConnected && skillQueue.length && !busy && !document.querySelector('.coup-dialog')) skillResult(skillQueue.shift());
  }
  function modal(content, label) {
    const previous = document.activeElement, d = document.createElement('dialog'); d.className = 'coup-dialog'; d.setAttribute('aria-label', label);
    d.innerHTML = `<button class="coup-dialog-close" aria-label="닫기">×</button>${content}`; document.body.append(d);
    d.querySelector('.coup-dialog-close').onclick = () => d.close(); d.addEventListener('close', () => { d.remove(); previous?.focus?.(); }, { once: true }); d.showModal(); return d;
  }
  function rules() {
    modal(`<span class="coup-eyebrow">RULES OF ENGAGEMENT</span><h2>황궁 전쟁 규정</h2><ol class="coup-rules"><li><b>진영 선택</b>PVP 일반 카드 5장을 등록합니다. 진영은 참가 확정 후 변경할 수 없습니다. 용병은 기존 전용 슬롯을 사용합니다.</li><li><b>출격 행동력</b>최대 10회 · 출격당 1회 소모 · 2분마다 1회 충전됩니다. 결사대 결집으로 받은 초과 행동력은 별도로 유지됩니다.</li><li><b>출격 보상</b>승리·무승부 2,000만 코인, 패배 1,000만 코인을 지급합니다. 완료된 전투마다 한 번만 지급합니다.</li><li><b>최신 덱과 매칭</b>현재 PVP 덱·장비·용병을 자동 반영합니다. 비슷한 전투력의 상대 중 최근 만난 상대를 피해서 매칭합니다.</li><li><b>전선 돌파</b>상대와 교전한 승리 진영이 피해를 줍니다. 진영 체력이 소진되면 전선이 이동합니다. 반란군은 정전, 족장팀은 외문을 함락하면 승리합니다.</li><li><b>시간 종료</b>중앙보다 전진한 진영이 승리합니다. 중앙 교전 중이면 남은 진영 체력으로 결정하며, 동률은 무승부입니다.</li><li><b>족장팀 패배</b>족장과 참가자 전원이 포로수용소에 8시간 수감됩니다. 족장은 유저 재판에 회부되며 판결 전까지 직무가 정지됩니다.</li><li><b>반란군 패배</b>${rebelTrial() ? `이번 회차는 시범 운영으로 코인을 차감하지 않고, 반란군 참가자 전원이 포로수용소에 ${rebelSentence()} 수감됩니다.` : '정산 시 보유 코인의 20%를 차감합니다(1코인 미만 버림). 잔액이 0이면 -30억이 됩니다. 이미 음수이면 30억을 추가 차감합니다.'}</li><li><b>국민 재판</b>재판 개시 당시 활성 USER·OWNER 계정이 한 표씩 투표합니다. 투표 종료 시 파면 표가 더 많으면 파면, 동률·무투표는 복직입니다. 복직해도 원래 임기는 연장되지 않습니다.</li></ol>`, '황궁 전쟁 규정');
  }
  function join(side) {
    const roundId = state?.round?.id;
    const d = modal(`<div class="coup-oath ${side.toLowerCase()}">${crest(side)}<span class="coup-eyebrow">OATH OF ALLEGIANCE</span><h2>${sideName(side)}에 합류</h2><p>${side === 'CHIEF' ? '패배하면 족장과 함께 포로수용소에 8시간 수감됩니다.' : rebelTrial() ? `이번 회차는 코인 차감 없이 반란군 전원이 포로수용소에 ${rebelSentence()} 수감됩니다.` : '패배하면 보유 코인 20%를 잃습니다. 잔액이 0이면 -30억이 됩니다.'}</p><small>${side === 'REBEL' && !rebelTrial() ? '이미 음수이면 30억을 추가 차감합니다. ' : ''}참가 확정 후 진영을 바꿀 수 없습니다.</small><label><input type="checkbox" data-oath> 패배 시 불이익을 확인했습니다.</label><button class="coup-primary" data-enlist disabled>참가 확정</button><p role="status" data-error></p></div>`, '진영 참가 확인');
    const button = d.querySelector('[data-enlist]'); d.querySelector('[data-oath]').onchange = e => { button.disabled = !e.target.checked; };
    button.onclick = async () => { button.disabled = true; try { state = await api('join', { roundId, side, acceptPenalty: true }); d.close(); render(); } catch (e) { d.querySelector('[data-error]').textContent = e.message; button.disabled = false; } };
  }
  function courtMarkup(t) {
    if (!t) return '<h2>진행 중인 재판이 없습니다.</h2><p>쿠데타 성공 시 족장 재판이 열립니다.</p>';
    const open = t.status === 'OPEN', total = t.reinstate + t.remove, ratio = total ? t.reinstate / total * 100 : 50;
    return `<div class="coup-court"><span class="coup-court-symbol">⚖</span><span class="coup-eyebrow">THE PEOPLE’S VERDICT</span><h2>족장 국민 재판</h2><p class="coup-defendant">${esc(t.defendantName)} <span>${open ? '직무정지' : t.status === 'REMOVED' ? '파면 확정' : '복직 판결'}</span></p>${open ? `<div class="coup-court-deadline">투표 종료까지 <time data-coup-until="${t.endsAt}">${countdown(t.endsAt)}</time></div>` : ''}<div class="coup-ballot-totals"><div><span>복직</span><b>${num(t.reinstate)}</b></div><div><span>파면</span><b>${num(t.remove)}</b></div></div><div class="coup-ballot-meter"><i style="width:${ratio}%"></i></div><p class="coup-turnout">${num(total)} / ${num(t.electorate)}명 참여</p>
      ${open && t.eligible && !t.myVote ? '<fieldset class="coup-ballot"><legend>족장의 거취를 선택하세요</legend><label><input type="radio" name="coup-verdict" value="REINSTATE"><span><b>복직</b><small>남은 임기 동안 권한 복구</small></span></label><label><input type="radio" name="coup-verdict" value="REMOVE"><span><b>파면</b><small>해당 임기의 족장 권한 박탈</small></span></label><button class="coup-primary" data-vote-submit disabled>선택한 판결에 투표</button></fieldset>' : `<p class="coup-voted">${t.myVote ? `${t.myVote === 'REMOVE' ? '파면' : '복직'}에 투표했습니다.` : open ? '재판 개시 당시의 활성 계정만 투표할 수 있습니다.' : '유저 투표 결과에 따라 판결이 확정되었습니다.'}</p>`}
      <p class="coup-court-rule">계정당 1표 · 제출 후 변경 불가<br>파면 표가 더 많으면 파면, 동률·무투표는 복직합니다.<br>수감 중에도 투표할 수 있습니다. 복직해도 형기는 유지됩니다.</p><p data-vote-error role="status"></p></div>`;
  }
  async function openTrial() {
    const d = modal('<p>재판 기록을 확인하고 있습니다.</p>', '족장 국민 재판'); let updating = false;
    const paint = t => { if (!d.isConnected) return; d.querySelectorAll(':scope > :not(.coup-dialog-close)').forEach(n => n.remove()); d.insertAdjacentHTML('beforeend', courtMarkup(t));
      const button = d.querySelector('[data-vote-submit]'); d.querySelectorAll('[name=coup-verdict]').forEach(n => { n.onchange = () => { button.disabled = false; }; });
      if (button) button.onclick = async () => { if (updating) return; const choice = d.querySelector('[name=coup-verdict]:checked')?.value; if (!choice) return; updating = true; button.disabled = true;
        try { const next = await api('vote', { trialId: t.id, choice }); state = next.state; paint(next.state.trial); render(); } catch (e) { d.querySelector('[data-vote-error]').textContent = e.message; button.disabled = false; } finally { updating = false; } };
    };
    try { const data = await api('status'); offset = data.serverNow - Date.now(); paint(data.trial); } catch (e) { d.insertAdjacentHTML('beforeend', `<p>${esc(e.message)}</p>`); }
    const timer = setInterval(tick, 1000);
    const poller = setInterval(async () => { if (updating || !d.isConnected) return; updating = true;
      const chosen = d.querySelector('[name=coup-verdict]:checked')?.value;
      try { const data = await api('status'); offset = data.serverNow - Date.now(); paint(data.trial);
        if (chosen) { const input = d.querySelector('[value="'+chosen+'"]'); if (input) { input.checked = true; d.querySelector('[data-vote-submit]').disabled = false; } }
      } catch { /* Keep the last known ballot while the connection recovers. */ } finally { updating = false; }
    }, 5000);
    d.addEventListener('close', () => { clearInterval(timer); clearInterval(poller); }, { once: true });
  }
  async function refresh() {
    if (!root?.isConnected || fetching || busy) return;
    const version = epoch; fetching = true;
    try { const next = await api('status'); if (version !== epoch || busy || Number(next.serverNow) < Number(state?.serverNow || 0)) return; const changed = next.round?.id !== state?.round?.id || next.round?.front !== state?.round?.front; if (pendingAttack && pendingAttack.roundId !== next.round?.id) pendingAttack = null; if (pendingSkill && pendingSkill.roundId !== next.round?.id) pendingSkill = null; collectSkillEvents(next); state = next; offset = next.serverNow - Date.now(); if (changed) selected = state.round?.front ?? 2; render(); notice(''); }
    catch (e) { if (version === epoch) notice(e.message || '전황을 불러오지 못했습니다. 다시 확인해 주세요.'); }
    finally { if (version === epoch) { fetching = false; clearTimeout(poll); poll = setTimeout(refresh, 5000); } }
  }
  function closeBattle() { try { battleModal?.__battleV2Renderer?.destroy?.(); } catch {} battleModal?.remove(); battleModal = null; }
  async function attack() {
    if (busy || !state?.mine) return;
    busy = true; clearTimeout(poll); render(); const version = epoch;
    pendingAttack ||= { roundId: state.round.id, requestId: crypto.randomUUID() };
    try {
      await ensureFeatureResources('battleV2');
      if (version !== epoch) return;
      battleModal = document.createElement('div'); document.body.append(battleModal);
      const loading = prepareBattleV2LiveLoading({ modal: battleModal, mode: 'SIEGE', playerName: sideName(state.mine.side), opponentName: '상대 진영', autoText: '황궁 전선의 상대와 교전을 준비합니다.' });
      loading.host.style.backgroundImage = `linear-gradient(#07101b44,#07101b77),url("${ART}")`;
      let result;
      try { result = await api('attack-result?requestId=' + encodeURIComponent(pendingAttack.requestId)); }
      catch (e) { if (Number(e.status) !== 404) throw e; result = await api('attack', pendingAttack); }
      loading.stage.querySelector('.battle-v3-header strong').textContent = '황궁 쿠데타 · 전선 교전';
      if (version !== epoch) return;
      await playSiegeBattleV2Live({ ...loading, modal: battleModal, data: result });
      if (version !== epoch || !battleModal) return;
      const overlay = document.createElement('div'); overlay.className = 'coup-battle-result';
      overlay.innerHTML = `<div><small>황궁 쿠데타 · ${esc(result.nodeName)}</small><h2>${result.winningSide === 'DRAW' ? '교전 무승부' : result.attackerWon ? '교전 승리' : '교전 패배'}</h2><p>${sideName(result.targetSide)} 진영 피해 <b>${num(result.damage)}</b></p>${result.coinReward ? `<p class="coup-coin-reward">출격 보상 <b>+${num(result.coinReward)} 코인</b></p>` : ''}<span>${result.winner ? `${sideName(result.winner)} 최종 승리` : result.frontMoved ? '전선이 이동했습니다.' : '다음 교전을 준비하세요.'}</span><button class="coup-primary">황궁 전황으로 복귀</button></div>`;
      battleModal.append(overlay); overlay.querySelector('button').focus();
      await new Promise(resolve => { overlay.querySelector('button').onclick = () => { pendingAttack = null; resolve(); }; battleModal.__coupFinish = resolve; });
    } catch (e) { if (version === epoch) { notice(e.message); if ([400, 403, 409, 429].includes(Number(e.status))) pendingAttack = null; } }
    finally { if (version === epoch) { closeBattle(); busy = false; await refresh(); if (typeof loadShellSummary === 'function') void loadShellSummary(); } }
  }
  function stop() { epoch++; clearTimeout(poll); clearInterval(clock); poll = clock = null; battleModal?.__coupFinish?.(); closeBattle(); document.querySelectorAll('.coup-skill-dialog').forEach(d => d.close()); skillQueue = []; eventRound = null; root = null; busy = fetching = false; }
  function bind() {
    stop(); root = document.getElementById('coupPalace'); state = null; selected = 2; if (!root) return;
    root.addEventListener('click', e => { const b = e.target.closest('button'); if (!b) return;
      if (b.hasAttribute('data-coup-refresh')) void refresh(); else if (b.hasAttribute('data-coup-rules')) rules(); else if (b.hasAttribute('data-coup-trial')) void openTrial();
      else if (b.hasAttribute('data-coup-node')) { selected = Number(b.dataset.coupNode); render(); root.querySelector(`[data-coup-node="${selected}"]`)?.focus(); }
      else if (b.hasAttribute('data-coup-join')) join(b.dataset.coupJoin); else if (b.hasAttribute('data-coup-attack')) void attack();
      else if (b.hasAttribute('data-coup-skill')) openSkill(b.dataset.coupSkill);
    });
    clock = setInterval(tick, 1000); void refresh();
  }
  window.addEventListener('cnine:route-will-change', stop);
  window.CoupPalace = Object.freeze({ view, bind, stop, openTrial });
})();
