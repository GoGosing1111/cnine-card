// Historical approvals predate the SD completion and the explicit 2026-09-11
// Omega rank assignment. Restore only those recorded changes, never other art.
export function beforeOmegaRankAssignment(cards) {
  return cards.map(card => card.code === 'V-021' ? {...card, rank: null, rankStatus: 'PENDING_USER_ASSIGNMENT'} : card);
}
export function beforeSdCompletion(cards) {
  return beforeOmegaRankAssignment(cards).map(card => {
    if (!['V-038', 'V-039', 'V-040', 'V-041', 'V-042', 'V-043'].includes(card.code)) return card;
    const { battleSpriteFootAnchor, ...before } = card;
    return { ...before, battleSprite: null, battleSpriteSha256: null, battleSpriteStatus: 'NOT_YET_PRODUCED' };
  });
}
