import { onRequest } from '../../../functions/api/[[path]].js';

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const cleanPath = url.pathname.replace(/^\/+/, '');
    if (!cleanPath.startsWith('admin/') && cleanPath !== 'health') {
      return new Response(JSON.stringify({ error: '관리자 API 전용 Worker입니다.' }), {
        status: 404,
        headers: { 'content-type': 'application/json; charset=utf-8' }
      });
    }
    url.pathname = `/api/${cleanPath}`;
    const forwarded = new Request(url.toString(), request);
    return onRequest({ request: forwarded, env, waitUntil: p => ctx.waitUntil(p) });
  }
};
