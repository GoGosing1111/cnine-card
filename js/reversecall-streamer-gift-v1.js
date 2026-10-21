(() => {
  let active=false;
  const assets='/assets/ui/packs/reversecall-streamer-gift-20261021/';
  const rewardsHtml=rewards=>[
    ['코인',Number(rewards.coin)/1_000_000_000_000,'조',null],
    ['핑두 리페어권',Number(rewards.repairCoupon),'개','/assets/items/pingdu-repair-coupon-v1.webp'],
    ['슈트 코어 6',Number(rewards.suitCore6),'개','/assets/items/suit-core-6-v2124.png']
  ].map(([label,amount,unit,image])=>'<div class="rcgift-reward">'+(image?'<img src="'+image+'" alt="">':'<span class="rcgift-coin-mark" aria-hidden="true">C</span>')+'<span>'+label+'</span><strong>'+amount.toLocaleString('ko-KR')+'<small>'+unit+'</small></strong></div>').join('');
  async function open({apiRequest,clearApiCache,loadUser,saveUser,apiUserToLocal,renderShell},ownedQuantity){
    if(active||document.querySelector('#modal.show[class*="-gift-modal"]'))return;
    const modal=document.getElementById('modal');if(!modal)return;
    active=true;
    let gift,rewards;
    try{
      const spec=await import('/shared/reversecall-streamer-gift-v1.mjs?v=20261021-v1');
      gift=spec.REVERSECALL_STREAMER_GIFT;rewards=spec.REVERSECALL_STREAMER_GIFT_REWARDS;
    }catch(error){active=false;throw error;}
    const priorFocus=document.activeElement,key='cnine:reversecall-streamer-gift:'+loadUser()?.serverUserId+':pending';
    let busy=false,completed=false;
    const close=()=>{if(busy)return;active=false;modal.className='modal';modal.innerHTML='';modal.removeEventListener('keydown',keys);if(completed)renderShell('inventory');else priorFocus?.focus();};
    const keys=event=>{
      if(event.key==='Escape'){event.preventDefault();close();}
      if(event.key==='Tab'){
        const buttons=[...modal.querySelectorAll('button:not(:disabled)')],first=buttons[0],last=buttons.at(-1);
        if(!buttons.length){event.preventDefault();return;}
        if(event.shiftKey&&document.activeElement===first){event.preventDefault();last.focus();}
        else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first.focus();}
      }
    };
    modal.className='modal show reversecall-streamer-gift-modal';
    modal.innerHTML='<section class="rcgift-panel" role="dialog" aria-modal="true" aria-labelledby="rcgift-title">'+
      '<header class="rcgift-heading"><div><p>REVERSECALL · STREAMER GIFT</p><h2 id="rcgift-title">'+gift.name+'</h2></div><button type="button" class="rcgift-close" aria-label="선물 화면 닫기">닫기</button></header>'+
      '<div class="rcgift-body"><figure class="rcgift-art"><img src="/'+gift.image+'" alt="리버스콜 문장과 붉은 리본으로 장식한 스트리머 선물 상자"><figcaption>함께하는 순간을 위한 특별한 선물</figcaption></figure>'+
      '<div class="rcgift-contents"><p class="rcgift-label">세 가지 보상을 모두 받습니다</p><div class="rcgift-rewards">'+rewardsHtml(rewards)+'</div>'+
      '<p class="rcgift-status" role="status" aria-live="polite"></p><button type="button" class="rcgift-confirm">선물 열기</button>'+
      '<p class="rcgift-balance">보유 '+Number(ownedQuantity||0).toLocaleString('ko-KR')+'개 · 개봉 시 상자 1개 사용</p></div></div></section>';
    modal.addEventListener('keydown',keys);
    const button=modal.querySelector('.rcgift-confirm'),message=modal.querySelector('[role="status"]'),closeButton=modal.querySelector('.rcgift-close');
    closeButton.onclick=close;button.focus();
    try{if(localStorage.getItem(key))button.textContent='이전 개봉 결과 확인';}catch{}
    button.onclick=async()=>{
      if(busy)return;
      busy=true;button.disabled=closeButton.disabled=true;message.textContent='선물의 봉인을 열고 있습니다…';
      try{
        // A lost response must be retried with this same durable receipt ID.
        let requestId=localStorage.getItem(key);
        if(!requestId){requestId=crypto.randomUUID();localStorage.setItem(key,requestId);}
        const result=await apiRequest('inventory/use',{method:'POST',body:JSON.stringify({itemCode:gift.code,count:1,requestId})},{ttl:0,timeoutMs:25000});
        completed=true;
        try{localStorage.removeItem(key);}catch{}
        for(const name of ['inventory','me','shell/summary'])clearApiCache(name);
        modal.querySelector('h2').textContent='선물이 도착했습니다';
        modal.querySelector('.rcgift-rewards').innerHTML=rewardsHtml(result.rewards);
        modal.querySelector('.rcgift-label').textContent=result.replayed?'이전에 수령한 보상입니다':'아래 보상이 모두 지급되었습니다';
        modal.querySelector('.rcgift-balance').textContent=result.replayed?'같은 개봉 기록을 확인했습니다.':'리버스콜 스트리머 선물 1개를 사용했습니다.';
        modal.querySelector('.rcgift-panel').classList.add('is-complete');
        button.textContent='보상 확인';button.onclick=close;
        try{const latest=await apiRequest('me',{}, {ttl:0,timeoutMs:10000});saveUser(apiUserToLocal(latest.user));message.textContent='';}
        catch{message.textContent='지급 완료 · 인벤토리에서 최신 보유량을 확인하세요.';}
      }catch(error){
        message.textContent=error.status===400?'개봉 요청을 확인하세요. 새로고침 후 다시 시도해 주세요.':(error.message||'응답을 확인하지 못했습니다.')+' 다시 누르면 같은 개봉 기록을 확인합니다.';
        button.textContent='개봉 결과 다시 확인';
      }finally{busy=false;button.disabled=closeButton.disabled=false;}
    };
  }
  window.ReversecallStreamerGiftV1=Object.freeze({open});
})();

