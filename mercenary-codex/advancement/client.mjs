import { jointAccountRequest } from '../../js/joint-account-transport.mjs';

const base = 'mercenaries/v3/advancement/';
const definitive = new Set(['MERCENARY_ADVANCEMENT_INPUT','MERCENARY_ADVANCEMENT_STALE','MERCENARY_ADVANCEMENT_INELIGIBLE',
  'MERCENARY_ADVANCEMENT_FUNDS','JOINT_OPERATION_SUPERSEDED','JOINT_REQUEST_CONFLICT']);
const sessionToken = () => localStorage.getItem('cnine_card_api_token') || sessionStorage.getItem('cnine_card_api_token') || '';

export function createAdvancementClient({ request = jointAccountRequest, storage = localStorage, getToken = sessionToken,
  locks = globalThis.navigator?.locks } = {}) {
  const token = getToken();
  let accountId, key, inFlight;
  function checkAccount() {
    if (getToken() !== token) throw Error('계정이 바뀌었습니다. 전직창을 다시 여세요.');
  }
  async function read() {
    checkAccount();
    const state = await request(base + 'state', { timeoutMs: 15000 });
    checkAccount();
    if (!Number.isSafeInteger(state?.accountId) || (accountId && accountId !== state.accountId) || !Array.isArray(state.cards)) {
      throw Error('용병 전직 정보를 확인하지 못했습니다.');
    }
    accountId = state.accountId; key = 'cnine.mercenary.advancement.pending:' + accountId;
    return state;
  }
  function pending() {
    if (!key) return null;
    const value = storage.getItem(key);
    if (!value) return null;
    const saved = JSON.parse(value);
    if (saved.expectedAccountId !== accountId || !/^[a-zA-Z0-9_-]{16,100}$/.test(saved.idempotencyKey)) throw Error('미확인 전직 요청을 읽지 못했습니다.');
    return saved;
  }
  function acknowledge(id) { if (pending()?.idempotencyKey === id) storage.removeItem(key); }
  async function send(input) {
    checkAccount();
    const saved = pending();
    if (!key) throw Error('먼저 전직 정보를 불러오세요.');
    if (saved && saved.idempotencyKey !== input.idempotencyKey) {
      throw Object.assign(Error('다른 창에서 시작한 전직 결과를 먼저 확인하세요.'), { definitive: true });
    }
    const body = saved || { ...input, expectedAccountId: accountId };
    if (!saved) {
      try { storage.setItem(key, JSON.stringify(body)); }
      catch { throw Object.assign(Error('요청을 보관하지 못했습니다. 저장 공간을 확인하세요.'), { definitive: true }); }
    }
    try {
      const result = await request(base + 'change', { method: 'POST', body, timeoutMs: 15000 });
      checkAccount();
      if (result.requestId !== body.idempotencyKey || result.receiptId !== result.requestId || result.advancementId !== body.advancementId ||
          result.mercenaryCode !== body.mercenaryCode || result.snapshot?.accountId !== accountId) throw Error('전직 영수증을 다시 확인하세요.');
      acknowledge(result.requestId);
      return result;
    } catch (err) {
      if (definitive.has(err.code)) { acknowledge(body.idempotencyKey); err.definitive = true; }
      throw err;
    }
  }
  function commit(input) {
    if (inFlight) return inFlight;
    inFlight = Promise.resolve().then(() => locks ? locks.request(key, () => send(input)) : send(input)).finally(() => { inFlight = null; });
    return inFlight;
  }
  return { read, pending, commit };
}
