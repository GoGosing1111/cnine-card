(()=>{
  const TYPE_SSR='SSR_TO_MA',TYPE_PRESTIGE='MA_TO_PRESTIGE',TYPE_ZENITH='LIMITED_TO_ZENITH';
  const modes={SSR_TO_MA:{name:'MA 진화',short:'MA',tone:'cyan'},MA_TO_PRESTIGE:{name:'프레스티지 진화',short:'PRESTIGE',tone:'gold'},LIMITED_TO_ZENITH:{name:'제니스 진화',short:'ZENITH',tone:'violet'}};
  const state={data:null,type:TYPE_SSR,selected:new Set(),attempts:1,search:'',showBlocked:false,pending:false,recovery:null,account:'',loadId:0};
  const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const num=value=>Number(value||0).toLocaleString('ko-KR');
  const current=()=>state.data?.types?.[state.type];
  const cards=()=>current()?.candidates||[];
  const selectedCards=()=>cards().filter(card=>state.selected.has(card.id));
  const storageKey=()=>`cnine:evolution-batch:v2035:${state.account}`;
  const exists=()=>Boolean(document.getElementById('evolutionWorkspace'));
  const normalizeMediaPath=path=>{const value=String(path||'').trim().replace(/\\/g,'/');if(!value)return '';return /^(https?:)?\/\//i.test(value)||value.startsWith('/')?value:`/${value.replace(/^\.\//,'')}`};
  const effectSoundEnabled=()=>{try{return typeof battleSoundEnabled==='function'?battleSoundEnabled():localStorage.getItem('cnineSoundEnabled')!=='0'}catch{return true}};
  const costText=(cost,multiplier=1)=>[cost.coinCost?`${num(cost.coinCost*multiplier)} 코인`:'',cost.shardCost?`조각 ${num(cost.shardCost*multiplier)}`:'',cost.masterStarCost?`마스터의 별 ${num(cost.masterStarCost*multiplier)}`:''].filter(Boolean).join(' · ')||'추가 재료 없음';
  const illustration=card=>typeof responsiveCardImageMarkup==='function'
    ?responsiveCardImageMarkup({...card,image:normalizeMediaPath(card.image),title:card.title||card.name},{enabled:true})
    :`<img src="${esc(normalizeMediaPath(card.image))}" alt="${esc(card.title||card.name)}" loading="lazy" decoding="async" style="object-position:${Math.min(100,Math.max(0,Number(card.focusX??50)))}% ${Math.min(100,Math.max(0,Number(card.focusY??50)))}%">`;

  function evolutionView(user){
    const account=String(user?.serverUserId||user?.id||user?.nickname||'guest');
    if(state.account!==account){dismissDialog();state.account=account;state.selected.clear();state.recovery=null;state.data=null;state.pending=false;state.type=TYPE_SSR}
    return `${summaryBar(user)}<section class="evolution-page evx-page"><div id="evolutionWorkspace" class="evx-workspace"><div class="evx-empty" role="status">진화할 수 있는 카드를 불러오는 중입니다.</div></div></section>`;
  }
  function restore(){try{state.recovery=JSON.parse(localStorage.getItem(storageKey())||'null')}catch{state.recovery=null}}
  function persist(value){localStorage.setItem(storageKey(),JSON.stringify(value));state.recovery=value}
  function clearRecovery(){try{localStorage.removeItem(storageKey())}catch{}state.recovery=null}
  function canRun(){
    const rule=current(),count=state.selected.size*state.attempts,r=state.data?.userResources||{};
    return Boolean(rule&&count&&state.data.settings.enabled&&!state.pending&&!state.recovery&&rule.resultPool.length&&(!rule.coinCost||Number(r.coin||0)>=rule.coinCost*count)&&(!rule.shardCost||Number(r.cardShards||0)>=rule.shardCost*count)&&(!rule.masterStarCost||Number(state.data.masterStars||0)>=rule.masterStarCost*count));
  }
  function resourceRows(multiplier){
    const rule=current(),r=state.data.userResources;
    return [["코인",rule.coinCost,r.coin],["카드조각",rule.shardCost,r.cardShards],["마스터의 별",rule.masterStarCost,state.data.masterStars]].filter(([,cost])=>cost>0).map(([label,cost,owned])=>`<div class="evx-cost ${owned<cost*multiplier?'is-short':''}"><span>${label}<small>보유 ${num(owned)}</small></span><b>${num(cost*multiplier)}<small>${owned<cost*multiplier?'재료 부족':'최대 소모'}</small></b></div>`).join('');
  }
  function render(){
    const box=document.getElementById('evolutionWorkspace');if(!box||!state.data)return;
    const rule=current(),mode=modes[state.type],eligible=cards().filter(card=>card.eligible).length;
    box.dataset.tone=mode.tone;
    box.innerHTML=`<header class="evx-top"><div><span class="evx-kicker">EVOLUTION</span><p>다음 등급으로, 한 번에.</p></div><button type="button" class="evx-text-btn" id="evxHelp">진화 안내 <span aria-hidden="true">↗</span></button></header>
      <nav class="evx-tabs" aria-label="진화 종류">${Object.entries(modes).map(([type,m])=>`<button type="button" data-mode="${type}" aria-pressed="${state.type===type}" ${state.pending?'disabled':''}><span>${m.name}</span><small>${state.data.types[type].sourceGrade} +${state.data.types[type].minBreakthrough} → ${m.short}</small></button>`).join('')}</nav>
      <div class="evx-rulebar"><span>성공 확률 <b>${num(rule.successRate)}%</b></span><span>확정 진화 <b>${num(rule.pityAttempts)}번째</b></span><span>진화 가능 <b>${num(eligible)}종</b></span><button type="button" class="evx-text-btn" id="evxPool">결과 카드 ${num(rule.resultPool.length)}종 <span aria-hidden="true">↗</span></button></div>
      ${state.data.settings.enabled?'':'<div class="evx-notice" role="status">현재 카드 진화가 일시 중지되어 있습니다.</div>'}
      <div id="evxRecovery"></div>
      <div class="evx-mobile-setup"><div><label for="evxMobileAttempts">카드별 최대 시도</label><small>성공하면 해당 카드 자동 중단</small></div><div class="evx-attempt-controls"><div class="evx-presets">${[1,5,10].map(n=>`<button type="button" data-attempts="${n}" aria-pressed="${state.attempts===n}">${n}회</button>`).join('')}</div><input id="evxMobileAttempts" type="number" inputmode="numeric" min="1" max="10" value="${state.attempts}" aria-label="모바일 카드별 최대 시도 횟수"></div></div>
      <div class="evx-layout"><div class="evx-collection"><div class="evx-collection-head"><h3>진화할 카드 선택</h3><span>한 번에 최대 20종</span></div>
        <div class="evx-tools"><label class="evx-search"><span aria-hidden="true">⌕</span><input id="evxSearch" type="search" placeholder="카드 이름 검색" aria-label="카드 이름 검색" value="${esc(state.search)}"></label><label class="evx-toggle"><input id="evxBlocked" type="checkbox" ${state.showBlocked?'checked':''}>진화 불가 포함</label></div>
        <div class="evx-selectbar"><span id="evxVisibleCount"></span><div><button type="button" id="evxSelectAll">전체 선택</button><button type="button" id="evxClear">선택 해제</button></div></div>
        <div class="evx-grid" id="evxCardGrid"></div><div class="evx-inline-status" id="evxSelectionStatus" aria-live="polite"></div></div>
      <aside class="evx-checkout"><div class="evx-checkout-head"><span class="evx-kicker">YOUR SELECTION</span><h3>선택 카드 <b id="evxSelectedCount">0</b><small>종</small></h3></div>
        <div class="evx-selected-strip" id="evxSelectedStrip"></div>
        <label class="evx-attempt-label" for="evxAttempts">카드별 최대 시도 횟수</label><div class="evx-attempt-controls"><div class="evx-presets">${[1,5,10].map(n=>`<button type="button" data-attempts="${n}" aria-pressed="${state.attempts===n}">${n}회</button>`).join('')}</div><input id="evxAttempts" type="number" inputmode="numeric" min="1" max="10" step="1" value="${state.attempts}" aria-label="카드별 최대 시도 횟수"></div>
        <p class="evx-hint">성공한 카드는 자동으로 멈춥니다.<br>실제 시도한 횟수만큼만 재료를 소모합니다.</p><div id="evxCosts" class="evx-costs"></div>
        <div class="evx-checkout-action"><div id="evxAttemptSummary" aria-live="polite"></div><button type="button" class="evx-primary" id="evxStart" disabled>카드를 선택하세요</button></div>
        <p class="evx-consumption-note">성공 시 원본 카드의 강화와 중복 보유분 전체가 소모됩니다. 실패 시 카드는 유지됩니다.</p>
      </aside></div>`;
    box.querySelectorAll('[data-mode]').forEach(button=>button.onclick=()=>{if(state.pending)return;state.type=button.dataset.mode;state.selected.clear();state.search='';state.showBlocked=false;render()});
    box.querySelector('#evxSearch').oninput=event=>{state.search=event.target.value;renderGrid()};
    box.querySelector('#evxBlocked').onchange=event=>{state.showBlocked=event.target.checked;renderGrid()};
    box.querySelector('#evxSelectAll').onclick=()=>{if(state.pending||state.recovery)return;for(const card of filtered().filter(card=>card.eligible)){if(state.selected.size>=20)break;state.selected.add(card.id)}syncSelectionTiles();updateCheckout()};
    box.querySelector('#evxClear').onclick=()=>{if(state.pending)return;state.selected.clear();syncSelectionTiles();updateCheckout()};
    box.querySelectorAll('[data-attempts]').forEach(button=>button.onclick=()=>setAttempts(Number(button.dataset.attempts)));
    box.querySelector('#evxAttempts').onchange=event=>setAttempts(Number(event.target.value));
    box.querySelector('#evxMobileAttempts').onchange=event=>setAttempts(Number(event.target.value));
    box.querySelector('#evxStart').onclick=openConfirm;
    box.querySelector('#evxHelp').onclick=showHelp;box.querySelector('#evxPool').onclick=showPool;
    renderGrid();updateCheckout();renderRecovery();
  }
  function setAttempts(value){if(state.pending||state.recovery)return;state.attempts=Math.max(1,Math.min(10,Math.floor(value)||1));document.getElementById('evxAttempts').value=state.attempts;document.getElementById('evxMobileAttempts').value=state.attempts;document.querySelectorAll('[data-attempts]').forEach(button=>button.setAttribute('aria-pressed',String(Number(button.dataset.attempts)===state.attempts)));updateCheckout()}
  const filtered=()=>cards().filter(card=>(state.showBlocked||card.eligible)&&`${card.title} ${card.name}`.toLowerCase().includes(state.search.trim().toLowerCase()));
  function syncSelectionTiles(){
    document.querySelectorAll('#evxCardGrid [data-card]').forEach(button=>{
      const chosen=state.selected.has(button.dataset.card);
      button.classList.toggle('is-selected',chosen);
      button.setAttribute('aria-pressed',String(chosen));
      button.querySelector('.evx-check').textContent=chosen?'✓':'+';
    });
  }
  function renderGrid(){
    const grid=document.getElementById('evxCardGrid');if(!grid)return;
    const visible=filtered();document.getElementById('evxVisibleCount').textContent=`${num(visible.length)}종 표시`;
    grid.innerHTML=visible.length?visible.map(card=>{const chosen=state.selected.has(card.id),failed=card.progress?.success?0:Number(card.progress?.failedAttempts||0);return `<button type="button" class="evx-card ${chosen?'is-selected':''} ${card.eligible?'':'is-blocked'}" data-card="${esc(card.id)}" aria-pressed="${chosen}" ${!card.eligible||state.pending||state.recovery?'disabled':''}><span class="evx-card-art">${illustration(card)}<span class="evx-grade">${esc(card.grade)} +${card.breakthroughLevel}</span><span class="evx-check" aria-hidden="true">${chosen?'✓':'+'}</span><span class="evx-stock">보유 ${num(card.quantity)}</span></span><span class="evx-card-info"><strong>${esc(card.title||card.name)}</strong><small>${card.eligible?`실패 ${failed}회 · ${Math.max(1,current().pityAttempts-failed)}회 내 확정`:esc(card.blockedReason)}</small></span></button>`}).join(''):`<div class="evx-empty"><span aria-hidden="true">＋</span><h3>${state.search?'검색 결과가 없습니다':'진화 가능한 카드가 없습니다'}</h3><p>${state.search?'다른 카드 이름으로 검색해 주세요.':`${esc(current().sourceGrade)} +${current().minBreakthrough} 카드를 준비해 주세요.`}</p>${!state.search&&!state.showBlocked&&cards().length?'<button type="button" class="evx-secondary" id="evxShowBlocked">보유 카드와 조건 확인</button>':''}</div>`;
    grid.querySelectorAll('[data-card]').forEach(button=>button.onclick=()=>{if(state.pending||state.recovery)return;const id=button.dataset.card;if(state.selected.has(id))state.selected.delete(id);else if(state.selected.size<20)state.selected.add(id);else{document.getElementById('evxSelectionStatus').textContent='한 번에 최대 20종까지 선택할 수 있습니다.';return}syncSelectionTiles();updateCheckout()});
    grid.querySelector('#evxShowBlocked')?.addEventListener('click',()=>{state.showBlocked=true;document.getElementById('evxBlocked').checked=true;renderGrid()});
    grid.querySelectorAll('img').forEach(img=>img.onerror=()=>{img.hidden=true;(img.closest('.evx-card-art')||img.parentElement).classList.add('image-missing')});
  }
  function updateCheckout(){
    if(!document.getElementById('evxSelectedCount')||!state.data)return;
    const chosen=selectedCards(),count=chosen.length*state.attempts;
    document.getElementById('evolutionWorkspace').dataset.hasSelection=String(chosen.length>0);
    document.getElementById('evxSelectedCount').textContent=chosen.length;
    document.getElementById('evxSelectedStrip').innerHTML=chosen.length?chosen.slice(0,5).map(card=>`<span title="${esc(card.title)}">${illustration(card)}</span>`).join('')+(chosen.length>5?`<b>+${chosen.length-5}</b>`:''):'<span class="evx-strip-empty">카드를 눌러 담아 주세요</span>';
    document.getElementById('evxCosts').innerHTML=resourceRows(count);
    document.getElementById('evxAttemptSummary').innerHTML=`<span>최대 <b>${num(count)}회</b> 시도</span><small>${chosen.length}종 × 최대 ${state.attempts}회</small><small class="evx-mobile-cost">${costText(current(),count)}</small>`;
    const button=document.getElementById('evxStart');button.disabled=!canRun();button.textContent=state.pending?'진화 처리 중…':state.recovery?'이전 결과 확인 필요':!chosen.length?'카드를 선택하세요':!current().resultPool.length?'결과 카드 없음':canRun()?`${chosen.length}종 일괄 진화`:'재료가 부족합니다';
    document.querySelectorAll('#evxAttempts,#evxMobileAttempts,[data-attempts],#evxSelectAll,#evxClear').forEach(control=>control.disabled=state.pending||Boolean(state.recovery));
  }
  let dialogFocus=null,dialogOverflow='',dialogClose=null;
  function dismissDialog(){const dialog=document.getElementById('evxDialog');if(!dialog)return;dialog.remove();document.body.style.overflow=dialogOverflow;document.removeEventListener('keydown',dialogKeys);const callback=dialogClose;dialogClose=null;callback?.();dialogFocus?.focus?.()}
  function dialogKeys(event){const dialog=document.getElementById('evxDialog');if(!dialog)return;if(event.key==='Escape'&&dialog.dataset.dismiss==='true'){event.preventDefault();dismissDialog()}if(event.key==='Tab'){const nodes=[...dialog.querySelectorAll('button:not(:disabled),input:not(:disabled),a[href]')];if(!nodes.length){event.preventDefault();return}const first=nodes[0],last=nodes.at(-1);if(event.shiftKey&&document.activeElement===first){event.preventDefault();last.focus()}else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first.focus()}}}
  function openDialog(title,body,{dismiss=true,onClose=null,wide=false}={}){
    dismissDialog();dialogFocus=document.activeElement;dialogOverflow=document.body.style.overflow;dialogClose=onClose;
    const overlay=document.createElement('div');overlay.id='evxDialog';overlay.className='evx-dialog-overlay';overlay.dataset.dismiss=String(dismiss);
    overlay.innerHTML=`<section class="evx-dialog ${wide?'is-wide':''}" role="dialog" aria-modal="true" aria-labelledby="evxDialogTitle" tabindex="-1"><header><div><span class="evx-kicker">CARD EVOLUTION</span><h2 id="evxDialogTitle">${esc(title)}</h2></div>${dismiss?'<button type="button" class="evx-dialog-close" aria-label="닫기">×</button>':''}</header>${body}</section>`;
    document.body.append(overlay);document.body.style.overflow='hidden';overlay.querySelector('.evx-dialog-close')?.addEventListener('click',dismissDialog);overlay.onclick=event=>{if(event.target===overlay&&dismiss)dismissDialog()};document.addEventListener('keydown',dialogKeys);overlay.querySelector('button,input,.evx-dialog')?.focus();
  }
  function showHelp(){
    openDialog('진화는 이렇게 진행돼요',`<ol class="evx-help"><li><b>진화 종류와 카드를 선택</b><p>MA 진화는 SSR +10, 프레스티지 진화는 MA +13, 제니스 진화는 LIMITED +13부터 가능합니다.</p></li><li><b>카드별 최대 시도 횟수 설정</b><p>1~20종의 카드마다 최대 1~10회 시도합니다. 성공하면 해당 카드는 바로 멈추며, 남은 횟수의 비용은 소모하지 않습니다.</p></li><li><b>성공과 실패 결과를 한눈에 확인</b><p>성공 시 원본의 강화와 중복 보유분 전체가 소모되고, 결과 카드 1장을 획득합니다. 실패 시 카드는 유지되고 실패 횟수는 다음 진화에 이어집니다.</p></li></ol><div class="evx-notice">확률·재료·천장은 기존과 동일합니다. 제니스는 7번째 도전 확정이며, ZENITH 덱 편성은 최대 2장입니다. 프레스티지·제니스 진화 재료는 PVE/PVP 및 프리셋에서 해제해야 합니다.</div><p class="evx-hint">프레스티지는 미보유 카드만 획득합니다. MA 중복 획득의 카드조각·마스터의 별 보너스도 유지됩니다.</p>`);
  }
  function showPool(){openDialog(`${modes[state.type].name} 결과 카드`,`${state.type===TYPE_PRESTIGE?'<p class="evx-hint">현재 미보유 카드만 표시합니다. 획득할 때마다 결과 풀에서 제외됩니다.</p>':'<p class="evx-hint">공개된 결과 카드 중 동일 확률로 결정됩니다.</p>'}<div class="evx-pool-grid">${current().resultPool.map(card=>`<article>${illustration(card)}<b>${esc(card.title||card.name)}</b><small>${esc(card.grade)}</small></article>`).join('')||'<p>현재 획득 가능한 카드가 없습니다.</p>'}</div>`,{wide:true})}
  function openConfirm(){
    if(!canRun())return;
    const chosen=selectedCards(),count=chosen.length*state.attempts;
    openDialog(`${chosen.length}종을 일괄 진화할까요?`,`<div class="evx-confirm-summary"><b>카드별 최대 ${state.attempts}회</b><span>총 최대 ${num(count)}회 · 성공 시 자동 중단</span></div><div class="evx-confirm-list">${chosen.map(card=>`<div><span>${esc(card.title)}</span><b>${num(card.quantity)}장 보유</b></div>`).join('')}</div><div class="evx-costs">${resourceRows(count)}</div><p class="evx-hint">위 비용은 최대 예상치입니다. 실제 진행한 횟수만 차감됩니다.</p><label class="evx-ack"><input id="evxConfirmAck" type="checkbox"><span>성공한 원본 카드의 <strong>중복 보유분 전체와 강화가 소모</strong>되는 것을 확인했습니다.</span></label><button type="button" class="evx-primary" id="evxConfirmGo" disabled>확인하고 진화 시작</button>`);
    const ack=document.getElementById('evxConfirmAck'),go=document.getElementById('evxConfirmGo');ack.onchange=()=>go.disabled=!ack.checked;
    go.onclick=()=>{if(!ack.checked||state.pending)return;const expectedPolicy=Object.fromEntries(['coinCost','shardCost','masterStarCost','successRate','pityAttempts'].map(key=>[key,Number(current()[key]||0)]));const plan={requestId:crypto.randomUUID(),evolutionType:state.type,cardIds:[...state.selected],attemptsPerCard:state.attempts,expectedPolicy};try{persist({plan})}catch{openDialog('진화를 시작하지 않았습니다','<p>요청 번호를 기기에 보관할 수 없습니다. 브라우저 저장 공간을 확인해 주세요. 재료는 소모되지 않았습니다.</p>');return}execute(plan)};
  }
  function renderRecovery(){const box=document.getElementById('evxRecovery');if(!box)return;box.innerHTML=state.recovery?`<div class="evx-recovery" role="status"><div><b>${state.recovery.response?'완료된 진화 결과가 있습니다':'이전 진화 결과를 확인해 주세요'}</b><p>같은 요청 번호로 확인하므로 중복으로 소모하지 않습니다.</p></div><button type="button" class="evx-secondary" id="evxRecover" ${state.pending?'disabled':''}>${state.recovery.response?'결과 보기':'결과 다시 확인'}</button></div>`:'';box.querySelector('#evxRecover')?.addEventListener('click',()=>state.recovery.response?showResults(state.recovery.response):execute(state.recovery.plan))}
  async function execute(plan){
    if(state.pending)return;const account=state.account,recoveryKey=storageKey();state.pending=true;updateCheckout();renderGrid();renderRecovery();
    openDialog('선택한 카드를 진화하고 있습니다',`<div class="evx-processing" role="status"><span class="evx-progress-line"></span><h3>${plan.cardIds.length}종 · 카드별 최대 ${plan.attemptsPerCard}회</h3><p>카드별 성공과 재료 차감을 안전하게 처리합니다.<br>응답이 늦어도 요청 번호는 보관됩니다.</p></div>`,{dismiss:false});
    try{
      const result=await apiRequest('evolution/batch',{method:'POST',body:JSON.stringify(plan)},{timeoutMs:60000});
      if(state.account!==account){try{localStorage.setItem(recoveryKey,JSON.stringify({plan,response:result}))}catch{}return}
      try{persist({plan,response:result})}catch{state.recovery={plan,response:result}}
      state.selected.clear();state.pending=false;
      // A receipt is the success boundary. Profile refresh failure must not turn
      // a committed evolution into an apparent failed request.
      try{const profile=await apiRequest('me',{}, {ttl:0,timeoutMs:12000});if(profile.user&&typeof saveUser==='function')saveUser(apiUserToLocal(profile.user))}catch{}
      if(exists()){
        await load(false);
        const firstSuccess=result.results.find(row=>row.success);
        if(!result.replayed&&firstSuccess&&result.evolutionType===TYPE_PRESTIGE&&(result.successEffect?.mediaUrl||result.successEffect?.soundUrl)){
          dismissDialog();await playPrestigeSuccessEffect({...result,success:true,reward:firstSuccess.reward});
        }
        if(exists())showResults(result);
      }else dismissDialog();
    }catch(error){
      if(state.account!==account)return;
      state.pending=false;
      const safe=['EVOLUTION_STATE_CHANGED','EVOLUTION_POOL_EMPTY','EVOLUTION_MATERIAL_SHORTAGE','EVOLUTION_REQUEST_MISMATCH','EVOLUTION_POLICY_CHANGED'].includes(error.code)||error.status===400;
      if(safe)clearRecovery();
      if(exists()){await load(false);openDialog(safe?'진화를 진행하지 않았습니다':'진화 결과 확인이 필요합니다',`<div class="evx-notice">${esc(error.message)}</div><p class="evx-hint">${safe?'카드와 재료 상태를 다시 확인해 주세요.':'서버 응답이 늦거나 연결이 끊겼습니다. 같은 요청 번호로 다시 확인하세요.'}</p>${safe?'':'<button type="button" class="evx-primary" id="evxRetryRequest">결과 다시 확인</button>'}`);document.getElementById('evxRetryRequest')?.addEventListener('click',()=>execute(plan))}else dismissDialog();
    }
  }
  function showResults(result){
    const success=result.results.filter(row=>row.success),failed=result.results.filter(row=>row.attempts.length&&!row.success);
    openDialog('진화 결과',`<div class="evx-result-summary"><div><small>진화 성공</small><b>${success.length}<em>종</em></b></div><div><small>실제 시도</small><b>${num(result.attemptCount)}<em>회</em></b></div><div><small>미성공 카드</small><b>${failed.length}<em>종</em></b></div></div>
      <p class="evx-result-cost">소모 ${costText({coinCost:result.spent.coin,shardCost:result.spent.shards,masterStarCost:result.spent.stars})}${result.bonus?.stars||result.bonus?.shards?`<br>중복 보너스 · 마스터의 별 ${num(result.bonus.stars)} · 카드조각 ${num(result.bonus.shards)}`:''}</p>
      <div class="evx-result-list">${result.results.map(row=>`<article class="${row.success?'is-success':''}"><span class="evx-result-art">${illustration(row.reward||row.source)}</span><div><small>${esc(row.source.title)} · ${row.attempts.length}회 시도</small><h3>${row.success?esc(row.reward.title):row.attempts.length?'진화 미성공':'미진행'}</h3><p>${row.success?`${esc(row.reward.grade)} 획득${row.attempts.at(-1)?.isPity?' · 확정 진화':''}`:row.stoppedReason?esc(row.stoppedReason):`원본 유지 · 누적 실패 ${row.progress.failedAttempts}회 / ${Math.max(1,result.pityAttempts-row.progress.failedAttempts)}회 내 확정`}</p></div><b class="evx-outcome">${row.success?'성공':row.attempts.length?'유지':'중단'}</b></article>`).join('')}</div>
      <button type="button" class="evx-primary" id="evxResultsDone">확인</button>`,{wide:true,onClose:()=>{clearRecovery();if(exists()){if(typeof renderShell==='function')renderShell('evolution');else{renderGrid();updateCheckout();renderRecovery()}}}});
    document.getElementById('evxResultsDone').onclick=dismissDialog;
  }
  async function load(readRecovery=true){
    const id=++state.loadId;
    if(readRecovery)restore();
    try{const data=await apiRequest('evolution/overview',{}, {ttl:0,replaceInflight:true});if(id!==state.loadId||!exists())return;state.data=data;state.selected=new Set([...state.selected].filter(cardId=>cards().some(card=>card.id===cardId&&card.eligible)));render()}catch(error){const box=document.getElementById('evolutionWorkspace');if(!box||id!==state.loadId)return;box.innerHTML=`<div class="evx-empty"><h3>카드를 불러오지 못했습니다</h3><p>${esc(error.message)}</p><button type="button" class="evx-secondary" id="evxReload">다시 확인</button></div>`;box.querySelector('#evxReload').onclick=()=>load();}
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
  window.evolutionView=evolutionView;
  window.bindEvolutionView=()=>load();
})();
