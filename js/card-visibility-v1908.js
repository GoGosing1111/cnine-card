(() => {
  'use strict';

  const TARGET_NICKNAME = '조은';
  const HIDDEN_CARD_IDS = Object.freeze([
    'CN-011CAD85BBB2470F', // 조폭 감스트
    'CN-8D3E40884AC04D2C'  // 훈훈한 감스트
  ]);
  const hiddenCardIds = new Set(HIDDEN_CARD_IDS);

  function clean(value) {
    return String(value ?? '')
      .normalize('NFC')
      .replace(/\u00a0/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  function isTargetUser(user) {
    return clean(user?.nickname) === TARGET_NICKNAME;
  }

  function isGamstRelatedCard(card) {
    if (!card || typeof card !== 'object') return false;
    const id = clean(card.id ?? card.cardId ?? card.card_id).toUpperCase();
    const member = clean(card.name ?? card.member ?? card.memberName ?? card.member_name);
    const title = clean(card.title ?? card.cardTitle ?? card.card_title);
    return hiddenCardIds.has(id) || member === '감스트' || title.includes('감스트');
  }

  function isHidden(card, user) {
    return isTargetUser(user) && isGamstRelatedCard(card);
  }

  function filterCollectionCards(rows, user) {
    if (!Array.isArray(rows)) return [];
    if (!isTargetUser(user)) return rows;
    return rows.filter(card => !isGamstRelatedCard(card));
  }

  globalThis.CNineCardVisibilityV1908 = Object.freeze({
    TARGET_NICKNAME,
    HIDDEN_CARD_IDS,
    clean,
    isTargetUser,
    isGamstRelatedCard,
    isHidden,
    filterCollectionCards
  });
})();
