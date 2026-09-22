import {MERCENARY_FUSION_POLICY, MERCENARY_FUSION_RELEASE_ENABLED} from '../../shared/mercenary-fusion-policy-v1.mjs';
// The UI samples outcomes explicitly; the future transaction owns randomness.
export const MATERIAL_COUNT = 8;
export const FUSION_PREPARATION = Object.freeze({
  ...MERCENARY_FUSION_POLICY, enabled: MERCENARY_FUSION_RELEASE_ENABLED,
  successChance: MERCENARY_FUSION_POLICY.successChancePpm / 10000,
});
export const RANKS = Object.freeze(['C', 'B', 'A', 'S', 'SS', 'SSS']);
export const nextRank = rank => RANKS.includes(rank) ? RANKS[RANKS.indexOf(rank) + 1] || null : null;
export const TIMING = Object.freeze({ gather: 1.6, converge: 3.7, silence: 4.65, impact: 5.05, reveal: 5.8, settle: 7.6, end: 8.4 });
export const clamp = n => Math.max(0, Math.min(1, n));

export function materialRows(catalog, account) {
  const owned = new Map((account?.cards || []).map(c => [c.code, c]));
  return (catalog?.cards || []).flatMap(card => {
    const row = owned.get(card.code), duplicates = row?.duplicates;
    if (!row || !RANKS.includes(card.rank) || !nextRank(card.rank) || card.artOnly || !Number.isSafeInteger(duplicates) || duplicates < 1) return [];
    if (row.totalCopies !== undefined && row.totalCopies !== duplicates + 1) return [];
    return [{ ...card, duplicates, totalCopies: duplicates + 1 }];
  });
}

export function validateMaterials(selection, rows, { complete = true, sameCard = false } = {}) {
  if (!Array.isArray(selection) || selection.length > MATERIAL_COUNT || complete && selection.length !== MATERIAL_COUNT)
    return { ok: false, message: '중복 카드 8장을 선택하세요.' };
  const available = new Map(rows.map(c => [c.code, c])), counts = new Map();
  let rank = null;
  for (const code of selection) {
    const card = available.get(code);
    if (!card || !RANKS.includes(card.rank) || !nextRank(card.rank) || !Number.isSafeInteger(card.duplicates) || card.duplicates < 1)
      return { ok: false, message: '사용할 수 있는 중복 카드가 아닙니다.' };
    if (rank && rank !== card.rank) return { ok: false, message: '같은 등급의 중복 카드만 선택하세요.' };
    rank = card.rank;
    counts.set(code, (counts.get(code) || 0) + 1);
    if (counts.get(code) > card.duplicates) return { ok: false, message: '보유 중복 수량을 초과했습니다.' };
    if (sameCard && counts.size > 1) return { ok: false, message: '동일한 용병의 중복 카드만 선택하세요.' };
  }
  return { ok: true, rank, count: selection.length, remaining: MATERIAL_COUNT - selection.length };
}

export function addMaterial(selection, code, rows, options = {}) {
  const next = [...selection, code], result = validateMaterials(next, rows, { ...options, complete: false });
  return { ...result, selection: result.ok ? next : selection };
}

export function autoMaterials(rows, rank) {
  const selected = [];
  for (const row of rows.filter(c => c.rank === rank).sort((a, b) => b.duplicates - a.duplicates || a.code.localeCompare(b.code))) {
    for (let n = 0; n < row.duplicates && selected.length < MATERIAL_COUNT; n++) selected.push(row.code);
    if (selected.length === MATERIAL_COUNT) break;
  }
  return selected;
}

// Demo cards are explicitly labelled by the UI; never merged into account ownership.
export function demoMaterials(catalog, rank = 'SS') {
  if (!nextRank(rank)) return [];
  const cards = (catalog?.cards || []).filter(c => !c.artOnly && RANKS.includes(c.rank) && c.rank === rank);
  const fallback = cards.length ? cards : (catalog?.cards || []).filter(c => !c.artOnly && nextRank(c.rank));
  if (!fallback.length) return [];
  const useRank = fallback[0].rank, pool = fallback.filter(c => c.rank === useRank);
  return Array.from({ length: MATERIAL_COUNT }, (_, i) => pool[i % pool.length]);
}

export function demoResult(catalog, rank) {
  const pool = (catalog?.cards || []).filter(c => c.rank === rank && !c.artOnly);
  return pool.find(c => c.code === (rank === 'SSS' ? 'V-021' : rank === 'SS' ? 'V-004' : 'V-013')) || pool[0] || null;
}

export function atlasFrame(time) {
  if (time < TIMING.converge) return clamp((time - 1.6) / 2.1) * 3;
  if (time < TIMING.silence) return 3 + clamp((time - TIMING.converge) / .95) * 2;
  if (time < TIMING.impact) return 5;
  if (time < TIMING.impact + .14) return 6 + (time - TIMING.impact) / .14 * 2;
  return Math.min(15, 8 + (time - TIMING.impact - .14) / 2.65 * 7);
}

export function phaseAt(time) {
  if (time < TIMING.gather) return '기억이 깨어납니다';
  if (time < TIMING.converge) return '여덟 개의 계약이 하나로';
  if (time < TIMING.silence) return '봉인에 균열이 생깁니다';
  if (time < TIMING.impact) return '운명이 응답합니다';
  if (time < TIMING.reveal) return '봉인 해제';
  return '새로운 계약';
}
