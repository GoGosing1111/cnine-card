(() => {
  const CODE='TOURNAMENT_GIFT_BOX',IMAGE='assets/ui/packs/tournament-gift-box-v1.png';
  let active=false;
  async function open({apiRequest,clearApiCache,loadUser,saveUser,apiUserToLocal,renderShell},ownedQuantity){
    if(active)return;
    const modal=document.getElementById('modal');if(!modal)return;
    active=true;
    const priorFocus=document.activeElement,key=`cnine:tournament-gift:${loadUser()?.serverUserId}:pending`;
    let busy=false,completed=false;
    const close=()=>{if(busy)return;active=false;modal.className='modal';modal.innerHTML='';modal.removeEventListener('keydown',keys);if(completed)renderShell('inventory');else priorFocus?.focus();};
    const keys=event=>{
      if(event.key==='Escape'){event.preventDefault();close();}
      if(event.key==='Tab'){
        const buttons=[...modal.querySelectorAll('button:not(:disabled)')];
        if(!buttons.length){event.preventDefault();return;}
        const first=buttons[0],last=buttons.at(-1);
        if(event.shiftKey&&document.activeElement===first){event.preventDefault();last.focus();}
        else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first.focus();}
      }
    };
    modal.className='modal show tournament-gift-modal';
    modal.innerHTML=`<section class="modal-panel tournament-gift-panel" role="dialog" aria-modal="true" aria-labelledby="tournamentGiftTitle">
      <button type="button" class="tournament-gift-close" aria-label="닫기">×</button>
      <p class="tournament-gift-kicker">TOURNAMENT GIFT</p><h2 id="tournamentGiftTitle">대회 사은품</h2>
      <p class="tournament-gift-caption">함께한 대회를 기념하는 특별한 선물</p>
      <div class="tournament-gift-art"><img src="${IMAGE}" alt="금색 리본과 별 문장이 장식된 대회 사은품 상자"></div>
      <p class="tournament-gift-label">상자 1개 · 두 보상 모두 확정 지급</p>
      <div class="tournament-gift-rewards"><div><span>★ 마스터의 별</span><strong>200만<small>개</small></strong></div><div><span>코인</span><strong>2,500억<small>코인</small></strong></div></div>
      <p class="tournament-gift-status" role="status" aria-live="polite"></p>
      <button type="button" class="tournament-gift-confirm">1개 개봉 · 보상 받기</button>
      <p class="tournament-gift-balance">보유 ${Number(ownedQuantity||0).toLocaleString('ko-KR')}개 · 개봉 시 상자 1개 사용</p>
    </section>`;
    modal.addEventListener('keydown',keys);
    const button=modal.querySelector('.tournament-gift-confirm'),message=modal.querySelector('[role="status"]'),closeButton=modal.querySelector('.tournament-gift-close');
    closeButton.onclick=close;button.focus();
    try{if(localStorage.getItem(key))button.textContent='이전 개봉 결과 확인';}catch{}
    button.onclick=async()=>{
      if(busy)return;
      busy=true;button.disabled=closeButton.disabled=true;message.textContent='보상을 확인하고 있습니다…';
      try{
        // Persist before sending: closing/reloading after a lost response reuses the receipt.
        let requestId=localStorage.getItem(key);
        if(!requestId){requestId=crypto.randomUUID();localStorage.setItem(key,requestId);}
        const result=await apiRequest('inventory/use',{method:'POST',body:JSON.stringify({itemCode:CODE,count:1,requestId})},{ttl:0,timeoutMs:25000});
        completed=true;
        try{localStorage.removeItem(key);}catch{}
        for(const name of ['inventory','me','shell/summary'])clearApiCache(name);
        modal.querySelector('h2').textContent='보상 수령 완료';
        modal.querySelector('.tournament-gift-label').textContent='마스터의 별과 코인을 모두 받았습니다';
        modal.querySelector('.tournament-gift-balance').textContent=result.replayed?'이전에 완료한 개봉 결과입니다.':'대회 사은품 1개를 사용했습니다.';
        button.textContent='인벤토리로 돌아가기';button.onclick=close;
        // A failed display refresh must never resend a completed reward operation.
        try{const latest=await apiRequest('me',{}, {ttl:0,timeoutMs:10000});saveUser(apiUserToLocal(latest.user));message.textContent='';}
        catch{message.textContent='지급 완료 · 인벤토리에서 최신 보유량을 확인하세요.';}
      }catch(error){
        message.textContent=Number(error.status)===400?'개봉 요청을 확인하세요. 새로고침 후 다시 시도해 주세요.':`${error.message||'응답을 확인하지 못했습니다.'} 다시 누르면 같은 개봉 기록을 확인합니다.`;
        button.textContent='개봉 결과 다시 확인';
      }finally{busy=false;button.disabled=closeButton.disabled=false;}
    };
  }
  window.TournamentGiftV1=Object.freeze({open});
})();
