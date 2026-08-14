const CACHE_NAME='soop-card-static-v1703';
const OFFLINE_URL='/offline.html';
const CORE=[OFFLINE_URL,'/manifest.webmanifest','/assets/ui/pwa-icon.svg','/assets/ui/pwa-icon-maskable.svg'];

self.addEventListener('install',event=>{
  event.waitUntil(caches.open(CACHE_NAME).then(cache=>cache.addAll(CORE)));
  self.skipWaiting();
});

self.addEventListener('activate',event=>{
  event.waitUntil((async()=>{
    const names=await caches.keys();
    await Promise.all(names.filter(name=>name.startsWith('soop-card-static-')&&name!==CACHE_NAME).map(name=>caches.delete(name)));
    await self.clients.claim();
    const clients=await self.clients.matchAll({type:'window',includeUncontrolled:true});
    await Promise.all(clients.map(client=>client.navigate(client.url).catch(()=>null)));
  })());
});

function isCacheableStatic(request,url){
  if(request.method!=='GET'||url.origin!==self.location.origin)return false;
  if(url.pathname.startsWith('/api/'))return false;
  if(CORE.includes(url.pathname))return true;
  return ['script','style','image','font'].includes(request.destination);
}

self.addEventListener('fetch',event=>{
  const request=event.request,url=new URL(request.url);
  if(url.origin===self.location.origin&&url.pathname.startsWith('/api/'))return;
  if(request.mode==='navigate'){
    event.respondWith(fetch(request,{cache:'no-store'}).catch(()=>caches.match(OFFLINE_URL)));
    return;
  }
  if(!isCacheableStatic(request,url))return;
  event.respondWith((async()=>{
    const network=fetch(request,{cache:'no-cache'}).then(async response=>{
      if(response.ok){const cache=await caches.open(CACHE_NAME);await cache.put(request,response.clone())}
      return response;
    }).catch(()=>null);
    return (await network)||(await caches.match(request))||Response.error();
  })());
});
