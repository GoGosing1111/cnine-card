// Cryvern defense: refresh the runtime that preserves the original body scale.
// Ragniel SSS: approved SD, dash, sword contact and platinum sanctuary.
// Mangisa SS: approved horizontal AK sprite and authoritative six-shot timeline.
// Z-BODY dash V2: approved 245 ms contact, 640 ms motion and authored wake/cut FX.
// Inventory UI v2125: shared navy panels and compact item selection.
// S-BODY / Z-BODY resources v2124; battle scripts keep network-first refresh.
importScripts('/js/image-delivery-map-20261015.js');
const SHELL_CACHE='soop-card-shell-vsoop-watch-consent-20261026-v1-bloodmoon-namsudaeng-timeout-20261026-v1-isgen-input-recovery-20261026-v1-prime-craft-open-20261026-v1-mercenary-selector-20261026-v1-stock-schedule-20261026-v1-cnine-roster-20261026-v4-prime-zero-priority-20261026-v1-three-skills-20261026-v1-razak-priority-20261026-v5-general-jok-grip-20261025-v16-heukgu-large-head-20261025-v3-xp-transfer-item-required-20261025-v2-support-package-deadline-20261025-v1-faction-window-polling-20261025-v1-clan-wed-sat-sun-20261025-v1-bloodmoon-eunseol4-20261025-v1-jokro-power-2200000-20261025-v1-bloodmoon-expansion-20261025-v1-mercenary-xp-transfer-20261025-v1-streamer-cnine-four-20261025-v1-clan-resume-20261025-v1-bloodmoon-status-fix-20261025-v2-clan-eight-20261025-v1-support-package-bogo-20261025-v1-bloodmoon-battle-ready-20261025-v1-bloodmoon-ss30-leonel7-20261025-v3-halloween-shop-remove-20261025-v1-bloodmoon-open-20261025-v1-bloodmoon-prime-material-20261025-v1-superstar-bulk-20261025-v1-organization-command-20261021-v3-20261018-halloween-sss-fallback-v1-shiranui-silver-20261018-v2-coop-normal-view-20261018-v1-kangyun-live-20261018-v1-city-supply-20261018-v1-iyejun-avatar-20261018-v1-world-transparent-20261018-v1-martial-law-20261018-v1-loading-20261018-v1-world-nav-20261018-v2-world-expansion-20261018-v1-pet-icons-coins-paced-v2-operations-popup-20261018-v1-jinmu-jokro-v2-leonel-live-20261018-v1-white-crest-20261019-forward-guard-v3-equipment-set-fx-20261019-v1-content-removal-20261019-sahyeon-live-v1-ss-balance-20261019-v2-sahyeon-cadence-dialogue-20261019-v1-ranked-series-20261019-v2-wide-bathory-live-20261019-v1-multi-device-20261020-v1-shiranui-rank-20261020-v1-zero-live-20261020-v1-zero-body-2x-calm-idle-v1-prime-requiem-20261021-v2-defense-coin-draft-20261026-v1-content-energy-20261020-v1-energy-clock-fix-v1-coop-entry-gate-v1-owner-pass-v1-land-daily5x-20261020-v1-duo-random-20261020-v1-message-cleanup-20261020-v1-halloween-recovery-20261020-v1-system-cleanup-v2-duo-start-20261020-v2-new-gift-20261020-v3-pass-sales-start-20261020-v1-varsen-presentation-20261021-v1-halloween-storage-20261021-v1-legion-daily-energy-20261021-v1-jokro-pack-20261021-v1-city-supply-expiry-20261021-v1-bathory-stock5-20261021-v1-jokro-codex-20261021-v1-workshop-entry-20261021-v1-reversecall-gift-20261021-v1-valter-helios-parity-20261021-v1-jinmu-stock4-20261022-v1-seal-dragon-20261022-v1-seal-orbs-20261022-v1-seal-journey-aligned-20261022-v1-seal-mercenary-20261022-v1-prime-pve-fx-cadence-20261022-v1-coupon-prediction-caps-20261022-v1-territory-vote15-20261022-v1-jokro-stock2-20261022-v1-gift-gbody-20261022-v4-halloween-stock-20261023-v1-general-jok-live-20261023-v15-blood-pack-preparation-20261023-v1-mercenary-gear-balance-20261023-v1-eunseol-live-20261023-v1-loot-delete-save-20261023-v1-mobile-memory-20261024-v1-icon-enhancement-20261024-v1-bloodmoon-bulk-20261025-v1';
const CONTENT_CACHE='soop-card-content-v4-lossless-media';
const OFFLINE_URL='/offline.html?v=1744-renewal-only';
const APP_SHELL_URL='/index.html';
// Renderer contracts can change while an installed client keeps old versioned URLs.
const FRESH_BATTLE_SCRIPTS=new Set(['/js/app.js','/js/battle-v3-live.js','/preview/project-v-v3/project-v-pixi-battle.bundle.js','/pve-v3/battle.bundle.js','/preview/sustained-hunt-v2/battle.bundle.js','/preview/sustained-hunt-v2/app.js','/js/legion-hunt-entry-v1.mjs']);
const FRESH_ACCOUNT_SCRIPTS=new Set(['/js/martial-law-v1.js','/css/martial-law-v1.css','/shared/martial-law-v1.mjs','/shared/ranked-reform-v1.mjs','/admin/martial-law-admin.js','/js/character-loadout-v2.js','/js/character-loadout-v2-live.js','/js/equipment-thumbnails-v1.js','/js/adventure-lobby-v2107.js','/js/adventure-navigation-standalone.js','/js/soopketmon-v21-exact-shell-adapter.js','/js/player-card-v2052.js','/js/account-rank-v1.mjs','/js/joint-account-transport.mjs','/js/soopketmon-v21-runtime-router.js','/js/clan-v1.js','/js/clan-faction-v1.mjs']);
for(const path of ['/js/account-sync-client-v1.mjs','/shared/account-sync-v1.mjs','/shared/server-clock-v1.mjs','/js/pvp-request-recovery-v1.mjs','/js/cooperative-battleground-entry.js','/raid/cooperative/live.mjs','/raid/cooperative/battle.mjs'])FRESH_ACCOUNT_SCRIPTS.add(path);
FRESH_ACCOUNT_SCRIPTS.add('/js/server-support-v1.mjs');
for(const path of ['/js/soop-watch-consent-v1.mjs','/css/soop-watch-consent-v1.css'])FRESH_ACCOUNT_SCRIPTS.add(path);
for(const path of ['/js/support-package-v1.mjs','/js/support-package-alerts-v1.mjs','/shared/support-package-v1.mjs','/css/support-package-v1.css'])FRESH_ACCOUNT_SCRIPTS.add(path);
for(const path of ['/js/ultimate-pack-bulk.mjs','/shared/ultimate-pack-bulk-v1.mjs',
  '/shared/superstar-pack-bulk-v1.mjs','/css/ultimate-pack-bulk.css'])FRESH_ACCOUNT_SCRIPTS.add(path);
for(const path of ['/admin/loot-shop-admin-v1.mjs','/admin/loot-shop-admin-v1.css','/shared/loot-shop-policy-v1.mjs','/js/loot-shop-v1.mjs','/js/loot-shop-presentation-v2.mjs','/css/loot-shop-command-v2.css'])FRESH_ACCOUNT_SCRIPTS.add(path);
for(const path of ['/sss-miracle-cube/app.mjs','/sss-miracle-cube/style.css','/shared/sss-miracle-cube-v1.mjs'])FRESH_ACCOUNT_SCRIPTS.add(path);
for(const path of ['/js/ranked-duo-v1.mjs','/js/ranked-duo-random-v4.mjs','/css/ranked-duo-random-v4.css','/shared/ranked-duo-v1.mjs','/shared/ranked-duo-weekly-v3.mjs','/shared/ranked-duo-random-v4.mjs','/admin/ranked-duo-v1.mjs','/admin/ranked-duo-v1.css'])FRESH_ACCOUNT_SCRIPTS.add(path);
for(const path of ['/shared/content-energy-v1.mjs','/shared/legion-hunt-energy-v1.mjs','/shared/cooperative-rewards-v1.mjs','/shared/reward-reveal-contents-v1.mjs','/admin/cooperative-admin.mjs','/admin/cooperative-rewards.mjs','/admin/legion-hunt-admin-v1.mjs','/admin/server-support-admin-v1.mjs'])FRESH_ACCOUNT_SCRIPTS.add(path);
for(const path of ['/js/organization-api-v1.mjs','/js/organization-faction-v1.mjs','/js/organization-faction-entry-v1.mjs','/shared/organization-faction-v1.mjs','/admin/organization-admin-v1.mjs'])FRESH_ACCOUNT_SCRIPTS.add(path);
for(const path of ['/js/organization-headquarters-v1.mjs','/js/organization-dashboard-v1.mjs','/js/organization-embed-size-v1.mjs','/shared/organization-headquarters-v1.mjs','/js/organization-preparation-v1.js','/js/organization-public-v1.mjs','/js/organization-system-v1.mjs','/js/organization-admission-v1.mjs','/shared/organization-public-v1.mjs','/shared/organization-interview-v1.mjs','/shared/organization-system-v1.mjs','/shared/organization-preparation-v1.mjs'])FRESH_ACCOUNT_SCRIPTS.add(path);
for(const path of ['/js/mercenary-pack-live.mjs','/js/image-delivery-map-20261015.js','/js/image-delivery-v1.js'])FRESH_ACCOUNT_SCRIPTS.add(path);
for(const path of ['/js/pet-deck-slot-v1.mjs','/js/pet-equipment-window-v1.mjs','/pet-codex/app.mjs','/shared/pet-cms-v1.mjs','/shared/collection-bonuses-v1.mjs','/shared/trophy-bonuses-v1.mjs','/admin/companion-admin-v2.mjs','/admin/trophy-bonuses-v1.mjs'])FRESH_ACCOUNT_SCRIPTS.add(path);
for(const path of ['/js/jokgak-city-v1.js','/js/jokgak-city-expansion-ui-v1.mjs','/js/jokgak-city-exploration-ui-v1.mjs','/js/jokgak-city-exploration-ui-v2.mjs','/js/jokgak-city-comms-ui-v1.mjs','/js/jokgak-city-supply-ui-v1.mjs','/shared/jokgak-city-expansion-v1.mjs','/shared/jokgak-city-supply-v1.mjs','/css/jokgak-city-v1.css','/css/jokgak-city-supply-v1.css'])FRESH_ACCOUNT_SCRIPTS.add(path);
FRESH_ACCOUNT_SCRIPTS.add('/js/territory-vote-alert-v1.js');
for(const path of ['/js/blackwing-raid-entry-v1.js','/js/core-protocol-raid-v1924.js','/raid/blackwing/inline.mjs','/raid/blackwing/battle.mjs','/raid/blackwing/presentation.mjs','/raid/blackwing/live.css','/raid/blackwing/ui.css','/css/command-ui-v1.css','/mercenary-codex/command.css','/raid/blackwing/lobby-ui.mjs','/admin/blackwing-raid-admin-v1.mjs'])FRESH_ACCOUNT_SCRIPTS.add(path);
for(const path of ['/preview/coop-defense-v1/defense.bundle.js','/preview/coop-defense-v1/defense.css','/preview/coop-defense-v1/workshop.css','/preview/coop-defense-v1/staging.css','/preview/coop-defense-v1/image-skin.css','/preview/coop-defense-v1/formation.css', '/preview/coop-defense-v1/rooms.css','/preview/defense-roguelike-v2/preview.bundle.js','/shared/monster-defense-growth-v2.mjs','/defense/asset-catalog.json','/shared/monster-defense-v1.mjs','/admin/monster-defense.mjs','/admin/monster-defense.css'])FRESH_ACCOUNT_SCRIPTS.add(path);
FRESH_ACCOUNT_SCRIPTS.add('/js/territory-war-v1811.js');
FRESH_ACCOUNT_SCRIPTS.add('/js/mercenary-deck-slot.mjs');
FRESH_ACCOUNT_SCRIPTS.add('/mercenary-codex/equipment/app.mjs');
FRESH_ACCOUNT_SCRIPTS.add('/shared/legion-regions-v1.mjs');
for(const path of ['/mercenary-codex/sss-reroll/app.mjs','/mercenary-codex/sss-reroll/client.mjs','/shared/mercenary-sss-reroll-v1.mjs'])FRESH_ACCOUNT_SCRIPTS.add(path);
for(const path of ['/equipment-forge/app.mjs','/shared/equipment-forge-policy-v1.mjs','/shared/equipment-forge-resources-v1.mjs','/shared/equipment-forge-advanced-v1.mjs','/admin/equipment-forge-admin-v1.js','/admin/equipment-forge-advanced-editor-v1.mjs'])FRESH_ACCOUNT_SCRIPTS.add(path);
FRESH_ACCOUNT_SCRIPTS.add('/js/supporter-season-pass-v1.mjs');
FRESH_ACCOUNT_SCRIPTS.add('/shared/mercenary-level-v1.mjs');
FRESH_ACCOUNT_SCRIPTS.add('/js/clan-faction-sessions-v1.mjs');
FRESH_ACCOUNT_SCRIPTS.add('/js/clan-war-reform-v1.mjs');
FRESH_ACCOUNT_SCRIPTS.add('/js/magic-workbench-v1.js');
FRESH_ACCOUNT_SCRIPTS.add('/js/workshop-v1881.js');
FRESH_ACCOUNT_SCRIPTS.add('/js/icon-fusion-v1.bundle.js');
FRESH_ACCOUNT_SCRIPTS.add('/js/project-v-tier-battle-art-adapter-v1.js');
FRESH_ACCOUNT_SCRIPTS.add('/js/workshop-recipes-v1.js');
FRESH_ACCOUNT_SCRIPTS.add('/js/pingdu-thanks-gift-v1.js');
for(const path of ['/js/reversecall-streamer-gift-v1.js','/css/reversecall-streamer-gift-v1.css','/shared/reversecall-streamer-gift-v1.mjs'])FRESH_ACCOUNT_SCRIPTS.add(path);
FRESH_ACCOUNT_SCRIPTS.add('/js/lobby-bgm-v1803.js');
FRESH_ACCOUNT_SCRIPTS.add('/js/supporter-screen-guard-v1.mjs');
FRESH_ACCOUNT_SCRIPTS.add('/js/supporter-application-v1.mjs');
FRESH_ACCOUNT_SCRIPTS.add('/js/supporter-message-expiry-v1.mjs');
for(const path of ['/js/new-user-gift-v2075.js','/admin/new-user-gift-v2075.js'])FRESH_ACCOUNT_SCRIPTS.add(path);
for(const path of ['/js/project-v-monster-battle-art-adapter-v1.js','/assets/ui/project-v/monsters/hunt-tower/manifest-v1.json','/js/madara-raid-entry-v1.js','/js/lich-king-raid-entry-v1.js','/js/core-protocol-raid-v1924.js','/raid/madara/inline.mjs','/raid/madara/runtime.mjs','/raid/lich-king/inline.mjs','/raid/lich-king/live.mjs','/raid/lich-king/request-retry.mjs'])FRESH_BATTLE_SCRIPTS.add(path);
for(const path of ['/js/content-reward-reveal-v1.mjs','/js/core-raid-reward-stage-v2.mjs','/js/core-raid-reward-picker-v2.mjs','/shared/core-raid-reward-policy-v1.mjs','/shared/reward-reveal-contents-v1.mjs','/admin/reward-reveal-admin-v1.mjs','/admin/core-raid-rewards-v1.mjs'])FRESH_ACCOUNT_SCRIPTS.add(path);
const SHELL_CORE=[
  OFFLINE_URL,
  APP_SHELL_URL,
  '/manifest.webmanifest',
  '/assets/ui/brand/reverse-call-20261016/icon-192.png?v=20261018-transparent',
  '/assets/ui/brand/reverse-call-20261016/icon-512.png?v=20261018-transparent',
  '/assets/ui/brand/reverse-call-20261016/maskable-512.png?v=20261018-transparent',
  '/assets/ui/brand/reverse-call-20261016/apple-touch-icon-180.png?v=20261018-transparent',
  '/assets/ui/brand/reverse-call-20261016/favicon-32.png?v=20261018-transparent',
  '/assets/ui/brand/reverse-call-20261016/favicon-48.png?v=20261018-transparent'
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
    const shell=await caches.open(SHELL_CACHE);
    // A transparent replacement keeps the public URLs; discard only old brand pixels.
    const media=await caches.open(CONTENT_CACHE);
    await Promise.all((await media.keys()).filter(request=>new URL(request.url).pathname.startsWith('/assets/ui/brand/reverse-call-20261016/')).map(request=>media.delete(request)));
    await Promise.all((await shell.keys()).filter(request=>FRESH_BATTLE_SCRIPTS.has(new URL(request.url).pathname)||FRESH_ACCOUNT_SCRIPTS.has(new URL(request.url).pathname)).map(request=>shell.delete(request)));
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
  if(cached&&validShellResponse(request,cached))return cached;
  if(cached)await cache.delete(request);
  const response=await fetch(request);
  if(validShellResponse(request,response))try{await cache.put(request,response.clone())}catch(_){}
  return response;
}
function validShellResponse(request,response){
  if(!response?.ok)return false;
  const type=String(response.headers.get('content-type')||'').toLowerCase();
  if(request.destination==='style')return type.includes('text/css');
  if(['script','worker'].includes(request.destination))return /javascript|ecmascript/.test(type);
  return !type.includes('text/html');
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

async function optimizedImage(event,request,target){
 const url=new URL(target,request.url),optimized=new Request(url,{credentials:'same-origin'}),cache=await caches.open(CONTENT_CACHE),cached=await cache.match(optimized);
 if(cached&&validMediaResponse(request,cached))return cached;
 try{const response=await fetch(optimized);if(validMediaResponse(request,response)){
   const write=(async()=>{try{await cache.put(optimized,response.clone());if(--contentWritesUntilTrim<=0){contentWritesUntilTrim=24;await trimCache(CONTENT_CACHE,CONTENT_CACHE_LIMIT);}}catch(_){}})();
   event.waitUntil(write);return response;
 }}catch(_){}
 return staleWhileRevalidate(event,request,CONTENT_CACHE);
}
self.addEventListener('fetch',event=>{
  const request=event.request,url=new URL(request.url);
  if(!sameOriginGet(request,url))return;

  // The H5 edition owns its document policy; never replace it with the PWA shell.
  if(url.pathname==='/onestore'||url.pathname.startsWith('/onestore/'))return;

  // V1802: 관리자 콘솔은 서비스워커가 절대 손대지 않는다.
  // admin 스크립트는 파일명(-v1065-)과 ?v= 때문에 isVersioned() 가 참이 되어 cacheFirst 로 잡혔고,
  // 서버가 /admin/* 에 no-store 를 줘도 워커 캐시의 옛 파일이 계속 나갔다.
  // (CMS 를 고쳐 배포해도 운영자 화면이 그대로인 원인)
  if(url.pathname==='/admin'||url.pathname.startsWith('/admin/'))return;

  const optimizedTarget=globalThis.CNineImageDeliveryMap?.map?.[url.pathname];
  if(optimizedTarget&&!url.searchParams.has('original')){event.respondWith(optimizedImage(event,request,optimizedTarget));return;}
  if(url.pathname.startsWith('/assets/optimized/')){event.respondWith(optimizedImage(event,request,url.href));return;}

  if(request.mode==='navigate'){
    event.respondWith((async()=>{
      // A standalone codex/preview must never overwrite the cached game index.
      // Query-only game routes share index; other documents keep their own key.
      const documentKey=url.pathname==='/'||url.pathname==='/index.html'?APP_SHELL_URL:url.pathname;
      try{
        const response=await fetch(request,{cache:'no-store'});
        if(response.ok&&String(response.headers.get('content-type')||'').toLowerCase().includes('text/html')){
          const cache=await caches.open(SHELL_CACHE);
          try{await cache.put(documentKey,response.clone())}catch(_){}
        }
        return response;
      }catch(_){
        const cache=await caches.open(SHELL_CACHE);
        return (await cache.match(documentKey))||(await cache.match(OFFLINE_URL))||Response.error();
      }
    })());
    return;
  }

  if(['script','style','worker'].includes(request.destination)){
    if(FRESH_BATTLE_SCRIPTS.has(url.pathname)){event.respondWith(networkFirst(request,SHELL_CACHE));return;}
    if(FRESH_ACCOUNT_SCRIPTS.has(url.pathname)){event.respondWith(networkFirst(request,SHELL_CACHE));return;}
    // Only an explicit release query opts in. A legacy -vNN file name is not
    // immutable. A new shell cache per release also refreshes unchanged URLs.
    event.respondWith(url.searchParams.get('v')?cacheFirst(request,SHELL_CACHE):networkFirst(request,SHELL_CACHE));
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

// V-980 selected Halloween art and static SD refresh through the existing network-first path.
for(const path of ['/shared/mercenary-halloween-catalog-v1.mjs','/shared/mercenary-harlequin-skill-v1.mjs','/shared/mercenary-halloween-pool-v3.mjs','/mercenary-codex/app.mjs'])FRESH_ACCOUNT_SCRIPTS.add(path);
