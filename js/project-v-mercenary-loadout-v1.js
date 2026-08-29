export const MERCENARY_FORMATION_RULES = Object.freeze({
  regularCardSlots: 5,
  mercenarySlots: 1,
  maxDeployedUnits: 6,
  mercenarySlotIndex: 6,
  mercenaryOptional: true,
  separateFromRegularDeck: true,
  regularDeckField: 'cardIds',
  mercenaryField: 'mercenaryCode'
});

function normalizeId(value) {
  return String(value ?? '').trim();
}

export function normalizeMercenaryCode(value) {
  const code = normalizeId(value).toUpperCase();
  if (!code) return null;
  return /^V-\d{3}$/.test(code) ? code : null;
}

export function buildMercenaryFormation(cardIds = [], mercenaryCode = null) {
  const regularCardIds = Array.isArray(cardIds) ? cardIds.map(normalizeId).filter(Boolean) : [];
  const normalizedMercenaryCode = normalizeMercenaryCode(mercenaryCode);
  const slots = regularCardIds.slice(0, MERCENARY_FORMATION_RULES.regularCardSlots).map((cardId, index) => ({
    slotIndex: index + 1,
    slotType: 'REGULAR_CARD',
    cardId
  }));

  if (normalizedMercenaryCode) {
    slots.push({
      slotIndex: MERCENARY_FORMATION_RULES.mercenarySlotIndex,
      slotType: 'MERCENARY',
      mercenaryCode: normalizedMercenaryCode
    });
  }

  return slots;
}

export function validateMercenaryLoadout(input = {}, allowedMercenaryCodes = []) {
  const regularCardIds = Array.isArray(input.cardIds)
    ? input.cardIds.map(normalizeId).filter(Boolean)
    : [];
  const mercenaryInput = normalizeId(input.mercenaryCode);
  const mercenaryCode = normalizeMercenaryCode(mercenaryInput);
  const allowed = new Set((Array.isArray(allowedMercenaryCodes) ? allowedMercenaryCodes : [])
    .map(normalizeMercenaryCode)
    .filter(Boolean));
  const errors = [];

  if (regularCardIds.length !== MERCENARY_FORMATION_RULES.regularCardSlots) {
    errors.push('일반 카드 덱은 정확히 5장이어야 합니다.');
  }
  if (new Set(regularCardIds).size !== regularCardIds.length) {
    errors.push('일반 카드 덱에 같은 카드가 중복되어 있습니다.');
  }
  if (mercenaryInput && !mercenaryCode) {
    errors.push('용병 코드는 V-000 형식이어야 합니다.');
  }
  if (mercenaryCode && allowed.size && !allowed.has(mercenaryCode)) {
    errors.push('선택한 용병이 현재 준비 로스터에 없습니다.');
  }

  return {
    ok: errors.length === 0,
    errors,
    cardIds: regularCardIds,
    mercenaryCode,
    regularDeckCount: regularCardIds.length,
    mercenaryCount: mercenaryCode ? 1 : 0,
    deployedCount: regularCardIds.length + (mercenaryCode ? 1 : 0),
    formation: buildMercenaryFormation(regularCardIds, mercenaryCode)
  };
}

export function serializeMercenaryLoadout(cardIds = [], mercenaryCode = null) {
  return {
    cardIds: Array.isArray(cardIds) ? cardIds.map(normalizeId).filter(Boolean).slice(0, 5) : [],
    mercenaryCode: normalizeMercenaryCode(mercenaryCode)
  };
}
