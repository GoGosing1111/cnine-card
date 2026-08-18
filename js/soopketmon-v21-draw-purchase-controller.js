(function bootstrapSoopketmonV21DrawPurchase(factory) {
  const scope = typeof window !== 'undefined' ? window : globalThis;
  const api = factory(scope);
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (scope.document) api.install();
})(function createSoopketmonV21DrawPurchase(scope) {
  'use strict';

  const VERSION = '21.5.1';
  const MAX_TOTAL = 10000;
  const SERVER_BATCH = 100;
  const RETRY_LIMIT = 3;
  const LEDGER_SCHEMA = 1;
  const LEDGER_PREFIX = 'soopketmon:v21:draw-job:';
  const LEASE_PREFIX = 'soopketmon:v21:coin-spend-lease:';
  const TAB_ID_KEY = 'soopketmon:v21:draw-tab-id';
  // Active jobs renew this every 10s; a crashed tab releases users within 60s.
  // One mutation attempt times out at 45s, so an unload-time in-flight request
  // settles before the retained fallback lease can expire.
  const LEASE_TTL_MS = 60000;
  const LEASE_HEARTBEAT_MS = 10000;
  const AUTO_KEYS = {
    equipment: 'soopketmon:v21:equipment-auto-open',
    vehicle: 'soopketmon:v21:vehicle-auto-open'
  };
  const KINDS = {
    equipment: {
      section: '#equipmentSupplyShop',
      nativePurchase: '[data-supply-buy]',
      configPath: 'equipment/supply-box/config?fresh=1',
      purchasePath: 'equipment/supply-box/purchase',
      openPath: 'equipment/supply-box/open',
      noun: '장비 보급상자',
      action: '개방',
      accent: 'equipment'
    },
    vehicle: {
      section: '#vehicleDrawTicketShop',
      nativePurchase: '[data-vehicle-ticket-buy]',
      configPath: 'vehicle-draw/config',
      purchasePath: 'vehicle-draw/purchase',
      openPath: 'vehicle-draw/open',
      noun: '차량 뽑기권',
      action: '뽑기',
      accent: 'vehicle'
    }
  };

  let activeJob = null;
  let startingJob = false;
  let observer = null;
  let scheduledFrame = 0;
  let dockRenderFrame = 0;
  let pendingDockJob = null;
  let activeLease = null;
  let leaseHeartbeat = 0;
  let resumeStarted = false;
  let broadcastChannel = null;
  let localStateFlushTimer = 0;
  let pendingLocalStateJob = null;
  let lastLocalStateFlushAt = Date.now();
  const volatileStorage = new Map();

  function storageGet(storage, key) {
    try { return storage ? (storage.getItem(key) || '') : (volatileStorage.get(key) || ''); }
    catch (_) { return ''; }
  }

  function storageSet(storage, key, value) {
    try { if (storage) storage.setItem(key, value); else volatileStorage.set(key, value); return true; }
    catch (_) { return false; }
  }

  function storageRemove(storage, key) {
    try { if (storage) storage.removeItem(key); else volatileStorage.delete(key); }
    catch (_) {}
  }

  function currentUserKey() {
    const user = scope.loadUser?.() || {};
    const raw = user.serverUserId ?? user.id ?? user.userId ?? user.nickname ?? 'anonymous';
    return String(raw).trim().replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 80) || 'anonymous';
  }

  function tabId() {
    let value = storageGet(scope.sessionStorage, TAB_ID_KEY);
    if (!value) {
      value = requestId('tab', 0);
      storageSet(scope.sessionStorage, TAB_ID_KEY, value);
    }
    return value;
  }

  function ledgerKey(userKey = currentUserKey()) {
    return `${LEDGER_PREFIX}${userKey}`;
  }

  function leaseKey(userKey = currentUserKey()) {
    return `${LEASE_PREFIX}${userKey}`;
  }

  function safeAggregate(kind, input) {
    const base = createAggregate(kind);
    if (!input || typeof input !== 'object') return base;
    for (const key of ['equipment', 'equipmentDuplicates', 'vehiclesNew', 'vehiclesDuplicate', 'coins', 'shards', 'stars']) {
      base[key] = Math.max(0, Math.floor(Number(input[key]) || 0));
    }
    base.featured = (Array.isArray(input.featured) ? input.featured : []).slice(0, 24).map(item => ({
      type: String(item?.type || '').slice(0, 60),
      name: String(item?.name || '').slice(0, 120),
      rarity: String(item?.rarity || '').slice(0, 40)
    }));
    return base;
  }

  function jobRecord(job) {
    return {
      schema: LEDGER_SCHEMA,
      id: job.id,
      userKey: job.userKey,
      kind: job.kind,
      total: job.total,
      totalCost: job.totalCost,
      unitPrice: job.unitPrice,
      spent: job.spent || 0,
      auto: Boolean(job.auto),
      phase: job.phase,
      purchased: job.purchased,
      opened: job.opened,
      aggregate: safeAggregate(job.kind, job.aggregate),
      currentBatch: job.currentBatch ? { ...job.currentBatch } : null,
      stopAfterCurrentBatch: Boolean(job.stopAfterCurrentBatch),
      state: job.state || 'running',
      updatedAt: Date.now()
    };
  }

  function persistJob(job) {
    if (!job) return false;
    job.userKey ||= currentUserKey();
    job.ledgerKey ||= ledgerKey(job.userKey);
    const serialized = JSON.stringify(jobRecord(job));
    const localOk = storageSet(scope.localStorage, job.ledgerKey, serialized);
    const sessionOk = storageSet(scope.sessionStorage, job.ledgerKey, serialized);
    if (!localOk || !sessionOk) {
      const error = new Error('자동진행 복구 정보를 저장할 수 없어 서버 요청을 중단했습니다. 브라우저 저장공간을 확인해 주세요.');
      error.code = 'V21_DRAW_LEDGER_UNAVAILABLE';
      error.ambiguous = true;
      throw error;
    }
    return true;
  }

  function clearJobLedger(job) {
    const key = job?.ledgerKey || ledgerKey(job?.userKey);
    storageRemove(scope.localStorage, key);
    storageRemove(scope.sessionStorage, key);
  }

  function reviveJob(raw, expectedUserKey = currentUserKey()) {
    if (!raw || raw.schema !== LEDGER_SCHEMA || !KINDS[raw.kind]) throw new Error('저장된 작업 형식이 올바르지 않습니다.');
    const total = Number(raw.total), purchased = Number(raw.purchased), opened = Number(raw.opened);
    const unitPrice = Number(raw.unitPrice), spent = Number(raw.spent || 0);
    if (!Number.isInteger(total) || total < 1 || total > MAX_TOTAL || !Number.isInteger(purchased) || purchased < 0 || purchased > total || !Number.isInteger(opened) || opened < 0 || opened > purchased || !Number.isInteger(unitPrice) || unitPrice < 0 || !Number.isFinite(spent) || spent < 0) throw new Error('저장된 작업 수치가 올바르지 않습니다.');
    if (!['purchase', 'open'].includes(raw.phase)) throw new Error('저장된 작업 단계가 올바르지 않습니다.');
    const userKey = String(raw.userKey || '');
    if (userKey !== expectedUserKey) throw new Error('다른 계정의 자동진행 정보입니다.');
    let currentBatch = null;
    if (raw.currentBatch) {
      const count = Number(raw.currentBatch.count);
      if (!['purchase', 'open'].includes(raw.currentBatch.phase) || !Number.isInteger(count) || count < 1 || count > SERVER_BATCH || !String(raw.currentBatch.requestId || '').trim()) throw new Error('저장된 서버 배치 정보가 올바르지 않습니다.');
      currentBatch = {
        phase: raw.currentBatch.phase,
        count,
        requestId: String(raw.currentBatch.requestId).slice(0, 120),
        index: Math.max(0, Math.floor(Number(raw.currentBatch.index) || 0)),
        attempted: Boolean(raw.currentBatch.attempted)
      };
    }
    return {
      id: String(raw.id || '').slice(0, 120) || requestId(raw.kind, 'recovered'),
      userKey,
      ledgerKey: ledgerKey(userKey),
      kind: raw.kind,
      definition: KINDS[raw.kind],
      total,
      totalCost: Number(raw.totalCost) || unitPrice * total,
      unitPrice,
      spent,
      auto: Boolean(raw.auto),
      phase: raw.phase,
      purchased,
      opened,
      aggregate: safeAggregate(raw.kind, raw.aggregate),
      currentBatch,
      state: String(raw.state || 'running'),
      retrying: 0,
      paused: false,
      stopRequested: false,
      stopAfterCurrentBatch: Boolean(raw.stopAfterCurrentBatch),
      resumed: true
    };
  }

  function readStoredJob() {
    const userKey = currentUserKey(), key = ledgerKey(userKey);
    // localStorage is authoritative so a closed/crashed tab cannot lose the
    // in-flight requestId. sessionStorage mirrors it for same-tab reload speed.
    const serialized = storageGet(scope.localStorage, key) || storageGet(scope.sessionStorage, key);
    if (!serialized) return { job: null, invalid: false, key };
    try { return { job: reviveJob(JSON.parse(serialized), userKey), invalid: false, key }; }
    catch (error) { return { job: null, invalid: true, key, error }; }
  }

  function parseLease(value) {
    try {
      const lease = JSON.parse(value || 'null');
      return lease && typeof lease === 'object' ? lease : null;
    } catch (_) { return null; }
  }

  function readLease(userKey) {
    return parseLease(storageGet(scope.localStorage, leaseKey(userKey)));
  }

  function claimLease(userKey, jobId) {
    const key = leaseKey(userKey), now = Date.now(), owner = tabId(), existing = readLease(userKey);
    if (existing && existing.owner !== owner && Number(existing.expiresAt || 0) > now) return false;
    const lease = { owner, jobId, userKey, updatedAt: now, expiresAt: now + LEASE_TTL_MS };
    if (!storageSet(scope.localStorage, key, JSON.stringify(lease))) {
      if (scope.navigator?.locks?.request) {
        activeLease = { ...lease, key, volatile: true };
        return true;
      }
      return false;
    }
    const confirmed = readLease(userKey);
    if (!confirmed || confirmed.owner !== owner || confirmed.jobId !== jobId) return false;
    activeLease = { ...lease, key };
    return true;
  }

  function renewLease() {
    if (!activeLease) return false;
    if (activeLease.volatile) {
      activeLease.updatedAt = Date.now();
      activeLease.expiresAt = activeLease.updatedAt + LEASE_TTL_MS;
      return true;
    }
    const current = readLease(activeLease.userKey);
    if (!current || current.owner !== activeLease.owner || current.jobId !== activeLease.jobId) return false;
    const now = Date.now(), next = { ...current, updatedAt: now, expiresAt: now + LEASE_TTL_MS };
    storageSet(scope.localStorage, activeLease.key, JSON.stringify(next));
    const confirmed = readLease(activeLease.userKey);
    if (!confirmed || confirmed.owner !== activeLease.owner || confirmed.jobId !== activeLease.jobId) return false;
    activeLease = { ...next, key: activeLease.key };
    return true;
  }

  function releaseLease(expectedJobId = '') {
    if (!activeLease || (expectedJobId && activeLease.jobId !== expectedJobId)) return;
    if (leaseHeartbeat) scope.clearInterval(leaseHeartbeat);
    leaseHeartbeat = 0;
    if (!activeLease.volatile) {
      const current = readLease(activeLease.userKey);
      if (current?.owner === activeLease.owner && current?.jobId === activeLease.jobId) storageRemove(scope.localStorage, activeLease.key);
    }
    activeLease = null;
  }

  function startLeaseHeartbeat() {
    if (leaseHeartbeat) scope.clearInterval(leaseHeartbeat);
    leaseHeartbeat = scope.setInterval(() => {
      if (!renewLease() && activeJob) {
        activeJob.lockLost = true;
        persistJob(activeJob);
        renderJobDock(activeJob);
      }
    }, LEASE_HEARTBEAT_MS);
  }

  function lockLostError() {
    const error = new Error('다른 탭이 구매 잠금을 획득했습니다. 현재 배치의 반영 여부를 같은 요청 ID로 확인해야 합니다.');
    error.code = 'V21_DRAW_LOCK_LOST';
    error.ambiguous = true;
    return error;
  }

  function assertLeaseOwned(job) {
    if (!activeLease || activeLease.jobId !== job.id || activeLease.userKey !== job.userKey || job.lockLost || !renewLease()) throw lockLostError();
  }

  function getBroadcastChannel() {
    if (broadcastChannel || typeof scope.BroadcastChannel !== 'function') return broadcastChannel;
    broadcastChannel = new scope.BroadcastChannel('soopketmon:v21:draw-coordination');
    broadcastChannel.addEventListener('message', event => {
      if (event?.data?.type === 'focus-owner' && activeLease?.userKey === event.data.userKey) scope.focus?.();
    });
    return broadcastChannel;
  }

  function notifyLockBlocked(userKey) {
    const lease = readLease(userKey);
    const message = '다른 탭에서 코인을 사용하는 구매가 진행 중입니다. 해당 탭의 작업이 끝난 뒤 다시 시도해 주세요.';
    if (typeof scope.confirm === 'function' && scope.confirm(`${message}\n진행 중인 탭으로 전환 요청을 보낼까요?`)) getBroadcastChannel()?.postMessage({ type: 'focus-owner', userKey, owner: lease?.owner || '' });
    const error = new Error(message);
    error.code = 'V21_DRAW_LOCKED';
    return error;
  }

  async function withSpendLock(userKey, jobId, task) {
    const execute = async (nativeLockHeld = false) => {
      if (!claimLease(userKey, jobId)) return { acquired: false };
      // localStorage has no atomic compare-and-swap. In legacy browsers without
      // Web Locks, give concurrent claimants one short election window, then
      // re-read the winning owner before any config or mutation request.
      if (!nativeLockHeld) {
        await sleep(50);
        const confirmed = readLease(userKey);
        if (!confirmed || confirmed.owner !== tabId() || confirmed.jobId !== jobId) {
          releaseLease(jobId);
          return { acquired: false };
        }
      }
      startLeaseHeartbeat();
      try { return { acquired: true, value: await task() }; }
      finally { releaseLease(jobId); }
    };
    if (scope.navigator?.locks?.request) {
      return scope.navigator.locks.request(`soopketmon-v21-coin-spend:${userKey}`, { mode: 'exclusive', ifAvailable: true }, lock => lock ? execute(true) : { acquired: false });
    }
    return execute();
  }

  function normalizeTotal(value) {
    const number = Math.floor(Number(value));
    if (!Number.isFinite(number)) return 1;
    return Math.max(1, Math.min(MAX_TOTAL, number));
  }

  function createBatchPlan(value, batchSize = SERVER_BATCH) {
    let remaining = normalizeTotal(value);
    const safeBatch = Math.max(1, Math.min(SERVER_BATCH, Math.floor(Number(batchSize) || SERVER_BATCH)));
    const batches = [];
    while (remaining > 0) {
      const count = Math.min(safeBatch, remaining);
      batches.push(count);
      remaining -= count;
    }
    return batches;
  }

  function escapeHtml(value) {
    return String(value ?? '').replace(/[&<>'"]/g, character => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;'
    })[character]);
  }

  function formatNumber(value) {
    return Math.max(0, Number(value) || 0).toLocaleString('ko-KR');
  }

  function requestId(prefix, index) {
    const id = scope.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    return `v21-${prefix}-${index}-${id}`.slice(0, 118);
  }

  function readAuto(kind) {
    try { return scope.sessionStorage?.getItem(AUTO_KEYS[kind]) === '1'; }
    catch (_) { return false; }
  }

  function writeAuto(kind, enabled) {
    try { scope.sessionStorage?.setItem(AUTO_KEYS[kind], enabled ? '1' : '0'); }
    catch (_) {}
  }

  function styleHref() {
    const script = scope.document?.currentScript;
    if (script?.src) return new URL('../css/soopketmon-v21-draw-purchase.css', script.src).href;
    return 'css/soopketmon-v21-draw-purchase.css';
  }

  function ensureStyle() {
    const document = scope.document;
    if (!document || document.getElementById('soopketmonV21DrawPurchaseStyle')) return;
    const link = document.createElement('link');
    link.id = 'soopketmonV21DrawPurchaseStyle';
    link.rel = 'stylesheet';
    link.href = `${styleHref()}?v=${VERSION}`;
    document.head.append(link);
  }

  function sleep(milliseconds) {
    return new Promise(resolve => scope.setTimeout(resolve, Math.max(0, Number(milliseconds) || 0)));
  }

  function stoppedError() {
    const error = new Error('사용자가 자동진행을 중단했습니다.');
    error.code = 'V21_DRAW_STOPPED';
    return error;
  }

  function isPendingConflict(error) {
    const message = String(error?.message || error?.error || '');
    const code = String(error?.code || error?.data?.code || error?.response?.code || '');
    return Number(error?.status) === 409 && (code === 'PENDING_RECOVERY_REQUIRED' || (/처리\s*중|같은\s*(?:구매|개방|차량|요청)|복구\s*확인/.test(message) && !/부족/.test(message)));
  }

  function isRetryable(error) {
    const status = Number(error?.status || 0);
    if (error?.timeout || error?.name === 'AbortError') return true;
    if (!status) return true;
    if (status === 408 || status === 425 || status === 429 || status >= 500) return true;
    return isPendingConflict(error);
  }

  function visibilityLabel(job) {
    if (!job) return '';
    if (scope.document?.hidden) return '화면 복귀 시 안전하게 계속합니다.';
    if (job.retrying) return `서버 처리 확인 중 · ${job.retrying}/${RETRY_LIMIT}`;
    if (job.phase === 'open') return `${job.definition.noun} 자동 ${job.definition.action} 중`;
    return `${job.definition.noun} 구매 중`;
  }

  function waitUntilVisible(job) {
    const document = scope.document;
    if (!document?.hidden) return Promise.resolve();
    job.paused = true;
    renderJobDock(job);
    return new Promise((resolve, reject) => {
      const check = () => {
        if (job.stopRequested && !job.currentBatch?.attempted) {
          cleanup();
          reject(stoppedError());
        } else if (!document.hidden) {
          job.paused = false;
          cleanup();
          resolve();
        }
      };
      const cleanup = () => {
        document.removeEventListener('visibilitychange', check);
        scope.clearInterval(timer);
      };
      const timer = scope.setInterval(check, 250);
      document.addEventListener('visibilitychange', check);
      check();
    });
  }

  async function requestWithRetry(job, path, count, stableRequestId) {
    let lastError = null;
    for (let attempt = 0; attempt < RETRY_LIMIT; attempt += 1) {
      if (job.stopRequested && !job.currentBatch?.attempted) throw stoppedError();
      await waitUntilVisible(job);
      assertLeaseOwned(job);
      try {
        job.retrying = attempt;
        renderJobDock(job);
        const body = { count, requestId: stableRequestId };
        if (job.kind === 'equipment' && path === job.definition.purchasePath) body.expectedUnitPrice = job.unitPrice;
        if (job.currentBatch && !job.currentBatch.attempted) {
          job.currentBatch.attempted = true;
          persistJob(job);
        }
        return await scope.apiRequest(path, {
          method: 'POST',
          body: JSON.stringify(body)
        }, { timeoutMs: 45000 });
      } catch (error) {
        lastError = error;
        if (!isRetryable(error)) throw error;
        if (attempt >= RETRY_LIMIT - 1) {
          error.ambiguous = true;
          throw error;
        }
        job.retrying = attempt + 1;
        renderJobDock(job);
        await sleep(Math.min(4000, 600 * (2 ** attempt)));
      }
    }
    throw lastError || new Error('요청을 완료하지 못했습니다.');
  }

  function createAggregate(kind) {
    return {
      kind,
      equipment: 0,
      equipmentDuplicates: 0,
      vehiclesNew: 0,
      vehiclesDuplicate: 0,
      coins: 0,
      shards: 0,
      stars: 0,
      featured: []
    };
  }

  function rememberFeatured(aggregate, entry) {
    if (!entry || aggregate.featured.length >= 24) return;
    aggregate.featured.push(entry);
  }

  function absorbOpenResult(aggregate, response) {
    if (aggregate.kind === 'equipment') {
      aggregate.coins += Number(response?.coinGained || 0);
      aggregate.shards += Number(response?.shardGained || 0);
      for (const result of Array.isArray(response?.results) ? response.results : []) {
        if (result?.type === 'EQUIPMENT') {
          aggregate.equipment += 1;
          rememberFeatured(aggregate, { type: '장비', name: result.item?.name, rarity: result.item?.rarity });
        } else if (result?.type === 'EQUIPMENT_DUPLICATE') {
          aggregate.equipmentDuplicates += 1;
          rememberFeatured(aggregate, { type: '중복 장비', name: result.item?.name, rarity: result.item?.rarity });
        }
      }
      return aggregate;
    }
    const rows = Array.isArray(response?.results) && response.results.length
      ? response.results
      : response?.vehicle ? [{
        vehicle: response.vehicle,
        duplicate: response.duplicate,
        shardsGained: response.shardsGained,
        masterStarsGained: response.masterStarsGained
      }] : [];
    for (const result of rows) {
      if (result?.duplicate) aggregate.vehiclesDuplicate += 1;
      else aggregate.vehiclesNew += 1;
      aggregate.shards += Number(result?.shardsGained || 0);
      aggregate.stars += Number(result?.masterStarsGained || 0);
      if (!result?.duplicate || result?.masterStarsGained) rememberFeatured(aggregate, {
        type: result?.duplicate ? '중복 차량' : '신규 차량',
        name: result?.vehicle?.name,
        rarity: result?.vehicle?.rarity
      });
    }
    return aggregate;
  }

  function configSnapshot(kind, config) {
    if (kind === 'equipment') return {
      enabled: config?.enabled !== false && config?.shopEnabled !== false,
      unitPrice: Math.max(0, Number(config?.shopPrice || 0)),
      owned: Math.max(0, Number(config?.balance || 0)),
      coin: Number(config?.coin)
    };
    return {
      enabled: config?.settings?.enabled !== false && config?.shop?.enabled !== false,
      unitPrice: Math.max(0, Number(config?.shop?.unitPrice || 5000)),
      owned: Math.max(0, Number(config?.ticketQuantity || 0)),
      coin: Number(config?.coin)
    };
  }

  function orderPlan(kind, total, unitPrice, auto) {
    const definition = KINDS[kind];
    return {
      kind,
      noun: definition?.noun || '상품',
      action: definition?.action || '개봉',
      total: normalizeTotal(total),
      totalCost: Math.max(0, Number(unitPrice) || 0) * normalizeTotal(total),
      purchaseBatches: createBatchPlan(total).length,
      openBatches: auto ? createBatchPlan(total).length : 0,
      auto: Boolean(auto)
    };
  }

  function confirmOrderPlan(plan) {
    const document = scope.document;
    if (!document?.body) {
      const message = `${plan.noun} ${formatNumber(plan.total)}개 / 총 ${formatNumber(plan.totalCost)} 코인 / 구매 ${formatNumber(plan.purchaseBatches)}회 배치${plan.auto ? ` / 자동 ${plan.action} ${formatNumber(plan.openBatches)}회 배치` : ''}`;
      return Promise.resolve(typeof scope.confirm === 'function' ? scope.confirm(message) : true);
    }
    document.getElementById('v21DrawOrderConfirm')?.remove();
    return new Promise(resolve => {
      const overlay = document.createElement('div');
      overlay.id = 'v21DrawOrderConfirm';
      overlay.className = 'v21-draw-confirm-overlay';
      overlay.innerHTML = `<section class="v21-draw-confirm-panel" role="alertdialog" aria-modal="true" aria-labelledby="v21DrawConfirmTitle" data-kind="${plan.kind}"><header><small>FINAL ORDER CHECK</small><h2 id="v21DrawConfirmTitle">일괄 구매를 시작할까요?</h2><p>확인 전에는 서버 구매 요청이 전송되지 않습니다.</p></header><dl><div><dt>상품</dt><dd>${escapeHtml(plan.noun)}</dd></div><div><dt>총수량</dt><dd>${formatNumber(plan.total)}개</dd></div><div><dt>총비용</dt><dd>${formatNumber(plan.totalCost)} 코인</dd></div><div><dt>구매 요청</dt><dd>최대 100개씩 ${formatNumber(plan.purchaseBatches)}회</dd></div><div><dt>자동진행</dt><dd>${plan.auto ? `${escapeHtml(plan.action)} ON · ${formatNumber(plan.openBatches)}회` : 'OFF · 구매만 진행'}</dd></div></dl><div class="v21-draw-confirm-actions"><button type="button" data-v21-confirm-cancel>취소</button><button type="button" data-v21-confirm-start>${formatNumber(plan.total)}개 주문 시작</button></div></section>`;
      const finish = accepted => {
        document.removeEventListener('keydown', onKeyDown);
        overlay.remove();
        resolve(accepted);
      };
      const onKeyDown = event => {
        if (event.key === 'Escape') finish(false);
      };
      overlay.querySelector('[data-v21-confirm-cancel]').addEventListener('click', () => finish(false));
      overlay.querySelector('[data-v21-confirm-start]').addEventListener('click', () => finish(true));
      document.addEventListener('keydown', onKeyDown);
      document.body.append(overlay);
      overlay.querySelector('[data-v21-confirm-start]').focus();
    });
  }

  function flushLocalState(job = pendingLocalStateJob) {
    if (localStateFlushTimer) scope.clearTimeout(localStateFlushTimer);
    localStateFlushTimer = 0;
    pendingLocalStateJob = null;
    if (!job?.latestBalances) return;
    const { kind, phase, coin, cardShards } = job.latestBalances;
    const user = scope.loadUser?.();
    if (user) {
      if (Number.isFinite(coin)) user.coin = coin;
      if (Number.isFinite(cardShards)) user.cardShards = cardShards;
      scope.saveUser?.(user);
    }
    scope.clearApiCache?.('inventory');
    scope.clearApiCache?.('shell/summary');
    if (kind === 'equipment') {
      scope.clearApiCache?.('equipment/supply-box/config');
      scope.clearApiCache?.('equipment/supply-box/config?fresh=1');
    } else scope.clearApiCache?.('vehicle-draw/config');
    if (phase === 'open') scope.clearApiCache?.('character/loadout');
    lastLocalStateFlushAt = Date.now();
  }

  function updateLocalState(job, phase, response) {
    job.latestBalances = {
      kind: job.kind,
      phase,
      coin: Number.isFinite(Number(response?.coin)) ? Number(response.coin) : Number(job.latestBalances?.coin),
      cardShards: Number.isFinite(Number(response?.cardShards)) ? Number(response.cardShards) : Number(job.latestBalances?.cardShards)
    };
    pendingLocalStateJob = job;
    if (localStateFlushTimer) return;
    const wait = Math.max(0, 1000 - (Date.now() - lastLocalStateFlushAt));
    localStateFlushTimer = scope.setTimeout(() => flushLocalState(job), wait);
  }

  function jobPercent(job) {
    const total = job.total * (job.auto ? 2 : 1);
    const complete = job.purchased + (job.auto ? job.opened : 0);
    return total > 0 ? Math.max(0, Math.min(100, complete / total * 100)) : 0;
  }

  function ensureJobDock() {
    const document = scope.document;
    let dock = document?.getElementById('v21DrawPurchaseDock');
    if (dock || !document?.body) return dock;
    dock = document.createElement('aside');
    dock.id = 'v21DrawPurchaseDock';
    dock.className = 'v21-draw-purchase-dock';
    dock.setAttribute('role', 'status');
    dock.setAttribute('aria-live', 'polite');
    document.body.append(dock);
    return dock;
  }

  function paintJobDock(job) {
    const dock = ensureJobDock();
    if (!dock || !job) return;
    const percent = jobPercent(job);
    dock.dataset.kind = job.kind;
    dock.dataset.paused = String(Boolean(scope.document?.hidden));
    dock.innerHTML = `<div class="v21-draw-dock-head"><span><i></i> ${job.auto ? 'AUTO ACQUISITION' : 'BULK PURCHASE'}</span><b>${escapeHtml(job.definition.noun)}</b></div><div class="v21-draw-dock-progress"><span style="width:${percent.toFixed(2)}%"></span></div><div class="v21-draw-dock-values"><strong>${formatNumber(job.purchased)} / ${formatNumber(job.total)} 구매</strong>${job.auto ? `<strong>${formatNumber(job.opened)} / ${formatNumber(job.total)} ${escapeHtml(job.definition.action)}</strong>` : ''}<strong>${formatNumber(job.spent || 0)} 코인 결제</strong><small>${escapeHtml(visibilityLabel(job))}</small></div><button type="button" data-v21-draw-stop ${job.stopRequested ? 'disabled' : ''}>${job.stopRequested ? '현재 요청 완료 후 중단' : (job.auto ? '자동진행 중단' : '일괄 구매 중단')}</button>`;
    dock.querySelector('[data-v21-draw-stop]')?.addEventListener('click', () => {
      job.stopRequested = true;
      job.stopAfterCurrentBatch = Boolean(job.currentBatch?.attempted);
      persistJob(job);
      renderJobDock(job);
    });
  }

  function renderJobDock(job) {
    pendingDockJob = job;
    if (dockRenderFrame) return;
    const schedule = scope.requestAnimationFrame || (callback => scope.setTimeout(callback, 16));
    dockRenderFrame = schedule(() => {
      dockRenderFrame = 0;
      const nextJob = pendingDockJob;
      pendingDockJob = null;
      if (nextJob) paintJobDock(nextJob);
    });
  }

  function removeJobDock() {
    const cancel = scope.cancelAnimationFrame || scope.clearTimeout;
    if (dockRenderFrame) cancel?.call(scope, dockRenderFrame);
    dockRenderFrame = 0;
    pendingDockJob = null;
    scope.document?.getElementById('v21DrawPurchaseDock')?.remove();
  }

  function setControlsBusy(busy) {
    scope.document?.querySelectorAll('[data-v21-draw-purchase]').forEach(control => {
      control.dataset.busy = String(Boolean(busy));
      control.querySelectorAll('input,button').forEach(element => {
        element.disabled = Boolean(busy);
      });
    });
  }

  function purchaseReceipt(job, response, count) {
    const expected = job.unitPrice * count;
    const unit = job.kind === 'equipment' ? Number(response?.shopPrice) : job.unitPrice;
    const actualRaw = job.kind === 'equipment' ? response?.spent : response?.totalPrice;
    const actual = Number.isFinite(Number(actualRaw)) ? Math.max(0, Number(actualRaw)) : expected;
    return {
      expected,
      actual,
      mismatch: !Number.isFinite(unit) || unit !== job.unitPrice || !Number.isFinite(Number(actualRaw)) || actual !== expected
    };
  }

  function priceChangedError(job, receipt) {
    const error = new Error(`확정한 단가와 서버 결제액이 달라 남은 구매를 중단했습니다. 예상 ${formatNumber(receipt.expected)} / 실제 ${formatNumber(receipt.actual)} 코인`);
    error.code = 'PRICE_CHANGED';
    error.expected = receipt.expected;
    error.actual = receipt.actual;
    error.terminal = true;
    return error;
  }

  async function runPhase(job, phase, targetCount) {
    const path = phase === 'purchase' ? job.definition.purchasePath : job.definition.openPath;
    job.phase = phase;
    persistJob(job);
    while ((phase === 'purchase' ? job.purchased : job.opened) < targetCount) {
      if (job.stopRequested) throw stoppedError();
      const completedBefore = phase === 'purchase' ? job.purchased : job.opened;
      const remaining = targetCount - completedBefore;
      let batch = job.currentBatch;
      if (batch) {
        if (batch.phase !== phase || batch.count > remaining) {
          const error = new Error('저장된 배치 단계와 현재 자동진행 단계가 일치하지 않습니다. 새 구매를 차단했습니다.');
          error.code = 'V21_DRAW_LEDGER_AMBIGUOUS';
          error.ambiguous = true;
          throw error;
        }
      } else {
        const index = Math.floor(completedBefore / SERVER_BATCH), count = Math.min(SERVER_BATCH, remaining);
        batch = { phase, count, index, requestId: requestId(`${job.kind}-${phase}`, index), attempted: false };
        job.currentBatch = batch;
        job.state = 'running';
        persistJob(job);
      }
      const response = await requestWithRetry(job, path, batch.count, batch.requestId);
      job.retrying = 0;
      const reportedCount = response?.count === undefined || response?.count === null ? batch.count : Number(response.count);
      const completed = Number.isFinite(reportedCount) ? Math.max(0, Math.min(batch.count, reportedCount)) : 0;
      let receipt = null;
      if (phase === 'purchase') {
        receipt = purchaseReceipt(job, response, completed);
        job.purchased += completed;
        job.spent += receipt.actual;
      }
      else {
        job.opened += completed;
        absorbOpenResult(job.aggregate, response);
      }
      job.currentBatch = null;
      updateLocalState(job, phase, response);
      persistJob(job);
      renderJobDock(job);
      if (receipt?.mismatch) throw priceChangedError(job, receipt);
      if (completed !== batch.count) {
        const error = new Error(`서버가 요청한 ${formatNumber(batch.count)}개 중 ${formatNumber(completed)}개만 처리했습니다. 남은 자동진행을 중단합니다.`);
        error.code = 'V21_DRAW_PARTIAL_RESPONSE';
        error.terminal = true;
        throw error;
      }
    }
    flushLocalState(job);
  }

  function resultStats(job) {
    if (!job.auto) return [
      ['구매 완료', `${formatNumber(job.purchased)}개`],
      ['보관 수량', `${formatNumber(job.purchased)}개 증가`],
      ['실제 결제', `${formatNumber(job.spent || 0)} 코인`]
    ];
    if (job.kind === 'equipment') return [
      ['개방 완료', `${formatNumber(job.opened)}개`],
      ['실제 결제', `${formatNumber(job.spent || 0)} 코인`],
      ['신규 장비', `${formatNumber(job.aggregate.equipment)}개`],
      ['중복 장비', `${formatNumber(job.aggregate.equipmentDuplicates)}개`],
      ['카드 조각', `+${formatNumber(job.aggregate.shards)}`],
      ['코인 보상', `+${formatNumber(job.aggregate.coins)}`]
    ];
    return [
      ['뽑기 완료', `${formatNumber(job.opened)}회`],
      ['실제 결제', `${formatNumber(job.spent || 0)} 코인`],
      ['신규 차량', `${formatNumber(job.aggregate.vehiclesNew)}대`],
      ['중복 차량', `${formatNumber(job.aggregate.vehiclesDuplicate)}회`],
      ['카드 조각', `+${formatNumber(job.aggregate.shards)}`],
      ['마스터의 별', `+${formatNumber(job.aggregate.stars)}`]
    ];
  }

  function showResult(job, error = null) {
    const document = scope.document;
    const modal = document?.getElementById('modal');
    if (!modal) return;
    const stopped = error?.code === 'V21_DRAW_STOPPED';
    const title = error ? (stopped ? '자동진행을 중단했습니다' : '진행 중 오류가 발생했습니다') : (job.auto ? '자동진행 완료' : '일괄 구매 완료');
    const description = error
      ? `완료된 구매 ${formatNumber(job.purchased)}개와 ${job.definition.action} ${formatNumber(job.opened)}회는 서버에 안전하게 보존되었습니다. 남은 작업은 실행하지 않았습니다.`
      : `${job.definition.noun} ${formatNumber(job.total)}개 처리가 완료되었습니다.`;
    const featured = job.aggregate.featured.length
      ? `<div class="v21-draw-result-featured">${job.aggregate.featured.map(item => `<span><small>${escapeHtml(item.rarity || item.type)}</small><b>${escapeHtml(item.name || item.type)}</b></span>`).join('')}</div>`
      : '';
    modal.className = 'modal show v21-draw-flow-modal';
    modal.innerHTML = `<section class="v21-draw-result-panel" role="dialog" aria-modal="true" aria-labelledby="v21DrawResultTitle" data-kind="${job.kind}" data-state="${error ? 'partial' : 'complete'}"><header><small>${error ? 'SAFE STOP / COMPLETED DATA PRESERVED' : 'TRANSACTION COMPLETE'}</small><h2 id="v21DrawResultTitle">${escapeHtml(title)}</h2><p>${escapeHtml(description)}</p></header>${error ? `<div class="v21-draw-result-error">${escapeHtml(error.message || '작업을 계속할 수 없습니다.')}</div>` : ''}<div class="v21-draw-result-stats">${resultStats(job).map(([label, value]) => `<span><small>${escapeHtml(label)}</small><b>${escapeHtml(value)}</b></span>`).join('')}</div>${featured}<button type="button" data-v21-draw-result-close>카드 상점으로 돌아가기</button></section>`;
    modal.querySelector('[data-v21-draw-result-close]')?.addEventListener('click', () => {
      modal.className = 'modal';
      modal.innerHTML = '';
      scope.renderShell?.('buy');
    });
  }

  function isAmbiguousFailure(error) {
    return Boolean(error?.ambiguous || (error?.code === 'V21_DRAW_STOPPED' && activeJob?.currentBatch?.attempted) || ['V21_DRAW_LOCK_LOST', 'V21_DRAW_LEDGER_UNAVAILABLE', 'V21_DRAW_LEDGER_AMBIGUOUS'].includes(String(error?.code || '')));
  }

  function restoreJobFromLedger(job) {
    const stored = readStoredJob();
    if (!stored.job || stored.invalid || stored.job.id !== job.id) return false;
    Object.assign(job, stored.job, { definition: KINDS[stored.job.kind], lockLost: false, retrying: 0 });
    job.stopRequested = Boolean(job.stopAfterCurrentBatch);
    return true;
  }

  function recoveryDecision(job, error) {
    const document = scope.document;
    if (!document?.body) {
      if (typeof scope.confirm === 'function') return Promise.resolve(scope.confirm(`${error.message}\n같은 요청 ID로 서버 결과를 다시 확인할까요?`) ? 'retry' : 'discard');
      return Promise.resolve('defer');
    }
    const modal = document.getElementById('modal');
    if (!modal) return Promise.resolve('defer');
    return new Promise(resolve => {
      const uncertain = Boolean(job.currentBatch?.attempted);
      modal.className = 'modal show v21-draw-flow-modal';
      modal.innerHTML = `<section class="v21-draw-result-panel" role="alertdialog" aria-modal="true" aria-labelledby="v21DrawRecoveryTitle" data-kind="${job.kind}" data-state="recovery"><header><small>TRANSACTION RECONCILIATION REQUIRED</small><h2 id="v21DrawRecoveryTitle">현재 배치 결과를 확인해야 합니다</h2><p>새 요청은 만들지 않습니다. 재확인은 저장된 동일 requestId를 그대로 재전송합니다.</p></header><div class="v21-draw-result-error">${escapeHtml(error.message || '서버 반영 여부가 불확실합니다.')}</div><div class="v21-draw-result-stats"><span><small>구매 완료</small><b>${formatNumber(job.purchased)}개</b></span><span><small>실제 결제</small><b>${formatNumber(job.spent || 0)} 코인</b></span><span><small>확인 대상</small><b>${escapeHtml(job.currentBatch?.requestId || '저장 영수증')}</b></span></div><div class="v21-draw-confirm-actions"><button type="button" data-v21-recovery-discard>${uncertain ? '나중에 재확인' : '작업 종료·기록 폐기'}</button><button type="button" data-v21-recovery-retry>동일 요청 재확인</button></div></section>`;
      modal.querySelector('[data-v21-recovery-retry]')?.addEventListener('click', () => { modal.className = 'modal'; modal.innerHTML = ''; resolve('retry'); });
      modal.querySelector('[data-v21-recovery-discard]')?.addEventListener('click', () => {
        if (uncertain) { modal.className = 'modal'; modal.innerHTML = ''; resolve('defer'); return; }
        if (!scope.confirm?.('복구 기록을 폐기하면 이 작업을 자동 재확인할 수 없습니다. 정말 종료할까요?')) return;
        modal.className = 'modal'; modal.innerHTML = ''; resolve('discard');
      });
    });
  }

  async function revalidateRemainingPurchase(job) {
    if (job.currentBatch || job.purchased >= job.total) return;
    const config = await scope.apiRequest(job.definition.configPath, {}, { ttl: 0, timeoutMs: 15000, replaceInflight: true });
    const snapshot = configSnapshot(job.kind, config);
    if (!snapshot.enabled) throw new Error(`현재 ${job.definition.noun} 구매를 이용할 수 없습니다.`);
    if (snapshot.unitPrice !== job.unitPrice) {
      const error = new Error(`구매 단가가 ${formatNumber(job.unitPrice)}에서 ${formatNumber(snapshot.unitPrice)} 코인으로 변경되어 새 배치를 시작하지 않았습니다.`);
      error.code = 'PRICE_CHANGED';
      error.terminal = true;
      throw error;
    }
    const remainingCost = (job.total - job.purchased) * job.unitPrice;
    if (Number.isFinite(snapshot.coin) && snapshot.coin >= 0 && snapshot.coin < remainingCost) {
      const error = new Error(`코인이 부족해 남은 구매를 시작하지 않았습니다. 필요 ${formatNumber(remainingCost)} / 보유 ${formatNumber(snapshot.coin)}`);
      error.code = 'INSUFFICIENT_COIN';
      error.terminal = true;
      throw error;
    }
  }

  async function executeOwnedJob(job, resumed = false) {
    activeJob = job;
    job.state = 'running';
    persistJob(job);
    renderJobDock(job);
    for (;;) {
      let failure = null;
      try {
        assertLeaseOwned(job);
        if (resumed || job.purchased > 0) await revalidateRemainingPurchase(job);
        await runPhase(job, 'purchase', job.total);
        if (job.stopRequested) throw stoppedError();
        if (job.auto) await runPhase(job, 'open', job.purchased);
        flushLocalState(job);
        job.state = 'complete';
        clearJobLedger(job);
        showResult(job, null);
        return true;
      } catch (error) {
        failure = error;
        flushLocalState(job);
      }
      if (!isAmbiguousFailure(failure)) {
        job.state = failure?.code === 'V21_DRAW_STOPPED' ? 'stopped' : 'terminal';
        clearJobLedger(job);
        showResult(job, failure);
        return false;
      }
      job.state = 'recovery';
      persistJob(job);
      renderJobDock(job);
      const decision = await recoveryDecision(job, failure);
      if (decision === 'retry') {
        if (!restoreJobFromLedger(job)) {
          const error = new Error('복구 기록을 다시 읽을 수 없어 새 요청을 차단했습니다.');
          error.code = 'V21_DRAW_LEDGER_AMBIGUOUS';
          error.ambiguous = true;
          showResult(job, error);
          return false;
        }
        job.state = 'running';
        persistJob(job);
        resumed = true;
        continue;
      }
      if (decision === 'discard') {
        clearJobLedger(job);
        showResult(job, failure);
      }
      return false;
    }
  }

  async function resumeStoredJob(storedJob = null) {
    if (activeJob || startingJob || resumeStarted || typeof scope.apiRequest !== 'function') return false;
    const stored = storedJob ? { job: storedJob, invalid: false } : readStoredJob();
    if (!stored.job || stored.invalid) return false;
    resumeStarted = true;
    startingJob = true;
    setControlsBusy(true);
    try {
      const locked = await withSpendLock(stored.job.userKey, stored.job.id, () => executeOwnedJob(stored.job, true));
      if (!locked.acquired) throw notifyLockBlocked(stored.job.userKey);
      return locked.value;
    } finally {
      resumeStarted = false;
      startingJob = false;
      activeJob = null;
      setControlsBusy(false);
      removeJobDock();
    }
  }

  async function runJob(kind, requestedTotal, auto) {
    const definition = KINDS[kind];
    if (!definition || activeJob || startingJob) return false;
    if (typeof scope.apiRequest !== 'function') throw new Error('구매 서버에 연결할 수 없습니다.');
    const stored = readStoredJob();
    if (stored.invalid) throw new Error(`저장된 자동진행 기록을 검증할 수 없습니다. 새 구매를 차단했습니다. ${stored.error?.message || ''}`.trim());
    if (stored.job) return resumeStoredJob(stored.job);
    const userKey = currentUserKey(), jobId = requestId(kind, 'job');
    startingJob = true;
    setControlsBusy(true);
    try {
      const locked = await withSpendLock(userKey, jobId, async () => {
        const total = normalizeTotal(requestedTotal);
        const config = await scope.apiRequest(definition.configPath, {}, { ttl: 0, timeoutMs: 15000, replaceInflight: true });
        const snapshot = configSnapshot(kind, config);
        if (!snapshot.enabled) throw new Error(`현재 ${definition.noun} 구매를 이용할 수 없습니다.`);
        const totalCost = snapshot.unitPrice * total;
        if (Number.isFinite(snapshot.coin) && snapshot.coin >= 0 && snapshot.coin < totalCost) throw new Error(`코인이 부족합니다. 필요 ${formatNumber(totalCost)} / 보유 ${formatNumber(snapshot.coin)}`);
        const plan = orderPlan(kind, total, snapshot.unitPrice, auto);
        if (!await confirmOrderPlan(plan)) return false;
        const job = {
          id: jobId,
          userKey,
          ledgerKey: ledgerKey(userKey),
          kind,
          definition,
          total,
          totalCost,
          unitPrice: snapshot.unitPrice,
          spent: 0,
          auto: Boolean(auto),
          phase: 'purchase',
          purchased: 0,
          opened: 0,
          aggregate: createAggregate(kind),
          currentBatch: null,
          state: 'running',
          retrying: 0,
          paused: false,
          stopRequested: false,
          stopAfterCurrentBatch: false
        };
        startingJob = false;
        return executeOwnedJob(job, false);
      });
      if (!locked.acquired) throw notifyLockBlocked(userKey);
      return locked.value;
    } finally {
      startingJob = false;
      activeJob = null;
      flushLocalState();
      setControlsBusy(false);
      removeJobDock();
    }
  }

  function controlMarkup(kind, definition, initial = 10) {
    const auto = readAuto(kind);
    return `<div class="v21-draw-purchase-control" data-v21-draw-purchase="${kind}"><div class="v21-draw-purchase-head"><span><small>TOTAL ORDER</small><b>구매 수량 직접 입력</b></span><em>1 ~ ${formatNumber(MAX_TOTAL)}</em></div><div class="v21-draw-purchase-entry"><button type="button" data-v21-count-step="-1" aria-label="수량 1 감소">−</button><label><input type="number" inputmode="numeric" min="1" max="${MAX_TOTAL}" step="1" value="${initial}" aria-label="${escapeHtml(definition.noun)} 구매 수량"><span>개</span></label><button type="button" data-v21-count-step="1" aria-label="수량 1 증가">＋</button></div><div class="v21-draw-purchase-quick">${[1, 10, 100, 1000, 10000].map(value => `<button type="button" data-v21-count="${value}">${formatNumber(value)}</button>`).join('')}</div><label class="v21-draw-auto-toggle"><input type="checkbox" ${auto ? 'checked' : ''}><span aria-hidden="true"><i></i></span><b>구매 후 자동 ${escapeHtml(definition.action)}</b><small>100개 단위 서버 배치 · 화면이 숨겨지면 일시정지</small></label><button type="button" class="v21-draw-purchase-submit" data-v21-draw-submit><span>${formatNumber(initial)}개 구매${auto ? ` · 자동 ${escapeHtml(definition.action)}` : ''}</span><b data-v21-order-cost>금액 확인</b></button><p data-v21-draw-inline-status hidden></p></div>`;
  }

  function enhanceSection(kind) {
    const document = scope.document;
    const definition = KINDS[kind];
    const section = document?.querySelector(definition.section);
    if (!section || section.dataset.v21PurchaseEnhanced === VERSION) return;
    const nativeButtons = [...section.querySelectorAll(definition.nativePurchase)];
    if (!nativeButtons.length) return;
    const actions = section.querySelector('.equipment-supply-actions');
    if (!actions) return;
    section.dataset.v21PurchaseEnhanced = VERSION;
    nativeButtons.forEach(button => {
      button.hidden = true;
      button.setAttribute('aria-hidden', 'true');
      button.tabIndex = -1;
    });
    actions.insertAdjacentHTML('afterbegin', controlMarkup(kind, definition));
    const control = actions.querySelector(`[data-v21-draw-purchase="${kind}"]`);
    const input = control.querySelector('input[type="number"]');
    const toggle = control.querySelector('.v21-draw-auto-toggle input');
    const submit = control.querySelector('[data-v21-draw-submit]');
    const cost = control.querySelector('[data-v21-order-cost]');
    const status = control.querySelector('[data-v21-draw-inline-status]');
    const nativePrice = Number(String(nativeButtons[0]?.querySelector('b')?.textContent || '').replace(/[^0-9]/g, '')) || 0;
    const sync = () => {
      const count = normalizeTotal(input.value);
      if (scope.document.activeElement !== input) input.value = String(count);
      const auto = Boolean(toggle.checked);
      submit.querySelector('span').textContent = `${formatNumber(count)}개 구매${auto ? ` · 자동 ${definition.action}` : ''}`;
      cost.textContent = nativePrice ? `${formatNumber(nativePrice * count)} 코인` : '서버 금액으로 결제';
      control.querySelectorAll('[data-v21-count]').forEach(button => button.classList.toggle('active', Number(button.dataset.v21Count) === count));
      writeAuto(kind, auto);
    };
    control.querySelectorAll('[data-v21-count]').forEach(button => button.addEventListener('click', () => {
      input.value = button.dataset.v21Count;
      sync();
    }));
    control.querySelectorAll('[data-v21-count-step]').forEach(button => button.addEventListener('click', () => {
      input.value = String(normalizeTotal(Number(input.value) + Number(button.dataset.v21CountStep)));
      sync();
    }));
    input.addEventListener('input', sync);
    input.addEventListener('blur', () => { input.value = String(normalizeTotal(input.value)); sync(); });
    toggle.addEventListener('change', sync);
    submit.addEventListener('click', async () => {
      if (activeJob || startingJob) return;
      input.value = String(normalizeTotal(input.value));
      sync();
      status.hidden = false;
      status.dataset.state = 'pending';
      status.textContent = '서버 가격과 보유 코인을 확인하고 있습니다.';
      try {
        await runJob(kind, Number(input.value), toggle.checked);
        status.hidden = true;
      } catch (error) {
        status.dataset.state = 'error';
        status.textContent = error.message || '구매를 시작하지 못했습니다.';
      }
    });
    sync();
  }

  function enhance() {
    ensureStyle();
    enhanceSection('equipment');
    enhanceSection('vehicle');
  }

  function scheduleEnhance() {
    if (scheduledFrame) return;
    scheduledFrame = scope.requestAnimationFrame(() => {
      scheduledFrame = 0;
      enhance();
    });
  }

  function showResumeGuard(stored, error) {
    const dock = ensureJobDock();
    if (!dock) return;
    const uncertain = Boolean(stored?.job?.currentBatch?.attempted);
    dock.dataset.kind = stored?.job?.kind || 'recovery';
    dock.dataset.paused = 'true';
    dock.innerHTML = `<div class="v21-draw-dock-head"><span><i></i> RECOVERY LOCK</span><b>새 구매 차단</b></div><div class="v21-draw-dock-values"><strong>${escapeHtml(error?.message || stored?.error?.message || '저장된 자동진행 기록을 확인해야 합니다.')}</strong><small>기록을 해결하기 전에는 다른 구매를 시작하지 않습니다.</small></div><button type="button" data-v21-ledger-retry ${stored?.invalid ? 'hidden' : ''}>저장된 작업 재확인</button><button type="button" data-v21-ledger-discard>${uncertain ? '창 닫기·기록 유지' : '복구 기록 폐기'}</button>`;
    dock.querySelector('[data-v21-ledger-retry]')?.addEventListener('click', () => {
      removeJobDock();
      resumeStoredJob(stored.job).catch(nextError => showResumeGuard(readStoredJob(), nextError));
    });
    dock.querySelector('[data-v21-ledger-discard]')?.addEventListener('click', () => {
      if (uncertain) { removeJobDock(); return; }
      if (!scope.confirm?.('저장된 requestId 복구 기록을 폐기하면 서버 반영 여부를 자동 확인할 수 없습니다. 정말 폐기할까요?')) return;
      const key = stored.key || ledgerKey(stored.job?.userKey);
      storageRemove(scope.localStorage, key);
      storageRemove(scope.sessionStorage, key);
      removeJobDock();
      setControlsBusy(false);
    });
  }

  function handlePageHide() {
    if (!activeJob) return;
    try { persistJob(activeJob); } catch (_) {}
    flushLocalState(activeJob);
    // Intentionally retain the local lease. The JS context can disappear while
    // its fetch is still committing; a reload reuses the same tab/job/requestId,
    // while a different tab stays blocked until reconciliation or the 60s TTL.
  }

  function install() {
    const document = scope.document;
    if (!document || document.documentElement.dataset.v21DrawPurchaseInstalled === VERSION) return;
    document.documentElement.dataset.v21DrawPurchaseInstalled = VERSION;
    const boot = () => {
      enhance();
      const app = document.getElementById('app') || document.body;
      observer = new scope.MutationObserver(scheduleEnhance);
      observer.observe(app, { childList: true, subtree: true });
      getBroadcastChannel();
      document.addEventListener('visibilitychange', () => {
        if (!activeJob) return;
        if (!document.hidden && !renewLease()) {
          activeJob.lockLost = true;
          persistJob(activeJob);
        }
        renderJobDock(activeJob);
      });
      scope.addEventListener('storage', event => {
        if (!activeJob || event.key !== leaseKey(activeJob.userKey)) return;
        const lease = parseLease(event.newValue);
        if (!lease || lease.owner !== tabId() || lease.jobId !== activeJob.id) {
          activeJob.lockLost = true;
          persistJob(activeJob);
          renderJobDock(activeJob);
        }
      });
      scope.addEventListener('pagehide', handlePageHide);
      scope.addEventListener('pageshow', event => {
        if (!event.persisted) return;
        if (activeJob) {
          if (!renewLease()) activeJob.lockLost = true;
          renderJobDock(activeJob);
          return;
        }
        const stored = readStoredJob();
        if (stored.job) resumeStoredJob(stored.job).catch(error => showResumeGuard(readStoredJob(), error));
      });
      scope.setTimeout(() => {
        const stored = readStoredJob();
        if (stored.invalid) return showResumeGuard(stored, stored.error);
        if (stored.job) resumeStoredJob(stored.job).catch(error => showResumeGuard(readStoredJob(), error));
      }, 0);
    };
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot, { once: true });
    else boot();
  }

  return {
    VERSION,
    MAX_TOTAL,
    SERVER_BATCH,
    normalizeTotal,
    createBatchPlan,
    isRetryable,
    createAggregate,
    absorbOpenResult,
    orderPlan,
    confirmOrderPlan,
    configSnapshot,
    persistJob,
    readStoredJob,
    reviveJob,
    claimLease,
    renewLease,
    releaseLease,
    withSpendLock,
    purchaseReceipt,
    flushLocalState,
    handlePageHide,
    runJob,
    resumeStoredJob,
    install,
    getActiveJob: () => activeJob,
    isStarting: () => startingJob
  };
});
