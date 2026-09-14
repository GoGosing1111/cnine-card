export const COUP_ENERGY_MAX = 10;
export const COUP_ENERGY_RECOVERY_MS = 120000;
export const COUP_SKILL_COOLDOWN_MS = 1800000;
export const coupSkillCooldown = code => code === 'RALLY' ? 3600000 : COUP_SKILL_COOLDOWN_MS;
export const COUP_NUCLEAR_BLOCK_MS = 600000;
export const COUP_CHIEF_SKILLS = Object.freeze([
  { code: 'NUCLEAR', name: '원자폭탄', image: '/assets/ui/coup/chief-nuclear-v2118.png', label: '반란군 최대 50명', effect: '행동력 0 · 10분 회복 불가', detail: '반란군 중 최대 50명을 무작위로 선택해 행동력을 0으로 만듭니다. 10분 동안 회복할 수 없으며, 이후 2분마다 1씩 회복합니다.' },
  { code: 'ARTILLERY', name: '야포단 포격', image: '/assets/ui/coup/chief-artillery-v2118.png', label: '현재 전선 · 반란군', effect: '최대 진영 HP의 30% 타격', detail: '현재 전선 반란군의 최대 HP 30%만큼 피해를 줍니다. HP가 소진되면 기존 전선 돌파 규칙이 적용됩니다.' },
  { code: 'RALLY', name: '결사대 결집', image: '/assets/ui/coup/chief-rally-v2118.png', label: '족장팀 전체', effect: '행동력 50 충전', detail: '참가한 족장팀 전원의 행동력을 50으로 채웁니다. 10 이상에서는 자연 회복이 멈추며, 출격마다 1씩 소모합니다.' }
]);
export function coupEnergy(row, now = Date.now()) {
  const blockedUntil = Number(row?.blocked_until || 0);
  const saved = row?.energy == null ? 10 : Math.max(0, Math.min(100, Number(row.energy)));
  const anchor = Math.max(Number(row?.energy_at ?? now), blockedUntil);
  if (blockedUntil > now) return { energy: 0, maxEnergy: 10, blockedUntil, energyAt: anchor, nextRecoveryAt: blockedUntil + COUP_ENERGY_RECOVERY_MS };
  if (saved >= 10) return { energy: saved, maxEnergy: 10, blockedUntil, energyAt: now, nextRecoveryAt: null };
  const ticks = Math.max(0, Math.floor((now - anchor) / COUP_ENERGY_RECOVERY_MS));
  const energy = Math.min(10, saved + ticks), energyAt = energy === 10 ? now : anchor + ticks * COUP_ENERGY_RECOVERY_MS;
  return { energy, maxEnergy: 10, blockedUntil, energyAt, nextRecoveryAt: energy >= 10 ? null : energyAt + COUP_ENERGY_RECOVERY_MS };
}
export function chooseNuclearTargets(rows, random = () => crypto.getRandomValues(new Uint32Array(1))[0] / 4294967296) {
  const result = [...rows];
  for (let i = result.length - 1; i > 0; i--) { const j = Math.floor(random() * (i + 1)); [result[i], result[j]] = [result[j], result[i]]; }
  return result.slice(0, 50);
}
