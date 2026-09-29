import {onRequest} from '../../../functions/api/[[path]].js';
import {openApiRuntimeRequest} from '../../../functions/_api_runtime_transport.js';

export default {
  async fetch(request, env, context) {
    let forwarded;
    try { forwarded = await openApiRuntimeRequest(request, env); }
    catch { return new Response('Not found', {status: 404}); }
    // Same game implementation, database, authentication and transaction guards.
    const response = await onRequest({...forwarded, waitUntil: context.waitUntil.bind(context)});
    const headers = new Headers(response.headers);
    headers.set('x-cnine-api-runtime', 'regional-v1');
    return new Response(response.body, {status: response.status, statusText: response.statusText, headers});
  }
};
