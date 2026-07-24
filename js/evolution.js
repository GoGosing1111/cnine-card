(()=>{
  const TYPE_SSR='SSR_TO_MA',TYPE_PRESTIGE='MA_TO_PRESTIGE';
  const state={data:null,type:TYPE_SSR,selectedId:'',loading:false,pending:false};
  const esc=value=>typeof escapeHtml==='function'?escapeHtml(value):String(value??'').replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
  const num=value=>Number(value||0).toLocaleString();
  const current=()=>state.data?.types?.[state.type]||null;
  const selected=()=>current()?.candidates?.find(card=>String(card.id)===String(state.selectedId))||null;
  const starIcon=className=>`<span class="${className||'evolution-master-star'}" aria-hidden="true"><i>★</i><b></b></span>`;

  function evolutionView(user){
    return `${summaryBar(user)}<section class="evolution-page">
      <header class="evolution-hero">
        <div><p class="eyebrow">CARD EVOLUTION</p><h2>카드 진화</h2><p>강화 카드를 상위 등급으로 진화시키고 새로운 카드를 획득하세요.</p></div>
        <div class="evolution-star-wallet" id="evolutionStarWallet">${starIcon('evolution-wallet-star')}<span><small>보유 마스터의 별</small><b>불러오는 중</b></span></div>
      </header>
      <div id="evolutionWorkspace" class="evolution-workspace"><div class="evolution-loading"><i></i><b>진화 정보를 불러오는 중입니다.</b></div></div>
    </section>`;
  }

  function candidateCard(card){
    const blocked=!card.eligible;
    return `<button type="button" class="evolution-candidate ${String(card.id)===String(state.selectedId)?'selected':''} ${blocked?'blocked':''}" data-evolution-card="${esc(card.id)}" ${blocked?'disabled':''}>
      <span class="evolution-candidate-art"><img src="${esc(card.image)}" alt="${esc(card.title)}" style="object-position:${Number(card.focusX||50)}% ${Number(card.focusY||50)}%"><i>${esc(card.grade)} +${Number(card.breakthroughLevel||0)}</i></span>
      <span class="evolution-candidate-copy"><b>${esc(card.title)}</b><small>${esc(card.name||'')} · 보유 ${num(card.quantity)}장</small>${blocked?`<em>${esc(card.blockedReason)}</em>`:'<em class="ready">진화 가능</em>'}</span>
    </button>`;
  }

  function selectedPanel(type,card){
    if(!card)return `<div class="evolution-slot empty"><span>01</span><div class="evolution-empty-card"><i>+</i><b>진화할 카드를 선택하세요.</b><small>${type?.sourceGrade||''} +${Number(type?.minBreakthrough||0)} 카드가 필요합니다.</small></div></div>`;
    return `<div class="evolution-slot source">
      <span>01 · SOURCE CARD</span>
      <div class="evolution-selected-card">
        <div class="evolution-selected-art"><img src="${esc(card.image)}" alt="${esc(card.title)}" style="object-position:${Number(card.focusX||50)}% ${Number(card.focusY||50)}%"><i>${esc(card.grade)}</i><strong>+${Number(card.breakthroughLevel||0)}</strong></div>
        <div><small>${esc(card.name||'')}</small><h3>${esc(card.title)}</h3><p>전투력 ${num(card.basePower)}</p><em>진화 완료 시 카드가 완전히 소모됩니다.</em></div>
      </div>
    </div>`;
  }

  function corePanel(type,masterStars){
    const cost=Number(type?.masterStarCost||0),enough=masterStars>=cost;
    return `<div class="evolution-slot core ${state.type===TYPE_PRESTIGE?'prestige':''}">
      <span>02 · EVOLUTION CORE</span>
      <div class="evolution-core-visual"><i class="core-ring one"></i><i class="core-ring two"></i>${starIcon('evolution-core-star')}<b>${state.type===TYPE_PRESTIGE?'PRESTIGE ASCENSION':'EVOLUTION'}</b><small>${esc(type?.label||'')}</small></div>
      <div class="evolution-material-row"><div>${starIcon('evolution-material-icon')}<span><small>필요 재료</small><b>마스터의 별 ${num(cost)}개</b></span></div><em class="${enough?'enough':'shortage'}">보유 ${num(masterStars)}개</em></div>
    </div>`;
  }

  function resultPanel(type){
    const pool=type?.resultPool||[],hasPool=pool.length>0;
    return `<div class="evolution-slot result ${state.type===TYPE_PRESTIGE?'prestige':''}">
      <span>03 · RANDOM RESULT</span>
      <div class="evolution-result-mystery"><i>?</i><b>랜덤 ${esc(type?.targetGrade||'')} 카드 1장</b><small>${hasPool?`현재 결과 카드 ${num(pool.length)}종`:'결과 카드가 등록되지 않았습니다.'}</small></div>
      <button type="button" class="evolution-pool-button" id="evolutionPoolButton" ${hasPool?'':'disabled'}>결과 카드 목록 보기</button>
      <p>활성화된 공개 카드 중 동일 확률로 결정됩니다.</p>
    </div>`;
  }

  function render(){
    const root=document.getElementById('evolutionWorkspace');if(!root||!state.data)return;
    const type=current(),card=selected(),masterStars=Number(state.data.masterStars||0),cost=Number(type?.masterStarCost||0),hasPool=Boolean(type?.resultPool?.length),enabled=state.data.settings?.enabled!==false;
    const canAttempt=enabled&&card?.eligible&&masterStars>=cost&&hasPool&&!state.pending;
    const candidates=type?.candidates||[];
    root.innerHTML=`
      <nav class="evolution-type-tabs" aria-label="진화 종류">
        <button type="button" data-evolution-type="${TYPE_SSR}" class="${state.type===TYPE_SSR?'active':''}"><small>STANDARD EVOLUTION</small><b>SSR → MA</b><span>SSR +10 필요</span></button>
        <button type="button" data-evolution-type="${TYPE_PRESTIGE}" class="${state.type===TYPE_PRESTIGE?'active':''}"><small>PRESTIGE ASCENSION</small><b>MA +13 → PRESTIGE</b><span>MA +13 필요</span></button>
      </nav>
      ${enabled?'':'<div class="evolution-closed-notice">현재 CMS에서 카드 진화가 중지되어 있습니다.</div>'}
      <section class="evolution-layout">
        <aside class="evolution-picker">
          <header><div><p class="eyebrow">SELECT MATERIAL</p><h3>진화 대상 카드</h3></div><span>${num(type?.eligibleCount||0)}장 가능</span></header>
          <div class="evolution-candidate-list">${candidates.length?candidates.map(candidateCard).join(''):`<div class="evolution-candidate-empty"><b>보유한 ${esc(type?.sourceGrade||'')} 카드가 없습니다.</b><small>진화 조건을 충족한 카드가 이곳에 표시됩니다.</small></div>`}</div>
        </aside>
        <div class="evolution-main">
          <div class="evolution-process-grid">${selectedPanel(type,card)}<div class="evolution-flow-arrow"><i></i><b>→</b></div>${corePanel(type,masterStars)}<div class="evolution-flow-arrow"><i></i><b>→</b></div>${resultPanel(type)}</div>
          <div class="evolution-warning-panel"><div><i>!</i><span><b>진화 주의사항</b><small>진화가 완료되면 선택한 강화 카드와 마스터의 별이 소모됩니다. 강화 수치와 돌파 상태는 결과 카드에 계승되지 않습니다.</small></span></div><p>결과 카드 지급에 실패하면 카드와 마스터의 별은 소모되지 않습니다.</p></div>
          <button type="button" class="evolution-submit ${state.type===TYPE_PRESTIGE?'prestige':''}" id="evolutionSubmit" ${canAttempt?'':'disabled'}>${state.pending?'진화 처리 중...':card?`${esc(card.title)} 진화하기`:'진화할 카드 선택'}</button>
          ${card&&masterStars<cost?`<small class="evolution-submit-help">마스터의 별이 ${num(cost-masterStars)}개 부족합니다.</small>`:''}
          ${!hasPool?`<small class="evolution-submit-help">CMS에서 공개 ${esc(type?.targetGrade||'')} 카드를 먼저 등록해야 합니다.</small>`:''}
        </div>
      </section>`;
    document.querySelectorAll('[data-evolution-type]').forEach(button=>button.onclick=()=>switchType(button.dataset.evolutionType));
    document.querySelectorAll('[data-evolution-card]').forEach(button=>button.onclick=()=>{state.selectedId=button.dataset.evolutionCard;render()});
    document.getElementById('evolutionPoolButton')?.addEventListener('click',showPool);
    document.getElementById('evolutionSubmit')?.addEventListener('click',openConfirm);
    updateWallet();
  }

  function updateWallet(){
    const wallet=document.getElementById('evolutionStarWallet');if(!wallet||!state.data)return;
    wallet.querySelector('.evolution-star-wallet>span:last-child b').textContent=`${num(state.data.masterStars)}개`;
  }

  function switchType(type){
    if(!state.data?.types?.[type]||state.pending)return;
    state.type=type;
    state.selectedId=state.data.types[type].candidates.find(card=>card.eligible)?.id||'';
    render();
  }

  function showPool(){
    const type=current(),pool=type?.resultPool||[],modal=document.getElementById('modal');if(!modal||!pool.length)return;
    modal.className='modal show evolution-pool-modal';
    modal.innerHTML=`<div class="modal-panel evolution-pool-panel"><button type="button" class="icon-close" id="evolutionPoolClose">×</button><div class="evolution-pool-head"><p class="eyebrow">RANDOM RESULT POOL</p><h2>${esc(type.targetGrade)} 진화 결과</h2><p>활성화된 카드 ${num(pool.length)}종 중 동일 확률로 1장이 결정됩니다.</p></div><div class="evolution-pool-grid">${pool.map(card=>`<article><img src="${esc(card.image)}" alt="${esc(card.title)}" style="object-position:${Number(card.focusX||50)}% ${Number(card.focusY||50)}%"><span>${esc(card.grade)}</span><b>${esc(card.title)}</b><small>${esc(card.name||'')}</small></article>`).join('')}</div><button type="button" class="btn secondary" id="evolutionPoolConfirm">확인</button></div>`;
    const close=()=>{modal.className='modal';modal.innerHTML=''};
    document.getElementById('evolutionPoolClose').onclick=close;document.getElementById('evolutionPoolConfirm').onclick=close;
  }

  function openConfirm(){
    const type=current(),card=selected(),cost=Number(type?.masterStarCost||0),modal=document.getElementById('modal');if(!modal||!card||state.pending)return;
    modal.className='modal show evolution-confirm-modal';
    modal.innerHTML=`<div class="modal-panel evolution-confirm-panel"><button type="button" class="icon-close" id="evolutionConfirmClose">×</button><p class="eyebrow">FINAL CONFIRMATION</p><h2>진화를 진행하시겠습니까?</h2><div class="evolution-confirm-card"><img src="${esc(card.image)}" alt="${esc(card.title)}" style="object-position:${Number(card.focusX||50)}% ${Number(card.focusY||50)}%"><span><small>${esc(card.grade)} +${Number(card.breakthroughLevel||0)}</small><b>${esc(card.title)}</b><em>마스터의 별 ${num(cost)}개</em></span></div><div class="evolution-confirm-warning"><b>선택한 카드와 재료는 진화 완료 후 복구할 수 없습니다.</b><span>결과는 랜덤 ${esc(type.targetGrade)} 카드로 결정됩니다.</span></div><div class="evolution-confirm-actions"><button type="button" class="btn secondary" id="evolutionConfirmCancel">취소</button><button type="button" class="btn evolution-confirm-submit" id="evolutionConfirmSubmit" disabled>진화 확정 (1)</button></div></div>`;
    const close=()=>{modal.className='modal';modal.innerHTML=''};
    document.getElementById('evolutionConfirmClose').onclick=close;document.getElementById('evolutionConfirmCancel').onclick=close;
    const submit=document.getElementById('evolutionConfirmSubmit');
    setTimeout(()=>{if(submit?.isConnected){submit.disabled=false;submit.textContent='진화 확정'}},1000);
    submit.onclick=()=>attempt(card,type);
  }

  async function attempt(card,type){
    if(state.pending)return;state.pending=true;
    const modal=document.getElementById('modal'),requestId=globalThis.crypto?.randomUUID?.()||`${Date.now()}-${Math.random().toString(36).slice(2)}`;
    modal.className=`modal show evolution-casting-modal ${state.type===TYPE_PRESTIGE?'prestige':''}`;
    modal.innerHTML=`<div class="modal-panel evolution-casting-panel"><div class="evolution-casting-core"><i class="cast-ring a"></i><i class="cast-ring b"></i>${starIcon('evolution-cast-star')}<img src="${esc(card.image)}" alt="${esc(card.title)}" style="object-position:${Number(card.focusX||50)}% ${Number(card.focusY||50)}%"></div><p class="eyebrow">EVOLUTION PROCESS</p><h2>진화 결과를 확정하고 있습니다.</h2><span>창을 닫거나 새로고침하지 마세요.</span></div>`;
    try{
      const result=await apiRequest('evolution/attempt',{method:'POST',body:JSON.stringify({cardId:card.id,evolutionType:state.type,requestId})});
      if(result.user&&typeof saveUser==='function'&&typeof apiUserToLocal==='function')saveUser(apiUserToLocal(result.user));
      await new Promise(resolve=>setTimeout(resolve,700));
      showResult(result);
    }catch(error){
      state.pending=false;
      modal.className='modal show evolution-error-modal';
      modal.innerHTML=`<div class="modal-panel evolution-error-panel"><i>!</i><p class="eyebrow">EVOLUTION FAILED</p><h2>진화 처리에 실패했습니다.</h2><span>${esc(error.message||'잠시 후 다시 시도해주세요.')}</span><small>카드와 마스터의 별은 소모되지 않았습니다.</small><button type="button" class="btn" id="evolutionErrorClose">확인</button></div>`;
      document.getElementById('evolutionErrorClose').onclick=()=>{modal.className='modal';modal.innerHTML='';load()};
    }
  }

  function showResult(result){
    const modal=document.getElementById('modal'),reward=result.reward||{};
    modal.className=`modal show evolution-result-modal ${result.evolutionType===TYPE_PRESTIGE?'prestige':''}`;
    modal.innerHTML=`<div class="modal-panel evolution-result-panel"><div class="evolution-result-rays"></div><p class="eyebrow">EVOLUTION COMPLETE</p><h2>${esc(reward.grade)} 진화 성공</h2><div class="evolution-result-card"><img src="${esc(reward.image)}" alt="${esc(reward.title)}" style="object-position:${Number(reward.focusX||50)}% ${Number(reward.focusY||50)}%"><span>${esc(reward.grade)}</span></div><strong>${esc(reward.title)}</strong><small>${esc(reward.name||'')}</small>${result.duplicate?`<div class="evolution-duplicate-reward"><b>중복 카드 획득</b>${Number(result.masterStarGained||0)>0?`<span>마스터의 별 +${num(result.masterStarGained)}</span>`:''}${Number(result.rewardShards||0)>0?`<span>카드 조각 +${num(result.rewardShards)}</span>`:''}</div>`:'<div class="evolution-new-reward">새로운 카드가 도감에 등록되었습니다.</div>'}<button type="button" class="btn evolution-result-confirm" id="evolutionResultConfirm">확인</button></div>`;
    document.getElementById('evolutionResultConfirm').onclick=()=>{state.pending=false;modal.className='modal';modal.innerHTML='';renderShell('evolution')};
  }

  async function load(){
    const root=document.getElementById('evolutionWorkspace');if(!root||state.loading)return;
    state.loading=true;
    try{
      state.data=await apiRequest('evolution/overview',{}, {ttl:0});
      if(!state.data?.types?.[state.type])state.type=TYPE_SSR;
      const type=current();
      if(!type?.candidates?.some(card=>String(card.id)===String(state.selectedId)&&card.eligible))state.selectedId=type?.candidates?.find(card=>card.eligible)?.id||'';
      render();
    }catch(error){
      root.innerHTML=`<div class="evolution-load-error"><b>진화 정보를 불러오지 못했습니다.</b><span>${esc(error.message)}</span><button type="button" class="btn" id="evolutionRetry">다시 확인</button></div>`;
      document.getElementById('evolutionRetry').onclick=load;
    }finally{state.loading=false}
  }

  window.evolutionView=evolutionView;
  window.bindEvolutionView=load;
})();
