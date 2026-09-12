// Staged controller for the whole continuous-PVE overhaul. No production URL,
// account lookup, combat simulation or reward calculation lives in this module.
// The host injects authenticated transport and the existing V3 renderer.
const validId = value => typeof value === 'string' && /^[A-Za-z0-9_:-]{1,105}$/.test(value);
const ZONES = new Set(['OUTER', 'CORE', 'FURNACE']);
const problem = (code, message) => Object.assign(new Error(message), {code});
const clone = value => value == null ? value : JSON.parse(JSON.stringify(value));

export function createPveContinuousSession({accountId, transport, storage, onChange = () => {},
  content = 'SCRAPYARD', validateSelection = value => ZONES.has(value),
  makeRequestId = () => crypto.randomUUID(), now = () => Date.now(),
  schedule = setTimeout, unschedule = clearTimeout, maxAutoRetries = 6,
  exclusive = (key, work) => globalThis.navigator?.locks?.request
    ? globalThis.navigator.locks.request(key, work) : work()} = {}) {
  if (!Number.isSafeInteger(Number(accountId)) || Number(accountId) <= 0 ||
      typeof transport?.run !== 'function' || typeof transport?.status !== 'function') throw problem('PVE_SESSION_OPTIONS', '계정과 원정 연결을 확인하세요.');
  if(!/^[A-Z0-9_]{1,30}$/.test(content)||typeof validateSelection!=='function')throw problem('PVE_SESSION_OPTIONS','콘텐츠 식별값을 확인하세요.');
  const uid = String(Number(accountId)), storageKey = `cnine.pve-continuous.v1:${content}:${uid}`;
  const retryLimit = Math.min(8, Math.max(0, Math.floor(Number(maxAutoRetries) || 0)));
  let state = {phase:'IDLE', requestId:null, difficulty:null, result:null, error:null};
  let disposed = false, visible = true, generation = 0, flight = null, timer = null, retries = 0;

  function publish(patch) {
    if (disposed) return;
    state = {...state, ...patch};
    // A failed display callback cannot convert an already saved reward into a
    // new expedition or erase its recovery key.
    try { onChange(clone(state)); } catch { /* host owns display errors */ }
  }
  function stopTimer() { if (timer !== null) {unschedule(timer); timer = null;} }
  function readPending() {
    let raw;
    try { raw = storage.getItem(storageKey); }
    catch { throw problem('PVE_RECOVERY_STORAGE', '원정 복구 기록을 읽을 수 없습니다. 저장소 설정을 확인하세요.'); }
    if (!raw) return null;
    let record;
    try { record = JSON.parse(raw); } catch { /* validated below */ }
    if (record?.version !== 1 || record.accountId !== uid || !validId(record.requestId) || !validateSelection(record.difficulty)) {
      throw problem('PVE_RECOVERY_INVALID', '원정 복구 기록을 확인할 수 없습니다. 새 입장은 중단했습니다.');
    }
    return record;
  }
  function remember(requestId, difficulty) {
    if (!validId(requestId) || !validateSelection(difficulty)) throw problem('PVE_RESPONSE_INVALID', '서버 원정 식별값을 확인할 수 없습니다.');
    const record = {version:1, accountId:uid, requestId, difficulty, savedAt:now()};
    try {
      storage.setItem(storageKey, JSON.stringify(record));
      if (storage.getItem(storageKey) !== JSON.stringify(record)) throw new Error('WRITE_NOT_PERSISTED');
    } catch { throw problem('PVE_RECOVERY_STORAGE', '복구 기록을 저장할 수 없어 새 입장을 중단했습니다.'); }
    return record;
  }
  function retry(delay) {
    stopTimer();
    if (disposed || !visible || retries >= retryLimit) return;
    const wait = Math.max(1500, Math.min(10000, Number(delay) || 1500)) * Math.min(4, 2 ** retries);
    retries++;
    timer = schedule(() => {timer = null; void resume(false);}, Math.min(15000, wait));
  }
  function accept(response, record) {
    if (!response?.ok || !['COMPLETED','RUNNING'].includes(response.status) || !validId(response.requestId)) {
      throw problem('PVE_RESPONSE_INVALID', '원정 응답을 확인할 수 없습니다. 같은 요청으로 다시 확인하세요.');
    }
    if (response.status === 'COMPLETED') {
      if (response.requestId !== record.requestId || response.difficulty?.id !== record.difficulty || !response.battleV2?.result) {
        throw problem('PVE_RESPONSE_INVALID', '요청과 전투 결과가 일치하지 않습니다.');
      }
      stopTimer(); retries = 0;
      // Keep the identifier until the user actually sees/acknowledges the result.
      // Refresh before/during playback fetches this same completed receipt.
      publish({phase:'READY', requestId:record.requestId, difficulty:record.difficulty, result:response, error:null});
    } else {
      const zone = response.difficulty || (response.requestId === record.requestId ? record.difficulty : null);
      const canonical = remember(response.requestId, zone);
      publish({phase:'RUNNING', requestId:canonical.requestId, difficulty:canonical.difficulty, result:null, error:null});
      retry(response.retryAfterMs);
    }
    return clone(response);
  }
  async function submit(record, token) {
    publish({phase:'SUBMITTING', requestId:record.requestId, difficulty:record.difficulty, result:null, error:null});
    // Only these two fields may reach the server. No card, damage, success,
    // reward, seed, playback position or client-side elapsed time is submitted.
    const response = await transport.run({requestId:record.requestId, difficulty:record.difficulty});
    if (disposed || token !== generation) return null;
    return accept(response, record);
  }
  function once(work, manual) {
    if (disposed) return Promise.resolve(null);
    if (flight) return flight;
    if (state.phase === 'READY') return Promise.resolve(clone(state.result));
    stopTimer(); if (manual) retries = 0;
    const token = generation;
    // Defer until flight is assigned, including for synchronously failing storage.
    flight = Promise.resolve().then(() => exclusive(storageKey, () => disposed || token !== generation ? null : work(token))).catch(error => {
      if (disposed || token !== generation) return null;
      publish({phase:'RECOVERABLE', error:{code:error.code || 'PVE_NETWORK', message:error.message || '결과 확인이 지연되고 있습니다.'}});
      // Validation/closed/stock errors are not network failures. Keep the same
      // ID for an explicit retry, without silently entering when stock changes.
      if (!['PVE_RECOVERY_STORAGE','PVE_RECOVERY_INVALID','PVE_RESPONSE_INVALID','PVE_ZONE'].includes(error.code) &&
          !/^(?:(?:SCRAPYARD|TOWER|PVE|IDLE)_V3_|JOINT_)/.test(String(error.code || ''))) retry(1500);
      return null;
    }).finally(() => {flight = null;});
    return flight;
  }
  async function reconcile(token) {
    const local = readPending();
    publish({phase:'CHECKING', error:null});
    const server = await transport.status();
    if (disposed || token !== generation) return null;
    if (!server?.ok || !['IDLE','RUNNING'].includes(server.status)) throw problem('PVE_RESPONSE_INVALID', '서버 원정 상태를 확인할 수 없습니다.');
    if (server.status === 'RUNNING') {
      const active = remember(server.requestId, server.difficulty);
      publish({requestId:active.requestId, difficulty:active.difficulty});
      return active;
    }
    return local;
  }
  function start(difficulty) {
    return once(async token => {
      if (!validateSelection(difficulty)) throw problem('PVE_ZONE', '원정 지역을 선택하세요.');
      const prior = await reconcile(token);
      if (disposed || token !== generation) return null;
      // Selecting a different zone does not discard an unfinished expedition.
      const record = prior || readPending() || remember(makeRequestId(), difficulty);
      return submit(record, token);
    }, true);
  }
  function resume(manual = true) {
    return once(async token => {
      const record = await reconcile(token);
      if (disposed || token !== generation) return null;
      if (!record) {publish({phase:'IDLE', requestId:null, difficulty:null, result:null, error:null}); return null;}
      return submit(record, token);
    }, manual);
  }
  function acknowledge() {
    if (disposed || state.phase !== 'READY') return false;
    try {
      const record = readPending();
      // Another tab may already have started its next run. Never remove its ID.
      if (record?.requestId === state.requestId) storage.removeItem(storageKey);
      publish({phase:record && record.requestId !== state.requestId ? 'RECOVERABLE' : 'IDLE',
        requestId:record?.requestId !== state.requestId ? record?.requestId || null : null,
        difficulty:record?.requestId !== state.requestId ? record?.difficulty || null : null, result:null, error:null});
      return true;
    } catch (error) {
      publish({error:{code:error.code || 'PVE_RECOVERY_STORAGE', message:'결과 확인 기록을 정리하지 못했습니다. 다시 확인하세요.'}});
      return false;
    }
  }
  function setVisible(value) {
    visible = Boolean(value);
    if (!visible) stopTimer();
    else if (!disposed && ['RUNNING','RECOVERABLE'].includes(state.phase)) void resume(true);
  }
  function dispose() {
    disposed = true; generation++; stopTimer();
    // Cancellation is local only. The server may have committed: retain the ID.
  }
  return {start, resume, acknowledge, setVisible, dispose, storageKey,
    getState:() => clone(state), diagnostics:() => ({disposed, visible, inFlight:Boolean(flight), scheduled:timer !== null, retries})};
}
