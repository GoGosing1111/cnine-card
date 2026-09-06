(() => {
  'use strict';

  const root = typeof window !== 'undefined' ? window : globalThis;
  const MANIFEST_URLS = Object.freeze({
    FUR: '/assets/ui/project-v/characters/fur/manifest-v2.json?v=3-cheetah',
    PRESTIGE: '/assets/ui/project-v/characters/prestige/manifest-v1.json?v=2-full-roster',
    SUPERSTAR: '/assets/ui/project-v/characters/superstar/manifest-v1.json?v=3-haaland'
  });
  const PLAY_ENTRY_POINTS = Object.freeze(['playPveBattleV2Live', 'playPvpBattleV2Live', 'playSiegeBattleV2Live']);
  const clean = value => String(value ?? '').trim();
  const upper = value => clean(value).toUpperCase();
  const rarityOf = card => upper(card?.effectiveRarity ?? card?.effectiveGrade ?? card?.grade ?? card?.rarity);

  function assetUrl(path, sha256) {
    const raw = clean(path).replace(/\\/g, '/').replace(/^\.?\/?/, '/');
    const separator = raw.includes('?') ? '&' : '?';
    return `${raw}${separator}v=${upper(sha256).slice(0, 16)}`;
  }

  function rootAssetUrl(path) {
    const raw = clean(path).replace(/\\/g, '/');
    if (!raw) return '';
    if (/^(?:data:|blob:|https?:\/\/|\/)/i.test(raw)) return raw;
    return `/${raw.replace(/^(?:\.\.\/)+/, '').replace(/^\.\//, '')}`;
  }

  function validateManifest(value, expectedRarity) {
    if (upper(value?.format) !== 'PROJECT_V_TIER_BATTLE_SPRITE_MANIFEST_V1') throw new Error(`${expectedRarity} manifest 형식 오류`);
    if (upper(value?.scope) !== 'BATTLE_ENGINE_ONLY') throw new Error(`${expectedRarity} scope 오류`);
    if (upper(value?.rarity) !== expectedRarity) throw new Error(`${expectedRarity} rarity 오류`);
    const seen = new Set();
    for (const entry of Array.isArray(value?.characters) ? value.characters : []) {
      const id = upper(entry?.cardId);
      if (!/^CN-[A-F0-9]+$/.test(id) || seen.has(id)) throw new Error(`${expectedRarity} cardId 오류: ${id}`);
      if (!clean(entry?.battleSprite) || !/^[A-F0-9]{64}$/i.test(clean(entry?.sha256))) throw new Error(`${id} asset 계약 오류`);
      seen.add(id);
    }
    if (!seen.size) throw new Error(`${expectedRarity} roster가 비어 있습니다.`);
    return value;
  }

  function createAdapter({ manifests = null, fetchImpl = root.fetch?.bind(root), autoInstall = false } = {}) {
    let manifestValues = manifests || null;
    let readyPromise = manifestValues ? Promise.resolve(manifestValues) : null;
    let byId = new Map();

    const index = values => {
      byId = new Map();
      for (const rarity of Object.keys(MANIFEST_URLS)) {
        const manifest = validateManifest(values[rarity], rarity);
        for (const entry of manifest.characters) byId.set(upper(entry.cardId), { ...entry, rarity });
      }
    };
    if (manifestValues) index(manifestValues);

    const ready = async () => {
      if (manifestValues) return manifestValues;
      if (!readyPromise) {
        if (typeof fetchImpl !== 'function') throw new Error('고등급 전투 SD manifest fetch를 사용할 수 없습니다.');
        readyPromise = Promise.all(Object.entries(MANIFEST_URLS).map(async ([rarity, url]) => {
          // V1785: ?v= 버전 키가 있으므로 재검증 강제(no-cache)는 불필요한 왕복이다.
          const response = await fetchImpl(url, { cache: 'default', credentials: 'same-origin' });
          if (!response?.ok) throw new Error(`${rarity} manifest HTTP ${response?.status || 0}`);
          return [rarity, validateManifest(await response.json(), rarity)];
        })).then(rows => {
          manifestValues = Object.fromEntries(rows);
          index(manifestValues);
          return manifestValues;
        });
      }
      return readyPromise;
    };

    const resolveForV3 = card => {
      const entry = byId.get(upper(card?.cardId));
      if (!entry || rarityOf(card) !== entry.rarity) return null;
      const primaryUrl = assetUrl(entry.battleSprite, entry.sha256);
      return Object.freeze({
        scope: 'BATTLE_ENGINE_ONLY',
        kind: `${entry.rarity}_SD`,
        cardId: upper(entry.cardId),
        rarity: entry.rarity,
        title: clean(entry.title),
        member: clean(entry.member),
        primaryUrl,
        pngFallbackUrl: primaryUrl,
        sourceArtUrl: rootAssetUrl(entry.sourceArt),
        footAnchor: Object.freeze({ x: 0.5, y: 0.94 }),
        objectFit: 'contain',
        objectPosition: '50% 100%',
        scaleMultiplier: Math.min(2, Math.max(.5, Number(entry.scaleMultiplier) || 1)),
        sha256: upper(entry.sha256),
        approved: true
      });
    };

    const adaptBattlePayload = payload => {
      if (!payload?.battleV2?.teams) return payload;
      const clone = { ...payload, battleV2: { ...payload.battleV2, teams: { ...payload.battleV2.teams } } };
      for (const side of ['A', 'B']) {
        const team = payload.battleV2.teams?.[side];
        if (!team) continue;
        clone.battleV2.teams[side] = {
          ...team,
          cards: (Array.isArray(team.cards) ? team.cards : []).map(card => {
            if (card?.projectVBattleArt) return card;
            const art = resolveForV3(card);
            return art ? { ...card, originalCardArt: card.originalCardArt || card.sourceArt || card.imageUrl || card.image_url || card.image || art.sourceArtUrl, image: art.primaryUrl, imageBattle: art.primaryUrl, battleImage: art.primaryUrl, projectVBattleArt: art } : card;
          })
        };
      }
      return clone;
    };

    const installBattleHooks = (target = root) => {
      let installed = false;
      for (const name of PLAY_ENTRY_POINTS) {
        const original = target?.[name];
        if (typeof original !== 'function' || original.__projectVTierArtWrapped) continue;
        const wrapped = async function projectVTierBattleWrapper(options = {}) {
          try { await ready(); }
          catch (error) {
            console.warn('[Project V tier art] manifest unavailable; existing card art preserved.', error);
            return original.call(this, options);
          }
          const next = options?.data ? { ...options, data: adaptBattlePayload(options.data) } : options;
          return original.call(this, next);
        };
        Object.defineProperty(wrapped, '__projectVTierArtWrapped', { value: true });
        target[name] = wrapped;
        installed = true;
      }
      return installed;
    };

    const api = Object.freeze({ ready, resolveForV3, adaptBattlePayload, installBattleHooks, getMappedCardIds: () => Object.freeze([...byId.keys()]) });
    if (autoInstall) installBattleHooks(root);
    return api;
  }

  const singleton = Object.freeze({ ...createAdapter(), createAdapter, constants: Object.freeze({ MANIFEST_URLS, PLAY_ENTRY_POINTS }) });
  root.ProjectVTierBattleArt = singleton;
  const install = () => singleton.installBattleHooks(root);
  install();
  root.setTimeout?.(install, 0);
  root.document?.addEventListener?.('DOMContentLoaded', install, { once: true });
})();
