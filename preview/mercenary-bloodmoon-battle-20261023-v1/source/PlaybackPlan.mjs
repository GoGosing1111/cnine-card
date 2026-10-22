export const ACTIONS = Object.freeze({
  idle: { label: '대기', duration: 1.4, sheet: 'basic', frames: [0, 1], loop: true },
  dash: { label: '이동', duration: .42, sheet: 'basic', frames: [2, 3] },
  attack: { label: '기본 공격', duration: 1.05, sheet: 'basic', frames: [4, 5, 6, 7], contact: .43 },
  skill: { label: '스킬', duration: 3.6, sheet: 'skillMotion', frames: [0, 1, 2, 3], contact: 1.72 },
  hit: { label: '피격', duration: .6, sheet: 'skillMotion', frames: [4, 5] },
  defeat: { label: '쓰러짐', duration: 1.1, sheet: 'skillMotion', frames: [6, 7] }
});
export const clamp = (n, a = 0, b = 1) => Math.min(b, Math.max(a, n));
export const RAPID_PROJECTILES=Object.freeze({flight:.12,interval:.07,impactFade:.46,attackLaunch:.18,skillLaunch:.24});
export const isProjectileKind=kind=>kind==='barrage'||kind==='projectile';
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
  const rapid=isProjectileKind(kind)&&['attack','skill'].includes(action);
  const launch=action==='skill'?RAPID_PROJECTILES.skillLaunch:RAPID_PROJECTILES.attackLaunch;
  return { kind, action, duration: rapid?(action==='skill'?1.2:.82):spec.duration, loop: Boolean(spec.loop), contact: rapid?launch+RAPID_PROJECTILES.flight:spec.contact??null, projectileCount:rapid?(action==='skill'&&kind==='barrage'?3:1):0, damageAuthority: 'NONE_VISUAL_PREVIEW' };
}
export function sample(plan, time) {
  const t = clamp(Number(time) || 0, 0, plan.duration), spec = ACTIONS[plan.action], done = t >= plan.duration;
  const state = { time: t, done, pose: null, travel: 0, recoil: 0, effectFrame: null, effectStage: null, progress: 0, label: spec.label, strike: 0, projectiles:[],impacts:[] };
  const phase = t / plan.duration;
  // Keep the authored resting pose still: alternating silhouettes looked like
  // repeated body movement even though their world scale was identical.
  if (plan.action === 'idle') { state.pose = { sheet: 'basic', frame: 0 }; return state; }
  if (t === 0 || (done && plan.action !== 'defeat')) return state;
  if(plan.projectileCount){
    const skill=plan.action==='skill',launch=skill?RAPID_PROJECTILES.skillLaunch:RAPID_PROJECTILES.attackLaunch;
    state.pose=skill?{sheet:'skillMotion',frame:t<.12?0:t<launch?1:t<.54?2:3}:{sheet:'basic',frame:t<launch?4:t<plan.contact?5:t<.46?6:7};
    if(t<launch){state.effectStage='cast';state.effectFrame=Math.min(3,Math.floor(t/launch*4));state.progress=t/launch;state.label='조준 · 발사 준비';}
    for(let index=0;index<plan.projectileCount;index++){
      const start=launch+index*RAPID_PROJECTILES.interval,hit=start+RAPID_PROJECTILES.flight,age=t-hit;
      if(t>=start&&t<hit){const progress=(t-start)/RAPID_PROJECTILES.flight;state.projectiles.push({index,stage:'travel',progress,frame:4+Math.min(3,Math.floor(progress*4)),start,hit});}
      else if(age>=0&&age<RAPID_PROJECTILES.impactFade){const progress=age/RAPID_PROJECTILES.impactFade;state.projectiles.push({index,stage:'impact',progress,frame:8+Math.min(7,Math.floor(progress*8)),start,hit});}
      if(age>=0&&age<.09)state.impacts.push({index,strength:Math.sin(age/.09*Math.PI)});
    }
    if(t>=launch){const leading=state.projectiles[0];state.effectStage=leading?.stage??null;state.effectFrame=leading?.frame??null;state.progress=leading?.progress??0;state.label=state.projectiles.some(p=>p.stage==='travel')?'직선 고속 사격':leading?'적중 · 잔광':'자세 회복';}
    return state;
  }
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
