import {readJointBody} from './_joint_request.js';

const respond = (value, status = 200, extraHeaders = {}) => Response.json(value, {
  status, headers: {'Cache-Control': 'private, no-store', ...extraHeaders}
});

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

async function digest(receipt) {
  const bytes = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(receipt.toLowerCase()));
  return Array.from(new Uint8Array(bytes), value => value.toString(16).padStart(2, '0')).join('');
}

export async function handleAccountDeletionStatus(request, env) {
  if (request.method !== 'POST') return respond({error: '접수번호를 입력해 주세요.'}, 405, {Allow: 'POST'});
  let body;
  try { body = await readJointBody(request, {maxBytes: 128, fields: ['receipt']}); }
  catch (error) { return respond({error: error.message}, error.status || 400); }
  if (typeof body.receipt !== 'string' || !uuid.test(body.receipt)) return respond({error: '접수번호 형식을 확인해 주세요.'}, 400);
  const row = await env.DB.prepare(
    "SELECT phase,completed_at FROM account_deletion_requests_v1 WHERE receipt_hash=? AND (completed_at IS NULL OR completed_at > statement_timestamp() - INTERVAL '90 days')"
  ).bind(await digest(body.receipt)).first();
  if (!row) return respond({error: '유효한 접수 내역이 없습니다.'}, 404);
  return respond({status: row.phase === 'completed' ? 'completed' : 'pending', completedAt: row.completed_at || null});
}

export async function handleAccountDeletionRequest(request, env, authenticate) {
  if (request.method !== 'GET' && request.method !== 'POST') {
    return respond({error: '조회 또는 접수 요청을 사용하세요.'}, 405, {Allow: 'GET, POST'});
  }
  const user = await authenticate(request, env);
  if (!user) return respond({error: '게임에 로그인해 주세요.'}, 401);
  const accountId = String(user.id);
  if (request.method === 'POST') {
    let body;
    try {
      body = await readJointBody(request, {maxBytes: 256, fields: ['confirm', 'expectedAccount']});
    } catch (error) {
      return respond({error: error.message}, error.status || 400);
    }
    if (body.confirm !== true) return respond({error: '삭제 신청을 확인해 주세요.'}, 400);
    if (body.expectedAccount !== accountId) return respond({error: '대상 계정을 다시 확인해 주세요.'}, 409);
  }

  try {
    if (request.method === 'POST') {
      // The unique account key also covers a concurrent request or a lost response.
      const receipt = crypto.randomUUID();
      await env.DB.prepare(
        'INSERT INTO account_deletion_requests_v1 (user_id, receipt, receipt_hash) SELECT id, ?, ? FROM users WHERE id=? ON CONFLICT (user_id) DO NOTHING'
      ).bind(receipt, await digest(receipt), user.id).run();
    }
    const row = await env.DB.prepare(
      "SELECT receipt FROM account_deletion_requests_v1 WHERE user_id = ? AND phase='pending'"
    ).bind(user.id).first();
    if (request.method === 'POST' && !row) {
      return respond({error: '접수 결과를 다시 조회해 주세요.'}, 503);
    }
    return respond({accountId, nickname: user.nickname, request: row ? {receipt: row.receipt} : null});
  } catch {
    return respond({error: '접수 서버를 사용할 수 없습니다. 잠시 후 다시 조회해 주세요.'}, 503);
  }
}
