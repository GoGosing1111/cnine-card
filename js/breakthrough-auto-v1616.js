(() => {
  const state={running:false,stopRequested:false,cardId:'',attempts:0,successes:0,failures:0,shards:0,stars:0,lastResult:null,lastCinematic:null,lastCinematicLevel:0};
  const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
  const requestId=()=>globalThis.crypto?.randomUUID?.()||`bt_${Date.now().toString(36)}_${Math.random().toString(36).slice(2)}`;
  const statusText=()=>`자동 강화 ${state.attempts}회 · 성공 ${state.successes} · 실패 ${state.failures}`;
  const cardModalOpen=cardId=>document.getElementById('modal')?.classList.contains('show')&&String(document.getElementById('breakthroughBtn')?.dataset.breakthroughCard||'')===String(cardId);
  async function requestChunk(cardId){
    const id=requestId(),body=JSON.stringify({cardId:String(cardId),requestId:id,maxAttempts:50});
    let lastError=null;
    for(let attempt=0;attempt<5;attempt++){
      try{return await apiRequest('card/breakthrough/auto',{method:'POST',body},{timeoutMs:45000})}
      catch(error){
        lastError=error;
        const retryable=Boolean(error?.timeout||error?.retryable||error?.code==='USER_ACTION_IN_PROGRESS'||[429,503].includes(Number(error?.status)));
        if(!retryable||attempt===4)throw error;
        await sleep(Math.max(500,Math.min(3000,Number(error?.retryAfterMs||800))));
      }
    }
    throw lastError||new Error('자동 강화 요청을 완료하지 못했습니다.');
  }
  function mount(){
    const button=document.getElementById('breakthroughBtn');if(!button)return;
    const cardId=String(button.dataset.breakthroughCard||'');
    let control=document.getElementById('breakthroughAutoControl');
    if(!control){
      button.insertAdjacentHTML('afterend',`<label class="breakthrough-auto-control" id="breakthroughAutoControl"><input type="checkbox" id="breakthroughAutoCheck"><span><b>자동 강화</b><small>보유 재화 소진 또는 최대 단계까지</small></span><em id="breakthroughAutoStatus">대기</em></label>`);
      control=document.getElementById('breakthroughAutoControl');
    }
    const check=document.getElementById('breakthroughAutoCheck'),status=document.getElementById('breakthroughAutoStatus');
    const active=state.running&&state.cardId===cardId,nextStatus=active?(state.stopRequested?'중지 요청':statusText()):'대기';check.checked=active;button.disabled=active;button.classList.toggle('auto-running',active);if(status.textContent!==nextStatus)status.textContent=nextStatus;
    check.onchange=()=>{
      if(!check.checked){if(active)state.stopRequested=true;status.textContent=active?'중지 요청':'대기';return;}
      if(state.running){check.checked=state.cardId===cardId;return;}
      if(!confirm('보유 재화가 부족하거나 최대 강화 단계에 도달할 때까지 자동 강화할까요?\n실패해도 설정된 재화는 계속 소모됩니다.')){check.checked=false;return;}
      void run(cardId);
    };
  }
  async function run(cardId){
    Object.assign(state,{running:true,stopRequested:false,cardId:String(cardId),attempts:0,successes:0,failures:0,shards:0,stars:0,lastResult:null,lastCinematic:null,lastCinematicLevel:0});mount();
    let finishReason='자동 강화를 완료했습니다.';
    try{
      while(!state.stopRequested){
        if(!cardModalOpen(cardId)){finishReason='카드 창이 닫혀 자동 강화를 중지했습니다.';break;}
        const result=await requestChunk(cardId);
        saveUser(apiUserToLocal(result.user));state.lastResult=result;state.attempts+=Number(result.attempts||0);state.successes+=Number(result.successes||0);state.failures+=Number(result.failures||0);state.shards+=Number(result.spent?.cardShards||0);state.stars+=Number(result.spent?.masterStars||0);
        if(result.cinematic){state.lastCinematic=result.cinematic;state.lastCinematicLevel=Number(result.level||0)}
        if(!cardModalOpen(cardId)){finishReason='카드 창이 닫혀 자동 강화를 중지했습니다.';break;}
        showDetail(String(cardId),'info');mount();
        if(!result.canContinue){finishReason=result.stopMessage||'자동 강화를 완료했습니다.';break;}
        await sleep(90);
      }
      if(state.stopRequested)finishReason='요청에 따라 자동 강화를 중지했습니다.';
    }catch(error){finishReason=error?.message||'자동 강화 처리 중 오류가 발생했습니다.';}
    const summary=`${finishReason}\n\n시도 ${state.attempts.toLocaleString()}회 · 성공 ${state.successes.toLocaleString()}회 · 실패 ${state.failures.toLocaleString()}회\n카드 조각 ${state.shards.toLocaleString()}개 · 마스터의 별 ${state.stars.toLocaleString()}개 사용`;
    const keepModal=cardModalOpen(cardId),cinematic=state.lastCinematic,cinematicLevel=state.lastCinematicLevel,card=cards.find(item=>String(item.id)===String(cardId));Object.assign(state,{running:false,stopRequested:false});
    if(keepModal)mount();
    if(keepModal&&cinematic)await playBreakthroughCinematic(cinematic,card,cinematicLevel);
    alert(summary);
  }
  window.cnineBreakthroughAutoState=state;
  new MutationObserver(mount).observe(document.documentElement,{childList:true,subtree:true});addEventListener('load',mount);mount();
})();
