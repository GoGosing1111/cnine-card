export const ACTIONS = Object.freeze({
  idle: { label: '대기', duration: 1.4, sheet: 'basic', frames: [0, 1], loop: true },
  dash: { label: '이동', duration: .42, sheet: 'basic', frames: [2, 3] },
  attack: { label: '기본 공격', duration: 1.05, sheet: 'basic', frames: [4, 5, 6, 7], contact: .43 },
  skill: { label: '스킬', duration: 3.6, sheet: 'skillMotion', frames: [0, 1, 2, 3], contact: 1.72 },
  hit: { label: '피격', duration: .6, sheet: 'skillMotion', frames: [4, 5] },
  defeat: { label: '쓰러짐', duration: 1.1, sheet: 'skillMotion', frames: [6, 7] }
});
export const clamp = (n, a = 0, b = 1) => Math.min(b, Math.max(a, n));
export function track(keys, t) {
  if (t <= keys[0][0]) return keys[0][1];
  for (let i = 1; i < keys.length; i++) if (t <= keys[i][0]) {
    const [a, x] = keys[i - 1], [b, y] = keys[i]; let p = clamp((t - a) / (b - a)); p = p * p * (3 - 2 * p); return x + (y - x) * p;
  }
  return keys.at(-1)[1];
}
export function makePlan(kind = 'projectile', action = 'skill') {
  if (!['projectile', 'barrage', 'swarm', 'spell', 'guard', 'ricochet', 'melee'].includes(kind) || !ACTIONS[action]) throw new Error('Unknown playback plan');
  const spec = ACTIONS[action];
  return { kind, action, duration: spec.duration, loop: Boolean(spec.loop), contact: spec.contact ?? null, damageAuthority: 'NONE_VISUAL_PREVIEW' };
}
export function sample(plan, time) {
  const t = clamp(Number(time) || 0, 0, plan.duration), spec = ACTIONS[plan.action], done = t >= plan.duration;
  const state = { time: t, done, pose: null, travel: 0, recoil: 0, effectFrame: null, effectStage: null, progress: 0, label: spec.label, strike: 0 };
  const phase = t / plan.duration;
  if (plan.action === 'idle') { state.pose = { sheet: 'basic', frame: phase < .5 ? 0 : 1 }; return state; }
  if (t === 0 || (done && plan.action !== 'defeat')) return state;
  if (plan.action === 'dash') {
    state.pose = { sheet: 'basic', frame: phase < .5 ? 2 : 3 };
    state.travel = Math.sin(phase * Math.PI) * .52;
  } else if (plan.action === 'attack') {
    state.pose = { sheet: 'basic', frame: t < .43 ? 4 : t < .6 ? 5 : t < .82 ? 6 : 7 };
    if (['melee', 'guard'].includes(plan.kind)) state.travel = track([[0, 0], [.1, 0], [.4, 1], [.72, 1], [1.04, 0]], t);
    state.strike = t >= .43 && t < .61 ? Math.sin((t - .43) / .18 * Math.PI) : 0;
  } else if (plan.action === 'skill') {
    state.pose = { sheet: 'skillMotion', frame: t < .5 ? 0 : t < 1.2 ? 1 : t < 2.18 ? 2 : 3 };
    if (plan.kind === 'guard' && t >= 1.72 && t < 2.3) state.pose = { sheet: 'basic', frame: t < 2.1 ? 5 : 6 };
    if (plan.kind === 'melee') state.travel = track([[0, 0], [.4, 0], [1.5, 1], [2.2, 1], [3.5, 0]], t);
    if (plan.kind === 'guard') state.travel = track([[0, 0], [1.38, 0], [1.7, 1], [2.1, 1], [3.45, 0]], t);
    if (t < .72) { state.effectStage = 'cast'; state.effectFrame = Math.min(3, Math.floor(t / .18)); state.progress = t / .72; state.label = '기운을 모으는 순간'; }
    else if (t < 1.72) { state.effectStage = 'travel'; state.effectFrame = 4 + Math.min(3, Math.floor((t - .72) / .25)); state.progress = (t - .72); state.label = '방출 · 표적을 향해'; }
    else if (t < 3.48) { state.effectStage = 'impact'; state.effectFrame = 8 + Math.min(7, Math.floor((t - 1.72) / .22)); state.progress = (t - 1.72) / 1.76; state.label = t < 2.35 ? '충돌 · 빛의 절정' : '잔광 · 사라지는 흔적'; }
    else state.label = '자세 회복';
    state.strike = t >= 1.72 && t < 1.94 ? Math.sin((t - 1.72) / .22 * Math.PI) : 0;
  } else if (plan.action === 'hit') {
    state.pose = { sheet: 'skillMotion', frame: t < .35 ? 4 : 5 };
    state.recoil = Math.sin(phase * Math.PI) * 9;
  } else state.pose = { sheet: 'skillMotion', frame: t < .55 ? 6 : 7 };
  return state;
}
