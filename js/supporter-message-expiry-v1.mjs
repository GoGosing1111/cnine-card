// Server time drives expiry even when the local clock is wrong or moves back.
export function mountSupportMessageExpiry(box,{serverNow,requestElapsed=0,onRemove=()=>{}}){
  const doc=box.ownerDocument,win=doc.defaultView,start=Date.now(),monotonic=win.performance.now(),base=Number(serverNow)+Math.max(0,requestElapsed),lifecycle=new AbortController();
  let timer,disposed=false;
  const now=()=>base+Math.max(0,Date.now()-start,win.performance.now()-monotonic);
  function dispose(){if(disposed)return;disposed=true;clearTimeout(timer);lifecycle.abort();}
  function tick(){
    clearTimeout(timer);if(disposed)return;if(!box.isConnected){dispose();return;}
    let delay=1000,unread=0,removed=0;
    for(const card of box.querySelectorAll('[data-support-message-expires]')){
      const left=Number(card.dataset.supportMessageExpires)-now();
      if(!Number.isFinite(left)||left<=0){if(card.classList.contains('unread'))unread++;card.replaceChildren();card.remove();removed++;continue;}
      delay=Math.min(delay,left);
      const label=card.querySelector('[data-support-message-countdown]');
      const seconds=Math.ceil(left/1000);if(label)label.textContent=`자동 삭제까지 ${Math.floor(seconds/60)}:${String(seconds%60).padStart(2,'0')}`;
    }
    if(removed){onRemove(unread);if(!box.querySelector('.user-message'))box.innerHTML='<div class="empty-recent">도착한 메시지가 없습니다.</div>';}
    if(box.querySelector('[data-support-message-expires]'))timer=setTimeout(tick,Math.max(1,delay));else dispose();
  }
  for(const event of ['focus','pageshow'])win.addEventListener(event,tick,{signal:lifecycle.signal});
  doc.addEventListener('visibilitychange',tick,{signal:lifecycle.signal});
  tick();return {dispose};
}
