(() => {
  const artRoot='/assets/ui/extreme-burning-v1/';
  const labelFor=phase=>({live:'버닝 진행 중',closing:'종료 임박',final:'마지막 1분',ended:'이벤트 종료'})[phase];

  function show({state,now=Date.now,preview=false}={}) {
    if(!state?.enabled||state.mode!=='EXTREME')return;
    const end=Date.parse(state.endsAt),start=Date.parse(state.activatedAt);
    if(!Number.isFinite(end)||!Number.isFinite(start)||end<=start||end<=now())return;

    const previous=document.getElementById('burningActivationNotice');
    previous?.__burningCleanup?.();
    previous?.remove();
    const opener=document.activeElement;
    const node=document.createElement('div');
    node.id='burningActivationNotice';
    node.className='extreme-event';
    node.innerHTML=`<article class="ex-sheet" role="dialog" aria-modal="true" aria-labelledby="extremeEventTitle" tabindex="-1">
      <picture class="ex-art" aria-hidden="true"><source media="(max-width:680px)" srcset="${artRoot}eclipse-mobile-v1.webp"><img src="${artRoot}eclipse-v1.webp" alt="" fetchpriority="high" decoding="async"></picture>
      <div class="ex-print" aria-hidden="true">
        <div class="ex-glow"></div>
        <div class="ex-sand ex-upper"><i></i></div><div class="ex-sand ex-lower"><i></i></div><i class="ex-stream"></i>
      </div>
      <button class="ex-close" type="button" data-ex-close aria-label="익스트림 버닝 안내 닫기"><i aria-hidden="true"></i></button>
      <header class="ex-head">
        <p class="ex-wordmark" lang="en"><i></i>REVERSE CALL<i></i></p>
        <h2 id="extremeEventTitle">익스트림 버닝</h2>
        <p class="ex-signal"><i aria-hidden="true"></i><span data-phase-label></span></p>
      </header>
      <div class="ex-clock"><span>종료까지</span><time role="timer" aria-live="off" data-ex-time></time></div>
      <section class="ex-rewards" aria-label="버닝 효과">
        <div class="ex-combat"><div><span>전투 코인</span><strong data-ex-coins></strong></div><div><span>아이템 드랍 확률</span><strong>×2</strong><small>최대 100%</small></div></div>
        <p class="ex-pve">PvE <b>30회</b> · 1분 충전 <i></i> 아포칼립스 <b>10회</b> · 5분 충전</p>
        <div class="ex-admission"><p>발동 시 계정당 1회</p><ul><li><span>군단토벌</span> 행동력 +1</li><li><span>파티 군단토벌</span> 재입장 대기 해제</li></ul></div>
      </section>
      <footer class="ex-bottom"><button class="ex-confirm" type="button" data-ex-close><i aria-hidden="true"></i><span>확인</span><i aria-hidden="true"></i></button></footer>
    </article>`;

    const dialog=node.querySelector('.ex-sheet'),time=node.querySelector('[data-ex-time]'),label=node.querySelector('[data-phase-label]');
    node.querySelector('[data-ex-coins]').textContent='×'+Number(state.battleRewardMultiplier).toLocaleString('ko-KR',{maximumFractionDigits:2});
    let timer,closed=false,phase='';
    const digits=n=>String(n).padStart(2,'0');
    function update(){
      clearTimeout(timer);
      if(closed||document.hidden)return;
      const ms=Math.max(0,end-now()),seconds=Math.ceil(ms/1000);
      const nextPhase=seconds===0?'ended':seconds<=60?'final':seconds<=600?'closing':'live';
      if(phase!==nextPhase){
        phase=nextPhase;node.dataset.phase=phase;
        label.textContent=(preview?'미리보기 · ':'')+labelFor(phase);
      }
      const remaining=Math.min(1,ms/(end-start));
      node.style.setProperty('--ex-fill-upper',String(Math.sqrt(remaining)));
      node.style.setProperty('--ex-fill-lower',String(1-Math.sqrt(remaining)));
      node.style.setProperty('--ex-time-left',String(remaining));
      time.textContent=[Math.floor(seconds/3600),Math.floor(seconds/60)%60,seconds%60].map(digits).join(':');
      time.dateTime='PT'+seconds+'S';
      if(seconds)timer=setTimeout(update,Math.max(30,ms-(seconds-1)*1000+5));
    }
    function cleanup(){
      if(closed)return;
      closed=true;clearTimeout(timer);
      document.removeEventListener('keydown',keyboard);
      document.removeEventListener('visibilitychange',update);
      document.documentElement.classList.remove('extreme-event-open');
      document.body.classList.remove('extreme-event-open');
      if(opener?.isConnected)opener.focus?.({preventScroll:true});
    }
    function close(){cleanup();node.remove();}
    function keyboard(event){
      if(event.key==='Escape'){event.preventDefault();close();return;}
      if(event.key!=='Tab')return;
      const first=node.querySelector('.ex-close'),last=node.querySelector('.ex-confirm'),focused=document.activeElement;
      if(event.shiftKey&&(focused===first||focused===dialog)){event.preventDefault();last.focus();}
      else if(!event.shiftKey&&(focused===last||focused===dialog)){event.preventDefault();first.focus();}
    }
    node.__burningCleanup=cleanup;
    node.addEventListener('click',event=>{if(event.target===node||event.target.closest('[data-ex-close]'))close();});
    document.addEventListener('keydown',keyboard);
    document.addEventListener('visibilitychange',update);
    document.documentElement.classList.add('extreme-event-open');
    document.body.classList.add('extreme-event-open');
    document.body.append(node);update();dialog.focus({preventScroll:true});
  }
  window.CNineExtremeBurning=Object.freeze({show});
})();
