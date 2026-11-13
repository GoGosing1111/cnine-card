import notePaths from '../_data/blue-gear-release-note-paths.json' with {type:'json'};
const archived=new Set(notePaths);
export async function onRequest(context){
  const url=new URL(context.request.url),path=decodeURIComponent(url.pathname);
  if(/account-(?:level-)?rank/i.test(path))return new Response('Not found',{status:404,headers:{'cache-control':'no-store'}});
  if(!archived.has(path.slice(1))||!['GET','HEAD'].includes(context.request.method))return context.next();
  const bundle=await context.env.ASSETS.fetch(new URL('/docs/archive/blue-gear-release-notes-v1.json',url).href);
  if(!bundle.ok)return context.next();
  const content=(await bundle.json())[path.slice(1)];
  if(typeof content!=='string')return context.next();
  return new Response(context.request.method==='HEAD'?null:content,{headers:{'content-type':'text/markdown; charset=utf-8','cache-control':'public, max-age=300'}});
}
