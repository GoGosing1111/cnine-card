import {skillChipByCode} from '../../../shared/battle-suit-skill-chips.mjs';
// Approved 2026-09-24. Combat balance has one server/client catalog authority.
export const CHIP_DRAFT = Object.freeze({
  ...skillChipByCode('SKILL_CHIP_OCTA_SEEKER'),
  status: 'USER_APPROVED_20260924', liveEnabled: true, acquisition: null,
});
export const SEQUENCE = Object.freeze({
  key: 'octaseeker', duration: 3.2, release: .12, spreadDuration: .26,
  impacts: Object.freeze(Array.from({length: 8}, (_, i) => 1.02 + i * .06)),
  life: 1.68, label: CHIP_DRAFT.name,
});
// The longest return arc (west) arrives last. All eight belong to ONE target.
export const ARRIVAL_ORDER = Object.freeze([0, 1, 3, 5, 7, 6, 4, 2]);
export const clamp = (v, min = 0, max = 1) => Math.max(min, Math.min(max, Number(v) || 0));
export const mix = (a, b, t) => a + (b - a) * t;
export const smooth = t => { t = clamp(t); return t * t * (3 - 2 * t); };
export const launchTime = i => SEQUENCE.release + i * .006;
export const impactTime = i => SEQUENCE.impacts[ARRIVAL_ORDER[i]];
export const direction = i => ({x: Math.cos(i * Math.PI / 4), y: Math.sin(i * Math.PI / 4)});

function bezier(a, b, c, d, t) {
  const u = 1 - t;
  return {x: u*u*u*a.x + 3*u*u*t*b.x + 3*u*t*t*c.x + t*t*t*d.x,
    y: u*u*u*a.y + 3*u*u*t*b.y + 3*u*t*t*c.y + t*t*t*d.y};
}
export function flightPoint(index, time, source, hit) {
  const release = launchTime(index), spreadEnd = release + SEQUENCE.spreadDuration;
  const impact = impactTime(index), vector = direction(index);
  const radius = clamp(Math.hypot(hit.x-source.x, hit.y-source.y) * .34, 140, 190);
  const radial = {x: vector.x * radius, y: vector.y * radius * .78};
  const spread = {x: source.x + radial.x, y: source.y + radial.y};
  if (time <= spreadEnd) {
    const t = clamp((time-release)/SEQUENCE.spreadDuration);
    return {x: source.x + radial.x*t, y: source.y + radial.y*t};
  }
  const duration = impact-spreadEnd;
  // Match the outgoing velocity at the segment join (C1 continuity).
  const control1 = {x: spread.x + radial.x * duration / (3*SEQUENCE.spreadDuration),
    y: spread.y + radial.y * duration / (3*SEQUENCE.spreadDuration)};
  // A different return lane for each rocket, all terminating at exactly hit.
  const lane = direction(index);
  const control2 = {x: hit.x + lane.x * radius*.64 - radius*.30,
    y: hit.y + lane.y * radius*.84};
  return bezier(spread, control1, control2, hit, clamp((time-spreadEnd)/duration));
}
export function rocketState(index, time, points) {
  const release = launchTime(index), impact = impactTime(index);
  if (time < release || time >= impact) return null;
  const point = flightPoint(index, time, points.source, points.hit);
  const before = flightPoint(index, Math.max(release, time-.001), points.source, points.hit);
  const after = flightPoint(index, Math.min(impact, time+.001), points.source, points.hit);
  const age = time-release;
  return {...point, angle: Math.atan2(after.y-before.y, after.x-before.x),
    frame: age < .1 ? Math.min(4, Math.floor(age*50)) : 5+(Math.floor((age-.1)*36)+index*2)%19,
    phase: age < SEQUENCE.spreadDuration ? 'SPREAD' : 'HOMING'};
}
export function impactFrame(age) {
  if (age < 0 || age >= SEQUENCE.life) return null;
  const keys = [[0,0],[.06,2],[.19,6],[.42,11],[.8,17],[1.3,21],[SEQUENCE.life,23]];
  let value = 0;
  for (let i=1;i<keys.length;i++) if(age<=keys[i][0]) {
    value=mix(keys[i-1][1],keys[i][1],(age-keys[i-1][0])/(keys[i][0]-keys[i-1][0]));break;
  }
  return {index:Math.floor(value),next:Math.min(23,Math.floor(value)+1),blend:value%1,
    alpha:1-smooth((age-1.2)/.48)};
}
export function cueAt(time) {
  if(time<=0) return '같은 적 한 명을 지정 · 재생하면 8발이 출발합니다';
  if(time>=SEQUENCE.duration) return '재생 완료 · 실제 피해·소모·저장 없음';
  const hits=SEQUENCE.impacts.filter(at=>time>=at).length;
  if(hits) return `${hits} / 8 명중 · ${time<SEQUENCE.impacts.at(-1)+.3?'단일 대상 집중 폭발':'잔불과 연기 소멸'}`;
  if(time<SEQUENCE.release) return '타깃 고정 · 발사 준비';
  return time<.42?'8방향 방출 · 각 로켓이 서로 다른 방향으로 출발':'유도 선회 · 8개 궤적이 같은 적에게 수렴';
}
