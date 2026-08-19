(() => {
  'use strict';

  const globalScope = typeof window !== 'undefined' ? window : globalThis;
  const MANIFEST_URL = '/assets/ui/project-v/characters/zenith/manifest-v1.json?v=1-battle-adapter';
  const BATTLE_CONSUMERS = new Set(['BATTLE', 'BATTLE_ENGINE', 'PVE_BATTLE', 'PVP_BATTLE', 'SIEGE_BATTLE']);
  const PROHIBITED_CONSUMERS = new Set(['DEX', 'DECK', 'CARD_PACK', 'INVENTORY', 'CARD_DETAIL']);
  const EMPTY_PIXEL = 'data:image/gif;base64,R0lGODlhAQABAAD/ACwAAAAAAQABAAACADs=';
  const PLAY_ENTRY_POINTS = Object.freeze([
    'playPveBattleV2Live',
    'playPvpBattleV2Live',
    'playSiegeBattleV2Live'
  ]);

  const clean = value => String(value ?? '').trim();
  const upper = value => clean(value).toUpperCase();
  const cardIdentity = card => upper(card?.cardId);
  const effectiveRarity = card => upper(
    card?.effectiveRarity ?? card?.effectiveGrade ?? card?.grade ?? card?.rarity
  );

  function rootAssetUrl(value) {
    const raw = clean(value).replace(/\\/g, '/');
    if (!raw) return '';
    if (/^(?:data:|blob:|https?:\/\/)/i.test(raw)) return raw;
    const withoutDots = raw.replace(/^(?:\.\.\/)+/, '').replace(/^\.\//, '').replace(/^\/+/, '');
    return `/${withoutDots}`;
  }

  function withContentVersion(path, sha256) {
    const url = rootAssetUrl(path);
    if (!url || /^(?:data:|blob:)/i.test(url)) return url;
    const separator = url.includes('?') ? '&' : '?';
    return `${url}${separator}v=${upper(sha256).slice(0, 16)}`;
  }

  function sameAssetKey(value, locationRef = globalScope.location) {
    const raw = clean(value);
    if (!raw) return '';
    try {
      const base = locationRef?.href || 'https://soopketmon.invalid/';
      const url = new URL(raw, base);
      return `${url.pathname}${url.search}`;
    } catch {
      return raw;
    }
  }

  function responsiveRows(entry, format) {
    return (Array.isArray(entry?.responsive?.[format]) ? entry.responsive[format] : [])
      .map(row => ({
        path: clean(row?.path),
        width: Math.max(0, Number(row?.width || 0)),
        height: Math.max(0, Number(row?.height || 0))
      }))
      .filter(row => row.path && row.width > 0)
      .sort((a, b) => a.width - b.width);
  }

  function chooseResponsive(rows, requiredWidth) {
    if (!rows.length) return null;
    return rows.find(row => row.width >= requiredWidth) || rows[rows.length - 1];
  }

  function validateManifest(manifest) {
    if (!manifest || typeof manifest !== 'object') throw new Error('ZENITH battle manifest가 없습니다.');
    if (Number(manifest.schemaVersion) !== 2) throw new Error('ZENITH battle manifest schemaVersion이 올바르지 않습니다.');
    if (upper(manifest.scope) !== 'BATTLE_ENGINE_ONLY') throw new Error('ZENITH SD는 BATTLE_ENGINE_ONLY여야 합니다.');
    if (upper(manifest.rarity) !== 'ZENITH') throw new Error('ZENITH manifest rarity가 올바르지 않습니다.');
    if (manifest.routingContract?.battleEngineOnly !== true) throw new Error('battleEngineOnly 계약이 누락됐습니다.');
    if (clean(manifest.routingContract?.battleArtField) !== 'battleSprite') throw new Error('battleSprite 계약이 누락됐습니다.');
    const prohibited = new Set((manifest.routingContract?.prohibitedConsumers || []).map(upper));
    for (const consumer of PROHIBITED_CONSUMERS) {
      if (!prohibited.has(consumer)) throw new Error(`${consumer} 누출 차단 계약이 누락됐습니다.`);
    }
    const characters = Array.isArray(manifest.characters) ? manifest.characters : [];
    const expected = Number(manifest.rosterSnapshot?.expectedCount || 0);
    if (!expected || characters.length !== expected) throw new Error(`ZENITH roster는 ${expected || '고정'}명이어야 합니다.`);
    const seen = new Set();
    for (const entry of characters) {
      const id = upper(entry?.cardId);
      if (!/^CN-[A-F0-9]{16}$/.test(id) || seen.has(id)) throw new Error(`ZENITH cardId가 올바르지 않습니다: ${id}`);
      if (!clean(entry?.battleSprite)) throw new Error(`${id} battleSprite가 없습니다.`);
      const anchor = entry?.placement?.footAnchor;
      if (!Array.isArray(anchor) || anchor.length !== 2 || anchor.some(value => !Number.isFinite(Number(value)))) {
        throw new Error(`${id} footAnchor가 올바르지 않습니다.`);
      }
      if (!responsiveRows(entry, 'avif').length || !responsiveRows(entry, 'webp').length) {
        throw new Error(`${id} AVIF/WebP responsive 리소스가 없습니다.`);
      }
      seen.add(id);
    }
    return manifest;
  }

  function createVisibilityController(element, {
    documentRef = globalScope.document,
    IntersectionObserverRef = globalScope.IntersectionObserver,
    onPauseChange
  } = {}) {
    if (!element || !documentRef?.addEventListener) {
      return Object.freeze({ paused: false, refresh() {}, waitUntilRunning: async () => {}, destroy() {} });
    }
    let intersecting = true;
    let pageHidden = Boolean(documentRef.hidden);
    let paused = false;
    let destroyed = false;
    const waiters = new Set();
    const savedMedia = new WeakSet();

    const syncMedia = nextPaused => {
      const media = typeof element.querySelectorAll === 'function' ? element.querySelectorAll('video,audio') : [];
      for (const node of media) {
        if (nextPaused) {
          if (!node.paused) savedMedia.add(node);
          node.pause?.();
        } else if (savedMedia.has(node)) {
          savedMedia.delete(node);
          const promise = node.play?.();
          promise?.catch?.(() => {});
        }
      }
    };
    const apply = () => {
      if (destroyed) return;
      const connected = element.isConnected !== false;
      const next = pageHidden || !intersecting || !connected;
      if (next === paused) return;
      paused = next;
      element.dataset && (element.dataset.projectVBattlePaused = String(paused));
      element.classList?.toggle?.('project-v-battle-paused', paused);
      element.style?.setProperty?.('--project-v-battle-play-state', paused ? 'paused' : 'running');
      syncMedia(paused);
      if (!paused) {
        for (const resolve of waiters) resolve();
        waiters.clear();
      }
      onPauseChange?.(paused);
      try {
        element.dispatchEvent?.(new CustomEvent('project-v-battle-visibility', { detail: { paused } }));
      } catch {}
    };
    const onVisibility = () => { pageHidden = Boolean(documentRef.hidden); apply(); };
    const onPageHide = () => { pageHidden = true; apply(); };
    const onPageShow = () => { pageHidden = Boolean(documentRef.hidden); apply(); };
    documentRef.addEventListener('visibilitychange', onVisibility, { passive: true });
    globalScope.addEventListener?.('pagehide', onPageHide, { passive: true });
    globalScope.addEventListener?.('pageshow', onPageShow, { passive: true });
    const observer = typeof IntersectionObserverRef === 'function'
      ? new IntersectionObserverRef(entries => {
          const current = entries.find(entry => entry.target === element) || entries[0];
          intersecting = current ? Boolean(current.isIntersecting && current.intersectionRatio > 0) : true;
          apply();
        }, { threshold: [0, 0.01] })
      : null;
    observer?.observe?.(element);
    apply();

    return {
      get paused() { return paused; },
      refresh: apply,
      waitUntilRunning() {
        if (!paused) return Promise.resolve();
        return new Promise(resolve => waiters.add(resolve));
      },
      destroy() {
        if (destroyed) return;
        destroyed = true;
        observer?.disconnect?.();
        documentRef.removeEventListener('visibilitychange', onVisibility);
        globalScope.removeEventListener?.('pagehide', onPageHide);
        globalScope.removeEventListener?.('pageshow', onPageShow);
        for (const resolve of waiters) resolve();
        waiters.clear();
      }
    };
  }

  function ensureVisibilityPauseStyle(documentRef = globalScope.document) {
    if (!documentRef?.createElement || documentRef.getElementById?.('projectVBattleVisibilityPauseStyle')) return;
    const style = documentRef.createElement('style');
    style.id = 'projectVBattleVisibilityPauseStyle';
    style.textContent = `
      [data-project-v-battle-paused="true"] *,
      .project-v-battle-paused * {
        animation-play-state: paused !important;
      }
    `;
    (documentRef.head || documentRef.documentElement)?.appendChild?.(style);
  }

  function createAdapter({
    manifest = null,
    manifestUrl = MANIFEST_URL,
    fetchImpl = globalScope.fetch?.bind(globalScope),
    dprProvider = () => Math.max(1, Number(globalScope.devicePixelRatio || 1)),
    autoInstall = false
  } = {}) {
    let manifestValue = manifest ? validateManifest(manifest) : null;
    let readyPromise = manifestValue ? Promise.resolve(manifestValue) : null;
    let byCardId = manifestValue ? new Map(manifestValue.characters.map(entry => [upper(entry.cardId), entry])) : new Map();
    const fallbackChains = new Map();

    const ready = async () => {
      if (manifestValue) return manifestValue;
      if (!readyPromise) {
        if (typeof fetchImpl !== 'function') throw new Error('ZENITH manifest fetch를 사용할 수 없습니다.');
        readyPromise = fetchImpl(manifestUrl, { cache: 'no-cache', credentials: 'same-origin' })
          .then(response => {
            if (!response?.ok) throw new Error(`ZENITH manifest HTTP ${response?.status || 0}`);
            return response.json();
          })
          .then(value => {
            manifestValue = validateManifest(value);
            byCardId = new Map(manifestValue.characters.map(entry => [upper(entry.cardId), entry]));
            return manifestValue;
          });
      }
      return readyPromise;
    };

    const resolveForConsumer = (consumer, card, {
      targetCssWidth = 190,
      dpr = dprProvider()
    } = {}) => {
      const normalizedConsumer = upper(consumer);
      if (!BATTLE_CONSUMERS.has(normalizedConsumer) || PROHIBITED_CONSUMERS.has(normalizedConsumer)) return null;
      if (effectiveRarity(card) !== 'ZENITH') return null;
      const id = cardIdentity(card);
      if (!id) return null;
      const entry = byCardId.get(id);
      if (!entry) return null;
      const requiredWidth = Math.max(1, Math.ceil(Number(targetCssWidth || 190) * Math.max(1, Number(dpr || 1))));
      const avif = chooseResponsive(responsiveRows(entry, 'avif'), requiredWidth);
      const webp = chooseResponsive(responsiveRows(entry, 'webp'), requiredWidth);
      const footAnchor = Object.freeze({
        x: Number(entry.placement.footAnchor[0]),
        y: Number(entry.placement.footAnchor[1])
      });
      const candidates = [
        avif && { type: 'image/avif', width: avif.width, height: avif.height, url: withContentVersion(avif.path, entry.sha256) },
        webp && { type: 'image/webp', width: webp.width, height: webp.height, url: withContentVersion(webp.path, entry.sha256) },
        { type: 'image/png', width: Number(entry.canvas?.width || 0), height: Number(entry.canvas?.height || 0), url: withContentVersion(entry.battleSprite, entry.sha256) }
      ].filter(Boolean);
      const result = Object.freeze({
        scope: 'BATTLE_ENGINE_ONLY',
        cardId: id,
        effectiveRarity: 'ZENITH',
        candidates: Object.freeze(candidates.map(candidate => Object.freeze(candidate))),
        primaryUrl: candidates[0].url,
        pngFallbackUrl: candidates[candidates.length - 1].url,
        sourceArtUrl: rootAssetUrl(entry.sourceArt),
        footAnchor,
        safeMarginPx: Number(entry.placement.safeMarginPx || entry.qa?.safeMarginPx || 0),
        canvas: Object.freeze({ width: Number(entry.canvas?.width || 0), height: Number(entry.canvas?.height || 0) })
      });
      for (let index = 0; index < candidates.length; index++) {
        const key = sameAssetKey(candidates[index].url);
        fallbackChains.set(key, { result, index });
      }
      return result;
    };

    const resolveForBattle = (card, options) => resolveForConsumer('BATTLE_ENGINE', card, options);

    const applyMetadata = (image, result) => {
      if (!image || !result) return false;
      image.classList?.add?.('project-v-zenith-battle-sprite');
      if (image.dataset) {
        image.dataset.projectVBattleArt = 'ZENITH';
        image.dataset.projectVCardId = result.cardId;
        image.dataset.projectVFootAnchor = `${result.footAnchor.x},${result.footAnchor.y}`;
      }
      if (image.style) {
        image.style.objectFit = 'contain';
        image.style.objectPosition = '50% 100%';
        image.style.transformOrigin = `${result.footAnchor.x * 100}% ${result.footAnchor.y * 100}%`;
        image.style.setProperty?.('--project-v-foot-x', String(result.footAnchor.x));
        image.style.setProperty?.('--project-v-foot-y', String(result.footAnchor.y));
      }
      image.loading ||= 'eager';
      image.decoding ||= 'async';
      return true;
    };

    const tryNextCandidate = image => {
      const key = sameAssetKey(image?.currentSrc || image?.src);
      const state = fallbackChains.get(key);
      if (!image || !state) return false;
      const nextIndex = state.index + 1;
      const next = state.result.candidates[nextIndex];
      if (!next) {
        image.dataset && (image.dataset.projectVBattleArtError = '1');
        image.src = EMPTY_PIXEL;
        return true;
      }
      applyMetadata(image, state.result);
      image.dataset && (image.dataset.projectVBattleFallbackIndex = String(nextIndex));
      image.src = next.url;
      return true;
    };

    const hydrateImage = (image, card, options) => {
      const result = resolveForBattle(card, options);
      if (!result || !image) return null;
      applyMetadata(image, result);
      image.src = result.primaryUrl;
      return result;
    };

    const adaptBattlePayload = (payload, options = {}) => {
      if (!payload?.battleV2?.teams) return payload;
      const clone = { ...payload, battleV2: { ...payload.battleV2, teams: { ...payload.battleV2.teams } } };
      for (const side of ['A', 'B']) {
        const team = payload.battleV2.teams?.[side];
        if (!team) continue;
        const cards = (Array.isArray(team.cards) ? team.cards : []).map(card => {
          const art = resolveForBattle(card, options);
          if (!art) return card;
          return {
            ...card,
            originalCardArt: card.originalCardArt || card.sourceArt || card.imageUrl || card.image_url || card.image || art.sourceArtUrl,
            image: art.primaryUrl,
            imageBattle: art.primaryUrl,
            battleImage: art.primaryUrl,
            projectVBattleArt: art
          };
        });
        clone.battleV2.teams[side] = { ...team, cards };
      }
      return clone;
    };

    const scanBattleImages = root => {
      if (!root?.querySelectorAll) return;
      for (const image of root.querySelectorAll('img')) {
        const state = fallbackChains.get(sameAssetKey(image.currentSrc || image.src));
        if (state) applyMetadata(image, state.result);
      }
    };

    const observeBattleImages = root => {
      scanBattleImages(root);
      if (!root || typeof globalScope.MutationObserver !== 'function') return { disconnect() {} };
      const observer = new globalScope.MutationObserver(() => scanBattleImages(root));
      observer.observe(root, { childList: true, subtree: true, attributes: true, attributeFilter: ['src'] });
      return observer;
    };

    const installBattleHooks = (target = globalScope) => {
      if (!target) return false;
      ensureVisibilityPauseStyle(target.document || globalScope.document);
      let installed = false;
      if (!target.battleV2ImageFallback?.__projectVZenithBattleWrapped) {
        const previousFallback = target.battleV2ImageFallback;
        const fallback = image => {
          if (tryNextCandidate(image)) return;
          if (typeof previousFallback === 'function') return previousFallback(image);
          if (image) image.src = '/assets/ui/cninelogo.png';
        };
        Object.defineProperty(fallback, '__projectVZenithBattleWrapped', { value: true });
        target.battleV2ImageFallback = fallback;
      }
      for (const name of PLAY_ENTRY_POINTS) {
        const original = target[name];
        if (typeof original !== 'function' || original.__projectVZenithBattleWrapped) continue;
        const wrapped = async function wrappedProjectVBattle(options = {}) {
          try { await ready(); }
          catch (error) { console.warn('[Project V battle art] manifest unavailable; existing battle art preserved.', error); }
          const adapted = manifestValue && options?.data
            ? { ...options, data: adaptBattlePayload(options.data, { targetCssWidth: 210 }) }
            : options;
          const modal = adapted?.modal || adapted?.stage;
          modal?.__projectVBattleVisibility?.destroy?.();
          modal?.__projectVBattleImageObserver?.disconnect?.();
          if (modal) {
            modal.__projectVBattleVisibility = createVisibilityController(modal);
            modal.__projectVBattleImageObserver = observeBattleImages(modal);
          }
          return original.call(this, adapted);
        };
        Object.defineProperty(wrapped, '__projectVZenithBattleWrapped', { value: true });
        target[name] = wrapped;
        installed = true;
      }
      return installed;
    };

    const api = Object.freeze({
      manifestUrl,
      ready,
      resolveForConsumer,
      resolveForBattle,
      hydrateImage,
      tryNextCandidate,
      adaptBattlePayload,
      applyFootAnchor: applyMetadata,
      createVisibilityController,
      installBattleHooks,
      getMappedCardIds: () => Object.freeze([...byCardId.keys()])
    });
    if (autoInstall) installBattleHooks(globalScope);
    return api;
  }

  const singleton = Object.freeze({
    ...createAdapter(),
    createAdapter,
    constants: Object.freeze({ MANIFEST_URL, PLAY_ENTRY_POINTS, BATTLE_CONSUMERS, PROHIBITED_CONSUMERS })
  });
  globalScope.ProjectVBattleArt = singleton;

  const install = () => {
    singleton.installBattleHooks(globalScope);
    // Defer scripts preserve order, but the load retry keeps preview/embedded entry points safe.
    globalScope.setTimeout?.(() => singleton.installBattleHooks(globalScope), 0);
  };
  install();
  if (globalScope.document?.readyState === 'loading') {
    globalScope.document.addEventListener('DOMContentLoaded', install, { once: true });
  }
  // origin/main loads battle-v2-live lazily. Re-run the idempotent installer
  // whenever a deferred feature script finishes so the adapter also works when
  // it was present before the renderer entry points existed.
  globalScope.document?.addEventListener?.('load', event => {
    if (String(event?.target?.tagName || '').toUpperCase() === 'SCRIPT') install();
  }, true);
})();
