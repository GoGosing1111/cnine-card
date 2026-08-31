const BATTLE_CONSUMERS = new Set([
  'BATTLE',
  'BATTLE_FIELD',
  'BATTLE_ENGINE',
  'PVE_BATTLE',
  'PVP_BATTLE',
  'SIEGE_BATTLE'
]);

const PROHIBITED_CONSUMERS = new Set([
  'CATALOG',
  'SHOP',
  'DECK',
  'DETAIL',
  'SKILL_CUTIN',
  'CARD_DOCK'
]);

function clean(value) {
  return String(value ?? '').trim();
}

function upper(value) {
  return clean(value).toUpperCase();
}

function normalizeCode(value) {
  const candidate = typeof value === 'object'
    ? value?.mercenaryCode ?? value?.code
    : value;
  const code = upper(candidate);
  return /^V-\d{3}$/.test(code) ? code : null;
}

function rootAssetUrl(value) {
  const raw = clean(value).replace(/\\/g, '/');
  if (!raw) return '';
  if (/^(?:data:|blob:|https?:\/\/)/i.test(raw)) return raw;
  return `/${raw.replace(/^(?:\.\.\/)+/, '').replace(/^\.\//, '').replace(/^\/+/, '')}`;
}

function withContentVersion(value, sha256) {
  const url = rootAssetUrl(value);
  if (!url || /^(?:data:|blob:)/i.test(url)) return url;
  return `${url}${url.includes('?') ? '&' : '?'}v=${upper(sha256).slice(0, 16)}`;
}

export function validateMercenaryBattleRoster(roster) {
  if (!roster || typeof roster !== 'object') throw new Error('용병 시스템 로스터가 없습니다.');
  if (clean(roster.format) !== 'PROJECT_V_MERCENARY_SYSTEM_ROSTER_V1') {
    throw new Error('용병 시스템 로스터 형식이 올바르지 않습니다.');
  }
  const cards = Array.isArray(roster.cards) ? roster.cards : [];
  if (!cards.length) throw new Error('용병 시스템 로스터가 비어 있습니다.');

  const seen = new Set();
  for (const card of cards) {
    const code = normalizeCode(card);
    if (!code || seen.has(code)) throw new Error(`용병 코드가 올바르지 않습니다: ${clean(card?.code)}`);
    if (!clean(card?.sourceArt)) throw new Error(`${code} 카드 원화가 없습니다.`);
    if (!clean(card?.battleSprite)) throw new Error(`${code} 전투 SD가 없습니다.`);
    if (!/^[A-F0-9]{64}$/.test(upper(card?.battleSpriteSha256))) {
      throw new Error(`${code} 전투 SD 해시가 올바르지 않습니다.`);
    }
    if (clean(card.sourceArt) === clean(card.battleSprite)) {
      throw new Error(`${code} 카드 원화와 전투 SD가 분리되지 않았습니다.`);
    }
    seen.add(code);
  }

  if (Number(roster.summary?.battleSpriteReady) !== cards.length || Number(roster.summary?.battleSpritePending) !== 0) {
    throw new Error('용병 전투 SD 준비 집계가 로스터와 일치하지 않습니다.');
  }
  return roster;
}

export function createMercenaryBattleArtAdapter(roster) {
  const value = validateMercenaryBattleRoster(roster);
  const byCode = new Map(value.cards.map((card) => [normalizeCode(card), card]));

  return Object.freeze({
    resolveForConsumer(consumer, mercenary) {
      const normalizedConsumer = upper(consumer);
      if (!BATTLE_CONSUMERS.has(normalizedConsumer) || PROHIBITED_CONSUMERS.has(normalizedConsumer)) return null;
      const code = normalizeCode(mercenary);
      if (!code) return null;
      const card = byCode.get(code);
      if (!card) return null;
      return Object.freeze({
        code,
        name: clean(card.name),
        title: clean(card.title),
        role: clean(card.role),
        sourceArt: clean(card.sourceArt),
        battleSprite: clean(card.battleSprite),
        battleSpriteSha256: upper(card.battleSpriteSha256),
        spriteUrl: withContentVersion(card.battleSprite, card.battleSpriteSha256),
        footAnchor: Object.freeze({ x: 0.5, y: 1 })
      });
    },
    getRosterEntry(mercenary) {
      const code = normalizeCode(mercenary);
      return code ? byCode.get(code) || null : null;
    }
  });
}

export const MERCENARY_BATTLE_ART_CONTRACT = Object.freeze({
  battleConsumers: Object.freeze([...BATTLE_CONSUMERS]),
  prohibitedConsumers: Object.freeze([...PROHIBITED_CONSUMERS]),
  sourceArtField: 'sourceArt',
  battleArtField: 'battleSprite',
  rosterUrl: '/assets/ui/project-v/mercenaries/mercenary-system-roster-v1.json'
});
