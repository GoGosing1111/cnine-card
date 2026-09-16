export function onRequest(context){
  const path=decodeURIComponent(new URL(context.request.url).pathname);
  return /account-(?:level-)?rank/i.test(path)?new Response('Not found',{status:404,headers:{'cache-control':'no-store'}}):context.next();
}
