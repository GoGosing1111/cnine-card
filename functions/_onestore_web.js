import {canonicalDocument} from '../shared/onestore-web-v1.mjs';
import {variantPaths,assetVersions} from '../shared/onestore-web-assets-v1.mjs';

const excluded=/(?:^|\/)(?:coin-prediction|clan-prison-camp|prison-death-game|server-support|support-package|supporter-(?:application|season-pass|screen-guard)|season-pass|pwa-install|pwa-wake-lock|store-distribution-v1)(?:[-/.]|$)/i;
export function htmlForStore(html,path){
  html=html.replace(/\b(src|href)=(["'])([^"']+)\2/gi,(all,attr,quote,value)=>{
    if(!value||value.startsWith('#')||/^(?:[a-z]+:|\/\/)/i.test(value))return all;
    const url=new URL(value,'https://cnine-card.pages.dev'+path);
    return attr+'='+quote+url.pathname+url.search+url.hash+quote;
  });
  html=html.replace(/<script\b[^>]*\bsrc=["']([^"']+)["'][^>]*>[\s\S]*?<\/script>|<link\b[^>]*\bhref=["']([^"']+)["'][^>]*>/gi,(tag,src,href)=>excluded.test(new URL(src||href,'https://cnine-card.pages.dev'+path).pathname)?'':tag);
  for(const name of [...variantPaths].sort((a,b)=>b.length-a.length))html=html.replaceAll(name,'/onestore'+name);
  // Parser-blocking scripts must not outrun the first SDK module.
  html=html.replace(/<script\b([^>]*\bsrc=[^>]*)>/gi,(tag,attributes)=>/\b(?:defer|async|type=["']module)/i.test(attributes)?tag:'<script defer'+attributes+'>');
  const version=name=>assetVersions['/onestore/'+name];
  const head=`<base href="${path}"><meta name="onestore-edition" content="web"><script src="/onestore/h5-policy.js?v=${version('h5-policy.js')}"></script><script type="module" src="/onestore/h5-sdk.js?v=${version('h5-sdk.js')}"></script><link rel="stylesheet" href="/onestore/h5.css?v=${version('h5.css')}">`;
  return html.replace(/<head\b[^>]*>/i,match=>match+head);
}
export function storeHeaders(headers){
  const value=new Headers(headers);
  value.delete('x-frame-options');value.delete('content-length');value.delete('content-encoding');value.delete('etag');
  value.set('Cache-Control','no-store');
  value.set('Content-Security-Policy',"frame-ancestors 'self' https://onestore.co.kr https://*.onestore.co.kr https://onestore.net https://*.onestore.net");
  value.set('X-Content-Type-Options','nosniff');return value;
}
export async function serveStore(context){
  const url=new URL(context.request.url);
  if(!['GET','HEAD'].includes(context.request.method))return new Response('Method not allowed',{status:405});
  const pathname=url.pathname;
  const staticPath=pathname.slice('/onestore'.length);
  if(variantPaths.includes(staticPath)||['/h5-policy.js','/h5-sdk.js','/h5.css'].includes(staticPath)){
    const response=await context.next(),headers=new Headers(response.headers);
    headers.set('Cache-Control','no-cache, must-revalidate');
    return new Response(response.body,{status:response.status,headers});
  }
  const path=canonicalDocument(pathname);
  if(!path)return new Response('Not found',{status:404});
  if(pathname==='/onestore')return Response.redirect(url.origin+'/onestore/'+url.search,302);
  const source=new URL(path==='/'?'/onestore/':path,url.origin);
  const response=await context.env.ASSETS.fetch(new Request(source,{method:'GET'}));
  if(!response.ok||!response.headers.get('content-type')?.includes('text/html'))return new Response('Game document unavailable',{status:503});
  return new Response(context.request.method==='HEAD'?null:htmlForStore(await response.text(),path),{status:200,headers:storeHeaders(response.headers)});
}
export function isStoreEntry(request){
  const url=new URL(request.url);
  if(url.searchParams.get('distribution')==='onestore-web')return true;
  try{const host=new URL(request.headers.get('referer')).hostname;return /(^|\.)onestore\.(net|co\.kr)$/.test(host);}catch{return false;}
}
