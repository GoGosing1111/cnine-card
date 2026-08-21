(() => {
  'use strict';

  const root = typeof window !== 'undefined' ? window : globalThis;
  const MANIFEST_URL = '/assets/ui/project-v/fallback/manifest-v1.json?v=1-card-monster-split';
  const clean = value => String(value ?? '').trim();
  const upper = value => clean(value).toUpperCase();

  function assetUrl(path, sha256) {
    const raw = clean(path).replace(/\\/g, '/').replace(/^\.?\/?/, '/');
    const separator = raw.includes('?') ? '&' : '?';
    return `${raw}${separator}v=${upper(sha256).slice(0, 16)}`;
  }

  function validateManifest(value) {
    if (upper(value?.format) !== 'PROJECT_V_UNASSIGNED_BATTLE_FALLBACK_MANIFEST_V1') {
      throw new Error('미지정 전투 SD manifest 형식이 올바르지 않습니다.');
    }
    if (upper(value?.scope) !== 'BATTLE_ENGINE_ONLY') {
      throw new Error('미지정 SD는 BATTLE_ENGINE_ONLY여야 합니다.');
    }
    for (const kind of ['CARD', 'MONSTER']) {
      const entry = value?.fallbacks?.[kind];
      if (!clean(entry?.battleSprite) || !/^[A-F0-9]{64}$/i.test(clean(entry?.sha256))) {
        throw new Error(`${kind} 미지정 SD 계약이 불완전합니다.`);
      }
      if (entry?.qa?.technicalPass !== true) throw new Error(`${kind} 미지정 SD 기술 검수가 완료되지 않았습니다.`);
    }
    return value;
  }

  function createAdapter({ manifest = null, manifestUrl = MANIFEST_URL, fetchImpl = root.fetch?.bind(root), includeReview = false } = {}) {
    let manifestValue = manifest ? validateManifest(manifest) : null;
    let readyPromise = manifestValue ? Promise.resolve(manifestValue) : null;

    const ready = async () => {
      if (manifestValue) return manifestValue;
      if (!readyPromise) {
        if (typeof fetchImpl !== 'function') throw new Error('미지정 SD manifest fetch를 사용할 수 없습니다.');
        // V1785: ?v= 버전 키가 있으므로 재검증 강제(no-cache)는 불필요한 왕복이다.
        readyPromise = fetchImpl(manifestUrl, { cache: 'default', credentials: 'same-origin' })
          .then(response => {
            if (!response?.ok) throw new Error(`미지정 SD manifest HTTP ${response?.status || 0}`);
            return response.json();
          })
          .then(value => (manifestValue = validateManifest(value)));
      }
      return readyPromise;
    };

    const resolveForV3 = ({ kind = 'CARD', isBoss = false, team = 'ALLY', includeReview: allowReview = includeReview } = {}) => {
      if (!manifestValue) return null;
      const resolvedKind = isBoss || upper(kind) === 'BOSS' ? 'BOSS' : upper(kind) === 'MONSTER' ? 'MONSTER' : 'CARD';
      const sourceKind = resolvedKind === 'BOSS' ? upper(manifestValue.fallbacks.BOSS?.inherits || 'MONSTER') : resolvedKind;
      const entry = manifestValue.fallbacks[sourceKind];
      if (!entry) return null;
      if (!allowReview && entry.qa?.visualApproval !== true) return null;
      const scaleMultiplier = Number(manifestValue.fallbacks[resolvedKind]?.scaleMultiplier ?? entry.scaleMultiplier ?? 1);
      const primaryUrl = assetUrl(entry.battleSprite, entry.sha256);
      return Object.freeze({
        scope: 'BATTLE_ENGINE_ONLY',
        kind: `UNASSIGNED_${resolvedKind}_SD`,
        fallbackKind: resolvedKind,
        team: upper(team) === 'ENEMY' ? 'ENEMY' : 'ALLY',
        primaryUrl,
        pngFallbackUrl: primaryUrl,
        footAnchor: Object.freeze({ x: Number(entry.footAnchor?.[0] ?? 0.5), y: Number(entry.footAnchor?.[1] ?? 0.94) }),
        objectFit: 'contain',
        objectPosition: '50% 100%',
        scaleMultiplier,
        sha256: upper(entry.sha256),
        approved: entry.qa?.visualApproval === true,
        technicalPass: true
      });
    };

    const api = Object.freeze({ manifestUrl, ready, resolveForV3 });
    return api;
  }

  const singleton = Object.freeze({
    ...createAdapter(),
    createAdapter,
    constants: Object.freeze({ MANIFEST_URL })
  });
  root.ProjectVUnassignedBattleFallback = singleton;
})();
