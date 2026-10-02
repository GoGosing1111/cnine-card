(() => {
  const CODE='PINGDU_THANKS_GIFT_BOX',IMAGE='assets/ui/packs/pingdu-thanks-gift-box-v1.png';
  const rewardsHtml=rewards=>[
    ['코인',Number(rewards.coin)/100000000,'억','01'],
    ['마스터의 별',Number(rewards.masterStar)/10000,'만 개','02'],
    ['미스틱 에너지',Number(rewards.mysticEnergy),'개','03'],
    ['핑두 리페어쿠폰',Number(rewards.repairCoupon),'개','04']
  ].filter(([,amount])=>Number.isSafeInteger(amount)&&amount>0).map(([label,amount,unit,number])=>
    `<div><span class="pingdu-thanks-gift-number" aria-hidden="true">${number}</span><span>${label}</span><strong>${amount.toLocaleString('ko-KR')}<small>${unit}</small></strong></div>`).join('');
  let active=false;
  async function open({apiRequest,clearApiCache,loadUser,saveUser,apiUserToLocal,renderShell},ownedQuantity){
    if(active||document.querySelector('#modal.show[class*="-gift-modal"]'))return;
    const modal=document.getElementById('modal');if(!modal)return;
    active=true;
    const priorFocus=document.activeElement,key=`cnine:pingdu-thanks-gift:${loadUser()?.serverUserId}:pending`;
    let busy=false,completed=false;
    const close=()=>{
      if(busy)return;
      active=false;modal.className='modal';modal.innerHTML='';modal.removeEventListener('keydown',keys);
      if(completed)renderShell('inventory');else priorFocus?.focus();
    };
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
    modal.className='modal show pingdu-thanks-gift-modal';
    modal.innerHTML=`<section class="modal-panel pingdu-thanks-gift-panel" role="dialog" aria-modal="true" aria-labelledby="pingduThanksGiftTitle">
      <header class="pingdu-thanks-gift-heading"><div><p>아이템 개봉</p><h2 id="pingduThanksGiftTitle">핑두의 감사 선물</h2></div>
        <button type="button" class="pingdu-thanks-gift-close" aria-label="닫기"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" aria-hidden="true"><path d="m6 6 12 12M18 6 6 18"/></svg></button>
      </header>
      <div class="pingdu-thanks-gift-hero">
        <div class="pingdu-thanks-gift-art"><img src="${IMAGE}" alt="코인, 마스터의 별, 미스틱 에너지와 리페어쿠폰 한 장을 담은 핑크색 선물 상자"></div>
        <span class="pingdu-thanks-gift-seal">핑두의 감사 선물</span>
      </div>
      <div class="pingdu-thanks-gift-detail">
        <h3>네 가지 보상 모두 지급</h3>
        <p class="pingdu-thanks-gift-label">상자 1개를 개봉하면 아래 보상을 모두 받습니다.</p>
        <div class="pingdu-thanks-gift-rewards">${rewardsHtml({coin:300000000000,masterStar:5000000,repairCoupon:1,mysticEnergy:1000})}</div>
        <p class="pingdu-thanks-gift-status" role="status" aria-live="polite"></p>
        <button type="button" class="pingdu-thanks-gift-confirm">1개 개봉 · 보상 받기 <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" aria-hidden="true"><path d="M4 12h15m-6-6 6 6-6 6"/></svg></button>
        <p class="pingdu-thanks-gift-balance">보유 ${Number(ownedQuantity||0).toLocaleString('ko-KR')}개 · 개봉 시 상자 1개 사용</p>
      </div>
    </section>`;
    modal.addEventListener('keydown',keys);
    const button=modal.querySelector('.pingdu-thanks-gift-confirm'),message=modal.querySelector('[role="status"]'),closeButton=modal.querySelector('.pingdu-thanks-gift-close');
    closeButton.onclick=close;button.focus();
    try{if(localStorage.getItem(key))button.textContent='이전 개봉 결과 확인';}catch{}
    button.onclick=async()=>{
      if(busy)return;
      busy=true;button.disabled=closeButton.disabled=true;message.textContent='보상을 확인하고 있습니다…';
      try{
        // Preserve the receipt ID after an uncertain response, including reloads.
        let requestId=localStorage.getItem(key);
        if(!requestId){requestId=crypto.randomUUID();localStorage.setItem(key,requestId);}
        const result=await apiRequest('inventory/use',{method:'POST',body:JSON.stringify({itemCode:CODE,count:1,requestId})},{ttl:0,timeoutMs:25000});
        completed=true;
        try{localStorage.removeItem(key);}catch{}
        for(const name of ['inventory','me','shell/summary'])clearApiCache(name);
        modal.querySelector('h2').textContent='보상 수령 완료';
        modal.querySelector('.pingdu-thanks-gift-rewards').innerHTML=rewardsHtml(result.rewards);
        modal.querySelector('.pingdu-thanks-gift-label').textContent=result.replayed?'이전 개봉에서 지급된 보상입니다.':'아래 보상을 모두 받았습니다.';
        modal.querySelector('.pingdu-thanks-gift-balance').textContent=result.replayed?'이전에 완료한 개봉 결과입니다.':'핑두의 감사 선물 1개를 사용했습니다.';
        button.textContent='인벤토리로 돌아가기';button.onclick=close;
        try{const latest=await apiRequest('me',{}, {ttl:0,timeoutMs:10000});saveUser(apiUserToLocal(latest.user));message.textContent='';}
        catch{message.textContent='지급 완료 · 인벤토리에서 최신 보유량을 확인하세요.';}
      }catch(error){
        message.textContent=Number(error.status)===400?'개봉 요청을 확인하세요. 새로고침 후 다시 시도해 주세요.':`${error.message||'응답을 확인하지 못했습니다.'} 다시 누르면 같은 개봉 기록을 확인합니다.`;
        button.textContent='개봉 결과 다시 확인';
      }finally{busy=false;button.disabled=closeButton.disabled=false;}
    };
  }
  window.PingduThanksGiftV1=Object.freeze({open});
})();
