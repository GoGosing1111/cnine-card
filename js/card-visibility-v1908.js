(() => {
  'use strict';

  const HIDDEN_CARD_IDS = Object.freeze([
    'CN-011CAD85BBB2470F', // 조폭 감스트
    'CN-8D3E40884AC04D2C'  // 훈훈한 감스트
  ]);
  const RETIRED_BATTLE_SPRITES = Object.freeze([
    'assets/ui/project-v/characters/fur/fur-cn-011cad85bbb2470f-sd-v1.png',
    'assets/ui/project-v/characters/fur/fur-cn-8d3e40884ac04d2c-sd-v1.png'
  ]);
  const hiddenCardIds = new Set(HIDDEN_CARD_IDS);

  // The base responsive manifest is generated and frozen. Replace it with a
  // clean frozen copy before app.js resolves any battle sprite.
  if (globalThis.CNineResponsiveBattleSprites) {
    const activeBattleSprites = { ...globalThis.CNineResponsiveBattleSprites };
    for (const sprite of RETIRED_BATTLE_SPRITES) delete activeBattleSprites[sprite];
    globalThis.CNineResponsiveBattleSprites = Object.freeze(activeBattleSprites);
  }

  function clean(value) {
    return String(value ?? '')
      .normalize('NFC')
      .replace(/\u00a0/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  function isGamstRelatedCard(card) {
    if (!card || typeof card !== 'object') return false;
    const id = clean(card.id ?? card.cardId ?? card.card_id).toUpperCase();
    const member = clean(card.name ?? card.member ?? card.memberName ?? card.member_name);
    const title = clean(card.title ?? card.cardTitle ?? card.card_title);
    return hiddenCardIds.has(id) || member === '감스트' || title.includes('감스트');
  }

  function isHidden(card) {
    return isGamstRelatedCard(card);
  }

  function filterCollectionCards(rows) {
    if (!Array.isArray(rows)) return [];
    return rows.filter(card => !isGamstRelatedCard(card));
  }

  globalThis.CNineCardVisibilityV1908 = Object.freeze({
    HIDDEN_CARD_IDS,
    RETIRED_BATTLE_SPRITES,
    clean,
    isGamstRelatedCard,
    isHidden,
    filterCollectionCards
  });
})();
