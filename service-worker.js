const SHELL_CACHE='soop-card-shell-v1886-monster-ai-war-room';
const CONTENT_CACHE='soop-card-content-v3-media-integrity';
const OFFLINE_URL='/offline.html?v=1744-renewal-only';
const APP_SHELL_URL='/index.html';
const SHELL_CORE=[
  OFFLINE_URL,
  APP_SHELL_URL,
  '/manifest.webmanifest',
  '/assets/ui/pwa-icon.svg',
  '/assets/ui/pwa-icon-maskable.svg'
];
const CONTENT_CACHE_LIMIT=320;
let contentWritesUntilTrim=24;

self.addEventListener('install',event=>{
  event.waitUntil(caches.open(SHELL_CACHE).then(cache=>cache.addAll(SHELL_CORE)));
  self.skipWaiting();
});

self.addEventListener('activate',event=>{
  event.waitUntil((async()=>{
    const names=await caches.keys();
    await Promise.all(names.filter(name=>
      name.startsWith('soop-card-static-')||
      (name.startsWith('soop-card-shell-')&&name!==SHELL_CACHE)||
      (name.startsWith('soop-card-content-')&&name!==CONTENT_CACHE)
    ).map(name=>caches.delete(name)));
    await self.clients.claim();
  })());
});

function sameOriginGet(request,url){
  return request.method==='GET'&&url.origin===self.location.origin&&!url.pathname.startsWith('/api/');
}

function isVersioned(url){
  return url.searchParams.has('v')||/-v\d+(?:[.-]|$)/i.test(url.pathname);
}

function validMediaResponse(request,response){
  if(!response?.ok)return false;
  const type=String(response.headers.get('content-type')||'').toLowerCase();
  if(type.includes('text/html'))return false;
  if(request.destination==='image'){
    if(type.startsWith('image/'))return true;
    if(type.includes('application/octet-stream'))return /\.(?:avif|gif|jpe?g|jfif|png|svg|webp)$/i.test(new URL(request.url).pathname);
    return false;
  }
  if(request.destination==='video')return type.startsWith('video/')||type.includes('application/octet-stream');
  if(request.destination==='audio')return type.startsWith('audio/')||type.includes('application/octet-stream');
  return true;
}

function invalidMediaResponse(){
  return new Response('Asset not found',{status:404,headers:{'Content-Type':'text/plain; charset=utf-8','Cache-Control':'no-store'}});
}

async function trimCache(cacheName,maxEntries){
  const cache=await caches.open(cacheName),keys=await cache.keys();
  if(keys.length<=maxEntries)return;
  await Promise.all(keys.slice(0,keys.length-maxEntries).map(key=>cache.delete(key)));
}

async function cacheFirst(request,cacheName){
  const cache=await caches.open(cacheName),cached=await cache.match(request);
  if(cached)return cached;
  const response=await fetch(request);
  if(response.ok)await cache.put(request,response.clone());
  return response;
}

function staleWhileRevalidate(event,request,cacheName){
  const update=(async()=>{
    const cache=await caches.open(cacheName),response=await fetch(request);
    if(validMediaResponse(request,response)){
      await cache.put(request,response.clone());
      contentWritesUntilTrim--;
      if(contentWritesUntilTrim<=0){contentWritesUntilTrim=24;await trimCache(cacheName,CONTENT_CACHE_LIMIT)}
      return response;
    }
    await cache.delete(request);
    return invalidMediaResponse();
  })().catch(()=>null);
  event.waitUntil(update);
  return caches.open(cacheName).then(async cache=>{
    const cached=await cache.match(request);
    if(cached&&validMediaResponse(request,cached))return cached;
    if(cached)await cache.delete(request);
    return (await update)||Response.error();
  });
}

async function networkFirst(request,cacheName,fallback=null){
  const cache=await caches.open(cacheName);
  try{
    const response=await fetch(request,{cache:'no-cache'});
    if(response.ok)await cache.put(request,response.clone());
    return response;
  }catch(_){
    return (await cache.match(request))||(fallback?await caches.match(fallback):null)||Response.error();
  }
}

self.addEventListener('fetch',event=>{
  const request=event.request,url=new URL(request.url);
  if(!sameOriginGet(request,url))return;

  // V1802: 관리자 콘솔은 서비스워커가 절대 손대지 않는다.
  // admin 스크립트는 파일명(-v1065-)과 ?v= 때문에 isVersioned() 가 참이 되어 cacheFirst 로 잡혔고,
  // 서버가 /admin/* 에 no-store 를 줘도 워커 캐시의 옛 파일이 계속 나갔다.
  // (CMS 를 고쳐 배포해도 운영자 화면이 그대로인 원인)
  if(url.pathname==='/admin'||url.pathname.startsWith('/admin/'))return;

  if(request.mode==='navigate'){
    event.respondWith((async()=>{
      try{
        const response=await fetch(request,{cache:'no-store'});
        if(response.ok){
          const cache=await caches.open(SHELL_CACHE);
          await cache.put(APP_SHELL_URL,response.clone());
        }
        return response;
      }catch(_){
        return (await caches.match(APP_SHELL_URL))||(await caches.match(OFFLINE_URL))||Response.error();
      }
    })());
    return;
  }

  if(['script','style','worker'].includes(request.destination)){
    // 파일명이 해시되지 않은 런타임 자산은 ?v= 누락 한 번으로 영구 고정되면 안 된다.
    // 매 진입 시 ETag 재검증하고, 오프라인일 때만 마지막 정상본으로 폴백한다.
    event.respondWith(networkFirst(request,SHELL_CACHE));
    return;
  }

  if(request.destination==='font'){
    event.respondWith(isVersioned(url)?cacheFirst(request,SHELL_CACHE):networkFirst(request,SHELL_CACHE));
    return;
  }

  if(request.destination==='image'){
    event.respondWith(staleWhileRevalidate(event,request,CONTENT_CACHE));
    return;
  }

  // Range 응답을 Cache Storage에 넣으면 긴 음원·영상 탐색이 깨질 수 있다.
  if(['audio','video'].includes(request.destination)&&!request.headers.has('range')){
    event.respondWith(staleWhileRevalidate(event,request,CONTENT_CACHE));
  }
});
