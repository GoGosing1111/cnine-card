const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const count=n=>Number(n||0).toLocaleString('ko-KR');
const money=n=>Number(n)>=100000000&&Number(n)%100000000===0?count(n/100000000)+'억':count(n);
const rewardImage=value=>/^\/?assets\/[\w./% -]+$/.test(String(value||''))?'/'+String(value).replace(/^\//,''):'';
const sigil='<svg viewBox="0 0 120 180" aria-hidden="true"><path class="cr-seal-hull" d="M24 8 60 1 96 8 112 42 108 141 83 174H37L12 141 8 42Z"/><path class="cr-seal-inner" d="M31 23 60 17 89 23 96 49 92 133 76 157H44L28 133 24 49Z"/><path class="cr-seal-line" d="M60 17V66M60 112V157M24 49 44 71M96 49 76 71M28 133 44 107M92 133 76 107"/><circle cx="60" cy="89" r="24"/><circle class="cr-seal-core" cx="60" cy="89" r="10"/><path class="cr-seal-line" d="M54 89H66M60 83V95"/></svg>';
export function showCoreRewardPicker({offer,claim}) {
  if(!document.getElementById('coreRewardPickerStyle')){const link=document.createElement('link');link.id='coreRewardPickerStyle';link.rel='stylesheet';link.href='/css/core-raid-reward-picker-v1.css?v=20260925';document.head.append(link);}
  return new Promise(resolve=>{
    const previous=document.activeElement,dialog=document.createElement('dialog');dialog.className='cr-reward-dialog';dialog.setAttribute('aria-labelledby','cr-reward-title');
    let selected=offer.selectedIndex??null,pending=false,paid=offer.result||null,closed=false,timer=null,tween=null;
    const base=offer.baseReward||paid?.reward||{};
    dialog.innerHTML=`<div class="cr-reward-atmosphere" aria-hidden="true"></div><div class="cr-reward-shell"><header><span class="cr-reward-kicker">CORE PROTOCOL <i></i> SPOILS OF VICTORY</span><button class="cr-reward-close" type="button" aria-label="보상 창 닫기">×</button><p class="cr-reward-clear">붕괴 코어 완전 제압</p><h2 id="cr-reward-title">봉인된 전리품</h2><p class="cr-reward-lead">세 개의 봉인 중, 하나를 선택하세요.</p></header><div class="cr-reward-vaults">${[0,1,2].map(i=>`<button type="button" class="cr-reward-vault" data-slot="${i}" aria-label="${i+1}번 봉인 선택"><span class="cr-vault-no">SEAL / 0${i+1}</span><span class="cr-vault-art">${sigil}<span class="cr-vault-halo"></span></span><strong>미확인 전리품</strong><span class="cr-vault-prompt">봉인 해제</span></button>`).join('')}</div><section class="cr-reward-result" hidden aria-live="polite"></section><div class="cr-reward-status" role="status" aria-live="polite"></div><button type="button" class="cr-reward-retry" hidden>선택한 보상 다시 확인</button><footer><span>기본 클리어 보상 <b>${money(base.coin)} 코인${base.shards?' · '+count(base.shards)+' 조각':''}</b></span><span class="cr-reward-guarantee">+ 추가 보상 1개 · 꽝 없음</span><p>선택한 보상은 즉시 보관함에 지급됩니다. 선택 후에는 변경할 수 없습니다.</p><button class="cr-reward-done" type="button" hidden>보상 확인 완료</button></footer></div>`;
    document.body.append(dialog);dialog.showModal();
    const q=s=>dialog.querySelector(s),buttons=[...dialog.querySelectorAll('[data-slot]')];
    function finish(){if(closed)return;closed=true;clearTimeout(timer);tween?.kill?.();dialog.close();dialog.remove();previous?.focus?.();resolve(paid);}
    function markSelected(){buttons.forEach((button,i)=>{button.classList.toggle('is-selected',i===selected);button.classList.toggle('is-unselected',selected!==null&&i!==selected);button.disabled=selected!==null||pending||!!paid;});}
    function reveal(result,animate=true){
      if(closed)return;paid=result;selected=result.selectedIndex??selected;markSelected();
      q('.cr-reward-retry').hidden=true;q('.cr-reward-status').textContent='';
      q('.cr-reward-lead').textContent='선택한 봉인에서 전리품을 회수했습니다.';
      const reward=result.choiceReward,image=rewardImage(reward?.image);
      q('.cr-reward-result').innerHTML=reward?`<span class="cr-reward-found">ACQUISITION COMPLETE</span><div class="cr-reward-prize">${image?`<img src="${esc(image)}" alt="" loading="eager">`:`<span class="cr-reward-prize-symbol" aria-hidden="true">${reward.rewardType==='COIN'?'◉':'✦'}</span>`}<div><small>${esc(reward.rarity||'클리어 추가 보상')}</small><h3>${esc(reward.name)}</h3><strong>× ${count(reward.quantity)}</strong></div></div>${reward.converted?'<p>지급 대상 변경으로 최소 보상을 지급했습니다.</p>':''}<p>기본 ${money(result.reward?.coin)} 코인${result.pigCoins?' · 피그 코인 '+count(result.pigCoins)+'개':''}도 함께 수령했습니다.</p>`:`<h3>클리어 보상 수령 완료</h3><p>${money(result.reward?.coin)} 코인</p>`;
      dialog.classList.add('is-opening');
      const complete=()=>{if(closed)return;dialog.classList.add('is-revealed');q('.cr-reward-result').hidden=false;q('.cr-reward-done').hidden=false;q('.cr-reward-done').focus();const gsap=window.CNineUiFxVendor?.gsap;if(gsap&&!matchMedia('(prefers-reduced-motion: reduce)').matches)tween=gsap.fromTo(q('.cr-reward-result'),{opacity:0,y:24},{opacity:1,y:0,duration:.5,ease:'power2.out'});};
      timer=setTimeout(complete,animate&&!matchMedia('(prefers-reduced-motion: reduce)').matches?1050:0);
    }
    async function choose(index){
      if(pending||paid||closed)return;selected=index;pending=true;markSelected();q('.cr-reward-retry').hidden=true;q('.cr-reward-status').textContent='선택한 봉인을 해제하고 있습니다…';
      let timeout;
      try{const result=await Promise.race([claim({offerId:offer.offerId,selectedIndex:index,requestId:offer.offerId+'-CLAIM'}),new Promise((_,reject)=>{timeout=setTimeout(()=>reject(Error('응답 확인이 늦어지고 있습니다. 같은 보상을 다시 확인하세요.')),15000);})]);reveal(result);}
      catch(error){if(!closed){q('.cr-reward-status').textContent=error.message||'보상을 확인하지 못했습니다. 다시 확인하세요.';q('.cr-reward-retry').hidden=false;}}
      finally{clearTimeout(timeout);pending=false;}
    }
    buttons.forEach((button,i)=>button.onclick=()=>choose(i));q('.cr-reward-retry').onclick=()=>choose(selected);
    q('.cr-reward-close').onclick=finish;q('.cr-reward-done').onclick=finish;dialog.addEventListener('cancel',event=>{event.preventDefault();finish();});
    // The shared vendor is optional enhancement; no reward waits on asset loading.
    if(!window.CNineUiFxVendor)void import('/js/ui-fx-vendor-v2045.bundle.js?v=2045').catch(()=>{});
    if(paid)reveal(paid,false);else if(selected!==null){markSelected();q('.cr-reward-status').textContent='이전에 선택한 봉인이 보존되어 있습니다.';q('.cr-reward-retry').hidden=false;q('.cr-reward-retry').focus();}else buttons[0].focus();
  });
}
