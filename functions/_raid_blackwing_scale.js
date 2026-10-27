// Rules v3: six private weights, three exact totals, role separation and the
// previous successful position as a forbidden afterimage. No answer is sent.
export const hasBlackwingScale = r => r.rulesVersion >= 3;
export const scalePending = r => hasBlackwingScale(r) && r.step === 'MECHANIC' && r.challenge?.scale && !r.challenge.scale.done;
const pads = ['재', '뼈', '피'];
const active = r => r.members.filter(m => !m.left);
const names = (r, ids) => ids.map(id => active(r).find(m => m.id === id)?.name || id).join(', ');

function random(seed) {
  let s = seed >>> 0 || 1;
  return n => { s ^= s << 13; s ^= s >>> 17; s ^= s << 5; return (s >>> 0) % n; };
}
function arrangements(members, previous) {
  const results = [], chosen = [], groups = [[], [], []];
  function visit(i) {
    if (i === members.length) { results.push([...chosen]); return; }
    for (let pad = 0; pad < 3; pad++) {
      if (previous[members[i].id] === pad || groups[pad].length === 2 || groups[pad].some(j => members[j].role === members[i].role)) continue;
      chosen.push(pad); groups[pad].push(i); visit(i + 1); groups[pad].pop(); chosen.pop();
    }
  }
  visit(0); return results;
}
export function openBlackwingScale(r, retry = false) {
  if (!hasBlackwingScale(r) || r.status !== 'ACTIVE') return;
  const q = r.challenge, old = retry ? q.scale : null, members = active(r), previous = { ...r.scalePositions };
  const cycle = r.scaleCycle = (r.scaleCycle || 0) + 1;
  const rand = random(r.seed ^ Math.imul(cycle, 2246822519) ^ Math.imul(r.phase + 1, 3266489917));
  const options = arrangements(members, previous);
  // A rotation of the last valid arrangement is always possible. Enumerate all
  // legal assignments before choosing totals, so no room receives an impossible puzzle.
  if (!options.length) throw Error('Blackwing scale has no legal arrangement');
  let weights, goals;
  for (let attempt = 0; attempt < 32; attempt++) {
    const pool = [1,2,3,4,5,6,7,8,9];
    for (let i = pool.length - 1; i > 0; i--) { const j = rand(i + 1); [pool[i], pool[j]] = [pool[j], pool[i]]; }
    weights = Object.fromEntries(members.map((m, i) => [m.id, pool[i]]));
    const totals = options.map(a => a.reduce((s, p, i) => { s[p] += pool[i]; return s; }, [0,0,0]));
    const counts = new Map(); for (const t of totals) counts.set(t.join(','), (counts.get(t.join(',')) || 0) + 1);
    const unique = totals.filter(t => counts.get(t.join(',')) === 1);
    if (unique.length) { goals = unique[rand(unique.length)]; break; }
    goals = totals[rand(totals.length)];
  }
  const duration = [24000,22000,22000,22000,20000][r.phase] * (r.settings.mechanicTimePercent || 100) / 100;
  q.scale = { cycle, weights, goals, previous, positions: {}, locked: [], firstLockAt: null, done: false,
    startedAt: r.clock, pausedAt: old?.pausedAt ?? r.clock, deadline: old?.deadline ?? r.clock + Math.round(duration) };
}
// Deliberately allow wrong placements and overfilled pads. The server judges
// the six commitments together; disabled choices must not reveal the solution.
export function scaleView(r, id) {
  const s = r.challenge?.scale; if (!s) return undefined;
  return { cycle: s.cycle, goals: s.goals, ownWeight: s.weights[id], previous: s.previous[id] ?? null,
    startedAt: s.startedAt, deadline: s.deadline, lockDeadline: s.firstLockAt === null ? null : s.firstLockAt + 6000, done: s.done,
    members: active(r).map(m => ({ id:m.id, name:m.name, role:m.role, position:s.positions[m.id] ?? null,
      previous:s.previous[m.id] ?? null, locked:s.locked.includes(m.id) })) };
}
function teamRecord(r, ctx, label, outcome, reason = '') {
  const s = r.challenge.scale;
  ctx.event(r, 'BLACKWING_SCALE', label, { ownerId:undefined, ownerName:undefined, role:undefined, slot:undefined,
    action:'SCALE', outcome, reason, cycle:s.cycle, goals:[...s.goals],
    placements:active(r).map(m => ({id:m.id,name:m.name,role:m.role,weight:s.weights[m.id],pad:s.positions[m.id] ?? null,previous:s.previous[m.id] ?? null,locked:s.locked.includes(m.id)})) });
}
function penalize(r, ctx, reason) {
  teamRecord(r, ctx, '용혈 저울 실패', 'FAILED', reason);
  // A team evaluation belongs to all submitted placements, not to the last
  // person whose request happened to trigger evaluation.
  const context = r.actionContext; delete r.actionContext;
  try { ctx.mistake(r, reason); } finally { if (context) r.actionContext = context; }
  if (r.status === 'ACTIVE') openBlackwingScale(r, true);
}
export function tickBlackwingScale(r, ctx) {
  const s = r.challenge.scale;
  if (r.clock >= s.deadline) {
    const reason = '용혈 저울 제한 시간 종료 · 미확정: ' + names(r, active(r).filter(m => !s.locked.includes(m.id)).map(m => m.id));
    teamRecord(r, ctx, '용혈 저울 시간 초과', 'FAILED', reason);
    ctx.finish(r, 'FAILED', 'SCALE_TIMEOUT', reason); return;
  }
  if (s.firstLockAt !== null && r.clock >= s.firstLockAt + 6000)
    penalize(r, ctx, '6초 동시 확정 실패 · 미확정: ' + names(r, active(r).filter(m => !s.locked.includes(m.id)).map(m => m.id)));
}
export function actBlackwingScale(r, m, input, ctx) {
  const s = r.challenge.scale;
  if (!scalePending(r)) ctx.fail('SCALE_DONE', '현재 용혈 저울은 완료되었습니다.');
  if (s.locked.includes(m.id)) ctx.fail('SCALE_LOCKED', '배치를 확정했습니다. 동료의 확정을 기다리세요.');
  if (input.action === 'PLACE') {
    if (!/^[0-2]$/.test(String(input.target))) ctx.fail('TARGET', '재·뼈·피 저울 발판 중 하나를 선택하세요.', 400);
    s.positions[m.id] = Number(input.target); return;
  }
  if (s.positions[m.id] === undefined) ctx.fail('SCALE_PLACE_REQUIRED', '저울 발판을 먼저 선택한 뒤 공대와 함께 확정하세요.');
  s.firstLockAt ??= r.clock; s.locked.push(m.id);
  if (s.locked.length !== 6) return;
  const issues = [], members = active(r);
  for (let pad = 0; pad < 3; pad++) {
    const group = members.filter(x => s.positions[x.id] === pad), total = group.reduce((n, x) => n + s.weights[x.id], 0);
    const who = group.map(x => x.name + '(' + s.weights[x.id] + ')').join(' + ') || '없음';
    if (group.length !== 2 || total !== s.goals[pad]) issues.push(pads[pad] + ' 발판 ' + who + ' = ' + total + ' / 목표 ' + s.goals[pad] + '·2명');
    if (group.length === 2 && group[0].role === group[1].role) issues.push(pads[pad] + ' 발판 같은 역할 중첩: ' + who);
  }
  for (const m of members) if (s.previous[m.id] === s.positions[m.id]) issues.push(m.name + ' · 직전 ' + pads[s.positions[m.id]] + ' 발판 잔상 재진입');
  if (issues.length) { penalize(r, ctx, issues.join(' / ')); return {ok:true,teamEvaluation:'FAILED',message:'공대 저울 판정 실패 · 전투기록의 전체 배치와 조건을 확인하세요.'}; }
  s.done = true; r.scalePositions = { ...s.positions }; r.statistics.scaleRounds = (r.statistics.scaleRounds || 0) + 1;
  const delta = r.clock - s.pausedAt, q = r.challenge;
  // Mechanic clocks pause while planning; the raid-wide enrage clock and HP
  // pressure keep running. Network/polling cannot reroll or extend the scale.
  q.deadline += delta; q.debt.opensAt += delta; q.debt.closesAt += delta;
  if (q.hearts.firstAt !== null) q.hearts.firstAt += delta;
  if (q.breathAt !== null) q.breathAt += delta;
  teamRecord(r, ctx, '용혈 저울 균형 · 6인 동시 확정 성공', 'SUCCESS', pads.map((p,i) => p + ' ' + s.goals[i]).join(' · '));
}
