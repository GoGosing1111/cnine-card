export function onRequest(context){
  const p=decodeURIComponent(new URL(context.request.url).pathname);
  const relative=p.slice('/preview/account-rank-v1/'.length);
  const publicFile=/^(?:|index\.html|app\.mjs|model\.mjs|style\.css|assets\/[a-z0-9-]+\.png)$/.test(relative);
  return publicFile?context.next():new Response('Not found',{status:404,headers:{'cache-control':'no-store'}});
}
