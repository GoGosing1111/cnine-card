// User-chosen mercenary ladder. This does not define power, prices or drop rates.
export const MERCENARY_RANKS = Object.freeze(['C', 'B', 'A', 'S', 'SS', 'SSS']);
export const OMEGA_CODE = 'V-021';
export const rankLabel = card => card.rank == null ? '등급 미정' : card.rank;
export const isMercenaryRank = rank => typeof rank === 'string' && MERCENARY_RANKS.includes(rank);

export function validateRankPolicy(roster) {
  const policy = roster?.rankPolicy;
  if (!policy || policy.authority !== 'USER' || policy.inheritLegacyRanks !== false ||
      JSON.stringify(policy.tiers) !== JSON.stringify(MERCENARY_RANKS)) throw new Error('용병 등급은 C·B·A·S·SS·SSS 순서여야 합니다.');
  for (const card of roster.cards) {
    if (card.rank === null ? card.rankStatus !== 'PENDING_USER_ASSIGNMENT' :
      !isMercenaryRank(card.rank) || card.rankStatus !== 'USER_ASSIGNED_RANK') throw new Error('용병의 등급과 확정 상태가 일치하지 않습니다.');
  }
  const omega = roster.cards.find(card => card.code === OMEGA_CODE);
  if (omega?.rank !== 'SSS') throw new Error('오메가-X의 사용자 지정 최상위 등급은 SSS입니다.');
  return roster;
}
