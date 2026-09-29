/* Miracle Burning: shared live/preview ceremony, all copy remains real text. */
(()=>{
  const escape=value=>String(value??'').replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
  function show({state,remainingText,manual=false}={}){
    if(!state?.enabled||state.mode!=='MIRACLE')return;
    const old=document.getElementById('burningActivationNotice');old?.__burningCleanup?.();old?.remove();
    const el=document.createElement('div'),focus=document.activeElement;
    el.id='burningActivationNotice';el.className='burning-activation-notice miracle-ceremony'+(manual?' is-manual':'');
    const multiplier=Number(state.battleRewardMultiplier||100).toLocaleString('ko-KR',{maximumFractionDigits:2});
    el.innerHTML=`<article class="miracle-palace" role="dialog" aria-modal="true" aria-labelledby="miracleBurningTitle" aria-describedby="miracleBurningCopy" tabindex="-1">
      <div class="miracle-celestial-art" aria-hidden="true"></div><div class="miracle-rays" aria-hidden="true"></div><div class="miracle-dust" aria-hidden="true">${Array.from({length:18},(_,i)=>`<i style="--i:${i};--x:${(i*37)%100}%"></i>`).join('')}</div>
      <button class="miracle-close" type="button" aria-label="미라클 버닝 안내 닫기" data-miracle-close>×</button>
      <div class="miracle-masthead"><span>SOOPKETMON</span><i></i><span>CELESTIAL AWAKENING</span></div>
      <header class="miracle-title"><p class="miracle-announcement">전 서버에 기적이 펼쳐집니다</p><h2 id="miracleBurningTitle"><span>MIRACLE</span><em>BURNING</em></h2><p id="miracleBurningCopy">${escape(state.title||'숲켓몬 미라클 버닝이 발동되었습니다')}</p></header>
      <section class="miracle-benefits" aria-label="미라클 버닝 혜택">
        <div class="miracle-coin"><span>COIN REWARD</span><strong><small>×</small>${multiplier}</strong><b>전투 코인 보상</b></div>
        <div class="miracle-drop"><span>ITEM DROP</span><strong>+30<small>%</small></strong><b>기존 드랍 확률 ×1.3</b></div>
        <div class="miracle-energy"><div><span>APOCALYPSE</span><strong>10<small>회</small></strong><b>5분마다 1회 충전</b></div><div><span>PVP / PVE</span><strong>30<small>회</small></strong><b>각 최대 · 1분마다 1회 충전</b></div></div>
      </section>
      <footer class="miracle-footer"><span><small>THE MIRACLE ENDS IN</small><b data-burning-countdown>${escape(remainingText?.()||'진행 중')}</b></span><button type="button" class="miracle-enter" data-miracle-close>기적의 전장으로 <i aria-hidden="true">→</i></button></footer>
    </article>`;
    const root=document.documentElement,viewport=window.visualViewport;
    const size=()=>{el.style.setProperty('--miracle-height',Math.round(viewport?.height||innerHeight)+'px');el.style.setProperty('--miracle-top',Math.round(viewport?.offsetTop||0)+'px')};
    let closed=false;
    const cleanup=()=>{closed=true;root.classList.remove('burning-notice-open');document.body.classList.remove('burning-notice-open');document.removeEventListener('keydown',keyboard);viewport?.removeEventListener('resize',size);viewport?.removeEventListener('scroll',size);window.removeEventListener('resize',size)};
    const close=()=>{if(closed)return;cleanup();el.classList.remove('show');setTimeout(()=>{el.remove();if(focus?.isConnected)focus.focus?.({preventScroll:true})},240)};
    const keyboard=event=>{
      if(event.key==='Escape'){event.preventDefault();close()}
      if(event.key==='Tab'){const buttons=[...el.querySelectorAll('button')],first=buttons[0],last=buttons.at(-1);if(event.shiftKey&&(document.activeElement===first||document.activeElement===el.querySelector('article'))){event.preventDefault();last.focus()}else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first.focus()}}
    };
    el.__burningCleanup=cleanup;size();root.classList.add('burning-notice-open');document.body.classList.add('burning-notice-open');
    el.querySelectorAll('[data-miracle-close]').forEach(button=>button.addEventListener('click',close));
    el.addEventListener('click',event=>{if(event.target===el)close()});
    document.addEventListener('keydown',keyboard);viewport?.addEventListener('resize',size,{passive:true});viewport?.addEventListener('scroll',size,{passive:true});window.addEventListener('resize',size,{passive:true});
    document.body.append(el);requestAnimationFrame(()=>{el.classList.add('show');el.querySelector('article').focus({preventScroll:true})});
  }
  window.CNineMiracleBurning=Object.freeze({show});
})();
