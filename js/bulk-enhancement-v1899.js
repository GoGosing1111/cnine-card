(() => {
  'use strict';

  const VERSION='1899';
  const MIN_GRADE_ORDER=4;
  const GRADE_ORDER={SUPERSTAR:13,ZENITH:12,FUR:11,PRESTIGE:10,LIMITED:9,MA:8,SSR:7,UR:6,HR:5,SR:4};
  const TARGET_LEVELS=[1,3,5,7,10,13];
  const DEFAULT_COSTS=[50,100,200,350,550,800,1100,1450,1850,2300];
  const DEFAULT_RATES=[100,100,100,80,65,50,35,25,15,8];
  let searchRenderTimer=0;
  const state={
    selected:new Set(),search:'',grade:'ALL',stage:'ALL',onlyEligible:true,targetLevel:10,
    ownerKey:'',epoch:0,
    running:false,stopRequested:false,mode:'',operationId:'',sequence:0,currentCardId:'',
    attempts:0,successes:0,failures:0,shardSpent:0,starSpent:0,processed:0,total:0,
    outcomes:new Map(),finishedCards:new Set(),message:'강화할 카드를 선택하세요.',error:'',
    routeBound:false
  };

  const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
  const esc=value=>String(value??'').replace(/[&<>'"]/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[char]));
  const number=value=>Math.max(0,Number(value)||0).toLocaleString('ko-KR');
  const catalog=()=>Array.isArray(window.cnineCardCatalog?.())?window.cnineCardCatalog():[];
  const currentUser=()=>typeof loadUser==='function'?(loadUser()||{}):{};
  const visibleCatalog=(rows,user)=>{
    const policy=globalThis.CNineCardVisibilityV1908;
    if(typeof policy?.filterCollectionCards==='function')return policy.filterCollectionCards(rows,user);
    return String(user?.nickname||'').normalize('NFC').replace(/\u00a0/g,' ').trim()==='조은'?[]:rows;
  };
  const accountKey=user=>String(user?.serverUserId||user?.id||user?.nickname||'').trim();
  const cardGrade=card=>String(card?.grade||card?.rarity||'').trim().toUpperCase();
  const cardLevel=(card,user=currentUser())=>Math.max(0,Math.floor(Number(user?.breakthroughs?.[String(card?.id)]||0)));
  const autoMaxLevel=card=>['MA','LIMITED'].includes(cardGrade(card))?13:10;
  const isHighManualOnly=card=>['FUR','ZENITH'].includes(cardGrade(card));
  const effectiveTarget=(card,target=state.targetLevel)=>Math.min(autoMaxLevel(card),Math.max(1,Math.floor(Number(target)||10)));
  const highConfig=(card,user)=>({MA:user?.maHighBreakthrough,LIMITED:user?.limitedHighBreakthrough}[cardGrade(card)]||null);
  const usesMasterStars=(card,level)=>cardGrade(card)==='ZENITH'||(['MA','LIMITED'].includes(cardGrade(card))&&level>=10);

  function alignAccount(user=currentUser()){
    const nextKey=accountKey(user);
    if(!nextKey||nextKey===state.ownerKey)return;
    state.selected.clear();state.outcomes.clear();state.finishedCards.clear();
    Object.assign(state,{ownerKey:nextKey,epoch:state.epoch+1,running:false,stopRequested:false,mode:'',operationId:'',sequence:0,currentCardId:'',attempts:0,successes:0,failures:0,shardSpent:0,starSpent:0,processed:0,total:0,message:'강화할 카드를 선택하세요.',error:''});
  }

  const sameStateRun=runContext=>Boolean(runContext&&state.epoch===runContext.epoch&&state.ownerKey===runContext.ownerKey);
  const sameRunAccount=runContext=>sameStateRun(runContext)&&accountKey(currentUser())===runContext.ownerKey;
  function cancelledRunError(message='자동 강화 중지 요청을 확인했습니다.'){
    const error=new Error(message);error.code='BULK_ENHANCEMENT_STOPPED';error.cancelled=true;return error;
  }

  function nextRule(card,user=currentUser()){
    const grade=cardGrade(card),level=cardLevel(card,user);
    if(['MA','LIMITED'].includes(grade)&&level>=10){
      const config=highConfig(card,user),rule=config?.steps?.[level-10];
      return {enabled:config?.enabled===true,cost:Math.max(0,Number(rule?.cost||0)),rate:Math.max(0,Number(rule?.rate||0)),duplicateCards:Math.max(0,Math.floor(Number(rule?.duplicateCards)||0)),material:'마스터의 별'};
    }
    const rule=user?.breakthroughConfig?.[grade]?.[level];
    return {enabled:true,cost:Math.max(0,Number(rule?.cost??DEFAULT_COSTS[level]??0)),rate:Math.max(0,Number(rule?.rate??DEFAULT_RATES[level]??0)),material:usesMasterStars(card,level)?'마스터의 별':'카드 조각'};
  }

  function candidateCards(user=currentUser()){
    const owned=new Set((user?.owned||[]).map(String));
    return visibleCatalog(catalog(),user).filter(card=>owned.has(String(card.id))&&(GRADE_ORDER[cardGrade(card)]||0)>=MIN_GRADE_ORDER)
      .sort((a,b)=>(GRADE_ORDER[cardGrade(b)]||0)-(GRADE_ORDER[cardGrade(a)]||0)||cardLevel(a,user)-cardLevel(b,user)||String(a.name||'').localeCompare(String(b.name||''),'ko'));
  }

  function eligibility(card,user=currentUser(),target=state.targetLevel){
    const grade=cardGrade(card),level=cardLevel(card,user),cap=autoMaxLevel(card),goal=effectiveTarget(card,target),rule=nextRule(card,user);
    if(level>=cap)return {eligible:false,level,goal,cap,reason:isHighManualOnly(card)?'+10 이후 수동 강화':'최대 강화 완료',tone:'manual'};
    if(level>=goal)return {eligible:false,level,goal,cap,reason:`목표 +${goal} 달성`,tone:'done'};
    if(['MA','LIMITED'].includes(grade)&&level>=10&&rule.enabled!==true)return {eligible:false,level,goal,cap,reason:'고급 강화 운영 준비 중',tone:'locked'};
    if(level>=10&&Number(rule.duplicateCards||0)>0)return {eligible:false,level,goal,cap,reason:`중복 카드 ${number(rule.duplicateCards)}장 필요 · 상세 수동 강화`,tone:'manual'};
    return {eligible:true,level,goal,cap,reason:`+${level} → +${goal}`,tone:'ready',rule};
  }

  function visibleCards(user=currentUser()){
    const query=state.search.trim().toLocaleLowerCase('ko'),grade=state.grade;
    return candidateCards(user).filter(card=>{
      if(grade!=='ALL'&&cardGrade(card)!==grade)return false;
      if(query&&!`${card.name||''} ${card.title||''}`.toLocaleLowerCase('ko').includes(query))return false;
      const info=eligibility(card,user);
      if(state.onlyEligible&&!info.eligible)return false;
      if(state.stage==='LOW'&&info.level>=5)return false;
      if(state.stage==='MID'&&(info.level<5||info.level>=10))return false;
      if(state.stage==='HIGH'&&info.level<10)return false;
      return true;
    });
  }

  function sanitizeSelection(user=currentUser()){
    const allowed=new Set(candidateCards(user).map(card=>String(card.id)));
    [...state.selected].forEach(id=>{if(!allowed.has(String(id)))state.selected.delete(String(id))});
  }

  function cardImage(card){
    try{if(typeof responsiveCardImageMarkup==='function')return responsiveCardImageMarkup(card,{enabled:true,loading:'lazy',fetchPriority:'auto'})}catch(_){}
    const src=String(card?.image||card?.imageUrl||'assets/ui/cninelogo.png');
    return `<img src="${esc(src)}" alt="${esc(card?.title||card?.name||'카드')}" loading="lazy" decoding="async">`;
  }

  function outcomeText(card,info){
    const result=state.outcomes.get(String(card.id));
    if(result)return `<span class="bulk-card-result is-${esc(result.tone||'info')}">${esc(result.text)}</span>`;
    return `<span class="bulk-card-result is-${esc(info.tone)}">${esc(info.reason)}</span>`;
  }

  function cardTile(card,user){
    const id=String(card.id),grade=cardGrade(card),info=eligibility(card,user),selected=state.selected.has(id),rule=info.rule||nextRule(card,user),disabled=state.running||(!info.eligible&&!selected);
    const manualNote=isHighManualOnly(card)&&info.goal===10?'<small>+11~+13은 카드 상세에서 수동 진행</small>':'';
    return `<button type="button" class="bulk-card-tile grade-${esc(grade)}${selected?' is-selected':''}${disabled?' is-disabled':''}${state.currentCardId===id?' is-current':''}" data-bulk-card="${esc(id)}" aria-pressed="${selected?'true':'false'}" ${disabled?'disabled':''}>
      <span class="bulk-card-check" aria-hidden="true">${selected?'✓':''}</span>
      <span class="bulk-card-art">${cardImage(card)}</span>
      <span class="bulk-card-copy"><span class="bulk-card-grade">${esc(grade)}</span><strong>${esc(card.title||card.name||id)}</strong><small>${esc(card.name||'SOOPKETMON')}</small>${outcomeText(card,info)}${manualNote}</span>
      <span class="bulk-card-step"><small>CURRENT</small><b>+${info.level}</b><i aria-hidden="true">→</i><em>+${info.goal}</em><span>${esc(rule.material)} ${number(rule.cost)} · ${number(rule.rate)}%</span></span>
    </button>`;
  }

  function progressHtml(){
    const selected=state.selected.size,denominator=Math.max(1,state.total||selected),done=Math.min(denominator,state.finishedCards.size||(state.mode==='ONCE'?state.processed:0)),percent=state.running?Math.max(2,Math.round(done/denominator*100)):Math.round(done/denominator*100);
    const current=catalog().find(card=>String(card.id)===state.currentCardId);
    return `<aside class="bulk-run-panel${state.running?' is-running':''}" aria-live="polite" aria-atomic="false">
      <div class="bulk-run-heading"><span><small>${state.running?'AUTO ENHANCEMENT RUNNING':'BULK ENHANCEMENT'}</small><b>${state.running?(current?`${esc(current.title||current.name)} 처리 중`:'다음 카드 준비 중'):esc(state.message)}</b></span><em>${state.running?`${done} / ${denominator}`:`${selected}장 선택`}</em></div>
      <div class="bulk-progress" role="progressbar" aria-label="일괄 강화 진행률" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${percent}"><i style="width:${percent}%"></i></div>
      <div class="bulk-run-stats"><span><small>시도</small><b>${number(state.attempts)}</b></span><span><small>성공</small><b>${number(state.successes)}</b></span><span><small>실패</small><b>${number(state.failures)}</b></span><span><small>조각 사용</small><b>${number(state.shardSpent)}</b></span><span><small>별 사용</small><b>${number(state.starSpent)}</b></span></div>
      ${state.error?`<p class="bulk-run-error">${esc(state.error)}</p>`:''}
      ${state.running?`<button type="button" class="bulk-stop-button" data-bulk-stop ${state.stopRequested?'disabled':''}>${state.stopRequested?'현재 요청 완료 후 중지 중':'자동 강화 중지'}</button>`:''}
    </aside>`;
  }

  function renderInner(user=currentUser()){
    sanitizeSelection(user);
    const visible=visibleCards(user),all=candidateCards(user),eligibleCount=all.filter(card=>eligibility(card,user).eligible).length;
    const targetOptions=TARGET_LEVELS.map(level=>`<option value="${level}" ${state.targetLevel===level?'selected':''}>목표 +${level}</option>`).join('');
    const grades=['ALL',...new Set(all.map(cardGrade))].map(grade=>`<option value="${esc(grade)}" ${state.grade===grade?'selected':''}>${grade==='ALL'?'전체 등급':grade}</option>`).join('');
    return `<header class="bulk-hero"><div><p>COLLECTION / ENHANCEMENT CONTROL</p><h1>일괄 강화</h1><span>여러 카드를 고르고 한 번씩 강화하거나, 목표 단계까지 자동으로 순환 강화합니다.</span></div><div class="bulk-hero-metrics"><span><small>카드 조각</small><b>${number(user.cardShards)}</b></span><span><small>마스터의 별</small><b>${number(user.masterStars)}</b></span><span><small>강화 가능</small><b>${eligibleCount}장</b></span><span><small>선택</small><b>${state.selected.size}장</b></span></div></header>
      <section class="bulk-control-panel" aria-label="일괄 강화 설정">
        <label class="bulk-search"><span>카드 검색</span><input type="search" data-bulk-search value="${esc(state.search)}" placeholder="카드명 또는 멤버명" autocomplete="off" ${state.running?'disabled':''}></label>
        <label><span>등급</span><select data-bulk-grade ${state.running?'disabled':''}>${grades}</select></label>
        <label><span>현재 단계</span><select data-bulk-stage ${state.running?'disabled':''}><option value="ALL" ${state.stage==='ALL'?'selected':''}>전체 단계</option><option value="LOW" ${state.stage==='LOW'?'selected':''}>+0 ~ +4</option><option value="MID" ${state.stage==='MID'?'selected':''}>+5 ~ +9</option><option value="HIGH" ${state.stage==='HIGH'?'selected':''}>+10 이상</option></select></label>
        <label><span>자동 목표</span><select data-bulk-target ${state.running?'disabled':''}>${targetOptions}</select></label>
        <button type="button" class="bulk-eligible-toggle${state.onlyEligible?' is-active':''}" data-bulk-eligible aria-pressed="${state.onlyEligible?'true':'false'}" ${state.running?'disabled':''}>강화 가능만</button>
        <div class="bulk-selection-actions"><button type="button" data-bulk-select-visible ${state.running||!visible.length?'disabled':''}>현재 목록 전체 선택</button><button type="button" data-bulk-clear ${state.running||!state.selected.size?'disabled':''}>선택 해제</button></div>
      </section>
      <section class="bulk-action-bar"><div><b>${state.selected.size}장 선택됨</b><span>FUR·ZENITH +11~+13과 중복 카드가 필요한 고급 단계는 카드 상세에서만 수동 강화됩니다.</span></div><div><button type="button" class="bulk-once-button" data-bulk-run="ONCE" ${state.running||!state.selected.size?'disabled':''}>선택 카드 1회씩 강화</button><button type="button" class="bulk-auto-button" data-bulk-run="AUTO" ${state.running||!state.selected.size?'disabled':''}>목표까지 자동 강화</button></div></section>
      ${progressHtml()}
      <section class="bulk-list-head"><div><small>OWNED CARD QUEUE</small><h2>강화 카드 선택</h2></div><b>${visible.length}장 표시</b></section>
      <div class="bulk-card-grid">${visible.length?visible.map(card=>cardTile(card,user)).join(''):'<div class="bulk-empty"><b>조건에 맞는 강화 카드가 없습니다.</b><span>필터를 바꾸거나 목표 단계를 높여보세요.</span></div>'}</div>
      <footer class="bulk-safety-note"><b>안전 처리 방식</b><span>선택 카드는 순서대로 1회씩 처리됩니다. 중지하면 현재 서버 요청까지만 확정하고 다음 카드는 진행하지 않습니다.</span></footer>`;
  }

  function repaint(){
    const root=document.getElementById('bulkEnhancementRoot');
    if(!root)return;
    root.innerHTML=renderInner(currentUser());
    bindRoot(root);
    try{window.CNineRuntime?.observe?.(root)}catch(_){}
  }

  function bindRoot(root){
    const search=root.querySelector('[data-bulk-search]');
    if(search)search.oninput=()=>{state.search=search.value;clearTimeout(searchRenderTimer);searchRenderTimer=setTimeout(()=>{repaint();const next=document.querySelector('#bulkEnhancementRoot [data-bulk-search]');if(next){next.focus();next.setSelectionRange(next.value.length,next.value.length)}},140)};
    const grade=root.querySelector('[data-bulk-grade]');if(grade)grade.onchange=()=>{state.grade=grade.value;repaint()};
    const stage=root.querySelector('[data-bulk-stage]');if(stage)stage.onchange=()=>{state.stage=stage.value;repaint()};
    const target=root.querySelector('[data-bulk-target]');if(target)target.onchange=()=>{state.targetLevel=Math.max(1,Number(target.value)||10);repaint()};
    root.querySelector('[data-bulk-eligible]')?.addEventListener('click',()=>{state.onlyEligible=!state.onlyEligible;repaint()});
    root.querySelector('[data-bulk-select-visible]')?.addEventListener('click',()=>{visibleCards(currentUser()).filter(card=>eligibility(card,currentUser()).eligible).forEach(card=>state.selected.add(String(card.id)));repaint()});
    root.querySelector('[data-bulk-clear]')?.addEventListener('click',()=>{state.selected.clear();repaint()});
    root.querySelectorAll('[data-bulk-card]').forEach(button=>button.onclick=()=>{const id=String(button.dataset.bulkCard||'');state.selected.has(id)?state.selected.delete(id):state.selected.add(id);state.message='강화 방식을 선택하세요.';repaint()});
    root.querySelectorAll('[data-bulk-run]').forEach(button=>button.onclick=()=>void run(String(button.dataset.bulkRun||'AUTO')));
    root.querySelector('[data-bulk-stop]')?.addEventListener('click',()=>{state.stopRequested=true;state.message='현재 요청을 확정한 뒤 중지합니다.';repaint()});
  }

  function requestIdFor(cardId,target){
    state.sequence++;
    const token=String(cardId).replace(/[^A-Za-z0-9_-]/g,'_').slice(-18)||'card';
    return `${state.operationId}_${token}_t${target}_n${state.sequence}`.slice(0,120);
  }

  async function requestAttempt(card,target,runContext){
    const requestId=requestIdFor(card.id,target),body=JSON.stringify({cardId:String(card.id),requestId,maxAttempts:1,targetLevel:target});
    let lastError=null;
    for(let retry=0;retry<5;retry++){
      if(state.stopRequested||!sameRunAccount(runContext))throw cancelledRunError(sameStateRun(runContext)?'로그인 계정 변경 또는 중지 요청으로 재시도를 취소했습니다.':'이전 계정의 강화 대기열을 폐기했습니다.');
      try{return await apiRequest('card/breakthrough/auto',{method:'POST',body},{timeoutMs:45000})}
      catch(error){
        lastError=error;
        if(state.stopRequested||!sameRunAccount(runContext))throw cancelledRunError(sameStateRun(runContext)?'현재 요청 이후 자동 강화를 중지했습니다.':'로그인 계정 변경으로 자동 강화를 중지했습니다.');
        const code=String(error?.code||'').toUpperCase(),retryable=Boolean(error?.timeout||error?.retryable||['USER_ACTION_IN_PROGRESS','BREAKTHROUGH_LOCK_UNAVAILABLE'].includes(code)||[429,503].includes(Number(error?.status)));
        if(!retryable||retry===4)throw error;
        await sleep(Math.max(300,Math.min(2500,Number(error?.retryAfterMs||500))));
      }
    }
    throw lastError||new Error('강화 요청을 완료하지 못했습니다.');
  }

  function applyResult(card,result){
    if(result?.user)saveUser(apiUserToLocal(result.user));
    state.attempts+=Number(result?.attempts||0);state.successes+=Number(result?.successes||0);state.failures+=Number(result?.failures||0);
    state.shardSpent+=Number(result?.spent?.cardShards||0);state.starSpent+=Number(result?.spent?.masterStars||0);
    const id=String(card.id),level=Math.max(0,Number(result?.level||0)),terminal=result?.canContinue!==true;
    const tone=Number(result?.successes||0)>0?'success':terminal?'done':'fail';
    const text=Number(result?.attempts||0)>0?(Number(result?.successes||0)>0?`강화 성공 · +${level}`:`강화 실패 · +${level} 유지`):(result?.stopMessage||'처리 완료');
    state.outcomes.set(id,{tone,text});
    if(terminal)state.finishedCards.add(id);
    return {terminal,level};
  }

  function canAttempt(card,target,user=currentUser()){
    return eligibility(card,user,target).eligible;
  }

  async function processCard(card,target,runContext){
    state.currentCardId=String(card.id);state.message=`${card.title||card.name} 강화 요청 중`;repaint();
    const result=await requestAttempt(card,target,runContext);
    if(!sameRunAccount(runContext))throw cancelledRunError('로그인 계정 변경으로 이전 계정의 강화 결과 표시를 중지했습니다.');
    const applied=applyResult(card,result);
    state.processed++;
    repaint();
    return {...applied,result};
  }

  async function run(mode){
    alignAccount(currentUser());
    if(state.running)return;
    const selectedIds=[...state.selected],selectedCards=selectedIds.map(id=>catalog().find(card=>String(card.id)===String(id))).filter(Boolean);
    if(!selectedCards.length){state.message='강화할 카드를 먼저 선택하세요.';repaint();return}
    if(mode==='AUTO'&&!confirm(`선택한 ${selectedCards.length}장을 목표 단계까지 자동 강화할까요?\n\n실패해도 설정된 카드 조각 또는 마스터의 별이 소모됩니다.\nFUR·ZENITH는 +10까지만, 중복 카드가 필요한 단계는 직전 단계까지만 자동 진행됩니다.`))return;
    Object.assign(state,{running:true,stopRequested:false,mode,operationId:`bulk_${Date.now().toString(36)}_${Math.random().toString(36).slice(2,9)}`,sequence:0,currentCardId:'',attempts:0,successes:0,failures:0,shardSpent:0,starSpent:0,processed:0,total:selectedCards.length,message:'강화 대기열을 준비합니다.',error:''});
    const runContext={ownerKey:state.ownerKey,epoch:state.epoch};
    state.outcomes.clear();state.finishedCards.clear();repaint();
    try{
      if(mode==='ONCE'){
        for(const card of selectedCards){
          if(state.stopRequested||!sameRunAccount(runContext))break;
          const user=currentUser(),level=cardLevel(card,user),target=Math.min(autoMaxLevel(card),level+1);
          if(!canAttempt(card,target,user)){const info=eligibility(card,user,target);state.outcomes.set(String(card.id),{tone:info.tone,text:info.reason});state.finishedCards.add(String(card.id));state.processed++;repaint();continue}
          await processCard(card,target,runContext);state.finishedCards.add(String(card.id));
        }
      }else{
        let hasWork=true;
        while(hasWork&&!state.stopRequested&&sameRunAccount(runContext)){
          hasWork=false;
          for(const card of selectedCards){
            if(state.stopRequested||!sameRunAccount(runContext))break;
            const id=String(card.id),user=currentUser(),target=effectiveTarget(card,state.targetLevel),info=eligibility(card,user,target);
            if(state.finishedCards.has(id))continue;
            if(!info.eligible){state.outcomes.set(id,{tone:info.tone,text:info.reason});state.finishedCards.add(id);repaint();continue}
            hasWork=true;
            const applied=await processCard(card,target,runContext);
            if(applied.terminal||applied.level>=target)state.finishedCards.add(id);
            await sleep(60);
          }
        }
      }
      if(!sameStateRun(runContext))return;
      if(!sameRunAccount(runContext))throw cancelledRunError('로그인 계정 변경으로 자동 강화를 중지했습니다.');
      state.message=state.stopRequested?'요청에 따라 자동 강화를 중지했습니다.':mode==='ONCE'?'선택 카드 1회 강화를 완료했습니다.':'목표 강화 처리를 완료했습니다.';
    }catch(error){
      if(sameStateRun(runContext)){
        if(error?.cancelled||state.stopRequested||!sameRunAccount(runContext)){state.error='';state.message=accountKey(currentUser())===runContext.ownerKey?'요청에 따라 자동 강화를 중지했습니다.':'로그인 계정 변경으로 이전 강화 대기열을 중지했습니다.'}
        else{state.error=error?.message||'일괄 강화 처리 중 오류가 발생했습니다.';state.message='안전 확인이 필요해 자동 강화를 중지했습니다.'}
      }
    }finally{
      if(sameStateRun(runContext)){
        Object.assign(state,{running:false,stopRequested:false,currentCardId:''});
        if(document.getElementById('bulkEnhancementRoot')&&sameRunAccount(runContext)){
          if(typeof renderShell==='function')renderShell('upgrade');else repaint();
        }
      }
    }
  }

  function view(user){alignAccount(user);return `${typeof summaryBar==='function'?summaryBar(user):''}<section id="bulkEnhancementRoot" class="bulk-enhancement-root" data-version="${VERSION}">${renderInner(user)}</section>`}

  function bind(){
    const root=document.getElementById('bulkEnhancementRoot');if(!root)return;
    alignAccount(currentUser());
    bindRoot(root);
    if(!state.routeBound){
      state.routeBound=true;
      window.addEventListener('cnine:route-will-change',event=>{if(event?.detail?.from==='upgrade'&&state.running)state.stopRequested=true});
    }
  }

  window.bulkEnhancementView=view;
  window.bindBulkEnhancementView=bind;
  window.CNineBulkEnhancementV1899=Object.freeze({version:VERSION,state,view,bind,run,eligibility,effectiveTarget});
})();
