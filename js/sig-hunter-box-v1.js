(() => {
  let active=false;
  const assets='/assets/ui/packs/sig-hunter-box-20261022/';
  const rewardsHtml=rewards=>[
    ['코인',Number(rewards.coin)/1_000_000_000_000,'조','/assets/ui/icon-fusion-20261004/coin.webp'],
    ['마스터의 별',Number(rewards.masterStar)/10_000,'만 개','/assets/ui/icon-fusion-20261004/master-star.webp'],
    ['핑두 리페어권',Number(rewards.repairCoupon),'장','/assets/items/pingdu-repair-coupon-v1.webp'],
    ['슈트 코어 6',Number(rewards.suitCore6),'개','/assets/items/suit-core-6-v2124.png'],
    ['SSS 리미티드 조각',Number(rewards.limitedShard),'개','/assets/items/sss-limited-shard-20261020/item.webp']
  ].map(([label,amount,unit,image])=>'<div class="sighunter-reward"><img src="'+image+'" alt=""><span>'+label+'</span><strong>'+amount.toLocaleString('ko-KR')+'<small>'+unit+'</small></strong></div>').join('');
  async function open({apiRequest,clearApiCache,loadUser,saveUser,apiUserToLocal,renderShell},ownedQuantity){
    if(active||document.querySelector('#modal.show[class*="-gift-modal"]'))return;
    const modal=document.getElementById('modal');if(!modal)return;
    active=true;
    let gift,rewards;
    try{
      const spec=await import('/shared/sig-hunter-box-v1.mjs?v=20261022-v1');
      gift=spec.SIG_HUNTER_BOX;rewards=spec.SIG_HUNTER_BOX_REWARDS;
    }catch(error){active=false;throw error;}
    const priorFocus=document.activeElement,key='cnine:sig-hunter-box:'+loadUser()?.serverUserId+':pending';
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
    modal.className='modal show sig-hunter-box-modal sig-hunter-gift-modal';
    modal.innerHTML='<section class="sighunter-panel" role="dialog" aria-modal="true" aria-labelledby="sighunter-title">'+
      '<header class="sighunter-heading"><div><p>SIG HUNTER · GUARANTEED REWARDS</p><h2 id="sighunter-title">'+gift.name+'</h2></div><button type="button" class="sighunter-close" aria-label="선물 화면 닫기">닫기</button></header>'+
      '<div class="sighunter-body"><figure class="sighunter-art"><img src="/'+gift.image+'" alt="날개 조준 문장과 보랏빛 봉인으로 장식한 시그헌터 박스"><figcaption>시그헌터를 위한 다섯 가지 보상</figcaption></figure>'+
      '<div class="sighunter-contents"><p class="sighunter-label">다섯 가지 보상을 모두 받습니다</p><div class="sighunter-rewards">'+rewardsHtml(rewards)+'</div>'+
      '<p class="sighunter-status" role="status" aria-live="polite"></p><button type="button" class="sighunter-confirm">상자 열기</button>'+
      '<p class="sighunter-balance">보유 '+Number(ownedQuantity||0).toLocaleString('ko-KR')+'개 · 개봉 시 상자 1개 사용</p></div></div></section>';
    modal.addEventListener('keydown',keys);
    const button=modal.querySelector('.sighunter-confirm'),message=modal.querySelector('[role="status"]'),closeButton=modal.querySelector('.sighunter-close');
    closeButton.onclick=close;button.focus();
    try{if(localStorage.getItem(key))button.textContent='이전 개봉 결과 확인';}catch{}
    button.onclick=async()=>{
      if(busy)return;
      busy=true;button.disabled=closeButton.disabled=true;message.textContent='상자의 봉인을 열고 있습니다…';
      try{
        // A lost response must be retried with this same durable receipt ID.
        let requestId=localStorage.getItem(key);
        if(!requestId){requestId=crypto.randomUUID();localStorage.setItem(key,requestId);}
        const result=await apiRequest('inventory/use',{method:'POST',body:JSON.stringify({itemCode:gift.code,count:1,requestId})},{ttl:0,timeoutMs:25000});
        completed=true;
        try{localStorage.removeItem(key);}catch{}
        for(const name of ['inventory','me','shell/summary'])clearApiCache(name);
        modal.querySelector('h2').textContent='보상을 모두 받았습니다';
        modal.querySelector('.sighunter-rewards').innerHTML=rewardsHtml(result.rewards);
        modal.querySelector('.sighunter-label').textContent=result.replayed?'이전에 수령한 보상입니다':'아래 보상이 모두 지급되었습니다';
        modal.querySelector('.sighunter-balance').textContent=result.replayed?'같은 개봉 기록을 확인했습니다.':'시그헌터 박스 1개를 사용했습니다.';
        modal.querySelector('.sighunter-panel').classList.add('is-complete');
        button.textContent='보상 확인';button.onclick=close;
        try{const latest=await apiRequest('me',{}, {ttl:0,timeoutMs:10000});saveUser(apiUserToLocal(latest.user));message.textContent='';}
        catch{message.textContent='지급 완료 · 인벤토리에서 최신 보유량을 확인하세요.';}
      }catch(error){
        message.textContent=error.status===400?'개봉 요청을 확인하세요. 새로고침 후 다시 시도해 주세요.':(error.message||'응답을 확인하지 못했습니다.')+' 다시 누르면 같은 개봉 기록을 확인합니다.';
        button.textContent='개봉 결과 다시 확인';
      }finally{busy=false;button.disabled=closeButton.disabled=false;}
    };
  }
  window.SigHunterBoxV1=Object.freeze({open});
})();

