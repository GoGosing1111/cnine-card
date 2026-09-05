import { STREAMER_SETTINGS_KEY, DEFAULT_STREAMER_SETTINGS, validateStreamerSettings, publicStreamerSettings } from '../js/streamer-lounge-model-v2036.js';

async function readSettings(env) {
  const row = await env.DB.prepare('SELECT value FROM app_meta WHERE key=?').bind(STREAMER_SETTINGS_KEY).first();
  if (!row) return { raw: null, revision: 'initial-v2036', settings: validateStreamerSettings(DEFAULT_STREAMER_SETTINGS) };
  const saved = JSON.parse(row.value);
  return { raw: row.value, revision: String(saved.revision || ''), settings: validateStreamerSettings(saved.settings) };
}

export async function handleStreamerLounge({ path, request, env, deps }) {
  if (path !== 'streamer-profiles' && path !== 'admin/streamer-profiles') return null;
  const { json, requirePermission, writeAdminLog } = deps;
  if (path === 'streamer-profiles') {
    if (request.method !== 'GET') return json({ error: '지원하지 않는 요청입니다.' }, 405);
    const { settings } = await readSettings(env);
    // No third-party fetch, game mutation or account data on the public read path.
    return json(publicStreamerSettings(settings));
  }
  const admin = await requirePermission(request, env, 'SETTINGS');
  if (!admin) return json({ error: '설정 관리 권한이 없습니다.' }, 403);
  if (request.method === 'GET') {
    const { settings, revision } = await readSettings(env);
    return json({ settings, revision });
  }
  if (request.method !== 'PATCH') return json({ error: '지원하지 않는 요청입니다.' }, 405);
  // Bound the body before parsing; the CMS has at most 40 profiles.
  if (Number(request.headers.get('content-length')) > 65536) return json({ error: '설정 데이터가 너무 큽니다.' }, 413);
  const reader = request.body?.getReader();
  if (!reader) return json({ error: '설정값이 없습니다.' }, 400);
  let size = 0, text = ''; const decoder = new TextDecoder();
  try {
    for (;;) {
      const { value, done } = await reader.read(); if (done) break;
      size += value.byteLength;
      if (size > 65536) { await reader.cancel(); return json({ error: '설정 데이터가 너무 큽니다.' }, 413); }
      text += decoder.decode(value, { stream: true });
    }
    text += decoder.decode();
  } finally { reader.releaseLock(); }
  let body, settings;
  try { body = JSON.parse(text); settings = validateStreamerSettings(body?.settings); }
  catch (error) { return json({ error: error instanceof SyntaxError ? '설정 JSON이 올바르지 않습니다.' : error.message }, 400); }
  const before = await readSettings(env);
  if (body.expectedRevision !== before.revision) return json({ error: '다른 창에서 설정이 변경됐습니다. 다시 불러온 뒤 저장하세요.', code: 'STREAMER_SETTINGS_CONFLICT' }, 409);
  const revision = crypto.randomUUID(), raw = JSON.stringify({ revision, settings });
  const saved = before.raw === null
    ? await env.DB.prepare('INSERT INTO app_meta(key,value,updated_at) VALUES(?,?,CURRENT_TIMESTAMP) ON CONFLICT(key) DO NOTHING').bind(STREAMER_SETTINGS_KEY, raw).run()
    : await env.DB.prepare('UPDATE app_meta SET value=?,updated_at=CURRENT_TIMESTAMP WHERE key=? AND value=?').bind(raw, STREAMER_SETTINGS_KEY, before.raw).run();
  if (Number(saved?.meta?.changes) !== 1) return json({ error: '다른 창에서 설정이 변경됐습니다. 다시 불러온 뒤 저장하세요.', code: 'STREAMER_SETTINGS_CONFLICT' }, 409);
  try { await writeAdminLog(env, admin, 'STREAMER_LOUNGE_UPDATE', 'SETTINGS', STREAMER_SETTINGS_KEY, before.settings, settings); }
  catch { console.error(JSON.stringify({ event: 'streamer_lounge_admin_log_failed', revision })); }
  return json({ ok: true, settings, revision });
}
