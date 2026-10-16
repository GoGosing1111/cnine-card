// V-980 presentation only: server damage, ownership and release gates stay separate.
export const HARLEQUIN_CODE = 'V-980';
export const HARLEQUIN_SKILL = Object.freeze({
  id: 'HALLOWEEN_CARNIVAL_BREAK', name: '카니발 브레이크',
  description: '징박힌 몽둥이에 모은 홍청 에너지가 표적을 강타하고, 다이아몬드 파편과 충격파로 흩어집니다.',
  duration: 2.6, contact: 1.2, frameCount: 16,
  preview: '/preview/halloween-bongsoon-harlequin-20261017/',
  damageAuthority: 'SERVER_ONLY', bodyMotion: 'STATIC_SD_USER_SELECTED'
});
export function sampleHarlequinSkill(time, {basic = false} = {}) {
  const duration = basic ? 1 : HARLEQUIN_SKILL.duration;
  const contact = basic ? .38 : HARLEQUIN_SKILL.contact;
  const t = Math.max(0, Math.min(duration, Number(time) || 0));
  if (t <= 0 || t >= duration) return {stage: 'idle', frame: null, progress: 0, duration, contact};
  if (basic && t < contact) return {stage: 'travel', frame: 4 + Math.min(3, Math.floor(t / contact * 4)), progress: t / contact, duration, contact};
  if (!basic && t < .6) return {stage: 'charge', frame: Math.min(3, Math.floor(t / .6 * 4)), progress: t / .6, duration, contact};
  if (t < contact) return {stage: 'travel', frame: 4 + Math.min(3, Math.floor((t - .6) / .6 * 4)), progress: (t - .6) / .6, duration, contact};
  const q = (t - contact) / (duration - contact);
  return {stage: 'impact', frame: 8 + Math.min(7, Math.floor(q * 8)), progress: q, duration, contact};
}
