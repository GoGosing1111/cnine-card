import {skillChipByCode} from '../../shared/battle-suit-skill-chips.mjs';

export const CHIP = skillChipByCode('SKILL_CHIP_QUANTUM_BOMB');
const contact = CHIP.impactOffsetsMs[0] / 1000;
export const SEQUENCE = Object.freeze({
  key: CHIP.effectKey, release: .32, embed: .07, impacts: Object.freeze([contact]),
  duration: CHIP.effectDurationMs / 1000, life: CHIP.effectDurationMs / 1000 - contact
});

// The explosion opens sharply, rolls outwards, then lingers as dispersing smoke.
const impactKeys = [[0, 0], [.065, 2], [.17, 5], [.34, 8], [.58, 11], [.87, 13], [1.48, 17], [2.03, 20], [SEQUENCE.life, 23]];
export function impactFrame(age) {
  if (age < 0 || age >= SEQUENCE.life) return null;
  const end = impactKeys.findIndex(([at], i) => i > 0 && age <= at);
  const [a, from] = impactKeys[end - 1], [b, to] = impactKeys[end];
  const frame = from + (to - from) * (age - a) / (b - a);
  return {index: Math.floor(frame), blend: frame % 1};
}

export function cueAt(time) {
  if(time<=0)return '준비';
  if(time<SEQUENCE.release)return '지상 조준';
  if(time<contact-SEQUENCE.embed)return '수직 낙하';
  if(time<contact)return '지면에 착탄';
  if(time<contact+.16)return '섬광과 충격파';
  if(time<contact+.84)return '화염 기둥과 버섯구름';
  return time<SEQUENCE.duration?'연기와 잔불':'재생 완료';
}
