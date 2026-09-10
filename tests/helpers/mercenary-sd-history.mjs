// Historical approvals predate this SD-only completion. Reconstruct only the
// six former SD fields so their original full-record hashes remain verifiable.
export function beforeSdCompletion(cards) {
  return cards.map(card => {
    if (!['V-038', 'V-039', 'V-040', 'V-041', 'V-042', 'V-043'].includes(card.code)) return card;
    const { battleSpriteFootAnchor, ...before } = card;
    return { ...before, battleSprite: null, battleSpriteSha256: null, battleSpriteStatus: 'NOT_YET_PRODUCED' };
  });
}
