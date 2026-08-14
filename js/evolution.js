(()=>{
  const TYPE_SSR='SSR_TO_MA',TYPE_PRESTIGE='MA_TO_PRESTIGE',TYPE_ZENITH='LIMITED_TO_ZENITH';
  const state={data:null,type:TYPE_SSR,selectedId:'',loading:false,pending:false};
  const esc=value=>typeof escapeHtml==='function'?escapeHtml(value):String(value??'').replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
  const num=value=>Number(value||0).toLocaleString();
  const current=()=>state.data?.types?.[state.type]||null;
  const selected=()=>current()?.candidates?.find(card=>String(card.id)===String(state.selectedId))||null;
  const starIcon=className=>`<span class="${className||'evolution-master-star'}" aria-hidden="true"><i>★</i><b></b></span>`;
  const isPrestige=()=>state.type===TYPE_PRESTIGE;
  const isZenith=()=>state.type===TYPE_ZENITH;
  const normalizeMediaPath=path=>{const value=String(path||'').trim().replace(/\\/g,'/');if(!value)return '';return /^(https?:)?\/\//i.test(value)||value.startsWith('/')?value:`/${value.replace(/^\.\//,'')}`};
  const effectSoundEnabled=()=>{try{return typeof battleSoundEnabled==='function'?battleSoundEnabled():localStorage.getItem('cnineSoundEnabled')!=='0'}catch{return true}};

  function evolutionView(user){
    return `${summaryBar(user)}<section class="evolution-page">
      <header class="evolution-hero">
        <div><p class="eyebrow">CARD EVOLUTION</p><h2>카드 진화</h2><p>SSR·PRESTIGE 진화와 LIMITED +13 카드의 ZENITH 진화를 진행합니다.</p></div>
        <div class="evolution-star-wallet" id="evolutionStarWallet">${starIcon('evolution-wallet-star')}<span><small>보유 마스터의 별</small><b>불러오는 중</b></span></div>
      </header>
      <div id="evolutionWorkspace" class="evolution-workspace"><div class="evolution-loading"><i></i><b>진화 정보를 불러오는 중입니다.</b></div></div>
    </section>`;
  }

  function candidateCard(card){
    const blocked=!card.eligible,progress=card.progress||{};
    return `<button type="button" class="evolution-candidate ${String(card.id)===String(state.selectedId)?'selected':''} ${blocked?'blocked':''}" data-evolution-card="${esc(card.id)}" ${blocked?'disabled':''}>
      <span class="evolution-candidate-art"><img src="${esc(card.image)}" alt="${esc(card.title)}" style="object-position:${Number(card.focusX||50)}% ${Number(card.focusY||50)}%"><i>${esc(card.grade)} +${Number(card.breakthroughLevel||0)}</i></span>
      <span class="evolution-candidate-copy"><b>${esc(card.title)}</b><small>${esc(card.name||'')} · 보유 ${num(card.quantity)}장</small>${blocked?`<em>${esc(card.blockedReason)}</em>`:`<em class="ready">실패 누적 ${num(progress.failedAttempts||0)}회</em>`}</span>
    </button>`;
  }

  function selectedPanel(type,card){
    if(!card)return `<div class="evolution-slot empty"><span>01</span><div class="evolution-empty-card"><i>+</i><b>진화할 카드를 선택하세요.</b><small>${type?.sourceGrade||''} +${Number(type?.minBreakthrough||0)} 카드가 필요합니다.</small></div></div>`;
    const consumeText='진화 성공 시에만 선택한 카드 1장이 소모됩니다.';
    return `<div class="evolution-slot source">
      <span>01 · SOURCE CARD</span>
      <div class="evolution-selected-card">
        <div class="evolution-selected-art"><img src="${esc(card.image)}" alt="${esc(card.title)}" style="object-position:${Number(card.focusX||50)}% ${Number(card.focusY||50)}%"><i>${esc(card.grade)}</i><strong>+${Number(card.breakthroughLevel||0)}</strong></div>
        <div><small>${esc(card.name||'')}</small><h3>${esc(card.title)}</h3><p>전투력 ${num(card.basePower)}</p><em>${consumeText}</em></div>
      </div>
    </div>`;
  }

  function legacyCore(type,card){
    const progress=card?.progress||{},pityAttempts=Number(type?.pityAttempts||1),pityNext=Number(progress.failedAttempts||0)+1>=pityAttempts;
    return `<div class="evolution-slot core legacy">
      <span>02 · EVOLUTION CORE</span>
      <div class="evolution-core-visual"><i class="core-ring one"></i><i class="core-ring two"></i><b>STANDARD EVOLUTION</b><small>${esc(type?.label||'')}</small></div>
      <div class="evolution-legacy-cost"><span>◈ ${num(type?.coinCost)} 코인</span><span>◆ 카드조각 ${num(type?.shardCost)}개</span></div>
      <div class="evolution-legacy-rate"><span>${pityNext?'다음 도전 천장 확정':`성공 확률 ${Number(type?.successRate||0)}%`}</span><small>실패 ${num(progress.failedAttempts||0)}회 / 천장 ${num(pityAttempts)}회</small></div>
    </div>`;
  }

  function prestigeCore(type,masterStars,card){
    const cost=Number(type?.masterStarCost||0),enough=masterStars>=cost,progress=card?.progress||{},pityAttempts=Math.max(1,Number(type?.pityAttempts||1)),pityNext=Number(progress.failedAttempts||0)+1>=pityAttempts;
    return `<div class="evolution-slot core prestige">
      <span>02 · EVOLUTION CORE</span>
      <div class="evolution-core-visual"><i class="core-ring one"></i><i class="core-ring two"></i>${starIcon('evolution-core-star')}<b>PRESTIGE ASCENSION</b><small>${esc(type?.label||'')}</small></div>
      <div class="evolution-material-row"><div>${starIcon('evolution-material-icon')}<span><small>필요 재료</small><b>마스터의 별 ${num(cost)}개</b></span></div><em class="${enough?'enough':'shortage'}">보유 ${num(masterStars)}개</em></div>
      <div class="evolution-legacy-rate"><span>${pityNext?'다음 도전 천장 확정':`성공 확률 ${Number(type?.successRate||0)}%`}</span><small>실패 ${num(progress.failedAttempts||0)}회 / 천장 ${num(pityAttempts)}회</small></div>
    </div>`;
  }

  function zenithCore(type,masterStars,card){
    const starCost=Number(type?.masterStarCost||0),coinCost=Number(type?.coinCost||0),resources=state.data?.userResources||{},enoughStars=masterStars>=starCost,enoughCoin=Number(resources.coin||0)>=coinCost,progress=card?.progress||{},pityAttempts=Math.max(1,Number(type?.pityAttempts||7)),failedAttempts=Number(progress.failedAttempts||0),pityNext=failedAttempts+1>=pityAttempts;
    return `<div class="evolution-slot core prestige zenith">
      <span>02 · ZENITH CORE</span>
      <div class="evolution-core-visual"><i class="core-ring one"></i><i class="core-ring two"></i>${starIcon('evolution-core-star')}<b>ZENITH ASCENSION</b><small>${esc(type?.label||'')}</small></div>
      <div class="evolution-material-row"><div>${starIcon('evolution-material-icon')}<span><small>필요 재료</small><b>마스터의 별 ${num(starCost)}개</b></span></div><em class="${enoughStars?'enough':'shortage'}">보유 ${num(masterStars)}개</em></div>
      <div class="evolution-material-row zenith-coin"><div><span class="evolution-coin-icon">◈</span><span><small>필요 코인</small><b>${num(coinCost)} 코인</b></span></div><em class="${enoughCoin?'enough':'shortage'}">보유 ${num(resources.coin)}코인</em></div>
      <div class="evolution-legacy-rate"><span>${pityNext?'다음 도전 천장 확정':`성공 확률 ${Number(type?.successRate||0)}%`}</span><small>실패 ${num(failedAttempts)}회 / 7번째 도전 확정</small></div>
    </div>`;
  }

  function resultPanel(type){
    const pool=type?.resultPool||[],hasPool=pool.length>0,prestige=isPrestige(),zenith=isZenith(),total=Number(type?.totalResultCount||pool.length),owned=Number(type?.ownedResultCount||0);
    const emptyText=prestige&&type?.resultPoolExhausted?'공개 PRESTIGE 카드를 모두 보유 중입니다.':'결과 카드가 등록되지 않았습니다.';
    return `<div class="evolution-slot result ${prestige?'prestige':''} ${zenith?'zenith':''}">
      <span>03 · RANDOM RESULT</span>
      <div class="evolution-result-mystery"><i>?</i><b>${prestige?'미보유 PRESTIGE 카드 1장':zenith?'랜덤 ZENITH 카드 1장':`랜덤 ${esc(type?.targetGrade||'')} 카드 1장`}</b><small>${hasPool?`${prestige?'획득 가능한 신규 카드':zenith?'공개 ZENITH 결과':'현재 결과 카드'} ${num(pool.length)}종${prestige&&owned>0?` · 보유 제외 ${num(owned)}종`:''}`:emptyText}</small></div>
      <button type="button" class="evolution-pool-button" id="evolutionPoolButton" ${hasPool?'':'disabled'}>결과 카드 목록 보기</button>
      <p>${prestige?`전체 공개 ${num(total)}종 중 이미 보유한 카드는 결과에서 자동 제외됩니다.`:zenith?'활성화된 모든 공개 ZENITH 카드 중 동일 확률로 결정됩니다.':'활성화된 공개 카드 중 동일 확률로 결정됩니다.'}</p>
    </div>`;
  }

  function render(){
    const root=document.getElementById('evolutionWorkspace');if(!root||!state.data)return;
    const type=current(),card=selected(),masterStars=Number(state.data.masterStars||0),resources=state.data.userResources||{},hasPool=Boolean(type?.resultPool?.length),enabled=state.data.settings?.enabled!==false;
    const enoughMaterial=isZenith()?masterStars>=Number(type?.masterStarCost||0)&&Number(resources.coin||0)>=Number(type?.coinCost||0):isPrestige()?masterStars>=Number(type?.masterStarCost||0):Number(resources.coin||0)>=Number(type?.coinCost||0)&&Number(resources.cardShards||0)>=Number(type?.shardCost||0);
    const canAttempt=enabled&&card?.eligible&&enoughMaterial&&hasPool&&!state.pending,candidates=type?.candidates||[];
    const warning=isZenith()?'<div><i>!</i><span><b>ZENITH 진화 주의사항</b><small>도전마다 마스터의 별 30개와 5,000,000코인이 소모됩니다. 성공 확률은 25%이며 7번째 도전은 확정 성공입니다.</small></span></div><p>실패 시 LIMITED +13 카드와 강화 수치는 유지됩니다. 성공 시 원본 1장이 소모되고 공개 ZENITH 카드 1장이 지급됩니다. ZENITH는 덱당 1장만 편성할 수 있습니다.</p>':isPrestige()
      ?'<div><i>!</i><span><b>PRESTIGE 진화 주의사항</b><small>매 도전마다 마스터의 별이 소모됩니다. 실패 시 MA +13 카드와 강화 수치는 유지되며, 성공 시에만 원본 카드가 소모됩니다.</small></span></div><p>성공 결과는 미보유 PRESTIGE 카드에서만 결정됩니다. 전부 보유 중이면 도전이 차단되고 재료도 소모되지 않습니다.</p>'
      :'<div><i>!</i><span><b>SSR 진화 주의사항</b><small>기존 방식과 동일합니다. 실패 시 코인과 카드조각만 소모되고 SSR 카드와 +10 강화는 유지됩니다.</small></span></div><p>성공한 경우에만 SSR 카드가 소모되고 랜덤 MA 카드가 지급됩니다.</p>';
    root.innerHTML=`
      <nav class="evolution-type-tabs three" aria-label="진화 종류">
        <button type="button" data-evolution-type="${TYPE_SSR}" class="${state.type===TYPE_SSR?'active':''}"><small>STANDARD EVOLUTION</small><b>SSR → MA</b><span>기존 확률·천장 방식</span></button>
        <button type="button" data-evolution-type="${TYPE_PRESTIGE}" class="${state.type===TYPE_PRESTIGE?'active':''}"><small>PRESTIGE ASCENSION</small><b>MA +13 → PRESTIGE</b><span>확률·천장 · 마스터의 별</span></button>
        <button type="button" data-evolution-type="${TYPE_ZENITH}" class="${state.type===TYPE_ZENITH?'active':''}"><small>ZENITH ASCENSION</small><b>LIMITED +13 → ZENITH</b><span>25% · 별 30개 · 500만 코인</span></button>
      </nav>
      ${enabled?'':'<div class="evolution-closed-notice">현재 CMS에서 카드 진화가 중지되어 있습니다.</div>'}
      <section class="evolution-layout">
        <aside class="evolution-picker"><header><div><p class="eyebrow">SELECT MATERIAL</p><h3>진화 대상 카드</h3></div><span>${num(type?.eligibleCount||0)}장 가능</span></header><div class="evolution-candidate-list">${candidates.length?candidates.map(candidateCard).join(''):`<div class="evolution-candidate-empty"><b>보유한 ${esc(type?.sourceGrade||'')} 카드가 없습니다.</b><small>진화 조건을 충족한 카드가 이곳에 표시됩니다.</small></div>`}</div></aside>
        <div class="evolution-main">
          <div class="evolution-process-grid">${selectedPanel(type,card)}<div class="evolution-flow-arrow"><i></i><b>→</b></div>${isZenith()?zenithCore(type,masterStars,card):isPrestige()?prestigeCore(type,masterStars,card):legacyCore(type,card)}<div class="evolution-flow-arrow"><i></i><b>→</b></div>${resultPanel(type)}</div>
          <div class="evolution-warning-panel">${warning}</div>
          <button type="button" class="evolution-submit ${isPrestige()?'prestige':''} ${isZenith()?'zenith':''}" id="evolutionSubmit" ${canAttempt?'':'disabled'}>${state.pending?'진화 처리 중...':card?`${esc(card.title)} 진화 도전`:'진화할 카드 선택'}</button>
          ${card&&!enoughMaterial?`<small class="evolution-submit-help">${isZenith()?`필요 재료: 마스터의 별 ${num(type.masterStarCost)}개 + ${num(type.coinCost)}코인`:isPrestige()?`마스터의 별이 ${num(Number(type.masterStarCost||0)-masterStars)}개 부족합니다.`:`진화 재료가 부족합니다. (${num(type.coinCost)}코인 / 카드조각 ${num(type.shardCost)}개)`}</small>`:''}
          ${!hasPool?`<small class="evolution-submit-help">${isPrestige()&&type?.resultPoolExhausted?'현재 공개 PRESTIGE 카드를 모두 보유 중이라 진화할 수 없습니다.':'CMS에서 공개 '+esc(type?.targetGrade||'')+' 카드를 먼저 등록해야 합니다.'}</small>`:''}
        </div>
      </section>`;
    document.querySelectorAll('[data-evolution-type]').forEach(button=>button.onclick=()=>switchType(button.dataset.evolutionType));
    document.querySelectorAll('[data-evolution-card]').forEach(button=>button.onclick=()=>{state.selectedId=button.dataset.evolutionCard;render()});
    document.getElementById('evolutionPoolButton')?.addEventListener('click',showPool);
    document.getElementById('evolutionSubmit')?.addEventListener('click',openConfirm);
    updateWallet();
  }

  function updateWallet(){const wallet=document.getElementById('evolutionStarWallet');if(wallet&&state.data)wallet.querySelector('.evolution-star-wallet>span:last-child b').textContent=`${num(state.data.masterStars)}개`}
  function switchType(type){if(!state.data?.types?.[type]||state.pending)return;state.type=type;state.selectedId=state.data.types[type].candidates.find(card=>card.eligible)?.id||'';render()}
  function showPool(){const type=current(),pool=type?.resultPool||[],modal=document.getElementById('modal');if(!modal||!pool.length)return;const prestige=isPrestige(),zenith=isZenith();modal.className='modal show evolution-pool-modal';modal.innerHTML=`<div class="modal-panel evolution-pool-panel"><button type="button" class="icon-close" id="evolutionPoolClose">×</button><div class="evolution-pool-head"><p class="eyebrow">RANDOM RESULT POOL</p><h2>${esc(type.targetGrade)} 진화 결과</h2><p>${prestige?`현재 보유하지 않은 PRESTIGE 카드 ${num(pool.length)}종 중 동일 확률로 1장이 결정됩니다. 보유 카드는 자동 제외됩니다.`:zenith?`활성화된 공개 ZENITH 카드 ${num(pool.length)}종 중 동일 확률로 1장이 결정됩니다.`:`활성화된 카드 ${num(pool.length)}종 중 동일 확률로 1장이 결정됩니다.`}</p></div><div class="evolution-pool-grid">${pool.map(card=>`<article><img src="${esc(card.image)}" alt="${esc(card.title)}" style="object-position:${Number(card.focusX||50)}% ${Number(card.focusY||50)}%"><span>${esc(card.grade)}</span><b>${esc(card.title)}</b><small>${esc(card.name||'')}</small></article>`).join('')}</div><button type="button" class="btn secondary" id="evolutionPoolConfirm">확인</button></div>`;const close=()=>{modal.className='modal';modal.innerHTML=''};document.getElementById('evolutionPoolClose').onclick=close;document.getElementById('evolutionPoolConfirm').onclick=close}

  function openConfirm(){
    const type=current(),card=selected(),modal=document.getElementById('modal');if(!modal||!card||state.pending)return;
    const material=isZenith()?`마스터의 별 ${num(type.masterStarCost)}개 · ${num(type.coinCost)}코인`:isPrestige()?`마스터의 별 ${num(type.masterStarCost)}개`:`${num(type.coinCost)}코인 · 카드조각 ${num(type.shardCost)}개`;
    const warning=isZenith()?'실패하면 재료만 소모되고 LIMITED +13 카드는 유지됩니다. 성공 시 원본 1장이 소모되고 공개 ZENITH 카드 1장이 지급됩니다.':isPrestige()?'실패하면 마스터의 별만 소모되고 MA +13 카드는 유지됩니다. 성공 시에는 중복되지 않는 PRESTIGE 카드가 지급되고 원본 카드가 소모됩니다.':'실패하면 코인과 카드조각만 소모되며 SSR 카드와 +10 강화는 유지됩니다.';
    modal.className='modal show evolution-confirm-modal';
    modal.innerHTML=`<div class="modal-panel evolution-confirm-panel"><button type="button" class="icon-close" id="evolutionConfirmClose">×</button><p class="eyebrow">FINAL CONFIRMATION</p><h2>진화에 도전하시겠습니까?</h2><div class="evolution-confirm-card"><img src="${esc(card.image)}" alt="${esc(card.title)}" style="object-position:${Number(card.focusX||50)}% ${Number(card.focusY||50)}%"><span><small>${esc(card.grade)} +${Number(card.breakthroughLevel||0)}</small><b>${esc(card.title)}</b><em>${material}</em></span></div><div class="evolution-confirm-warning"><b>${warning}</b><span>${isZenith()?'성공 확률 25% · 7번째 도전 확정 · ZENITH 덱 편성은 1장 제한입니다.':isPrestige()?'결과는 현재 미보유 PRESTIGE 카드 중에서 결정됩니다.':`결과는 랜덤 ${esc(type.targetGrade)} 카드로 결정됩니다.`}</span></div><div class="evolution-confirm-actions"><button type="button" class="btn secondary" id="evolutionConfirmCancel">취소</button><button type="button" class="btn evolution-confirm-submit" id="evolutionConfirmSubmit" disabled>진화 확정 (1)</button></div></div>`;
    const close=()=>{modal.className='modal';modal.innerHTML=''};document.getElementById('evolutionConfirmClose').onclick=close;document.getElementById('evolutionConfirmCancel').onclick=close;const submit=document.getElementById('evolutionConfirmSubmit');setTimeout(()=>{if(submit?.isConnected){submit.disabled=false;submit.textContent='진화 도전'}},1000);submit.onclick=()=>attempt(card,type);
  }

  async function attempt(card,type){
    if(state.pending)return;state.pending=true;
    const modal=document.getElementById('modal'),requestId=globalThis.crypto?.randomUUID?.()||`${Date.now()}-${Math.random().toString(36).slice(2)}`;
    modal.className=`modal show evolution-casting-modal ${isPrestige()?'prestige':''} ${isZenith()?'zenith':''}`;
    modal.innerHTML=`<div class="modal-panel evolution-casting-panel"><div class="evolution-casting-core"><i class="cast-ring a"></i><i class="cast-ring b"></i>${(isPrestige()||isZenith())?starIcon('evolution-cast-star'):''}<img src="${esc(card.image)}" alt="${esc(card.title)}" style="object-position:${Number(card.focusX||50)}% ${Number(card.focusY||50)}%"></div><p class="eyebrow">EVOLUTION PROCESS</p><h2>진화 성공 여부를 확인하고 있습니다.</h2><span>창을 닫거나 새로고침하지 마세요.</span></div>`;
    try{const result=await apiRequest('evolution/attempt',{method:'POST',body:JSON.stringify({cardId:card.id,evolutionType:state.type,requestId})});if(result.user&&typeof saveUser==='function'&&typeof apiUserToLocal==='function')saveUser(apiUserToLocal(result.user));await new Promise(resolve=>setTimeout(resolve,650));await showResult(result)}catch(error){state.pending=false;modal.className='modal show evolution-error-modal';modal.innerHTML=`<div class="modal-panel evolution-error-panel"><i>!</i><p class="eyebrow">EVOLUTION ERROR</p><h2>진화 처리에 실패했습니다.</h2><span>${esc(error.message||'잠시 후 다시 시도해주세요.')}</span><small>${isPrestige()||isZenith()?'처리되지 않은 요청의 카드·코인·마스터의 별은 소모되지 않았습니다.':'처리되지 않은 요청의 재료는 소모되지 않았습니다.'}</small><button type="button" class="btn" id="evolutionErrorClose">확인</button></div>`;document.getElementById('evolutionErrorClose').onclick=()=>{modal.className='modal';modal.innerHTML='';load()}}
  }

  async function playPrestigeSuccessEffect(result){
    if(result?.evolutionType!==TYPE_PRESTIGE||!result?.success||!result?.successEffect)return;
    const modal=document.getElementById('modal');
    if(!modal)return;
    const effect=result.successEffect||{};
    const reward=result.reward||{};
    const mediaSrc=String(effect.mediaUrl||'').trim()?normalizeMediaPath(effect.mediaUrl):'';
    const soundSrc=String(effect.soundUrl||'').trim()?normalizeMediaPath(effect.soundUrl):'';
    const duration=Math.max(800,Math.min(30000,Number(effect.durationMs||3200)));
    const volumePercent=Math.max(0,Math.min(100,Number(effect.volumePercent??70)));
    const volume=volumePercent/100;
    const isVideo=/\.(mp4|webm)(?:[?#].*)?$/i.test(mediaSrc);
    const title=reward.title||effect.name||'PRESTIGE EVOLUTION';
    const subtitle=effect.warningText||'PRESTIGE ASCENSION';
    const description=effect.description||'MA +13 카드가 PRESTIGE 카드로 진화했습니다.';
    modal.className='modal show prestige-success-cinematic-modal';
    modal.innerHTML=`<div class="prestige-success-overlay"><div class="prestige-success-overlay-flash"></div><div class="prestige-success-overlay-media">${mediaSrc?(isVideo?`<video src="${esc(mediaSrc)}" ${soundSrc?'muted':''} playsinline preload="auto"></video>`:`<img src="${esc(mediaSrc)}" alt="${esc(title)}">`):'<div class="prestige-success-overlay-fallback">PRESTIGE</div>'}</div><div class="prestige-success-overlay-title"><small>${esc(subtitle)}</small><strong>${esc(title)}</strong><span>${esc(description)}</span>${reward.grade?`<em>${esc(reward.grade)} 획득</em>`:''}</div><button type="button" class="prestige-success-skip" id="prestigeSuccessSkip">건너뛰기</button></div>`;
    const overlay=modal.querySelector('.prestige-success-overlay');
    let audio=null;
    if(soundSrc&&effectSoundEnabled()&&volume>0){audio=new Audio(soundSrc);audio.volume=volume;audio.play().catch(()=>{});}
    await new Promise(resolve=>{
      let done=false;
      const finish=()=>{
        if(done)return;
        done=true;
        clearTimeout(timer);
        overlay?.classList.add('closing');
        setTimeout(()=>{try{if(audio){audio.pause();audio.currentTime=0}}catch{}resolve()},220);
      };
      const timer=setTimeout(finish,duration);
      document.getElementById('prestigeSuccessSkip')?.addEventListener('click',finish,{once:true});
      overlay?.addEventListener('click',event=>{if(event.target===overlay)finish()},{once:true});
      const video=overlay?.querySelector('video');
      if(video){
        video.addEventListener('loadedmetadata',()=>{const portrait=video.videoHeight>video.videoWidth;video.classList.toggle('is-portrait',portrait);video.classList.toggle('is-landscape',!portrait)},{once:true});
        video.volume=volume;
        video.muted=Boolean(soundSrc)||!effectSoundEnabled()||volume<=0;
        video.addEventListener('ended',finish,{once:true});
        video.addEventListener('error',()=>{overlay.classList.add('media-failed');setTimeout(finish,700)},{once:true});
        const playback=video.play();
        if(playback&&typeof playback.catch==='function')playback.catch(()=>{video.muted=true;video.play().catch(()=>overlay.classList.add('media-failed'))});
      }
      const img=overlay?.querySelector('img');
      if(img){
        img.addEventListener('load',()=>{const portrait=img.naturalHeight>img.naturalWidth;img.classList.toggle('is-portrait',portrait);img.classList.toggle('is-landscape',!portrait)},{once:true});
        img.addEventListener('error',()=>{overlay.classList.add('media-failed');const mediaBox=overlay.querySelector('.prestige-success-overlay-media');if(mediaBox)mediaBox.innerHTML='<div class="prestige-success-overlay-fallback">PRESTIGE</div>'},{once:true});
      }
      if(navigator.vibrate)navigator.vibrate([120,60,180,70,120]);
    });
    modal.className='modal';
    modal.innerHTML='';
  }

  async function showResult(result){
    const modal=document.getElementById('modal');
    if(!result.success){
      const prestige=result.evolutionType===TYPE_PRESTIGE,zenith=result.evolutionType===TYPE_ZENITH,nextPity=Number(result.progress?.failedAttempts||0)+1>=Number(result.pityAttempts||1);
      modal.className='modal show evolution-error-modal';
      modal.innerHTML=`<div class="modal-panel evolution-error-panel"><i>×</i><p class="eyebrow">EVOLUTION FAILED</p><h2>${num(result.attemptNo)}번째 진화 도전 실패</h2><span>${zenith?'마스터의 별 30개와 5,000,000코인이 소모되었습니다.':prestige?'마스터의 별이 소모되었습니다.':'코인과 카드조각이 소모되었습니다.'}</span><small>${zenith?'LIMITED +13 카드와 강화 수치는 그대로 유지됩니다.':prestige?'MA +13 카드와 강화 수치는 그대로 유지됩니다.':'SSR 카드와 +10 강화는 그대로 유지됩니다.'}${nextPity?' 다음 도전은 천장 확정입니다.':''}</small><button type="button" class="btn" id="evolutionFailureClose">확인</button></div>`;
      document.getElementById('evolutionFailureClose').onclick=()=>{state.pending=false;modal.className='modal';modal.innerHTML='';renderShell('evolution')};return;
    }
    await playPrestigeSuccessEffect(result);
    const reward=result.reward||{};modal.className=`modal show evolution-result-modal ${result.evolutionType===TYPE_PRESTIGE?'prestige':''} ${result.evolutionType===TYPE_ZENITH?'zenith':''}`;
    modal.innerHTML=`<div class="modal-panel evolution-result-panel"><div class="evolution-result-rays"></div><p class="eyebrow">EVOLUTION COMPLETE</p><h2>${esc(reward.grade)} 진화 성공</h2><div class="evolution-result-card"><img src="${esc(reward.image)}" alt="${esc(reward.title)}" style="object-position:${Number(reward.focusX||50)}% ${Number(reward.focusY||50)}%"><span>${esc(reward.grade)}</span></div><strong>${esc(reward.title)}</strong><small>${esc(reward.name||'')}</small>${result.duplicate?`<div class="evolution-duplicate-reward"><b>중복 카드 획득</b>${result.evolutionType===TYPE_ZENITH?'<span>ZENITH 보유 수량 +1</span>':''}${Number(result.masterStarGained||0)>0?`<span>마스터의 별 +${num(result.masterStarGained)}</span>`:''}${Number(result.rewardShards||0)>0?`<span>카드 조각 +${num(result.rewardShards)}</span>`:''}</div>`:`<div class="evolution-new-reward">${result.evolutionType===TYPE_ZENITH?'최상위 ZENITH 카드가 도감에 등록되었습니다. 덱에는 1장만 편성할 수 있습니다.':result.evolutionType===TYPE_PRESTIGE?'중복 없이 새로운 PRESTIGE 카드가 도감에 등록되었습니다.':'새로운 카드가 도감에 등록되었습니다.'}</div>`}<button type="button" class="btn evolution-result-confirm" id="evolutionResultConfirm">확인</button></div>`;
    document.getElementById('evolutionResultConfirm').onclick=()=>{state.pending=false;modal.className='modal';modal.innerHTML='';renderShell('evolution')};
  }

  async function load(){const root=document.getElementById('evolutionWorkspace');if(!root||state.loading)return;state.loading=true;try{state.data=await apiRequest('evolution/overview',{}, {ttl:0});if(!state.data?.types?.[state.type])state.type=TYPE_SSR;const type=current();if(!type?.candidates?.some(card=>String(card.id)===String(state.selectedId)&&card.eligible))state.selectedId=type?.candidates?.find(card=>card.eligible)?.id||'';render()}catch(error){root.innerHTML=`<div class="evolution-load-error"><b>진화 정보를 불러오지 못했습니다.</b><span>${esc(error.message)}</span><button type="button" class="btn" id="evolutionRetry">다시 확인</button></div>`;document.getElementById('evolutionRetry').onclick=load}finally{state.loading=false}}
  window.evolutionView=evolutionView;window.bindEvolutionView=load;
})();
