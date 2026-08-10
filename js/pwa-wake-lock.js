(()=>{
  let wakeLock=null,requesting=false,retryTimer=0;
  const installed=()=>Boolean(navigator.standalone)||window.matchMedia?.('(display-mode: standalone)')?.matches===true||window.matchMedia?.('(display-mode: fullscreen)')?.matches===true;
  const supported=()=>Boolean(navigator.wakeLock?.request);
  function schedule(delay=150){clearTimeout(retryTimer);retryTimer=0;if(!installed()||!supported()||document.visibilityState!=='visible')return;retryTimer=setTimeout(()=>{retryTimer=0;void acquire()},delay)}
  async function acquire(){if(requesting||wakeLock||!installed()||!supported()||document.visibilityState!=='visible')return;requesting=true;try{const sentinel=await navigator.wakeLock.request('screen');if(!installed()||document.visibilityState!=='visible'){void sentinel.release().catch(()=>{});return}wakeLock=sentinel;sentinel.addEventListener('release',()=>{if(wakeLock===sentinel)wakeLock=null;schedule(1200)},{once:true})}catch{schedule(30000)}finally{requesting=false}}
  function release(){clearTimeout(retryTimer);retryTimer=0;const sentinel=wakeLock;wakeLock=null;if(sentinel&&!sentinel.released)void sentinel.release().catch(()=>{})}
  document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible')schedule();else release()});
  addEventListener('focus',()=>schedule());
  addEventListener('pageshow',()=>schedule());
  addEventListener('pagehide',release);
  addEventListener('DOMContentLoaded',()=>schedule());
  for(const mode of ['standalone','fullscreen'])window.matchMedia?.(`(display-mode: ${mode})`)?.addEventListener?.('change',()=>schedule());
})();
