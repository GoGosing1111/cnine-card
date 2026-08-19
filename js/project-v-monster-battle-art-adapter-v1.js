(() => {
  'use strict';

  const root = typeof window !== 'undefined' ? window : globalThis;
  const MANIFEST_URL = '/assets/ui/project-v/monsters/hunt-tower/manifest-v1.json?v=4-live-roster';
  const PLAY_ENTRY_POINTS = Object.freeze([
    'playPveBattleV2Live',
    'playTowerBattleV2Live',
    'playSiegeBattleV2Live'
  ]);
  const clean = value => String(value ?? '').trim();
  const upper = value => clean(value).toUpperCase();

  function assetUrl(path, sha256) {
    const raw = clean(path).replace(/\\/g, '/').replace(/^\.?\/?/, '/');
    if (!raw) return '';
    const separator = raw.includes('?') ? '&' : '?';
    return `${raw}${separator}v=${upper(sha256).slice(0, 16)}`;
  }

  function monsterId(value) {
    const candidates = [value?.monsterId, value?.id, value?.monster?.id, value?.floor?.monsterId, value?.cardId];
    for (const candidate of candidates) {
      const match = clean(candidate).match(/(?:MONSTER:)?(\d+)$/i);
      if (match) return Number(match[1]);
    }
    return 0;
  }

  function validateManifest(value) {
    if (upper(value?.format) !== 'PROJECT_V_MONSTER_BATTLE_SPRITE_MANIFEST_V1') {
      throw new Error('몬스터 전투 SD manifest 형식이 올바르지 않습니다.');
    }
    if (upper(value?.scope) !== 'BATTLE_ENGINE_ONLY') {
      throw new Error('몬스터 SD는 BATTLE_ENGINE_ONLY여야 합니다.');
    }
    const sprites = Array.isArray(value?.sprites) ? value.sprites : [];
    if (!sprites.length) throw new Error('몬스터 전투 SD roster가 비어 있습니다.');
    const seen = new Set();
    for (const entry of sprites) {
      const id = Number(entry?.monsterId || 0);
      if (!id || seen.has(id)) throw new Error(`중복되거나 잘못된 monsterId: ${id}`);
      if (!clean(entry?.battleSprite) || !/^[A-F0-9]{64}$/i.test(clean(entry?.sha256))) {
        throw new Error(`monsterId ${id}의 전투 자산 계약이 불완전합니다.`);
      }
      seen.add(id);
    }
    return value;
  }

  function createAdapter({
    manifest = null,
    manifestUrl = MANIFEST_URL,
    fetchImpl = root.fetch?.bind(root),
    includeReview = false,
    autoInstall = false
  } = {}) {
    let manifestValue = manifest ? validateManifest(manifest) : null;
    let readyPromise = manifestValue ? Promise.resolve(manifestValue) : null;
    let byId = new Map();

    const index = value => {
      byId = new Map();
      for (const entry of value.sprites) {
        byId.set(Number(entry.monsterId), entry);
        for (const alias of Array.isArray(entry.aliases) ? entry.aliases : []) {
          const id = Number(alias || 0);
          if (id && !byId.has(id)) byId.set(id, entry);
        }
      }
    };
    if (manifestValue) index(manifestValue);

    const ready = async () => {
      if (manifestValue) return manifestValue;
      if (!readyPromise) {
        if (typeof fetchImpl !== 'function') throw new Error('몬스터 manifest fetch를 사용할 수 없습니다.');
        readyPromise = fetchImpl(manifestUrl, { cache: 'no-cache', credentials: 'same-origin' })
          .then(response => {
            if (!response?.ok) throw new Error(`몬스터 manifest HTTP ${response?.status || 0}`);
            return response.json();
          })
          .then(value => {
            manifestValue = validateManifest(value);
            index(manifestValue);
            return manifestValue;
          });
      }
      return readyPromise;
    };

    const resolveForV3 = (monster, options = {}) => {
      const id = monsterId(monster);
      const entry = byId.get(id);
      if (!entry || entry.qa?.technicalPass !== true) return null;
      const allowReview = options.includeReview ?? includeReview;
      if (!allowReview && entry.qa?.visualApproval !== true) return null;
      const requestedMode = upper(options.mode || monster?.mode || '');
      const supportedModes = new Set([upper(entry.mode), ...(entry.modes || []).map(upper)].filter(Boolean));
      if (requestedMode && !supportedModes.has(requestedMode)) return null;
      const pngFallbackUrl = assetUrl(entry.battleSprite, entry.sha256);
      const primaryUrl = clean(entry.battleSpriteWebp)
        ? assetUrl(entry.battleSpriteWebp, entry.battleSpriteWebpSha256 || entry.sha256)
        : pngFallbackUrl;
      return Object.freeze({
        scope: 'BATTLE_ENGINE_ONLY',
        kind: 'MONSTER_SD',
        monsterId: Number(entry.monsterId),
        aliases: Object.freeze([...(entry.aliases || [])].map(Number)),
        name: clean(entry.name),
        mode: upper(entry.mode),
        floors: clean(entry.floors),
        isBoss: Boolean(entry.isBoss),
        primaryUrl,
        pngFallbackUrl,
        footAnchor: Object.freeze({ x: 0.5, y: 0.94 }),
        objectFit: 'contain',
        objectPosition: '50% 100%',
        sha256: upper(entry.sha256),
        approved: entry.qa?.visualApproval === true
      });
    };

    const applyMonster = (monster, options) => {
      const art = resolveForV3(monster, options);
      if (!art) return monster;
      return {
        ...monster,
        image: art.primaryUrl,
        imageBattle: art.primaryUrl,
        battleImage: art.primaryUrl,
        projectVMonsterArt: art
      };
    };

    const adaptBattlePayload = (payload, options = {}) => {
      if (!payload || typeof payload !== 'object') return payload;
      const clone = { ...payload };
      if (payload.monster) clone.monster = applyMonster(payload.monster, options);
      if (payload.floor) {
        const art = resolveForV3(payload.floor, { ...options, mode: options.mode || 'TOWER' });
        clone.floor = art
          ? { ...payload.floor, monsterImage: art.primaryUrl, projectVMonsterArt: art }
          : payload.floor;
      }
      if (payload.battleV2?.teams) {
        clone.battleV2 = { ...payload.battleV2, teams: { ...payload.battleV2.teams } };
        for (const side of ['A', 'B']) {
          const team = payload.battleV2.teams?.[side];
          if (!team) continue;
          const cards = (Array.isArray(team.cards) ? team.cards : []).map(card => {
            const isMonster = /^MONSTER:/i.test(clean(card?.cardId)) || upper(card?.grade) === 'MONSTER';
            return isMonster ? applyMonster(card, options) : card;
          });
          clone.battleV2.teams[side] = { ...team, cards };
        }
      }
      return clone;
    };

    const installBattleHooks = (target = root) => {
      let installed = false;
      for (const name of PLAY_ENTRY_POINTS) {
        const original = target?.[name];
        if (typeof original !== 'function' || original.__projectVMonsterArtWrapped) continue;
        const wrapped = async function projectVMonsterBattleWrapper(options = {}) {
          try { await ready(); }
          catch (error) {
            console.warn('[Project V monster art] manifest unavailable; existing monster art preserved.', error);
            return original.call(this, options);
          }
          const next = options?.data ? { ...options, data: adaptBattlePayload(options.data) } : options;
          return original.call(this, next);
        };
        Object.defineProperty(wrapped, '__projectVMonsterArtWrapped', { value: true });
        target[name] = wrapped;
        installed = true;
      }
      return installed;
    };

    const api = Object.freeze({
      manifestUrl,
      ready,
      resolveForV3,
      adaptBattlePayload,
      installBattleHooks,
      getMappedMonsterIds: () => Object.freeze([...byId.keys()].sort((a, b) => a - b))
    });
    if (autoInstall) installBattleHooks(root);
    return api;
  }

  const singleton = Object.freeze({
    ...createAdapter(),
    createAdapter,
    constants: Object.freeze({ MANIFEST_URL, PLAY_ENTRY_POINTS })
  });
  root.ProjectVMonsterBattleArt = singleton;

  const install = () => singleton.installBattleHooks(root);
  install();
  root.setTimeout?.(install, 0);
  root.document?.addEventListener?.('DOMContentLoaded', install, { once: true });
  root.document?.addEventListener?.('load', event => {
    if (String(event?.target?.tagName || '').toUpperCase() === 'SCRIPT') install();
  }, true);
})();
