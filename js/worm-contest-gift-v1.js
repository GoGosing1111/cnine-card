(() => {
  const CODE='WORM_CONTEST_GIFT_BOX',IMAGE='assets/ui/packs/worm-contest-gift-box-v1.png';
  const rewardsHtml=rewards=>[
    ['코인',Number(rewards.coin)/100000000,'억 코인'],
    ['★ 마스터의 별',Number(rewards.masterStar)/10000,'만 개'],
    ['핑두 리페어권',Number(rewards.repairCoupon),'개'],
    ['엠퍼러 에너지',Number(rewards.emperorEnergy||0),'개']
  ].filter(([,amount])=>Number.isSafeInteger(amount)&&amount>0).map(([label,amount,unit])=>`<div><span>${label}</span><strong>${amount.toLocaleString('ko-KR')}<small>${unit}</small></strong></div>`).join('');
  let active=false;
  async function open({apiRequest,clearApiCache,loadUser,saveUser,apiUserToLocal,renderShell},ownedQuantity){
    if(active||document.querySelector('#modal.show'))return;
    const modal=document.getElementById('modal');if(!modal)return;
    active=true;
    const priorFocus=document.activeElement,key=`cnine:worm-contest-gift:${loadUser()?.serverUserId}:pending`;
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
    modal.className='modal show worm-contest-gift-modal';
    modal.innerHTML=`<section class="modal-panel worm-contest-gift-panel" role="dialog" aria-modal="true" aria-labelledby="wormContestGiftTitle">
      <button type="button" class="worm-contest-gift-close" aria-label="닫기">×</button>
      <p class="worm-contest-gift-kicker">WORM CONTEST GIFT</p><h2 id="wormContestGiftTitle">지렁이대회 사은품</h2>
      <p class="worm-contest-gift-caption">지렁이대회를 함께한 여러분께 드리는 선물</p>
      <div class="worm-contest-gift-art"><img src="${IMAGE}" alt="왕관을 쓴 지렁이 문장과 붉은 리본이 장식된 사은품 상자"></div>
      <p class="worm-contest-gift-label">상자 1개 · 네 보상 모두 확정 지급</p>
      <div class="worm-contest-gift-rewards">${rewardsHtml({coin:500000000000,masterStar:20000000,repairCoupon:1,emperorEnergy:20})}</div>
      <p class="worm-contest-gift-status" role="status" aria-live="polite"></p>
      <button type="button" class="worm-contest-gift-confirm">1개 개봉 · 보상 받기</button>
      <p class="worm-contest-gift-balance">보유 ${Number(ownedQuantity||0).toLocaleString('ko-KR')}개 · 개봉 시 상자 1개 사용</p>
    </section>`;
    modal.addEventListener('keydown',keys);
    const button=modal.querySelector('.worm-contest-gift-confirm'),message=modal.querySelector('[role="status"]'),closeButton=modal.querySelector('.worm-contest-gift-close');
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
        modal.querySelector('.worm-contest-gift-rewards').innerHTML=rewardsHtml(result.rewards);
        modal.querySelector('.worm-contest-gift-label').textContent=result.replayed?'이전 개봉에서 지급된 보상':'아래 보상을 모두 받았습니다';
        modal.querySelector('.worm-contest-gift-balance').textContent=result.replayed?'이전에 완료한 개봉 결과입니다.':'지렁이대회 사은품 1개를 사용했습니다.';
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
  window.WormContestGiftV1=Object.freeze({open});
})();
