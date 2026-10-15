import {GAME_ORIGIN} from './policy.mjs';

// protocol.handle runs before Chromium adds Origin. Reissuing its Request in
// the main process loses that renderer context. Use Electron's native initiator
// (not a page-controlled Referer) to preserve it for the existing server guard.
export function networkRequestOptions(request) {
  const headers = new Headers(request.headers);
  const origin = new URL(request.url).origin;
  if (origin === GAME_ORIGIN && !['GET', 'HEAD'].includes(request.method) &&
      !headers.has('Origin') && typeof request.initiatorOrigin === 'string') {
    headers.set('Origin', request.initiatorOrigin);
  }
  return {headers, bypassCustomProtocolHandlers:true};
}

export async function forwardNetworkRequest(browserSession, request, fixtureOrigin) {
  const options=networkRequestOptions(request),url=new URL(request.url);
  if(fixtureOrigin&&url.origin===GAME_ORIGIN)return browserSession.fetch(fixtureOrigin+url.pathname+url.search,{...options,method:request.method,body:['GET','HEAD'].includes(request.method)?undefined:await request.arrayBuffer()});
  return browserSession.fetch(request,options);
}
