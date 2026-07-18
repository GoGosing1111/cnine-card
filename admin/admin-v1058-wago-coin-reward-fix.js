/* V1058 - 와고 인증 완료 유저 코인 메시지 입력값 보존 */
(()=>{
  const MAX_REWARD=100000000;
  const parseReward=value=>{
    const n=Number(String(value??'').replace(/,/g,'').trim());
    if(!Number.isFinite(n)) return 0;
    return Math.max(1,Math.min(MAX_REWARD,Math.floor(n)));
  };

  function install(){
    const button=document.querySelector('#sendVerifiedCoinBtn');
    const rewardInput=document.querySelector('#verifiedCoinReward');
    if(!button||!rewardInput||button.dataset.v1058Bound==='1') return;
    button.dataset.v1058Bound='1';
    rewardInput.max=String(MAX_REWARD);
    rewardInput.step='1';
    rewardInput.inputMode='numeric';

    button.addEventListener('click',async event=>{
      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation();

      const rewardCoin=parseReward(rewardInput.value);
      if(!rewardCoin){alert('1인당 지급 코인을 올바르게 입력하세요.');return;}
      rewardInput.value=String(rewardCoin);

      const title=String(document.querySelector('#verifiedCoinTitle')?.value||'와고 2단계 인증 보상').trim();
      const body=String(document.querySelector('#verifiedCoinBody')?.value||'와고 2단계 인증 완료 유저에게 지급되는 코인 보상입니다.').trim();
      const includeOwner=document.querySelector('#verifiedCoinIncludeOwner')?.checked===true;
      const includeAdmin=document.querySelector('#verifiedCoinIncludeAdmin')?.checked===true;
      if(!confirm(`인증 완료 유저에게 1인당 ${rewardCoin.toLocaleString()}코인을 메시지로 발송할까요?`)) return;

      const originalText=button.textContent;
      button.disabled=true;
      button.textContent='발송 중...';
      try{
        if(typeof window.api!=='function') throw new Error('관리자 API를 불러오지 못했습니다.');
        const result=await window.api('admin/verified-coin-message-send',{
          method:'POST',
          body:JSON.stringify({rewardCoin,title,body,includeOwner,includeAdmin})
        });
        const confirmed=Number(result?.rewardCoin||0);
        if(confirmed!==rewardCoin) throw new Error(`서버 지급값 불일치: 요청 ${rewardCoin.toLocaleString()} / 저장 ${confirmed.toLocaleString()}`);
        alert(`${Number(result.sent||0).toLocaleString()}명에게 1인당 ${confirmed.toLocaleString()}코인 메시지를 발송했습니다.`);
      }catch(error){
        alert(error?.message||String(error));
      }finally{
        button.disabled=false;
        button.textContent=originalText;
      }
    },true);
  }

  document.addEventListener('DOMContentLoaded',install);
  const observer=new MutationObserver(install);
  observer.observe(document.documentElement,{childList:true,subtree:true});
})();
