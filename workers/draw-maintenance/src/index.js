const LIMIT = 500;

async function cleanup(env) {
  const results = await env.DB.batch([
    env.DB.prepare(`DELETE FROM draw_request_receipts_v2 WHERE request_id IN (
      SELECT request_id FROM draw_request_receipts_v2
      WHERE status='ARCHIVED' AND updated_at<datetime('now','-1 day')
      ORDER BY updated_at LIMIT ?
    )`).bind(LIMIT),
    env.DB.prepare(`DELETE FROM draw_request_receipts_v2 WHERE request_id IN (
      SELECT request_id FROM draw_request_receipts_v2
      WHERE status IN ('COMPLETED','FAILED') AND updated_at<datetime('now','-3 days')
      ORDER BY updated_at LIMIT ?
    )`).bind(LIMIT),
    env.DB.prepare(`DELETE FROM draw_request_receipts_v2 WHERE request_id IN (
      SELECT request_id FROM draw_request_receipts_v2
      WHERE status='RETRYABLE' AND updated_at<datetime('now','-7 days')
      ORDER BY updated_at LIMIT ?
    )`).bind(LIMIT)
  ]);
  return results.reduce((sum, row) => sum + Number(row?.meta?.changes || 0), 0);
}

export default {
  async scheduled(_event, env, ctx) {
    ctx.waitUntil(cleanup(env).then(deleted => console.log('draw receipt cleanup', { deleted })));
  },
  async fetch(_request, env) {
    const deleted = await cleanup(env);
    return Response.json({ ok: true, deleted, limit: LIMIT });
  }
};
